/**
 * BankFeedService
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 *
 * Handles bank feed connections and transaction syncing from Xero.
 * Uses Xero Bank Feeds API for automatic transaction import.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: All operations must filter by tenantId.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { XeroClient } from 'xero-node';
import {
  BankConnection as PrismaBankConnection,
  BankConnectionStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import {
  ImportSource,
  TransactionStatus,
} from '../../database/entities/transaction.entity';
import {
  NotFoundException,
  BusinessException,
  ConflictException,
} from '../../shared/exceptions';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';
import {
  BankConnection,
  BankSyncResult,
  BankSyncError,
  XeroWebhookPayload,
  XeroWebhookEvent,
  XeroBankTransaction,
  BankSyncOptions,
  WebhookVerificationResult,
  XeroStatementLine,
} from './types/bank-feed.types';

// Rate limiting: 60 calls/minute per Xero constraints
const RATE_LIMIT_CALLS = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Sentinel error thrown when Xero responds with HTTP 429.
 * Carries the retry-after deadline (epoch ms) so the caller can persist it
 * without re-parsing the raw SDK rejection a second time.
 *
 * Distinguishing 429 from fatal errors is important: a 429 is a "soft pause"
 * (rate-window timer), NOT a sign that the connection is broken.  The job
 * must NOT burn an exponential-backoff slot on a 429.
 */
export class Xero429Error extends Error {
  /**
   * @param retryAfterMs  How many ms to wait before retrying (from Retry-After
   *                      header, converted to ms). Undefined when header absent.
   */
  constructor(
    public readonly retryAfterMs: number | undefined,
    public readonly originalError: unknown,
  ) {
    super(
      retryAfterMs !== undefined
        ? `Xero rate-limited (HTTP 429). Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
        : 'Xero rate-limited (HTTP 429). No Retry-After header present.',
    );
    this.name = 'Xero429Error';
  }
}

/**
 * Catch-all account codes used for auto-reconciliation in Xero.
 * Transactions with these codes should be flagged for review in CrecheBooks.
 * Common patterns: 9999, SUSPENSE, CLEARING, TO_BE_CATEGORIZED
 */
const CATCH_ALL_ACCOUNT_CODES = [
  '9999',
  '9998',
  '999',
  'SUSPENSE',
  'CLEARING',
  'UNCATEGORIZED',
  'TO_CATEGORIZE',
  'TBC',
  'UNKNOWN',
];

/**
 * Account name patterns that indicate catch-all/suspense accounts
 */
const CATCH_ALL_ACCOUNT_PATTERNS = [
  /suspense/i,
  /clearing/i,
  /to.?be.?categor/i,
  /uncategor/i,
  /unknown/i,
  /unallocated/i,
  /ask.?me.?later/i,
];

@Injectable()
export class BankFeedService {
  private readonly logger = new Logger(BankFeedService.name);
  private readonly tokenManager: TokenManager;
  private readonly rateLimitTracker: Map<
    string,
    { count: number; resetAt: number }
  > = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionRepo: TransactionRepository,
    private readonly auditLogService: AuditLogService,
  ) {
    this.tokenManager = new TokenManager(this.prisma);
  }

  /**
   * Connect a bank account from Xero
   * @throws NotFoundException if Xero account not found
   * @throws BusinessException if no valid Xero connection
   * @throws ConflictException if already connected
   */
  async connectBankAccount(
    tenantId: string,
    xeroAccountId: string,
  ): Promise<BankConnection> {
    this.logger.log(
      `Connecting bank account ${xeroAccountId} for tenant ${tenantId}`,
    );

    // Check if already connected
    const existing = await this.prisma.bankConnection.findUnique({
      where: {
        tenantId_xeroAccountId: { tenantId, xeroAccountId },
      },
    });

    if (existing) {
      if (existing.status === BankConnectionStatus.ACTIVE) {
        throw new ConflictException('Bank account already connected', {
          xeroAccountId,
          connectionId: existing.id,
        });
      }
      // Reactivate if previously disconnected
      const reactivated = await this.prisma.bankConnection.update({
        where: { id: existing.id },
        data: {
          status: BankConnectionStatus.ACTIVE,
          errorMessage: null,
          connectedAt: new Date(),
        },
      });
      return this.mapToConnection(reactivated);
    }

    // Get account details from Xero
    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);
    await this.checkRateLimit(tenantId);

    const accountsResponse = await client.accountingApi.getAccount(
      xeroTenantId,
      xeroAccountId,
    );
    const account = accountsResponse.body.accounts?.[0];

    if (!account) {
      throw new NotFoundException('Xero Account', xeroAccountId);
    }

    // Create connection record
    const connection = await this.prisma.bankConnection.create({
      data: {
        tenantId,
        xeroAccountId,
        accountName: account.name ?? 'Unknown Account',
        accountNumber: account.bankAccountNumber ?? '',
        bankName: String(account.bankAccountType ?? 'Unknown Bank'),
        status: BankConnectionStatus.ACTIVE,
        connectedAt: new Date(),
      },
    });

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'BankConnection',
      entityId: connection.id,
      action: AuditAction.CREATE,
      afterValue: {
        xeroAccountId,
        accountName: connection.accountName,
        bankName: connection.bankName,
      },
      changeSummary: `Connected bank account: ${connection.accountName}`,
    });

    this.logger.log(
      `Connected bank account ${connection.accountName} (${connection.id})`,
    );
    return this.mapToConnection(connection);
  }

  /**
   * Disconnect a bank account
   * @throws NotFoundException if connection not found
   */
  async disconnectBankAccount(
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    this.logger.log(
      `Disconnecting bank connection ${connectionId} for tenant ${tenantId}`,
    );

    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: connectionId, tenantId },
    });

    if (!connection) {
      throw new NotFoundException('BankConnection', connectionId);
    }

    await this.prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: BankConnectionStatus.DISCONNECTED,
        errorMessage: null,
      },
    });

    await this.auditLogService.logAction({
      tenantId,
      entityType: 'BankConnection',
      entityId: connectionId,
      action: AuditAction.UPDATE,
      beforeValue: { status: connection.status },
      afterValue: { status: BankConnectionStatus.DISCONNECTED },
      changeSummary: `Disconnected bank account: ${connection.accountName}`,
    });

    this.logger.log(`Disconnected bank connection ${connectionId}`);
  }

  /**
   * Sync transactions from Xero for connected bank accounts
   * @throws BusinessException if no valid Xero connection
   */
  async syncTransactions(
    tenantId: string,
    options?: BankSyncOptions,
  ): Promise<BankSyncResult> {
    this.logger.log(`Starting bank feed sync for tenant ${tenantId}`);

    const result: BankSyncResult = {
      connectionId: options?.connectionId ?? 'all',
      transactionsFound: 0,
      transactionsCreated: 0,
      duplicatesSkipped: 0,
      errors: [],
      syncedAt: new Date(),
    };

    // Get connections to sync.
    // Include ERROR connections so the auto-sync job's retry policy can attempt
    // recovery.  DISCONNECTED is intentional user action and must never be retried.
    const whereClause: {
      tenantId: string;
      status: { in: BankConnectionStatus[] };
      id?: string;
    } = {
      tenantId,
      status: { in: [BankConnectionStatus.ACTIVE, BankConnectionStatus.ERROR] },
    };

    if (options?.connectionId) {
      whereClause.id = options.connectionId;
    }

    const connections = await this.prisma.bankConnection.findMany({
      where: whereClause,
    });

    if (connections.length === 0) {
      this.logger.log('No active bank connections to sync');
      return result;
    }

    // Get authenticated client
    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    // Determine date range
    const fromDate =
      options?.fromDate ?? this.getDefaultFromDate(options?.forceFullSync);
    const toDate = options?.toDate ?? new Date();

    for (const connection of connections) {
      try {
        // Fetch ALL bank transactions from Xero with pagination
        // Xero API returns max 100 records per page
        const allXeroTransactions: XeroBankTransaction[] = [];
        let page = 1;
        let hasMorePages = true;

        while (hasMorePages) {
          await this.checkRateLimit(tenantId);

          // Fetch bank transactions from Xero for this account
          // Note: Xero API requires GUID values wrapped in Guid() function
          const bankTransactionsResponse =
            await client.accountingApi.getBankTransactions(
              xeroTenantId,
              undefined, // ifModifiedSince
              `BankAccount.AccountID==Guid("${connection.xeroAccountId}")`, // where
              undefined, // order
              page, // page number (1-indexed)
              undefined, // unitdp
            );

          const pageTransactions =
            bankTransactionsResponse.body.bankTransactions ?? [];

          this.logger.log(
            `Fetched page ${page}: ${pageTransactions.length} transactions from Xero for account ${connection.accountName}`,
          );

          // Cast to our internal type for processing
          allXeroTransactions.push(
            ...(pageTransactions as unknown as XeroBankTransaction[]),
          );

          // Xero returns empty array or less than 100 when no more pages
          // Note: Xero page size is typically 100 for bank transactions
          if (pageTransactions.length < 100) {
            hasMorePages = false;
          } else {
            page++;
            // Safety limit to prevent infinite loops
            if (page > 100) {
              this.logger.warn(
                `Reached page limit (100) for account ${connection.accountName}, stopping pagination`,
              );
              hasMorePages = false;
            }
          }
        }

        const xeroTransactions = allXeroTransactions;

        this.logger.log(
          `Fetched total ${xeroTransactions.length} transactions from Xero for account ${connection.accountName} (${page} pages)`,
        );

        // Debug: Log first transaction structure to understand available fields
        if (xeroTransactions.length > 0) {
          const sample = xeroTransactions[0];
          this.logger.debug(
            `Sample transaction fields: date=${sample.date}, reference=${sample.reference}, ` +
              `contact=${sample.contact?.name}, lineItemDesc=${sample.lineItems?.[0]?.description}, ` +
              `type=${sample.type}, status=${sample.status}`,
          );
        }

        // Filter by date range
        const filteredTransactions = xeroTransactions.filter((tx) => {
          if (!tx.date) return false;
          const txDate = new Date(tx.date);
          return txDate >= fromDate && txDate <= toDate;
        });

        this.logger.log(
          `After date filter (${fromDate.toISOString()} to ${toDate.toISOString()}): ${filteredTransactions.length} transactions`,
        );

        result.transactionsFound += filteredTransactions.length;

        let skippedCount = 0;
        for (const xeroTx of filteredTransactions) {
          try {
            const importResult = await this.importTransaction(
              tenantId,
              connection,
              xeroTx,
            );

            if (importResult === 'created') {
              result.transactionsCreated++;
            } else if (importResult === 'duplicate') {
              result.duplicatesSkipped++;
            } else if (importResult === 'skipped') {
              skippedCount++;
            }
          } catch (error) {
            result.errors.push({
              transactionId: xeroTx.bankTransactionID ?? 'unknown',
              error: error instanceof Error ? error.message : String(error),
              code: 'IMPORT_ERROR',
            });
          }
        }

        if (skippedCount > 0) {
          this.logger.log(
            `Skipped ${skippedCount} DELETED transactions for account ${connection.accountName}`,
          );
        }

        // Update last sync timestamp
        await this.prisma.bankConnection.update({
          where: { id: connection.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (error) {
        this.logger.error(
          `Failed to sync connection ${connection.id}`,
          error instanceof Error ? error.stack : String(error),
        );

        // Detect HTTP 429 before marking status — a rate-limit is a "soft pause",
        // not a broken connection.  Re-throw as Xero429Error so the caller (auto-sync
        // job) can handle it without burning an exponential-backoff slot.
        const info429 = this.extractXero429Info(error);
        if (info429.is429) {
          // Do NOT set status=ERROR for a 429 — the connection is healthy, just throttled.
          // The job will persist rateLimitUntilAt on the connection record.
          this.logger.warn(
            `Connection ${connection.id} hit Xero 429 rate-limit. ` +
              `Retry-After: ${info429.retryAfterMs !== undefined ? `${Math.ceil(info429.retryAfterMs / 1000)}s` : 'not specified'}`,
          );
          throw new Xero429Error(info429.retryAfterMs, error);
        }

        // Non-429 error — mark connection as broken.
        const errorMessage = this.extractXeroErrorMessage(error);
        await this.prisma.bankConnection.update({
          where: { id: connection.id },
          data: {
            status: BankConnectionStatus.ERROR,
            errorMessage,
          },
        });

        result.errors.push({
          transactionId: `connection:${connection.id}`,
          error: errorMessage,
          code: 'CONNECTION_ERROR',
        });
      }
    }

    this.logger.log(
      `Bank feed sync complete: ${result.transactionsCreated} created, ${result.duplicatesSkipped} skipped, ${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Handle incoming webhook from Xero
   * @throws BusinessException if signature verification fails
   */
  async handleWebhook(
    payload: XeroWebhookPayload,
    signature: string,
  ): Promise<void> {
    this.logger.log(
      `Processing Xero webhook with ${payload.events.length} events`,
    );

    // Verify webhook signature
    const verification = this.verifyWebhookSignature(payload, signature);
    if (!verification.isValid) {
      throw new BusinessException(
        `Webhook signature verification failed: ${verification.error}`,
        'WEBHOOK_SIGNATURE_INVALID',
      );
    }

    for (const event of payload.events) {
      try {
        await this.processWebhookEvent(event);
      } catch (error) {
        this.logger.error(
          `Failed to process webhook event ${event.eventType}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue processing other events
      }
    }
  }

  /**
   * Get all connected bank accounts for a tenant
   */
  async getConnectedAccounts(tenantId: string): Promise<BankConnection[]> {
    const connections = await this.prisma.bankConnection.findMany({
      where: { tenantId: tenantId ?? undefined },
      orderBy: { connectedAt: 'desc' },
    });

    return connections.map((c) => this.mapToConnection(c));
  }

  /**
   * Get active connected accounts for a tenant
   */
  async getActiveConnections(tenantId: string): Promise<BankConnection[]> {
    const connections = await this.prisma.bankConnection.findMany({
      where: {
        tenantId,
        status: BankConnectionStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
    });

    return connections.map((c) => this.mapToConnection(c));
  }

  /**
   * Get connection by ID
   */
  async getConnectionById(
    tenantId: string,
    connectionId: string,
  ): Promise<BankConnection | null> {
    const connection = await this.prisma.bankConnection.findFirst({
      where: { id: connectionId, tenantId },
    });

    return connection ? this.mapToConnection(connection) : null;
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   */
  verifyWebhookSignature(
    payload: XeroWebhookPayload,
    signature: string,
  ): WebhookVerificationResult {
    const webhookKey = process.env.XERO_WEBHOOK_KEY;

    if (!webhookKey) {
      return {
        isValid: false,
        error: 'XERO_WEBHOOK_KEY not configured',
      };
    }

    try {
      const expectedSignature = createHmac('sha256', webhookKey)
        .update(JSON.stringify(payload))
        .digest('base64');

      if (signature !== expectedSignature) {
        return {
          isValid: false,
          error: 'Signature mismatch',
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Signature verification failed',
      };
    }
  }

  /**
   * Import a single transaction from Xero
   * @returns 'created' | 'duplicate' | 'skipped'
   */
  private async importTransaction(
    tenantId: string,
    connection: PrismaBankConnection,
    xeroTx: XeroBankTransaction,
  ): Promise<'created' | 'duplicate' | 'skipped'> {
    // Check for duplicate
    const existing = await this.transactionRepo.findByXeroId(
      tenantId,
      xeroTx.bankTransactionID,
    );

    if (existing) {
      return 'duplicate';
    }

    // Skip deleted transactions
    if (xeroTx.status === 'DELETED') {
      return 'skipped';
    }

    // Calculate amount in cents
    const amountCents = Math.round(xeroTx.total * 100);
    const isCredit =
      xeroTx.type === 'RECEIVE' ||
      xeroTx.type === 'RECEIVE-OVERPAYMENT' ||
      xeroTx.type === 'RECEIVE-PREPAYMENT';

    // Extract Xero account code from line items
    const xeroAccountCode = xeroTx.lineItems?.[0]?.accountCode ?? undefined;
    const lineItemDescription = xeroTx.lineItems?.[0]?.description?.trim();

    // Detect catch-all/suspense accounts that need review
    const isCatchAllAccount = this.isCatchAllAccount(
      xeroAccountCode,
      lineItemDescription,
    );

    // Build description from available fields (priority order):
    // For catch-all accounts, the line item description IS the account name (e.g., "To Be Categorized")
    // so we prioritize contact name/reference which contain the original bank narrative
    let description: string;
    if (isCatchAllAccount) {
      // For catch-all: use contact name or reference (original bank narrative)
      description =
        xeroTx.contact?.name?.trim() ||
        xeroTx.reference?.trim() ||
        lineItemDescription ||
        `${xeroTx.type} Transaction`;
    } else {
      // For regular transactions: use line item description first
      description =
        lineItemDescription ||
        xeroTx.reference?.trim() ||
        xeroTx.contact?.name?.trim() ||
        `${xeroTx.type} Transaction`;
    }

    // Set status based on account type
    const status = isCatchAllAccount
      ? TransactionStatus.REVIEW_REQUIRED
      : TransactionStatus.PENDING;

    if (isCatchAllAccount) {
      this.logger.log(
        `Transaction ${xeroTx.bankTransactionID} flagged for review (catch-all account: ${xeroAccountCode})`,
      );
    }

    // TASK-RECON-038: Preserve Xero's sign - DO NOT use Math.abs()
    // Xero sends negative amounts for fees/debits, positive for credits
    // Sign convention: amountCents carries sign, isCredit indicates direction

    // TASK-RECON-039: Fee correction - bank fees MUST be debits regardless of Xero type
    // Xero sometimes incorrectly sends fees as positive/RECEIVE transactions
    // This mirrors the fix in CSV parser for consistency
    let correctedAmountCents = amountCents;
    let correctedIsCredit = isCredit;

    if (this.isFeeTransaction(description) && (isCredit || amountCents > 0)) {
      this.logger.warn(
        `Xero sync: Fee transaction "${description}" has incorrect sign (amount=${amountCents}, isCredit=${isCredit}), correcting to debit`,
        {
          transactionId: xeroTx.bankTransactionID,
          originalAmount: amountCents,
        },
      );
      // Force fee to be a debit (expense)
      correctedIsCredit = false;
      // Ensure amount is negative for debits
      correctedAmountCents = amountCents > 0 ? -amountCents : amountCents;
    }

    // Create transaction
    await this.transactionRepo.create({
      tenantId,
      xeroTransactionId: xeroTx.bankTransactionID,
      bankAccount: connection.accountName,
      date: new Date(xeroTx.date),
      description,
      payeeName: xeroTx.contact?.name ?? undefined,
      reference: xeroTx.reference ?? undefined,
      amountCents: correctedAmountCents, // FIXED: Fees corrected to negative
      isCredit: correctedIsCredit, // FIXED: Fees corrected to debit
      source: ImportSource.BANK_FEED,
      status,
      xeroAccountCode,
    });

    return 'created';
  }

  /**
   * Check if a transaction description indicates a BANK fee/charge (expense)
   * Bank fee transactions should ALWAYS be debits regardless of how Xero marks them.
   *
   * IMPORTANT: Distinguishes between:
   * - Bank fees (expenses): "Cash Deposit Fee", "Bank Charges", "Monthly Account Fee"
   * - Parent payments (income): "Monthly Fee Payment", "School Fee Paid", "Fee Received"
   *
   * Rule: If description contains "payment", "paid", "received", or "from" after "fee",
   * it's likely a parent payment, NOT a bank fee.
   */
  private isFeeTransaction(description: string): boolean {
    // First check if it's an incoming payment (not a bank fee)
    // Patterns like "Fee Payment", "Fees Paid", "Fee Received" are income, not bank fees
    if (/\b(fee|fees)\s*(payment|paid|received|from)\b/i.test(description)) {
      return false;
    }
    if (
      /\b(payment|paid|received)\s*(for\s*)?(fee|fees)\b/i.test(description)
    ) {
      return false;
    }

    // Bank fee patterns - these are expenses/charges from the bank
    // Note: Just "monthly fee" alone is ambiguous but in bank context it's usually a bank charge
    return /\b(bank\s*charges?|service\s*(fee|charge)|debit\s*order\s*fee|cash\s*deposit\s*fee|cash\s*handling\s*fee|withdrawal\s*fee|transaction\s*fee|atm\s*fee|card\s*fee|account\s*fee|maintenance\s*fee|penalty|interest\s*charge|#cash\s*deposit\s*fee)\b/i.test(
      description,
    );
  }

  /**
   * Check if an account is a catch-all/suspense account that needs review
   */
  private isCatchAllAccount(
    accountCode?: string,
    accountName?: string,
  ): boolean {
    // Check account code against known catch-all codes
    if (accountCode) {
      const upperCode = accountCode.toUpperCase();
      if (
        CATCH_ALL_ACCOUNT_CODES.some(
          (code) => upperCode === code || upperCode.startsWith(code),
        )
      ) {
        return true;
      }
    }

    // Check account name against patterns
    if (accountName) {
      if (
        CATCH_ALL_ACCOUNT_PATTERNS.some((pattern) => pattern.test(accountName))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process a single webhook event
   */
  private async processWebhookEvent(event: XeroWebhookEvent): Promise<void> {
    this.logger.debug(
      `Processing event: ${event.eventCategory}/${event.eventType} for ${event.resourceId}`,
    );

    // Find tenant by Xero tenant ID
    const xeroToken = await this.prisma.xeroToken.findFirst({
      where: { xeroTenantId: event.tenantId },
    });

    if (!xeroToken) {
      this.logger.warn(`No tenant found for Xero tenant ${event.tenantId}`);
      return;
    }

    const tenantId = xeroToken.tenantId;

    // Handle bank transaction events
    if (event.eventCategory === 'BANK_TRANSACTION') {
      if (event.eventType === 'CREATE' || event.eventType === 'UPDATE') {
        // Trigger sync for affected accounts
        await this.syncTransactions(tenantId, {
          forceFullSync: false,
        });
      }
    }
  }

  /**
   * Get authenticated XeroClient
   */
  private async getAuthenticatedClient(tenantId: string): Promise<{
    client: XeroClient;
    xeroTenantId: string;
  }> {
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection for this tenant. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    const client = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID ?? '',
      clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
      redirectUris: [process.env.XERO_REDIRECT_URI ?? ''],
      scopes: [
        'openid',
        'profile',
        'email',
        'accounting.transactions',
        'accounting.settings',
        'finance.bankstatementsplus.read', // For unreconciled bank feed data
      ],
    });

    client.setTokenSet({
      access_token: accessToken,
      token_type: 'Bearer',
    });

    return { client, xeroTenantId };
  }

  /**
   * Check and enforce rate limiting
   */
  private async checkRateLimit(tenantId: string): Promise<void> {
    const now = Date.now();
    const tracker = this.rateLimitTracker.get(tenantId);

    if (!tracker || now >= tracker.resetAt) {
      // Start new window
      this.rateLimitTracker.set(tenantId, {
        count: 1,
        resetAt: now + RATE_LIMIT_WINDOW_MS,
      });
      return;
    }

    if (tracker.count >= RATE_LIMIT_CALLS) {
      const waitMs = tracker.resetAt - now;
      this.logger.warn(
        `Rate limit reached for tenant ${tenantId}, waiting ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      // Reset after waiting
      this.rateLimitTracker.set(tenantId, {
        count: 1,
        resetAt: Date.now() + RATE_LIMIT_WINDOW_MS,
      });
      return;
    }

    tracker.count++;
  }

  /**
   * Get default from date for sync
   */
  private getDefaultFromDate(forceFullSync?: boolean): Date {
    if (forceFullSync) {
      // Full sync: last 10 years (covers all historical data)
      const date = new Date();
      date.setFullYear(date.getFullYear() - 10);
      return date;
    }
    // Incremental sync: last 7 days
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }

  /**
   * Fetch unreconciled bank statement lines from Xero Finance API
   * This gets raw bank feed data that hasn't been matched to transactions yet
   */
  async syncUnreconciledStatements(
    tenantId: string,
    options?: BankSyncOptions,
  ): Promise<{
    found: number;
    created: number;
    skipped: number;
    errors: BankSyncError[];
  }> {
    this.logger.log(
      `Fetching bank statements (Finance API) for tenant ${tenantId}`,
    );

    const result = {
      found: 0,
      created: 0,
      skipped: 0,
      errors: [] as BankSyncError[],
    };

    // Get connections to sync
    const connections = await this.prisma.bankConnection.findMany({
      where: {
        tenantId,
        status: BankConnectionStatus.ACTIVE,
        ...(options?.connectionId && { id: options.connectionId }),
      },
    });

    if (connections.length === 0) {
      this.logger.log('No active bank connections for Finance API sync');
      return result;
    }

    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    // Determine date range
    const fromDate =
      options?.fromDate ?? this.getDefaultFromDate(options?.forceFullSync);
    const toDate = options?.toDate ?? new Date();

    // Format dates as YYYY-MM-DD for Finance API
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = toDate.toISOString().split('T')[0];

    for (const connection of connections) {
      try {
        await this.checkRateLimit(tenantId);

        this.logger.log(
          `Fetching statements for account ${connection.accountName} (${connection.xeroAccountId})`,
        );

        // Call Finance API to get bank statement with accounting data
        const statementsResponse =
          await client.financeApi.getBankStatementAccounting(
            xeroTenantId,
            connection.xeroAccountId,
            fromDateStr,
            toDateStr,
            false, // summaryOnly = false to get line items
          );

        const statements = statementsResponse.body.statements ?? [];
        this.logger.log(
          `Fetched ${statements.length} statements from Finance API for ${connection.accountName}`,
        );

        // Process each statement
        for (const statement of statements) {
          const statementLines = statement.statementLines ?? [];

          // Debug: Log first statement line structure
          if (statementLines.length > 0) {
            const sample = statementLines[0];
            this.logger.debug(
              `Sample statement line: date=${sample.postedDate}, payee=${sample.payee}, ` +
                `reference=${sample.reference}, amount=${sample.amount}, isReconciled=${sample.isReconciled}`,
            );
          }

          // Process ALL non-deleted, non-duplicate lines (both reconciled and unreconciled)
          // Cash-coded items in Xero are "reconciled" but don't appear in getBankTransactions API,
          // so we must import them here. Duplicate detection via xeroTransactionId prevents double-imports.
          const importableLines = statementLines.filter(
            (line) => !line.isDeleted && !line.isDuplicate,
          );

          const unreconciledCount = importableLines.filter(
            (l) => !l.isReconciled,
          ).length;
          const reconciledCount = importableLines.filter(
            (l) => l.isReconciled,
          ).length;

          this.logger.log(
            `Statement ${statement.statementId}: ${importableLines.length} importable lines ` +
              `(${reconciledCount} reconciled, ${unreconciledCount} unreconciled, ` +
              `${statementLines.length} total)`,
          );

          result.found += importableLines.length;

          for (const line of importableLines) {
            try {
              const importResult = await this.importStatementLine(
                tenantId,
                connection,
                line as XeroStatementLine,
                line.isReconciled ?? false,
              );

              if (importResult === 'created') {
                result.created++;
              } else {
                result.skipped++;
              }
            } catch (error) {
              result.errors.push({
                transactionId: line.statementLineId ?? 'unknown',
                error: error instanceof Error ? error.message : String(error),
                code: 'IMPORT_ERROR',
              });
            }
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to fetch statements for ${connection.accountName}`,
          error instanceof Error ? error.stack : String(error),
        );

        result.errors.push({
          transactionId: `connection:${connection.id}`,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch statements',
          code: 'FINANCE_API_ERROR',
        });
      }
    }

    this.logger.log(
      `Finance API sync complete: ${result.created} created, ${result.skipped} skipped, ` +
        `${result.errors.length} errors (${result.found} found)`,
    );

    return result;
  }

  /**
   * Sync transactions from Xero Journals API.
   * Catches transactions missed by getBankTransactions — specifically:
   * - Cash-coded items (reconciled via bulk categorization)
   * - Invoice/bill payments matched to bank feed lines
   * - Bank transfers
   *
   * Uses the accounting.transactions scope (already authorized).
   * Each journal has lines with accountID — we filter for the FNB bank account.
   */
  async syncFromJournals(
    tenantId: string,
    options?: BankSyncOptions,
  ): Promise<{
    found: number;
    created: number;
    skipped: number;
    errors: BankSyncError[];
  }> {
    this.logger.log(`Syncing from Journals API for tenant ${tenantId}`);

    const result = {
      found: 0,
      created: 0,
      skipped: 0,
      errors: [] as BankSyncError[],
    };

    // Get connections to sync
    const connections = await this.prisma.bankConnection.findMany({
      where: {
        tenantId,
        status: BankConnectionStatus.ACTIVE,
        ...(options?.connectionId && { id: options.connectionId }),
      },
    });

    if (connections.length === 0) {
      this.logger.log('No active bank connections for journals sync');
      return result;
    }

    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    // Build a set of bank account IDs for quick lookup
    const bankAccountIds = new Set(connections.map((c) => c.xeroAccountId));
    // Map accountID → connection for creating transactions
    const accountConnectionMap = new Map(
      connections.map((c) => [c.xeroAccountId, c]),
    );

    // Determine date range — journals use ifModifiedSince (not date range)
    const fromDate =
      options?.fromDate ?? this.getDefaultFromDate(options?.forceFullSync);

    // Fetch journals with pagination (offset-based, 100 per page)
    let offset = 0;
    let hasMore = true;
    const maxPages = 200; // Safety limit: 20,000 journals max
    let pageCount = 0;

    while (hasMore && pageCount < maxPages) {
      await this.checkRateLimit(tenantId);

      const journalsResponse = await client.accountingApi.getJournals(
        xeroTenantId,
        fromDate, // ifModifiedSince
        offset,
        false, // paymentsOnly = false (we want ALL journal types)
      );

      const journals = journalsResponse.body.journals ?? [];
      this.logger.log(
        `Journals page ${pageCount + 1}: ${journals.length} journals (offset ${offset})`,
      );

      if (journals.length === 0) {
        hasMore = false;
        break;
      }

      for (const journal of journals) {
        if (!journal.journalLines || journal.journalLines.length === 0) {
          continue;
        }

        // Find journal lines that reference one of our bank accounts
        const bankLine = journal.journalLines.find(
          (line) => line.accountID && bankAccountIds.has(line.accountID),
        );

        if (!bankLine || !bankLine.accountID) continue;
        if (!journal.journalDate) continue;

        // Skip if journal source is already covered by getBankTransactions
        // CASHREC (Receive Money) and CASHPAID (Spend Money) are returned by getBankTransactions
        // But some cash-coded items use these source types too, so we rely on duplicate detection
        result.found++;

        const connection = accountConnectionMap.get(bankLine.accountID);
        if (!connection) continue;

        try {
          const importResult = await this.importJournalTransaction(
            tenantId,
            connection,
            journal,
            bankLine,
          );

          if (importResult === 'created') {
            result.created++;
          } else {
            result.skipped++;
          }
        } catch (error) {
          result.errors.push({
            transactionId: journal.journalID ?? 'unknown',
            error: error instanceof Error ? error.message : String(error),
            code: 'IMPORT_ERROR',
          });
        }
      }

      offset += journals.length;
      pageCount++;

      if (journals.length < 100) {
        hasMore = false;
      }
    }

    this.logger.log(
      `Journals sync complete: ${result.created} created, ${result.skipped} skipped, ` +
        `${result.errors.length} errors (${result.found} found across ${pageCount} pages)`,
    );

    return result;
  }

  /**
   * Import a single transaction from a Xero Journal entry.
   * Uses journalID for primary duplicate detection, plus amount+date fallback.
   */
  private async importJournalTransaction(
    tenantId: string,
    connection: PrismaBankConnection,
    journal: {
      journalID?: string;
      journalDate?: string;
      sourceType?: unknown;
      sourceID?: string;
      reference?: string;
      journalLines?: Array<{
        accountID?: string;
        accountCode?: string;
        accountName?: string;
        description?: string;
        netAmount?: number;
        grossAmount?: number;
      }>;
    },
    bankLine: {
      accountID?: string;
      description?: string;
      netAmount?: number;
      grossAmount?: number;
    },
  ): Promise<'created' | 'duplicate' | 'skipped'> {
    const journalId = journal.journalID;
    if (!journalId) return 'skipped';

    // Check for duplicate by journalID
    const existingByJournal = await this.transactionRepo.findByXeroId(
      tenantId,
      journalId,
    );
    if (existingByJournal) return 'duplicate';

    // Also check by sourceID (the underlying transaction like InvoiceID, PaymentID)
    if (journal.sourceID) {
      const existingBySource = await this.transactionRepo.findByXeroId(
        tenantId,
        journal.sourceID,
      );
      if (existingBySource) return 'duplicate';
    }

    // Amount from the bank line (grossAmount includes tax)
    // In journals: positive netAmount = debit to the account
    // For bank (asset): debit = money IN, credit = money OUT
    const grossAmount = bankLine.grossAmount ?? bankLine.netAmount ?? 0;
    const amountCents = Math.round(grossAmount * 100);

    // For bank account: debit (positive) = money received (isCredit=true in statement terms)
    const isCredit = amountCents > 0;

    // Date
    const txDate = journal.journalDate;
    if (!txDate) return 'skipped';

    // Check for amount+date duplicate (catches items already imported via getBankTransactions)
    const dayStart = new Date(txDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(txDate);
    dayEnd.setHours(23, 59, 59, 999);

    const sameDayTx = await this.prisma.transaction.findFirst({
      where: {
        tenantId,
        bankAccount: connection.accountName,
        amountCents,
        date: { gte: dayStart, lte: dayEnd },
        source: ImportSource.BANK_FEED,
      },
    });

    if (sameDayTx) return 'duplicate';

    // Build description from the OTHER journal lines (the non-bank account lines)
    // These contain the category/payee info
    const otherLines = (journal.journalLines ?? []).filter(
      (line) => line.accountID !== bankLine.accountID,
    );

    const description =
      otherLines[0]?.description?.trim() ||
      otherLines[0]?.accountName?.trim() ||
      journal.reference?.trim() ||
      `${(journal.sourceType as string | undefined) ?? 'Journal'} Transaction`;

    // Detect fee transactions
    let correctedAmountCents = amountCents;
    let correctedIsCredit = isCredit;

    if (this.isFeeTransaction(description) && (isCredit || amountCents > 0)) {
      correctedIsCredit = false;
      correctedAmountCents = amountCents > 0 ? -amountCents : amountCents;
    }

    await this.transactionRepo.create({
      tenantId,
      xeroTransactionId: journalId,
      bankAccount: connection.accountName,
      date: new Date(txDate),
      description,
      reference: journal.reference ?? undefined,
      amountCents: correctedAmountCents,
      isCredit: correctedIsCredit,
      source: ImportSource.BANK_FEED,
    });

    return 'created';
  }

  /**
   * Import a single statement line from Finance API
   * Handles both reconciled (cash-coded) and unreconciled lines.
   * Duplicate detection uses statementLineId to prevent double-imports
   * when items are also pulled by getBankTransactions.
   *
   * @returns 'created' | 'duplicate' | 'skipped'
   */
  private async importStatementLine(
    tenantId: string,
    connection: PrismaBankConnection,
    line: XeroStatementLine,
    isReconciled = false,
  ): Promise<'created' | 'duplicate' | 'skipped'> {
    // Check for duplicate using statement line ID
    const existing = await this.transactionRepo.findByXeroId(
      tenantId,
      line.statementLineId,
    );

    if (existing) {
      return 'duplicate';
    }

    // Also check if this was already imported via getBankTransactions
    // by matching amount + date + similar description within the same day
    // This prevents duplicates when the same transaction appears in both APIs
    if (isReconciled) {
      const txDate = line.transactionDate || line.postedDate;
      if (txDate) {
        const amountCents = Math.round(line.amount * 100);
        const dayStart = new Date(txDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(txDate);
        dayEnd.setHours(23, 59, 59, 999);

        const sameDayTx = await this.prisma.transaction.findFirst({
          where: {
            tenantId,
            bankAccount: connection.accountName,
            amountCents,
            date: { gte: dayStart, lte: dayEnd },
            source: ImportSource.BANK_FEED,
          },
        });

        if (sameDayTx) {
          return 'duplicate';
        }
      }
    }

    // TASK-RECON-038: Preserve Xero's sign - DO NOT use Math.abs()
    // Finance API returns decimal amounts with sign (negative = debit)
    const amountCents = Math.round(line.amount * 100);
    const isCredit = amountCents > 0;

    // Build description from available fields
    // Priority: payee > reference > notes > fallback
    const description =
      line.payee?.trim() ||
      line.reference?.trim() ||
      line.notes?.trim() ||
      `Bank Statement Line`;

    // Use postedDate or transactionDate
    const txDate = line.transactionDate || line.postedDate;
    if (!txDate) {
      this.logger.warn(
        `Statement line ${line.statementLineId} has no date, skipping`,
      );
      return 'skipped';
    }

    // Prefix unreconciled items to distinguish them
    const finalDescription = isReconciled
      ? description
      : `[UNRECONCILED] ${description}`;

    // Create transaction
    await this.transactionRepo.create({
      tenantId,
      xeroTransactionId: line.statementLineId,
      bankAccount: connection.accountName,
      date: new Date(txDate),
      description: finalDescription,
      payeeName: line.payee ?? undefined,
      reference: line.reference ?? undefined,
      amountCents,
      isCredit,
      source: ImportSource.BANK_FEED,
    });

    return 'created';
  }

  /**
   * Detect whether a thrown error is a Xero HTTP 429 and, if so, extract
   * the Retry-After deadline as milliseconds from now.
   *
   * Xero sends 429s both as xero-node SDK plain-object rejections:
   *   { response: { status: 429, headers: { 'retry-after': '60' }, body: {...} } }
   * and occasionally as standard Error instances wrapping the same shape.
   *
   * The Retry-After header value may be:
   *   - A decimal integer string (seconds, e.g. "60")
   *   - An HTTP date string (e.g. "Wed, 29 Apr 2026 12:00:00 GMT")
   *
   * Returns `{ is429: true, retryAfterMs }` when the error is a 429.
   * Returns `{ is429: false }` for every other error type.
   */
  extractXero429Info(
    error: unknown,
  ): { is429: true; retryAfterMs: number | undefined } | { is429: false } {
    let statusCode: number | undefined;
    let retryAfterHeader: string | undefined;

    if (error instanceof Xero429Error) {
      // Already wrapped — avoid double-wrapping on re-throw paths.
      return { is429: true, retryAfterMs: error.retryAfterMs };
    }

    if (error !== null && typeof error === 'object') {
      const err = error as Record<string, unknown>;
      const responseObj = err['response'] as
        | Record<string, unknown>
        | undefined;

      statusCode =
        (responseObj?.['status'] as number | undefined) ??
        (responseObj?.['statusCode'] as number | undefined);

      if (statusCode === 429) {
        const headers = responseObj?.['headers'] as
          | Record<string, string>
          | undefined;
        // Header name is case-insensitive; xero-node lowercases them.
        retryAfterHeader =
          headers?.['retry-after'] ??
          headers?.['Retry-After'] ??
          headers?.['x-rate-limit-problem']; // Xero sometimes uses this alias
        return {
          is429: true,
          retryAfterMs: this.parseRetryAfterHeader(retryAfterHeader),
        };
      }
    }

    // Also handle Error instances whose message contains 429 (fallback).
    if (error instanceof Error && error.message.includes('429')) {
      return { is429: true, retryAfterMs: undefined };
    }

    return { is429: false };
  }

  /**
   * Parse a Retry-After header value into milliseconds.
   * Accepts both integer-seconds strings and HTTP-date strings.
   * Returns undefined when the header is absent or unparseable.
   */
  private parseRetryAfterHeader(value: string | undefined): number | undefined {
    if (!value) return undefined;

    // Integer seconds (most common for Xero)
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }

    // HTTP-date fallback (RFC 7231)
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const msFromNow = date.getTime() - Date.now();
      return msFromNow > 0 ? msFromNow : 0;
    }

    return undefined;
  }

  /**
   * Extract a human-readable error message from any thrown value.
   *
   * The xero-node SDK rejects HTTP errors as a plain object
   * `{ response: { status: number, body: unknown }, body: unknown }`
   * rather than an Error instance.  `error instanceof Error` returns false
   * for these, so the naive fallback produces "[object Object]" or the
   * opaque string "Sync failed".
   *
   * This helper extracts the most informative string available and caps it
   * at 1 000 chars so it never overflows the DB column.
   */
  extractXeroErrorMessage(error: unknown): string {
    const MAX = 1000;

    // Standard Error (most common for Prisma / validation errors)
    if (error instanceof Error) {
      return error.message.slice(0, MAX);
    }

    // xero-node HTTP rejection: { response: { status, body }, body }
    if (error !== null && typeof error === 'object') {
      const err = error as Record<string, unknown>;

      // Prefer response.status + body detail
      const responseObj = err['response'] as
        | Record<string, unknown>
        | undefined;
      const statusCode =
        (responseObj?.['status'] as number | undefined) ??
        (responseObj?.['statusCode'] as number | undefined);

      const bodyObj =
        (responseObj?.['body'] as Record<string, unknown> | undefined) ??
        (err['body'] as Record<string, unknown> | undefined);

      const detail =
        (bodyObj?.['Detail'] as string | undefined) ??
        (bodyObj?.['detail'] as string | undefined) ??
        (bodyObj?.['message'] as string | undefined) ??
        (bodyObj?.['Message'] as string | undefined);

      const title =
        (bodyObj?.['Title'] as string | undefined) ??
        (bodyObj?.['title'] as string | undefined) ??
        (bodyObj?.['Type'] as string | undefined);

      if (statusCode) {
        const parts: string[] = [`HTTP ${statusCode}`];
        if (title) parts.push(title);
        if (detail) parts.push(detail);
        return parts.join(': ').slice(0, MAX);
      }

      // JSON stringify as last resort
      try {
        return JSON.stringify(error).slice(0, MAX);
      } catch {
        // fall through
      }
    }

    return String(error).slice(0, MAX);
  }

  /**
   * Map Prisma model to domain interface
   */
  private mapToConnection(
    prismaConnection: PrismaBankConnection,
  ): BankConnection {
    return {
      id: prismaConnection.id,
      tenantId: prismaConnection.tenantId,
      xeroAccountId: prismaConnection.xeroAccountId,
      accountName: prismaConnection.accountName,
      accountNumber: prismaConnection.accountNumber,
      bankName: prismaConnection.bankName,
      connectedAt: prismaConnection.connectedAt,
      lastSyncAt: prismaConnection.lastSyncAt,
      status: prismaConnection.status.toLowerCase() as
        | 'active'
        | 'disconnected'
        | 'error',
      errorMessage: prismaConnection.errorMessage ?? undefined,
    };
  }
}
