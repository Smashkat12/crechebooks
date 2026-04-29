/**
 * XeroAutoSyncJob
 * TASK-XERO-011: Hourly Auto-Sync from Xero for all connected tenants.
 *
 * Runs every hour at :00 UTC. For each tenant with a valid Xero connection
 * it fires bankFeedService.syncTransactions() and syncFromJournals() using the
 * same code paths as POST /xero/sync.
 *
 * Safety guards:
 * - Skips tenants whose access token AND refresh are both expired (logs warning to re-auth)
 * - Skips tenants with a sync already in-flight (tracked via in-memory Set)
 * - fromDate = lastSyncAt on the most-recently-synced bank connection, or 30 days ago
 *
 * Rate-limit note (Xero):
 *   Xero allows 60 calls/minute PER TENANT. The cron fires once per hour.
 *   A single pull sync (Accounting API + Journals API) uses ~5-10 calls per tenant,
 *   well within the per-tenant limit.  Multi-tenant: each tenant runs sequentially so
 *   concurrent requests to Xero are kept low.  If the tenant count grows beyond ~10
 *   consider spacing tenants by 5 s (setTimeout) to avoid bursting.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BankFeedService, Xero429Error } from './bank-feed.service';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';

/** Minimum buffer (ms) before the access-token expiry that we still consider "usable". */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Xero refresh tokens expire after 60 days of inactivity.
 * We cannot know the exact expiry from the stored data (the raw
 * refresh token expiry is not persisted).  We use `tokenExpiresAt`
 * (the access-token expiry) as a staleness proxy: if the stored
 * access-token was issued more than 60 days ago it is very likely
 * the refresh token has also lapsed.
 */
const REFRESH_TOKEN_STALE_AFTER_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/** Default lookback when no prior sync is found. */
const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * Self-healing retry backoff for ERROR connections.
 *
 * When a tenant's bank feed sync fails, the connection is marked ERROR and the
 * hourly cron would previously skip it forever (WHERE status = ACTIVE).  The fix
 * widens the query to include ERROR connections, but without throttling that means
 * a genuinely-broken feed hammers Xero every hour indefinitely.
 *
 * Strategy (Option 2 — in-memory backoff):
 *   - Track { nextRetryAt, consecutiveFailures } per tenantId in a Map.
 *   - First failure  → retry after INITIAL_RETRY_MS  (2 h)
 *   - Each subsequent failure doubles the interval, capped at MAX_RETRY_MS (24 h).
 *   - On a successful sync, clear the entry so normal hourly cadence resumes.
 *   - Map is lost on process restart — that is intentional: restart = fresh attempt.
 *
 * No schema changes required.  The map is local to this singleton NestJS service.
 */
const INITIAL_RETRY_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_RETRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface RetryState {
  nextRetryAt: number; // epoch ms
  consecutiveFailures: number;
}

@Injectable()
export class XeroAutoSyncJob {
  private readonly logger = new Logger(XeroAutoSyncJob.name);
  private readonly tokenManager: TokenManager;

  /** Per-tenant lock — prevents concurrent auto-syncs for the same tenant. */
  private readonly inFlightTenants = new Set<string>();

  /**
   * In-memory backoff state for tenants whose bank feed is in ERROR.
   * Cleared on successful sync; doubled on each failure; capped at MAX_RETRY_MS.
   */
  private readonly errorRetryState = new Map<string, RetryState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly bankFeedService: BankFeedService,
  ) {
    this.tokenManager = new TokenManager(this.prisma);
  }

  /**
   * Hourly auto-sync — fires at :00 of every hour (UTC).
   * Cron: '0 * * * *'
   */
  @Cron('0 * * * *', {
    name: 'xero-auto-sync',
    timeZone: 'UTC',
  })
  async runAutoSync(): Promise<void> {
    this.logger.log('XeroAutoSync: starting hourly sweep');

    // Fetch all tenants with a stored Xero token
    const tokens = await this.prisma.xeroToken.findMany({
      select: {
        tenantId: true,
        tokenExpiresAt: true,
        updatedAt: true,
      },
    });

    if (tokens.length === 0) {
      this.logger.debug('XeroAutoSync: no connected tenants — nothing to do');
      return;
    }

    let synced = 0;
    let skippedInFlight = 0;
    let skippedExpired = 0;
    let failed = 0;

    for (const token of tokens) {
      const { tenantId } = token;

      // --- Guard 1: skip if a sync is already running for this tenant ---
      if (this.inFlightTenants.has(tenantId)) {
        this.logger.warn(
          `XeroAutoSync: tenant ${tenantId} already syncing — skipping`,
        );
        skippedInFlight++;
        continue;
      }

      // --- Guard 2: skip if the refresh token is very likely expired ---
      const tokenAgeMs = Date.now() - token.updatedAt.getTime();
      if (
        tokenAgeMs > REFRESH_TOKEN_STALE_AFTER_MS &&
        token.tokenExpiresAt.getTime() < Date.now() - REFRESH_BUFFER_MS
      ) {
        this.logger.warn(
          `XeroAutoSync: tenant ${tenantId} — access token expired and refresh token ` +
            `is likely stale (last updated ${Math.round(tokenAgeMs / 86_400_000)} days ago). ` +
            `Re-authentication required.`,
        );
        skippedExpired++;
        continue;
      }

      // --- Guard 3: verify we can actually get a valid connection ---
      const hasConnection =
        await this.tokenManager.hasValidConnection(tenantId);
      if (!hasConnection) {
        this.logger.warn(
          `XeroAutoSync: tenant ${tenantId} — token refresh failed, skipping. ` +
            `User must re-authenticate in Settings → Integrations.`,
        );
        skippedExpired++;
        continue;
      }

      // --- Guard 4a: rate-limit soft-pause (HTTP 429) — persisted in DB ---
      // A 429 means "Xero is throttling us right now" — not a broken connection.
      // We store the deadline on `bank_connections.rate_limit_until_at` so the
      // pause survives process restarts (unlike the in-memory backoff map below).
      //
      // NOTE: `rateLimitUntilAt` is not yet in the Prisma schema — the column
      // exists after migration 20260429100000.  Cast to any to avoid TS errors
      // until schema-guardian regenerates the Prisma client.
      const rateLimitedConnection = await (
        this.prisma.bankConnection as any
      ).findFirst({
        where: { tenantId, rateLimitUntilAt: { gt: new Date() } },
        select: { rateLimitUntilAt: true },
      });
      if (rateLimitedConnection?.rateLimitUntilAt) {
        const deadline = rateLimitedConnection.rateLimitUntilAt as Date;
        const minutesLeft = Math.ceil(
          (deadline.getTime() - Date.now()) / 60_000,
        );
        this.logger.log(
          `XeroAutoSync: tenant ${tenantId} — rate-limit pause active (429), ` +
            `next retry in ${minutesLeft} min`,
        );
        continue;
      }

      // --- Guard 4b: exponential backoff for ERROR connections (fatal failures) ---
      // If this tenant's feed previously failed with a non-429 error, respect the
      // computed nextRetryAt so we don't hammer Xero every hour indefinitely.
      const retryState = this.errorRetryState.get(tenantId);
      if (retryState && Date.now() < retryState.nextRetryAt) {
        const minutesLeft = Math.ceil(
          (retryState.nextRetryAt - Date.now()) / 60_000,
        );
        this.logger.log(
          `XeroAutoSync: tenant ${tenantId} — ERROR backoff active, ` +
            `next retry in ${minutesLeft} min ` +
            `(failure #${retryState.consecutiveFailures})`,
        );
        continue;
      }

      // --- Determine fromDate ---
      const lastSync = await this.prisma.bankConnection.findFirst({
        where: { tenantId },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true },
      });

      const fromDate =
        lastSync?.lastSyncAt ??
        new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

      // --- Fire sync ---
      this.inFlightTenants.add(tenantId);
      try {
        this.logger.log(
          `XeroAutoSync: syncing tenant ${tenantId} from ${fromDate.toISOString()}`,
        );

        // Pull transactions via Accounting API
        const txResult = await this.bankFeedService.syncTransactions(tenantId, {
          fromDate,
          forceFullSync: false,
        });

        this.logger.log(
          `XeroAutoSync: tenant ${tenantId} — Accounting API: ` +
            `${txResult.transactionsCreated} created, ` +
            `${txResult.duplicatesSkipped} dupes, ` +
            `${txResult.errors.length} errors`,
        );

        // Pull from Journals API (catches cash-coded + payment-matched items)
        try {
          const journalResult = await this.bankFeedService.syncFromJournals(
            tenantId,
            { fromDate, forceFullSync: false },
          );
          this.logger.log(
            `XeroAutoSync: tenant ${tenantId} — Journals API: ` +
              `${journalResult.created} created, ${journalResult.skipped} skipped`,
          );
        } catch (journalErr) {
          // Journals API may fail on Starter plan or missing scopes — non-fatal
          this.logger.warn(
            `XeroAutoSync: tenant ${tenantId} — Journals API failed (non-fatal): ` +
              `${journalErr instanceof Error ? journalErr.message : String(journalErr)}`,
          );
        }

        synced++;
        // Successful sync — clear in-memory error backoff AND DB rate-limit pause.
        this.errorRetryState.delete(tenantId);
        try {
          await this.prisma.bankConnection.updateMany({
            where: { tenantId, status: { not: 'DISCONNECTED' } },

            data: { rateLimitUntilAt: null } as any,
          });
        } catch {
          // Non-fatal: the column may not exist yet if migration hasn't run.
          // Once the migration lands this will succeed silently.
        }
      } catch (err) {
        // --- HTTP 429: rate-limit soft pause ---
        // Do NOT burn an exponential-backoff slot on a 429. Instead, set a
        // rate-limit deadline from the Retry-After header (or default 60s) and
        // persist it to DB so the pause survives restarts.
        if (err instanceof Xero429Error) {
          const pauseMs = err.retryAfterMs ?? 60_000; // default 60s when header absent
          const retryAt = new Date(Date.now() + pauseMs);
          this.logger.warn(
            `XeroAutoSync: tenant ${tenantId} — 429 rate-limit, pausing until ` +
              `${retryAt.toISOString()} (${Math.ceil(pauseMs / 1000)}s)`,
          );
          try {
            await this.prisma.bankConnection.updateMany({
              where: { tenantId, status: { not: 'DISCONNECTED' } },

              data: { rateLimitUntilAt: retryAt } as any,
            });
          } catch (persistErr) {
            this.logger.warn(
              `XeroAutoSync: could not persist rate-limit state for tenant ${tenantId}: ` +
                `${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
            );
          }
          // Leave status as-is (connection is not broken, just throttled).
          // Do not increment failed counter — 429 is not a fatal failure.
          // The finally block (inFlightTenants cleanup) executes regardless.
          continue; // advance to next tenant in the for-loop
        }

        failed++;

        // --- Fatal (non-429) error ---
        const errorMessage = this.bankFeedService.extractXeroErrorMessage(err);
        this.logger.error({
          message: `XeroAutoSync: tenant ${tenantId} sync failed`,
          error: errorMessage,
          file: 'xero-auto-sync.job.ts',
          function: 'runAutoSync',
          timestamp: new Date().toISOString(),
        });

        // Update backoff state: double delay on each consecutive failure, cap at MAX_RETRY_MS.
        const prior = this.errorRetryState.get(tenantId);
        const consecutiveFailures = (prior?.consecutiveFailures ?? 0) + 1;
        const delayMs = Math.min(
          INITIAL_RETRY_MS * Math.pow(2, consecutiveFailures - 1),
          MAX_RETRY_MS,
        );
        this.errorRetryState.set(tenantId, {
          nextRetryAt: Date.now() + delayMs,
          consecutiveFailures,
        });
        this.logger.warn(
          `XeroAutoSync: tenant ${tenantId} — failure #${consecutiveFailures}, ` +
            `next retry in ${Math.round((delayMs / 3_600_000) * 10) / 10} h`,
        );

        // Persist the actual error to the most-recently-synced bank connection
        // so /xero/sync-status can surface it as lastSyncError.
        // BankFeedService.syncTransactions normally does this at the connection
        // level, but if it throws before reaching that catch (e.g. auth error,
        // Prisma failure), the connection record is never updated.
        try {
          await this.prisma.bankConnection.updateMany({
            where: { tenantId, status: { not: 'DISCONNECTED' } },
            data: {
              status: 'ERROR',
              errorMessage,
            },
          });
        } catch (persistErr) {
          this.logger.warn(
            `XeroAutoSync: could not persist error state for tenant ${tenantId}: ` +
              `${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
          );
        }
      } finally {
        this.inFlightTenants.delete(tenantId);
      }
    }

    this.logger.log(
      `XeroAutoSync: sweep complete — synced=${synced}, ` +
        `skippedInFlight=${skippedInFlight}, skippedExpired=${skippedExpired}, failed=${failed}`,
    );
  }

  /**
   * Expose in-flight state for the sync-status endpoint.
   * Returns true if the auto-sync job is currently running for this tenant.
   */
  isInFlight(tenantId: string): boolean {
    return this.inFlightTenants.has(tenantId);
  }

  /**
   * Expose error backoff state — used by tests and sync-status endpoint.
   * Returns the current retry state for a tenant, or undefined if none.
   */
  getRetryState(tenantId: string): RetryState | undefined {
    return this.errorRetryState.get(tenantId);
  }
}
