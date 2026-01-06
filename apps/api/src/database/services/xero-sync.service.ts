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
import { XeroClient, Invoice as XeroInvoice, Payment as XeroPaymentModel } from 'xero-node';
import { Payment, Invoice, Parent } from '@prisma/client';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { PaymentRepository } from '../repositories/payment.repository';
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
import { NotFoundException, BusinessException } from '../../shared/exceptions';

// Import Xero MCP tools
import {
  getAccounts,
  getTransactions,
  updateTransaction,
} from '../../mcp/xero-mcp/tools';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';

@Injectable()
export class XeroSyncService {
  private readonly logger = new Logger(XeroSyncService.name);
  private tokenManager: TokenManager;

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly auditLogService: AuditLogService,
    private readonly conflictDetection: ConflictDetectionService,
    private readonly conflictResolution: ConflictResolutionService,
    private readonly prisma: PrismaService,
  ) {
    // Pass PrismaService (extends PrismaClient) to TokenManager
    this.tokenManager = new TokenManager(this.prisma);
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
}
