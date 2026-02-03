/**
 * TASK-ACCT-UI-004: Supplier Management React Query hooks
 * Provides data fetching and mutations for supplier management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types matching backend DTOs
export interface Supplier {
  id: string;
  name: string;
  tradingName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  paymentTermsDays: number;
  bankName: string | null;
  branchCode: string | null;
  accountNumber: string | null;
  accountType: string | null;
  defaultAccountId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierBill {
  id: string;
  supplierId: string;
  supplierName: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  status: 'DRAFT' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  paidDate: string | null;
  purchaseOrderRef: string | null;
  notes: string | null;
  createdAt: string;
  lines?: SupplierBillLine[];
}

export interface SupplierBillLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatType: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
  vatAmountCents: number;
  totalCents: number;
  accountId: string | null;
}

export interface PayablesSummary {
  totalDueCents: number;
  overdueCents: number;
  dueThisWeekCents: number;
  supplierCount: number;
}

export interface SupplierStatement {
  supplier: Supplier;
  bills: SupplierBill[];
  openingBalanceCents: number;
  closingBalanceCents: number;
  periodStartDate: string;
  periodEndDate: string;
}

export interface CreateSupplierDto {
  name: string;
  tradingName?: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  registrationNumber?: string;
  paymentTermsDays?: number;
  bankName?: string;
  branchCode?: string;
  accountNumber?: string;
  accountType?: string;
  defaultAccountId?: string;
}

export interface CreateBillLineDto {
  description: string;
  quantity?: number;
  unitPriceCents: number;
  vatType?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
  accountId?: string;
}

export interface CreateBillDto {
  billNumber: string;
  billDate: string;
  dueDate?: string;
  purchaseOrderRef?: string;
  notes?: string;
  attachmentUrl?: string;
  lines: CreateBillLineDto[];
}

export interface RecordPaymentDto {
  amountCents: number;
  paymentDate: string;
  paymentMethod: 'EFT' | 'CASH' | 'CARD' | 'CHEQUE';
  reference?: string;
  transactionId?: string;
}

export interface SupplierListParams extends Record<string, unknown> {
  isActive?: boolean;
  search?: string;
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

// List suppliers
export function useSuppliersList(params?: SupplierListParams) {
  return useQuery<Supplier[], AxiosError>({
    queryKey: queryKeys.suppliers.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiListResponse<Supplier>>(endpoints.suppliers.list, {
        params: {
          is_active: params?.isActive,
          search: params?.search,
        },
      });
      return data.data;
    },
  });
}

// Get single supplier
export function useSupplier(id: string, enabled = true) {
  return useQuery<Supplier, AxiosError>({
    queryKey: queryKeys.suppliers.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Supplier>>(endpoints.suppliers.detail(id));
      return data.data;
    },
    enabled: enabled && !!id,
  });
}

// Get supplier statement
export function useSupplierStatement(id: string, fromDate: string, toDate: string, enabled = true) {
  return useQuery<SupplierStatement, AxiosError>({
    queryKey: queryKeys.suppliers.statement(id, { fromDate, toDate }),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<SupplierStatement>>(
        endpoints.suppliers.statement(id),
        { params: { from_date: fromDate, to_date: toDate } }
      );
      return data.data;
    },
    enabled: enabled && !!id && !!fromDate && !!toDate,
  });
}

// Get payables summary
export function usePayablesSummary() {
  return useQuery<PayablesSummary, AxiosError>({
    queryKey: queryKeys.suppliers.payablesSummary(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<PayablesSummary>>(endpoints.suppliers.payablesSummary);
      return data.data;
    },
  });
}

// Create supplier
export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation<Supplier, AxiosError, CreateSupplierDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto = {
        name: dto.name,
        trading_name: dto.tradingName,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        vat_number: dto.vatNumber,
        registration_number: dto.registrationNumber,
        payment_terms_days: dto.paymentTermsDays,
        bank_name: dto.bankName,
        branch_code: dto.branchCode,
        account_number: dto.accountNumber,
        account_type: dto.accountType,
        default_account_id: dto.defaultAccountId,
      };
      const { data } = await apiClient.post<ApiResponse<Supplier>>(endpoints.suppliers.list, apiDto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
  });
}

// Update supplier
export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient();

  return useMutation<Supplier, AxiosError, Partial<CreateSupplierDto>>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto: Record<string, unknown> = {};
      if (dto.name !== undefined) apiDto.name = dto.name;
      if (dto.tradingName !== undefined) apiDto.trading_name = dto.tradingName;
      if (dto.email !== undefined) apiDto.email = dto.email;
      if (dto.phone !== undefined) apiDto.phone = dto.phone;
      if (dto.address !== undefined) apiDto.address = dto.address;
      if (dto.vatNumber !== undefined) apiDto.vat_number = dto.vatNumber;
      if (dto.registrationNumber !== undefined) apiDto.registration_number = dto.registrationNumber;
      if (dto.paymentTermsDays !== undefined) apiDto.payment_terms_days = dto.paymentTermsDays;
      if (dto.bankName !== undefined) apiDto.bank_name = dto.bankName;
      if (dto.branchCode !== undefined) apiDto.branch_code = dto.branchCode;
      if (dto.accountNumber !== undefined) apiDto.account_number = dto.accountNumber;
      if (dto.accountType !== undefined) apiDto.account_type = dto.accountType;
      if (dto.defaultAccountId !== undefined) apiDto.default_account_id = dto.defaultAccountId;

      const { data } = await apiClient.patch<ApiResponse<Supplier>>(endpoints.suppliers.detail(id), apiDto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(id) });
    },
  });
}

// Create bill
export function useCreateBill(supplierId: string) {
  const queryClient = useQueryClient();

  return useMutation<SupplierBill, AxiosError, CreateBillDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto = {
        bill_number: dto.billNumber,
        bill_date: dto.billDate,
        due_date: dto.dueDate,
        purchase_order_ref: dto.purchaseOrderRef,
        notes: dto.notes,
        attachment_url: dto.attachmentUrl,
        lines: dto.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity ?? 1,
          unit_price_cents: line.unitPriceCents,
          vat_type: line.vatType ?? 'STANDARD',
          account_id: line.accountId,
        })),
      };
      const { data } = await apiClient.post<ApiResponse<SupplierBill>>(
        endpoints.suppliers.createBill(supplierId),
        apiDto
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(supplierId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.bills(supplierId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.payablesSummary() });
    },
  });
}

// Record payment
export function useRecordPayment(billId: string, supplierId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, RecordPaymentDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto = {
        amount_cents: dto.amountCents,
        payment_date: dto.paymentDate,
        payment_method: dto.paymentMethod,
        reference: dto.reference,
        transaction_id: dto.transactionId,
      };
      await apiClient.post(endpoints.suppliers.recordPayment(billId), apiDto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.payablesSummary() });
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(supplierId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.bills(supplierId) });
      }
    },
  });
}
