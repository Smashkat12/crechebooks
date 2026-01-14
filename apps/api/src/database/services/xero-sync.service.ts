/**
 * XeroSyncService
 * TASK-TRANS-014
 *
 * Bi-directional sync between CrecheBooks and Xero.
 * Uses existing Xero MCP server tools for API calls.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: All operations must filter by tenantId.
 */

import { Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';
import {
  XeroClient,
  Invoice as XeroInvoice,
  Payment as XeroPaymentModel,
  ManualJournal,
  LineAmountTypes,
} from 'xero-node';
import {
  Payment,
  Invoice,
  Parent,
  XeroAccountStatus,
  CategorizationJournalStatus,
} from '@prisma/client';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { XeroAccountRepository } from '../repositories/xero-account.repository';
import { CategorizationJournalRepository } from '../repositories/categorization-journal.repository';
import { AuditLogService } from './audit-log.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { ConflictResolutionService } from './conflict-resolution.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SyncResult,
  CategorySyncResult,
  PullResult,
  VAT_TO_XERO_TAX,
  XERO_TAX_TO_VAT,
} from '../dto/xero-sync.dto';
import {
  ImportSource,
  TransactionStatus,
} from '../entities/transaction.entity';
import { AuditAction } from '../entities/audit-log.entity';
import { ConflictType } from '../entities/sync-conflict.entity';
import {
  CoaSyncResult,
  AccountValidationResult,
} from '../entities/xero-account.entity';
import { SUSPENSE_ACCOUNT_CODE } from '../entities/categorization-journal.entity';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { RateLimiter } from '../../mcp/xero-mcp/utils/rate-limiter';

// Import Xero MCP tools
import {
  getAccounts,
  getTransactions,
  updateTransaction,
} from '../../mcp/xero-mcp/tools';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';

// Error message indicating transaction is reconciled and cannot be edited
const RECONCILED_TRANSACTION_ERROR =
  'This Bank Transaction cannot be edited as it has been reconciled';

@Injectable()
export class XeroSyncService {
  private readonly logger = new Logger(XeroSyncService.name);
  private tokenManager: TokenManager;
  private readonly rateLimiter: RateLimiter;

  // Rate limit retry configuration
  private readonly MAX_RATE_LIMIT_RETRIES = 3;
  private readonly RATE_LIMIT_BACKOFF_MS = 2000;

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly xeroAccountRepo: XeroAccountRepository,
    private readonly categorizationJournalRepo: CategorizationJournalRepository,
    private readonly auditLogService: AuditLogService,
    private readonly conflictDetection: ConflictDetectionService,
    private readonly conflictResolution: ConflictResolutionService,
    private readonly prisma: PrismaService,
  ) {
    // Pass PrismaService (extends PrismaClient) to TokenManager
    this.tokenManager = new TokenManager(this.prisma);
    // Rate limiter: 60 requests per minute as per Xero API limits
    this.rateLimiter = new RateLimiter(60, 60000);
  }

  /**
   * Sync multiple transactions to Xero
   * Updates account codes in Xero based on local categorizations
   */
  async syncTransactions(
    transactionIds: string[],
    tenantId: string,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      totalProcessed: transactionIds.length,
      synced: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    if (transactionIds.length === 0) {
      return result;
    }

    this.logger.log(
      `Starting sync of ${transactionIds.length} transactions for tenant ${tenantId}`,
    );

    // Get authenticated client
    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    for (const txId of transactionIds) {
      try {
        const synced = await this.pushToXero(
          txId,
          tenantId,
          client,
          xeroTenantId,
        );

        if (synced) {
          result.synced++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          transactionId: txId,
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof BusinessException ? error.code : 'SYNC_ERROR',
        });

        this.logger.error(
          `Failed to sync transaction ${txId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Sync complete: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Push single transaction to Xero
   * @returns true if synced, false if skipped (already synced or no Xero ID)
   */
  async pushToXero(
    transactionId: string,
    tenantId: string,
    client?: XeroClient,
    xeroTenantId?: string,
  ): Promise<boolean> {
    // Get authenticated client if not provided
    if (!client || !xeroTenantId) {
      const auth = await this.getAuthenticatedClient(tenantId);
      client = auth.client;
      xeroTenantId = auth.xeroTenantId;
    }

    // Load transaction
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // Skip if already synced (cast to string for Prisma enum compatibility)
    if (transaction.status === 'SYNCED') {
      this.logger.debug(
        `Transaction ${transactionId} already synced, skipping`,
      );
      return false;
    }

    // Skip if no Xero transaction ID (not from Xero)
    if (!transaction.xeroTransactionId) {
      this.logger.debug(
        `Transaction ${transactionId} has no Xero ID, skipping`,
      );
      return false;
    }

    // Get categorization
    const categorizations =
      await this.categorizationRepo.findByTransaction(transactionId);
    if (categorizations.length === 0) {
      throw new BusinessException(
        'Transaction must be categorized before syncing to Xero',
        'NOT_CATEGORIZED',
      );
    }

    // Use the most recent categorization
    const categorization = categorizations[0];

    // TASK-XERO-001: Check for conflicts before syncing
    // Fetch current Xero version to detect conflicts
    // Note: We'll need to fetch all transactions and filter by ID
    // since getTransactions doesn't support transactionIds filter
    const allXeroTransactions = await getTransactions(client, xeroTenantId, {
      fromDate: format(transaction.date, 'yyyy-MM-dd'),
      toDate: format(transaction.date, 'yyyy-MM-dd'),
    });

    const xeroTransactions = allXeroTransactions.filter(
      (tx) => tx.transactionId === transaction.xeroTransactionId,
    );

    if (xeroTransactions.length > 0) {
      const xeroTransaction = xeroTransactions[0];
      const lastSyncedAt = transaction.reconciledAt; // Use reconciliation date as last sync

      // Detect conflicts
      const conflictCheck = await this.conflictDetection.detectConflicts(
        tenantId,
        'Transaction',
        transactionId,
        {
          updatedAt: transaction.updatedAt,
          accountCode: categorization.accountCode,
          amountCents: transaction.amountCents,
          description: transaction.description,
        },
        {
          UpdatedDateUTC: xeroTransaction.date,
          AccountCode: xeroTransaction.accountCode,
          Total: xeroTransaction.amountCents / 100, // Convert cents to dollars
          Description: xeroTransaction.description,
        },
        lastSyncedAt ?? undefined,
      );

      if (conflictCheck.hasConflict) {
        this.logger.warn(
          `Conflict detected for transaction ${transactionId}: ${conflictCheck.message}`,
        );

        // Create conflict record
        const conflictId = await this.conflictDetection.createConflictRecord(
          tenantId,
          'Transaction',
          transactionId,
          conflictCheck.conflictType || ConflictType.UPDATE_UPDATE,
          {
            updatedAt: transaction.updatedAt,
            accountCode: categorization.accountCode,
            amountCents: transaction.amountCents,
          },
          {
            UpdatedDateUTC: xeroTransaction.date,
            AccountCode: xeroTransaction.accountCode,
            Total: xeroTransaction.amountCents / 100,
          },
          transaction.updatedAt,
          new Date(xeroTransaction.date),
        );

        // Try auto-resolution with last_modified_wins strategy
        const autoResolved = await this.conflictResolution.autoResolve(
          conflictId,
          'last_modified_wins',
        );

        if (!autoResolved) {
          throw new BusinessException(
            `Sync conflict detected for transaction ${transactionId}. Manual resolution required.`,
            'SYNC_CONFLICT',
          );
        }

        this.logger.log(
          `Auto-resolved conflict ${conflictId} for transaction ${transactionId}`,
        );
      }
    }

    // Update transaction in Xero
    await updateTransaction(
      client,
      xeroTenantId,
      transaction.xeroTransactionId,
      categorization.accountCode,
    );

    // Mark as synced locally
    await this.transactionRepo.updateStatus(
      tenantId,
      transactionId,
      TransactionStatus.SYNCED,
    );

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'Transaction',
      entityId: transactionId,
      action: AuditAction.UPDATE,
      afterValue: {
        xeroTransactionId: transaction.xeroTransactionId,
        accountCode: categorization.accountCode,
        syncedAt: new Date().toISOString(),
        syncType: 'XERO_SYNC',
      },
      changeSummary: `Synced to Xero with account ${categorization.accountCode}`,
    });

    this.logger.log(
      `Synced transaction ${transactionId} to Xero with account ${categorization.accountCode}`,
    );

    return true;
  }

  /**
   * Pull transactions from Xero into CrecheBooks
   */
  async pullFromXero(
    tenantId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<PullResult> {
    const result: PullResult = {
      transactionsPulled: 0,
      duplicatesSkipped: 0,
      errors: [],
    };

    this.logger.log(
      `Pulling transactions from Xero for tenant ${tenantId} from ${format(dateFrom, 'yyyy-MM-dd')} to ${format(dateTo, 'yyyy-MM-dd')}`,
    );

    // Get authenticated client
    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    // Fetch transactions from Xero
    const xeroTransactions = await getTransactions(client, xeroTenantId, {
      fromDate: format(dateFrom, 'yyyy-MM-dd'),
      toDate: format(dateTo, 'yyyy-MM-dd'),
    });

    for (const xeroTx of xeroTransactions) {
      try {
        // Check if already exists
        const existing = await this.transactionRepo.findByXeroId(
          tenantId,
          xeroTx.transactionId,
        );

        if (existing) {
          result.duplicatesSkipped++;
          continue;
        }

        // Create new transaction
        await this.transactionRepo.create({
          tenantId,
          xeroTransactionId: xeroTx.transactionId,
          bankAccount: xeroTx.bankAccount || 'UNKNOWN',
          date: xeroTx.date,
          description: xeroTx.description || 'Xero Import',
          payeeName: xeroTx.payeeName ?? undefined,
          reference: xeroTx.reference ?? undefined,
          amountCents: xeroTx.amountCents,
          isCredit: xeroTx.isCredit,
          source: ImportSource.BANK_FEED,
        });

        result.transactionsPulled++;
      } catch (error) {
        result.errors.push(
          `Transaction ${xeroTx.transactionId}: ${error instanceof Error ? error.message : String(error)}`,
        );

        this.logger.error(
          `Failed to import Xero transaction ${xeroTx.transactionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Pull complete: ${result.transactionsPulled} pulled, ${result.duplicatesSkipped} duplicates skipped`,
    );

    return result;
  }

  /**
   * Sync Chart of Accounts from Xero
   * Returns the list of accounts for reference (no local storage in this task)
   */
  async syncChartOfAccounts(tenantId: string): Promise<CategorySyncResult> {
    this.logger.log(
      `Fetching Chart of Accounts from Xero for tenant ${tenantId}`,
    );

    // Get authenticated client
    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    // Fetch accounts from Xero
    const accounts = await getAccounts(client, xeroTenantId);

    const result: CategorySyncResult = {
      accountsFetched: accounts.length,
      newAccounts: accounts.map((a) => `${a.code}: ${a.name}`),
      errors: [],
    };

    this.logger.log(`Fetched ${accounts.length} accounts from Xero`);

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'ChartOfAccounts',
      entityId: 'SYNC',
      action: AuditAction.UPDATE,
      afterValue: {
        accountCount: accounts.length,
        syncedAt: new Date().toISOString(),
        syncType: 'XERO_SYNC',
      },
      changeSummary: `Fetched ${accounts.length} accounts from Xero`,
    });

    return result;
  }

  /**
   * Check if tenant has valid Xero connection
   */
  async hasValidConnection(tenantId: string): Promise<boolean> {
    try {
      return await this.tokenManager.hasValidConnection(tenantId);
    } catch {
      return false;
    }
  }

  /**
   * Get authenticated XeroClient for tenant
   * @throws BusinessException if no valid Xero connection
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
      ],
    });

    client.setTokenSet({
      access_token: accessToken,
      token_type: 'Bearer',
    });

    return { client, xeroTenantId };
  }

  /**
   * Map CrecheBooks VatType to Xero tax type
   */
  mapVatToXeroTax(vatType: string): string {
    return VAT_TO_XERO_TAX[vatType] ?? 'NONE';
  }

  /**
   * Map Xero tax type to CrecheBooks VatType
   */
  mapXeroTaxToVat(xeroTaxType: string): string {
    return XERO_TAX_TO_VAT[xeroTaxType] ?? 'NO_VAT';
  }

  /**
   * Create invoice in Xero as DRAFT via MCP
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param invoiceNumber - Invoice number
   * @param dueDate - Invoice due date
   * @param xeroContactId - Xero contact ID for the parent
   * @param lineItems - Array of line items
   * @returns Xero invoice ID or null if sync failed
   * @throws BusinessException if no valid Xero connection
   */
  async createInvoiceDraft(
    tenantId: string,
    invoiceNumber: string,
    dueDate: Date,
    xeroContactId: string,
    lineItems: Array<{
      description: string;
      quantity: number;
      unitAmount: number;
      accountCode: string;
      taxType: 'OUTPUT' | 'NONE';
    }>,
  ): Promise<string | null> {
    this.logger.log(
      `Creating Xero invoice draft ${invoiceNumber} for tenant ${tenantId}`,
    );

    try {
      // Get authenticated client
      const { client, xeroTenantId } =
        await this.getAuthenticatedClient(tenantId);

      // Format due date for Xero API
      const formattedDueDate = format(dueDate, 'yyyy-MM-dd');

      // Create invoice via Xero API
      const response = await client.accountingApi.createInvoices(xeroTenantId, {
        invoices: [
          {
            type: XeroInvoice.TypeEnum.ACCREC, // Accounts Receivable
            contact: { contactID: xeroContactId },
            invoiceNumber,
            dueDate: formattedDueDate,
            status: XeroInvoice.StatusEnum.DRAFT,
            lineItems: lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitAmount: item.unitAmount,
              accountCode: item.accountCode,
              taxType: item.taxType,
            })),
          },
        ],
      });

      const createdInvoice = response.body.invoices?.[0];
      if (createdInvoice?.invoiceID) {
        this.logger.log(
          `Created Xero invoice ${createdInvoice.invoiceID} for ${invoiceNumber}`,
        );

        // Log audit trail
        await this.auditLogService.logAction({
          tenantId,
          entityType: 'Invoice',
          entityId: invoiceNumber,
          action: AuditAction.CREATE,
          afterValue: {
            xeroInvoiceId: createdInvoice.invoiceID,
            xeroStatus: createdInvoice.status,
            syncedAt: new Date().toISOString(),
            syncType: 'XERO_INVOICE_SYNC',
          },
          changeSummary: `Created invoice draft in Xero: ${createdInvoice.invoiceID}`,
        });

        return createdInvoice.invoiceID;
      }

      this.logger.warn(
        `Xero invoice creation returned no invoiceID for ${invoiceNumber}`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to create Xero invoice for ${invoiceNumber}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - allow local invoice to exist without Xero sync
      return null;
    }
  }

  /**
   * Sync payment to Xero
   * TASK-XERO-003: Payment sync to Xero
   * Creates a payment record in Xero linked to the invoice
   *
   * @param payment - Payment record from CrecheBooks
   * @param invoice - Invoice being paid
   * @param parent - Parent who made the payment
   * @returns Xero payment ID or null if sync failed
   * @throws BusinessException if no valid Xero connection
   */
  async syncPayment(
    payment: Payment,
    invoice: Invoice,
    parent: Parent,
  ): Promise<string | null> {
    this.logger.log(
      `Syncing payment ${payment.id} to Xero for invoice ${invoice.invoiceNumber}`,
    );

    // FAIL FAST: Check if invoice has been synced to Xero
    if (!invoice.xeroInvoiceId) {
      this.logger.warn(
        `FAIL FAST: Cannot sync payment - Invoice ${invoice.id} not synced to Xero (no xeroInvoiceId)`,
      );
      return null;
    }

    // Check Xero connection
    const hasConnection = await this.hasValidConnection(payment.tenantId);
    if (!hasConnection) {
      this.logger.warn(
        `Cannot sync payment: Tenant ${payment.tenantId} not connected to Xero`,
      );
      return null;
    }

    try {
      // Get authenticated client
      const { client, xeroTenantId } = await this.getAuthenticatedClient(
        payment.tenantId,
      );

      // Format payment date for Xero API
      const formattedDate = format(payment.paymentDate, 'yyyy-MM-dd');

      // Get payment account code (default to bank account 090)
      const accountCode = this.getPaymentAccountCode(payment);

      // Create payment via Xero API
      const response = await client.accountingApi.createPayment(xeroTenantId, {
        invoice: { invoiceID: invoice.xeroInvoiceId },
        account: { code: accountCode },
        date: formattedDate,
        amount: payment.amountCents / 100, // Convert cents to rands
        reference: payment.reference || `CrecheBooks Payment ${payment.id}`,
      });

      // response.body is of type Payments which has a payments array
      const createdPayment = response.body.payments?.[0];
      const xeroPaymentId = createdPayment?.paymentID;

      if (xeroPaymentId) {
        // Update payment with Xero ID
        await this.paymentRepo.update(payment.id, { xeroPaymentId });

        // Log audit trail
        await this.auditLogService.logAction({
          tenantId: payment.tenantId,
          entityType: 'Payment',
          entityId: payment.id,
          action: AuditAction.UPDATE,
          afterValue: {
            xeroPaymentId,
            xeroInvoiceId: invoice.xeroInvoiceId,
            syncedAt: new Date().toISOString(),
            syncType: 'XERO_PAYMENT_SYNC',
          },
          changeSummary: `Payment synced to Xero: ${xeroPaymentId}`,
        });

        this.logger.log(
          `Payment ${payment.id} synced to Xero successfully: ${xeroPaymentId}`,
        );
        return xeroPaymentId;
      }

      this.logger.warn(
        `Xero payment creation returned no paymentID for payment ${payment.id}`,
      );
      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to sync payment ${payment.id} to Xero: ${errorMessage}`,
        errorStack,
      );

      // Log audit trail for failure
      await this.auditLogService.logAction({
        tenantId: payment.tenantId,
        entityType: 'Payment',
        entityId: payment.id,
        action: AuditAction.UPDATE,
        afterValue: {
          syncError: errorMessage,
          syncType: 'XERO_PAYMENT_SYNC_FAILED',
          attemptedAt: new Date().toISOString(),
        },
        changeSummary: `Payment Xero sync failed: ${errorMessage}`,
      });

      // FAIL FAST: Don't swallow errors silently
      // Return null but ensure error is logged for debugging
      return null;
    }
  }

  /**
   * Get appropriate Xero account code for payment
   * @param payment - Payment record
   * @returns Xero account code (default bank account)
   */
  private getPaymentAccountCode(payment: Payment): string {
    // Standard bank account code for payments
    // In production, this could be configurable per tenant
    return '090';
  }

  /**
   * Create a Xero contact for a parent
   * TASK-XERO-004: Auto-sync parents to Xero as contacts
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param parent - Parent record from CrecheBooks
   * @returns Xero contact ID or null if sync failed
   */
  async createContactForParent(
    tenantId: string,
    parent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
    },
  ): Promise<string | null> {
    this.logger.log(
      `Creating Xero contact for parent ${parent.id} (${parent.firstName} ${parent.lastName})`,
    );

    // Check Xero connection
    const hasConnection = await this.hasValidConnection(tenantId);
    if (!hasConnection) {
      this.logger.warn(
        `Cannot sync parent: Tenant ${tenantId} not connected to Xero`,
      );
      return null;
    }

    try {
      // Get authenticated client
      const { client, xeroTenantId } =
        await this.getAuthenticatedClient(tenantId);

      // Import createContact tool
      const { createContact } =
        await import('../../mcp/xero-mcp/tools/index.js');

      // Create contact via Xero API
      const contactName = `${parent.firstName} ${parent.lastName}`;
      const result = await createContact(client, xeroTenantId, {
        name: contactName,
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email ?? undefined,
        phone: parent.phone ?? undefined,
        isCustomer: true,
        isSupplier: false,
      });

      if (result?.contactId) {
        // Update parent with Xero contact ID
        await this.prisma.parent.update({
          where: { id: parent.id },
          data: { xeroContactId: result.contactId },
        });

        // Log audit trail
        await this.auditLogService.logAction({
          tenantId,
          entityType: 'Parent',
          entityId: parent.id,
          action: AuditAction.UPDATE,
          afterValue: {
            xeroContactId: result.contactId,
            syncedAt: new Date().toISOString(),
            syncType: 'XERO_CONTACT_SYNC',
          },
          changeSummary: `Parent synced to Xero as contact: ${result.contactId}`,
        });

        this.logger.log(
          `Parent ${parent.id} synced to Xero contact: ${result.contactId}`,
        );
        return result.contactId;
      }

      this.logger.warn(
        `Xero contact creation returned no contactId for parent ${parent.id}`,
      );
      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to sync parent ${parent.id} to Xero: ${errorMessage}`,
        errorStack,
      );

      // Don't throw - allow local parent to exist without Xero sync
      return null;
    }
  }

  /**
   * Sync Chart of Accounts from Xero to local database
   * TASK-XERO-006: Store Xero accounts locally for validation
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param forceSync - Force sync even if recently synced
   * @returns Sync result with counts
   */
  async syncChartOfAccountsToDb(
    tenantId: string,
    forceSync = false,
  ): Promise<CoaSyncResult> {
    this.logger.log(
      `Syncing Chart of Accounts to database for tenant ${tenantId}`,
    );

    const result: CoaSyncResult = {
      accountsFetched: 0,
      accountsCreated: 0,
      accountsUpdated: 0,
      accountsArchived: 0,
      errors: [],
      syncedAt: new Date(),
    };

    // Check last sync time (skip if synced within last hour unless forced)
    if (!forceSync) {
      const lastSync = await this.xeroAccountRepo.getLastSyncTime(tenantId);
      if (lastSync) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (lastSync > hourAgo) {
          this.logger.debug(
            `Chart of Accounts synced recently (${lastSync.toISOString()}), skipping`,
          );
          return {
            ...result,
            errors: ['Skipped: Recently synced. Use forceSync to override.'],
          };
        }
      }
    }

    // Get authenticated client
    const { client, xeroTenantId } =
      await this.getAuthenticatedClient(tenantId);

    // Fetch accounts from Xero
    const accounts = await getAccounts(client, xeroTenantId);
    result.accountsFetched = accounts.length;

    this.logger.log(`Fetched ${accounts.length} accounts from Xero`);

    // Track active account codes for archiving stale ones
    const activeCodes: string[] = [];

    // Upsert each account
    for (const xeroAccount of accounts) {
      try {
        // Skip accounts without required fields
        if (!xeroAccount.code || !xeroAccount.name) {
          this.logger.debug(
            `Skipping account without code or name: ${JSON.stringify(xeroAccount)}`,
          );
          continue;
        }

        activeCodes.push(xeroAccount.code);

        const { account, isNew } = await this.xeroAccountRepo.upsert({
          tenantId,
          accountCode: xeroAccount.code,
          name: xeroAccount.name,
          type: xeroAccount.type ?? 'UNKNOWN',
          taxType: xeroAccount.taxType ?? undefined,
          status:
            xeroAccount.status === 'ARCHIVED'
              ? XeroAccountStatus.ARCHIVED
              : XeroAccountStatus.ACTIVE,
          xeroAccountId: xeroAccount.accountId,
        });

        if (isNew) {
          result.accountsCreated++;
        } else {
          result.accountsUpdated++;
        }
      } catch (error) {
        const errorMsg = `Failed to sync account ${xeroAccount.code}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        result.errors.push(errorMsg);
        this.logger.error(errorMsg);
      }
    }

    // Archive accounts that are no longer in Xero
    if (activeCodes.length > 0) {
      result.accountsArchived = await this.xeroAccountRepo.archiveNotInCodes(
        tenantId,
        activeCodes,
      );
    }

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'ChartOfAccounts',
      entityId: 'SYNC_TO_DB',
      action: AuditAction.UPDATE,
      afterValue: {
        accountsFetched: result.accountsFetched,
        accountsCreated: result.accountsCreated,
        accountsUpdated: result.accountsUpdated,
        accountsArchived: result.accountsArchived,
        syncedAt: result.syncedAt.toISOString(),
        syncType: 'XERO_COA_DB_SYNC',
      },
      changeSummary: `Synced ${result.accountsFetched} accounts from Xero: ${result.accountsCreated} created, ${result.accountsUpdated} updated, ${result.accountsArchived} archived`,
    });

    this.logger.log(
      `Chart of Accounts sync complete: ${result.accountsCreated} created, ${result.accountsUpdated} updated, ${result.accountsArchived} archived`,
    );

    return result;
  }

  /**
   * Validate an account code exists and is active in the local database
   * TASK-XERO-006: Validate before pushing categorizations
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param accountCode - Account code to validate
   * @returns Validation result with account details or error
   */
  async validateAccountCode(
    tenantId: string,
    accountCode: string,
  ): Promise<AccountValidationResult> {
    this.logger.debug(
      `Validating account code ${accountCode} for tenant ${tenantId}`,
    );

    return this.xeroAccountRepo.validateAccountCode(tenantId, accountCode);
  }

  /**
   * Get all synced accounts for a tenant
   * TASK-XERO-006: List accounts from local database
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param options - Filter options
   * @returns List of accounts with total count
   */
  async getSyncedAccounts(
    tenantId: string,
    options?: {
      status?: XeroAccountStatus;
      type?: string;
      codePrefix?: string;
      nameSearch?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    accounts: Array<{
      id: string;
      accountCode: string;
      name: string;
      type: string;
      taxType: string | null;
      status: XeroAccountStatus;
    }>;
    total: number;
    lastSyncedAt: Date | null;
  }> {
    const { accounts, total } = await this.xeroAccountRepo.findByTenant(
      tenantId,
      options,
    );

    const lastSyncedAt = await this.xeroAccountRepo.getLastSyncTime(tenantId);

    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        accountCode: a.accountCode,
        name: a.name,
        type: a.type,
        taxType: a.taxType,
        status: a.status,
      })),
      total,
      lastSyncedAt,
    };
  }

  /**
   * Check if an error indicates the transaction is reconciled in Xero
   * TASK-XERO-007: Detect reconciled transaction errors
   */
  isReconciledTransactionError(error: unknown): boolean {
    // Check error message directly
    if (error instanceof Error) {
      if (error.message.includes(RECONCILED_TRANSACTION_ERROR)) {
        return true;
      }
    }

    // Check string errors
    if (typeof error === 'string') {
      if (error.includes(RECONCILED_TRANSACTION_ERROR)) {
        return true;
      }
    }

    // Check for XeroMCPError or errors with details/originalError
    const errorWithDetails = error as {
      details?: { originalError?: string };
      originalError?: string;
    };
    if (errorWithDetails?.details?.originalError) {
      if (errorWithDetails.details.originalError.includes(RECONCILED_TRANSACTION_ERROR)) {
        return true;
      }
    }
    if (errorWithDetails?.originalError) {
      if (errorWithDetails.originalError.includes(RECONCILED_TRANSACTION_ERROR)) {
        return true;
      }
    }

    // Last resort: stringify and check
    try {
      const errorString = JSON.stringify(error);
      if (errorString.includes(RECONCILED_TRANSACTION_ERROR)) {
        return true;
      }
    } catch {
      // JSON.stringify failed, try toString
      const errorStr = String(error);
      if (errorStr.includes(RECONCILED_TRANSACTION_ERROR)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a categorization journal for a reconciled transaction
   * TASK-XERO-007: Journal Entry Approach for Categorization Sync
   *
   * When a transaction is reconciled in Xero (can't be edited), this creates
   * a manual journal to move the amount from suspense to the correct account.
   *
   * @param transactionId - Transaction ID that was categorized
   * @param tenantId - Tenant ID for isolation
   * @param toAccountCode - Target expense account from categorization
   * @returns Result with journal ID and Xero sync status
   */
  async createCategorizationJournal(
    transactionId: string,
    tenantId: string,
    toAccountCode: string,
  ): Promise<{
    journalId: string;
    xeroJournalId: string | null;
    posted: boolean;
    error?: string;
  }> {
    this.logger.log(
      `Creating categorization journal for transaction ${transactionId} to account ${toAccountCode}`,
    );

    // Load transaction
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // Check if journal already exists for this transaction
    const existingJournal =
      await this.categorizationJournalRepo.findByTransactionId(transactionId);
    if (existingJournal) {
      this.logger.warn(
        `Categorization journal already exists for transaction ${transactionId}`,
      );

      // If already posted, return success
      if (existingJournal.status === CategorizationJournalStatus.POSTED) {
        return {
          journalId: existingJournal.id,
          xeroJournalId: existingJournal.xeroJournalId,
          posted: true,
        };
      }

      // If pending or failed, try to post it
      return this.postCategorizationJournal(existingJournal.id, tenantId);
    }

    // Create narration for the journal
    const narration = `Categorization: ${transaction.description} - ${transaction.payeeName || 'N/A'} moved from Suspense (${SUSPENSE_ACCOUNT_CODE}) to ${toAccountCode}`;

    // Create journal record
    const journal = await this.categorizationJournalRepo.create({
      tenantId,
      transactionId,
      fromAccountCode: SUSPENSE_ACCOUNT_CODE,
      toAccountCode,
      amountCents: transaction.amountCents,
      isCredit: transaction.isCredit,
      narration,
    });

    this.logger.log(
      `Created categorization journal ${journal.id} for transaction ${transactionId}`,
    );

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'CategorizationJournal',
      entityId: journal.id,
      action: AuditAction.CREATE,
      afterValue: {
        transactionId,
        fromAccountCode: SUSPENSE_ACCOUNT_CODE,
        toAccountCode,
        amountCents: transaction.amountCents,
        narration,
      },
      changeSummary: `Created categorization journal for reconciled transaction`,
    });

    // Attempt to post to Xero
    return this.postCategorizationJournal(journal.id, tenantId);
  }

  /**
   * Post a categorization journal to Xero
   * TASK-XERO-007: Post manual journal for categorization
   *
   * @param journalId - Categorization journal ID
   * @param tenantId - Tenant ID for isolation
   * @returns Result with Xero journal ID and status
   */
  async postCategorizationJournal(
    journalId: string,
    tenantId: string,
  ): Promise<{
    journalId: string;
    xeroJournalId: string | null;
    posted: boolean;
    error?: string;
  }> {
    const journal = await this.categorizationJournalRepo.findById(journalId);
    if (!journal) {
      throw new NotFoundException('CategorizationJournal', journalId);
    }

    if (journal.tenantId !== tenantId) {
      throw new NotFoundException('CategorizationJournal', journalId);
    }

    // Skip if already posted
    if (journal.status === CategorizationJournalStatus.POSTED) {
      return {
        journalId,
        xeroJournalId: journal.xeroJournalId,
        posted: true,
      };
    }

    try {
      // Get authenticated client
      const { client, xeroTenantId } =
        await this.getAuthenticatedClient(tenantId);

      // Build journal lines
      // For expenses (debits in bank): Debit expense, Credit suspense
      // For income (credits in bank): Debit suspense, Credit income
      const journalLines = this.buildCategorizationJournalLines(journal);

      // Apply rate limiting
      await this.rateLimiter.acquire();

      // Create manual journal in Xero
      const manualJournal: ManualJournal = {
        narration: journal.narration,
        date: new Date().toISOString().split('T')[0],
        status: ManualJournal.StatusEnum.POSTED,
        lineAmountTypes: LineAmountTypes.NoTax,
        journalLines,
      };

      const response = await client.accountingApi.createManualJournals(
        xeroTenantId,
        { manualJournals: [manualJournal] },
      );

      const createdJournal = response.body.manualJournals?.[0];
      if (!createdJournal?.manualJournalID) {
        throw new Error('Xero API returned no journal ID');
      }

      const xeroJournalId = createdJournal.manualJournalID;
      const journalNumber = xeroJournalId.substring(0, 8).toUpperCase();

      // Mark as posted
      await this.categorizationJournalRepo.markAsPosted(
        journalId,
        xeroJournalId,
        journalNumber,
      );

      // Log audit trail
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'CategorizationJournal',
        entityId: journalId,
        action: AuditAction.UPDATE,
        afterValue: {
          status: 'POSTED',
          xeroJournalId,
          journalNumber,
          postedAt: new Date().toISOString(),
        },
        changeSummary: `Posted categorization journal to Xero: ${journalNumber}`,
      });

      this.logger.log(
        `Posted categorization journal ${journalId} to Xero: ${xeroJournalId}`,
      );

      return {
        journalId,
        xeroJournalId,
        posted: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to post categorization journal ${journalId} to Xero: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Mark as failed
      await this.categorizationJournalRepo.markAsFailed(journalId, errorMessage);

      // Log audit trail
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'CategorizationJournal',
        entityId: journalId,
        action: AuditAction.UPDATE,
        afterValue: {
          status: 'FAILED',
          errorMessage,
          attemptedAt: new Date().toISOString(),
        },
        changeSummary: `Categorization journal Xero post failed: ${errorMessage}`,
      });

      return {
        journalId,
        xeroJournalId: null,
        posted: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build journal lines for a categorization journal
   * TASK-XERO-007: Journal lines for moving from suspense to correct account
   *
   * For bank debits (expenses):
   * - Debit: Target expense account
   * - Credit: Suspense account (9999)
   *
   * For bank credits (income):
   * - Debit: Suspense account (9999)
   * - Credit: Target income account
   */
  private buildCategorizationJournalLines(
    journal: {
      fromAccountCode: string;
      toAccountCode: string;
      amountCents: number;
      isCredit: boolean;
    },
  ): Array<{
    lineAmount: number;
    accountCode: string;
    description: string;
  }> {
    const amount = journal.amountCents / 100; // Convert cents to dollars/rands

    if (journal.isCredit) {
      // Bank credit (income received): Move from suspense to income
      return [
        {
          lineAmount: amount, // Debit (positive)
          accountCode: journal.fromAccountCode, // Suspense
          description: 'Reclass from Suspense',
        },
        {
          lineAmount: -amount, // Credit (negative)
          accountCode: journal.toAccountCode, // Income account
          description: 'Categorized income',
        },
      ];
    } else {
      // Bank debit (expense paid): Move from suspense to expense
      return [
        {
          lineAmount: amount, // Debit (positive)
          accountCode: journal.toAccountCode, // Expense account
          description: 'Categorized expense',
        },
        {
          lineAmount: -amount, // Credit (negative)
          accountCode: journal.fromAccountCode, // Suspense
          description: 'Reclass from Suspense',
        },
      ];
    }
  }

  /**
   * Sleep utility for rate limit backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
