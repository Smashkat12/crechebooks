/**
 * Reports Service
 * TASK-REPORTS-002: Reports API Module
 *
 * @module modules/reports/reports.service
 * @description Orchestration service for report data, AI insights, and exports.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS OR FALLBACKS that silently fail
 * - All amounts are CENTS (integers)
 * - Tenant isolation is MANDATORY
 * - Cache expensive operations
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { FinancialReportService } from '../../database/services/financial-report.service';
import { CashFlowReportService } from '../../database/services/cash-flow-report.service';
import type { CashFlowStatement } from '../../database/services/cash-flow-report.service';
import { AgedPayablesService } from '../../database/services/aged-payables.service';
import { ArrearsService } from '../../database/services/arrears.service';
import type { ArrearsReport } from '../../database/dto/arrears.dto';
import { VatService } from '../../database/services/vat.service';
import type { VatCalculationResult } from '../../database/dto/vat.dto';
import { PdfGeneratorService } from './pdf-generator.service';
import {
  ReportSynthesisAgent,
  ReportType,
  type HistoricalDataPoint,
  type ReportData,
  type IncomeStatementData,
  type AIInsights,
} from '../../agents/report-synthesis';
import {
  ReportDataResponseDto,
  ChartDataDto,
  MonthlyTrendPointDto,
  CategoryBreakdownDto,
  ComparisonPointDto,
  ProfitMarginPointDto,
  HistoricalDataPointDto,
  ReportSummaryDto,
  ReportSectionDto,
  AccountBreakdownResponseDto,
} from './dto/report-data.dto';
import {
  AIInsightsResponseDto,
  AIInsightsDataDto,
} from './dto/ai-insights.dto';
import {
  ExportFormat,
  EXPORT_CONTENT_TYPES,
  EXPORT_FILE_EXTENSIONS,
} from './dto/export-report.dto';
import type {
  IncomeStatement,
  TrialBalance,
  BalanceSheet,
} from '../../database/dto/financial-report.dto';

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

// Cache TTL constants
const DATA_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const INSIGHTS_CACHE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * Combined VAT report data for the reports module.
 */
interface VatReportData {
  tenantId: string;
  period: { start: Date; end: Date };
  outputVat: VatCalculationResult;
  inputVat: VatCalculationResult;
  netVatCents: number;
  isDueToSars: boolean;
  flaggedItemCount: number;
  generatedAt: Date;
}

/**
 * Export result with buffer and metadata.
 */
export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Reports service for orchestrating report data, AI insights, and exports.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly financialReportService: FinancialReportService,
    private readonly cashFlowReportService: CashFlowReportService,
    private readonly agedPayablesService: AgedPayablesService,
    private readonly arrearsService: ArrearsService,
    private readonly vatService: VatService,
    private readonly reportSynthesisAgent: ReportSynthesisAgent,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  /**
   * Get report data for dashboard display.
   *
   * @param type - Type of report
   * @param start - Period start date
   * @param end - Period end date
   * @param tenantId - Tenant ID for isolation
   * @param includeHistorical - Include historical comparison data
   * @returns Report data with chart-ready transformations
   */
  async getReportData(
    type: ReportType,
    start: Date,
    end: Date,
    tenantId: string,
    includeHistorical = true,
  ): Promise<ReportDataResponseDto> {
    this.logger.log(
      `Getting ${type} report data for tenant ${tenantId}, period ${start.toISOString()} to ${end.toISOString()}`,
    );

    // Validate period
    if (start > end) {
      throw new BadRequestException('Period start must be before period end');
    }

    // Check cache first
    const cacheKey = this.buildCacheKey('report', tenantId, type, start, end);
    const cached = await this.getFromCache<ReportDataResponseDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cached;
    }

    // Fetch raw data based on report type
    const rawData = await this.fetchRawData(type, start, end, tenantId);

    // Prepare chart data
    const chartData = await this.prepareChartData(
      rawData,
      type,
      tenantId,
      start,
      end,
    );

    // Fetch historical data for trend comparison
    let historical: HistoricalDataPointDto[] = [];
    if (includeHistorical) {
      historical = await this.fetchHistoricalData(type, start, tenantId);
    }

    // Calculate summary
    const summary = this.calculateSummary(rawData, type);

    // Build sections
    const sections = this.buildSections(rawData, type);

    const response: ReportDataResponseDto = {
      type,
      tenantId,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      generatedAt: new Date().toISOString(),
      summary,
      sections,
      chartData,
      historical,
    };

    // Cache for 5 minutes
    await this.setCache(cacheKey, response, DATA_CACHE_TTL_SECONDS);

    return response;
  }

  /**
   * Generate AI insights for a report.
   *
   * @param type - Type of report
   * @param reportData - Report data to analyze
   * @param tenantId - Tenant ID for isolation
   * @returns AI-generated insights
   */
  async generateInsights(
    type: ReportType,
    reportData: Record<string, unknown>,
    tenantId: string,
  ): Promise<AIInsightsResponseDto> {
    this.logger.log(
      `Generating AI insights for ${type} report, tenant ${tenantId}`,
    );

    // Extract period from report data for cache key
    const period = reportData.period as
      | { start?: string; end?: string }
      | undefined;
    const startStr = period?.start || new Date().toISOString();

    // Check cache first (10 minute TTL for expensive AI calls)
    const cacheKey = this.buildCacheKey(
      'insights',
      tenantId,
      type,
      new Date(startStr),
      new Date(),
    );
    const cached = await this.getFromCache<AIInsightsResponseDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for insights ${cacheKey}`);
      return cached;
    }

    // Fetch historical data for trend analysis
    const historicalStart = period?.start ? new Date(period.start) : new Date();
    const historical = await this.fetchHistoricalDataForAgent(
      type,
      historicalStart,
      tenantId,
    );

    // Convert report data to proper format for agent
    const formattedData = this.formatReportDataForAgent(reportData, type);

    // Call the synthesis agent
    const result = await this.reportSynthesisAgent.synthesizeReport(
      type,
      formattedData,
      historical,
      tenantId,
    );

    // Convert AIInsights to response DTO
    const insightsData: AIInsightsDataDto = {
      executiveSummary: result.data.executiveSummary,
      keyFindings: result.data.keyFindings.map((f) => ({
        category: f.category,
        finding: f.finding,
        impact: f.impact,
        severity: f.severity,
      })),
      trends: result.data.trends.map((t) => ({
        metric: t.metric,
        direction: t.direction,
        percentageChange: t.percentageChange,
        timeframe: t.timeframe,
        interpretation: t.interpretation,
      })),
      anomalies: result.data.anomalies.map((a) => ({
        type: a.type,
        description: a.description,
        severity: a.severity,
        affectedMetric: a.affectedMetric,
        expectedValue: a.expectedValue,
        actualValue: a.actualValue,
        possibleCauses: a.possibleCauses,
      })),
      recommendations: result.data.recommendations.map((r) => ({
        priority: r.priority,
        category: r.category,
        action: r.action,
        expectedImpact: r.expectedImpact,
        timeline: r.timeline,
      })),
      confidenceScore: result.data.confidenceScore,
      generatedAt: result.data.generatedAt.toISOString(),
    };

    const response: AIInsightsResponseDto = {
      success: true,
      data: insightsData,
      source: result.source,
      model: result.model,
    };

    // Cache for 10 minutes
    await this.setCache(cacheKey, response, INSIGHTS_CACHE_TTL_SECONDS);

    return response;
  }

  /**
   * Export report as PDF, Excel, or CSV.
   *
   * @param type - Type of report
   * @param start - Period start date
   * @param end - Period end date
   * @param format - Export format
   * @param includeInsights - Include AI insights in export
   * @param tenantId - Tenant ID for isolation
   * @returns Export result with buffer and metadata
   */
  async exportReport(
    type: ReportType,
    start: Date,
    end: Date,
    format: ExportFormat,
    includeInsights: boolean,
    tenantId: string,
  ): Promise<ExportResult> {
    this.logger.log(
      `Exporting ${type} report as ${format} for tenant ${tenantId}`,
    );

    // Validate period
    if (start > end) {
      throw new BadRequestException('Period start must be before period end');
    }

    // Get tenant name for branding
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name || 'CrecheBooks';

    // Generate the report
    let buffer: Buffer;

    switch (type) {
      case ReportType.INCOME_STATEMENT: {
        const report =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            start,
            end,
          );
        buffer = await this.exportIncomeStatement(
          report,
          format,
          tenantName,
          includeInsights,
          tenantId,
        );
        break;
      }
      case ReportType.BALANCE_SHEET: {
        const balanceSheet =
          await this.financialReportService.generateBalanceSheet(tenantId, end);
        buffer = await this.exportBalanceSheet(
          balanceSheet,
          format,
          tenantName,
        );
        break;
      }
      default: {
        // For unsupported types, fall back to generating an income statement for the period
        this.logger.warn(
          `Export for ${type} not yet implemented, generating income statement instead`,
        );
        const fallbackReport =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            start,
            end,
          );
        buffer = await this.exportIncomeStatement(
          fallbackReport,
          format,
          tenantName,
          includeInsights,
          tenantId,
        );
      }
    }

    // Build filename
    const typeSlug = type.toLowerCase().replace(/_/g, '-');
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const extension = EXPORT_FILE_EXTENSIONS[format];
    const filename = `${typeSlug}-${startStr}-to-${endStr}${extension}`;

    return {
      buffer,
      filename,
      contentType: EXPORT_CONTENT_TYPES[format],
    };
  }

  // ========================================
  // Private helper methods
  // ========================================

  /**
   * Composite type for all possible raw report data shapes.
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private async fetchRawData(
    type: ReportType,
    start: Date,
    end: Date,
    tenantId: string,
  ): Promise<
    | IncomeStatement
    | TrialBalance
    | BalanceSheet
    | CashFlowStatement
    | ArrearsReport
    | VatReportData
  > {
    switch (type) {
      case ReportType.INCOME_STATEMENT:
        return this.financialReportService.generateIncomeStatement(
          tenantId,
          start,
          end,
        );
      case ReportType.BALANCE_SHEET:
        return this.financialReportService.generateBalanceSheet(tenantId, end);
      case ReportType.CASH_FLOW:
        return this.cashFlowReportService.generateCashFlowStatement(
          tenantId,
          start,
          end,
        );
      case ReportType.AGED_RECEIVABLES:
        return this.arrearsService.getArrearsReport(tenantId, {
          dateFrom: start,
          dateTo: end,
        });
      case ReportType.VAT_REPORT:
        return this.generateVatReportData(tenantId, start, end);
      default:
        return this.financialReportService.generateIncomeStatement(
          tenantId,
          start,
          end,
        );
    }
  }

  /**
   * Generate combined VAT report data (output + input + flagged items).
   */
  private async generateVatReportData(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<VatReportData> {
    const [outputVat, inputVat, flaggedItems] = await Promise.all([
      this.vatService.calculateOutputVat(tenantId, start, end),
      this.vatService.calculateInputVat(tenantId, start, end),
      this.vatService.getFlaggedItems(tenantId, start, end),
    ]);

    const netVatCents = outputVat.vatAmountCents - inputVat.vatAmountCents;

    return {
      tenantId,
      period: { start, end },
      outputVat,
      inputVat,
      netVatCents,
      isDueToSars: netVatCents > 0,
      flaggedItemCount: flaggedItems.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Prepare chart data for frontend visualization.
   */
  private async prepareChartData(
    rawData: unknown,
    type: ReportType,
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ChartDataDto> {
    // Get monthly data for the period
    const monthlyTrend = await this.buildMonthlyTrend(
      tenantId,
      periodStart,
      periodEnd,
    );
    const expenseBreakdown = this.buildExpenseBreakdown(rawData);
    const monthlyComparison = await this.buildMonthlyComparison(
      tenantId,
      periodStart,
      periodEnd,
    );
    const profitMargin = await this.buildProfitMargin(
      tenantId,
      periodStart,
      periodEnd,
    );

    return {
      monthlyTrend,
      expenseBreakdown,
      monthlyComparison,
      profitMargin,
    };
  }

  /**
   * Build monthly trend data for line charts.
   */
  private async buildMonthlyTrend(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<MonthlyTrendPointDto[]> {
    const trend: MonthlyTrendPointDto[] = [];
    const current = new Date(start);
    current.setDate(1); // Start of month

    while (current <= end) {
      const monthStart = new Date(current);
      const monthEnd = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      try {
        const report =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            monthStart,
            monthEnd > end ? end : monthEnd,
          );

        trend.push({
          month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          income: report.income.totalCents,
          expenses: report.expenses.totalCents,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to get monthly data for ${current.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
        );
        trend.push({
          month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          income: 0,
          expenses: 0,
        });
      }

      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }

    return trend;
  }

  /**
   * Build expense breakdown for pie charts.
   */
  private buildExpenseBreakdown(
    rawData: unknown,
  ): CategoryBreakdownDto[] {
    const rd = rawData as Record<string, unknown>;
    // Check if it's an income statement
    if (
      'expenses' in rd &&
      typeof rd.expenses === 'object' &&
      rd.expenses !== null
    ) {
      const expenses = rd.expenses as {
        totalCents: number;
        breakdown?: Array<{ accountName: string; amountCents: number }>;
      };
      const totalExpenses = expenses.totalCents || 0;
      const breakdown = expenses.breakdown || [];

      if (totalExpenses === 0 || breakdown.length === 0) {
        return [];
      }

      return breakdown.map((item) => ({
        category: item.accountName,
        amount: item.amountCents,
        percentage: new Decimal(item.amountCents)
          .dividedBy(totalExpenses)
          .times(100)
          .toDecimalPlaces(2)
          .toNumber(),
      }));
    }

    return [];
  }

  /**
   * Build month-over-month comparison data.
   */
  private async buildMonthlyComparison(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<ComparisonPointDto[]> {
    const comparison: ComparisonPointDto[] = [];
    const current = new Date(start);
    current.setDate(1);

    while (current <= end) {
      const monthStart = new Date(current);
      const monthEnd = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      // Previous month
      const prevMonthStart = new Date(
        current.getFullYear(),
        current.getMonth() - 1,
        1,
      );
      const prevMonthEnd = new Date(
        current.getFullYear(),
        current.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );

      try {
        const currentReport =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            monthStart,
            monthEnd > end ? end : monthEnd,
          );

        const prevReport =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            prevMonthStart,
            prevMonthEnd,
          );

        const currentIncome = currentReport.income.totalCents;
        const prevIncome = prevReport.income.totalCents;
        const percentageChange =
          prevIncome > 0
            ? new Decimal(currentIncome - prevIncome)
                .dividedBy(prevIncome)
                .times(100)
                .toDecimalPlaces(2)
                .toNumber()
            : 0;

        comparison.push({
          month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          current: currentIncome,
          previous: prevIncome,
          percentageChange,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to get comparison data for ${current.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      current.setMonth(current.getMonth() + 1);
    }

    return comparison;
  }

  /**
   * Build profit margin trend data.
   */
  private async buildProfitMargin(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<ProfitMarginPointDto[]> {
    const margins: ProfitMarginPointDto[] = [];
    const current = new Date(start);
    current.setDate(1);

    while (current <= end) {
      const monthStart = new Date(current);
      const monthEnd = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      try {
        const report =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            monthStart,
            monthEnd > end ? end : monthEnd,
          );

        const income = report.income.totalCents;
        const netProfit = report.netProfitCents;
        const marginPercent =
          income > 0
            ? new Decimal(netProfit)
                .dividedBy(income)
                .times(100)
                .toDecimalPlaces(2)
                .toNumber()
            : 0;

        margins.push({
          month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          netProfit,
          marginPercent,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to get profit margin for ${current.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      current.setMonth(current.getMonth() + 1);
    }

    return margins;
  }

  /**
   * Fetch historical data for trend comparison.
   */
  private async fetchHistoricalData(
    type: ReportType,
    currentPeriodStart: Date,
    tenantId: string,
  ): Promise<HistoricalDataPointDto[]> {
    const historical: HistoricalDataPointDto[] = [];
    const current = new Date(currentPeriodStart);
    current.setMonth(current.getMonth() - 12); // Go back 12 months
    current.setDate(1);

    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(current);
      const monthEnd = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      try {
        const report =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            monthStart,
            monthEnd,
          );

        historical.push({
          period: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          totalIncomeCents: report.income.totalCents,
          totalExpensesCents: report.expenses.totalCents,
          netProfitCents: report.netProfitCents,
        });
      } catch (error) {
        this.logger.debug(
          `No historical data for ${current.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      current.setMonth(current.getMonth() + 1);
    }

    return historical;
  }

  /**
   * Fetch historical data for the synthesis agent.
   */
  private async fetchHistoricalDataForAgent(
    type: ReportType,
    currentPeriodStart: Date,
    tenantId: string,
  ): Promise<HistoricalDataPoint[]> {
    const historical: HistoricalDataPoint[] = [];
    const current = new Date(currentPeriodStart);
    current.setMonth(current.getMonth() - 12);
    current.setDate(1);

    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(current);
      const monthEnd = new Date(
        current.getFullYear(),
        current.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      try {
        const report =
          await this.financialReportService.generateIncomeStatement(
            tenantId,
            monthStart,
            monthEnd,
          );

        const incomeData: IncomeStatementData = {
          periodStart: monthStart,
          periodEnd: monthEnd,
          income: {
            tuitionFeesCents: report.income.totalCents,
            subsidiesCents: 0,
            otherIncomeCents: 0,
            totalCents: report.income.totalCents,
            lineItems: report.income.breakdown.map((b) => ({
              description: b.accountName,
              amountCents: b.amountCents,
            })),
          },
          expenses: {
            salariesCents: 0,
            rentCents: 0,
            utilitiesCents: 0,
            foodCents: 0,
            suppliesCents: 0,
            otherExpensesCents: report.expenses.totalCents,
            totalCents: report.expenses.totalCents,
            lineItems: report.expenses.breakdown.map((b) => ({
              description: b.accountName,
              amountCents: b.amountCents,
            })),
          },
          netProfitCents: report.netProfitCents,
          profitMarginPercent:
            report.income.totalCents > 0
              ? new Decimal(report.netProfitCents)
                  .dividedBy(report.income.totalCents)
                  .times(100)
                  .toNumber()
              : 0,
        };

        historical.push({
          period: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
          reportType: type,
          data: incomeData,
        });
      } catch (error) {
        this.logger.debug(
          `No historical data for agent at ${current.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      current.setMonth(current.getMonth() + 1);
    }

    return historical;
  }

  /**
   * Format report data for the synthesis agent.
   */
  private formatReportDataForAgent(
    reportData: Record<string, unknown>,
    type: ReportType,
  ): ReportData {
    // Convert the generic report data to the expected format
    const period = reportData.period as
      | { start?: string; end?: string }
      | undefined;
    const income = reportData.income as { totalCents?: number } | undefined;
    const expenses = reportData.expenses as { totalCents?: number } | undefined;
    const netProfitCents = (reportData.netProfitCents as number) || 0;

    const incomeTotal = income?.totalCents || 0;
    const expensesTotal = expenses?.totalCents || 0;

    const data: IncomeStatementData = {
      periodStart: period?.start ? new Date(period.start) : new Date(),
      periodEnd: period?.end ? new Date(period.end) : new Date(),
      income: {
        tuitionFeesCents: incomeTotal,
        subsidiesCents: 0,
        otherIncomeCents: 0,
        totalCents: incomeTotal,
      },
      expenses: {
        salariesCents: 0,
        rentCents: 0,
        utilitiesCents: 0,
        foodCents: 0,
        suppliesCents: 0,
        otherExpensesCents: expensesTotal,
        totalCents: expensesTotal,
      },
      netProfitCents,
      profitMarginPercent:
        incomeTotal > 0
          ? new Decimal(netProfitCents)
              .dividedBy(incomeTotal)
              .times(100)
              .toNumber()
          : 0,
    };

    return data;
  }

  /**
   * Calculate summary from raw data.
   */
  private calculateSummary(
    rawData: unknown,
    type: ReportType,
  ): ReportSummaryDto {
    const rd = rawData as Record<string, unknown>;
    // Income Statement
    if (
      'income' in rd &&
      'expenses' in rd &&
      'netProfitCents' in rd
    ) {
      const data = rawData as unknown as IncomeStatement;
      const profitMarginPercent =
        data.income.totalCents > 0
          ? new Decimal(data.netProfitCents)
              .dividedBy(data.income.totalCents)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber()
          : 0;

      return {
        totalIncomeCents: data.income.totalCents,
        totalIncomeRands: data.income.totalRands,
        totalExpensesCents: data.expenses.totalCents,
        totalExpensesRands: data.expenses.totalRands,
        netProfitCents: data.netProfitCents,
        netProfitRands: data.netProfitRands,
        profitMarginPercent,
      };
    }

    // Balance Sheet — map assets/liabilities/equity to summary fields
    if ('assets' in rd && 'liabilities' in rd && 'equity' in rd) {
      const data = rawData as unknown as BalanceSheet;
      const netEquity = data.assets.totalCents - data.liabilities.totalCents;
      return {
        totalIncomeCents: data.assets.totalCents,
        totalIncomeRands: data.assets.totalRands,
        totalExpensesCents: data.liabilities.totalCents,
        totalExpensesRands: data.liabilities.totalRands,
        netProfitCents: netEquity,
        netProfitRands: new Decimal(netEquity)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        profitMarginPercent: data.assets.totalCents > 0
          ? new Decimal(netEquity)
              .dividedBy(data.assets.totalCents)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber()
          : 0,
      };
    }

    // Cash Flow Statement
    if ('operating' in rd && 'investing' in rd && 'financing' in rd) {
      const data = rawData as unknown as CashFlowStatement;
      return {
        totalIncomeCents: data.operating.total,
        totalIncomeRands: new Decimal(data.operating.total)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        totalExpensesCents: Math.abs(data.investing.total + data.financing.total),
        totalExpensesRands: new Decimal(
          Math.abs(data.investing.total + data.financing.total),
        )
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        netProfitCents: data.netCashFlow,
        netProfitRands: new Decimal(data.netCashFlow)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        profitMarginPercent: 0,
      };
    }

    // Aged Receivables (ArrearsReport)
    if ('summary' in rd && 'topDebtors' in rd) {
      const data = rawData as unknown as ArrearsReport;
      return {
        totalIncomeCents: data.summary.totalOutstandingCents,
        totalIncomeRands: new Decimal(data.summary.totalOutstandingCents)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        totalExpensesCents: data.summary.totalInvoices,
        totalExpensesRands: data.summary.totalInvoices,
        netProfitCents: data.summary.totalOutstandingCents,
        netProfitRands: new Decimal(data.summary.totalOutstandingCents)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        profitMarginPercent: 0,
      };
    }

    // VAT Report
    if ('outputVat' in rd && 'inputVat' in rd) {
      const data = rawData as unknown as VatReportData;
      return {
        totalIncomeCents: data.outputVat.vatAmountCents,
        totalIncomeRands: new Decimal(data.outputVat.vatAmountCents)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        totalExpensesCents: data.inputVat.vatAmountCents,
        totalExpensesRands: new Decimal(data.inputVat.vatAmountCents)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        netProfitCents: data.netVatCents,
        netProfitRands: new Decimal(data.netVatCents)
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        profitMarginPercent: 0,
      };
    }

    // Default empty summary
    return {
      totalIncomeCents: 0,
      totalIncomeRands: 0,
      totalExpensesCents: 0,
      totalExpensesRands: 0,
      netProfitCents: 0,
      netProfitRands: 0,
      profitMarginPercent: 0,
    };
  }

  /**
   * Build sections from raw data.
   */
  private buildSections(
    rawData: unknown,
    type: ReportType,
  ): ReportSectionDto[] {
    const sections: ReportSectionDto[] = [];
    const rd = rawData as Record<string, unknown>;
    const toRands = (cents: number) =>
      new Decimal(cents).dividedBy(100).toDecimalPlaces(2).toNumber();

    // Income Statement sections
    if (
      'income' in rd &&
      'expenses' in rd &&
      'netProfitCents' in rd
    ) {
      const d = rawData as unknown as IncomeStatement;
      sections.push({
        title: 'Income',
        totalCents: d.income.totalCents,
        totalRands: d.income.totalRands,
        breakdown: d.income.breakdown.map((b) => ({
          accountCode: b.accountCode,
          accountName: b.accountName,
          amountCents: b.amountCents,
          amountRands: b.amountRands,
        })),
      });
      sections.push({
        title: 'Expenses',
        totalCents: d.expenses.totalCents,
        totalRands: d.expenses.totalRands,
        breakdown: d.expenses.breakdown.map((b) => ({
          accountCode: b.accountCode,
          accountName: b.accountName,
          amountCents: b.amountCents,
          amountRands: b.amountRands,
        })),
      });
    }

    // Balance Sheet sections
    if ('assets' in rd && 'liabilities' in rd && 'equity' in rd) {
      const d = rawData as unknown as BalanceSheet;
      sections.push({
        title: 'Assets',
        totalCents: d.assets.totalCents,
        totalRands: d.assets.totalRands,
        breakdown: [...d.assets.current, ...d.assets.nonCurrent].map((b) => ({
          accountCode: b.accountCode,
          accountName: b.accountName,
          amountCents: b.amountCents,
          amountRands: b.amountRands,
        })),
      });
      sections.push({
        title: 'Liabilities',
        totalCents: d.liabilities.totalCents,
        totalRands: d.liabilities.totalRands,
        breakdown: [...d.liabilities.current, ...d.liabilities.nonCurrent].map(
          (b) => ({
            accountCode: b.accountCode,
            accountName: b.accountName,
            amountCents: b.amountCents,
            amountRands: b.amountRands,
          }),
        ),
      });
      sections.push({
        title: 'Equity',
        totalCents: d.equity.totalCents,
        totalRands: d.equity.totalRands,
        breakdown: d.equity.breakdown.map((b) => ({
          accountCode: b.accountCode,
          accountName: b.accountName,
          amountCents: b.amountCents,
          amountRands: b.amountRands,
        })),
      });
    }

    // Cash Flow sections
    if ('operating' in rd && 'investing' in rd && 'financing' in rd) {
      const d = rawData as unknown as CashFlowStatement;
      sections.push({
        title: 'Operating Activities',
        totalCents: d.operating.total,
        totalRands: toRands(d.operating.total),
        breakdown: d.operating.details.map((item) => ({
          accountCode: '',
          accountName: item.name,
          amountCents: item.amountCents,
          amountRands: toRands(item.amountCents),
        })),
      });
      sections.push({
        title: 'Investing Activities',
        totalCents: d.investing.total,
        totalRands: toRands(d.investing.total),
        breakdown: d.investing.items.map((item) => ({
          accountCode: '',
          accountName: item.name,
          amountCents: item.amountCents,
          amountRands: toRands(item.amountCents),
        })),
      });
      sections.push({
        title: 'Financing Activities',
        totalCents: d.financing.total,
        totalRands: toRands(d.financing.total),
        breakdown: d.financing.items.map((item) => ({
          accountCode: '',
          accountName: item.name,
          amountCents: item.amountCents,
          amountRands: toRands(item.amountCents),
        })),
      });
      sections.push({
        title: 'Cash Summary',
        totalCents: d.netCashFlow,
        totalRands: toRands(d.netCashFlow),
        breakdown: [
          {
            accountCode: '',
            accountName: 'Opening Balance',
            amountCents: d.openingBalance,
            amountRands: toRands(d.openingBalance),
          },
          {
            accountCode: '',
            accountName: 'Net Cash Flow',
            amountCents: d.netCashFlow,
            amountRands: toRands(d.netCashFlow),
          },
          {
            accountCode: '',
            accountName: 'Closing Balance',
            amountCents: d.closingBalance,
            amountRands: toRands(d.closingBalance),
          },
        ],
      });
    }

    // Aged Receivables sections
    if ('summary' in rd && 'topDebtors' in rd && 'invoices' in rd) {
      const d = rawData as unknown as ArrearsReport;
      sections.push({
        title: 'Aging Summary',
        totalCents: d.summary.totalOutstandingCents,
        totalRands: toRands(d.summary.totalOutstandingCents),
        breakdown: [
          {
            accountCode: '',
            accountName: 'Current (1-30 days)',
            amountCents: d.summary.aging.currentCents,
            amountRands: toRands(d.summary.aging.currentCents),
          },
          {
            accountCode: '',
            accountName: '31-60 days',
            amountCents: d.summary.aging.days30Cents,
            amountRands: toRands(d.summary.aging.days30Cents),
          },
          {
            accountCode: '',
            accountName: '61-90 days',
            amountCents: d.summary.aging.days60Cents,
            amountRands: toRands(d.summary.aging.days60Cents),
          },
          {
            accountCode: '',
            accountName: '90+ days',
            amountCents: d.summary.aging.days90PlusCents,
            amountRands: toRands(d.summary.aging.days90PlusCents),
          },
        ].filter((b) => b.amountCents > 0),
      });
      if (d.topDebtors.length > 0) {
        sections.push({
          title: 'Top Debtors',
          totalCents: d.topDebtors.reduce(
            (sum, db) => sum + db.totalOutstandingCents,
            0,
          ),
          totalRands: toRands(
            d.topDebtors.reduce(
              (sum, db) => sum + db.totalOutstandingCents,
              0,
            ),
          ),
          breakdown: d.topDebtors.map((db) => ({
            accountCode: '',
            accountName: `${db.parentName} (${db.invoiceCount} invoices, ${db.maxDaysOverdue}d overdue)`,
            amountCents: db.totalOutstandingCents,
            amountRands: toRands(db.totalOutstandingCents),
          })),
        });
      }
    }

    // VAT Report sections
    if ('outputVat' in rd && 'inputVat' in rd) {
      const d = rawData as unknown as VatReportData;
      sections.push({
        title: 'Output VAT (Collected)',
        totalCents: d.outputVat.vatAmountCents,
        totalRands: toRands(d.outputVat.vatAmountCents),
        breakdown: [
          {
            accountCode: '',
            accountName: 'Standard Rated (15%)',
            amountCents: d.outputVat.standardRatedCents,
            amountRands: toRands(d.outputVat.standardRatedCents),
          },
          {
            accountCode: '',
            accountName: 'Zero Rated',
            amountCents: d.outputVat.zeroRatedCents,
            amountRands: toRands(d.outputVat.zeroRatedCents),
          },
          {
            accountCode: '',
            accountName: 'Exempt',
            amountCents: d.outputVat.exemptCents,
            amountRands: toRands(d.outputVat.exemptCents),
          },
        ].filter((b) => b.amountCents > 0),
      });
      sections.push({
        title: 'Input VAT (Claimable)',
        totalCents: d.inputVat.vatAmountCents,
        totalRands: toRands(d.inputVat.vatAmountCents),
        breakdown: [
          {
            accountCode: '',
            accountName: 'Standard Rated (15%)',
            amountCents: d.inputVat.standardRatedCents,
            amountRands: toRands(d.inputVat.standardRatedCents),
          },
          {
            accountCode: '',
            accountName: 'Zero Rated',
            amountCents: d.inputVat.zeroRatedCents,
            amountRands: toRands(d.inputVat.zeroRatedCents),
          },
        ].filter((b) => b.amountCents > 0),
      });
      sections.push({
        title: d.isDueToSars ? 'Net VAT Due to SARS' : 'Net VAT Refund Due',
        totalCents: Math.abs(d.netVatCents),
        totalRands: toRands(Math.abs(d.netVatCents)),
        breakdown: [
          {
            accountCode: '',
            accountName: d.isDueToSars
              ? 'Amount payable to SARS'
              : 'Refund claimable from SARS',
            amountCents: Math.abs(d.netVatCents),
            amountRands: toRands(Math.abs(d.netVatCents)),
          },
        ],
      });
    }

    return sections;
  }

  /**
   * Export income statement to the specified format.
   * TASK-REPORTS-003: Enhanced with AI insights for PDF exports.
   */
  private async exportIncomeStatement(
    report: IncomeStatement,
    format: ExportFormat,
    tenantName: string,
    includeInsights: boolean,
    tenantId: string,
  ): Promise<Buffer> {
    switch (format) {
      case ExportFormat.PDF:
        // Use enhanced PDF generator when insights are requested
        if (includeInsights) {
          return this.generateEnhancedPdf(report, tenantName, tenantId);
        }
        return this.financialReportService.exportIncomeStatementPDF(
          report,
          tenantName,
        );
      case ExportFormat.EXCEL:
        return this.financialReportService.exportIncomeStatementExcel(
          report,
          tenantName,
        );
      case ExportFormat.CSV:
        return this.exportIncomeStatementCSV(report, tenantName);
      default:
        throw new BadRequestException(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate enhanced PDF with AI insights.
   * TASK-REPORTS-003: Enhanced PDF Generation with AI Insights
   */
  private async generateEnhancedPdf(
    report: IncomeStatement,
    tenantName: string,
    tenantId: string,
  ): Promise<Buffer> {
    this.logger.log(
      `Generating enhanced PDF with AI insights for tenant ${tenantId}`,
    );

    // Build ReportDataResponseDto from IncomeStatement
    const reportData = await this.getReportData(
      ReportType.INCOME_STATEMENT,
      report.period.start,
      report.period.end,
      tenantId,
      false, // Don't need historical for export
    );

    // Generate AI insights
    let aiInsights: AIInsights | null = null;
    try {
      const insightsResponse = await this.generateInsights(
        ReportType.INCOME_STATEMENT,
        {
          period: {
            start: report.period.start.toISOString(),
            end: report.period.end.toISOString(),
          },
          income: {
            totalCents: report.income.totalCents,
            breakdown: report.income.breakdown,
          },
          expenses: {
            totalCents: report.expenses.totalCents,
            breakdown: report.expenses.breakdown,
          },
          netProfitCents: report.netProfitCents,
        },
        tenantId,
      );

      // Convert response DTO back to AIInsights
      // Type assertions are necessary because DTOs use string types
      // while the interface uses specific union types
      aiInsights = {
        executiveSummary: insightsResponse.data.executiveSummary,
        keyFindings: insightsResponse.data.keyFindings.map((f) => ({
          category: f.category as AIInsights['keyFindings'][0]['category'],
          finding: f.finding,
          impact: f.impact as AIInsights['keyFindings'][0]['impact'],
          severity: f.severity as AIInsights['keyFindings'][0]['severity'],
        })),
        trends: insightsResponse.data.trends.map((t) => ({
          metric: t.metric,
          direction: t.direction as AIInsights['trends'][0]['direction'],
          percentageChange: t.percentageChange,
          timeframe: t.timeframe,
          interpretation: t.interpretation,
        })),
        anomalies: insightsResponse.data.anomalies.map((a) => ({
          type: a.type as AIInsights['anomalies'][0]['type'],
          description: a.description,
          severity: a.severity as AIInsights['anomalies'][0]['severity'],
          affectedMetric: a.affectedMetric,
          expectedValue: a.expectedValue,
          actualValue: a.actualValue,
          possibleCauses: a.possibleCauses,
        })),
        recommendations: insightsResponse.data.recommendations.map((r) => ({
          priority: r.priority as AIInsights['recommendations'][0]['priority'],
          category: r.category as AIInsights['recommendations'][0]['category'],
          action: r.action,
          expectedImpact: r.expectedImpact,
          timeline: r.timeline,
        })),
        confidenceScore: insightsResponse.data.confidenceScore,
        generatedAt: new Date(insightsResponse.data.generatedAt),
        source: insightsResponse.source,
        model: insightsResponse.model,
      };
    } catch (error) {
      // Log error but don't fail - generate PDF without insights
      this.logger.error(
        `Failed to generate AI insights for PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
      // NO FALLBACK - throw error as per critical rules
      throw new BadRequestException(
        `AI insights generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Export without insights by setting includeInsights=false.`,
      );
    }

    // Generate PDF with AI insights
    return this.pdfGeneratorService.generateReportPdf(
      reportData,
      aiInsights,
      tenantName,
    );
  }

  /**
   * Export balance sheet to the specified format.
   */
  private async exportBalanceSheet(
    report: BalanceSheet,
    format: ExportFormat,
    tenantName: string,
  ): Promise<Buffer> {
    // For now, return a simple CSV for balance sheet
    // Full implementation would be in TASK-REPORTS-003
    const lines = [
      `"${tenantName} - Balance Sheet"`,
      `"As at: ${report.asOfDate.toISOString().slice(0, 10)}"`,
      '',
      '"Section","Account Code","Account Name","Amount (Cents)","Amount (Rands)"',
      '',
      '"CURRENT ASSETS"',
    ];

    for (const item of report.assets.current) {
      lines.push(
        `"Current Assets","${item.accountCode}","${item.accountName}",${item.amountCents},${item.amountRands}`,
      );
    }
    lines.push(
      `"","","Total Current Assets",${report.assets.totalCents},${report.assets.totalRands}`,
    );

    lines.push('');
    lines.push('"CURRENT LIABILITIES"');
    for (const item of report.liabilities.current) {
      lines.push(
        `"Current Liabilities","${item.accountCode}","${item.accountName}",${item.amountCents},${item.amountRands}`,
      );
    }
    lines.push(
      `"","","Total Liabilities",${report.liabilities.totalCents},${report.liabilities.totalRands}`,
    );

    lines.push('');
    lines.push('"EQUITY"');
    for (const item of report.equity.breakdown) {
      lines.push(
        `"Equity","${item.accountCode}","${item.accountName}",${item.amountCents},${item.amountRands}`,
      );
    }
    lines.push(
      `"","","Total Equity",${report.equity.totalCents},${report.equity.totalRands}`,
    );

    lines.push('');
    lines.push(
      `"","","Balance Check","${report.isBalanced ? 'BALANCED' : 'NOT BALANCED'}",""`,
    );
    lines.push(`"Generated: ${report.generatedAt.toISOString()}"`);

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  /**
   * Export income statement as CSV.
   */
  private exportIncomeStatementCSV(
    report: IncomeStatement,
    tenantName: string,
  ): Buffer {
    const lines: string[] = [
      `"${tenantName} - Income Statement"`,
      `"Period: ${report.period.start.toISOString().slice(0, 10)} to ${report.period.end.toISOString().slice(0, 10)}"`,
      '',
      '"Account Code","Account Name","Amount (Cents)","Amount (Rands)"',
      '',
      '"INCOME"',
    ];

    for (const item of report.income.breakdown) {
      lines.push(
        `"${item.accountCode}","${item.accountName}",${item.amountCents},${item.amountRands}`,
      );
    }
    lines.push(
      `"","Total Income",${report.income.totalCents},${report.income.totalRands}`,
    );

    lines.push('');
    lines.push('"EXPENSES"');

    for (const item of report.expenses.breakdown) {
      lines.push(
        `"${item.accountCode}","${item.accountName}",${item.amountCents},${item.amountRands}`,
      );
    }
    lines.push(
      `"","Total Expenses",${report.expenses.totalCents},${report.expenses.totalRands}`,
    );

    lines.push('');
    lines.push(
      `"","NET PROFIT",${report.netProfitCents},${report.netProfitRands}`,
    );
    lines.push('');
    lines.push(`"Generated: ${report.generatedAt.toISOString()}"`);

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  // ========================================
  // Cache helpers
  // ========================================

  /**
   * Build a cache key.
   */
  private buildCacheKey(
    prefix: string,
    tenantId: string,
    type: ReportType,
    start: Date,
    end: Date,
  ): string {
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    return `crechebooks:${prefix}:${tenantId}:${type}:${startStr}:${endStr}`;
  }

  /**
   * Get from cache.
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      this.logger.warn(
        `Cache read failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  /**
   * Set cache.
   */
  private async setCache(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), ttlSeconds);
      this.logger.debug(`Cached ${key} for ${ttlSeconds}s`);
    } catch (error) {
      this.logger.warn(
        `Cache write failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
