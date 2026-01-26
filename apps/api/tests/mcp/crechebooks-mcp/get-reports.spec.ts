/**
 * Get Reports Tool Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests income/expense calculation, VAT grouping, monthly totals, account breakdown.
 * Uses mocked PrismaService.
 */

import { getReports } from '../../../src/mcp/crechebooks-mcp/tools/get-reports';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type {
  AccountBreakdownReport,
  IncomeExpenseReport,
  McpToolResult,
  MonthlyTotalsReport,
  ReportOutput,
  VatSummaryReport,
} from '../../../src/mcp/crechebooks-mcp/types/index';

function createMockPrisma(overrides: Partial<Record<string, { findMany: jest.Mock }>> = {}): {
  prisma: PrismaService;
  transactionFindMany: jest.Mock;
  categorizationFindMany: jest.Mock;
} {
  const transactionFindMany = overrides.transaction?.findMany ?? jest.fn().mockResolvedValue([]);
  const categorizationFindMany = overrides.categorization?.findMany ?? jest.fn().mockResolvedValue([]);
  const prisma = {
    transaction: { findMany: transactionFindMany },
    categorization: { findMany: categorizationFindMany },
  } as unknown as PrismaService;
  return { prisma, transactionFindMany, categorizationFindMany };
}

describe('get_reports tool', () => {
  const TENANT_ID = 'tenant-abc-123';
  const FROM_DATE = '2025-01-01';
  const TO_DATE = '2025-03-31';

  it('should return tool definition with correct name', () => {
    const { prisma } = createMockPrisma();
    const tool = getReports(prisma);

    expect(tool.name).toBe('get_reports');
    expect(tool.inputSchema.required).toContain('tenantId');
    expect(tool.inputSchema.required).toContain('reportType');
    expect(tool.inputSchema.required).toContain('fromDate');
    expect(tool.inputSchema.required).toContain('toDate');
  });

  describe('INCOME_EXPENSE report', () => {
    it('should calculate income and expense totals', async () => {
      const transactions = [
        { amountCents: 100000, isCredit: true },
        { amountCents: 50000, isCredit: true },
        { amountCents: 30000, isCredit: false },
        { amountCents: 20000, isCredit: false },
      ];

      const { prisma } = createMockPrisma({
        transaction: { findMany: jest.fn().mockResolvedValue(transactions) },
      });
      const tool = getReports(prisma);

      const result = await tool.handler({
        tenantId: TENANT_ID,
        reportType: 'INCOME_EXPENSE',
        fromDate: FROM_DATE,
        toDate: TO_DATE,
      }) as McpToolResult<ReportOutput>;

      expect(result.success).toBe(true);
      const report = result.data as IncomeExpenseReport;
      expect(report.reportType).toBe('INCOME_EXPENSE');
      expect(report.totalIncomeCents).toBe(150000);
      expect(report.totalExpenseCents).toBe(50000);
      expect(report.netCents).toBe(100000);
      expect(report.transactionCount).toBe(4);
    });

    it('should enforce tenant isolation and date filter', async () => {
      const { prisma, transactionFindMany } = createMockPrisma();
      const tool = getReports(prisma);

      await tool.handler({
        tenantId: TENANT_ID,
        reportType: 'INCOME_EXPENSE',
        fromDate: FROM_DATE,
        toDate: TO_DATE,
      });

      const callArgs = transactionFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(callArgs.where.tenantId).toBe(TENANT_ID);
      expect(callArgs.where.isDeleted).toBe(false);
      expect(callArgs.where.date).toEqual({
        gte: new Date(FROM_DATE),
        lte: new Date(TO_DATE),
      });
    });
  });

  describe('VAT_SUMMARY report', () => {
    it('should group by VAT type', async () => {
      const categorizations = [
        { vatType: 'STANDARD', vatAmountCents: 1500, transaction: { amountCents: 10000 } },
        { vatType: 'STANDARD', vatAmountCents: 3000, transaction: { amountCents: 20000 } },
        { vatType: 'ZERO_RATED', vatAmountCents: 0, transaction: { amountCents: 5000 } },
        { vatType: 'EXEMPT', vatAmountCents: null, transaction: { amountCents: 8000 } },
      ];

      const { prisma } = createMockPrisma({
        categorization: { findMany: jest.fn().mockResolvedValue(categorizations) },
      });
      const tool = getReports(prisma);

      const result = await tool.handler({
        tenantId: TENANT_ID,
        reportType: 'VAT_SUMMARY',
        fromDate: FROM_DATE,
        toDate: TO_DATE,
      }) as McpToolResult<ReportOutput>;

      expect(result.success).toBe(true);
      const report = result.data as VatSummaryReport;
      expect(report.reportType).toBe('VAT_SUMMARY');
      expect(report.groups).toHaveLength(3);

      const standardGroup = report.groups.find((g) => g.vatType === 'STANDARD');
      expect(standardGroup).toBeDefined();
      expect(standardGroup!.transactionCount).toBe(2);
      expect(standardGroup!.totalAmountCents).toBe(30000);
      expect(standardGroup!.totalVatCents).toBe(4500);

      const zeroGroup = report.groups.find((g) => g.vatType === 'ZERO_RATED');
      expect(zeroGroup!.totalVatCents).toBe(0);

      expect(report.totalVatCents).toBe(4500);
    });

    it('should filter via transaction relation for tenant isolation', async () => {
      const { prisma, categorizationFindMany } = createMockPrisma();
      const tool = getReports(prisma);

      await tool.handler({
        tenantId: TENANT_ID,
        reportType: 'VAT_SUMMARY',
        fromDate: FROM_DATE,
        toDate: TO_DATE,
      });

      const callArgs = categorizationFindMany.mock.calls[0][0] as { where: { transaction: Record<string, unknown> } };
      expect(callArgs.where.transaction.tenantId).toBe(TENANT_ID);
      expect(callArgs.where.transaction.isDeleted).toBe(false);
    });
  });

  describe('MONTHLY_TOTALS report', () => {
    it('should group transactions by month', async () => {
      const transactions = [
        { date: new Date('2025-01-10'), amountCents: 10000, isCredit: true },
        { date: new Date('2025-01-20'), amountCents: 5000, isCredit: false },
        { date: new Date('2025-02-05'), amountCents: 20000, isCredit: true },
        { date: new Date('2025-03-15'), amountCents: 8000, isCredit: false },
      ];

      const { prisma } = createMockPrisma({
        transaction: { findMany: jest.fn().mockResolvedValue(transactions) },
      });
      const tool = getReports(prisma);

      const result = await tool.handler({
        tenantId: TENANT_ID,
        reportType: 'MONTHLY_TOTALS',
        fromDate: FROM_DATE,
        toDate: TO_DATE,
      }) as McpToolResult<ReportOutput>;

      expect(result.success).toBe(true);
      const report = result.data as MonthlyTotalsReport;
      expect(report.reportType).toBe('MONTHLY_TOTALS');
      expect(report.months).toHaveLength(3);

      // Sorted by month
      expect(report.months[0].month).toBe('2025-01');
      expect(report.months[0].incomeCents).toBe(10000);
      expect(report.months[0].expenseCents).toBe(5000);
      expect(report.months[0].netCents).toBe(5000);
      expect(report.months[0].transactionCount).toBe(2);

      expect(report.months[1].month).toBe('2025-02');
      expect(report.months[1].incomeCents).toBe(20000);

      expect(report.months[2].month).toBe('2025-03');
      expect(report.months[2].expenseCents).toBe(8000);
    });
  });

  describe('ACCOUNT_BREAKDOWN report', () => {
    it('should group by account code', async () => {
      const categorizations = [
        {
          accountCode: '7200',
          accountName: 'Cost of Goods',
          transaction: { amountCents: 15000, isCredit: false },
        },
        {
          accountCode: '7200',
          accountName: 'Cost of Goods',
          transaction: { amountCents: 10000, isCredit: false },
        },
        {
          accountCode: '4100',
          accountName: 'Sales Revenue',
          transaction: { amountCents: 50000, isCredit: true },
        },
      ];

      const { prisma } = createMockPrisma({
        categorization: { findMany: jest.fn().mockResolvedValue(categorizations) },
      });
      const tool = getReports(prisma);

      const result = await tool.handler({
        tenantId: TENANT_ID,
        reportType: 'ACCOUNT_BREAKDOWN',
        fromDate: FROM_DATE,
        toDate: TO_DATE,
      }) as McpToolResult<ReportOutput>;

      expect(result.success).toBe(true);
      const report = result.data as AccountBreakdownReport;
      expect(report.reportType).toBe('ACCOUNT_BREAKDOWN');
      expect(report.accounts).toHaveLength(2);

      const costAccount = report.accounts.find((a) => a.accountCode === '7200');
      expect(costAccount!.accountName).toBe('Cost of Goods');
      expect(costAccount!.totalDebitCents).toBe(25000);
      expect(costAccount!.totalCreditCents).toBe(0);
      expect(costAccount!.transactionCount).toBe(2);

      const salesAccount = report.accounts.find((a) => a.accountCode === '4100');
      expect(salesAccount!.totalCreditCents).toBe(50000);
      expect(salesAccount!.totalDebitCents).toBe(0);
      expect(salesAccount!.netCents).toBe(50000);
    });
  });

  it('should handle errors gracefully', async () => {
    const { prisma } = createMockPrisma({
      transaction: { findMany: jest.fn().mockRejectedValue(new Error('Timeout')) },
    });
    const tool = getReports(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
      reportType: 'INCOME_EXPENSE',
      fromDate: FROM_DATE,
      toDate: TO_DATE,
    }) as McpToolResult<ReportOutput>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
  });
});
