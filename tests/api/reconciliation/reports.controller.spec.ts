/**
 * Reports Controller Tests
 * TASK-RECON-032: Financial Reports Endpoint
 *
 * Tests for GET /reconciliation/income-statement endpoint.
 * Uses jest.spyOn() for service verification - NO MOCK DATA.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationController } from '../../../src/api/reconciliation/reconciliation.controller';
import { ReconciliationService } from '../../../src/database/services/reconciliation.service';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import { FinancialReportService } from '../../../src/database/services/financial-report.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { IncomeStatement } from '../../../src/database/dto/financial-report.dto';
import { BusinessException } from '../../../src/shared/exceptions';

describe('ReconciliationController - getIncomeStatement', () => {
  let controller: ReconciliationController;
  let financialReportService: FinancialReportService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: IUser = {
    id: 'admin-789',
    tenantId: mockTenantId,
    auth0Id: 'auth0|admin789',
    email: 'admin@school.com',
    role: UserRole.ADMIN,
    name: 'School Admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAccountantUser: IUser = {
    id: 'accountant-101',
    tenantId: mockTenantId,
    auth0Id: 'auth0|accountant101',
    email: 'accountant@school.com',
    role: UserRole.ACCOUNTANT,
    name: 'School Accountant',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockViewerUser: IUser = {
    id: 'viewer-202',
    tenantId: mockTenantId,
    auth0Id: 'auth0|viewer202',
    email: 'viewer@school.com',
    role: UserRole.VIEWER,
    name: 'Report Viewer',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReconciliationController],
      providers: [
        {
          provide: ReconciliationService,
          useValue: { reconcile: jest.fn() },
        },
        {
          provide: ReconciliationRepository,
          useValue: {},
        },
        {
          provide: FinancialReportService,
          useValue: { generateIncomeStatement: jest.fn() },
        },
        {
          provide: InvoiceRepository,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<ReconciliationController>(ReconciliationController);
    financialReportService = module.get<FinancialReportService>(FinancialReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /reconciliation/income-statement', () => {
    it('should return 200 with valid period and transformed snake_case response', async () => {
      // Arrange
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: {
          start: new Date('2025-01-01'),
          end: new Date('2025-01-31'),
        },
        income: {
          totalCents: 15450000, // R154,500
          totalRands: 154500.0,
          breakdown: [
            {
              accountCode: '4000',
              accountName: 'School Fees',
              amountCents: 15450000,
              amountRands: 154500.0,
            },
          ],
        },
        expenses: {
          totalCents: 8520000, // R85,200
          totalRands: 85200.0,
          breakdown: [
            {
              accountCode: '5000',
              accountName: 'Salaries',
              amountCents: 6000000,
              amountRands: 60000.0,
            },
            {
              accountCode: '5200',
              accountName: 'Utilities',
              amountCents: 2520000,
              amountRands: 25200.0,
            },
          ],
        },
        netProfitCents: 6930000, // R69,300
        netProfitRands: 69300.0,
        generatedAt: new Date('2025-01-31T14:30:00.000Z'),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      // Act
      const result = await controller.getIncomeStatement(
        {
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        },
        mockOwnerUser,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.net_profit).toBe(69300.0);
      expect(result.data.income.total).toBe(154500.0);
      expect(result.data.expenses.total).toBe(85200.0);
    });

    it('should transform API snake_case to service camelCase (period_start → periodStart)', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-02-01'), end: new Date('2025-02-28') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      const serviceSpy = jest
        .spyOn(financialReportService, 'generateIncomeStatement')
        .mockResolvedValue(mockReport);

      await controller.getIncomeStatement(
        {
          period_start: '2025-02-01', // snake_case input
          period_end: '2025-02-28',
        },
        mockOwnerUser,
      );

      // Verify transformation to Date objects (camelCase in service)
      expect(serviceSpy).toHaveBeenCalledWith(
        mockTenantId,
        expect.any(Date), // periodStart as Date
        expect.any(Date), // periodEnd as Date
      );
    });

    it('should convert Date to ISO date string in response (period.start, period.end)', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: {
          start: new Date('2025-03-01T00:00:00.000Z'),
          end: new Date('2025-03-31T00:00:00.000Z'),
        },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-03-01', period_end: '2025-03-31' },
        mockOwnerUser,
      );

      // Verify YYYY-MM-DD format
      expect(result.data.period.start).toBe('2025-03-01');
      expect(result.data.period.end).toBe('2025-03-31');
    });

    it('should return response with snake_case field names (net_profit, not netProfit)', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-04-01'), end: new Date('2025-04-30') },
        income: {
          totalCents: 10000000,
          totalRands: 100000.0,
          breakdown: [
            { accountCode: '4000', accountName: 'School Fees', amountCents: 10000000, amountRands: 100000.0 },
          ],
        },
        expenses: {
          totalCents: 5000000,
          totalRands: 50000.0,
          breakdown: [
            { accountCode: '5000', accountName: 'Salaries', amountCents: 5000000, amountRands: 50000.0 },
          ],
        },
        netProfitCents: 5000000,
        netProfitRands: 50000.0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-04-01', period_end: '2025-04-30' },
        mockOwnerUser,
      );

      // Verify snake_case fields
      expect(result.data).toHaveProperty('net_profit');
      expect(result.data).toHaveProperty('generated_at');
      expect(result.data.income.breakdown[0]).toHaveProperty('account_code');
      expect(result.data.income.breakdown[0]).toHaveProperty('account_name');
      // Verify camelCase NOT present
      expect(result.data).not.toHaveProperty('netProfit');
      expect(result.data).not.toHaveProperty('generatedAt');
    });

    it('should calculate net_profit correctly (income.total - expenses.total)', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-05-01'), end: new Date('2025-05-31') },
        income: { totalCents: 20000000, totalRands: 200000.0, breakdown: [] },
        expenses: { totalCents: 12500000, totalRands: 125000.0, breakdown: [] },
        netProfitCents: 7500000, // 200000 - 125000 = 75000
        netProfitRands: 75000.0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-05-01', period_end: '2025-05-31' },
        mockOwnerUser,
      );

      expect(result.data.net_profit).toBe(75000.0);
      expect(result.data.income.total - result.data.expenses.total).toBe(result.data.net_profit);
    });

    it('should return breakdown arrays with account_code and account_name', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-06-01'), end: new Date('2025-06-30') },
        income: {
          totalCents: 15000000,
          totalRands: 150000.0,
          breakdown: [
            { accountCode: '4000', accountName: 'School Fees', amountCents: 15000000, amountRands: 150000.0 },
          ],
        },
        expenses: {
          totalCents: 8000000,
          totalRands: 80000.0,
          breakdown: [
            { accountCode: '5000', accountName: 'Salaries', amountCents: 6000000, amountRands: 60000.0 },
            { accountCode: '5100', accountName: 'Food & Catering', amountCents: 2000000, amountRands: 20000.0 },
          ],
        },
        netProfitCents: 7000000,
        netProfitRands: 70000.0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-06-01', period_end: '2025-06-30' },
        mockOwnerUser,
      );

      expect(result.data.income.breakdown).toHaveLength(1);
      expect(result.data.income.breakdown[0].account_code).toBe('4000');
      expect(result.data.income.breakdown[0].account_name).toBe('School Fees');
      expect(result.data.expenses.breakdown).toHaveLength(2);
      expect(result.data.expenses.breakdown[0].account_code).toBe('5000');
      expect(result.data.expenses.breakdown[1].account_code).toBe('5100');
    });

    it('should work for ADMIN users same as OWNER', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-07-01'), end: new Date('2025-07-31') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      const serviceSpy = jest
        .spyOn(financialReportService, 'generateIncomeStatement')
        .mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-07-01', period_end: '2025-07-31' },
        mockAdminUser,
      );

      expect(serviceSpy).toHaveBeenCalledWith(mockTenantId, expect.any(Date), expect.any(Date));
      expect(result.success).toBe(true);
    });

    it('should work for ACCOUNTANT role', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-08-01'), end: new Date('2025-08-31') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      const serviceSpy = jest
        .spyOn(financialReportService, 'generateIncomeStatement')
        .mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-08-01', period_end: '2025-08-31' },
        mockAccountantUser,
      );

      expect(serviceSpy).toHaveBeenCalledWith(mockTenantId, expect.any(Date), expect.any(Date));
      expect(result.success).toBe(true);
    });

    it('should work for VIEWER role (read-only reports)', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-09-01'), end: new Date('2025-09-30') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      const serviceSpy = jest
        .spyOn(financialReportService, 'generateIncomeStatement')
        .mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-09-01', period_end: '2025-09-30' },
        mockViewerUser,
      );

      expect(serviceSpy).toHaveBeenCalledWith(mockTenantId, expect.any(Date), expect.any(Date));
      expect(result.success).toBe(true);
    });

    it('should propagate BusinessException when period_end before period_start', async () => {
      const businessError = new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        { periodStart: '2025-12-31', periodEnd: '2025-01-01' },
      );
      jest.spyOn(financialReportService, 'generateIncomeStatement').mockRejectedValue(businessError);

      await expect(
        controller.getIncomeStatement(
          { period_start: '2025-12-31', period_end: '2025-01-01' },
          mockOwnerUser,
        ),
      ).rejects.toThrow(BusinessException);

      await expect(
        controller.getIncomeStatement(
          { period_start: '2025-12-31', period_end: '2025-01-01' },
          mockOwnerUser,
        ),
      ).rejects.toThrow('Period start must be before period end');
    });

    it('should return generated_at as ISO timestamp', async () => {
      const generatedAt = new Date('2025-10-15T10:30:45.000Z');
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-10-01'), end: new Date('2025-10-31') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt,
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-10-01', period_end: '2025-10-31' },
        mockOwnerUser,
      );

      expect(result.data.generated_at).toBe('2025-10-15T10:30:45.000Z');
    });

    it('should return full data structure with format=json (default)', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-11-01'), end: new Date('2025-11-30') },
        income: {
          totalCents: 10000000,
          totalRands: 100000.0,
          breakdown: [
            { accountCode: '4000', accountName: 'School Fees', amountCents: 10000000, amountRands: 100000.0 },
          ],
        },
        expenses: {
          totalCents: 6000000,
          totalRands: 60000.0,
          breakdown: [
            { accountCode: '5000', accountName: 'Salaries', amountCents: 6000000, amountRands: 60000.0 },
          ],
        },
        netProfitCents: 4000000,
        netProfitRands: 40000.0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-11-01', period_end: '2025-11-30', format: 'json' },
        mockOwnerUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.period).toBeDefined();
      expect(result.data.income).toBeDefined();
      expect(result.data.expenses).toBeDefined();
      expect(result.data.net_profit).toBe(40000.0);
      expect(result.data.document_url).toBeUndefined();
    });

    it('should include document_url when format is pdf', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-12-01'), end: new Date('2025-12-31') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-12-01', period_end: '2025-12-31', format: 'pdf' },
        mockOwnerUser,
      );

      expect(result.data.document_url).toBe('/reports/income-statement/download?format=pdf');
    });

    it('should include document_url when format is excel', async () => {
      const mockReport: IncomeStatement = {
        tenantId: mockTenantId,
        period: { start: new Date('2025-12-01'), end: new Date('2025-12-31') },
        income: { totalCents: 0, totalRands: 0, breakdown: [] },
        expenses: { totalCents: 0, totalRands: 0, breakdown: [] },
        netProfitCents: 0,
        netProfitRands: 0,
        generatedAt: new Date(),
      };

      jest.spyOn(financialReportService, 'generateIncomeStatement').mockResolvedValue(mockReport);

      const result = await controller.getIncomeStatement(
        { period_start: '2025-12-01', period_end: '2025-12-31', format: 'excel' },
        mockOwnerUser,
      );

      expect(result.data.document_url).toBe('/reports/income-statement/download?format=excel');
    });
  });
});
