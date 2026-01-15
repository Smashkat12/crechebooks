/**
 * SimplePay Reports Service Tests
 * TASK-SPAY-005: SimplePay Reports Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SimplePayReportsService } from '../../../src/integrations/simplepay/simplepay-reports.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { ReportRequestRepository } from '../../../src/database/repositories/report-request.repository';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  ReportStatus,
  ReportType,
  SimplePayEtiReport,
  SimplePayTransactionHistoryReport,
  SimplePayVarianceReport,
  SimplePayLeaveLiabilityReport,
  SimplePayLeaveComparisonReport,
  SimplePayTrackedBalancesReport,
} from '../../../src/database/entities/report-request.entity';
import { Tenant } from '@prisma/client';

describe('SimplePayReportsService', () => {
  let service: SimplePayReportsService;
  let reportRequestRepo: ReportRequestRepository;
  let prisma: PrismaService;
  let tenant: Tenant;

  // Mock API client methods
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockInitializeForTenant = jest.fn();
  const mockGetClientId = jest.fn().mockReturnValue('test-client-123');

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePayReportsService,
        {
          provide: SimplePayApiClient,
          useValue: {
            get: mockGet,
            post: mockPost,
            initializeForTenant: mockInitializeForTenant,
            getClientId: mockGetClientId,
          },
        },
        ReportRequestRepository,
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                SIMPLEPAY_API_URL: 'https://api.simplepay.co.za/v1',
                SIMPLEPAY_API_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SimplePayReportsService>(SimplePayReportsService);
    reportRequestRepo = module.get<ReportRequestRepository>(
      ReportRequestRepository,
    );
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockInitializeForTenant.mockResolvedValue(undefined);

    // Clean database in exact order
    await prisma.reportRequest.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.profileMappingSync.deleteMany({});
    await prisma.servicePeriodSync.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staffOffboarding.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayEmployeeMapping.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Daycare',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateEtiReport', () => {
    const mockEtiReport: SimplePayEtiReport = {
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      total_eti: 1500.0,
      eligible_employees: 3,
      entries: [
        {
          employee_id: 1,
          employee_name: 'Thabo Modise',
          id_number: '9501015800084',
          gross_remuneration: 6000.0,
          eti_eligible: true,
          eti_amount: 500.0,
          eti_month: 3,
          employment_start_date: '2024-01-15',
          age_at_month_end: 24,
        },
        {
          employee_id: 2,
          employee_name: 'Lerato Molefe',
          id_number: '9601026800085',
          gross_remuneration: 5500.0,
          eti_eligible: true,
          eti_amount: 500.0,
          eti_month: 2,
          employment_start_date: '2024-01-20',
          age_at_month_end: 23,
        },
      ],
    };

    it('should generate ETI report successfully', async () => {
      mockGet.mockResolvedValue({ report: mockEtiReport });

      const result = await service.generateEtiReport(
        tenant.id,
        { periodStart: '2024-01-01', periodEnd: '2024-01-31' },
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.reportType).toBe(ReportType.ETI);
      expect(result.status).toBe(ReportStatus.COMPLETED);
      expect(result.data).toBeDefined();
      expect((result.data as { totalEtiCents: number }).totalEtiCents).toBe(
        150000,
      );
      expect(
        (result.data as { eligibleEmployees: number }).eligibleEmployees,
      ).toBe(3);
      expect(mockInitializeForTenant).toHaveBeenCalledWith(tenant.id);
    });

    it('should handle unwrapped API response', async () => {
      mockGet.mockResolvedValue(mockEtiReport);

      const result = await service.generateEtiReport(tenant.id, {});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle API error gracefully', async () => {
      mockGet.mockRejectedValue(new Error('API connection failed'));

      const result = await service.generateEtiReport(tenant.id, {});

      expect(result.success).toBe(false);
      expect(result.status).toBe(ReportStatus.FAILED);
      expect(result.errorMessage).toBe('API connection failed');
    });

    it('should store report request in database', async () => {
      mockGet.mockResolvedValue({ report: mockEtiReport });

      const result = await service.generateEtiReport(tenant.id, {});

      const storedRequest = await reportRequestRepo.findById(
        result.reportRequestId,
        tenant.id,
      );
      expect(storedRequest).toBeDefined();
      expect(storedRequest!.status).toBe(ReportStatus.COMPLETED);
      expect(storedRequest!.resultData).toBeDefined();
    });
  });

  describe('generateTransactionHistory', () => {
    const mockTransactionReport: SimplePayTransactionHistoryReport = {
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      total_entries: 2,
      total_amount: 12500.0,
      entries: [
        {
          id: 1,
          employee_id: 1,
          employee_name: 'Thabo Modise',
          date: '2024-01-31',
          code: 'BASIC',
          description: 'Basic Salary',
          type: 'earning',
          amount: 6000.0,
          pay_run_id: 'PR-001',
        },
        {
          id: 2,
          employee_id: 1,
          employee_name: 'Thabo Modise',
          date: '2024-01-31',
          code: 'PAYE',
          description: 'PAYE Tax',
          type: 'deduction',
          amount: 500.0,
          pay_run_id: 'PR-001',
        },
      ],
    };

    it('should generate transaction history report successfully', async () => {
      mockGet.mockResolvedValue({ report: mockTransactionReport });

      const result = await service.generateTransactionHistory(tenant.id, {
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe(ReportType.TRANSACTION_HISTORY);
      expect((result.data as { totalEntries: number }).totalEntries).toBe(2);
      expect(
        (result.data as { totalAmountCents: number }).totalAmountCents,
      ).toBe(1250000);
    });

    it('should filter by transaction type', async () => {
      mockGet.mockResolvedValue({ report: mockTransactionReport });

      await service.generateTransactionHistory(tenant.id, {
        transactionType: 'earning',
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('type=earning'),
      );
    });

    it('should filter by employee', async () => {
      mockGet.mockResolvedValue({ report: mockTransactionReport });

      await service.generateTransactionHistory(tenant.id, {
        employeeId: 'emp-123',
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('employee_id=emp-123'),
      );
    });
  });

  describe('generateVarianceReport', () => {
    const mockVarianceReport: SimplePayVarianceReport = {
      period1_start: '2024-01-01',
      period1_end: '2024-01-31',
      period2_start: '2024-02-01',
      period2_end: '2024-02-29',
      total_variance: 1000.0,
      entries: [
        {
          employee_id: 1,
          employee_name: 'Thabo Modise',
          item_code: 'BASIC',
          item_description: 'Basic Salary',
          period1_amount: 6000.0,
          period2_amount: 7000.0,
          variance_amount: 1000.0,
          variance_percentage: 16.67,
        },
      ],
    };

    it('should generate variance report successfully', async () => {
      mockGet.mockResolvedValue({ report: mockVarianceReport });

      const result = await service.generateVarianceReport(tenant.id, {
        periodStart1: '2024-01-01',
        periodEnd1: '2024-01-31',
        periodStart2: '2024-02-01',
        periodEnd2: '2024-02-29',
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe(ReportType.VARIANCE);
      expect(
        (result.data as { totalVarianceCents: number }).totalVarianceCents,
      ).toBe(100000);
    });

    it('should include employee details when requested', async () => {
      mockGet.mockResolvedValue({ report: mockVarianceReport });

      await service.generateVarianceReport(tenant.id, {
        periodStart1: '2024-01-01',
        periodEnd1: '2024-01-31',
        periodStart2: '2024-02-01',
        periodEnd2: '2024-02-29',
        includeEmployeeDetails: true,
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('include_details=true'),
      );
    });
  });

  describe('generateLeaveLiabilityReport', () => {
    const mockLeaveLiabilityReport: SimplePayLeaveLiabilityReport = {
      as_at_date: '2024-01-31',
      total_liability: 25000.0,
      entries: [
        {
          employee_id: 1,
          employee_name: 'Thabo Modise',
          leave_type_id: 1,
          leave_type_name: 'Annual Leave',
          balance_days: 15,
          balance_hours: 120,
          daily_rate: 500.0,
          liability_amount: 7500.0,
        },
        {
          employee_id: 2,
          employee_name: 'Lerato Molefe',
          leave_type_id: 1,
          leave_type_name: 'Annual Leave',
          balance_days: 20,
          balance_hours: 160,
          daily_rate: 450.0,
          liability_amount: 9000.0,
        },
      ],
    };

    it('should generate leave liability report successfully', async () => {
      mockGet.mockResolvedValue({ report: mockLeaveLiabilityReport });

      const result = await service.generateLeaveLiabilityReport(tenant.id, {});

      expect(result.success).toBe(true);
      expect(result.reportType).toBe(ReportType.LEAVE_LIABILITY);
      expect(
        (result.data as { totalLiabilityCents: number }).totalLiabilityCents,
      ).toBe(2500000);
    });

    it('should filter by leave type', async () => {
      mockGet.mockResolvedValue({ report: mockLeaveLiabilityReport });

      await service.generateLeaveLiabilityReport(tenant.id, {
        leaveTypeId: 1,
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('leave_type_id=1'),
      );
    });
  });

  describe('generateLeaveComparisonReport', () => {
    const mockLeaveComparisonReport: SimplePayLeaveComparisonReport = {
      year1: 2023,
      year2: 2024,
      entries: [
        {
          employee_id: 1,
          employee_name: 'Thabo Modise',
          leave_type_id: 1,
          leave_type_name: 'Annual Leave',
          year1_taken: 12,
          year2_taken: 8,
          difference: -4,
        },
      ],
    };

    it('should generate leave comparison report successfully', async () => {
      mockGet.mockResolvedValue({ report: mockLeaveComparisonReport });

      const result = await service.generateLeaveComparisonReport(tenant.id, {
        year1: 2023,
        year2: 2024,
      });

      expect(result.success).toBe(true);
      expect(result.reportType).toBe(ReportType.LEAVE_COMPARISON);
      expect((result.data as { year1: number }).year1).toBe(2023);
      expect((result.data as { year2: number }).year2).toBe(2024);
    });
  });

  describe('generateTrackedBalancesReport', () => {
    const mockTrackedBalancesReport: SimplePayTrackedBalancesReport = {
      as_at_date: '2024-01-31',
      entries: [
        {
          employee_id: 1,
          employee_name: 'Thabo Modise',
          balance_type: 'LOAN',
          balance_name: 'Employee Loan',
          opening_balance: 5000.0,
          additions: 0,
          deductions: 500.0,
          closing_balance: 4500.0,
        },
      ],
    };

    it('should generate tracked balances report successfully', async () => {
      mockGet.mockResolvedValue({ report: mockTrackedBalancesReport });

      const result = await service.generateTrackedBalancesReport(tenant.id, {});

      expect(result.success).toBe(true);
      expect(result.reportType).toBe(ReportType.TRACKED_BALANCES);
    });

    it('should filter by balance types', async () => {
      mockGet.mockResolvedValue({ report: mockTrackedBalancesReport });

      await service.generateTrackedBalancesReport(tenant.id, {
        balanceTypes: ['LOAN', 'ADVANCE'],
      });

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('balance_types=LOAN,ADVANCE'),
      );
    });
  });

  describe('Report Request Management', () => {
    const mockEtiReportComplete: SimplePayEtiReport = {
      period_start: '2024-01-01',
      period_end: '2024-01-31',
      total_eti: 1500.0,
      eligible_employees: 1,
      entries: [
        {
          employee_id: 1,
          employee_name: 'Test Employee',
          id_number: '9501015800084',
          gross_remuneration: 6000.0,
          eti_eligible: true,
          eti_amount: 500.0,
          eti_month: 3,
          employment_start_date: '2024-01-15',
          age_at_month_end: 24,
        },
      ],
    };

    const mockVarianceReportComplete: SimplePayVarianceReport = {
      period1_start: '2024-01-01',
      period1_end: '2024-01-31',
      period2_start: '2024-02-01',
      period2_end: '2024-02-29',
      total_variance: 1000.0,
      entries: [],
    };

    it('should get report request by ID', async () => {
      mockGet.mockResolvedValue({ report: mockEtiReportComplete });

      const result = await service.generateEtiReport(tenant.id, {});

      const reportRequest = await service.getReportRequest(
        tenant.id,
        result.reportRequestId,
      );

      expect(reportRequest).toBeDefined();
      expect(reportRequest.id).toBe(result.reportRequestId);
    });

    it('should get report history for tenant', async () => {
      mockGet
        .mockResolvedValueOnce({ report: mockEtiReportComplete })
        .mockResolvedValueOnce({ report: mockVarianceReportComplete });

      await service.generateEtiReport(tenant.id, {});
      await service.generateVarianceReport(tenant.id, {
        periodStart1: '2024-01-01',
        periodEnd1: '2024-01-31',
        periodStart2: '2024-02-01',
        periodEnd2: '2024-02-29',
      });

      const history = await service.getReportHistory(tenant.id);

      expect(history).toHaveLength(2);
    });

    it('should get pending reports for tenant', async () => {
      // Create a report that will fail (to leave it in QUEUED state initially)
      mockGet.mockRejectedValueOnce(new Error('API error'));
      await service.generateEtiReport(tenant.id, {});

      // The failed report goes to FAILED state, so let's create one that stays QUEUED
      const request = await reportRequestRepo.create({
        tenantId: tenant.id,
        reportType: ReportType.VARIANCE,
        params: {},
      });

      const pending = await service.getPendingReports(tenant.id);

      expect(pending.some((r) => r.id === request.id)).toBe(true);
    });

    it('should get report statistics', async () => {
      mockGet
        .mockResolvedValueOnce({ report: mockEtiReportComplete })
        .mockResolvedValueOnce({ report: mockEtiReportComplete })
        .mockRejectedValueOnce(new Error('Failed'));

      await service.generateEtiReport(tenant.id, {});
      await service.generateEtiReport(tenant.id, {});
      await service.generateVarianceReport(tenant.id, {
        periodStart1: '2024-01-01',
        periodEnd1: '2024-01-31',
        periodStart2: '2024-02-01',
        periodEnd2: '2024-02-29',
      });

      const stats = await service.getReportStatistics(tenant.id);

      expect(stats.total).toBe(3);
      expect(stats.byStatus[ReportStatus.COMPLETED]).toBe(2);
      expect(stats.byStatus[ReportStatus.FAILED]).toBe(1);
      expect(stats.byType[ReportType.ETI]).toBe(2);
      expect(stats.byType[ReportType.VARIANCE]).toBe(1);
    });

    it('should cleanup old reports', async () => {
      mockGet.mockResolvedValue({ report: mockEtiReportComplete });

      const result = await service.generateEtiReport(tenant.id, {});

      // Manually set the requestedAt to 31 days ago
      await prisma.reportRequest.update({
        where: { id: result.reportRequestId },
        data: {
          requestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });

      const deletedCount = await service.cleanupOldReports(tenant.id, 30);

      expect(deletedCount).toBe(1);
    });
  });

  describe('Data Transformation', () => {
    it('should convert amounts to cents', async () => {
      const mockEtiReport: SimplePayEtiReport = {
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        total_eti: 1500.5,
        eligible_employees: 1,
        entries: [
          {
            employee_id: 1,
            employee_name: 'Test',
            id_number: '1234567890123',
            gross_remuneration: 6000.75,
            eti_eligible: true,
            eti_amount: 500.25,
            eti_month: 3,
            employment_start_date: '2024-01-15',
            age_at_month_end: 24,
          },
        ],
      };

      mockGet.mockResolvedValue({ report: mockEtiReport });

      const result = await service.generateEtiReport(tenant.id, {});

      expect(result.success).toBe(true);
      expect((result.data as { totalEtiCents: number }).totalEtiCents).toBe(
        150050,
      );

      type EtiEntry = {
        grossRemunerationCents: number;
        etiAmountCents: number;
      };
      const entries = (result.data as { entries: EtiEntry[] }).entries;
      expect(entries[0].grossRemunerationCents).toBe(600075);
      expect(entries[0].etiAmountCents).toBe(50025);
    });

    it('should convert dates to Date objects', async () => {
      const mockEtiReport: SimplePayEtiReport = {
        period_start: '2024-01-01',
        period_end: '2024-01-31',
        total_eti: 0,
        eligible_employees: 0,
        entries: [],
      };

      mockGet.mockResolvedValue({ report: mockEtiReport });

      const result = await service.generateEtiReport(tenant.id, {});

      expect(result.success).toBe(true);
      expect((result.data as { periodStart: Date }).periodStart).toBeInstanceOf(
        Date,
      );
      expect((result.data as { periodEnd: Date }).periodEnd).toBeInstanceOf(
        Date,
      );
    });
  });
});
