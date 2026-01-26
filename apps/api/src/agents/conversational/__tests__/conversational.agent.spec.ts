/**
 * Conversational Agent Unit Tests
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/__tests__/conversational.agent.spec
 * @description Comprehensive tests for ConversationalAgent:
 * - Valid query returns answer with metadata
 * - Query classification (REVENUE, EXPENSE, INVOICE, PAYMENT, TAX, ENROLLMENT, SUMMARY, GENERAL)
 * - Tax questions redirect to SARS agent message
 * - Tenant isolation in Prisma queries
 * - formatCents formatting (R X,XXX.XX)
 * - SDK fallback behavior
 * - Empty data handling
 * - conversationId passthrough
 * - Read-only enforcement (no create/update/delete calls)
 */

import { BadRequestException } from '@nestjs/common';
import { ConversationalAgent } from '../conversational.agent';
import { QueryValidator } from '../query-validator';
import {
  formatCents,
  classifyQueryComplexity,
  routeModel,
} from '../conversational-prompt';
import type { SdkAgentFactory } from '../../sdk/sdk-agent.factory';
import type { SdkConfigService } from '../../sdk/sdk-config';
import type { RuvectorService } from '../../sdk/ruvector.service';
import type { PrismaService } from '../../../database/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────

function createMockFactory(): jest.Mocked<SdkAgentFactory> {
  return {
    createConversationalAgent: jest.fn().mockReturnValue({
      description: 'test conversational agent',
      prompt: 'test prompt',
      tools: ['account_summary'],
      model: 'sonnet',
    }),
    createCategorizerAgent: jest.fn(),
    createMatcherAgent: jest.fn(),
    createSarsAgent: jest.fn(),
    createExtractionValidatorAgent: jest.fn(),
    createOrchestratorAgent: jest.fn(),
    createAgent: jest.fn(),
  } as unknown as jest.Mocked<SdkAgentFactory>;
}

function createMockConfig(
  overrides: Partial<{
    isEnabled: boolean;
  }> = {},
): jest.Mocked<SdkConfigService> {
  return {
    isEnabled: jest.fn().mockReturnValue(overrides.isEnabled ?? false),
    getModelForAgent: jest.fn().mockReturnValue('sonnet'),
    getApiKey: jest.fn().mockReturnValue(undefined),
    hasApiKey: jest.fn().mockReturnValue(false),
    getProviderForAgent: jest.fn().mockReturnValue('anthropic'),
    getApiKeyForProvider: jest.fn().mockReturnValue(undefined),
    getMaxTokens: jest.fn().mockReturnValue(1024),
    getTemperature: jest.fn().mockReturnValue(0.3),
    getBaseUrl: jest.fn(),
  } as unknown as jest.Mocked<SdkConfigService>;
}

function createMockPrisma(): Record<string, Record<string, jest.Mock>> {
  return {
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountCents: 0 },
        _count: 0,
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    child: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

const TENANT_ID = 'tenant-test-001';

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('ConversationalAgent', () => {
  let agent: ConversationalAgent;
  let mockFactory: jest.Mocked<SdkAgentFactory>;
  let mockConfig: jest.Mocked<SdkConfigService>;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let queryValidator: QueryValidator;

  beforeEach(() => {
    mockFactory = createMockFactory();
    mockConfig = createMockConfig();
    mockPrisma = createMockPrisma();
    queryValidator = new QueryValidator();

    agent = new ConversationalAgent(
      mockFactory,
      mockConfig,
      undefined as unknown as RuvectorService,
      mockPrisma as unknown as PrismaService,
      queryValidator,
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // getAgentDefinition
  // ─────────────────────────────────────────────────────────────────────

  describe('getAgentDefinition', () => {
    it('should return the conversational agent definition', () => {
      const definition = agent.getAgentDefinition(TENANT_ID);
      expect(definition).toBeDefined();
      expect(definition.description).toContain('conversational');
      expect(definition.model).toBe('sonnet');
      expect(mockFactory.createConversationalAgent).toHaveBeenCalledWith(
        TENANT_ID,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Valid query returns answer with metadata
  // ─────────────────────────────────────────────────────────────────────

  describe('ask - valid query', () => {
    it('should return a ConversationalResponse with answer and metadata', async () => {
      const response = await agent.ask('What is my total revenue?', TENANT_ID);

      expect(response).toBeDefined();
      expect(response.answer).toBeDefined();
      expect(typeof response.answer).toBe('string');
      expect(response.conversationId).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata.queryType).toBe('REVENUE');
      expect(response.metadata.source).toBe('FALLBACK');
      expect(response.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(response.metadata.dataSourcesQueried).toContain('transactions');
    });

    it('should return metadata with correct query type for expenses', async () => {
      const response = await agent.ask('How much have I spent?', TENANT_ID);
      expect(response.metadata.queryType).toBe('EXPENSE');
      expect(response.metadata.dataSourcesQueried).toContain('transactions');
    });

    it('should return metadata with correct query type for invoices', async () => {
      const response = await agent.ask(
        'How many invoices are outstanding?',
        TENANT_ID,
      );
      expect(response.metadata.queryType).toBe('INVOICE');
      expect(response.metadata.dataSourcesQueried).toContain('invoices');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Query classification
  // ─────────────────────────────────────────────────────────────────────

  describe('query classification', () => {
    const classificationCases: Array<{ question: string; expected: string }> = [
      { question: 'What is my revenue?', expected: 'REVENUE' },
      { question: 'Show me income this month', expected: 'REVENUE' },
      { question: 'How much are tuition fees?', expected: 'REVENUE' },
      { question: 'What are my expenses?', expected: 'EXPENSE' },
      { question: 'How much did I spend on food?', expected: 'EXPENSE' },
      { question: 'Show my costs', expected: 'EXPENSE' },
      { question: 'How many invoices are outstanding?', expected: 'INVOICE' },
      { question: 'Show me overdue bills', expected: 'INVOICE' },
      { question: 'What payments have been received?', expected: 'PAYMENT' },
      { question: 'Show credit transactions', expected: 'PAYMENT' },
      { question: 'What about VAT?', expected: 'TAX' },
      { question: 'Tell me about SARS compliance', expected: 'TAX' },
      { question: 'How does PAYE work?', expected: 'TAX' },
      { question: 'What is my UIF obligation?', expected: 'TAX' },
      { question: 'How many children are enrolled?', expected: 'ENROLLMENT' },
      { question: 'How many students do we have?', expected: 'ENROLLMENT' },
      { question: 'Give me a financial summary', expected: 'SUMMARY' },
      { question: 'Show me an overview', expected: 'SUMMARY' },
      { question: 'How are we doing?', expected: 'SUMMARY' },
      { question: 'What is the status of the dashboard?', expected: 'SUMMARY' },
      { question: 'Hello', expected: 'GENERAL' },
      { question: 'Can you help me?', expected: 'GENERAL' },
    ];

    it.each(classificationCases)(
      'should classify "$question" as $expected',
      async ({ question, expected }) => {
        const response = await agent.ask(question, TENANT_ID);
        expect(response.metadata.queryType).toBe(expected);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // Tax questions redirect to SARS agent
  // ─────────────────────────────────────────────────────────────────────

  describe('tax question redirect', () => {
    it('should redirect tax questions to SARS agent', async () => {
      const response = await agent.ask(
        'Tell me about my tax obligations',
        TENANT_ID,
      );
      expect(response.metadata.queryType).toBe('TAX');
      expect(response.answer).toContain('SARS agent');
      expect(response.answer).toContain('tax advice');
      expect(response.answer).toContain('accountant');
    });

    it('should redirect VAT questions to SARS agent', async () => {
      const response = await agent.ask('What is my VAT liability?', TENANT_ID);
      expect(response.answer).toContain('SARS agent');
    });

    it('should not query any data sources for tax questions', async () => {
      const response = await agent.ask('How does PAYE work?', TENANT_ID);
      expect(response.metadata.dataSourcesQueried).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Tenant isolation in Prisma queries
  // ─────────────────────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('should pass tenantId to transaction aggregate for revenue queries', async () => {
      await agent.ask('What is my revenue?', TENANT_ID);

      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should pass tenantId to transaction aggregate for expense queries', async () => {
      await agent.ask('What are my expenses?', TENANT_ID);

      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should pass tenantId to invoice findMany', async () => {
      await agent.ask('How many invoices are outstanding?', TENANT_ID);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should pass tenantId to child count', async () => {
      await agent.ask('How many children are enrolled?', TENANT_ID);

      expect(mockPrisma.child.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            isDeleted: false,
          }),
        }),
      );
    });

    it('should pass tenantId to all queries in summary', async () => {
      await agent.ask('Give me a financial summary', TENANT_ID);

      // Revenue aggregate
      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );

      // Child count
      expect(mockPrisma.child.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );

      // Invoice findMany
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // formatCents formatting
  // ─────────────────────────────────────────────────────────────────────

  describe('formatCents', () => {
    it('should format 0 cents as R0.00', () => {
      expect(formatCents(0)).toBe('R0.00');
    });

    it('should format 100 cents as R1.00', () => {
      expect(formatCents(100)).toBe('R1.00');
    });

    it('should format 12345 cents as R123.45', () => {
      expect(formatCents(12345)).toBe('R123.45');
    });

    it('should format 123456 cents as R1,234.56', () => {
      expect(formatCents(123456)).toBe('R1,234.56');
    });

    it('should format 1234567 cents as R12,345.67', () => {
      expect(formatCents(1234567)).toBe('R12,345.67');
    });

    it('should format 100000000 cents as R1,000,000.00', () => {
      expect(formatCents(100000000)).toBe('R1,000,000.00');
    });

    it('should format 50 cents as R0.50', () => {
      expect(formatCents(50)).toBe('R0.50');
    });

    it('should format 1 cent as R0.01', () => {
      expect(formatCents(1)).toBe('R0.01');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // classifyQueryComplexity and routeModel
  // ─────────────────────────────────────────────────────────────────────

  describe('classifyQueryComplexity', () => {
    it('should classify summary as complex', () => {
      expect(classifyQueryComplexity('show me a summary', 'SUMMARY')).toBe(
        'complex',
      );
    });

    it('should classify tax as complex', () => {
      expect(classifyQueryComplexity('what about tax', 'TAX')).toBe('complex');
    });

    it('should classify compare question as complex', () => {
      expect(classifyQueryComplexity('compare revenue months', 'REVENUE')).toBe(
        'complex',
      );
    });

    it('should classify trend question as complex', () => {
      expect(classifyQueryComplexity('show me the trend', 'REVENUE')).toBe(
        'complex',
      );
    });

    it('should classify simple revenue as simple', () => {
      expect(classifyQueryComplexity('what is my revenue', 'REVENUE')).toBe(
        'simple',
      );
    });

    it('should classify simple expense as simple', () => {
      expect(classifyQueryComplexity('show expenses', 'EXPENSE')).toBe(
        'simple',
      );
    });
  });

  describe('routeModel', () => {
    it('should route simple queries to haiku', () => {
      expect(routeModel('simple')).toBe('haiku');
    });

    it('should route complex queries to sonnet', () => {
      expect(routeModel('complex')).toBe('sonnet');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // SDK fallback behavior
  // ─────────────────────────────────────────────────────────────────────

  describe('SDK fallback', () => {
    it('should use fallback when SDK is not available', async () => {
      const response = await agent.ask('What is my revenue?', TENANT_ID);
      expect(response.metadata.source).toBe('FALLBACK');
      expect(response.metadata.model).toBeUndefined();
    });

    it('should still return a valid response via fallback', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountCents: 500000 },
        _count: 10,
      });

      const response = await agent.ask('What is my revenue?', TENANT_ID);
      expect(response.answer).toContain('R5,000.00');
      expect(response.answer).toContain('10');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Empty data handling
  // ─────────────────────────────────────────────────────────────────────

  describe('empty data handling', () => {
    it('should handle zero revenue gracefully', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountCents: null },
        _count: 0,
      });

      const response = await agent.ask('What is my revenue?', TENANT_ID);
      expect(response.answer).toContain('No revenue');
    });

    it('should handle zero expenses gracefully', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountCents: null },
        _count: 0,
      });

      const response = await agent.ask('What are my expenses?', TENANT_ID);
      expect(response.answer).toContain('No expense');
    });

    it('should handle zero invoices gracefully', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const response = await agent.ask('How many invoices?', TENANT_ID);
      expect(response.answer).toContain('No invoices');
    });

    it('should handle zero children gracefully', async () => {
      mockPrisma.child.count.mockResolvedValue(0);

      const response = await agent.ask(
        'How many children are enrolled?',
        TENANT_ID,
      );
      expect(response.answer).toContain('No children');
    });

    it('should handle zero payments gracefully', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountCents: null },
        _count: 0,
      });

      const response = await agent.ask(
        'What payments have I received?',
        TENANT_ID,
      );
      expect(response.answer).toContain('No payments');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // conversationId passthrough
  // ─────────────────────────────────────────────────────────────────────

  describe('conversationId passthrough', () => {
    it('should use provided conversationId', async () => {
      const convId = 'conv-123-abc';
      const response = await agent.ask(
        'What is my revenue?',
        TENANT_ID,
        convId,
      );
      expect(response.conversationId).toBe(convId);
    });

    it('should generate a conversationId when none provided', async () => {
      const response = await agent.ask('What is my revenue?', TENANT_ID);
      expect(response.conversationId).toBeDefined();
      expect(response.conversationId.length).toBeGreaterThan(0);
    });

    it('should generate different conversationIds for different calls', async () => {
      const response1 = await agent.ask('What is my revenue?', TENANT_ID);
      const response2 = await agent.ask('What are my expenses?', TENANT_ID);
      expect(response1.conversationId).not.toBe(response2.conversationId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Read-only enforcement
  // ─────────────────────────────────────────────────────────────────────

  describe('read-only enforcement', () => {
    it('should only call read operations on Prisma (findMany, aggregate, count)', async () => {
      // Add mutation methods to verify they are NOT called
      mockPrisma.transaction.create = jest.fn();
      mockPrisma.transaction.update = jest.fn();
      mockPrisma.transaction.delete = jest.fn();
      mockPrisma.invoice.create = jest.fn();
      mockPrisma.invoice.update = jest.fn();
      mockPrisma.invoice.delete = jest.fn();
      mockPrisma.child.create = jest.fn();
      mockPrisma.child.update = jest.fn();
      mockPrisma.child.delete = jest.fn();

      await agent.ask('Give me a summary', TENANT_ID);

      // Verify read operations were called
      expect(mockPrisma.transaction.aggregate).toHaveBeenCalled();
      expect(mockPrisma.invoice.findMany).toHaveBeenCalled();
      expect(mockPrisma.child.count).toHaveBeenCalled();

      // Verify NO create/update/delete operations were called
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.delete).not.toHaveBeenCalled();
      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
      expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
      expect(mockPrisma.invoice.delete).not.toHaveBeenCalled();
      expect(mockPrisma.child.create).not.toHaveBeenCalled();
      expect(mockPrisma.child.update).not.toHaveBeenCalled();
      expect(mockPrisma.child.delete).not.toHaveBeenCalled();
    });

    it('should reject queries with mutation keywords via validator', async () => {
      await expect(
        agent.ask('delete all my invoices', TENANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject queries with update keywords', async () => {
      await expect(
        agent.ask('update the invoice amount', TENANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject queries with insert keywords', async () => {
      await expect(
        agent.ask('insert a new transaction', TENANT_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Data with values
  // ─────────────────────────────────────────────────────────────────────

  describe('data with values', () => {
    it('should format revenue amounts correctly', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amountCents: 1234567 },
        _count: 25,
      });

      const response = await agent.ask('What is my revenue?', TENANT_ID);
      expect(response.answer).toContain('R12,345.67');
      expect(response.answer).toContain('25');
    });

    it('should calculate invoice outstanding amounts', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        { status: 'SENT', totalCents: 100000, amountPaidCents: 50000 },
        { status: 'PAID', totalCents: 200000, amountPaidCents: 200000 },
        { status: 'OVERDUE', totalCents: 150000, amountPaidCents: 0 },
      ]);

      const response = await agent.ask('Show me invoice status', TENANT_ID);
      expect(response.answer).toContain('3 invoices');
      expect(response.answer).toContain('R4,500.00'); // total: 450000
      expect(response.answer).toContain('R2,500.00'); // paid: 250000
      expect(response.answer).toContain('2 invoices are still outstanding');
    });

    it('should report enrollment count correctly', async () => {
      mockPrisma.child.count.mockResolvedValue(42);

      const response = await agent.ask(
        'How many children enrolled?',
        TENANT_ID,
      );
      expect(response.answer).toContain('42');
      expect(response.answer).toContain('children');
    });

    it('should build a comprehensive summary', async () => {
      mockPrisma.transaction.aggregate
        .mockResolvedValueOnce({
          _sum: { amountCents: 500000 },
          _count: 20,
        })
        .mockResolvedValueOnce({
          _sum: { amountCents: 300000 },
          _count: 15,
        });

      mockPrisma.child.count.mockResolvedValue(30);

      mockPrisma.invoice.findMany.mockResolvedValue([
        { status: 'SENT', totalCents: 100000, amountPaidCents: 0 },
      ]);

      const response = await agent.ask('Give me a summary', TENANT_ID);
      expect(response.answer).toContain('R5,000.00'); // revenue
      expect(response.answer).toContain('R3,000.00'); // expenses
      expect(response.answer).toContain('R2,000.00'); // net
      expect(response.answer).toContain('30'); // children
      expect(response.answer).toContain('R1,000.00'); // outstanding
      expect(response.answer).toContain('positive');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Prisma unavailable
  // ─────────────────────────────────────────────────────────────────────

  describe('Prisma unavailable', () => {
    it('should return graceful message when Prisma is not available', async () => {
      const agentWithoutPrisma = new ConversationalAgent(
        mockFactory,
        mockConfig,
        undefined as unknown as RuvectorService,
        undefined as unknown as PrismaService,
        queryValidator,
      );

      const response = await agentWithoutPrisma.ask(
        'What is my revenue?',
        TENANT_ID,
      );
      expect(response.answer).toContain('not available');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // General query handling
  // ─────────────────────────────────────────────────────────────────────

  describe('general query handling', () => {
    it('should provide guidance for unclassified questions', async () => {
      const response = await agent.ask('Hello there!', TENANT_ID);
      expect(response.metadata.queryType).toBe('GENERAL');
      expect(response.answer).toContain('Revenue');
      expect(response.answer).toContain('Expense');
      expect(response.answer).toContain('Invoice');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // isDeleted filter
  // ─────────────────────────────────────────────────────────────────────

  describe('isDeleted filter', () => {
    it('should always filter with isDeleted: false on transactions', async () => {
      await agent.ask('What is my revenue?', TENANT_ID);

      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });

    it('should always filter with isDeleted: false on invoices', async () => {
      await agent.ask('Show invoices', TENANT_ID);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });

    it('should always filter with isDeleted: false on children', async () => {
      await agent.ask('How many children enrolled?', TENANT_ID);

      expect(mockPrisma.child.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });
  });
});
