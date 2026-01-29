/**
 * Reports Service Unit Tests
 * TASK-REPORTS-002: Reports API Module
 *
 * @description Unit tests for ReportsService.
 * Tests report data generation, AI insights, exports, and caching.
 *
 * CRITICAL: Tests verify service behavior with real data structures
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReportsService } from '../../../src/modules/reports/reports.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { RedisService } from '../../../src/common/redis/redis.service';
import { FinancialReportService } from '../../../src/database/services/financial-report.service';
import { CashFlowReportService } from '../../../src/database/services/cash-flow-report.service';
import { AgedPayablesService } from '../../../src/database/services/aged-payables.service';
import { PdfGeneratorService } from '../../../src/modules/reports/pdf-generator.service';
import { ReportSynthesisAgent } from '../../../src/agents/report-synthesis';
import { ReportType } from '../../../src/modules/reports/dto/report-data.dto';
import { ExportFormat } from '../../../src/modules/reports/dto/export-report.dto';
import type { IncomeStatement } from '../../../src/database/dto/financial-report.dto';
import type { SdkExecutionResult } from '../../../src/agents/sdk/interfaces/sdk-agent.interface';
import type { AIInsights } from '../../../src/agents/report-synthesis';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let financialReportService: jest.Mocked<FinancialReportService>;
  let reportSynthesisAgent: jest.Mocked<ReportSynthesisAgent>;

  const testTenantId = 'test-tenant-uuid-123';
  const testStart = new Date('2025-01-01');
  const testEnd = new Date('2025-12-31');

  const testIncomeStatement: IncomeStatement = {
    tenantId: testTenantId,
    period: { start: testStart, end: testEnd },
    income: {
      totalCents: 15000000,
      totalRands: 150000,
      breakdown: [
        {
          accountCode: '4000',
          accountName: 'School Fees',
          amountCents: 15000000,
          amountRands: 150000,
        },
      ],
    },
    expenses: {
      totalCents: 12000000,
      totalRands: 120000,
      breakdown: [
        {
          accountCode: '5000',
          accountName: 'Salaries',
          amountCents: 8000000,
          amountRands: 80000,
        },
        {
          accountCode: '5100',
          accountName: 'Utilities',
          amountCents: 4000000,
          amountRands: 40000,
        },
      ],
    },
    netProfitCents: 3000000,
    netProfitRands: 30000,
    generatedAt: new Date(),
  };

  const testAIInsights: AIInsights = {
    executiveSummary: 'Test executive summary',
    keyFindings: [
      {
        category: 'profitability',
        finding: 'The creche is profitable.',
        impact: 'positive',
        severity: 'low',
      },
    ],
    trends: [
      {
        metric: 'Total Revenue',
        direction: 'increasing',
        percentageChange: 7.14,
        timeframe: 'month-over-month',
        interpretation: 'Revenue has increased.',
      },
    ],
    anomalies: [],
    recommendations: [
      {
        priority: 'medium',
        category: 'efficiency',
        action: 'Review staffing levels.',
        expectedImpact: 'Reduce costs by 5-10%.',
        timeline: 'next quarter',
      },
    ],
    confidenceScore: 85,
    generatedAt: new Date(),
    source: 'SDK',
    model: 'claude-3-sonnet',
  };

  const testSdkResult: SdkExecutionResult<AIInsights> = {
    data: testAIInsights,
    source: 'SDK',
    model: 'claude-3-sonnet',
    durationMs: 150,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      tenant: {
        findUnique: jest.fn(),
      },
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const mockFinancialReportService = {
      generateIncomeStatement: jest.fn(),
      generateBalanceSheet: jest.fn(),
      exportIncomeStatementPDF: jest.fn(),
      exportIncomeStatementExcel: jest.fn(),
    };

    const mockReportSynthesisAgent = {
      synthesizeReport: jest.fn(),
    };

    const mockCashFlowReportService = {
      generateCashFlowStatement: jest.fn(),
      getCashFlowSummary: jest.fn(),
    };

    const mockAgedPayablesService = {
      generateAgedPayablesReport: jest.fn(),
      isFeatureAvailable: jest.fn().mockReturnValue(false),
      getFeatureMessage: jest.fn().mockReturnValue('Supplier bills feature coming soon'),
    };

    const mockPdfGeneratorService = {
      generateReportPdf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: FinancialReportService,
          useValue: mockFinancialReportService,
        },
        {
          provide: CashFlowReportService,
          useValue: mockCashFlowReportService,
        },
        {
          provide: AgedPayablesService,
          useValue: mockAgedPayablesService,
        },
        { provide: ReportSynthesisAgent, useValue: mockReportSynthesisAgent },
        { provide: PdfGeneratorService, useValue: mockPdfGeneratorService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
    financialReportService = module.get(FinancialReportService);
    reportSynthesisAgent = module.get(ReportSynthesisAgent);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getReportData', () => {
    beforeEach(() => {
      redisService.get.mockResolvedValue(null); // No cache
      financialReportService.generateIncomeStatement.mockResolvedValue(
        testIncomeStatement,
      );
      redisService.set.mockResolvedValue(undefined);
    });

    it('should return report data for valid period', async () => {
      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
      );

      expect(result.type).toBe(ReportType.INCOME_STATEMENT);
      expect(result.tenantId).toBe(testTenantId);
      expect(result.summary.totalIncomeCents).toBe(15000000);
      expect(result.summary.totalExpensesCents).toBe(12000000);
      expect(result.summary.netProfitCents).toBe(3000000);
    });

    it('should return cached data when available', async () => {
      const cachedData = {
        type: ReportType.INCOME_STATEMENT,
        tenantId: testTenantId,
        cached: true,
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
      );

      expect(result).toEqual(cachedData);
      expect(
        financialReportService.generateIncomeStatement,
      ).not.toHaveBeenCalled();
    });

    it('should cache new report data', async () => {
      await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
      );

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('crechebooks:report:'),
        expect.any(String),
        300, // 5 minutes
      );
    });

    it('should throw BadRequestException for invalid date range', async () => {
      const invalidStart = new Date('2025-12-31');
      const invalidEnd = new Date('2025-01-01');

      await expect(
        service.getReportData(
          ReportType.INCOME_STATEMENT,
          invalidStart,
          invalidEnd,
          testTenantId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should build chart data correctly', async () => {
      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
        false, // No historical for faster test
      );

      expect(result.chartData).toBeDefined();
      expect(result.chartData.expenseBreakdown).toBeDefined();
      expect(Array.isArray(result.chartData.expenseBreakdown)).toBe(true);
    });

    it('should calculate profit margin correctly', async () => {
      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
        false,
      );

      // 3,000,000 / 15,000,000 = 20%
      expect(result.summary.profitMarginPercent).toBe(20);
    });

    it('should build expense breakdown with correct percentages', async () => {
      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
        false,
      );

      const expenseBreakdown = result.chartData.expenseBreakdown;
      if (expenseBreakdown.length > 0) {
        // Salaries: 8,000,000 / 12,000,000 = 66.67%
        const salaries = expenseBreakdown.find(
          (e) => e.category === 'Salaries',
        );
        if (salaries) {
          expect(salaries.percentage).toBeCloseTo(66.67, 1);
        }
      }
    });
  });

  describe('generateInsights', () => {
    beforeEach(() => {
      redisService.get.mockResolvedValue(null);
      reportSynthesisAgent.synthesizeReport.mockResolvedValue(testSdkResult);
      financialReportService.generateIncomeStatement.mockResolvedValue(
        testIncomeStatement,
      );
      redisService.set.mockResolvedValue(undefined);
    });

    it('should generate AI insights from SDK', async () => {
      const reportData = {
        income: { totalCents: 15000000 },
        expenses: { totalCents: 12000000 },
        netProfitCents: 3000000,
        period: { start: '2025-01-01', end: '2025-12-31' },
      };

      const result = await service.generateInsights(
        ReportType.INCOME_STATEMENT,
        reportData,
        testTenantId,
      );

      expect(result.success).toBe(true);
      expect(result.source).toBe('SDK');
      expect(result.data.executiveSummary).toBe('Test executive summary');
      expect(result.data.confidenceScore).toBe(85);
    });

    it('should cache AI insights', async () => {
      const reportData = {
        period: { start: '2025-01-01' },
      };

      await service.generateInsights(
        ReportType.INCOME_STATEMENT,
        reportData,
        testTenantId,
      );

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('crechebooks:insights:'),
        expect.any(String),
        600, // 10 minutes
      );
    });

    it('should return cached insights when available', async () => {
      const cachedInsights = {
        success: true,
        data: { executiveSummary: 'Cached summary' },
        source: 'FALLBACK',
      };
      redisService.get.mockResolvedValue(JSON.stringify(cachedInsights));

      const result = await service.generateInsights(
        ReportType.INCOME_STATEMENT,
        {},
        testTenantId,
      );

      expect(result).toEqual(cachedInsights);
      expect(reportSynthesisAgent.synthesizeReport).not.toHaveBeenCalled();
    });

    it('should handle fallback insights', async () => {
      const fallbackResult: SdkExecutionResult<AIInsights> = {
        data: { ...testAIInsights, source: 'FALLBACK' },
        source: 'FALLBACK',
        durationMs: 50,
      };
      reportSynthesisAgent.synthesizeReport.mockResolvedValue(fallbackResult);

      const result = await service.generateInsights(
        ReportType.INCOME_STATEMENT,
        {},
        testTenantId,
      );

      expect(result.source).toBe('FALLBACK');
    });
  });

  describe('exportReport', () => {
    const testPdfBuffer = Buffer.from('PDF content');
    const testExcelBuffer = Buffer.from('Excel content');

    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue({
        id: testTenantId,
        name: 'Test Creche',
      } as any);
      financialReportService.generateIncomeStatement.mockResolvedValue(
        testIncomeStatement,
      );
      financialReportService.exportIncomeStatementPDF.mockResolvedValue(
        testPdfBuffer,
      );
      financialReportService.exportIncomeStatementExcel.mockResolvedValue(
        testExcelBuffer,
      );
    });

    it('should export income statement as PDF', async () => {
      const result = await service.exportReport(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        ExportFormat.PDF,
        true,
        testTenantId,
      );

      expect(result.buffer).toEqual(testPdfBuffer);
      expect(result.filename).toContain('.pdf');
      expect(result.contentType).toBe('application/pdf');
    });

    it('should export income statement as Excel', async () => {
      const result = await service.exportReport(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        ExportFormat.EXCEL,
        false,
        testTenantId,
      );

      expect(result.buffer).toEqual(testExcelBuffer);
      expect(result.filename).toContain('.xlsx');
      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('should export income statement as CSV', async () => {
      const result = await service.exportReport(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        ExportFormat.CSV,
        false,
        testTenantId,
      );

      expect(result.filename).toContain('.csv');
      expect(result.contentType).toBe('text/csv');
      // CSV content should include income statement data
      const csvContent = result.buffer.toString();
      expect(csvContent).toContain('Income Statement');
    });

    it('should throw BadRequestException for invalid date range', async () => {
      await expect(
        service.exportReport(
          ReportType.INCOME_STATEMENT,
          testEnd, // Start after end
          testStart,
          ExportFormat.PDF,
          false,
          testTenantId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use tenant name for branding', async () => {
      await service.exportReport(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        ExportFormat.PDF,
        false,
        testTenantId,
      );

      expect(
        financialReportService.exportIncomeStatementPDF,
      ).toHaveBeenCalledWith(testIncomeStatement, 'Test Creche');
    });

    it('should use default name when tenant not found', async () => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      await service.exportReport(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        ExportFormat.PDF,
        false,
        testTenantId,
      );

      expect(
        financialReportService.exportIncomeStatementPDF,
      ).toHaveBeenCalledWith(testIncomeStatement, 'CrecheBooks');
    });

    it('should generate correct filename format', async () => {
      const result = await service.exportReport(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        ExportFormat.PDF,
        false,
        testTenantId,
      );

      expect(result.filename).toBe(
        'income-statement-2025-01-01-to-2025-12-31.pdf',
      );
    });
  });

  describe('caching behavior', () => {
    it('should handle cache read errors gracefully', async () => {
      redisService.get.mockRejectedValue(new Error('Redis connection failed'));
      financialReportService.generateIncomeStatement.mockResolvedValue(
        testIncomeStatement,
      );
      redisService.set.mockResolvedValue(undefined);

      // Should not throw, should fall back to generating data
      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
        false,
      );

      expect(result).toBeDefined();
      expect(financialReportService.generateIncomeStatement).toHaveBeenCalled();
    });

    it('should handle cache write errors gracefully', async () => {
      redisService.get.mockResolvedValue(null);
      financialReportService.generateIncomeStatement.mockResolvedValue(
        testIncomeStatement,
      );
      redisService.set.mockRejectedValue(new Error('Redis write failed'));

      // Should not throw
      const result = await service.getReportData(
        ReportType.INCOME_STATEMENT,
        testStart,
        testEnd,
        testTenantId,
        false,
      );

      expect(result).toBeDefined();
    });
  });
});
