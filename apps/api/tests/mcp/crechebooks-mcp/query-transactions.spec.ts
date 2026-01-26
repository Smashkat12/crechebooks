/**
 * Query Transactions Tool Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests tenant filter, date range, status, credit/debit, amount range, latest categorization.
 * Uses mocked PrismaService.
 */

import { queryTransactions } from '../../../src/mcp/crechebooks-mcp/tools/query-transactions';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type {
  McpToolResult,
  TransactionRecord,
} from '../../../src/mcp/crechebooks-mcp/types/index';

function createMockPrisma(findManyResult: unknown[] = []): {
  prisma: PrismaService;
  findManySpy: jest.Mock;
} {
  const findManySpy = jest.fn().mockResolvedValue(findManyResult);
  const prisma = {
    transaction: {
      findMany: findManySpy,
    },
  } as unknown as PrismaService;
  return { prisma, findManySpy };
}

function createMockTransaction(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'tx-001',
    date: new Date('2025-01-15'),
    description: 'WOOLWORTHS PURCHASE',
    payeeName: 'Woolworths',
    amountCents: 15000,
    isCredit: false,
    status: 'CATEGORIZED',
    source: 'BANK_FEED',
    isReconciled: false,
    xeroAccountCode: '7200',
    categorizations: [
      {
        accountCode: '7200',
        accountName: 'Cost of Goods',
        confidenceScore: 95.0,
        vatType: 'STANDARD',
        source: 'AI_AUTO',
      },
    ],
    ...overrides,
  };
}

describe('query_transactions tool', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('should return tool definition with correct name and schema', () => {
    const { prisma } = createMockPrisma();
    const tool = queryTransactions(prisma);

    expect(tool.name).toBe('query_transactions');
    expect(tool.inputSchema.required).toContain('tenantId');
  });

  it('should enforce tenant isolation and exclude deleted', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.tenantId).toBe(TENANT_ID);
    expect(callArgs.where.isDeleted).toBe(false);
  });

  it('should return transactions with latest categorization', async () => {
    const mockTx = createMockTransaction();
    const { prisma } = createMockPrisma([mockTx]);
    const tool = queryTransactions(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    const tx = result.data![0];
    expect(tx.description).toBe('WOOLWORTHS PURCHASE');
    expect(tx.amountCents).toBe(15000);
    expect(tx.isCredit).toBe(false);
    expect(tx.latestCategorization).toBeDefined();
    expect(tx.latestCategorization!.accountCode).toBe('7200');
    expect(tx.latestCategorization!.confidenceScore).toBe(95.0);
  });

  it('should handle transactions without categorizations', async () => {
    const mockTx = createMockTransaction({ categorizations: [] });
    const { prisma } = createMockPrisma([mockTx]);
    const tool = queryTransactions(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.data![0].latestCategorization).toBeNull();
  });

  it('should filter by status', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({ tenantId: TENANT_ID, status: 'PENDING' });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.status).toBe('PENDING');
  });

  it('should filter by isCredit', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({ tenantId: TENANT_ID, isCredit: true });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.isCredit).toBe(true);
  });

  it('should filter by payeeName case-insensitive', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({ tenantId: TENANT_ID, payeeName: 'woolworths' });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.payeeName).toEqual({
      contains: 'woolworths',
      mode: 'insensitive',
    });
  });

  it('should filter by date range', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({
      tenantId: TENANT_ID,
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
    });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.date).toEqual({
      gte: new Date('2025-01-01'),
      lte: new Date('2025-01-31'),
    });
  });

  it('should filter by amount range', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({
      tenantId: TENANT_ID,
      minAmountCents: 1000,
      maxAmountCents: 50000,
    });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.amountCents).toEqual({
      gte: 1000,
      lte: 50000,
    });
  });

  it('should include categorizations ordered by createdAt desc, take 1', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      include: {
        categorizations: { orderBy: Record<string, string>; take: number };
      };
    };
    expect(callArgs.include.categorizations.orderBy).toEqual({
      createdAt: 'desc',
    });
    expect(callArgs.include.categorizations.take).toBe(1);
  });

  it('should order by date descending', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = queryTransactions(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      orderBy: Record<string, string>;
    };
    expect(callArgs.orderBy).toEqual({ date: 'desc' });
  });

  it('should handle database errors gracefully', async () => {
    const findManySpy = jest
      .fn()
      .mockRejectedValue(new Error('Pool exhausted'));
    const prisma = {
      transaction: { findMany: findManySpy },
    } as unknown as PrismaService;
    const tool = queryTransactions(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Pool exhausted');
  });

  it('should convert date to ISO string', async () => {
    const mockTx = createMockTransaction();
    const { prisma } = createMockPrisma([mockTx]);
    const tool = queryTransactions(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.data![0].date).toBe(new Date('2025-01-15').toISOString());
  });
});
