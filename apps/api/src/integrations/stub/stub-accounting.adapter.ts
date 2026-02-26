/**
 * Stub.africa Accounting Adapter -- AccountingProvider for Stub Connect API.
 * Push-only invoices, async webhook pulls, API key auth, amounts in Rands externally.
 * Per-tenant credentials stored in `stub_connections` (raw SQL, no migration).
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EncryptionService } from '../../shared/services/encryption.service';
import { BusinessException } from '../../shared/exceptions';
import type { AccountingProvider } from '../accounting/interfaces';
import type {
  AccountingAccount, BankSyncOptions, BankSyncResult,
  BulkContactSyncResult, BulkInvoiceSyncResult, ConnectionStatus,
  ContactSyncResult, InvoicePullFilters, InvoiceSyncResult,
  JournalEntry, JournalPostResult, PaymentSyncResult,
  ProviderCapabilities, PulledInvoicesResult, PulledPaymentsResult,
  PushInvoiceOptions, SyncOptions, SyncResult, SyncItemError,
} from '../accounting/interfaces/accounting-types';
import { StubApiClient } from './stub-api.client';
import type { StubTransactionPayload } from './stub.types';

interface StubConnectionRow {
  tenant_id: string;
  encrypted_api_key: string;
  encrypted_app_id: string | null;
  stub_business_uid: string | null;
  is_active: boolean;
  connected_at: Date;
  last_sync_at: Date | null;
  last_sync_status: string | null;
  error_message: string | null;
}

@Injectable()
export class StubAccountingAdapter implements AccountingProvider, OnModuleInit {
  private readonly logger = new Logger(StubAccountingAdapter.name);
  private tableEnsured = false;

  readonly providerName = 'stub';
  readonly supportsBankFeeds = true;
  readonly supportsJournals = false;
  readonly capabilities: ProviderCapabilities = {
    bankFeeds: true,
    journals: false,
    bulkInvoicePush: true,
    invoicePull: false,
    chartOfAccounts: false,
    syncOrchestration: false,
  };

  constructor(
    private readonly stubClient: StubApiClient,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureConnectionTable();
  }

  // -- Auth / Connection ------------------------------------------------------

  /** Stub uses API key auth. Returns a settings page URL for key entry. */
  async getAuthUrl(
    tenantId: string,
    returnUrl: string,
  ): Promise<{ authUrl: string }> {
    this.logger.log(`Stub uses API key auth -- tenant ${tenantId}`);
    const authUrl = `/settings/integrations/stub?returnUrl=${encodeURIComponent(returnUrl)}`;
    return { authUrl };
  }

  /**
   * Verify and store a Stub API key.
   * `code` carries the API key; `state` carries the Stub App ID.
   */
  async handleCallback(tenantId: string, code: string, state: string): Promise<void> {
    this.logger.log(`Verifying Stub API key for tenant ${tenantId}`);
    const isValid = await this.stubClient.verifyApiKey();
    if (!isValid) {
      throw new BusinessException(
        'The provided Stub API key is invalid.',
        'STUB_INVALID_API_KEY', { tenantId },
      );
    }

    const encryptedKey = this.encryption.encrypt(code);
    const encryptedAppId = state ? this.encryption.encrypt(state) : null;
    await this.ensureConnectionTable();

    await this.prisma.$executeRaw`
      INSERT INTO stub_connections (tenant_id, encrypted_api_key, encrypted_app_id, is_active, connected_at)
      VALUES (${tenantId}, ${encryptedKey}, ${encryptedAppId}, true, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        encrypted_api_key = ${encryptedKey},
        encrypted_app_id = ${encryptedAppId},
        is_active = true, connected_at = NOW(), error_message = NULL
    `;
    this.logger.log(`Stub API key stored for tenant ${tenantId}`);
  }

  /** Check whether the tenant has a valid Stub connection. */
  async getConnectionStatus(tenantId: string): Promise<ConnectionStatus> {
    await this.ensureConnectionTable();
    const rows = await this.prisma.$queryRaw<StubConnectionRow[]>`
      SELECT * FROM stub_connections WHERE tenant_id = ${tenantId} LIMIT 1
    `;
    if (rows.length === 0 || !rows[0].is_active) {
      return { isConnected: false, providerName: 'stub' };
    }
    const row = rows[0];
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }, select: { name: true },
    });
    return {
      isConnected: true,
      providerName: 'stub',
      organizationName: tenant?.name ?? undefined,
      connectedAt: row.connected_at ?? undefined,
      lastSyncAt: row.last_sync_at ?? undefined,
      lastSyncStatus: (row.last_sync_status as ConnectionStatus['lastSyncStatus']) ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
  }

  /** Disconnect by deactivating stored credentials. */
  async disconnect(tenantId: string): Promise<void> {
    this.logger.log(`Disconnecting Stub for tenant ${tenantId}`);
    await this.ensureConnectionTable();
    await this.prisma.$executeRaw`
      UPDATE stub_connections
      SET is_active = false, encrypted_api_key = '', encrypted_app_id = NULL
      WHERE tenant_id = ${tenantId}
    `;
  }

  // -- Invoices ---------------------------------------------------------------

  /** Push a single invoice to Stub as an income transaction. */
  async pushInvoice(
    tenantId: string, invoiceId: string, _options?: PushInvoiceOptions,
  ): Promise<InvoiceSyncResult> {
    this.logger.log(`Pushing invoice ${invoiceId} to Stub for tenant ${tenantId}`);
    const token = await this.getStubToken(tenantId);

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        parent: { select: { firstName: true, lastName: true, email: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) {
      throw new BusinessException(
        `Invoice ${invoiceId} not found`, 'INVOICE_NOT_FOUND', { invoiceId, tenantId },
      );
    }

    const tx = this.invoiceToStubTransaction(invoice);
    await this.stubClient.pushIncome(token, tx);
    await this.updateSyncStatus(tenantId, 'success');

    return {
      invoiceId,
      externalInvoiceId: tx.id,
      externalInvoiceNumber: invoice.invoiceNumber,
      externalStatus: 'PUSHED',
      syncedAt: new Date(),
    };
  }

  /** Push multiple invoices via /api/push/many. */
  async pushInvoicesBulk(
    tenantId: string, invoiceIds: string[], _options?: PushInvoiceOptions,
  ): Promise<BulkInvoiceSyncResult> {
    this.logger.log(`Bulk pushing ${invoiceIds.length} invoices for tenant ${tenantId}`);
    const token = await this.getStubToken(tenantId);

    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, tenantId },
      include: {
        parent: { select: { firstName: true, lastName: true, email: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });

    const foundIds = new Set(invoices.map((i) => i.id));
    const results: InvoiceSyncResult[] = [];
    const errors: SyncItemError[] = [];

    for (const id of invoiceIds) {
      if (!foundIds.has(id)) {
        errors.push({ entityId: id, error: `Invoice ${id} not found`, code: 'INVOICE_NOT_FOUND' });
      }
    }

    const transactions: StubTransactionPayload[] = [];
    for (const inv of invoices) {
      try {
        transactions.push(this.invoiceToStubTransaction(inv));
      } catch (err) {
        errors.push({
          entityId: inv.id,
          error: err instanceof Error ? err.message : 'Conversion failed',
          code: 'CONVERSION_ERROR',
        });
      }
    }

    if (transactions.length > 0) {
      try {
        await this.stubClient.pushMany(token, { income: transactions, expenses: [] });
        const now = new Date();
        for (const tx of transactions) {
          const inv = invoices.find((i) => `cb-inv-${i.id}` === tx.id);
          results.push({
            invoiceId: inv?.id ?? tx.id,
            externalInvoiceId: tx.id,
            externalInvoiceNumber: inv?.invoiceNumber,
            externalStatus: 'PUSHED',
            syncedAt: now,
          });
        }
        await this.updateSyncStatus(tenantId, 'success');
      } catch (err) {
        for (const tx of transactions) {
          errors.push({
            entityId: tx.id,
            error: err instanceof Error ? err.message : 'Batch push failed',
            code: 'STUB_PUSH_FAILED',
          });
        }
        await this.updateSyncStatus(tenantId, 'failed',
          err instanceof Error ? err.message : 'Batch push failed');
      }
    }

    return { pushed: results.length, failed: errors.length, skipped: 0, results, errors };
  }

  /** Not supported -- Stub uses async webhook-based pulls. */
  async pullInvoices(_tenantId: string, _filters?: InvoicePullFilters): Promise<PulledInvoicesResult> {
    throw new BusinessException(
      'Stub.africa does not support synchronous invoice pulling.',
      'CAPABILITY_NOT_SUPPORTED', { provider: 'stub', capability: 'invoicePull' },
    );
  }

  // -- Contacts ---------------------------------------------------------------

  /** Stub has no contacts API. Returns a local mapping. */
  async syncContact(tenantId: string, parentId: string): Promise<ContactSyncResult> {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!parent) {
      throw new BusinessException(
        `Parent ${parentId} not found`, 'PARENT_NOT_FOUND', { parentId, tenantId },
      );
    }
    return {
      parentId,
      externalContactId: `stub-contact-${parentId}`,
      externalContactName: `${parent.firstName} ${parent.lastName}`,
      wasCreated: false,
      syncedAt: new Date(),
    };
  }

  /** Bulk contact sync -- local mappings only. */
  async syncContactsBulk(tenantId: string, parentIds: string[]): Promise<BulkContactSyncResult> {
    const results: ContactSyncResult[] = [];
    const errors: SyncItemError[] = [];
    for (const parentId of parentIds) {
      try {
        results.push(await this.syncContact(tenantId, parentId));
      } catch (err) {
        errors.push({
          entityId: parentId,
          error: err instanceof Error ? err.message : 'Contact sync failed',
          code: err instanceof BusinessException ? err.code : 'CONTACT_SYNC_ERROR',
        });
      }
    }
    return { synced: results.length, failed: errors.length, skipped: 0, results, errors };
  }

  // -- Payments ---------------------------------------------------------------

  /** Push payment as income to Stub (no payment allocation API). */
  async syncPayment(tenantId: string, paymentId: string, invoiceRef: string): Promise<PaymentSyncResult> {
    this.logger.log(`Syncing payment ${paymentId} to Stub for tenant ${tenantId}`);
    const token = await this.getStubToken(tenantId);

    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId } });
    if (!payment) {
      throw new BusinessException(
        `Payment ${paymentId} not found`, 'PAYMENT_NOT_FOUND', { paymentId, tenantId },
      );
    }

    const tx: StubTransactionPayload = {
      id: `cb-pmt-${paymentId}`,
      date: payment.paymentDate.toISOString().split('T')[0],
      name: `Payment received - Invoice ${invoiceRef}`,
      notes: payment.reference ?? undefined,
      currency: 'ZAR',
      amount: this.centsToRands(payment.amountCents),
    };
    await this.stubClient.pushIncome(token, tx);

    return {
      paymentId,
      externalPaymentId: tx.id,
      externalInvoiceId: invoiceRef,
      amountCents: payment.amountCents,
      syncedAt: new Date(),
    };
  }

  /** Not supported -- Stub uses async webhook-based pulls. */
  async pullPayments(_tenantId: string, _invoiceRef: string): Promise<PulledPaymentsResult> {
    throw new BusinessException(
      'Stub.africa does not support synchronous payment pulling.',
      'CAPABILITY_NOT_SUPPORTED', { provider: 'stub', capability: 'paymentPull' },
    );
  }

  // -- Bank Feeds -------------------------------------------------------------

  /** Initiate bank feed sync. Results arrive via webhook. */
  async syncBankTransactions(tenantId: string, _options?: BankSyncOptions): Promise<BankSyncResult> {
    this.logger.log(`Initiating Stub bank feed sync for tenant ${tenantId}`);
    const token = await this.getStubToken(tenantId);
    await this.stubClient.pullBankFeed(token);
    return { transactionsImported: 0, transactionsUpdated: 0, errors: [] };
  }

  // -- Journals (not supported) -----------------------------------------------

  async postJournal(_tenantId: string, _journal: JournalEntry): Promise<JournalPostResult> {
    throw new BusinessException(
      'Stub.africa does not support journal posting.',
      'CAPABILITY_NOT_SUPPORTED', { provider: 'stub', capability: 'journals' },
    );
  }

  // -- Chart of Accounts ------------------------------------------------------

  /** Stub has no chart of accounts API. */
  async getAccounts(_tenantId: string): Promise<AccountingAccount[]> {
    return [];
  }

  // -- Sync Orchestration -----------------------------------------------------

  /** Push-only sync: pushes all unsynced invoices as income. */
  async sync(tenantId: string, options: SyncOptions): Promise<SyncResult> {
    this.logger.log(`Stub sync for tenant ${tenantId}: ${options.direction}`);

    if (options.direction === 'pull' || options.direction === 'bidirectional') {
      throw new BusinessException(
        'Stub.africa only supports push-based sync.',
        'CAPABILITY_NOT_SUPPORTED',
        { provider: 'stub', capability: 'syncOrchestration', direction: options.direction },
      );
    }

    const jobId = `stub-sync-${tenantId}-${Date.now()}`;
    const errors: SyncItemError[] = [];
    const entitiesSynced: Record<string, number> = {};
    const entities = options.entities ?? ['invoices', 'contacts', 'payments'];

    if (entities.includes('invoices')) {
      try {
        const unsynced = await this.findUnsyncedInvoices(tenantId, options.fromDate);
        if (unsynced.length > 0) {
          const result = await this.pushInvoicesBulk(tenantId, unsynced.map((i) => i.id));
          entitiesSynced['invoices'] = result.pushed;
          errors.push(...result.errors);
        } else {
          entitiesSynced['invoices'] = 0;
        }
      } catch (err) {
        errors.push({
          entityId: 'invoices',
          error: err instanceof Error ? err.message : 'Invoice sync failed',
          code: 'INVOICE_SYNC_ERROR',
        });
      }
    }
    if (entities.includes('contacts')) entitiesSynced['contacts'] = 0;
    if (entities.includes('payments')) entitiesSynced['payments'] = 0;

    return { jobId, success: errors.length === 0, entitiesSynced, errors, completedAt: new Date() };
  }

  // -- Private: Connection Table ----------------------------------------------

  /** Create stub_connections table if missing (raw SQL, no migration needed). */
  private async ensureConnectionTable(): Promise<void> {
    if (this.tableEnsured) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS stub_connections (
        tenant_id         VARCHAR(50) PRIMARY KEY REFERENCES tenants(id),
        encrypted_api_key TEXT        NOT NULL DEFAULT '',
        encrypted_app_id  TEXT,
        stub_business_uid VARCHAR(100),
        is_active         BOOLEAN     NOT NULL DEFAULT false,
        connected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_sync_at      TIMESTAMPTZ,
        last_sync_status  VARCHAR(20),
        error_message     TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.tableEnsured = true;
  }

  // -- Private: Credential Access ---------------------------------------------

  /** Decrypt and return the Stub API key for a tenant. */
  private async getStubToken(tenantId: string): Promise<string> {
    await this.ensureConnectionTable();
    const rows = await this.prisma.$queryRaw<StubConnectionRow[]>`
      SELECT encrypted_api_key FROM stub_connections
      WHERE tenant_id = ${tenantId} AND is_active = true LIMIT 1
    `;
    if (rows.length === 0 || !rows[0].encrypted_api_key) {
      throw new BusinessException(
        'Stub.africa is not connected for this tenant.',
        'STUB_NOT_CONNECTED', { tenantId },
      );
    }
    return this.encryption.decrypt(rows[0].encrypted_api_key);
  }

  /** Update sync status on the connection row. */
  private async updateSyncStatus(
    tenantId: string, status: string, errorMessage?: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE stub_connections
        SET last_sync_at = NOW(), last_sync_status = ${status},
            error_message = ${errorMessage ?? null}, updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `;
    } catch (err) {
      this.logger.warn(`Failed to update Stub sync status: ${err instanceof Error ? err.message : err}`);
    }
  }

  // -- Private: Data Conversion -----------------------------------------------

  /** Convert a CrecheBooks invoice to a Stub income transaction. */
  private invoiceToStubTransaction(invoice: {
    id: string; invoiceNumber: string; totalCents: number; vatCents: number;
    issueDate: Date;
    parent: { firstName: string; lastName: string; email: string | null };
    lines: Array<{ description: string }>;
  }): StubTransactionPayload {
    const description = invoice.lines.length > 0
      ? invoice.lines.map((l) => l.description).join(', ')
      : `Invoice ${invoice.invoiceNumber}`;
    return {
      id: `cb-inv-${invoice.id}`,
      date: invoice.issueDate.toISOString().split('T')[0],
      name: `${invoice.invoiceNumber} - ${invoice.parent.firstName} ${invoice.parent.lastName}`,
      notes: description,
      currency: 'ZAR',
      amount: this.centsToRands(invoice.totalCents),
      vat: invoice.vatCents > 0 ? this.centsToRands(invoice.vatCents) : undefined,
    };
  }

  /** Convert ZAR cents to Rands using Decimal.js for precision. */
  private centsToRands(cents: number): number {
    return new Decimal(cents).dividedBy(100).toDecimalPlaces(2).toNumber();
  }

  /** Find invoices eligible for pushing to Stub. */
  private async findUnsyncedInvoices(
    tenantId: string, fromDate?: string,
  ): Promise<Array<{ id: string }>> {
    const where: Record<string, unknown> = {
      tenantId, isDeleted: false,
      status: { in: ['SENT', 'OVERDUE', 'PAID', 'PARTIALLY_PAID'] },
    };
    if (fromDate) where['issueDate'] = { gte: new Date(fromDate) };
    return this.prisma.invoice.findMany({
      where, select: { id: true }, orderBy: { issueDate: 'asc' },
    });
  }
}
