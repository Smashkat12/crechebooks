import { useQuery } from '@tanstack/react-query';
import { VAT201Data } from '@/types/sars.types';

async function fetchVat201(period: string): Promise<VAT201Data> {
  const response = await fetch(`/api/sars/vat201?period=${period}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch VAT201 data' }));
    throw new Error(error.message || 'Failed to fetch VAT201 data');
  }

  const result = await response.json();
  return result.data;
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
