/**
 * XeroAccountingAdapter
 *
 * Thin adapter that implements the provider-agnostic `AccountingProvider`
 * interface by delegating to existing Xero-specific services.
 *
 * This is purely a facade -- it maps between generic accounting types and
 * Xero DTOs without duplicating any business logic.
 *
 * CRITICAL: All monetary values are in ZAR cents (integers).
 * CRITICAL: Every DB query is scoped to `tenantId`.
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { XeroClient } from 'xero-node';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';
import { XeroAuthService } from './xero-auth.service';
import { XeroInvoiceService } from './xero-invoice.service';
import { XeroContactService } from './xero-contact.service';
import { XeroPaymentService } from './xero-payment.service';
import { BankFeedService } from './bank-feed.service';
import { XeroJournalService } from './xero-journal.service';
import { getAccounts } from '../../mcp/xero-mcp/tools';

import type { AccountingProvider } from '../accounting/interfaces/accounting-provider.interface';
import type {
  AccountingAccount,
  BankSyncOptions,
  BankSyncResult,
  BulkContactSyncResult,
  BulkInvoiceSyncResult,
  ConnectionStatus,
  ContactSyncResult,
  InvoicePullFilters,
  InvoiceSyncResult,
  JournalEntry,
  JournalPostResult,
  PaymentSyncResult,
  ProviderCapabilities,
  PulledInvoicesResult,
  PulledPaymentsResult,
  PushInvoiceOptions,
  SyncItemError,
  SyncOptions,
  SyncResult,
} from '../accounting/interfaces/accounting-types';

/** Standard Xero OAuth scopes used for all client instances. */
const XERO_SCOPES = [
  'openid',
  'offline_access',
  'accounting.transactions',
  'accounting.contacts',
  'accounting.settings',
];

@Injectable()
export class XeroAccountingAdapter implements AccountingProvider {
  private readonly logger = new Logger(XeroAccountingAdapter.name);
  private readonly tokenManager: TokenManager;

  readonly providerName = 'xero';
  readonly supportsBankFeeds = true;
  readonly supportsJournals = true;
  readonly capabilities: ProviderCapabilities = {
    bankFeeds: true,
    journals: true,
    bulkInvoicePush: true,
    invoicePull: true,
    chartOfAccounts: true,
    syncOrchestration: true,
  };

  constructor(
    private readonly authService: XeroAuthService,
    private readonly invoiceService: XeroInvoiceService,
    private readonly contactService: XeroContactService,
    private readonly paymentService: XeroPaymentService,
    private readonly bankFeedService: BankFeedService,
    private readonly journalService: XeroJournalService,
    private readonly prisma: PrismaService,
  ) {
    this.tokenManager = new TokenManager(this.prisma);
  }

  // ---------------------------------------------------------------------------
  // Auth / Connection
  // ---------------------------------------------------------------------------

  /** Generate the Xero OAuth authorization URL. */
  async getAuthUrl(
    tenantId: string,
    returnUrl: string,
  ): Promise<{ authUrl: string }> {
    const xeroClient = this.buildXeroClient();
    const state = this.authService.generateState({
      tenantId,
      returnUrl,
      createdAt: Date.now(),
      nonce: randomBytes(16).toString('hex'),
    });

    await this.prisma.xeroOAuthState.upsert({
      where: { tenantId },
      create: { tenantId, codeVerifier: 'not-used', state, expiresAt: new Date(Date.now() + 600_000) },
      update: { codeVerifier: 'not-used', state, expiresAt: new Date(Date.now() + 600_000) },
    });

    const baseUrl = await Promise.resolve(xeroClient.buildConsentUrl());
    return { authUrl: `${baseUrl}&state=${encodeURIComponent(state)}` };
  }

  /** Handle the OAuth callback -- exchange code for tokens and persist. */
  async handleCallback(tenantId: string, code: string, state: string): Promise<void> {
    const statePayload = this.authService.validateState(state);
    if (statePayload.tenantId !== tenantId) {
      throw new Error('OAuth state tenantId mismatch');
    }

    const storedState = await this.prisma.xeroOAuthState.findUnique({ where: { tenantId } });
    if (!storedState || storedState.state !== state) {
      throw new Error('Invalid OAuth state. Possible CSRF attack.');
    }

    const redirectUri = this.requireEnv('XERO_REDIRECT_URI');
    const xeroClient = this.buildXeroClient();

    const tokenSet = (await xeroClient.apiCallback(`${redirectUri}?code=${code}`)) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    await xeroClient.updateTenants();
    const xeroTenant = xeroClient.tenants?.[0];
    if (!xeroTenant) throw new Error('No Xero organizations found.');

    await this.tokenManager.storeTokens(tenantId, {
      accessToken: tokenSet.access_token ?? '',
      refreshToken: tokenSet.refresh_token ?? '',
      expiresAt: Date.now() + (tokenSet.expires_in ?? 1800) * 1000,
      xeroTenantId: xeroTenant.tenantId ?? '',
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { xeroConnectedAt: new Date(), xeroTenantName: xeroTenant.tenantName ?? undefined },
    });
    await this.prisma.xeroOAuthState.delete({ where: { tenantId } });
  }

  /** Check whether the tenant has a valid Xero connection. */
  async getConnectionStatus(tenantId: string): Promise<ConnectionStatus> {
    const xeroToken = await this.prisma.xeroToken.findUnique({ where: { tenantId } });
    if (!xeroToken) return { isConnected: false, providerName: this.providerName };

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { xeroConnectedAt: true, xeroTenantName: true },
    });

    return {
      isConnected: true,
      providerName: this.providerName,
      organizationName: tenant?.xeroTenantName ?? undefined,
      connectedAt: tenant?.xeroConnectedAt ?? undefined,
      lastSyncAt: xeroToken.updatedAt ?? undefined,
    };
  }

  /** Disconnect the tenant from Xero -- remove tokens and clear tenant fields. */
  async disconnect(tenantId: string): Promise<void> {
    await this.prisma.xeroToken.deleteMany({ where: { tenantId } });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { xeroConnectedAt: null, xeroTenantName: null },
    });
  }

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  /** Push a single invoice to Xero. */
  async pushInvoice(tenantId: string, invoiceId: string, options?: PushInvoiceOptions): Promise<InvoiceSyncResult> {
    const { accessToken, xeroTenantId } = await this.getCredentials(tenantId);
    const r = await this.invoiceService.pushInvoice(tenantId, invoiceId, accessToken, xeroTenantId, options?.force ?? false);
    return {
      invoiceId: r.invoiceId,
      externalInvoiceId: r.xeroInvoiceId,
      externalInvoiceNumber: r.xeroInvoiceNumber,
      externalStatus: r.xeroStatus,
      syncedAt: r.syncedAt,
    };
  }

  /** Push multiple invoices to Xero in bulk. */
  async pushInvoicesBulk(tenantId: string, invoiceIds: string[], options?: PushInvoiceOptions): Promise<BulkInvoiceSyncResult> {
    const { accessToken, xeroTenantId } = await this.getCredentials(tenantId);
    const r = await this.invoiceService.pushInvoices(tenantId, invoiceIds, accessToken, xeroTenantId, options?.force ?? false);
    return {
      pushed: r.pushed,
      failed: r.failed,
      skipped: r.skipped,
      results: r.results.map((i) => ({
        invoiceId: i.invoiceId,
        externalInvoiceId: i.xeroInvoiceId,
        externalInvoiceNumber: i.xeroInvoiceNumber,
        externalStatus: i.xeroStatus,
        syncedAt: i.syncedAt,
      })),
      errors: r.errors.map((e) => ({ entityId: e.invoiceId, error: e.error, code: e.code })),
    };
  }

  /** Pull invoices from Xero. */
  async pullInvoices(tenantId: string, filters?: InvoicePullFilters): Promise<PulledInvoicesResult> {
    const { accessToken, xeroTenantId } = await this.getCredentials(tenantId);
    const r = await this.invoiceService.pullInvoices(tenantId, accessToken, xeroTenantId, filters?.since);
    return {
      totalFound: r.totalFound,
      imported: r.imported,
      updated: r.updated,
      skipped: r.skipped,
      invoices: r.invoices.map((inv) => ({
        externalInvoiceId: inv.xeroInvoiceId,
        internalInvoiceId: inv.invoiceId,
        invoiceNumber: inv.xeroInvoiceNumber,
        contactName: inv.contactName,
        contactEmail: inv.contactEmail,
        date: inv.date,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        amountPaidCents: inv.amountPaidCents,
        status: inv.status,
        imported: inv.imported,
        importReason: inv.importReason,
      })),
      errors: r.errors.map((e) => ({ entityId: e.xeroInvoiceId, error: e.error, code: e.code })),
    };
  }

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------

  /** Sync a single parent to a Xero contact. */
  async syncContact(tenantId: string, parentId: string): Promise<ContactSyncResult> {
    const r = await this.contactService.getOrCreateContact(tenantId, parentId);
    return {
      parentId: r.parentId,
      externalContactId: r.xeroContactId,
      externalContactName: r.xeroContactName,
      wasCreated: r.wasCreated,
      syncedAt: r.syncedAt,
    };
  }

  /** Sync multiple parents to Xero contacts in bulk. */
  async syncContactsBulk(tenantId: string, parentIds: string[]): Promise<BulkContactSyncResult> {
    const r = await this.contactService.bulkSyncContacts(tenantId, parentIds);
    return {
      synced: r.synced,
      failed: r.failed,
      skipped: r.skipped,
      results: r.results.map((c) => ({
        parentId: c.parentId,
        externalContactId: c.xeroContactId,
        externalContactName: c.xeroContactName,
        wasCreated: c.wasCreated,
        syncedAt: c.syncedAt,
      })),
      errors: r.errors.map((e) => ({ entityId: e.parentId, error: e.error, code: e.code })),
    };
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  /** Sync a single payment to Xero. */
  async syncPayment(tenantId: string, paymentId: string, invoiceRef: string): Promise<PaymentSyncResult> {
    const r = await this.paymentService.syncPaymentToXero(tenantId, paymentId, invoiceRef);
    return {
      paymentId: r.paymentId,
      externalPaymentId: r.xeroPaymentId,
      externalInvoiceId: r.xeroInvoiceId,
      amountCents: r.amountCents,
      syncedAt: r.syncedAt,
    };
  }

  /** Pull payments from Xero for a given external invoice. */
  async pullPayments(tenantId: string, invoiceRef: string): Promise<PulledPaymentsResult> {
    const r = await this.paymentService.pullPaymentsFromXero(tenantId, invoiceRef);
    return {
      payments: r.results.map((p) => ({
        paymentId: p.paymentId,
        externalPaymentId: p.xeroPaymentId,
        externalInvoiceId: p.xeroInvoiceId,
        amountCents: p.amountCents,
        syncedAt: p.syncedAt,
      })),
      errors: r.errors.map((e) => ({ entityId: e.paymentId, error: e.error, code: e.code })),
    };
  }

  // ---------------------------------------------------------------------------
  // Bank Feeds (optional)
  // ---------------------------------------------------------------------------

  /** Import bank feed transactions from Xero. */
  async syncBankTransactions(tenantId: string, options?: BankSyncOptions): Promise<BankSyncResult> {
    const r = await this.bankFeedService.syncTransactions(tenantId, {
      fromDate: options?.fromDate ? new Date(options.fromDate) : undefined,
      forceFullSync: false,
    });
    return {
      transactionsImported: r.transactionsCreated,
      transactionsUpdated: 0,
      errors: r.errors.map((e) => ({ entityId: e.transactionId, error: e.error, code: e.code })),
    };
  }

  // ---------------------------------------------------------------------------
  // Journals (optional)
  // ---------------------------------------------------------------------------

  /** Post a manual journal entry to Xero. */
  async postJournal(tenantId: string, journal: JournalEntry): Promise<JournalPostResult> {
    const { accessToken, xeroTenantId } = await this.getCredentials(tenantId);
    const r = await this.journalService.createJournal(tenantId, accessToken, xeroTenantId, {
      narration: journal.narration,
      date: journal.date,
      lines: journal.lineItems.map((item) => ({
        accountCode: item.accountCode,
        description: item.description,
        amountCents: item.debitCents ?? item.creditCents ?? 0,
        isDebit: (item.debitCents ?? 0) > 0,
        taxType: item.taxType ?? 'NONE',
      })),
    });
    return {
      externalJournalId: r.manualJournalId,
      status: r.status,
      totalDebitsCents: r.totalDebitCents,
      totalCreditsCents: r.totalCreditCents,
      postedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Chart of Accounts
  // ---------------------------------------------------------------------------

  /** Retrieve the chart of accounts, preferring cached DB records. */
  async getAccounts(tenantId: string): Promise<AccountingAccount[]> {
    const cached = await this.prisma.xeroAccount.findMany({ where: { tenantId } });
    if (cached.length > 0) {
      return cached.map((a) => this.mapAccount(a.xeroAccountId ?? a.id, a.accountCode, a.name, a.type, a.status, a.taxType));
    }

    if (!(await this.tokenManager.hasValidConnection(tenantId))) return [];

    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);
    const xeroClient = this.buildXeroClient();
    xeroClient.setTokenSet({ access_token: accessToken, token_type: 'Bearer' });

    const accounts = await getAccounts(xeroClient, xeroTenantId);
    return accounts.map((a) => this.mapAccount(a.accountId ?? '', a.code, a.name, a.type, a.status, a.taxType));
  }

  // ---------------------------------------------------------------------------
  // Sync Orchestration
  // ---------------------------------------------------------------------------

  /** Run a coordinated sync across invoices, payments, and/or contacts. */
  async sync(tenantId: string, options: SyncOptions): Promise<SyncResult> {
    const jobId = `sync-${tenantId}-${Date.now()}`;
    const errors: SyncItemError[] = [];
    const entitiesSynced: Record<string, number> = {};
    const entities = options.entities ?? ['invoices', 'contacts', 'payments'];
    const { direction, fromDate, fullSync } = options;

    this.logger.log(`Starting ${direction} sync for tenant ${tenantId}: ${entities.join(', ')}`);

    if (entities.includes('contacts') && direction !== 'pull') {
      await this.runSyncStep('contacts', errors, entitiesSynced, async () => {
        const r = await this.contactService.bulkSyncContacts(tenantId);
        r.errors.forEach((e) => errors.push({ entityId: e.parentId, error: e.error, code: e.code }));
        return r.synced;
      });
    }

    if (entities.includes('invoices') && direction !== 'pull') {
      await this.runSyncStep('invoices_pushed', errors, entitiesSynced, async () => {
        const { accessToken, xeroTenantId } = await this.getCredentials(tenantId);
        const r = await this.invoiceService.pushInvoices(tenantId, undefined, accessToken, xeroTenantId, false);
        r.errors.forEach((e) => errors.push({ entityId: e.invoiceId, error: e.error, code: e.code }));
        return r.pushed;
      });
    }

    if (entities.includes('invoices') && direction !== 'push') {
      await this.runSyncStep('invoices_pulled', errors, entitiesSynced, async () => {
        const { accessToken, xeroTenantId } = await this.getCredentials(tenantId);
        const r = await this.invoiceService.pullInvoices(tenantId, accessToken, xeroTenantId, fromDate);
        r.errors.forEach((e) => errors.push({ entityId: e.xeroInvoiceId, error: e.error, code: e.code }));
        return r.imported + r.updated;
      });
    }

    if (direction !== 'push') {
      await this.runSyncStep('bank_transactions', errors, entitiesSynced, async () => {
        const r = await this.bankFeedService.syncTransactions(tenantId, {
          fromDate: fromDate ? new Date(fromDate) : undefined,
          forceFullSync: fullSync ?? false,
        });
        r.errors.forEach((e) => errors.push({ entityId: e.transactionId, error: e.error, code: e.code }));
        return r.transactionsCreated;
      });
    }

    return { jobId, success: errors.length === 0, entitiesSynced, errors, completedAt: new Date() };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Execute a sync step, catching errors into the shared errors array. */
  private async runSyncStep(
    key: string,
    errors: SyncItemError[],
    entitiesSynced: Record<string, number>,
    fn: () => Promise<number>,
  ): Promise<void> {
    try {
      entitiesSynced[key] = await fn();
    } catch (err) {
      this.logger.error(`${key} sync failed`, err);
      errors.push({
        entityId: key,
        error: err instanceof Error ? err.message : String(err),
        code: `${key.toUpperCase()}_FAILED`,
      });
    }
  }

  /** Get Xero OAuth credentials for a tenant via TokenManager. */
  private async getCredentials(tenantId: string): Promise<{ accessToken: string; xeroTenantId: string }> {
    if (!(await this.tokenManager.hasValidConnection(tenantId))) {
      throw new Error('No valid Xero connection for this tenant. Please connect to Xero first.');
    }
    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);
    return { accessToken, xeroTenantId };
  }

  /** Build a XeroClient with the standard env-based credentials. */
  private buildXeroClient(): XeroClient {
    return new XeroClient({
      clientId: this.requireEnv('XERO_CLIENT_ID'),
      clientSecret: this.requireEnv('XERO_CLIENT_SECRET'),
      redirectUris: [this.requireEnv('XERO_REDIRECT_URI')],
      scopes: XERO_SCOPES,
    });
  }

  /** Read a required env var or throw. */
  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Xero integration not configured: missing ${name}`);
    return value;
  }

  /** Map an account record to the generic AccountingAccount shape. */
  private mapAccount(
    id: string, code: string, name: string, type: string,
    status: string | null | undefined, taxType: string | null | undefined,
  ): AccountingAccount {
    return {
      externalAccountId: id,
      code,
      name,
      type,
      status: status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      taxType: taxType ?? undefined,
    };
  }
}
