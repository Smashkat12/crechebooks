/**
 * Search Similar Transactions Tool Tests
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Tests PII sanitization, similarity threshold, ruvector mock, tenant isolation.
 * Uses mocked PrismaService and RuvectorService.
 */

import {
  searchSimilarTransactions,
  sanitizeSearchInput,
} from '../../../src/mcp/crechebooks-mcp/tools/search-similar-transactions';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';
import type { RuvectorService } from '../../../src/agents/sdk/ruvector.service';
import type {
  McpToolResult,
  SimilarTransactionRecord,
} from '../../../src/mcp/crechebooks-mcp/types/index';

function createMockRuvector(
  overrides: Partial<Record<string, unknown>> = {},
): RuvectorService {
  return {
    isAvailable: jest.fn().mockReturnValue(true),
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    searchSimilar: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as RuvectorService;
}

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

describe('sanitizeSearchInput', () => {
  it('should strip email addresses', () => {
    expect(sanitizeSearchInput('Payment from user@example.com')).toBe(
      'Payment from [REDACTED_EMAIL]',
    );
  });

  it('should strip phone numbers', () => {
    expect(sanitizeSearchInput('Call 021-555-1234')).toBe(
      'Call [REDACTED_PHONE]',
    );
  });

  it('should strip SA ID numbers (13 digits)', () => {
    expect(sanitizeSearchInput('ID 9001015009087')).toBe('ID [REDACTED_ID]');
  });

  it('should strip bank account numbers (8-12 digits)', () => {
    expect(sanitizeSearchInput('Account 12345678')).toBe(
      'Account [REDACTED_ACCOUNT]',
    );
  });

  it('should handle multiple PII patterns', () => {
    const input =
      'Payment from user@test.com, phone +27-82-555-1234, ID 9001015009087';
    const result = sanitizeSearchInput(input);
    expect(result).not.toContain('user@test.com');
    expect(result).not.toContain('9001015009087');
  });

  it('should trim whitespace', () => {
    expect(sanitizeSearchInput('  hello  ')).toBe('hello');
  });

  it('should return text unchanged if no PII present', () => {
    expect(sanitizeSearchInput('WOOLWORTHS PURCHASE')).toBe(
      'WOOLWORTHS PURCHASE',
    );
  });
});

describe('search_similar_transactions tool', () => {
  const TENANT_ID = 'tenant-abc-123';

  it('should return tool definition with correct name', () => {
    const ruvector = createMockRuvector();
    const { prisma } = createMockPrisma();
    const tool = searchSimilarTransactions(prisma, ruvector);

    expect(tool.name).toBe('search_similar_transactions');
    expect(tool.inputSchema.required).toContain('tenantId');
    expect(tool.inputSchema.required).toContain('description');
  });

  it('should sanitize input before generating embeddings', async () => {
    const generateEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const ruvector = createMockRuvector({
      generateEmbedding,
      searchSimilar: jest.fn().mockResolvedValue([]),
    });
    const { prisma } = createMockPrisma();
    const tool = searchSimilarTransactions(prisma, ruvector);

    await tool.handler({
      tenantId: TENANT_ID,
      description: 'Payment from user@example.com',
    });

    expect(generateEmbedding).toHaveBeenCalledWith(
      'Payment from [REDACTED_EMAIL]',
    );
  });

  it('should return error when description is empty after sanitization', async () => {
    const ruvector = createMockRuvector();
    const { prisma } = createMockPrisma();
    const tool = searchSimilarTransactions(prisma, ruvector);

    // An input that is all PII will result in only redaction markers
    // We need a truly empty result - let's test with whitespace-only
    const result = await tool.handler({
      tenantId: TENANT_ID,
      description: '   ',
    });

    // The sanitized text will be empty after trim
    // Actually "   " trimmed is "", which has length 0
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty after PII sanitization');
  });

  it('should filter search results by minimum similarity', async () => {
    const searchSimilar = jest.fn().mockResolvedValue([
      { id: 'tx-001', score: 0.9, metadata: {} },
      { id: 'tx-002', score: 0.7, metadata: {} },
      { id: 'tx-003', score: 0.3, metadata: {} }, // Below threshold
    ]);
    const ruvector = createMockRuvector({ searchSimilar });

    const mockTransactions = [
      {
        id: 'tx-001',
        date: new Date('2025-01-10'),
        description: 'WOOLWORTHS',
        payeeName: 'Woolworths',
        amountCents: 15000,
        isCredit: false,
      },
      {
        id: 'tx-002',
        date: new Date('2025-01-15'),
        description: 'WOOLIES',
        payeeName: 'Woolworths',
        amountCents: 12000,
        isCredit: false,
      },
    ];
    const { prisma } = createMockPrisma(mockTransactions);
    const tool = searchSimilarTransactions(prisma, ruvector);

    const result = await tool.handler({
      tenantId: TENANT_ID,
      description: 'woolworths purchase',
      minSimilarity: 0.5,
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    // tx-003 was filtered out because score < 0.5
  });

  it('should enforce tenant isolation on transaction fetch', async () => {
    const searchSimilar = jest
      .fn()
      .mockResolvedValue([{ id: 'tx-001', score: 0.9, metadata: {} }]);
    const ruvector = createMockRuvector({ searchSimilar });
    const { prisma, findManySpy } = createMockPrisma([
      {
        id: 'tx-001',
        date: new Date('2025-01-10'),
        description: 'TEST',
        payeeName: null,
        amountCents: 1000,
        isCredit: false,
      },
    ]);
    const tool = searchSimilarTransactions(prisma, ruvector);

    await tool.handler({
      tenantId: TENANT_ID,
      description: 'test transaction',
    });

    const callArgs = findManySpy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.tenantId).toBe(TENANT_ID);
    expect(callArgs.where.isDeleted).toBe(false);
  });

  it('should sort results by similarity score descending', async () => {
    const searchSimilar = jest.fn().mockResolvedValue([
      { id: 'tx-001', score: 0.7, metadata: {} },
      { id: 'tx-002', score: 0.9, metadata: {} },
    ]);
    const ruvector = createMockRuvector({ searchSimilar });

    const mockTransactions = [
      {
        id: 'tx-001',
        date: new Date('2025-01-10'),
        description: 'A',
        payeeName: null,
        amountCents: 1000,
        isCredit: false,
      },
      {
        id: 'tx-002',
        date: new Date('2025-01-15'),
        description: 'B',
        payeeName: null,
        amountCents: 2000,
        isCredit: true,
      },
    ];
    const { prisma } = createMockPrisma(mockTransactions);
    const tool = searchSimilarTransactions(prisma, ruvector);

    const result = await tool.handler({
      tenantId: TENANT_ID,
      description: 'test',
    });

    expect(result.data![0].similarityScore).toBe(0.9);
    expect(result.data![1].similarityScore).toBe(0.7);
  });

  it('should return empty array when no similar vectors found', async () => {
    const searchSimilar = jest.fn().mockResolvedValue([]);
    const ruvector = createMockRuvector({ searchSimilar });
    const { prisma } = createMockPrisma();
    const tool = searchSimilarTransactions(prisma, ruvector);

    const result = await tool.handler({
      tenantId: TENANT_ID,
      description: 'random search',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle ruvector errors gracefully', async () => {
    const ruvector = createMockRuvector({
      generateEmbedding: jest
        .fn()
        .mockRejectedValue(new Error('Embedding service down')),
    });
    const { prisma } = createMockPrisma();
    const tool = searchSimilarTransactions(prisma, ruvector);

    const result = await tool.handler({
      tenantId: TENANT_ID,
      description: 'test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Embedding service down');
  });

  it('should apply default similarity threshold of 0.5', async () => {
    const searchSimilar = jest.fn().mockResolvedValue([
      { id: 'tx-001', score: 0.4, metadata: {} }, // Below default 0.5
      { id: 'tx-002', score: 0.6, metadata: {} },
    ]);
    const ruvector = createMockRuvector({ searchSimilar });
    const { prisma } = createMockPrisma([
      {
        id: 'tx-002',
        date: new Date('2025-01-10'),
        description: 'B',
        payeeName: null,
        amountCents: 2000,
        isCredit: false,
      },
    ]);
    const tool = searchSimilarTransactions(prisma, ruvector);

    const result = await tool.handler({
      tenantId: TENANT_ID,
      description: 'test',
    });

    // Only tx-002 should be included (score 0.6 >= 0.5)
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe('tx-002');
  });
});
