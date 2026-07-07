import { useMutation, useQueryClient } from '@tanstack/react-query';
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

interface ApiAddChargeResponse {
  success: boolean;
  line_id: string;
  amount_cents: number;
  vat_cents: number;
  invoice_total_cents: number;
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
