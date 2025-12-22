import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// API response types (snake_case from backend)
interface ApiAdhocCharge {
  line_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  vat_cents: number;
  account_code?: string;
}

interface ApiAddChargeResponse {
  success: boolean;
  line_id: string;
  amount_cents: number;
  vat_cents: number;
  invoice_total_cents: number;
}

interface ApiRemoveChargeResponse {
  success: boolean;
  invoice_total_cents: number;
}

// Frontend types (camelCase)
export interface AdhocCharge {
  lineId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  vatCents: number;
  accountCode?: string;
}

export interface AddChargeParams {
  invoiceId: string;
  description: string;
  amountCents: number;
  quantity: number;
  accountCode?: string;
}

export interface RemoveChargeParams {
  invoiceId: string;
  lineId: string;
}

// Transform API response to frontend format
function transformCharge(api: ApiAdhocCharge): AdhocCharge {
  return {
    lineId: api.line_id,
    description: api.description,
    quantity: api.quantity,
    unitPriceCents: api.unit_price_cents,
    amountCents: api.amount_cents,
    vatCents: api.vat_cents,
    accountCode: api.account_code,
  };
}

// Get list of ad-hoc charges for an invoice
export function useAdhocCharges(invoiceId: string, enabled = true) {
  return useQuery<AdhocCharge[], AxiosError>({
    queryKey: queryKeys.invoices.adhocCharges(invoiceId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ charges: ApiAdhocCharge[] }>(
        endpoints.adhocCharges.list(invoiceId)
      );
      return data.charges.map(transformCharge);
    },
    enabled: enabled && !!invoiceId,
  });
}

// Add ad-hoc charge to invoice
export function useAddCharge() {
  const queryClient = useQueryClient();

  return useMutation<
    ApiAddChargeResponse,
    AxiosError,
    AddChargeParams
  >({
    mutationFn: async ({ invoiceId, description, amountCents, quantity, accountCode }) => {
      const { data } = await apiClient.post<ApiAddChargeResponse>(
        endpoints.adhocCharges.add(invoiceId),
        {
          description,
          amount_cents: amountCents,
          quantity,
          account_code: accountCode,
        }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate invoice queries to refresh totals
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.adhocCharges(variables.invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
    },
  });
}

// Remove ad-hoc charge from invoice
export function useRemoveCharge() {
  const queryClient = useQueryClient();

  return useMutation<
    ApiRemoveChargeResponse,
    AxiosError,
    RemoveChargeParams
  >({
    mutationFn: async ({ invoiceId, lineId }) => {
      const { data } = await apiClient.delete<ApiRemoveChargeResponse>(
        endpoints.adhocCharges.remove(invoiceId, lineId)
      );
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate invoice queries to refresh totals
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.adhocCharges(variables.invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
    },
  });
}
