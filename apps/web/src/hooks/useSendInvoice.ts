import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

interface SendInvoiceParams {
  invoiceId: string;
  channel: 'email' | 'whatsapp';
}

interface SendResult {
  success: boolean;
  data: {
    sent: number;
    failed: number;
    failures: Array<{
      invoice_id: string;
      invoice_number?: string;
      reason: string;
      code: string;
    }>;
  };
}

async function sendInvoice(params: SendInvoiceParams): Promise<SendResult> {
  // Map frontend channel to backend delivery method
  const deliveryMethod = params.channel === 'email' ? 'EMAIL' : 'WHATSAPP';

  const { data } = await apiClient.post<SendResult>(endpoints.invoices.send, {
    invoice_ids: [params.invoiceId],
    delivery_method: deliveryMethod,
  });

  return data;
}

export function useSendInvoice() {
  const queryClient = useQueryClient();

  return useMutation<SendResult, AxiosError, SendInvoiceParams>({
    mutationFn: sendInvoice,
    onSuccess: (data, variables) => {
      // Invalidate queries to refresh invoice list and detail
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(variables.invoiceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}
