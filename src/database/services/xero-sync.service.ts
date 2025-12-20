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
import { XeroClient } from 'xero-node';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { AuditLogService } from './audit-log.service';
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
    private readonly auditLogService: AuditLogService,
  ) {
    this.tokenManager = new TokenManager();
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
}
