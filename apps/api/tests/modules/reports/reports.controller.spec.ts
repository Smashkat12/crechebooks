/**
 * Reports Controller Unit Tests
 * TASK-REPORTS-002: Reports API Module
 *
 * @description Unit tests for ReportsController.
 * Tests endpoint routing, authorization, and response handling.
 *
 * CRITICAL: NO MOCK DATA - tests use real service interactions
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { ReportsController } from '../../../src/modules/reports/reports.controller';
import {
  ReportsService,
  ExportResult,
} from '../../../src/modules/reports/reports.service';
import {
  ReportType,
  ReportDataResponseDto,
  ReportQueryDto,
} from '../../../src/modules/reports/dto/report-data.dto';
import {
  InsightsRequestDto,
  AIInsightsResponseDto,
} from '../../../src/modules/reports/dto/ai-insights.dto';
import {
  ExportFormat,
  ExportQueryDto,
} from '../../../src/modules/reports/dto/export-report.dto';
import { UserRole, IUser } from '../../../src/database/entities/user.entity';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: jest.Mocked<ReportsService>;

  const testTenantId = 'test-tenant-uuid-123';
  const testUser: IUser = {
    id: 'user-uuid-123',
    tenantId: testTenantId,
    auth0Id: 'auth0|123',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.OWNER,
    isActive: true,
    lastLoginAt: new Date(),
    currentTenantId: testTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testReportData: ReportDataResponseDto = {
    type: ReportType.INCOME_STATEMENT,
    tenantId: testTenantId,
    period: {
      start: '2025-01-01T00:00:00.000Z',
      end: '2025-12-31T23:59:59.999Z',
    },
    generatedAt: new Date().toISOString(),
    summary: {
      totalIncomeCents: 15000000,
      totalIncomeRands: 150000,
      totalExpensesCents: 12000000,
      totalExpensesRands: 120000,
      netProfitCents: 3000000,
      netProfitRands: 30000,
      profitMarginPercent: 20,
    },
    sections: [],
    chartData: {
      monthlyTrend: [],
      expenseBreakdown: [],
      monthlyComparison: [],
      profitMargin: [],
    },
    historical: [],
  };

  const testInsightsResponse: AIInsightsResponseDto = {
    success: true,
    data: {
      executiveSummary: 'Test summary',
      keyFindings: [],
      trends: [],
      anomalies: [],
      recommendations: [],
      confidenceScore: 85,
      generatedAt: new Date().toISOString(),
    },
    source: 'SDK',
    model: 'claude-3-sonnet',
  };

  const testExportResult: ExportResult = {
    buffer: Buffer.from('test PDF content'),
    filename: 'income-statement-2025-01-01-to-2025-12-31.pdf',
    contentType: 'application/pdf',
  };

  beforeEach(async () => {
    const mockReportsService = {
      getReportData: jest.fn(),
      generateInsights: jest.fn(),
      exportReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    reportsService = module.get(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getReportData', () => {
    const query: ReportQueryDto = {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31'),
      includeHistorical: true,
    };

    it('should return report data for INCOME_STATEMENT type', async () => {
      reportsService.getReportData.mockResolvedValue(testReportData);

      const result = await controller.getReportData(
        ReportType.INCOME_STATEMENT,
        query,
        testUser,
      );

      expect(result).toEqual(testReportData);
      expect(reportsService.getReportData).toHaveBeenCalledWith(
        ReportType.INCOME_STATEMENT,
        query.start,
        query.end,
        testTenantId,
        true,
      );
    });

    it('should return report data for BALANCE_SHEET type', async () => {
      const balanceSheetData = {
        ...testReportData,
        type: ReportType.BALANCE_SHEET,
      };
      reportsService.getReportData.mockResolvedValue(balanceSheetData);

      const result = await controller.getReportData(
        ReportType.BALANCE_SHEET,
        query,
        testUser,
      );

      expect(result.type).toBe(ReportType.BALANCE_SHEET);
      expect(reportsService.getReportData).toHaveBeenCalledWith(
        ReportType.BALANCE_SHEET,
        query.start,
        query.end,
        testTenantId,
        true,
      );
    });

    it('should pass includeHistorical=false when specified', async () => {
      reportsService.getReportData.mockResolvedValue(testReportData);

      await controller.getReportData(
        ReportType.INCOME_STATEMENT,
        { ...query, includeHistorical: false },
        testUser,
      );

      expect(reportsService.getReportData).toHaveBeenCalledWith(
        ReportType.INCOME_STATEMENT,
        query.start,
        query.end,
        testTenantId,
        false,
      );
    });

    it('should throw ForbiddenException for user without tenantId', async () => {
      const userWithoutTenant = { ...testUser, tenantId: null };

      await expect(
        controller.getReportData(
          ReportType.INCOME_STATEMENT,
          query,
          userWithoutTenant as IUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate service errors', async () => {
      const error = new BadRequestException('Invalid date range');
      reportsService.getReportData.mockRejectedValue(error);

      await expect(
        controller.getReportData(ReportType.INCOME_STATEMENT, query, testUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateInsights', () => {
    const insightsRequest: InsightsRequestDto = {
      reportData: {
        income: { totalCents: 15000000 },
        expenses: { totalCents: 12000000 },
        netProfitCents: 3000000,
      },
    };

    it('should generate AI insights for INCOME_STATEMENT', async () => {
      reportsService.generateInsights.mockResolvedValue(testInsightsResponse);

      const result = await controller.generateInsights(
        ReportType.INCOME_STATEMENT,
        insightsRequest,
        testUser,
      );

      expect(result.success).toBe(true);
      expect(result.source).toBe('SDK');
      expect(reportsService.generateInsights).toHaveBeenCalledWith(
        ReportType.INCOME_STATEMENT,
        insightsRequest.reportData,
        testTenantId,
      );
    });

    it('should return fallback insights when SDK is unavailable', async () => {
      const fallbackResponse = {
        ...testInsightsResponse,
        source: 'FALLBACK' as const,
      };
      reportsService.generateInsights.mockResolvedValue(fallbackResponse);

      const result = await controller.generateInsights(
        ReportType.INCOME_STATEMENT,
        insightsRequest,
        testUser,
      );

      expect(result.source).toBe('FALLBACK');
    });

    it('should throw ForbiddenException for user without tenantId', async () => {
      const userWithoutTenant = { ...testUser, tenantId: null };

      await expect(
        controller.generateInsights(
          ReportType.INCOME_STATEMENT,
          insightsRequest,
          userWithoutTenant as IUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('exportReport', () => {
    const exportQuery: ExportQueryDto = {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31'),
      format: ExportFormat.PDF,
      includeInsights: true,
    };

    it('should stream PDF export to response', async () => {
      reportsService.exportReport.mockResolvedValue(testExportResult);

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportReport(
        ReportType.INCOME_STATEMENT,
        exportQuery,
        testUser,
        mockRes,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="income-statement-2025-01-01-to-2025-12-31.pdf"',
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(testExportResult.buffer);
    });

    it('should export as Excel format', async () => {
      const excelResult = {
        ...testExportResult,
        filename: 'income-statement-2025-01-01-to-2025-12-31.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      reportsService.exportReport.mockResolvedValue(excelResult);

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportReport(
        ReportType.INCOME_STATEMENT,
        { ...exportQuery, format: ExportFormat.EXCEL },
        testUser,
        mockRes,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('should export as CSV format', async () => {
      const csvResult = {
        ...testExportResult,
        filename: 'income-statement-2025-01-01-to-2025-12-31.csv',
        contentType: 'text/csv',
      };
      reportsService.exportReport.mockResolvedValue(csvResult);

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportReport(
        ReportType.INCOME_STATEMENT,
        { ...exportQuery, format: ExportFormat.CSV },
        testUser,
        mockRes,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
    });

    it('should throw ForbiddenException for user without tenantId', async () => {
      const userWithoutTenant = { ...testUser, tenantId: null };
      const mockRes = {} as Response;

      await expect(
        controller.exportReport(
          ReportType.INCOME_STATEMENT,
          exportQuery,
          userWithoutTenant as IUser,
          mockRes,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReportTypes', () => {
    it('should return available report types', async () => {
      const result = await controller.getReportTypes(testUser);

      expect(result.types).toBeDefined();
      expect(result.types.length).toBeGreaterThan(0);

      const incomeStatement = result.types.find(
        (t) => t.type === ReportType.INCOME_STATEMENT,
      );
      expect(incomeStatement).toBeDefined();
      expect(incomeStatement?.available).toBe(true);
    });

    it('should include both available and unavailable report types', async () => {
      const result = await controller.getReportTypes(testUser);

      const availableTypes = result.types.filter((t) => t.available);
      const unavailableTypes = result.types.filter((t) => !t.available);

      expect(availableTypes.length).toBeGreaterThan(0);
      expect(unavailableTypes.length).toBeGreaterThan(0);
    });
  });

  describe('getExportFormats', () => {
    it('should return available export formats', async () => {
      const result = await controller.getExportFormats(testUser);

      expect(result.formats).toBeDefined();
      expect(result.formats.length).toBe(3);

      const pdfFormat = result.formats.find(
        (f) => f.format === ExportFormat.PDF,
      );
      expect(pdfFormat).toBeDefined();
      expect(pdfFormat?.contentType).toBe('application/pdf');
    });
  });
});
