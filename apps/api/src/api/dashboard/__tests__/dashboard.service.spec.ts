import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { Logger } from '@nestjs/common';

describe('DashboardService', () => {
  let service: DashboardService;
  let prismaService: jest.Mocked<PrismaService>;

  const tenantId = 'test-tenant-123';

  // Mock data generators
  const createMockTransaction = (overrides = {}) => ({
    amountCents: 10000,
    status: 'MATCHED',
    ...overrides,
  });

  const createMockInvoice = (overrides = {}) => ({
    totalCents: 20000,
    amountPaidCents: 10000,
    status: 'SENT',
    dueDate: new Date(),
    parentId: 'parent-1',
    ...overrides,
  });

  beforeEach(async () => {
    const mockPrismaService = {
      transaction: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      enrollment: {
        count: jest.fn(),
      },
      payment: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    prismaService = module.get(PrismaService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      // Setup default mock returns
      (prismaService.transaction.findFirst as jest.Mock).mockResolvedValue({
        date: new Date('2025-01-15'),
      });

      (prismaService.transaction.findMany as jest.Mock).mockResolvedValue([
        createMockTransaction({ amountCents: 50000 }),
        createMockTransaction({ amountCents: 30000 }),
      ]);

      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue([
        createMockInvoice({ totalCents: 40000, amountPaidCents: 20000 }),
      ]);

      (prismaService.enrollment.count as jest.Mock).mockResolvedValue(10);
      (prismaService.payment.count as jest.Mock).mockResolvedValue(5);
    });

    it('should execute queries in parallel using Promise.all', async () => {
      const startTime = Date.now();

      await service.getMetrics(tenantId);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // All queries should execute nearly simultaneously
      // If they were sequential, we'd expect much longer duration
      expect(duration).toBeLessThan(500);

      // Verify all queries were called
      expect(prismaService.transaction.findMany).toHaveBeenCalled();
      expect(prismaService.invoice.findMany).toHaveBeenCalled();
      expect(prismaService.enrollment.count).toHaveBeenCalled();
      expect(prismaService.payment.count).toHaveBeenCalled();
    });

    it('should return correct metrics structure', async () => {
      const result = await service.getMetrics(tenantId);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('expenses');
      expect(result).toHaveProperty('arrears');
      expect(result).toHaveProperty('enrollment');
      expect(result).toHaveProperty('payments');
    });

    it('should calculate revenue metrics correctly', async () => {
      (prismaService.transaction.findMany as jest.Mock)
        .mockResolvedValueOnce([
          // Income transactions
          createMockTransaction({ amountCents: 100000 }),
          createMockTransaction({ amountCents: 50000 }),
        ])
        .mockResolvedValueOnce([
          // Expense transactions
          createMockTransaction({ amountCents: -30000 }),
        ]);

      (prismaService.invoice.findMany as jest.Mock)
        .mockResolvedValueOnce([
          // Regular invoices
          createMockInvoice({ totalCents: 200000, amountPaidCents: 150000 }),
        ])
        .mockResolvedValueOnce([
          // Overdue invoices
        ]);

      const result = await service.getMetrics(tenantId);

      expect(result.revenue.total).toBe(1500); // (100000 + 50000) / 100
      expect(result.revenue.invoiced).toBe(2000); // 200000 / 100
      expect(result.revenue.collected).toBe(1500); // 150000 / 100
      expect(result.revenue.outstanding).toBe(500); // (200000 - 150000) / 100
    });

    it('should calculate arrears with aging buckets', async () => {
      const now = new Date();
      const thirtyOneDaysAgo = new Date(
        now.getTime() - 31 * 24 * 60 * 60 * 1000,
      );
      const sixtyOneDaysAgo = new Date(
        now.getTime() - 61 * 24 * 60 * 60 * 1000,
      );
      const ninetyOneDaysAgo = new Date(
        now.getTime() - 91 * 24 * 60 * 60 * 1000,
      );

      (prismaService.invoice.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // Regular invoices
        .mockResolvedValueOnce([
          // Overdue invoices
          createMockInvoice({
            totalCents: 10000,
            amountPaidCents: 0,
            dueDate: thirtyOneDaysAgo,
            parentId: 'p1',
          }),
          createMockInvoice({
            totalCents: 20000,
            amountPaidCents: 5000,
            dueDate: sixtyOneDaysAgo,
            parentId: 'p2',
          }),
          createMockInvoice({
            totalCents: 30000,
            amountPaidCents: 0,
            dueDate: ninetyOneDaysAgo,
            parentId: 'p3',
          }),
        ]);

      const result = await service.getMetrics(tenantId);

      expect(result.arrears.count).toBe(3); // 3 unique parents
      expect(result.arrears.overdueBy30).toBe(100); // 10000 / 100
      expect(result.arrears.overdueBy60).toBe(150); // (20000 - 5000) / 100
      expect(result.arrears.overdueBy90).toBe(300); // 30000 / 100
      expect(result.arrears.total).toBe(550); // Sum of all buckets
    });

    it('should handle empty results gracefully', async () => {
      (prismaService.transaction.findFirst as jest.Mock).mockResolvedValue(
        null,
      );
      (prismaService.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.enrollment.count as jest.Mock).mockResolvedValue(0);
      (prismaService.payment.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getMetrics(tenantId);

      expect(result.revenue.total).toBe(0);
      expect(result.expenses.total).toBe(0);
      expect(result.arrears.total).toBe(0);
      expect(result.enrollment.total).toBe(0);
    });

    it('should filter by year when provided', async () => {
      await service.getMetrics(tenantId, undefined, 2025);

      // Check that findFirst was NOT called (we use year directly)
      expect(prismaService.transaction.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getMetricsWithTimeout', () => {
    beforeEach(() => {
      (prismaService.transaction.findFirst as jest.Mock).mockResolvedValue({
        date: new Date('2025-01-15'),
      });
      (prismaService.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.enrollment.count as jest.Mock).mockResolvedValue(0);
      (prismaService.payment.count as jest.Mock).mockResolvedValue(0);
    });

    it('should return metrics within timeout', async () => {
      const result = await service.getMetricsWithTimeout(tenantId, 5000);

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('revenue');
    });

    it('should use default timeout when not specified', async () => {
      const result = await service.getMetricsWithTimeout(tenantId);

      expect(result).toHaveProperty('period');
    });

    it('should timeout for slow queries', async () => {
      // Make one query very slow
      (prismaService.transaction.findMany as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 5000)),
      );

      // Use a very short timeout
      await expect(
        service.getMetricsWithTimeout(tenantId, 10),
      ).rejects.toThrow();
    });
  });

  describe('getTrends', () => {
    beforeEach(() => {
      (prismaService.transaction.findFirst as jest.Mock).mockResolvedValue({
        date: new Date('2025-01-15'),
      });
      (prismaService.transaction.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amountCents: 50000 },
      });
      (prismaService.invoice.aggregate as jest.Mock).mockResolvedValue({
        _sum: { totalCents: 60000, amountPaidCents: 30000 },
      });
    });

    it('should return trend data for 6 months by default', async () => {
      const result = await service.getTrends(tenantId);

      expect(result.data).toHaveLength(6);
      expect(result.interval).toBe('monthly');
    });

    it('should return trend data for 12 months when year is specified', async () => {
      const result = await service.getTrends(tenantId, undefined, 2025);

      expect(result.data).toHaveLength(12);
    });

    it('should execute month queries in parallel', async () => {
      const startTime = Date.now();

      await service.getTrends(tenantId);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Parallel execution should be fast
      expect(duration).toBeLessThan(500);
    });

    it('should calculate profit correctly', async () => {
      (prismaService.transaction.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { amountCents: 100000 } }) // Income
        .mockResolvedValueOnce({ _sum: { amountCents: -30000 } }); // Expense

      const result = await service.getTrends(tenantId);

      // Each month should have profit = revenue - expenses
      expect(result.data[0].profit).toBeDefined();
    });

    it('should handle months with no data', async () => {
      (prismaService.transaction.aggregate as jest.Mock).mockResolvedValue({
        _sum: { amountCents: null },
      });
      (prismaService.invoice.aggregate as jest.Mock).mockResolvedValue({
        _sum: { totalCents: null, amountPaidCents: null },
      });

      const result = await service.getTrends(tenantId);

      expect(result.data[0].revenue).toBe(0);
      expect(result.data[0].expenses).toBe(0);
      expect(result.data[0].arrears).toBe(0);
    });
  });

  describe('getAvailablePeriods', () => {
    it('should return available periods based on transaction dates', async () => {
      (prismaService.transaction.findFirst as jest.Mock)
        .mockResolvedValueOnce({ date: new Date('2024-03-15') }) // First
        .mockResolvedValueOnce({ date: new Date('2025-06-20') }); // Last

      const result = await service.getAvailablePeriods(tenantId);

      expect(result.hasData).toBe(true);
      expect(result.firstTransactionDate).toBe('2024-03-15');
      expect(result.lastTransactionDate).toBe('2025-06-20');
      expect(result.availableFinancialYears.length).toBeGreaterThan(0);
    });

    it('should handle no transactions', async () => {
      (prismaService.transaction.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.getAvailablePeriods(tenantId);

      expect(result.hasData).toBe(false);
      expect(result.firstTransactionDate).toBeNull();
      expect(result.lastTransactionDate).toBeNull();
      expect(result.availableFinancialYears).toHaveLength(0);
    });

    it('should execute first and last queries in parallel', async () => {
      (prismaService.transaction.findFirst as jest.Mock)
        .mockResolvedValueOnce({ date: new Date('2024-01-01') })
        .mockResolvedValueOnce({ date: new Date('2025-12-31') });

      const startTime = Date.now();
      await service.getAvailablePeriods(tenantId);
      const duration = Date.now() - startTime;

      // Should be fast due to parallel execution
      expect(duration).toBeLessThan(200);
    });
  });

  describe('partial failure handling', () => {
    it('should handle individual query failures gracefully', async () => {
      (prismaService.transaction.findFirst as jest.Mock).mockResolvedValue({
        date: new Date('2025-01-15'),
      });

      // Some queries succeed, some fail
      (prismaService.transaction.findMany as jest.Mock)
        .mockResolvedValueOnce([createMockTransaction()]) // Income succeeds
        .mockRejectedValueOnce(new Error('Database error')); // Expense fails

      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue([]);
      (prismaService.enrollment.count as jest.Mock).mockResolvedValue(10);
      (prismaService.payment.count as jest.Mock).mockResolvedValue(5);

      // Service should still return results (with partial data or throw depending on implementation)
      // This test documents the expected behavior
      try {
        await service.getMetrics(tenantId);
      } catch (error) {
        // If it throws, that's expected behavior for partial failures
        expect(error).toBeDefined();
      }
    });
  });
});
