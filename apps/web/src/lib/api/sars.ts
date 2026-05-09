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
