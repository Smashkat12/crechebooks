/**
 * Stub.africa Accounting Adapter -- AccountingProvider for Stub Connect API.
 *
 * Push-only invoices, async webhook pulls, body-based API key auth.
 * Per-tenant business UID stored in `stub_connections`.
 * Global API key + App ID from env vars (STUB_API_KEY, STUB_APP_ID).
 * Amounts converted from CrecheBooks cents to Stub Rands.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../database/prisma/prisma.service';
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
import type { StubSalePayload, StubTransactionPayload } from './stub.types';

interface StubConnectionRow {
  tenant_id: string;
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
   * Connect a tenant to Stub.africa.
   *
   * `code` carries the Stub business UID (visible in the Stub dashboard URL).
   * If `code` is 'create', a new business is created in Stub using tenant info.
   */
  async handleCallback(tenantId: string, code: string, _state: string): Promise<void> {
    this.logger.log(`Connecting Stub for tenant ${tenantId}`);

    const isValid = await this.stubClient.verifyApiKey();
    if (!isValid) {
      throw new BusinessException(
        'The configured Stub API credentials are invalid. Check STUB_API_KEY and STUB_APP_ID env vars.',
        'STUB_INVALID_API_KEY', { tenantId },
      );
    }

    let businessUid = code;

    if (!code || code === 'create') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      const resp = await this.stubClient.createBusiness({
        businessname: tenant?.name || 'CrecheBooks Business',
        firstname: 'Admin',
        lastname: 'User',
        email: '',
      });
      businessUid = resp.uid;
      this.logger.log(`Created Stub business for tenant ${tenantId}: uid=${businessUid}`);
    }

    await this.ensureConnectionTable();
    await this.prisma.$executeRaw`
      INSERT INTO stub_connections (tenant_id, stub_business_uid, is_active, connected_at)
      VALUES (${tenantId}, ${businessUid}, true, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        stub_business_uid = ${businessUid},
        is_active = true, connected_at = NOW(), error_message = NULL
    `;
    this.logger.log(`Stub connected for tenant ${tenantId}, uid=${businessUid}`);
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

  /** Disconnect by deactivating stored connection. */
  async disconnect(tenantId: string): Promise<void> {
    this.logger.log(`Disconnecting Stub for tenant ${tenantId}`);
    await this.ensureConnectionTable();
    await this.prisma.$executeRaw`
      UPDATE stub_connections
      SET is_active = false, stub_business_uid = NULL
      WHERE tenant_id = ${tenantId}
    `;
  }

  // -- Invoices ---------------------------------------------------------------

  /** Push a single invoice to Stub as a sale (accounts receivable). */
  async pushInvoice(
    tenantId: string, invoiceId: string, _options?: PushInvoiceOptions,
  ): Promise<InvoiceSyncResult> {
    this.logger.log(`Pushing invoice ${invoiceId} to Stub for tenant ${tenantId}`);
    const uid = await this.getStubUid(tenantId);

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        parent: { select: { id: true, firstName: true, lastName: true, email: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) {
      throw new BusinessException(
        `Invoice ${invoiceId} not found`, 'INVOICE_NOT_FOUND', { invoiceId, tenantId },
      );
    }

    const sale = this.invoiceToStubSale(invoice);
    await this.stubClient.pushSale(uid, sale);
    await this.updateSyncStatus(tenantId, 'success');

    return {
      invoiceId,
      externalInvoiceId: sale.id,
      externalInvoiceNumber: invoice.invoiceNumber,
      externalStatus: 'PUSHED',
      syncedAt: new Date(),
    };
  }

  /** Push multiple invoices as sales individually to Stub. */
  async pushInvoicesBulk(
    tenantId: string, invoiceIds: string[], _options?: PushInvoiceOptions,
  ): Promise<BulkInvoiceSyncResult> {
    this.logger.log(`Bulk pushing ${invoiceIds.length} invoices for tenant ${tenantId}`);
    const uid = await this.getStubUid(tenantId);

    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, tenantId },
      include: {
        parent: { select: { id: true, firstName: true, lastName: true, email: true } },
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

    for (const inv of invoices) {
      try {
        const sale = this.invoiceToStubSale(inv);
        await this.stubClient.pushSale(uid, sale);
        results.push({
          invoiceId: inv.id,
          externalInvoiceId: sale.id,
          externalInvoiceNumber: inv.invoiceNumber,
          externalStatus: 'PUSHED',
          syncedAt: new Date(),
        });
      } catch (err) {
        errors.push({
          entityId: inv.id,
          error: err instanceof Error ? err.message : 'Push failed',
          code: 'STUB_PUSH_FAILED',
        });
      }
    }

    if (results.length > 0) {
      await this.updateSyncStatus(tenantId, 'success');
    } else if (errors.length > 0) {
      await this.updateSyncStatus(tenantId, 'failed', errors[0]?.error);
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
    const uid = await this.getStubUid(tenantId);

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
      category: 'Income',
      notes: payment.reference ?? undefined,
      currency: 'ZAR',
      amount: this.centsToRands(payment.amountCents),
    };
    await this.stubClient.pushIncome(uid, tx);

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
    const uid = await this.getStubUid(tenantId);
    await this.stubClient.pullBankFeed(uid);
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

  /** Get the Stub business UID for a tenant. */
  private async getStubUid(tenantId: string): Promise<string> {
    await this.ensureConnectionTable();
    const rows = await this.prisma.$queryRaw<StubConnectionRow[]>`
      SELECT stub_business_uid FROM stub_connections
      WHERE tenant_id = ${tenantId} AND is_active = true LIMIT 1
    `;
    if (rows.length === 0 || !rows[0].stub_business_uid) {
      throw new BusinessException(
        'Stub.africa is not connected for this tenant. Please connect via Settings.',
        'STUB_NOT_CONNECTED', { tenantId },
      );
    }
    return rows[0].stub_business_uid;
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

  /**
   * Convert a CrecheBooks invoice to a Stub sale payload.
   * Sales appear in Stub's Sales section (accounts receivable) — NOT income.
   * Income is only recorded when actual payment is received.
   */
  private invoiceToStubSale(invoice: {
    id: string; invoiceNumber: string; totalCents: number; vatCents: number;
    issueDate: Date;
    parent: { id: string; firstName: string; lastName: string; email: string | null };
    lines: Array<{ description: string; totalCents: number; quantity: { toNumber(): number } | number }>;
  }): StubSalePayload {
    const parentName = `${invoice.parent.firstName} ${invoice.parent.lastName}`;

    return {
      id: `cb-inv-${invoice.id}`,
      // No `payment` field — invoice is unpaid (accounts receivable)
      items: invoice.lines.length > 0
        ? invoice.lines.map((line, idx) => ({
            id: `cb-inv-${invoice.id}-line-${idx}`,
            name: line.description || `Line ${idx + 1}`,
            description: line.description,
            price: this.centsToRands(line.totalCents),
            quantity: typeof line.quantity === 'number' ? line.quantity : line.quantity.toNumber(),
          }))
        : [{
            id: `cb-inv-${invoice.id}-total`,
            name: `Invoice ${invoice.invoiceNumber}`,
            description: `Invoice ${invoice.invoiceNumber} for ${parentName}`,
            price: this.centsToRands(invoice.totalCents),
            quantity: 1,
          }],
      customer: {
        id: `cb-parent-${invoice.parent.id}`,
        name: parentName,
        email: invoice.parent.email ?? undefined,
        country: 'ZA',
      },
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
