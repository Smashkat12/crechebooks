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
import { AgedPayablesService } from '../../database/services/aged-payables.service';
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
   * Fetch raw report data based on type.
   */
  private async fetchRawData(
    type: ReportType,
    start: Date,
    end: Date,
    tenantId: string,
  ): Promise<IncomeStatement | TrialBalance | BalanceSheet> {
    switch (type) {
      case ReportType.INCOME_STATEMENT:
        return this.financialReportService.generateIncomeStatement(
          tenantId,
          start,
          end,
        );
      case ReportType.BALANCE_SHEET:
        return this.financialReportService.generateBalanceSheet(tenantId, end);
      default:
        // For other types, return income statement as base
        this.logger.warn(
          `Report type ${type} not fully implemented, using income statement`,
        );
        return this.financialReportService.generateIncomeStatement(
          tenantId,
          start,
          end,
        );
    }
  }

  /**
   * Prepare chart data for frontend visualization.
   */
  private async prepareChartData(
    rawData: IncomeStatement | TrialBalance | BalanceSheet,
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
    rawData: IncomeStatement | TrialBalance | BalanceSheet,
  ): CategoryBreakdownDto[] {
    // Check if it's an income statement
    if (
      'expenses' in rawData &&
      typeof rawData.expenses === 'object' &&
      rawData.expenses !== null
    ) {
      const expenses = rawData.expenses as {
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
    rawData: IncomeStatement | TrialBalance | BalanceSheet,
    type: ReportType,
  ): ReportSummaryDto {
    if (
      'income' in rawData &&
      'expenses' in rawData &&
      'netProfitCents' in rawData
    ) {
      const data = rawData;
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
    rawData: IncomeStatement | TrialBalance | BalanceSheet,
    type: ReportType,
  ): ReportSectionDto[] {
    const sections: ReportSectionDto[] = [];

    if ('income' in rawData && 'expenses' in rawData) {
      const data = rawData;

      sections.push({
        title: 'Income',
        totalCents: data.income.totalCents,
        totalRands: data.income.totalRands,
        breakdown: data.income.breakdown.map((b) => ({
          accountCode: b.accountCode,
          accountName: b.accountName,
          amountCents: b.amountCents,
          amountRands: b.amountRands,
        })),
      });

      sections.push({
        title: 'Expenses',
        totalCents: data.expenses.totalCents,
        totalRands: data.expenses.totalRands,
        breakdown: data.expenses.breakdown.map((b) => ({
          accountCode: b.accountCode,
          accountName: b.accountName,
          amountCents: b.amountCents,
          amountRands: b.amountRands,
        })),
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
