/**
 * Reports Components Index
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports
 * @description Exports all report-related components.
 */

// Financial Reports Components
export { ReportHeader } from './report-header';
export { ReportSelector } from './report-selector';
export { IncomeStatement } from './income-statement';
export { AgedReceivables } from './aged-receivables';
export { VatReport } from './vat-report';
export { DateRangePicker } from './date-range-picker';
export type { DateRange } from './date-range-picker';
export { ExportButtons } from './export-buttons';
export type { ExportFormat } from './export-buttons';
export { ExportDialog } from './ExportDialog';

// TASK-REPORTS-004: Dashboard Components
export { ReportDashboard, ReportDashboardSkeleton } from './report-dashboard';
export { AIInsightsBanner, AIInsightsBannerSkeleton } from './ai-insights-banner';
export { AnomaliesCard } from './anomalies-card';
export { RecommendationsCard } from './recommendations-card';
export { ReportMetricCard, ReportMetricCardSkeleton } from './report-metric-card';
export {
  IncomeExpenseTrendChart,
  ExpenseBreakdownChart,
  MonthlyComparisonChart,
  ProfitMarginChart,
  CashFlowChart,
  ChartSkeleton,
} from './report-charts';

// TASK-REPORTS-005: Missing Report Types
export { CashFlowReport } from './cash-flow';
export { BalanceSheetReport } from './balance-sheet';
export { AgedPayablesReport } from './aged-payables';
