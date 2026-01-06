import { useQuery } from '@tanstack/react-query';
import { apiClient, endpoints } from '@/lib/api';
import { VAT201Data } from '@/types/sars.types';

interface ApiVat201Response {
  success: boolean;
  data: {
    id: string;
    submission_type: string;
    period: string;
    status: string;
    output_vat: number;
    input_vat: number;
    net_vat: number;
    is_payable: boolean;
    items_requiring_review: Array<{ transaction_id: string; issue: string; severity: string }>;
    deadline: string;
    document_url: string;
  };
}

function getPeriodDates(period: string): { periodStart: string; periodEnd: string } {
  const [year, month] = period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month
  return {
    periodStart: startDate.toISOString().split('T')[0],
    periodEnd: endDate.toISOString().split('T')[0],
  };
}

async function fetchVat201(period: string): Promise<VAT201Data> {
  const { periodStart, periodEnd } = getPeriodDates(period);

  const { data } = await apiClient.post<ApiVat201Response>(endpoints.sars.vat201, {
    period_start: periodStart,
    period_end: periodEnd,
  });

  // Transform API response (snake_case, Rands) to frontend format (camelCase, cents)
  const apiData = data.data;
  return {
    period: apiData.period,
    outputVatCents: Math.round(apiData.output_vat * 100),
    inputVatCents: Math.round(apiData.input_vat * 100),
    netVatCents: Math.round(apiData.net_vat * 100),
    // These fields aren't in the API response, so we estimate from VAT amounts
    standardRatedSalesCents: Math.round((apiData.output_vat / 0.15) * 100),
    zeroRatedSalesCents: 0,
    exemptSalesCents: 0,
    standardRatedPurchasesCents: Math.round((apiData.input_vat / 0.15) * 100),
    capitalGoodsCents: 0,
    dueDate: apiData.deadline,
    isSubmitted: apiData.status === 'SUBMITTED',
    submittedAt: undefined,
  };
}

export function useSarsVat201(period: string) {
  return useQuery<VAT201Data, Error>({
    queryKey: ['sars', 'vat201', period],
    queryFn: () => fetchVat201(period),
    enabled: !!period,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}
