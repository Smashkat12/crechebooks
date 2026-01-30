/**
 * Export Report Hook
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module hooks/useExportReport
 * @description Hook for exporting financial reports with AI insights option.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS - errors must propagate
 * - includeInsights only applies to PDF format
 * - Proper file download handling
 */

import { useMutation } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { downloadFile, formatFilename } from '@/utils/download';
import { ReportType } from '@crechebooks/types';

export interface ExportReportParams {
  /** Report type to export */
  reportType: ReportType;
  /** Export format */
  format: 'pdf' | 'csv' | 'xlsx';
  /** Date range for the report */
  dateRange: { start: string; end: string };
  /** Whether to include AI insights (only applies to PDF) */
  includeInsights?: boolean;
  /** Custom filename (optional) */
  filename?: string;
}

/**
 * Maps report types to their corresponding API export endpoints.
 * Uses the new reports API endpoints from TASK-REPORTS-002.
 */
const REPORT_ENDPOINTS: Record<ReportType, string> = {
  [ReportType.INCOME_STATEMENT]: '/api/v1/reports/INCOME_STATEMENT/export',
  [ReportType.BALANCE_SHEET]: '/api/v1/reports/BALANCE_SHEET/export',
  [ReportType.VAT_REPORT]: '/api/v1/reports/VAT_REPORT/export',
  [ReportType.CASH_FLOW]: '/api/v1/reports/CASH_FLOW/export',
  [ReportType.AGED_RECEIVABLES]: '/api/v1/reports/AGED_RECEIVABLES/export',
  [ReportType.AGED_PAYABLES]: '/api/v1/reports/AGED_PAYABLES/export',
};

/**
 * Content type mapping for export formats.
 */
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * File extensions for export formats.
 */
const FILE_EXTENSIONS: Record<string, string> = {
  pdf: 'pdf',
  csv: 'csv',
  xlsx: 'xlsx',
};

/**
 * Exports a financial report in the specified format.
 * @param params - Export parameters including report type, format, and date range
 * @returns Promise resolving to the file blob
 */
async function exportReport(params: ExportReportParams): Promise<Blob> {
  const { reportType, format, dateRange, includeInsights } = params;

  const endpoint = REPORT_ENDPOINTS[reportType];
  if (!endpoint) {
    throw new Error(`Unsupported report type: ${reportType}`);
  }

  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('format', format.toUpperCase());
  url.searchParams.set('start', dateRange.start);
  url.searchParams.set('end', dateRange.end);

  // Only include insights param for PDF format
  if (format === 'pdf' && includeInsights !== undefined) {
    url.searchParams.set('includeInsights', String(includeInsights));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: CONTENT_TYPES[format] || 'application/octet-stream',
    },
  });

  if (!response.ok) {
    // Try to parse error message from response
    let errorMessage = 'Export failed. Please try again.';
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Response is not JSON, use default message
    }
    throw new Error(errorMessage);
  }

  return response.blob();
}

/**
 * Formats the filename for the export.
 */
function formatExportFilename(
  reportType: ReportType,
  format: string,
  includeInsights: boolean
): string {
  const reportName = reportType.toLowerCase().replace(/_/g, '-');
  const extension = FILE_EXTENSIONS[format] || format;
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const aiSuffix = format === 'pdf' && includeInsights ? '-ai' : '';

  return `${reportName}${aiSuffix}_${dateStr}.${extension}`;
}

/**
 * Hook for exporting financial reports with progress indication.
 * Handles file download and provides user feedback via toast notifications.
 *
 * @example
 * const exportReport = useExportReport();
 *
 * const handleExport = () => {
 *   exportReport.mutate({
 *     reportType: ReportType.INCOME_STATEMENT,
 *     format: 'pdf',
 *     dateRange: { start: '2025-01-01', end: '2025-01-31' },
 *     includeInsights: true,
 *   });
 * };
 */
export function useExportReport() {
  return useMutation<Blob, Error, ExportReportParams>({
    mutationFn: exportReport,
    onSuccess: (blob, variables) => {
      const filename =
        variables.filename ||
        formatExportFilename(
          variables.reportType,
          variables.format,
          variables.includeInsights ?? false
        );

      downloadFile(blob, filename);

      const formatLabel = variables.format.toUpperCase();
      const aiLabel = variables.format === 'pdf' && variables.includeInsights ? ' with AI insights' : '';

      toast({
        title: 'Export successful',
        description: `Report downloaded as ${formatLabel}${aiLabel}`,
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
