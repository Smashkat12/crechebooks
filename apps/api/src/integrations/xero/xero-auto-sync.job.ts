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
import { BankFeedService } from './bank-feed.service';
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

@Injectable()
export class XeroAutoSyncJob {
  private readonly logger = new Logger(XeroAutoSyncJob.name);
  private readonly tokenManager: TokenManager;

  /** Per-tenant lock — prevents concurrent auto-syncs for the same tenant. */
  private readonly inFlightTenants = new Set<string>();

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
      } catch (err) {
        failed++;
        this.logger.error({
          message: `XeroAutoSync: tenant ${tenantId} sync failed`,
          error: err instanceof Error ? err.message : String(err),
          file: 'xero-auto-sync.job.ts',
          function: 'runAutoSync',
          timestamp: new Date().toISOString(),
        });
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
}
