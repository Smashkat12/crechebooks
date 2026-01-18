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

    // Get connections to sync
    const whereClause: {
      tenantId: string;
      status: BankConnectionStatus;
      id?: string;
    } = {
      tenantId,
      status: BankConnectionStatus.ACTIVE,
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

        // Mark connection as error state
        await this.prisma.bankConnection.update({
          where: { id: connection.id },
          data: {
            status: BankConnectionStatus.ERROR,
            errorMessage:
              error instanceof Error ? error.message : 'Sync failed',
          },
        });

        result.errors.push({
          transactionId: `connection:${connection.id}`,
          error: error instanceof Error ? error.message : 'Sync failed',
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
      where: { tenantId },
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

    // Detect fee transactions with incorrect positive amounts (audit warning)
    if (this.isFeeTransaction(description) && amountCents > 0) {
      this.logger.warn(
        `Fee transaction "${description}" has positive amount - verify sign convention`,
        { transactionId: xeroTx.bankTransactionID, amountCents },
      );
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
      amountCents, // FIXED: Preserve original sign (no Math.abs)
      isCredit,
      source: ImportSource.BANK_FEED,
      status,
      xeroAccountCode,
    });

    return 'created';
  }

  /**
   * Check if a transaction description indicates a fee/charge
   * Used for audit logging when fee signs appear incorrect
   */
  private isFeeTransaction(description: string): boolean {
    return /\b(fee|charge|bank charges|service fee|monthly fee|transaction fee)\b/i.test(
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
      `Fetching unreconciled bank statements for tenant ${tenantId}`,
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
      this.logger.log('No active bank connections for unreconciled sync');
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
          `Fetching unreconciled statements for account ${connection.accountName} (${connection.xeroAccountId})`,
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

          // Filter for unreconciled lines only
          const unreconciledLines = statementLines.filter(
            (line) =>
              !line.isReconciled && !line.isDeleted && !line.isDuplicate,
          );

          this.logger.log(
            `Statement ${statement.statementId}: ${unreconciledLines.length} unreconciled lines ` +
              `(out of ${statementLines.length} total)`,
          );

          result.found += unreconciledLines.length;

          for (const line of unreconciledLines) {
            try {
              const importResult = await this.importStatementLine(
                tenantId,
                connection,
                line as XeroStatementLine,
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
          `Failed to fetch unreconciled statements for ${connection.accountName}`,
          error instanceof Error ? error.stack : String(error),
        );

        result.errors.push({
          transactionId: `connection:${connection.id}`,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch unreconciled statements',
          code: 'FINANCE_API_ERROR',
        });
      }
    }

    this.logger.log(
      `Unreconciled sync complete: ${result.created} created, ${result.skipped} skipped, ` +
        `${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Import a single statement line from Finance API
   * @returns 'created' | 'duplicate' | 'skipped'
   */
  private async importStatementLine(
    tenantId: string,
    connection: PrismaBankConnection,
    line: XeroStatementLine,
  ): Promise<'created' | 'duplicate' | 'skipped'> {
    // Check for duplicate using statement line ID
    const existing = await this.transactionRepo.findByXeroId(
      tenantId,
      line.statementLineId,
    );

    if (existing) {
      return 'duplicate';
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

    // Create transaction with [UNRECONCILED] prefix to distinguish
    await this.transactionRepo.create({
      tenantId,
      xeroTransactionId: line.statementLineId,
      bankAccount: connection.accountName,
      date: new Date(txDate),
      description: `[UNRECONCILED] ${description}`,
      payeeName: line.payee ?? undefined,
      reference: line.reference ?? undefined,
      amountCents,
      isCredit,
      source: ImportSource.BANK_FEED,
    });

    return 'created';
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
