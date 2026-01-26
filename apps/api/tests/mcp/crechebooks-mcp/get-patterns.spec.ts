/**
 * Get Patterns Tool Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests tenant isolation, payee filter, confidence filter, limit enforcement.
 * Uses mocked PrismaService - no real database calls.
 */

import { getPatterns } from '../../../src/mcp/crechebooks-mcp/tools/get-patterns';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type {
  GetPatternsInput,
  McpToolResult,
  PatternRecord,
} from '../../../src/mcp/crechebooks-mcp/types/index';

function createMockPrisma(findManyResult: unknown[] = []): {
  prisma: PrismaService;
  findManySpy: jest.Mock;
} {
  const findManySpy = jest.fn().mockResolvedValue(findManyResult);
  const prisma = {
    payeePattern: {
      findMany: findManySpy,
    },
  } as unknown as PrismaService;
  return { prisma, findManySpy };
}

function createMockPattern(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'pat-001',
    payeePattern: 'WOOLWORTHS',
    payeeAliases: ['WOOLWORTHS SA', 'WW FOODS'],
    defaultAccountCode: '7200',
    defaultAccountName: 'Cost of Goods',
    confidenceBoost: 15.5,
    matchCount: 42,
    isRecurring: true,
    expectedAmountCents: 250000,
    ...overrides,
  };
}

describe('get_patterns tool', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('should return tool definition with correct name and schema', () => {
    const { prisma } = createMockPrisma();
    const tool = getPatterns(prisma);

    expect(tool.name).toBe('get_patterns');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('tenantId');
    expect(tool.description).toBeDefined();
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it('should enforce tenant isolation in every query', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    expect(findManySpy).toHaveBeenCalledTimes(1);
    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.tenantId).toBe(TENANT_ID);
  });

  it('should return patterns on success', async () => {
    const mockPattern = createMockPattern();
    const { prisma } = createMockPrisma([mockPattern]);
    const tool = getPatterns(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].payeePattern).toBe('WOOLWORTHS');
    expect(result.data![0].defaultAccountCode).toBe('7200');
    expect(result.data![0].confidenceBoost).toBe(15.5);
    expect(result.data![0].matchCount).toBe(42);
    expect(result.metadata?.toolName).toBe('get_patterns');
    expect(result.metadata?.tenantId).toBe(TENANT_ID);
    expect(result.metadata?.resultCount).toBe(1);
  });

  it('should filter by payeeName using case-insensitive contains', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID, payeeName: 'woolworths' });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.payeePattern).toEqual({
      contains: 'woolworths',
      mode: 'insensitive',
    });
  });

  it('should filter by minConfidence using confidenceBoost gte', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID, minConfidence: 10 });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.confidenceBoost).toEqual({ gte: 10 });
  });

  it('should apply default limit of 50', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as { take: number };
    expect(callArgs.take).toBe(50);
  });

  it('should respect custom limit up to max 200', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID, limit: 100 });
    expect((findManySpy.mock.calls[0][0] as { take: number }).take).toBe(100);
  });

  it('should cap limit at 200', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID, limit: 999 });
    expect((findManySpy.mock.calls[0][0] as { take: number }).take).toBe(200);
  });

  it('should order by matchCount descending', async () => {
    const { prisma, findManySpy } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    await tool.handler({ tenantId: TENANT_ID });

    const callArgs = findManySpy.mock.calls[0][0] as {
      orderBy: Record<string, string>;
    };
    expect(callArgs.orderBy).toEqual({ matchCount: 'desc' });
  });

  it('should handle database errors gracefully', async () => {
    const findManySpy = jest
      .fn()
      .mockRejectedValue(new Error('Connection refused'));
    const prisma = {
      payeePattern: { findMany: findManySpy },
    } as unknown as PrismaService;
    const tool = getPatterns(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection refused');
    expect(result.metadata?.toolName).toBe('get_patterns');
    expect(result.metadata?.tenantId).toBe(TENANT_ID);
  });

  it('should convert Decimal confidenceBoost to number', async () => {
    const mockPattern = createMockPattern({
      confidenceBoost: { toNumber: () => 25.75, toString: () => '25.75' },
    });
    const { prisma } = createMockPrisma([mockPattern]);
    const tool = getPatterns(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(true);
    expect(typeof result.data![0].confidenceBoost).toBe('number');
  });

  it('should return empty array when no patterns match', async () => {
    const { prisma } = createMockPrisma([]);
    const tool = getPatterns(prisma);

    const result = await tool.handler({
      tenantId: TENANT_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
    expect(result.metadata?.resultCount).toBe(0);
  });
});
