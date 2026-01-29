/**
 * Report Synthesis Agent
 * TASK-REPORTS-001: AI Report Synthesis Agent
 *
 * @module agents/report-synthesis/synthesis.agent
 * @description AI-powered financial report analysis agent.
 * Extends BaseSdkAgent with executeWithFallback pattern.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS OR FALLBACKS that silently swallow errors
 * - Fallback to rule-based insights if Claude fails (logged, not silent)
 * - ALL monetary values are CENTS (integers)
 * - Decision logging for all synthesis operations
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { BaseSdkAgent } from '../sdk/base-sdk-agent';
import { SdkAgentFactory } from '../sdk/sdk-agent.factory';
import { SdkConfigService } from '../sdk/sdk-config';
import { ClaudeClientService } from '../sdk/claude-client.service';
import {
  AgentDefinition,
  SdkExecutionResult,
} from '../sdk/interfaces/sdk-agent.interface';
import { SynthesisDecisionLogger } from './decision-logger';
import {
  AIInsights,
  ReportType,
  ReportData,
  HistoricalDataPoint,
  KeyFinding,
  AnomalyDetection,
  Recommendation,
  IncomeStatementData,
  BalanceSheetData,
  AgedReceivablesData,
  AgedPayablesData,
} from './interfaces/synthesis.interface';
import {
  buildSystemPrompt,
  buildUserPrompt,
  SYNTHESIS_TEMPERATURE,
  SYNTHESIS_MAX_TOKENS,
} from './prompts/report-prompts';

/**
 * Report Synthesis Agent - Generates AI-powered financial insights.
 *
 * This agent extends BaseSdkAgent to provide:
 * - AI-powered analysis via Claude (when SDK is available)
 * - Rule-based fallback when SDK is unavailable
 * - Decision logging for audit trail
 */
@Injectable()
export class ReportSynthesisAgent extends BaseSdkAgent {
  protected override readonly logger = new Logger(ReportSynthesisAgent.name);

  constructor(
    factory: SdkAgentFactory,
    config: SdkConfigService,
    @Optional()
    @Inject(ClaudeClientService)
    private readonly claudeClient?: ClaudeClientService,
    @Optional()
    @Inject(SynthesisDecisionLogger)
    private readonly decisionLogger?: SynthesisDecisionLogger,
  ) {
    super(factory, config, 'ReportSynthesisAgent');
  }

  /**
   * Get the agent definition for report synthesis.
   * @param tenantId - Tenant ID for tenant-specific configuration
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return {
      description: 'Analyzes financial reports and generates AI insights',
      prompt: buildSystemPrompt(ReportType.INCOME_STATEMENT, tenantId),
      tools: [], // Pure analysis, no tool calls needed
      model: this.config.getModelForAgent('orchestrator'), // Use sonnet for complex reasoning
    };
  }

  /**
   * Synthesize AI insights for a financial report.
   *
   * Uses executeWithFallback pattern:
   * 1. Try SDK (Claude) analysis if available
   * 2. Fall back to rule-based analysis if SDK fails
   *
   * @param reportType - Type of report being analyzed
   * @param reportData - The report data to analyze
   * @param historicalData - Optional historical data for trend analysis
   * @param tenantId - Tenant ID for tenant-specific context
   * @returns AI insights with source tracking
   */
  async synthesizeReport(
    reportType: ReportType,
    reportData: ReportData,
    historicalData: HistoricalDataPoint[],
    tenantId: string,
  ): Promise<SdkExecutionResult<AIInsights>> {
    const start = Date.now();

    this.logger.log(`Synthesizing ${reportType} report for tenant ${tenantId}`);

    const result = await this.executeWithFallback(
      async () =>
        this.sdkSynthesize(reportType, reportData, historicalData, tenantId),
      async () => this.fallbackSynthesize(reportType, reportData),
    );

    // Copy model from AI insights to result wrapper (if SDK was used)
    if (result.source === 'SDK' && result.data.model) {
      result.model = result.data.model;
    }

    const durationMs = Date.now() - start;

    // Log the decision
    await this.logDecision(tenantId, reportType, result, durationMs);

    this.logger.log(
      `Synthesis complete: source=${result.source}, ` +
        `confidence=${String(result.data.confidenceScore)}, ` +
        `findings=${String(result.data.keyFindings.length)}, ` +
        `duration=${String(durationMs)}ms`,
    );

    return result;
  }

  /**
   * SDK-powered synthesis using Claude.
   * @throws Error if Claude call fails
   */
  private async sdkSynthesize(
    reportType: ReportType,
    reportData: ReportData,
    historicalData: HistoricalDataPoint[],
    tenantId: string,
  ): Promise<AIInsights> {
    if (!this.claudeClient) {
      throw new Error('ClaudeClientService not available');
    }

    if (!this.claudeClient.isAvailable()) {
      throw new Error('Claude API not configured or unavailable');
    }

    const systemPrompt = buildSystemPrompt(reportType, tenantId);
    const userPrompt = buildUserPrompt(reportType, reportData, historicalData);

    this.logger.debug('Calling Claude for report synthesis');

    const response = await this.claudeClient.sendMessage({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model: 'sonnet', // Use sonnet for complex reasoning
      maxTokens: SYNTHESIS_MAX_TOKENS,
      temperature: SYNTHESIS_TEMPERATURE,
    });

    // Parse and validate the response
    const insights = this.parseClaudeResponse(response.content, response.model);

    return insights;
  }

  /**
   * Parse and validate Claude's JSON response.
   * @throws Error if response is invalid
   */
  private parseClaudeResponse(content: string, model: string): AIInsights {
    // Remove markdown code blocks if present
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    }
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    jsonContent = jsonContent.trim();

    // Try to extract JSON from the response
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error('No JSON object found in Claude response');
      throw new Error('Invalid Claude response: no JSON object found');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      this.logger.error(
        `Failed to parse Claude response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      );
      throw new Error(
        `Invalid Claude response: JSON parse failed - ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      );
    }

    // Validate structure
    const insights = parsed as Partial<AIInsights>;
    if (
      typeof insights.executiveSummary !== 'string' ||
      !Array.isArray(insights.keyFindings) ||
      !Array.isArray(insights.trends) ||
      !Array.isArray(insights.anomalies) ||
      !Array.isArray(insights.recommendations) ||
      typeof insights.confidenceScore !== 'number'
    ) {
      this.logger.error('Claude response missing required fields');
      throw new Error('Invalid Claude response: missing required fields');
    }

    return {
      executiveSummary: insights.executiveSummary,
      keyFindings: insights.keyFindings,
      trends: insights.trends,
      anomalies: insights.anomalies,
      recommendations: insights.recommendations,
      confidenceScore: Math.min(100, Math.max(0, insights.confidenceScore)),
      generatedAt: new Date(),
      model,
      source: 'SDK',
    };
  }

  /**
   * Rule-based fallback synthesis when Claude is unavailable.
   * Generates basic insights using deterministic rules.
   */
  private fallbackSynthesize(
    reportType: ReportType,
    reportData: ReportData,
  ): Promise<AIInsights> {
    this.logger.warn(
      'Using fallback rule-based synthesis (SDK unavailable or failed)',
    );

    let result: AIInsights;
    switch (reportType) {
      case ReportType.INCOME_STATEMENT:
        result = this.fallbackIncomeStatement(
          reportData as IncomeStatementData,
        );
        break;
      case ReportType.BALANCE_SHEET:
        result = this.fallbackBalanceSheet(reportData as BalanceSheetData);
        break;
      case ReportType.AGED_RECEIVABLES:
        result = this.fallbackAgedReceivables(
          reportData as AgedReceivablesData,
        );
        break;
      case ReportType.AGED_PAYABLES:
        result = this.fallbackAgedPayables(reportData as AgedPayablesData);
        break;
      default:
        result = this.fallbackGeneric(reportType, reportData);
        break;
    }
    return Promise.resolve(result);
  }

  /**
   * Fallback analysis for Income Statement.
   */
  private fallbackIncomeStatement(data: IncomeStatementData): AIInsights {
    const totalIncome = data.income?.totalCents ?? 0;
    const totalExpenses = data.expenses?.totalCents ?? 0;
    const netProfit = data.netProfitCents ?? totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    const findings: KeyFinding[] = [];
    const recommendations: Recommendation[] = [];
    const anomalies: AnomalyDetection[] = [];

    // Profit analysis
    if (netProfit >= 0) {
      findings.push({
        category: 'profitability',
        finding: `The creche is profitable with a net profit of R${(netProfit / 100).toFixed(2)}.`,
        impact: 'positive',
        severity: 'low',
      });
    } else {
      findings.push({
        category: 'profitability',
        finding: `The creche is operating at a loss of R${(Math.abs(netProfit) / 100).toFixed(2)}.`,
        impact: 'negative',
        severity: 'high',
      });
      recommendations.push({
        priority: 'high',
        category: 'cost_reduction',
        action: 'Review all expenses and identify cost-cutting opportunities.',
        expectedImpact: 'Reduce monthly operating loss.',
        timeline: 'immediate',
      });
    }

    // Staff cost analysis
    const staffCosts = data.expenses?.salariesCents ?? 0;
    const staffCostRatio =
      totalExpenses > 0 ? (staffCosts / totalExpenses) * 100 : 0;
    if (staffCostRatio > 70) {
      findings.push({
        category: 'expense',
        finding: `Staff costs represent ${staffCostRatio.toFixed(1)}% of total expenses, which is above the typical 60-70% range.`,
        impact: 'negative',
        severity: 'medium',
      });
      recommendations.push({
        priority: 'medium',
        category: 'efficiency',
        action:
          'Review staffing levels and consider optimizing staff-to-child ratios.',
        expectedImpact: 'Reduce staff costs by 5-10%.',
        timeline: 'next quarter',
      });
    }

    // Revenue concentration
    const tuitionRatio =
      totalIncome > 0
        ? ((data.income?.tuitionFeesCents ?? 0) / totalIncome) * 100
        : 0;
    if (tuitionRatio > 90) {
      findings.push({
        category: 'risk',
        finding: `Revenue is highly concentrated in tuition fees (${tuitionRatio.toFixed(1)}%).`,
        impact: 'neutral',
        severity: 'low',
      });
      recommendations.push({
        priority: 'low',
        category: 'revenue_growth',
        action:
          'Consider diversifying income sources (e.g., after-school programs, holiday care).',
        expectedImpact: 'Reduce revenue concentration risk.',
        timeline: 'next year',
      });
    }

    const executiveSummary = this.generateBasicSummary(
      totalIncome,
      totalExpenses,
      netProfit,
      profitMargin,
    );

    return {
      executiveSummary,
      keyFindings: findings,
      trends: [], // No historical analysis in fallback
      anomalies,
      recommendations,
      confidenceScore: 50, // Lower confidence for rule-based
      generatedAt: new Date(),
      source: 'FALLBACK',
    };
  }

  /**
   * Fallback analysis for Balance Sheet.
   */
  private fallbackBalanceSheet(data: BalanceSheetData): AIInsights {
    const totalAssets = data.assets?.totalCents ?? 0;
    const totalLiabilities = data.liabilities?.totalCents ?? 0;
    const totalEquity = data.equity?.totalCents ?? 0;

    const findings: KeyFinding[] = [];
    const recommendations: Recommendation[] = [];

    // Liquidity analysis
    const currentAssets =
      (data.assets?.cashCents ?? 0) +
      (data.assets?.accountsReceivableCents ?? 0) +
      (data.assets?.prepaidExpensesCents ?? 0);
    const currentLiabilities =
      (data.liabilities?.accountsPayableCents ?? 0) +
      (data.liabilities?.deferredRevenueCents ?? 0);
    const currentRatio =
      currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;

    if (currentRatio < 1) {
      findings.push({
        category: 'risk',
        finding: `Current ratio of ${currentRatio.toFixed(2)} indicates potential liquidity concerns.`,
        impact: 'negative',
        severity: 'high',
      });
      recommendations.push({
        priority: 'high',
        category: 'cash_flow',
        action: 'Improve cash collection from outstanding receivables.',
        expectedImpact: 'Improve current ratio above 1.0.',
        timeline: 'immediate',
      });
    } else if (currentRatio >= 2) {
      findings.push({
        category: 'cash_flow',
        finding: `Strong current ratio of ${currentRatio.toFixed(2)} indicates good liquidity.`,
        impact: 'positive',
        severity: 'low',
      });
    }

    // Receivables analysis
    const receivables = data.assets?.accountsReceivableCents ?? 0;
    if (receivables > totalAssets * 0.4) {
      findings.push({
        category: 'risk',
        finding: `Accounts receivable represents ${((receivables / totalAssets) * 100).toFixed(1)}% of total assets.`,
        impact: 'negative',
        severity: 'medium',
      });
      recommendations.push({
        priority: 'high',
        category: 'risk_mitigation',
        action:
          'Implement stricter payment terms and follow up on overdue accounts.',
        expectedImpact: 'Reduce receivables by 20-30%.',
        timeline: 'next month',
      });
    }

    const executiveSummary =
      `Balance sheet analysis as at ${data.asOfDate.toISOString().slice(0, 10)}: ` +
      `Total assets of R${(totalAssets / 100).toFixed(2)} with liabilities of ` +
      `R${(totalLiabilities / 100).toFixed(2)}, resulting in equity of ` +
      `R${(totalEquity / 100).toFixed(2)}. ` +
      `The current ratio is ${currentRatio.toFixed(2)}.`;

    return {
      executiveSummary,
      keyFindings: findings,
      trends: [],
      anomalies: [],
      recommendations,
      confidenceScore: 50,
      generatedAt: new Date(),
      source: 'FALLBACK',
    };
  }

  /**
   * Fallback analysis for Aged Receivables.
   */
  private fallbackAgedReceivables(data: AgedReceivablesData): AIInsights {
    const totalReceivables = data.totalCents ?? 0;
    const overdueAmount =
      (data.days30Cents ?? 0) +
      (data.days60Cents ?? 0) +
      (data.days90Cents ?? 0) +
      (data.days120PlusCents ?? 0);
    const overduePercentage =
      totalReceivables > 0 ? (overdueAmount / totalReceivables) * 100 : 0;

    const findings: KeyFinding[] = [];
    const recommendations: Recommendation[] = [];
    const anomalies: AnomalyDetection[] = [];

    // Overdue analysis
    if (overduePercentage > 30) {
      findings.push({
        category: 'risk',
        finding: `${overduePercentage.toFixed(1)}% of receivables are overdue (30+ days).`,
        impact: 'negative',
        severity: 'high',
      });
      recommendations.push({
        priority: 'high',
        category: 'cash_flow',
        action:
          'Implement aggressive collection procedures for overdue accounts.',
        expectedImpact: 'Recover 50% of overdue amounts within 30 days.',
        timeline: 'immediate',
      });
    }

    // 90+ days analysis
    const seriouslyOverdue =
      (data.days90Cents ?? 0) + (data.days120PlusCents ?? 0);
    if (seriouslyOverdue > 0) {
      findings.push({
        category: 'risk',
        finding: `R${(seriouslyOverdue / 100).toFixed(2)} is seriously overdue (90+ days).`,
        impact: 'negative',
        severity: 'critical',
      });
      recommendations.push({
        priority: 'high',
        category: 'risk_mitigation',
        action: 'Consider bad debt provision for accounts over 90 days.',
        expectedImpact: 'Accurate financial reporting.',
        timeline: 'immediate',
      });
    }

    const executiveSummary =
      `Aged receivables as at ${data.asOfDate.toISOString().slice(0, 10)}: ` +
      `Total outstanding of R${(totalReceivables / 100).toFixed(2)} with ` +
      `R${(overdueAmount / 100).toFixed(2)} (${overduePercentage.toFixed(1)}%) overdue. ` +
      `${seriouslyOverdue > 0 ? `Attention required for R${(seriouslyOverdue / 100).toFixed(2)} in seriously overdue accounts (90+ days).` : 'No seriously overdue accounts.'}`;

    return {
      executiveSummary,
      keyFindings: findings,
      trends: [],
      anomalies,
      recommendations,
      confidenceScore: 50,
      generatedAt: new Date(),
      source: 'FALLBACK',
    };
  }

  /**
   * Fallback analysis for Aged Payables.
   */
  private fallbackAgedPayables(data: AgedPayablesData): AIInsights {
    const totalPayables = data.totalCents ?? 0;
    const overdueAmount =
      (data.days30Cents ?? 0) +
      (data.days60Cents ?? 0) +
      (data.days90Cents ?? 0) +
      (data.days120PlusCents ?? 0);

    const findings: KeyFinding[] = [];
    const recommendations: Recommendation[] = [];

    // Overdue payables
    if (overdueAmount > 0) {
      findings.push({
        category: 'risk',
        finding: `R${(overdueAmount / 100).toFixed(2)} in overdue payables may affect supplier relationships.`,
        impact: 'negative',
        severity: 'medium',
      });
      recommendations.push({
        priority: 'medium',
        category: 'risk_mitigation',
        action: 'Prioritize payment of overdue supplier invoices.',
        expectedImpact: 'Maintain good supplier relationships.',
        timeline: 'next month',
      });
    }

    const executiveSummary =
      `Aged payables as at ${data.asOfDate.toISOString().slice(0, 10)}: ` +
      `Total payables of R${(totalPayables / 100).toFixed(2)}. ` +
      `${overdueAmount > 0 ? `R${(overdueAmount / 100).toFixed(2)} is overdue and should be prioritized.` : 'All payables are current.'}`;

    return {
      executiveSummary,
      keyFindings: findings,
      trends: [],
      anomalies: [],
      recommendations,
      confidenceScore: 50,
      generatedAt: new Date(),
      source: 'FALLBACK',
    };
  }

  /**
   * Generic fallback for unsupported report types.
   */
  private fallbackGeneric(
    reportType: ReportType,
    _reportData: ReportData,
  ): AIInsights {
    this.logger.warn(
      `No specific fallback handler for ${reportType}, using generic`,
    );

    return {
      executiveSummary: `${reportType.replace(/_/g, ' ')} analysis generated using rule-based fallback. AI-powered insights are currently unavailable.`,
      keyFindings: [
        {
          category: 'risk',
          finding:
            'AI analysis unavailable. Manual review of report data recommended.',
          impact: 'neutral',
          severity: 'low',
        },
      ],
      trends: [],
      anomalies: [],
      recommendations: [
        {
          priority: 'low',
          category: 'efficiency',
          action: 'Review report data manually for insights.',
          expectedImpact: 'Gain understanding of financial position.',
          timeline: 'immediate',
        },
      ],
      confidenceScore: 30, // Very low confidence for generic fallback
      generatedAt: new Date(),
      source: 'FALLBACK',
    };
  }

  /**
   * Generate a basic executive summary for income statements.
   */
  private generateBasicSummary(
    income: number,
    expenses: number,
    profit: number,
    margin: number,
  ): string {
    const incomeRands = (income / 100).toFixed(2);
    const expensesRands = (expenses / 100).toFixed(2);
    const profitRands = Math.abs(profit / 100).toFixed(2);
    const status = profit >= 0 ? 'profitable' : 'operating at a loss';
    const profitWord = profit >= 0 ? 'profit' : 'loss';

    return (
      `For the reporting period, the creche generated R${incomeRands} in income ` +
      `against R${expensesRands} in expenses, resulting in a ${status} position ` +
      `with a net ${profitWord} of R${profitRands} (${Math.abs(margin).toFixed(1)}% margin). ` +
      `This analysis was generated using rule-based fallback as AI insights were unavailable.`
    );
  }

  /**
   * Log the synthesis decision to the audit trail.
   * Non-blocking: errors are caught and logged.
   */
  private async logDecision(
    tenantId: string,
    reportType: ReportType,
    result: SdkExecutionResult<AIInsights>,
    durationMs: number,
  ): Promise<void> {
    if (!this.decisionLogger) {
      return;
    }

    try {
      await this.decisionLogger.logSynthesis({
        tenantId,
        reportType,
        source: result.source,
        model: result.model,
        confidenceScore: result.data.confidenceScore,
        findingsCount: result.data.keyFindings.length,
        recommendationsCount: result.data.recommendations.length,
        anomaliesCount: result.data.anomalies.length,
        durationMs,
      });
    } catch (error) {
      // Non-blocking - log but don't fail
      this.logger.warn(
        `Failed to log decision: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
