/**
 * SdkSarsExplainer Unit Tests
 * Verifies LLM wiring via ClaudeClientService and fallback behaviour.
 */

import { SdkSarsExplainer } from './sdk-sars-explainer';
import { SARS_EXPLAINER_SYSTEM_PROMPT } from './sars-prompt';
import type { SdkAgentFactory } from '../sdk/sdk-agent.factory';
import type { SdkConfigService } from '../sdk/sdk-config';
import type { ClaudeClientService } from '../sdk/claude-client.service';
import type { SarsBreakdown } from './interfaces/sars.interface';
import type { ExplanationContext } from './interfaces/sdk-sars.interface';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeFactory(): jest.Mocked<SdkAgentFactory> {
  return {
    createSarsAgent: jest.fn().mockReturnValue({
      description: 'SARS agent',
      prompt: 'sars prompt',
      tools: [],
      model: 'sonnet',
    }),
    createConversationalAgent: jest.fn(),
    createCategorizerAgent: jest.fn(),
    createMatcherAgent: jest.fn(),
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
    getTemperature: jest.fn().mockReturnValue(0),
    getBaseUrl: jest.fn(),
  } as unknown as jest.Mocked<SdkConfigService>;
}

function makeClaudeClient(available = true): jest.Mocked<ClaudeClientService> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    sendMessage: jest.fn().mockResolvedValue({
      content: 'LLM explanation text',
      model: 'claude-sonnet-4-20250514',
      usage: { inputTokens: 100, outputTokens: 50 },
      stopReason: 'end_turn',
    }),
    chat: jest.fn(),
  } as unknown as jest.Mocked<ClaudeClientService>;
}

const TENANT_ID = 'tenant-sars-001';
const PERIOD = '2025-02';

const BREAKDOWN: SarsBreakdown = {
  grossAmountCents: 2500000,
  payeCents: 375000,
  taxBeforeRebatesCents: 450000,
  totalRebatesCents: 75000,
  medicalCreditsCents: 0,
  uifCents: 50000,
  sdlCents: 25000,
};

const CONTEXT: ExplanationContext = {
  tenantId: TENANT_ID,
  period: PERIOD,
  type: 'PAYE',
};

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('SdkSarsExplainer', () => {
  let factory: jest.Mocked<SdkAgentFactory>;
  let config: jest.Mocked<SdkConfigService>;
  let claudeClient: jest.Mocked<ClaudeClientService>;
  let explainer: SdkSarsExplainer;

  beforeEach(() => {
    factory = makeFactory();
    config = makeConfig(true);
    claudeClient = makeClaudeClient(true);
    explainer = new SdkSarsExplainer(factory, config, claudeClient);
  });

  // ─────────────────────────────────────────────────────────────────
  // SDK path — real LLM call
  // ─────────────────────────────────────────────────────────────────

  describe('explain — SDK path', () => {
    it('calls ClaudeClientService with the SARS system prompt', async () => {
      const result = await explainer.explain('PAYE', BREAKDOWN, CONTEXT);

      expect(claudeClient.sendMessage).toHaveBeenCalledTimes(1);
      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(callArg.systemPrompt).toBe(SARS_EXPLAINER_SYSTEM_PROMPT);
      expect(callArg.messages).toHaveLength(1);
      expect(callArg.messages[0].role).toBe('user');
      expect(callArg.model).toBe('sonnet');
      expect(callArg.maxTokens).toBe(500);
      expect(callArg.temperature).toBe(0.3);
      expect(result).toBe('LLM explanation text');
    });

    it('includes the SARS type and period in the user message', async () => {
      await explainer.explain('EMP201', BREAKDOWN, {
        ...CONTEXT,
        type: 'EMP201',
      });

      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(callArg.messages[0].content).toContain('EMP201');
      expect(callArg.messages[0].content).toContain(PERIOD);
    });

    it('returns LLM content directly', async () => {
      claudeClient.sendMessage.mockResolvedValueOnce({
        content: 'Your PAYE for February is R3,750.00.',
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 80, outputTokens: 40 },
        stopReason: 'end_turn',
      });

      const result = await explainer.explain('PAYE', BREAKDOWN, CONTEXT);
      expect(result).toBe('Your PAYE for February is R3,750.00.');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Fallback when claude client unavailable
  // ─────────────────────────────────────────────────────────────────

  describe('explain — fallback', () => {
    it('falls back to template when claude client is not available', async () => {
      const unavailableClient = makeClaudeClient(false);
      explainer = new SdkSarsExplainer(factory, config, unavailableClient);

      const result = await explainer.explain('PAYE', BREAKDOWN, CONTEXT);

      expect(unavailableClient.sendMessage).not.toHaveBeenCalled();
      expect(result).toContain('PAYE');
      expect(result).toContain(PERIOD);
    });

    it('falls back to template when SDK is disabled', async () => {
      const disabledConfig = makeConfig(false);
      explainer = new SdkSarsExplainer(factory, disabledConfig, claudeClient);

      const result = await explainer.explain('UIF', BREAKDOWN, {
        ...CONTEXT,
        type: 'UIF',
      });

      expect(claudeClient.sendMessage).not.toHaveBeenCalled();
      expect(result).toContain('UIF');
    });

    it('falls back to template when claude client throws', async () => {
      claudeClient.sendMessage.mockRejectedValueOnce(
        new Error('429 rate limit'),
      );

      const result = await explainer.explain('VAT201', BREAKDOWN, {
        ...CONTEXT,
        type: 'VAT201',
      });

      expect(result).toContain('VAT201');
    });

    it('falls back to template when no claude client injected', async () => {
      explainer = new SdkSarsExplainer(factory, config, undefined);

      const result = await explainer.explain('EMP201', BREAKDOWN, {
        ...CONTEXT,
        type: 'EMP201',
      });

      expect(result).toContain('EMP201');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // getAgentDefinition
  // ─────────────────────────────────────────────────────────────────

  describe('getAgentDefinition', () => {
    it('delegates to factory.createSarsAgent', () => {
      const def = explainer.getAgentDefinition(TENANT_ID);
      expect(factory.createSarsAgent).toHaveBeenCalledWith(TENANT_ID);
      expect(def).toBeDefined();
    });
  });
});
