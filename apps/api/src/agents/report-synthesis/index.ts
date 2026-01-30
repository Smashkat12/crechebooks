/**
 * Report Synthesis Agent Barrel Export
 * TASK-REPORTS-001: AI Report Synthesis Agent
 *
 * @module agents/report-synthesis
 * @description Public exports for the report synthesis agent module.
 */

// Agent
export { ReportSynthesisAgent } from './synthesis.agent';

// Module
export { ReportSynthesisModule } from './synthesis.module';

// Decision Logger
export { SynthesisDecisionLogger } from './decision-logger';

// Enum export (runtime value)
export { ReportType } from './interfaces/synthesis.interface';

// Type-only exports for isolatedModules compliance
export type {
  // Main types
  AIInsights,
  ReportData,
  HistoricalDataPoint,
  SynthesisDecisionLog,
  // Sub-types
  KeyFinding,
  TrendAnalysis,
  AnomalyDetection,
  Recommendation,
  // Category/enum types
  FindingCategory,
  FindingImpact,
  Severity,
  TrendDirection,
  AnomalyType,
  RecommendationCategory,
  Priority,
  // Report data types
  IncomeStatementData,
  BalanceSheetData,
  CashFlowData,
  VatReportData,
  AgedReceivablesData,
  AgedPayablesData,
} from './interfaces/synthesis.interface';

// Prompts (for testing/debugging)
export {
  buildSystemPrompt,
  buildUserPrompt,
  SYNTHESIS_TEMPERATURE,
  SYNTHESIS_MAX_TOKENS,
} from './prompts/report-prompts';
