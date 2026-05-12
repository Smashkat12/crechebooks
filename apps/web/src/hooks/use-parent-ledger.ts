/**
 * Live parent ledger hooks
 *
 * Exposes the GET /statements/parents/:parentId/ledger endpoint and its
 * PDF sibling. The ledger is computed on every fetch — no Statement
 * record is persisted. Mutations on invoices/payments invalidate the
 * relevant queries so the ledger reflects them without a "generate" step.
 */

import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { StatementLine, StatementParent } from './use-statements';

export interface ParentLedger {
  parent: StatementParent;
  period_start: string;
  period_end: string;
  opening_balance_cents: number;
  total_charges_cents: number;
  total_payments_cents: number;
  total_credits_cents: number;
  closing_balance_cents: number;
  lines: StatementLine[];
  is_live: boolean;
}

interface ParentLedgerResponse {
  success: boolean;
  data: ParentLedger;
}

export interface ParentLedgerParams extends Record<string, unknown> {
  /** YYYY-MM-DD. Omit for default (3 months before period_end). */
  periodStart?: string;
  /** YYYY-MM-DD. Omit for default (today). */
  periodEnd?: string;
}

/**
 * Fetch the live ledger for a parent. Always reflects current invoice
 * and payment state — no manual "generate" required.
 */
export function useParentLedger(
  parentId: string,
  params?: ParentLedgerParams,
  enabled = true,
) {
  return useQuery<ParentLedger, AxiosError>({
    queryKey: queryKeys.statements.parentLedger(parentId, params),
    queryFn: async () => {
      const apiParams: Record<string, string> = {};
      if (params?.periodStart) apiParams.period_start = params.periodStart;
      if (params?.periodEnd) apiParams.period_end = params.periodEnd;

      const { data } = await apiClient.get<ParentLedgerResponse>(
        endpoints.statements.parentLedger(parentId),
        { params: apiParams },
      );

      if (!data.success) {
        throw new Error('Failed to load ledger');
      }
      return data.data;
    },
    enabled: enabled && !!parentId,
  });
}

/**
 * Trigger a PDF download for the live ledger. Uses fetch + Authorization
 * header rather than a query so the user gets a download stream.
 */
export function useDownloadParentLedgerPdf() {
  const downloadPdf = async (
    parentId: string,
    params?: ParentLedgerParams,
  ): Promise<void> => {
    const { getSession } = await import('next-auth/react');
    const session = await getSession();

    const headers: HeadersInit = {};
    if (session?.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }

    const qs = new URLSearchParams();
    if (params?.periodStart) qs.set('period_start', params.periodStart);
    if (params?.periodEnd) qs.set('period_end', params.periodEnd);

    const url =
      `${apiClient.defaults.baseURL}${endpoints.statements.parentLedgerPdf(parentId)}` +
      (qs.toString() ? `?${qs.toString()}` : '');

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const filename =
      response.headers
        .get('Content-Disposition')
        ?.match(/filename="?([^"]+)"?/)?.[1] ??
      `Ledger_${parentId}.pdf`;

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  };

  return { downloadPdf };
}
