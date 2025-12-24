/**
 * File download utilities for client-side file downloads
 */

/**
 * Triggers browser file download from blob
 * @param blob - The file blob to download
 * @param filename - The filename to save as
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Formats filename with report type and date
 * Output format: income-statement_20250124.pdf
 * @param reportType - The type of report (e.g., 'income-statement')
 * @param format - File format (pdf or csv)
 * @param date - Date to use in filename (defaults to current date)
 * @returns Formatted filename string
 */
export function formatFilename(
  reportType: string,
  format: 'pdf' | 'csv',
  date: Date = new Date()
): string {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const sanitizedType = reportType.toLowerCase().replace(/_/g, '-');
  return `${sanitizedType}_${dateStr}.${format}`;
}
