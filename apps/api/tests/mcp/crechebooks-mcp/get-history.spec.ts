/**
 * Get History Tool Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests tenant filtering via transaction relation, date filter, source filter.
 * Uses mocked PrismaService.
 */

import { getHistory } from '../../../src/mcp/crechebooks-mcp/tools/get-history';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type {
  GetHistoryInput,
  HistoryRecord,
  McpToolResult,
} from '../../../src/mcp/crechebooks-mcp/types/index';

function createMockPrisma(findManyResult: unknown[] = []): {
  prisma: PrismaService;
  findManySpy: jest.Mock;
} {
  const findManySpy = jest.fn().mockResolvedValue(findManyResult);
  const prisma = {
    categorization: {
      findMany: findManySpy,
    },
  } as unknown as PrismaService;
  return { prisma, findManySpy };
}

function createMockCategorization(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'cat-001',
    accountCode: '7200',
    accountName: 'Cost of Goods',
    confidenceScore: 92.5,
    source: 'AI_AUTO',
    vatType: 'STANDARD',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    transaction: {
      description: 'WOOLWORTHS PURCHASE',
      payeeName: 'Woolworths',
      amountCents: 15000,
      isCredit: false,
    },
    ...overrides,
  };
}

describe('get_history tool', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('should return tool definition with correct name and schema', () => {
    const { prisma } = createMockPrisma();
    const tool = getHistory(prisma);

    expect(tool.name).toBe('get_history');
    expect(tool.inputSchema.required).toContain('tenantId');
    expect(tool.description).toBeDefined();
  });

  it('should enforce tenant isolation via transaction relation', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: { transaction: { tenantId: string } };
    };
    expect(callArgs.where.transaction.tenantId).toBe(TENANT_ID);
  });

  it('should return categorization history on success', async () => {
    const mockCat = createMockCategorization();
    const { prisma } = createMockPrisma([mockCat]);
    const tool = getHistory(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].accountCode).toBe('7200');
    expect(result.data![0].accountName).toBe('Cost of Goods');
    expect(result.data![0].confidenceScore).toBe(92.5);
    expect(result.data![0].source).toBe('AI_AUTO');
    expect(result.data![0].vatType).toBe('STANDARD');
    expect(result.data![0].transactionDescription).toBe('WOOLWORTHS PURCHASE');
    expect(result.data![0].transactionPayeeName).toBe('Woolworths');
    expect(result.data![0].transactionAmountCents).toBe(15000);
    expect(result.data![0].transactionIsCredit).toBe(false);
  });

  it('should filter by accountCode', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID, accountCode: '7200' });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.accountCode).toBe('7200');
  });

  it('should filter by payeeName via transaction relation', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID, payeeName: 'woolworths' });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: { transaction: Record<string, unknown> };
    };
    expect(callArgs.where.transaction.payeeName).toEqual({
      contains: 'woolworths',
      mode: 'insensitive',
    });
  });

  it('should filter by date range via transaction relation', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({
      tenantId: TENANT_ID,
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
    });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: { transaction: Record<string, unknown> };
    };
    expect(callArgs.where.transaction.date).toEqual({
      gte: new Date('2025-01-01'),
      lte: new Date('2025-01-31'),
    });
  });

  it('should filter by categorization source', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID, source: 'USER_OVERRIDE' });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.source).toBe('USER_OVERRIDE');
  });

  it('should include transaction select in query', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      include: { transaction: { select: Record<string, boolean> } };
    };
    expect(callArgs.include.transaction.select).toEqual({
      description: true,
      payeeName: true,
      amountCents: true,
      isCredit: true,
    });
  });

  it('should order by createdAt descending', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      orderBy: Record<string, string>;
    };
    expect(callArgs.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('should apply default limit of 50', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getHistory(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(50);
  });

  it('should handle database errors gracefully', async () => {
    const findManySpy = jest.fn().mockRejectedValue(new Error('DB error'));
    const prisma = {
      categorization: { findMany: findManySpy },
    } as unknown as PrismaService;
    const tool = getHistory(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('DB error');
  });

  it('should return createdAt as ISO string', async () => {
    const mockCat = createMockCategorization();
    const { prisma } = createMockPrisma([mockCat]);
    const tool = getHistory(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.data![0].createdAt).toBe('2025-01-15T10:00:00.000Z');
  });
});
