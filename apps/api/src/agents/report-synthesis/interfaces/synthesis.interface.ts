/**
 * Report Synthesis Interfaces
 * TASK-REPORTS-001: AI Report Synthesis Agent
 *
 * @module agents/report-synthesis/interfaces/synthesis.interface
 * @description TypeScript interfaces for AI-powered financial report analysis.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - Confidence scores are 0-100 (not 0-1)
 * - Source must always be tracked for audit
 */

/**
 * Report types supported by the synthesis agent.
 */
export enum ReportType {
  INCOME_STATEMENT = 'INCOME_STATEMENT',
  BALANCE_SHEET = 'BALANCE_SHEET',
  CASH_FLOW = 'CASH_FLOW',
  VAT_REPORT = 'VAT_REPORT',
  AGED_RECEIVABLES = 'AGED_RECEIVABLES',
  AGED_PAYABLES = 'AGED_PAYABLES',
}

/**
 * AI-generated insights for financial reports.
 * This is the primary output of the ReportSynthesisAgent.
 */
export interface AIInsights {
  /** 2-3 paragraph executive summary highlighting key findings */
  executiveSummary: string;
  /** Categorized observations with impact assessment */
  keyFindings: KeyFinding[];
  /** Month-over-month and year-over-year trend analysis */
  trends: TrendAnalysis[];
  /** Unusual patterns that need attention */
  anomalies: AnomalyDetection[];
  /** Prioritized action items with expected impact */
  recommendations: Recommendation[];
  /** Overall confidence score 0-100 */
  confidenceScore: number;
  /** When these insights were generated */
  generatedAt: Date;
  /** Model used for SDK execution (only present when source is SDK) */
  model?: string;
  /** Whether insights came from SDK or fallback logic */
  source: 'SDK' | 'FALLBACK';
}

/**
 * Category types for key findings.
 */
export type FindingCategory =
  | 'revenue'
  | 'expense'
  | 'profitability'
  | 'cash_flow'
  | 'risk'
  | 'compliance';

/**
 * Impact assessment for findings.
 */
export type FindingImpact = 'positive' | 'negative' | 'neutral';

/**
 * Severity levels for findings and anomalies.
 */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * A categorized observation from report analysis.
 */
export interface KeyFinding {
  /** Category of the finding */
  category: FindingCategory;
  /** Human-readable description of the finding */
  finding: string;
  /** Whether this finding has positive, negative, or neutral impact */
  impact: FindingImpact;
  /** How important this finding is */
  severity: Severity;
}

/**
 * Direction of trend movement.
 */
export type TrendDirection =
  | 'increasing'
  | 'decreasing'
  | 'stable'
  | 'volatile';

/**
 * Trend analysis for a specific metric.
 */
export interface TrendAnalysis {
  /** The metric being analyzed (e.g., "Total Revenue", "Operating Expenses") */
  metric: string;
  /** Direction of the trend */
  direction: TrendDirection;
  /** Percentage change from comparison period */
  percentageChange: number;
  /** The timeframe for this analysis (e.g., "month-over-month", "year-over-year") */
  timeframe: string;
  /** Plain-English interpretation of what this trend means */
  interpretation: string;
}

/**
 * Types of anomalies detected.
 */
export type AnomalyType = 'spike' | 'drop' | 'pattern_break' | 'outlier';

/**
 * Detection of unusual patterns in the data.
 */
export interface AnomalyDetection {
  /** Type of anomaly detected */
  type: AnomalyType;
  /** Human-readable description of the anomaly */
  description: string;
  /** Severity of the anomaly */
  severity: Severity;
  /** The metric affected by this anomaly */
  affectedMetric: string;
  /** What value was expected (in cents for monetary values) */
  expectedValue: number;
  /** What value was actually observed (in cents for monetary values) */
  actualValue: number;
  /** List of possible reasons for this anomaly */
  possibleCauses: string[];
}

/**
 * Categories for recommendations.
 */
export type RecommendationCategory =
  | 'cost_reduction'
  | 'revenue_growth'
  | 'risk_mitigation'
  | 'compliance'
  | 'efficiency'
  | 'cash_flow';

/**
 * Priority levels for recommendations.
 */
export type Priority = 'high' | 'medium' | 'low';

/**
 * Actionable recommendation based on report analysis.
 */
export interface Recommendation {
  /** How urgent this recommendation is */
  priority: Priority;
  /** Category of the recommendation */
  category: RecommendationCategory;
  /** Specific action to take */
  action: string;
  /** What impact this action is expected to have */
  expectedImpact: string;
  /** Suggested timeframe for implementation (e.g., "immediate", "next month", "next quarter") */
  timeline: string;
}

/**
 * Input data structure for Income Statement reports.
 * All amounts in cents.
 */
export interface IncomeStatementData {
  periodStart: Date;
  periodEnd: Date;
  income: {
    tuitionFeesCents: number;
    subsidiesCents: number;
    otherIncomeCents: number;
    totalCents: number;
    lineItems?: Array<{ description: string; amountCents: number }>;
  };
  expenses: {
    salariesCents: number;
    rentCents: number;
    utilitiesCents: number;
    foodCents: number;
    suppliesCents: number;
    otherExpensesCents: number;
    totalCents: number;
    lineItems?: Array<{ description: string; amountCents: number }>;
  };
  netProfitCents: number;
  profitMarginPercent: number;
}

/**
 * Input data structure for Balance Sheet reports.
 * All amounts in cents.
 */
export interface BalanceSheetData {
  asOfDate: Date;
  assets: {
    cashCents: number;
    accountsReceivableCents: number;
    prepaidExpensesCents: number;
    fixedAssetsCents: number;
    totalCents: number;
  };
  liabilities: {
    accountsPayableCents: number;
    deferredRevenueCents: number;
    loansPayableCents: number;
    totalCents: number;
  };
  equity: {
    retainedEarningsCents: number;
    capitalCents: number;
    totalCents: number;
  };
}

/**
 * Input data structure for Cash Flow reports.
 * All amounts in cents.
 */
export interface CashFlowData {
  periodStart: Date;
  periodEnd: Date;
  operatingActivities: {
    netIncomeCents: number;
    depreciationCents: number;
    receivablesChangeCents: number;
    payablesChangeCents: number;
    netCashCents: number;
  };
  investingActivities: {
    assetPurchasesCents: number;
    assetSalesCents: number;
    netCashCents: number;
  };
  financingActivities: {
    loanProceedsCents: number;
    loanRepaymentsCents: number;
    netCashCents: number;
  };
  netCashChangeCents: number;
  openingBalanceCents: number;
  closingBalanceCents: number;
}

/**
 * Input data structure for VAT reports.
 * All amounts in cents.
 */
export interface VatReportData {
  periodStart: Date;
  periodEnd: Date;
  outputVat: {
    standardRatedSalesCents: number;
    vatCollectedCents: number;
  };
  inputVat: {
    standardRatedPurchasesCents: number;
    vatPaidCents: number;
  };
  netVatPayableCents: number;
  exemptIncomeCents: number;
  zeroRatedSalesCents: number;
}

/**
 * Input data structure for Aged Receivables reports.
 * All amounts in cents.
 */
export interface AgedReceivablesData {
  asOfDate: Date;
  currentCents: number;
  days30Cents: number;
  days60Cents: number;
  days90Cents: number;
  days120PlusCents: number;
  totalCents: number;
  topDebtors?: Array<{
    name: string;
    amountCents: number;
    daysOutstanding: number;
  }>;
}

/**
 * Input data structure for Aged Payables reports.
 * All amounts in cents.
 */
export interface AgedPayablesData {
  asOfDate: Date;
  currentCents: number;
  days30Cents: number;
  days60Cents: number;
  days90Cents: number;
  days120PlusCents: number;
  totalCents: number;
  topCreditors?: Array<{
    name: string;
    amountCents: number;
    daysOutstanding: number;
  }>;
}

/**
 * Union type for all report data types.
 */
export type ReportData =
  | IncomeStatementData
  | BalanceSheetData
  | CashFlowData
  | VatReportData
  | AgedReceivablesData
  | AgedPayablesData;

/**
 * Historical data point for trend analysis.
 */
export interface HistoricalDataPoint {
  period: string;
  reportType: ReportType;
  data: ReportData;
}

/**
 * Decision log entry for audit trail.
 */
export interface SynthesisDecisionLog {
  timestamp: string;
  agentType: 'report-synthesis';
  tenantId: string;
  reportType: ReportType;
  source: 'SDK' | 'FALLBACK';
  model?: string;
  confidenceScore: number;
  findingsCount: number;
  recommendationsCount: number;
  anomaliesCount: number;
  durationMs: number;
}
