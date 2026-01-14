import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

/**
 * TASK-BILL-038: Ad-Hoc Charge types for VAT categorization
 * Maps to AdHocChargeType enum in backend
 */
export enum AdHocChargeType {
  /** Prepared meals - VAT applicable (15%) */
  MEALS = 'MEALS',
  /** Transport to/from school - VAT applicable (15%) */
  TRANSPORT = 'TRANSPORT',
  /** Late pickup penalty - VAT applicable (15%) */
  LATE_PICKUP = 'LATE_PICKUP',
  /** Extra-mural activities - VAT exempt (subordinate to education) */
  EXTRA_MURAL = 'EXTRA_MURAL',
  /** Damaged equipment - VAT applicable (15%) */
  DAMAGED_EQUIPMENT = 'DAMAGED_EQUIPMENT',
  /** Other charges - VAT determined by isVatExempt flag */
  OTHER = 'OTHER',
}

/**
 * Human-readable labels for charge types
 */
export const CHARGE_TYPE_LABELS: Record<AdHocChargeType, string> = {
  [AdHocChargeType.MEALS]: 'Meals (VAT 15%)',
  [AdHocChargeType.TRANSPORT]: 'Transport (VAT 15%)',
  [AdHocChargeType.LATE_PICKUP]: 'Late Pickup Fee (VAT 15%)',
  [AdHocChargeType.EXTRA_MURAL]: 'Extra-Mural Activity (VAT Exempt)',
  [AdHocChargeType.DAMAGED_EQUIPMENT]: 'Damaged Equipment (VAT 15%)',
  [AdHocChargeType.OTHER]: 'Other',
};

/**
 * Charge types that are VAT exempt by default
 */
export const VAT_EXEMPT_CHARGE_TYPES: AdHocChargeType[] = [
  AdHocChargeType.EXTRA_MURAL,
];

// API response types (snake_case from backend)
interface ApiAdhocCharge {
  line_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  vat_cents: number;
  account_code?: string;
  // TASK-BILL-038: New VAT compliance fields
  charge_type?: string;
  is_vat_exempt?: boolean;
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
  // TASK-BILL-038: New VAT compliance fields
  chargeType?: AdHocChargeType;
  isVatExempt?: boolean;
}

export interface AddChargeParams {
  invoiceId: string;
  description: string;
  amountCents: number;
  quantity: number;
  accountCode?: string;
  // TASK-BILL-038: New VAT compliance fields
  chargeType?: AdHocChargeType;
  isVatExempt?: boolean;
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
    // TASK-BILL-038: Transform VAT compliance fields
    chargeType: api.charge_type as AdHocChargeType | undefined,
    isVatExempt: api.is_vat_exempt,
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
    mutationFn: async ({
      invoiceId,
      description,
      amountCents,
      quantity,
      accountCode,
      chargeType,
      isVatExempt,
    }) => {
      const { data } = await apiClient.post<ApiAddChargeResponse>(
        endpoints.adhocCharges.add(invoiceId),
        {
          description,
          amount_cents: amountCents,
          quantity,
          account_code: accountCode,
          // TASK-BILL-038: Include VAT compliance fields
          charge_type: chargeType,
          is_vat_exempt: isVatExempt,
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
