import { useMutation } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { downloadFile, formatFilename } from '@/utils/download';
import { ReportType } from '@crechebooks/types';

export interface ExportReportParams {
  reportType: ReportType;
  format: 'pdf' | 'csv';
  dateRange: { start: string; end: string };
  filename?: string;
}

/**
 * Maps report types to their corresponding API export endpoints
 */
const REPORT_ENDPOINTS: Record<ReportType, string> = {
  [ReportType.INCOME_STATEMENT]: '/api/reconciliation/income-statement/export',
  [ReportType.BALANCE_SHEET]: '/api/reconciliation/balance-sheet/export',
  [ReportType.VAT_REPORT]: '/api/sars/vat201/export',
  [ReportType.CASH_FLOW]: '/api/reconciliation/cash-flow/export',
  [ReportType.AGED_RECEIVABLES]: '/api/reconciliation/aged-receivables/export',
  [ReportType.AGED_PAYABLES]: '/api/reconciliation/aged-payables/export',
};

/**
 * Exports a financial report in the specified format
 * @param params - Export parameters including report type, format, and date range
 * @returns Promise resolving to the file blob
 */
async function exportReport(params: ExportReportParams): Promise<Blob> {
  const { reportType, format, dateRange } = params;

  const endpoint = REPORT_ENDPOINTS[reportType];
  if (!endpoint) {
    throw new Error(`Unsupported report type: ${reportType}`);
  }

  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('format', format);
  url.searchParams.set('start_date', dateRange.start);
  url.searchParams.set('end_date', dateRange.end);

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: format === 'pdf' ? 'application/pdf' : 'text/csv',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'Export failed. Please try again.'
    }));
    throw new Error(error.message || 'Failed to export report');
  }

  return response.blob();
}

/**
 * Hook for exporting financial reports with progress indication
 * Handles file download and provides user feedback via toast notifications
 */
export function useExportReport() {
  return useMutation<Blob, Error, ExportReportParams>({
    mutationFn: exportReport,
    onSuccess: (blob, variables) => {
      const reportName = variables.reportType.toLowerCase().replace(/_/g, '-');
      const filename = variables.filename || formatFilename(reportName, variables.format);
      downloadFile(blob, filename);

      toast({
        title: 'Export successful',
        description: `Report downloaded as ${filename}`,
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
