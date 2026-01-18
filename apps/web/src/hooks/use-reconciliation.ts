import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IReconciliation } from '@crechebooks/types';

// API response format (snake_case from backend)
interface ApiReconciliationSummary {
  success: boolean;
  data: {
    total_reconciled: number;
    total_unreconciled: number;
    last_reconciliation_date: string | null;
    reconciliation_rate: number;
    discrepancy_amount: number;
    period_count: number;
  };
}

// Frontend format (camelCase)
interface ReconciliationSummary {
  period: string;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  bankBalance: number;
  accountingBalance: number;
  difference: number;
  reconciled: boolean;
}

// API response for discrepancies endpoint (snake_case from backend)
interface ApiDiscrepancyItem {
  id: string;
  reconciliation_id: string;
  type: 'in_bank_not_xero' | 'in_xero_not_bank' | 'amount_mismatch' | 'date_mismatch';
  description: string;
  amount: number;  // Amount in Rands
  severity: 'low' | 'medium' | 'high';
  period_start: string;
  period_end: string;
  bank_account: string;
  transaction_date: string | null;
  xero_transaction_id: string | null;
}

interface ApiDiscrepanciesResponse {
  success: boolean;
  data: ApiDiscrepancyItem[];
  summary: {
    in_bank_not_xero: number;
    in_xero_not_bank: number;
    amount_mismatches: number;
    date_mismatches: number;
    total_count: number;
    total_amount: number;
  };
}

// Frontend format for discrepancies (camelCase, compatible with IReconciliationItem)
import type { IReconciliationItem } from '@crechebooks/types';

// Transform API discrepancy to IReconciliationItem for DiscrepancyList component
function transformDiscrepancyToItem(item: ApiDiscrepancyItem): IReconciliationItem {
  return {
    id: item.id,
    reconciliationId: item.reconciliation_id,
    transactionId: item.xero_transaction_id || item.id,
    xeroTransactionId: item.xero_transaction_id || undefined,
    description: item.description,
    amount: item.amount * 100, // Convert Rands to cents for IReconciliationItem
    date: item.transaction_date ? new Date(item.transaction_date) : new Date(),
    matched: false, // Discrepancies are unmatched by definition
    discrepancy: item.amount !== 0 ? item.amount * 100 : undefined, // Convert Rands to cents
  };
}

interface IncomeStatement {
  period: string;
  income: {
    category: string;
    amount: number;
  }[];
  expenses: {
    category: string;
    amount: number;
  }[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

interface ReconciliationParams extends Record<string, unknown> {
  startDate?: string;
  endDate?: string;
}

interface ReconcileParams {
  startDate: string;
  endDate: string;
  bankAccount?: string;
  openingBalance?: number;
  closingBalance?: number;
}

interface ReconcileApiResponse {
  success: boolean;
  data: {
    id: string;
    status: string;
    bank_account: string;
    period_start: string;
    period_end: string;
    opening_balance: number;
    closing_balance: number;
    calculated_balance: number;
    discrepancy: number;
    matched_count: number;
    unmatched_count: number;
  };
}

// API response for list endpoint (snake_case from backend)
interface ApiReconciliationListItem {
  id: string;
  tenant_id: string;
  bank_account: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number; // This IS the statement balance
  calculated_balance: number;
  discrepancy: number;
  status: string;
  reconciled_at: string | null;
  reconciled_by: string | null;
  matched_count: number;
  unmatched_count: number;
  created_at: string;
  updated_at: string;
}

interface ApiReconciliationListResponse {
  success: boolean;
  data: ApiReconciliationListItem[];
  total: number;
  page: number;
  limit: number;
}

interface ReconciliationHistoryParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
}

// Transform API snake_case response to frontend camelCase IReconciliation
function transformReconciliationItem(item: ApiReconciliationListItem): IReconciliation {
  return {
    id: item.id,
    tenantId: item.tenant_id,
    bankAccountId: item.bank_account,
    periodStart: new Date(item.period_start),
    periodEnd: new Date(item.period_end),
    openingBalance: item.opening_balance,
    closingBalance: item.closing_balance,
    statementBalance: item.closing_balance, // closing_balance IS the statement balance
    calculatedBalance: item.calculated_balance,
    discrepancy: item.discrepancy,
    status: item.status as IReconciliation['status'],
    reconciledAt: item.reconciled_at ? new Date(item.reconciled_at) : undefined,
    reconciledBy: item.reconciled_by || undefined,
    items: [], // Items are not returned in list endpoint
  };
}

// Get reconciliation history list
export function useReconciliationHistory(params?: ReconciliationHistoryParams) {
  return useQuery<{ data: IReconciliation[]; total: number; page: number; limit: number }, AxiosError>({
    queryKey: queryKeys.reconciliation.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiReconciliationListResponse>(
        endpoints.reconciliation.list,
        { params }
      );
      return {
        data: data.data.map(transformReconciliationItem),
        total: data.total,
        page: data.page,
        limit: data.limit,
      };
    },
  });
}

// Get reconciliation summary
export function useReconciliationSummary(params?: ReconciliationParams) {
  return useQuery<ReconciliationSummary, AxiosError>({
    queryKey: queryKeys.reconciliation.summary(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiReconciliationSummary>(
        endpoints.reconciliation.summary,
        {
          params,
        }
      );
      // Transform API snake_case response to frontend camelCase
      const apiData = data.data;
      return {
        period: apiData.last_reconciliation_date || 'No reconciliations yet',
        totalIncome: 0, // Income comes from income-statement endpoint
        totalExpenses: 0, // Expenses come from income-statement endpoint
        netProfit: 0, // Net profit comes from income-statement endpoint
        bankBalance: apiData.total_reconciled,
        accountingBalance: apiData.total_unreconciled,
        difference: apiData.discrepancy_amount,
        reconciled: apiData.reconciliation_rate >= 100 && apiData.period_count > 0,
      };
    },
  });
}

// Get reconciliation discrepancies
export function useReconciliationDiscrepancies() {
  return useQuery<{ items: IReconciliationItem[]; summary: ApiDiscrepanciesResponse['summary'] }, AxiosError>({
    queryKey: queryKeys.reconciliation.discrepancies(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiDiscrepanciesResponse>(
        endpoints.reconciliation.discrepancies
      );
      return {
        items: data.data.map(transformDiscrepancyToItem),
        summary: data.summary,
      };
    },
  });
}

// Get income statement
export function useIncomeStatement(params?: ReconciliationParams) {
  return useQuery<IncomeStatement, AxiosError>({
    queryKey: queryKeys.reports.incomeStatement(params),
    queryFn: async () => {
      const { data } = await apiClient.get<IncomeStatement>(
        endpoints.reconciliation.incomeStatement,
        {
          params,
        }
      );
      return data;
    },
  });
}

// Perform reconciliation
export function useReconcile() {
  const queryClient = useQueryClient();

  return useMutation<ReconcileApiResponse, AxiosError, ReconcileParams>({
    mutationFn: async ({ startDate, endDate, bankAccount, openingBalance, closingBalance }) => {
      // Format dates as YYYY-MM-DD
      const formatDate = (isoDate: string) => isoDate.split('T')[0];

      // Send JSON request with required fields
      const { data } = await apiClient.post<ReconcileApiResponse>(
        endpoints.reconciliation.reconcile,
        {
          bank_account: bankAccount || 'MAIN',
          period_start: formatDate(startDate),
          period_end: formatDate(endDate),
          opening_balance: openingBalance ?? 0,
          closing_balance: closingBalance ?? 0,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

// API response types for bank statement reconciliation
interface ApiBankStatementMatch {
  id: string;
  bank_date: string;
  bank_description: string;
  bank_amount: number;
  bank_is_credit: boolean;
  transaction_id: string | null;
  xero_date: string | null;
  xero_description: string | null;
  xero_amount: number | null;
  xero_is_credit: boolean | null;
  status: 'MATCHED' | 'IN_BANK_ONLY' | 'IN_XERO_ONLY' | 'AMOUNT_MISMATCH' | 'DATE_MISMATCH' | 'FEE_ADJUSTED_MATCH';
  match_confidence: number | null;
  discrepancy_reason: string | null;
  // Fee-adjusted match fields
  fee_type?: string | null;
  accrued_fee_amount?: number | null;
}

interface ApiBankStatementReconciliationResponse {
  success: boolean;
  data: {
    reconciliation_id: string;
    period_start: string;
    period_end: string;
    opening_balance: number;
    closing_balance: number;
    calculated_balance: number;
    discrepancy: number;
    match_summary: {
      matched: number;
      in_bank_only: number;
      in_xero_only: number;
      amount_mismatch: number;
      date_mismatch: number;
      fee_adjusted_match: number;
      total: number;
    };
    status: string;
    matches: ApiBankStatementMatch[];
  };
}

// Frontend types for bank statement matching
export interface BankStatementMatch {
  id: string;
  bankDate: string;
  bankDescription: string;
  bankAmount: number;
  bankIsCredit: boolean;
  transactionId: string | null;
  xeroDate: string | null;
  xeroDescription: string | null;
  xeroAmount: number | null;
  xeroIsCredit: boolean | null;
  status: 'MATCHED' | 'IN_BANK_ONLY' | 'IN_XERO_ONLY' | 'AMOUNT_MISMATCH' | 'DATE_MISMATCH' | 'FEE_ADJUSTED_MATCH';
  matchConfidence: number | null;
  discrepancyReason: string | null;
  // Fee-adjusted match fields (when status is FEE_ADJUSTED_MATCH)
  feeType?: string | null;
  accruedFeeAmount?: number | null;
}

export interface BankStatementReconciliationResult {
  reconciliationId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  matchSummary: {
    matched: number;
    inBankOnly: number;
    inXeroOnly: number;
    amountMismatch: number;
    dateMismatch: number;
    feeAdjustedMatch: number;
    total: number;
  };
  status: string;
  matches: BankStatementMatch[];
}

// Transform API match to frontend format
function transformBankStatementMatch(api: ApiBankStatementMatch): BankStatementMatch {
  return {
    id: api.id,
    bankDate: api.bank_date,
    bankDescription: api.bank_description,
    bankAmount: api.bank_amount,
    bankIsCredit: api.bank_is_credit,
    transactionId: api.transaction_id,
    xeroDate: api.xero_date,
    xeroDescription: api.xero_description,
    xeroAmount: api.xero_amount,
    xeroIsCredit: api.xero_is_credit,
    status: api.status,
    matchConfidence: api.match_confidence,
    discrepancyReason: api.discrepancy_reason,
    feeType: api.fee_type,
    accruedFeeAmount: api.accrued_fee_amount,
  };
}

// Bank statement PDF reconciliation mutation
export interface ReconcileBankStatementParams {
  file: File;
  bankAccount: string;
}

export function useReconcileBankStatement() {
  const queryClient = useQueryClient();

  return useMutation<BankStatementReconciliationResult, AxiosError, ReconcileBankStatementParams>({
    mutationFn: async ({ file, bankAccount }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bank_account', bankAccount);

      const { data } = await apiClient.post<ApiBankStatementReconciliationResponse>(
        '/reconciliation/bank-statement',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000, // 2 minutes for PDF processing
        }
      );

      // Transform API response to frontend format
      return {
        reconciliationId: data.data.reconciliation_id,
        periodStart: data.data.period_start,
        periodEnd: data.data.period_end,
        openingBalance: data.data.opening_balance,
        closingBalance: data.data.closing_balance,
        calculatedBalance: data.data.calculated_balance,
        discrepancy: data.data.discrepancy,
        matchSummary: {
          matched: data.data.match_summary.matched,
          inBankOnly: data.data.match_summary.in_bank_only,
          inXeroOnly: data.data.match_summary.in_xero_only,
          amountMismatch: data.data.match_summary.amount_mismatch,
          dateMismatch: data.data.match_summary.date_mismatch,
          feeAdjustedMatch: data.data.match_summary.fee_adjusted_match || 0,
          total: data.data.match_summary.total,
        },
        status: data.data.status,
        matches: data.data.matches.map(transformBankStatementMatch),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

// Available transaction type for manual matching
export interface AvailableTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  isCredit: boolean;
}

// API response for available transactions
interface ApiAvailableTransactionResponse {
  success: boolean;
  data: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    is_credit: boolean;
  }>;
}

// Get available transactions for manual matching
export function useAvailableTransactions(reconciliationId: string, searchTerm?: string) {
  return useQuery<AvailableTransaction[], AxiosError>({
    queryKey: ['reconciliation', reconciliationId, 'available-transactions', searchTerm],
    queryFn: async () => {
      const params = searchTerm ? { search: searchTerm } : {};
      const { data } = await apiClient.get<ApiAvailableTransactionResponse>(
        `/reconciliation/${reconciliationId}/available-transactions`,
        { params }
      );
      return data.data.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        isCredit: t.is_credit,
      }));
    },
    enabled: !!reconciliationId,
    staleTime: 0, // Always fetch fresh data for available transactions
    refetchOnWindowFocus: true, // Refetch when user returns to window
  });
}

// Manual match mutation
interface ManualMatchParams {
  reconciliationId: string;
  matchId: string;
  transactionId: string;
}

export function useManualMatch() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; status: string; matchConfidence: number | null }, AxiosError, ManualMatchParams>({
    mutationFn: async ({ reconciliationId, matchId, transactionId }) => {
      const { data } = await apiClient.post<{
        success: boolean;
        data: { id: string; status: string; match_confidence: number | null };
      }>(
        `/reconciliation/${reconciliationId}/matches/${matchId}/manual-match`,
        { transaction_id: transactionId }
      );
      return {
        id: data.data.id,
        status: data.data.status,
        matchConfidence: data.data.match_confidence,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', variables.reconciliationId] });
    },
  });
}

// Unmatch mutation
interface UnmatchParams {
  reconciliationId: string;
  matchId: string;
}

export function useUnmatch() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; status: string }, AxiosError, UnmatchParams>({
    mutationFn: async ({ reconciliationId, matchId }) => {
      const { data } = await apiClient.post<{
        success: boolean;
        data: { id: string; status: string };
      }>(
        `/reconciliation/${reconciliationId}/matches/${matchId}/unmatch`
      );
      return {
        id: data.data.id,
        status: data.data.status,
      };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', variables.reconciliationId] });
    },
  });
}

// Hook to fetch reconciliation details with match summary by ID
interface ReconciliationDetailsResponse {
  success: boolean;
  data: {
    id: string;
    status: string;
    bank_account: string;
    period_start: string;
    period_end: string;
    opening_balance: number;
    closing_balance: number;
    calculated_balance: number;
    discrepancy: number;
    matched_count: number;
    unmatched_count: number;
    match_summary?: {
      matched: number;
      in_bank_only: number;
      in_xero_only: number;
      amount_mismatch: number;
      date_mismatch: number;
      total: number;
    };
  };
}

export function useReconciliationById(reconciliationId: string | null) {
  return useQuery<ReconciliationDetailsResponse, AxiosError>({
    queryKey: ['reconciliation', reconciliationId],
    queryFn: async () => {
      if (!reconciliationId) throw new Error('No reconciliation ID');
      const { data } = await apiClient.get<ReconciliationDetailsResponse>(
        `/reconciliation/${reconciliationId}`
      );
      return data;
    },
    enabled: !!reconciliationId,
  });
}

// Hook to refresh match results for a reconciliation
export function useRefreshMatchResults(reconciliationId: string | null) {
  const queryClient = useQueryClient();

  const refreshMatches = async (): Promise<BankStatementReconciliationResult | null> => {
    if (!reconciliationId) return null;

    // Fetch reconciliation details (includes match_summary)
    const { data: reconData } = await apiClient.get<ReconciliationDetailsResponse>(
      `/reconciliation/${reconciliationId}`
    );

    // Fetch all matches
    const { data: matchData } = await apiClient.get<{
      success: boolean;
      data: Array<{
        id: string;
        bank_date: string;
        bank_description: string;
        bank_amount: number;
        bank_is_credit: boolean;
        transaction_id: string | null;
        xero_date: string | null;
        xero_description: string | null;
        xero_amount: number | null;
        xero_is_credit: boolean | null;
        status: BankStatementMatch['status'];
        match_confidence: number | null;
        discrepancy_reason: string | null;
      }>;
      total: number;
    }>(`/reconciliation/${reconciliationId}/matches`);

    // Transform to BankStatementReconciliationResult format
    const result: BankStatementReconciliationResult = {
      reconciliationId,
      periodStart: reconData.data.period_start,
      periodEnd: reconData.data.period_end,
      openingBalance: reconData.data.opening_balance,
      closingBalance: reconData.data.closing_balance,
      calculatedBalance: reconData.data.calculated_balance,
      discrepancy: reconData.data.discrepancy,
      matchSummary: reconData.data.match_summary ? {
        matched: reconData.data.match_summary.matched,
        inBankOnly: reconData.data.match_summary.in_bank_only,
        inXeroOnly: reconData.data.match_summary.in_xero_only,
        amountMismatch: reconData.data.match_summary.amount_mismatch,
        dateMismatch: reconData.data.match_summary.date_mismatch,
        feeAdjustedMatch: (reconData.data.match_summary as Record<string, number>).fee_adjusted_match || 0,
        total: reconData.data.match_summary.total,
      } : {
        matched: reconData.data.matched_count,
        inBankOnly: reconData.data.unmatched_count,
        inXeroOnly: 0,
        amountMismatch: 0,
        dateMismatch: 0,
        feeAdjustedMatch: 0,
        total: reconData.data.matched_count + reconData.data.unmatched_count,
      },
      status: reconData.data.status,
      matches: matchData.data.map((m) => ({
        id: m.id,
        bankDate: m.bank_date,
        bankDescription: m.bank_description,
        bankAmount: m.bank_amount,
        bankIsCredit: m.bank_is_credit,
        transactionId: m.transaction_id,
        xeroDate: m.xero_date,
        xeroDescription: m.xero_description,
        xeroAmount: m.xero_amount,
        xeroIsCredit: m.xero_is_credit,
        status: m.status,
        matchConfidence: m.match_confidence,
        discrepancyReason: m.discrepancy_reason,
      })),
    };

    // Invalidate queries to ensure consistency
    queryClient.invalidateQueries({ queryKey: ['reconciliation', reconciliationId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });

    return result;
  };

  return { refreshMatches };
}
