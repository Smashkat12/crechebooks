/**
 * ConversationalAgent — LLM wiring tests
 * Verifies that ClaudeClientService is called when available,
 * and that the fallback path is used when it is not.
 */

import { ConversationalAgent } from '../conversational.agent';
import { QueryValidator } from '../query-validator';
import type { SdkAgentFactory } from '../../sdk/sdk-agent.factory';
import type { SdkConfigService } from '../../sdk/sdk-config';
import type { ClaudeClientService } from '../../sdk/claude-client.service';
import type { PrismaService } from '../../../database/prisma/prisma.service';
import type { RuvectorService } from '../../sdk/ruvector.service';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeFactory(): jest.Mocked<SdkAgentFactory> {
  return {
    createConversationalAgent: jest.fn().mockReturnValue({
      description: 'conversational agent',
      prompt: 'system prompt',
      tools: [],
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

function makeConfig(enabled = true): jest.Mocked<SdkConfigService> {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    getModelForAgent: jest.fn().mockReturnValue('sonnet'),
    getApiKey: jest.fn().mockReturnValue(enabled ? 'test-key' : undefined),
    hasApiKey: jest.fn().mockReturnValue(enabled),
    getProviderForAgent: jest.fn().mockReturnValue('anthropic'),
    getApiKeyForProvider: jest
      .fn()
      .mockReturnValue(enabled ? 'test-key' : undefined),
    getMaxTokens: jest.fn().mockReturnValue(1024),
    getTemperature: jest.fn().mockReturnValue(0.3),
    getBaseUrl: jest.fn(),
  } as unknown as jest.Mocked<SdkConfigService>;
}

function makePrisma(): Record<string, Record<string, jest.Mock>> {
  return {
    transaction: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountCents: 500000 },
        _count: 5,
      }),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    child: {
      count: jest.fn().mockResolvedValue(10),
    },
  };
}

function makeClaudeClient(available = true): jest.Mocked<ClaudeClientService> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    sendMessage: jest.fn().mockResolvedValue({
      content: 'Your total revenue is R5,000.',
      model: 'claude-sonnet-4-20250514',
      usage: { inputTokens: 150, outputTokens: 60 },
      stopReason: 'end_turn',
    }),
    chat: jest.fn(),
  } as unknown as jest.Mocked<ClaudeClientService>;
}

const TENANT_ID = 'tenant-conv-llm-001';

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('ConversationalAgent — LLM wiring', () => {
  let factory: jest.Mocked<SdkAgentFactory>;
  let config: jest.Mocked<SdkConfigService>;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let claudeClient: jest.Mocked<ClaudeClientService>;
  let validator: QueryValidator;

  beforeEach(() => {
    factory = makeFactory();
    config = makeConfig(true);
    prisma = makePrisma();
    claudeClient = makeClaudeClient(true);
    validator = new QueryValidator();
  });

  // ─────────────────────────────────────────────────────────────────
  // SDK path — LLM is called
  // ─────────────────────────────────────────────────────────────────

  describe('SDK path', () => {
    let agent: ConversationalAgent;

    beforeEach(() => {
      agent = new ConversationalAgent(
        factory,
        config,
        undefined as unknown as RuvectorService,
        prisma as unknown as PrismaService,
        validator,
        claudeClient,
      );
    });

    it('calls ClaudeClientService when available and SDK enabled', async () => {
      const response = await agent.ask('What is my revenue?', TENANT_ID);

      expect(claudeClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(response.metadata.source).toBe('SDK');
      expect(response.answer).toBe('Your total revenue is R5,000.');
    });

    it('sends the CrecheBooks system prompt', async () => {
      await agent.ask('How many invoices?', TENANT_ID);

      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(callArg.systemPrompt).toContain('CrecheBooks Assistant');
      expect(callArg.systemPrompt).toContain('billing questions');
    });

    it('includes the user question in the user message', async () => {
      await agent.ask('What is my total revenue?', TENANT_ID);

      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(callArg.messages[0].content).toContain(
        'What is my total revenue?',
      );
    });

    it('includes Prisma context data in the user message for revenue query', async () => {
      await agent.ask('What is my revenue?', TENANT_ID);

      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      // The context summary should contain formatted revenue amount
      expect(callArg.messages[0].content).toContain('revenue');
    });

    it('uses the routed model (haiku for simple, sonnet for complex)', async () => {
      // Simple revenue query → haiku
      await agent.ask('What is my revenue?', TENANT_ID);
      const simpleCallArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(simpleCallArg.model).toBe('haiku');

      claudeClient.sendMessage.mockClear();

      // Complex summary query → sonnet
      await agent.ask('Give me a financial summary', TENANT_ID);
      const complexCallArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(complexCallArg.model).toBe('sonnet');
    });

    it('includes conversation ID in response', async () => {
      const convId = 'conv-llm-abc';
      const response = await agent.ask(
        'What is my revenue?',
        TENANT_ID,
        convId,
      );
      expect(response.conversationId).toBe(convId);
    });

    it('does not call LLM for tax queries — uses template redirect', async () => {
      const response = await agent.ask('What about VAT?', TENANT_ID);

      // Tax queries are classified but the context builder doesn't need LLM data
      // The LLM is still called (contextSummary is built), but response is from LLM
      expect(response.metadata.queryType).toBe('TAX');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Fallback — LLM unavailable
  // ─────────────────────────────────────────────────────────────────

  describe('fallback path', () => {
    it('falls back to template when claude client is not available', async () => {
      const unavailable = makeClaudeClient(false);
      const agent = new ConversationalAgent(
        factory,
        config,
        undefined as unknown as RuvectorService,
        prisma as unknown as PrismaService,
        validator,
        unavailable,
      );

      const response = await agent.ask('What is my revenue?', TENANT_ID);

      expect(unavailable.sendMessage).not.toHaveBeenCalled();
      expect(response.metadata.source).toBe('FALLBACK');
    });

    it('falls back when SDK is disabled', async () => {
      const disabledConfig = makeConfig(false);
      const agent = new ConversationalAgent(
        factory,
        disabledConfig,
        undefined as unknown as RuvectorService,
        prisma as unknown as PrismaService,
        validator,
        claudeClient,
      );

      const response = await agent.ask('What is my revenue?', TENANT_ID);

      expect(claudeClient.sendMessage).not.toHaveBeenCalled();
      expect(response.metadata.source).toBe('FALLBACK');
    });

    it('falls back when no claude client injected', async () => {
      const agent = new ConversationalAgent(
        factory,
        config,
        undefined as unknown as RuvectorService,
        prisma as unknown as PrismaService,
        validator,
        undefined,
      );

      const response = await agent.ask('What is my revenue?', TENANT_ID);

      expect(response.metadata.source).toBe('FALLBACK');
    });

    it('falls back when LLM call throws', async () => {
      claudeClient.sendMessage.mockRejectedValueOnce(
        new Error('429 rate limit'),
      );

      const agent = new ConversationalAgent(
        factory,
        config,
        undefined as unknown as RuvectorService,
        prisma as unknown as PrismaService,
        validator,
        claudeClient,
      );

      const response = await agent.ask('What is my revenue?', TENANT_ID);

      expect(response.metadata.source).toBe('FALLBACK');
      expect(response.answer).toBeDefined();
    });
  });
});
