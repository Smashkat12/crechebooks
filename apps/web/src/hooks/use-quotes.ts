/**
 * TASK-ACCT-UI-005: Quote System React Query hooks
 * Provides data fetching and mutations for quote management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types matching backend DTOs
export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED';

export interface QuoteLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  vatType: string;
  vatAmountCents: number;
  feeStructureId: string | null;
  lineType: string | null;
  accountId: string | null;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string | null;
  parentId: string | null;
  childName: string | null;
  childDob: string | null;
  expectedStartDate: string | null;
  quoteDate: string;
  expiryDate: string;
  validityDays: number;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  status: QuoteStatus;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  convertedToInvoiceId: string | null;
  notes: string | null;
  lines: QuoteLine[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteSummary {
  totalQuotes: number;
  draftCount: number;
  sentCount: number;
  viewedCount: number;
  acceptedCount: number;
  declinedCount: number;
  expiredCount: number;
  convertedCount: number;
  totalValueCents: number;
  pendingValueCents: number;
  conversionRate: number;
}

export interface CreateQuoteLineDto {
  description: string;
  quantity?: number;
  unitPriceCents: number;
  vatType?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
  feeStructureId?: string;
  lineType?: string;
  accountId?: string;
}

export interface CreateQuoteDto {
  recipientName: string;
  recipientEmail: string;
  recipientPhone?: string;
  parentId?: string;
  childName?: string;
  childDob?: string;
  expectedStartDate?: string;
  validityDays?: number;
  notes?: string;
  lines: CreateQuoteLineDto[];
}

export interface UpdateQuoteDto {
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  childName?: string;
  childDob?: string;
  expectedStartDate?: string;
  validityDays?: number;
  notes?: string;
  lines?: CreateQuoteLineDto[];
}

export interface QuoteListParams extends Record<string, unknown> {
  status?: QuoteStatus;
  parentId?: string;
  recipientEmail?: string;
  limit?: number;
  offset?: number;
}

// API response wrapper types
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
}

// List quotes
export function useQuotesList(params?: QuoteListParams) {
  return useQuery<Quote[], AxiosError>({
    queryKey: queryKeys.quotes.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiListResponse<Quote>>(endpoints.quotes.list, {
        params: {
          status: params?.status,
          parent_id: params?.parentId,
          recipient_email: params?.recipientEmail,
          limit: params?.limit,
          offset: params?.offset,
        },
      });
      return data.data;
    },
  });
}

// Get single quote
export function useQuote(id: string, enabled = true) {
  return useQuery<Quote, AxiosError>({
    queryKey: queryKeys.quotes.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Quote>>(endpoints.quotes.detail(id));
      return data.data;
    },
    enabled: enabled && !!id,
  });
}

// Get quotes summary
export function useQuoteSummary(fromDate?: string, toDate?: string) {
  return useQuery<QuoteSummary, AxiosError>({
    queryKey: queryKeys.quotes.summary({ fromDate, toDate }),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<QuoteSummary>>(endpoints.quotes.summary, {
        params: { from_date: fromDate, to_date: toDate },
      });
      return data.data;
    },
  });
}

// Create quote
export function useCreateQuote() {
  const queryClient = useQueryClient();

  return useMutation<Quote, AxiosError, CreateQuoteDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto = {
        recipient_name: dto.recipientName,
        recipient_email: dto.recipientEmail,
        recipient_phone: dto.recipientPhone,
        parent_id: dto.parentId,
        child_name: dto.childName,
        child_dob: dto.childDob,
        expected_start_date: dto.expectedStartDate,
        validity_days: dto.validityDays,
        notes: dto.notes,
        lines: dto.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity ?? 1,
          unit_price_cents: line.unitPriceCents,
          vat_type: line.vatType ?? 'EXEMPT',
          fee_structure_id: line.feeStructureId,
          line_type: line.lineType,
          account_id: line.accountId,
        })),
      };
      const { data } = await apiClient.post<ApiResponse<Quote>>(endpoints.quotes.list, apiDto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
    },
  });
}

// Update quote
export function useUpdateQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation<Quote, AxiosError, UpdateQuoteDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto: Record<string, unknown> = {};
      if (dto.recipientName !== undefined) apiDto.recipient_name = dto.recipientName;
      if (dto.recipientEmail !== undefined) apiDto.recipient_email = dto.recipientEmail;
      if (dto.recipientPhone !== undefined) apiDto.recipient_phone = dto.recipientPhone;
      if (dto.childName !== undefined) apiDto.child_name = dto.childName;
      if (dto.childDob !== undefined) apiDto.child_dob = dto.childDob;
      if (dto.expectedStartDate !== undefined) apiDto.expected_start_date = dto.expectedStartDate;
      if (dto.validityDays !== undefined) apiDto.validity_days = dto.validityDays;
      if (dto.notes !== undefined) apiDto.notes = dto.notes;
      if (dto.lines !== undefined) {
        apiDto.lines = dto.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity ?? 1,
          unit_price_cents: line.unitPriceCents,
          vat_type: line.vatType ?? 'EXEMPT',
          fee_structure_id: line.feeStructureId,
          line_type: line.lineType,
          account_id: line.accountId,
        }));
      }

      const { data } = await apiClient.patch<ApiResponse<Quote>>(endpoints.quotes.detail(id), apiDto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    },
  });
}

// Send quote
export function useSendQuote() {
  const queryClient = useQueryClient();

  return useMutation<Quote, AxiosError, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.post<ApiResponse<Quote>>(endpoints.quotes.send(id));
      return data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    },
  });
}

// Accept quote
export function useAcceptQuote() {
  const queryClient = useQueryClient();

  return useMutation<Quote, AxiosError, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.post<ApiResponse<Quote>>(endpoints.quotes.accept(id));
      return data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    },
  });
}

// Decline quote
export function useDeclineQuote() {
  const queryClient = useQueryClient();

  return useMutation<Quote, AxiosError, { id: string; reason?: string }>({
    mutationFn: async ({ id, reason }) => {
      const { data } = await apiClient.post<ApiResponse<Quote>>(endpoints.quotes.decline(id), { reason });
      return data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    },
  });
}

// Convert quote to enrollment/invoice
export function useConvertQuote() {
  const queryClient = useQueryClient();

  return useMutation<Quote, AxiosError, { id: string; dueDate?: string; notes?: string }>({
    mutationFn: async ({ id, dueDate, notes }) => {
      const { data } = await apiClient.post<ApiResponse<Quote>>(endpoints.quotes.convert(id), {
        due_date: dueDate,
        notes,
      });
      return data.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
    },
  });
}
