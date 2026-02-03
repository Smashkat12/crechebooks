// Export all hooks for easy importing
export * from './use-transactions';
export * from './use-invoices';
export * from './use-payments';
export * from './use-arrears';
export * from './use-parents';
export * from './use-sars';
export * from './use-reconciliation';
export * from './use-staff';
export * from './use-dashboard';
export { useExportReport } from './useExportReport';
export type { ExportReportParams } from './useExportReport';
export { useBreakpoint, useMinBreakpoint, useMaxBreakpoint } from './useBreakpoint';
export type { UseBreakpointReturn } from './useBreakpoint';
export * from './use-simplepay';
export * from './use-leave';
export * from './use-xero-split';

// TASK-REPORTS-004: Report data and AI insights hooks
export { useReportData, reportDataQueryKeys } from './use-report-data';
export type {
  ReportDataResponse,
  ReportSummary,
  ReportSection,
  AccountBreakdown,
  ChartData,
  MonthlyTrendPoint,
  CategoryBreakdown,
  ComparisonPoint,
  ProfitMarginPoint,
  HistoricalDataPoint,
  Period,
} from './use-report-data';
export { useAIInsights, aiInsightsQueryKeys } from './use-ai-insights';
export type {
  AIInsights,
  KeyFinding,
  TrendAnalysis,
  AnomalyDetection,
  Recommendation,
  Severity,
  Impact,
  TrendDirection,
  AnomalyType,
  RecommendationPriority,
  FindingCategory,
  RecommendationCategory,
} from './use-ai-insights';

// TASK-UI-008: Mobile responsiveness hooks
export {
  useMobile,
  useMobileWindow,
  useTouchDevice,
  useOrientation,
  useMobileUtils,
} from './use-mobile';

// TASK-ADMIN-001: Impersonation hooks
export * from './use-impersonation';

// TASK-ACCT-UI-001: Chart of Accounts hooks
export * from './use-accounts';

// TASK-PAY-021: Payroll Processing hooks
export * from './use-payroll-processing';

// TASK-FIX-005: Bank Fee Configuration hooks
export * from './use-bank-fees';
