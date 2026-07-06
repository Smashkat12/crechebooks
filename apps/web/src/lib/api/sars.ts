/**
 * SARS API client
 *
 * Wraps GET /sars/readiness — filing readiness checklist.
 */
import { apiClient } from './client';

export interface NextDeadline {
  type: 'EMP201' | 'VAT201' | 'EMP501' | 'PROVISIONAL_TAX';
  period: string;
  dueDate: string;
  daysRemaining: number;
}

export interface ReadinessBlocker {
  severity: 'critical' | 'warning' | 'info';
  label: string;
  description: string;
  deepLinkUrl: string | null;
  count: number;
}

export interface DeadlineEntry {
  dueDate: string;
  daysRemaining: number;
}

export interface SarsDeadlines {
  emp201: DeadlineEntry;
  vat201: DeadlineEntry | null;
}

export interface SarsReadiness {
  nextDeadline: NextDeadline;
  /**
   * Per-return deadline entries (F2-A-006).
   * Populated independently so each UI card shows its own due date
   * regardless of which return is soonest overall.
   */
  deadlines: SarsDeadlines;
  blockers: ReadinessBlocker[];
  ready: boolean;
}

export async function getSarsReadiness(period?: string): Promise<SarsReadiness> {
  const params = period ? { period } : {};
  const { data } = await apiClient.get<SarsReadiness>('/sars/readiness', { params });
  return data;
}

/**
 * Download the EMP201 CSV for a given tax year/period from
 * GET /sars/emp201/download (SimplePay-backed file generation).
 */
export async function downloadEmp201Csv(
  taxYear: number,
  taxPeriod: number
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get('/sars/emp201/download', {
    params: { taxYear: String(taxYear), taxPeriod: String(taxPeriod) },
    responseType: 'blob',
  });

  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename =
    match?.[1] ?? `EMP201-${taxYear}-${String(taxPeriod).padStart(2, '0')}.csv`;

  return { blob: response.data as Blob, filename };
}
