/**
 * API Client for CrecheBooks
 *
 * Wraps HTTP requests to the CrecheBooks API with authentication.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  Credentials,
  ApiResponse,
  Invoice,
  Payment,
  PaymentMatch,
  ListInvoicesOptions,
  GenerateInvoicesOptions,
  SendInvoicesOptions,
  ListPaymentsOptions,
  MatchPaymentsOptions,
  AllocatePaymentOptions,
  Tenant,
  OnboardingStatus,
  Parent,
  ListParentsOptions,
  ParentInviteResult,
  Child,
  ListChildrenOptions,
  FeeStructure,
  ListFeeStructuresOptions,
  Enrollment,
  Staff,
  ListStaffOptions,
  CreateStaffOptions,
  UpdateStaffOptions,
  StaffOnboardingStatusResponse,
  LeaveType,
  LeaveBalanceResponse,
  LeaveHistoryResponse,
  LeaveRequest,
  LeaveRequestStatus,
  StaffDocumentsResponse,
  StaffDocument,
  PendingDocumentsResponse,
  DocumentType,
  DocumentVerificationStatus,
  // API Key types
  ApiKeyInfo,
  ApiKeyWithSecret,
  CreateApiKeyOptions,
  ListApiKeysOptions,
} from '../types/index.js';
import { CLIError, CLIErrorCode } from '../types/index.js';
import type { DashboardMetrics, DashboardTrends } from '../types/dashboard.js';
import type { ArrearsReport, FinancialReport, AuditLogEntry, AgingReport } from '../types/reports.js';
import type {
  // Banking types
  BankAccount,
  AccountSummary,
  BankLinkResponse,
  BankSyncResult,
  AccountBalance,
  ConsentStatusResponse,
  InitiateBankLinkOptions,
  SyncBankAccountOptions,
  ConsentStatusOptions,
  // Transaction types
  Transaction,
  ListTransactionsOptions,
  ImportTransactionsOptions,
  ImportTransactionsResult,
  ExportTransactionsOptions,
  CategorizationSuggestion,
  BatchCategorizeOptions,
  BatchCategorizeResult,
  SplitTransactionOptions,
  SplitTransactionResult,
  CategorizeTransactionOptions,
  // Reconciliation types
  ReconciliationStatus,
  ReconciliationStatusOptions,
  RunReconciliationOptions,
  ReconciliationResult,
  Discrepancy,
  DiscrepanciesOptions,
  DiscrepanciesResponse,
  ResolveDiscrepancyOptions,
} from '../types/index.js';

export class ApiClient {
  private client: AxiosInstance;

  constructor(credentials: Credentials) {
    // Determine if apiKey is a JWT token (starts with eyJ) or API key (starts with cb_)
    const isJwt = credentials.apiKey.startsWith('eyJ');
    const authHeader = isJwt
      ? `Bearer ${credentials.apiKey}`
      : credentials.apiKey;

    this.client = axios.create({
      baseURL: credentials.baseUrl || 'http://localhost:3000',
      headers: {
        'Content-Type': 'application/json',
        ...(isJwt
          ? { Authorization: authHeader }
          : { 'X-API-Key': authHeader }),
        'X-Tenant-ID': credentials.tenantId,
      },
      timeout: 30000,
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error),
    );
  }

  private handleError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { message?: string; error?: string };
      const message = data?.message || data?.error || 'API request failed';

      switch (status) {
        case 401:
          throw new CLIError(
            CLIErrorCode.AUTH_INVALID,
            'Invalid or expired API key.',
            "Run 'cb auth login' to re-authenticate.",
          );
        case 403:
          throw new CLIError(
            CLIErrorCode.AUTH_INVALID,
            'Access denied. Your API key may not have permission for this operation.',
          );
        case 404:
          throw new CLIError(CLIErrorCode.NOT_FOUND, message);
        case 422:
          throw new CLIError(CLIErrorCode.VALIDATION_ERROR, message);
        default:
          throw new CLIError(CLIErrorCode.API_ERROR, message);
      }
    }

    if (error.request) {
      throw new CLIError(
        CLIErrorCode.NETWORK_ERROR,
        'Could not connect to the CrecheBooks API.',
        'Check your internet connection and try again.',
      );
    }

    throw new CLIError(CLIErrorCode.API_ERROR, error.message);
  }

  // ============================================
  // Invoice Operations
  // ============================================

  async listInvoices(
    options: ListInvoicesOptions = {},
  ): Promise<ApiResponse<Invoice[]>> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.from) params.append('from_date', options.from);
    if (options.to) params.append('to_date', options.to);
    if (options.parentId) params.append('parent_id', options.parentId);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.page) params.append('page', String(options.page));

    const response = await this.client.get<ApiResponse<Invoice[]>>(
      `/api/v1/invoices?${params.toString()}`,
    );
    return response.data;
  }

  async getInvoice(id: string): Promise<ApiResponse<Invoice>> {
    const response = await this.client.get<ApiResponse<Invoice>>(
      `/api/v1/invoices/${id}`,
    );
    return response.data;
  }

  async generateInvoices(
    options: GenerateInvoicesOptions,
  ): Promise<ApiResponse<{ invoices_created: number; invoices: Invoice[] }>> {
    const response = await this.client.post<
      ApiResponse<{ invoices_created: number; invoices: Invoice[] }>
    >('/api/v1/invoices/generate', {
      billing_month: options.month,
      child_ids: options.childIds,
      dry_run: options.dryRun,
    });
    return response.data;
  }

  async sendInvoices(
    options: SendInvoicesOptions,
  ): Promise<ApiResponse<{ sent_count: number; failed_count: number }>> {
    const response = await this.client.post<
      ApiResponse<{ sent_count: number; failed_count: number }>
    >('/api/v1/invoices/send', {
      invoice_ids: options.ids,
      send_all: options.all,
      status_filter: options.status,
      method: options.method || 'email',
    });
    return response.data;
  }

  async downloadInvoicePdf(id: string): Promise<Buffer> {
    const response = await this.client.get(`/api/v1/invoices/${id}/pdf`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  // ============================================
  // Payment Operations
  // ============================================

  async listPayments(
    options: ListPaymentsOptions = {},
  ): Promise<ApiResponse<Payment[]>> {
    const params = new URLSearchParams();
    if (options.unallocated) params.append('unallocated', 'true');
    if (options.from) params.append('from_date', options.from);
    if (options.to) params.append('to_date', options.to);
    if (options.limit) params.append('limit', String(options.limit));
    if (options.page) params.append('page', String(options.page));

    const response = await this.client.get<ApiResponse<Payment[]>>(
      `/api/v1/payments?${params.toString()}`,
    );
    return response.data;
  }

  async getPayment(id: string): Promise<ApiResponse<Payment>> {
    const response = await this.client.get<ApiResponse<Payment>>(
      `/api/v1/payments/${id}`,
    );
    return response.data;
  }

  async matchPayments(options: MatchPaymentsOptions = {}): Promise<
    ApiResponse<{
      matches: PaymentMatch[];
      auto_applied: number;
      pending_review: number;
    }>
  > {
    const response = await this.client.post<
      ApiResponse<{
        matches: PaymentMatch[];
        auto_applied: number;
        pending_review: number;
      }>
    >('/api/v1/payments/match', {
      dry_run: options.dryRun,
      min_confidence: options.minConfidence || 0.8,
    });
    return response.data;
  }

  async allocatePayment(
    options: AllocatePaymentOptions,
  ): Promise<ApiResponse<Payment>> {
    const response = await this.client.post<ApiResponse<Payment>>(
      `/api/v1/payments/${options.paymentId}/allocate`,
      {
        invoice_id: options.invoiceId,
        amount_cents: options.amountCents,
      },
    );
    return response.data;
  }

  // ============================================
  // Tenant Operations
  // ============================================

  async getTenant(): Promise<ApiResponse<Tenant>> {
    const response = await this.client.get<ApiResponse<Tenant>>('/api/v1/tenant');
    return response.data;
  }

  async updateTenant(
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Tenant>> {
    const response = await this.client.patch<ApiResponse<Tenant>>(
      '/api/v1/tenant',
      data,
    );
    return response.data;
  }

  async getOnboardingStatus(): Promise<ApiResponse<OnboardingStatus>> {
    const response = await this.client.get<ApiResponse<OnboardingStatus>>(
      '/api/v1/tenant/onboarding',
    );
    return response.data;
  }

  // ============================================
  // Parent Operations
  // ============================================

  async listParents(
    options: ListParentsOptions = {},
  ): Promise<ApiResponse<Parent[]>> {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.isActive !== undefined)
      params.append('is_active', String(options.isActive));
    if (options.limit) params.append('limit', String(options.limit));
    if (options.page) params.append('page', String(options.page));

    // API returns { parents: [...], total, page, ... } format
    const response = await this.client.get<{ parents: Parent[]; total: number }>(
      `/api/v1/parents?${params.toString()}`,
    );
    return { success: true, data: response.data.parents };
  }

  async getParent(id: string): Promise<ApiResponse<Parent>> {
    const response = await this.client.get<ApiResponse<Parent>>(
      `/api/v1/parents/${id}`,
    );
    return response.data;
  }

  async createParent(
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Parent>> {
    // API returns parent object directly, not wrapped in ApiResponse
    const response = await this.client.post<Parent>(
      '/api/v1/parents',
      data,
    );
    return { success: true, data: response.data };
  }

  async updateParent(
    id: string,
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Parent>> {
    const response = await this.client.patch<ApiResponse<Parent>>(
      `/api/v1/parents/${id}`,
      data,
    );
    return response.data;
  }

  async sendParentInvite(
    id: string,
    options: { resend?: boolean } = {},
  ): Promise<ApiResponse<ParentInviteResult>> {
    const response = await this.client.post<ApiResponse<ParentInviteResult>>(
      `/api/v1/parents/${id}/invite`,
      { resend: options.resend },
    );
    return response.data;
  }

  // ============================================
  // Child Operations
  // ============================================

  async listChildren(
    options: ListChildrenOptions = {},
  ): Promise<ApiResponse<Child[]>> {
    const params = new URLSearchParams();
    if (options.parentId) params.append('parent_id', options.parentId);
    if (options.enrolled !== undefined)
      params.append('enrolled', String(options.enrolled));
    if (options.isActive !== undefined)
      params.append('is_active', String(options.isActive));
    if (options.limit) params.append('limit', String(options.limit));
    if (options.page) params.append('page', String(options.page));

    const response = await this.client.get<ApiResponse<Child[]>>(
      `/api/v1/children?${params.toString()}`,
    );
    return response.data;
  }

  async getChild(id: string): Promise<ApiResponse<Child>> {
    const response = await this.client.get<ApiResponse<Child>>(
      `/api/v1/children/${id}`,
    );
    return response.data;
  }

  async createChild(
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Child>> {
    const response = await this.client.post<ApiResponse<Child>>(
      '/api/v1/children',
      data,
    );
    return response.data;
  }

  async updateChild(
    id: string,
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Child>> {
    const response = await this.client.patch<ApiResponse<Child>>(
      `/api/v1/children/${id}`,
      data,
    );
    return response.data;
  }

  // ============================================
  // Fee Structure Operations
  // ============================================

  async listFeeStructures(
    options: ListFeeStructuresOptions = {},
  ): Promise<ApiResponse<FeeStructure[]>> {
    const params = new URLSearchParams();
    if (options.active !== undefined)
      params.append('active', String(options.active));
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.client.get<ApiResponse<FeeStructure[]>>(
      `/api/v1/fee-structures?${params.toString()}`,
    );
    return response.data;
  }

  async getFeeStructure(id: string): Promise<ApiResponse<FeeStructure>> {
    const response = await this.client.get<ApiResponse<FeeStructure>>(
      `/api/v1/fee-structures/${id}`,
    );
    return response.data;
  }

  async createFeeStructure(
    data: Record<string, unknown>,
  ): Promise<ApiResponse<FeeStructure>> {
    const response = await this.client.post<ApiResponse<FeeStructure>>(
      '/api/v1/fee-structures',
      data,
    );
    return response.data;
  }

  async updateFeeStructure(
    id: string,
    data: Record<string, unknown>,
  ): Promise<ApiResponse<FeeStructure>> {
    const response = await this.client.patch<ApiResponse<FeeStructure>>(
      `/api/v1/fee-structures/${id}`,
      data,
    );
    return response.data;
  }

  async deactivateFeeStructure(
    id: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const response = await this.client.post<ApiResponse<{ success: boolean }>>(
      `/api/v1/fee-structures/${id}/deactivate`,
    );
    return response.data;
  }

  // ============================================
  // Enrollment Operations
  // ============================================

  async createEnrollment(
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Enrollment>> {
    const response = await this.client.post<ApiResponse<Enrollment>>(
      '/api/v1/enrollments',
      data,
    );
    return response.data;
  }

  async updateEnrollment(
    id: string,
    data: Record<string, unknown>,
  ): Promise<ApiResponse<Enrollment>> {
    const response = await this.client.patch<ApiResponse<Enrollment>>(
      `/api/v1/enrollments/${id}`,
      data,
    );
    return response.data;
  }

  // ============================================
  // Dashboard Operations
  // ============================================

  async getDashboardMetrics(
    options: { period?: string } = {},
  ): Promise<ApiResponse<DashboardMetrics>> {
    const params = new URLSearchParams();
    if (options.period) params.append('period', options.period);

    const response = await this.client.get<ApiResponse<DashboardMetrics>>(
      `/api/v1/dashboard/metrics?${params.toString()}`,
    );
    return response.data;
  }

  async getDashboardTrends(
    options: { year?: number } = {},
  ): Promise<ApiResponse<DashboardTrends>> {
    const params = new URLSearchParams();
    if (options.year) params.append('year', String(options.year));

    const response = await this.client.get<ApiResponse<DashboardTrends>>(
      `/api/v1/dashboard/trends?${params.toString()}`,
    );
    return response.data;
  }

  // ============================================
  // Report Operations
  // ============================================

  async getArrearsReport(): Promise<ApiResponse<ArrearsReport>> {
    const response = await this.client.get<ApiResponse<ArrearsReport>>(
      '/api/v1/reports/arrears',
    );
    return response.data;
  }

  async getFinancialReport(
    options: { type: string; from?: string; to?: string },
  ): Promise<ApiResponse<FinancialReport>> {
    const params = new URLSearchParams();
    params.append('type', options.type);
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);

    const response = await this.client.get<ApiResponse<FinancialReport>>(
      `/api/v1/reports/financial?${params.toString()}`,
    );
    return response.data;
  }

  async getAuditLog(
    options: {
      from?: string;
      to?: string;
      entityType?: string;
      action?: string;
      limit?: number;
    } = {},
  ): Promise<ApiResponse<AuditLogEntry[]>> {
    const params = new URLSearchParams();
    if (options.from) params.append('from', options.from);
    if (options.to) params.append('to', options.to);
    if (options.entityType) params.append('entity_type', options.entityType);
    if (options.action) params.append('action', options.action);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.client.get<ApiResponse<AuditLogEntry[]>>(
      `/api/v1/reports/audit-log?${params.toString()}`,
    );
    return response.data;
  }

  async getAgingReport(): Promise<ApiResponse<AgingReport>> {
    const response = await this.client.get<ApiResponse<AgingReport>>(
      '/api/v1/reports/aging',
    );
    return response.data;
  }

  // ============================================
  // Banking Operations
  // ============================================

  async listBankAccounts(): Promise<ApiResponse<BankAccount[]>> {
    const response = await this.client.get<ApiResponse<BankAccount[]>>(
      '/api/v1/banking/accounts',
    );
    return response.data;
  }

  async getAccountsSummary(): Promise<ApiResponse<AccountSummary>> {
    const response = await this.client.get<ApiResponse<AccountSummary>>(
      '/api/v1/banking/accounts/summary',
    );
    return response.data;
  }

  async initiateBankLink(
    options: InitiateBankLinkOptions = {},
  ): Promise<ApiResponse<BankLinkResponse>> {
    const response = await this.client.post<ApiResponse<BankLinkResponse>>(
      '/api/v1/banking/link',
      {
        bank_code: options.bankCode,
        redirect_url: options.redirectUrl,
      },
    );
    return response.data;
  }

  async unlinkBankAccount(
    accountId: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const response = await this.client.delete<ApiResponse<{ success: boolean }>>(
      `/api/v1/banking/accounts/${accountId}`,
    );
    return response.data;
  }

  async syncBankAccount(
    accountId: string,
    options: SyncBankAccountOptions = {},
  ): Promise<ApiResponse<BankSyncResult>> {
    const response = await this.client.post<ApiResponse<BankSyncResult>>(
      `/api/v1/banking/accounts/${accountId}/sync`,
      {
        from_date: options.fromDate,
        to_date: options.toDate,
      },
    );
    return response.data;
  }

  async getBankAccountBalance(
    accountId: string,
  ): Promise<ApiResponse<AccountBalance>> {
    const response = await this.client.get<ApiResponse<AccountBalance>>(
      `/api/v1/banking/accounts/${accountId}/balance`,
    );
    return response.data;
  }

  async getConsentStatus(
    options: ConsentStatusOptions = {},
  ): Promise<ApiResponse<ConsentStatusResponse>> {
    const params = new URLSearchParams();
    if (options.expiringWithinDays)
      params.append('expiring_within_days', String(options.expiringWithinDays));

    const response = await this.client.get<ApiResponse<ConsentStatusResponse>>(
      `/api/v1/banking/consent-status?${params.toString()}`,
    );
    return response.data;
  }

  // ============================================
  // Transaction Operations
  // ============================================

  async listTransactions(
    options: ListTransactionsOptions = {},
  ): Promise<ApiResponse<Transaction[]>> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.from) params.append('from_date', options.from);
    if (options.to) params.append('to_date', options.to);
    if (options.isReconciled !== undefined)
      params.append('is_reconciled', String(options.isReconciled));
    if (options.accountId) params.append('account_id', options.accountId);
    if (options.categoryCode) params.append('category_code', options.categoryCode);
    if (options.minAmountCents)
      params.append('min_amount_cents', String(options.minAmountCents));
    if (options.maxAmountCents)
      params.append('max_amount_cents', String(options.maxAmountCents));
    if (options.isCredit !== undefined)
      params.append('is_credit', String(options.isCredit));
    if (options.limit) params.append('limit', String(options.limit));
    if (options.page) params.append('page', String(options.page));

    const response = await this.client.get<ApiResponse<Transaction[]>>(
      `/api/v1/transactions?${params.toString()}`,
    );
    return response.data;
  }

  async getTransaction(id: string): Promise<ApiResponse<Transaction>> {
    const response = await this.client.get<ApiResponse<Transaction>>(
      `/api/v1/transactions/${id}`,
    );
    return response.data;
  }

  async importTransactions(
    options: ImportTransactionsOptions,
  ): Promise<ApiResponse<ImportTransactionsResult>> {
    const response = await this.client.post<ApiResponse<ImportTransactionsResult>>(
      '/api/v1/transactions/import',
      {
        file: options.file,
        file_name: options.fileName,
        format: options.format,
        account_id: options.accountId,
        dry_run: options.dryRun,
        skip_duplicates: options.skipDuplicates,
      },
    );
    return response.data;
  }

  async exportTransactions(
    options: ExportTransactionsOptions = {},
  ): Promise<ApiResponse<{ csv: string; count: number }>> {
    const params = new URLSearchParams();
    if (options.from) params.append('from_date', options.from);
    if (options.to) params.append('to_date', options.to);
    if (options.status) params.append('status', options.status);
    if (options.accountId) params.append('account_id', options.accountId);

    const response = await this.client.get<
      ApiResponse<{ csv: string; count: number }>
    >(`/api/v1/transactions/export?${params.toString()}`);
    return response.data;
  }

  async categorizeTransaction(
    id: string,
    options: CategorizeTransactionOptions,
  ): Promise<ApiResponse<Transaction>> {
    const response = await this.client.post<ApiResponse<Transaction>>(
      `/api/v1/transactions/${id}/categorize`,
      {
        category_code: options.categoryCode,
      },
    );
    return response.data;
  }

  async batchCategorize(
    options: BatchCategorizeOptions,
  ): Promise<ApiResponse<BatchCategorizeResult>> {
    const response = await this.client.post<ApiResponse<BatchCategorizeResult>>(
      '/api/v1/transactions/categorize/batch',
      {
        min_confidence: options.minConfidence,
        dry_run: options.dryRun,
      },
    );
    return response.data;
  }

  async getCategorizationSuggestions(
    id: string,
  ): Promise<ApiResponse<CategorizationSuggestion[]>> {
    const response = await this.client.get<
      ApiResponse<CategorizationSuggestion[]>
    >(`/api/v1/transactions/${id}/suggestions`);
    return response.data;
  }

  async splitTransaction(
    id: string,
    options: SplitTransactionOptions,
  ): Promise<ApiResponse<SplitTransactionResult>> {
    const response = await this.client.post<ApiResponse<SplitTransactionResult>>(
      `/api/v1/transactions/${id}/split`,
      {
        parts: options.parts.map((p) => ({
          amount_cents: p.amount_cents,
          category_code: p.category_code,
          description: p.description,
        })),
      },
    );
    return response.data;
  }

  // ============================================
  // Reconciliation Operations
  // ============================================

  async getReconciliationStatus(
    options: ReconciliationStatusOptions = {},
  ): Promise<ApiResponse<ReconciliationStatus>> {
    const params = new URLSearchParams();
    if (options.accountId) params.append('account_id', options.accountId);
    if (options.month) params.append('month', options.month);

    const response = await this.client.get<ApiResponse<ReconciliationStatus>>(
      `/api/v1/reconciliation/status?${params.toString()}`,
    );
    return response.data;
  }

  async runReconciliation(
    options: RunReconciliationOptions = {},
  ): Promise<ApiResponse<ReconciliationResult>> {
    const response = await this.client.post<ApiResponse<ReconciliationResult>>(
      '/api/v1/reconciliation/run',
      {
        account_id: options.accountId,
        month: options.month,
        statement_balance_cents: options.statementBalanceCents,
        dry_run: options.dryRun,
      },
    );
    return response.data;
  }

  async getDiscrepancies(
    options: DiscrepanciesOptions = {},
  ): Promise<ApiResponse<DiscrepanciesResponse>> {
    const params = new URLSearchParams();
    if (options.accountId) params.append('account_id', options.accountId);
    if (options.month) params.append('month', options.month);
    if (options.includeResolved)
      params.append('include_resolved', String(options.includeResolved));
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.client.get<ApiResponse<DiscrepanciesResponse>>(
      `/api/v1/reconciliation/discrepancies?${params.toString()}`,
    );
    return response.data;
  }

  async getDiscrepancy(id: string): Promise<ApiResponse<Discrepancy>> {
    const response = await this.client.get<ApiResponse<Discrepancy>>(
      `/api/v1/reconciliation/discrepancies/${id}`,
    );
    return response.data;
  }

  async resolveDiscrepancy(
    id: string,
    options: ResolveDiscrepancyOptions,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const response = await this.client.post<ApiResponse<{ success: boolean }>>(
      `/api/v1/reconciliation/discrepancies/${id}/resolve`,
      {
        action: options.action,
        note: options.note,
        match_to_transaction_id: options.matchToTransactionId,
      },
    );
    return response.data;
  }

  // ============================================
  // Staff Operations
  // ============================================

  async listStaff(
    options: ListStaffOptions = {},
  ): Promise<ApiResponse<Staff[]>> {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.employmentType) params.append('employment_type', options.employmentType);
    if (options.active !== undefined) params.append('is_active', String(options.active));
    if (options.limit) params.append('limit', String(options.limit));
    if (options.page) params.append('page', String(options.page));

    const response = await this.client.get<{ staff: Staff[]; total: number }>(
      `/api/v1/staff?${params.toString()}`,
    );
    // API returns { staff: [...], total, page, limit }, wrap in ApiResponse format
    return { success: true, data: response.data.staff };
  }

  async getStaff(id: string): Promise<ApiResponse<Staff>> {
    const response = await this.client.get<ApiResponse<Staff>>(
      `/api/v1/staff/${id}`,
    );
    return response.data;
  }

  async createStaff(
    options: CreateStaffOptions,
  ): Promise<ApiResponse<Staff>> {
    // Derive date_of_birth from ID number if not provided (SA ID: YYMMDD...)
    let dateOfBirth = options.dateOfBirth;
    if (!dateOfBirth && options.idNumber && options.idNumber.length >= 6) {
      const yy = parseInt(options.idNumber.slice(0, 2), 10);
      const mm = options.idNumber.slice(2, 4);
      const dd = options.idNumber.slice(4, 6);
      // Assume 1900s if yy > 25, otherwise 2000s
      const century = yy > 25 ? '19' : '20';
      dateOfBirth = `${century}${yy.toString().padStart(2, '0')}-${mm}-${dd}`;
    }

    const response = await this.client.post<Staff>(
      '/api/v1/staff',
      {
        first_name: options.firstName,
        last_name: options.lastName,
        email: options.email,
        phone: options.phone,
        id_number: options.idNumber,
        date_of_birth: dateOfBirth,
        start_date: options.startDate || new Date().toISOString().split('T')[0],
        employment_type: options.employmentType,
        pay_frequency: options.payFrequency || 'MONTHLY',
        salary: options.basicSalaryCents,
      },
    );
    // API returns Staff directly, wrap in ApiResponse format
    return { success: true, data: response.data };
  }

  async updateStaff(
    id: string,
    options: UpdateStaffOptions,
  ): Promise<ApiResponse<Staff>> {
    const payload: Record<string, unknown> = {};
    if (options.firstName) payload.first_name = options.firstName;
    if (options.lastName) payload.last_name = options.lastName;
    if (options.email) payload.email = options.email;
    if (options.phone) payload.phone = options.phone;
    if (options.employmentType) payload.employment_type = options.employmentType;
    if (options.payFrequency) payload.pay_frequency = options.payFrequency;
    if (options.basicSalaryCents) payload.basic_salary_cents = options.basicSalaryCents;
    if (options.bankName) payload.bank_name = options.bankName;
    if (options.bankAccountNumber) payload.bank_account_number = options.bankAccountNumber;
    if (options.bankBranchCode) payload.bank_branch_code = options.bankBranchCode;

    const response = await this.client.patch<ApiResponse<Staff>>(
      `/api/v1/staff/${id}`,
      payload,
    );
    return response.data;
  }

  async deactivateStaff(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete<ApiResponse<void>>(
      `/api/v1/staff/${id}`,
    );
    return response.data;
  }

  async resendStaffInvite(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.post<ApiResponse<void>>(
      `/api/v1/staff/${id}/resend-invite`,
    );
    return response.data;
  }

  // ============================================
  // Staff Onboarding Operations
  // ============================================

  async getStaffOnboardingStatus(
    staffId: string,
  ): Promise<ApiResponse<StaffOnboardingStatusResponse>> {
    const response = await this.client.get<ApiResponse<StaffOnboardingStatusResponse>>(
      `/api/v1/staff/${staffId}/onboarding`,
    );
    return response.data;
  }

  async initiateOnboarding(
    staffId: string,
    options: { sendEmail?: boolean } = {},
  ): Promise<ApiResponse<StaffOnboardingStatusResponse>> {
    const response = await this.client.post<ApiResponse<StaffOnboardingStatusResponse>>(
      `/api/v1/staff/${staffId}/onboarding/initiate`,
      { send_email: options.sendEmail ?? true },
    );
    return response.data;
  }

  async completeOnboarding(
    staffId: string,
    options: { force?: boolean } = {},
  ): Promise<ApiResponse<StaffOnboardingStatusResponse>> {
    const response = await this.client.post<ApiResponse<StaffOnboardingStatusResponse>>(
      `/api/v1/staff/${staffId}/onboarding/complete`,
      { force: options.force },
    );
    return response.data;
  }

  async completeOnboardingStep(
    staffId: string,
    stepId: string,
    options: { notes?: string } = {},
  ): Promise<ApiResponse<{ step_name: string; remaining_steps: number }>> {
    const response = await this.client.post<ApiResponse<{ step_name: string; remaining_steps: number }>>(
      `/api/v1/staff/${staffId}/onboarding/steps/${stepId}/complete`,
      { notes: options.notes },
    );
    return response.data;
  }

  // ============================================
  // Leave Operations
  // ============================================

  async getLeaveTypes(): Promise<ApiResponse<LeaveType[]>> {
    const response = await this.client.get<ApiResponse<LeaveType[]>>(
      '/api/v1/staff/leave-types',
    );
    return response.data;
  }

  async getLeaveBalance(
    staffId: string,
    options: { year?: string } = {},
  ): Promise<ApiResponse<LeaveBalanceResponse>> {
    const params = new URLSearchParams();
    if (options.year) params.append('year', options.year);

    const response = await this.client.get<ApiResponse<LeaveBalanceResponse>>(
      `/api/v1/staff/${staffId}/leave/balance?${params.toString()}`,
    );
    return response.data;
  }

  async getLeaveHistory(
    staffId: string,
    options: { status?: LeaveRequestStatus; year?: string; limit?: number } = {},
  ): Promise<ApiResponse<LeaveHistoryResponse>> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.year) params.append('year', options.year);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.client.get<ApiResponse<LeaveHistoryResponse>>(
      `/api/v1/staff/${staffId}/leave/history?${params.toString()}`,
    );
    return response.data;
  }

  async createLeaveRequest(
    staffId: string,
    options: {
      leaveTypeCode: string;
      startDate: string;
      endDate: string;
      notes?: string;
    },
  ): Promise<ApiResponse<LeaveRequest>> {
    const response = await this.client.post<ApiResponse<LeaveRequest>>(
      `/api/v1/staff/${staffId}/leave/request`,
      {
        leave_type_code: options.leaveTypeCode,
        start_date: options.startDate,
        end_date: options.endDate,
        notes: options.notes,
      },
    );
    return response.data;
  }

  async approveLeaveRequest(
    requestId: string,
    options: { notes?: string } = {},
  ): Promise<ApiResponse<LeaveRequest>> {
    const response = await this.client.post<ApiResponse<LeaveRequest>>(
      `/api/v1/leave-requests/${requestId}/approve`,
      { notes: options.notes },
    );
    return response.data;
  }

  async rejectLeaveRequest(
    requestId: string,
    options: { reason: string },
  ): Promise<ApiResponse<LeaveRequest>> {
    const response = await this.client.post<ApiResponse<LeaveRequest>>(
      `/api/v1/leave-requests/${requestId}/reject`,
      { rejection_reason: options.reason },
    );
    return response.data;
  }

  // ============================================
  // Staff Document Operations
  // ============================================

  async getStaffDocuments(
    staffId: string,
    options: { type?: DocumentType; verificationStatus?: DocumentVerificationStatus } = {},
  ): Promise<ApiResponse<StaffDocumentsResponse>> {
    const params = new URLSearchParams();
    if (options.type) params.append('type', options.type);
    if (options.verificationStatus) params.append('verification_status', options.verificationStatus);

    const response = await this.client.get<ApiResponse<StaffDocumentsResponse>>(
      `/api/v1/staff/${staffId}/documents?${params.toString()}`,
    );
    return response.data;
  }

  async uploadStaffDocument(
    staffId: string,
    options: {
      type: DocumentType;
      name: string;
      fileName: string;
      fileBuffer: Buffer;
      expiresAt?: string;
    },
  ): Promise<ApiResponse<StaffDocument>> {
    const formData = new FormData();
    formData.append('type', options.type);
    formData.append('name', options.name);
    if (options.expiresAt) formData.append('expires_at', options.expiresAt);
    formData.append('file', new Blob([options.fileBuffer]), options.fileName);

    const response = await this.client.post<ApiResponse<StaffDocument>>(
      `/api/v1/staff/${staffId}/documents`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return response.data;
  }

  async verifyStaffDocument(
    documentId: string,
    options: {
      action: 'approve' | 'reject';
      notes?: string;
      rejectionReason?: string;
    },
  ): Promise<ApiResponse<StaffDocument>> {
    const response = await this.client.post<ApiResponse<StaffDocument>>(
      `/api/v1/staff/documents/${documentId}/verify`,
      {
        action: options.action,
        notes: options.notes,
        rejection_reason: options.rejectionReason,
      },
    );
    return response.data;
  }

  async getPendingDocuments(
    options: { limit?: number } = {},
  ): Promise<ApiResponse<PendingDocumentsResponse>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.client.get<ApiResponse<PendingDocumentsResponse>>(
      `/api/v1/staff/documents/pending?${params.toString()}`,
    );
    return response.data;
  }

  async downloadStaffDocument(
    documentId: string,
  ): Promise<ApiResponse<{ buffer: Buffer; fileName: string }>> {
    const response = await this.client.get(`/api/v1/staff/documents/${documentId}/download`, {
      responseType: 'arraybuffer',
    });
    const fileName = response.headers['content-disposition']?.split('filename=')[1] || 'document';
    return {
      success: true,
      data: {
        buffer: Buffer.from(response.data),
        fileName,
      },
    };
  }

  // ============================================
  // SARS Compliance Operations
  // ============================================

  async generateVat201(
    options: import('../types/index.js').GenerateVat201Options,
  ): Promise<ApiResponse<import('../types/index.js').Vat201Return>> {
    const response = await this.client.post<ApiResponse<import('../types/index.js').Vat201Return>>(
      '/api/v1/sars/vat201/generate',
      {
        period_start: options.periodStart,
        period_end: options.periodEnd,
        dry_run: options.dryRun,
      },
    );
    return response.data;
  }

  async downloadVat201Csv(period: string): Promise<Buffer> {
    const response = await this.client.get(`/api/v1/sars/vat201/download?period=${period}`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  async generateEmp201(
    options: import('../types/index.js').GenerateEmp201Options,
  ): Promise<ApiResponse<import('../types/index.js').Emp201Return>> {
    const response = await this.client.post<ApiResponse<import('../types/index.js').Emp201Return>>(
      '/api/v1/sars/emp201/generate',
      {
        month: options.month,
        dry_run: options.dryRun,
      },
    );
    return response.data;
  }

  async downloadEmp201Csv(taxYear: string, period: number): Promise<Buffer> {
    const response = await this.client.get(
      `/api/v1/sars/emp201/download?tax_year=${taxYear}&period=${period}`,
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(response.data);
  }

  async generateEmp501(
    options: import('../types/index.js').GenerateEmp501Options,
  ): Promise<ApiResponse<import('../types/index.js').Emp501Return>> {
    const response = await this.client.post<ApiResponse<import('../types/index.js').Emp501Return>>(
      '/api/v1/sars/emp501/generate',
      {
        tax_year_start: options.taxYearStart,
        tax_year_end: options.taxYearEnd,
        dry_run: options.dryRun,
      },
    );
    return response.data;
  }

  async downloadEmp501Csv(taxYear: string): Promise<Buffer> {
    const response = await this.client.get(`/api/v1/sars/emp501/download?tax_year=${taxYear}`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  async listSarsSubmissions(
    options: import('../types/index.js').ListSarsSubmissionsOptions = {},
  ): Promise<ApiResponse<import('../types/index.js').SarsSubmission[]>> {
    const params = new URLSearchParams();
    if (options.type) params.append('type', options.type);
    if (options.status) params.append('status', options.status);
    if (options.taxYear) params.append('tax_year', options.taxYear);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await this.client.get<ApiResponse<import('../types/index.js').SarsSubmission[]>>(
      `/api/v1/sars/submissions?${params.toString()}`,
    );
    return response.data;
  }

  async getSarsDeadlines(
    options: import('../types/index.js').GetSarsDeadlinesOptions = {},
  ): Promise<ApiResponse<import('../types/index.js').SarsDeadline[]>> {
    const params = new URLSearchParams();
    if (options.includeAll) params.append('include_all', 'true');

    const response = await this.client.get<ApiResponse<import('../types/index.js').SarsDeadline[]>>(
      `/api/v1/sars/deadlines?${params.toString()}`,
    );
    return response.data;
  }

  async markSarsSubmitted(
    options: import('../types/index.js').MarkSarsSubmittedOptions,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const response = await this.client.post<ApiResponse<{ success: boolean }>>(
      `/api/v1/sars/submissions/${options.submissionId}/submit`,
      {
        submission_type: options.submissionType,
        sars_reference: options.sarsReference,
      },
    );
    return response.data;
  }

  // ============================================
  // Communications
  // ============================================

  async listBroadcasts(options: {
    status?: string;
    recipientType?: string;
    limit?: number;
    page?: number;
  }): Promise<ApiResponse<unknown[]>> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.recipientType) params.append('recipient_type', options.recipientType);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.page) params.append('page', options.page.toString());

    const response = await this.client.get<ApiResponse<unknown[]>>(
      `/api/v1/communications/broadcasts?${params.toString()}`,
    );
    return response.data;
  }

  async getBroadcast(id: string): Promise<ApiResponse<unknown>> {
    const response = await this.client.get<ApiResponse<unknown>>(
      `/api/v1/communications/broadcasts/${id}`,
    );
    return response.data;
  }

  async createBroadcast(options: {
    subject?: string;
    body: string;
    recipientType: string;
    channel: string;
    recipientFilter?: unknown;
    recipientGroupId?: string;
    scheduledAt?: string;
  }): Promise<ApiResponse<unknown>> {
    const response = await this.client.post<ApiResponse<unknown>>(
      '/api/v1/communications/broadcasts',
      {
        subject: options.subject,
        body: options.body,
        recipient_type: options.recipientType,
        channel: options.channel,
        recipient_filter: options.recipientFilter,
        recipient_group_id: options.recipientGroupId,
        scheduled_at: options.scheduledAt,
      },
    );
    return response.data;
  }

  async sendBroadcast(id: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.post<ApiResponse<{ message: string }>>(
      `/api/v1/communications/broadcasts/${id}/send`,
    );
    return response.data;
  }

  async cancelBroadcast(id: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.client.post<ApiResponse<{ message: string }>>(
      `/api/v1/communications/broadcasts/${id}/cancel`,
    );
    return response.data;
  }

  async previewRecipients(options: {
    recipientType: string;
    channel: string;
    filter?: unknown;
  }): Promise<ApiResponse<{ total: number; recipients: unknown[]; has_more: boolean }>> {
    const response = await this.client.post<ApiResponse<{ total: number; recipients: unknown[]; has_more: boolean }>>(
      '/api/v1/communications/recipients/preview',
      {
        recipient_type: options.recipientType,
        channel: options.channel,
        filter: options.filter,
      },
    );
    return response.data;
  }

  async listRecipientGroups(): Promise<ApiResponse<unknown[]>> {
    const response = await this.client.get<ApiResponse<unknown[]>>(
      '/api/v1/communications/groups',
    );
    return response.data;
  }

  async createRecipientGroup(options: {
    name: string;
    description?: string;
    recipientType: string;
    filterCriteria?: unknown;
  }): Promise<ApiResponse<unknown>> {
    const response = await this.client.post<ApiResponse<unknown>>(
      '/api/v1/communications/groups',
      {
        name: options.name,
        description: options.description,
        recipient_type: options.recipientType,
        filter_criteria: options.filterCriteria,
      },
    );
    return response.data;
  }

  async deleteRecipientGroup(id: string): Promise<ApiResponse<void>> {
    const response = await this.client.delete<ApiResponse<void>>(
      `/api/v1/communications/groups/${id}`,
    );
    return response.data;
  }

  // ============================================
  // Health Check
  // ============================================

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // ============================================
  // API Key Management
  // ============================================

  async createApiKey(
    options: CreateApiKeyOptions,
  ): Promise<ApiResponse<ApiKeyWithSecret>> {
    const response = await this.client.post<ApiKeyWithSecret>(
      '/api/v1/auth/api-keys',
      {
        name: options.name,
        scopes: options.scopes,
        description: options.description,
        environment: options.environment,
        expiresInDays: options.expiresInDays,
      },
    );
    return { success: true, data: response.data };
  }

  async listApiKeys(
    options: ListApiKeysOptions = {},
  ): Promise<ApiResponse<ApiKeyInfo[]>> {
    const params = new URLSearchParams();
    if (options.includeRevoked) {
      params.append('includeRevoked', 'true');
    }
    const queryString = params.toString();
    const url = queryString
      ? `/api/v1/auth/api-keys?${queryString}`
      : '/api/v1/auth/api-keys';
    const response = await this.client.get<ApiKeyInfo[]>(url);
    return { success: true, data: response.data };
  }

  async getApiKey(id: string): Promise<ApiResponse<ApiKeyInfo>> {
    const response = await this.client.get<ApiKeyInfo>(
      `/api/v1/auth/api-keys/${id}`,
    );
    return { success: true, data: response.data };
  }

  async revokeApiKey(
    id: string,
  ): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const response = await this.client.delete<{
      success: boolean;
      message: string;
    }>(`/api/v1/auth/api-keys/${id}`);
    return { success: true, data: response.data };
  }

  async rotateApiKey(id: string): Promise<ApiResponse<ApiKeyWithSecret>> {
    const response = await this.client.post<ApiKeyWithSecret>(
      `/api/v1/auth/api-keys/${id}/rotate`,
    );
    return { success: true, data: response.data };
  }
}

/**
 * Create API client from credentials
 */
export function createApiClient(credentials: Credentials): ApiClient {
  return new ApiClient(credentials);
}
