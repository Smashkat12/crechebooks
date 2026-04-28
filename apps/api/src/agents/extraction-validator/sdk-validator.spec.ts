/**
 * SdkSemanticValidator Unit Tests
 * Verifies LLM wiring via ClaudeClientService and fallback behaviour.
 */

import { SdkSemanticValidator } from './sdk-validator';
import { SEMANTIC_VALIDATOR_SYSTEM_PROMPT } from './validator-prompt';
import type { SdkAgentFactory } from '../sdk/sdk-agent.factory';
import type { SdkConfigService } from '../sdk/sdk-config';
import type { ClaudeClientService } from '../sdk/claude-client.service';
import type { ParsedBankStatement } from '../../database/entities/bank-statement-match.entity';

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function makeFactory(): jest.Mocked<SdkAgentFactory> {
  return {
    createExtractionValidatorAgent: jest.fn().mockReturnValue({
      description: 'extraction validator',
      prompt: 'extraction prompt',
      tools: [],
      model: 'haiku',
    }),
    createConversationalAgent: jest.fn(),
    createCategorizerAgent: jest.fn(),
    createMatcherAgent: jest.fn(),
    createSarsAgent: jest.fn(),
    createOrchestratorAgent: jest.fn(),
    createAgent: jest.fn(),
  } as unknown as jest.Mocked<SdkAgentFactory>;
}

function makeConfig(enabled = true): jest.Mocked<SdkConfigService> {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    getModelForAgent: jest.fn().mockReturnValue('haiku'),
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

const VALID_LLM_RESPONSE = JSON.stringify({
  isSemanticValid: true,
  semanticConfidence: 92,
  documentType: 'bank_statement',
  issues: [],
  summary: 'Clean statement, no issues detected.',
});

function makeClaudeClient(available = true): jest.Mocked<ClaudeClientService> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    sendMessage: jest.fn().mockResolvedValue({
      content: VALID_LLM_RESPONSE,
      model: 'claude-3-5-haiku-20241022',
      usage: { inputTokens: 200, outputTokens: 80 },
      stopReason: 'end_turn',
    }),
    chat: jest.fn(),
  } as unknown as jest.Mocked<ClaudeClientService>;
}

const TENANT_ID = 'tenant-exval-001';

function makeStatement(
  overrides: Partial<ParsedBankStatement> = {},
): ParsedBankStatement {
  return {
    accountNumber: '63061274808',
    openingBalanceCents: 100000,
    closingBalanceCents: 200000,
    statementPeriod: {
      start: new Date('2025-01-01'),
      end: new Date('2025-01-31'),
    },
    transactions: [
      {
        date: new Date('2025-01-05'),
        description: 'SALARY PAYMENT',
        amountCents: 500000,
        isCredit: true,
      },
      {
        date: new Date('2025-01-10'),
        description: 'ELECTRICITY DEBIT ORDER',
        amountCents: 150000,
        isCredit: false,
      },
    ],
    ...overrides,
  } as unknown as ParsedBankStatement;
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('SdkSemanticValidator', () => {
  let factory: jest.Mocked<SdkAgentFactory>;
  let config: jest.Mocked<SdkConfigService>;
  let claudeClient: jest.Mocked<ClaudeClientService>;
  let validator: SdkSemanticValidator;

  beforeEach(() => {
    factory = makeFactory();
    config = makeConfig(true);
    claudeClient = makeClaudeClient(true);
    validator = new SdkSemanticValidator(factory, config, claudeClient);
  });

  // ─────────────────────────────────────────────────────────────────
  // SDK path
  // ─────────────────────────────────────────────────────────────────

  describe('validate — SDK path', () => {
    it('calls ClaudeClientService with the semantic validator system prompt', async () => {
      const result = await validator.validate(makeStatement(), TENANT_ID);

      expect(claudeClient.sendMessage).toHaveBeenCalledTimes(1);
      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(callArg.systemPrompt).toBe(SEMANTIC_VALIDATOR_SYSTEM_PROMPT);
      expect(callArg.messages).toHaveLength(1);
      expect(callArg.messages[0].role).toBe('user');
      expect(callArg.model).toBe('haiku');
      expect(callArg.temperature).toBe(0);
      expect(callArg.maxTokens).toBe(1024);

      expect(result.isSemanticValid).toBe(true);
      expect(result.semanticConfidence).toBe(92);
      expect(result.documentType).toBe('bank_statement');
      expect(result.issues).toHaveLength(0);
    });

    it('includes masked account number in prompt, not raw', async () => {
      await validator.validate(
        makeStatement({ accountNumber: '63061274808' } as any),
        TENANT_ID,
      );

      const callArg = claudeClient.sendMessage.mock.calls[0][0];
      expect(callArg.messages[0].content).not.toContain('63061274808');
      expect(callArg.messages[0].content).toContain('******4808');
    });

    it('parses LLM response with issues correctly', async () => {
      claudeClient.sendMessage.mockResolvedValueOnce({
        content: JSON.stringify({
          isSemanticValid: false,
          semanticConfidence: 40,
          documentType: 'unknown',
          issues: [
            {
              severity: 'ERROR',
              code: 'OCR_CORRUPTION',
              description: 'Many descriptions contain gibberish characters',
            },
          ],
          summary: 'Document appears corrupted.',
        }),
        model: 'claude-3-5-haiku-20241022',
        usage: { inputTokens: 150, outputTokens: 60 },
        stopReason: 'end_turn',
      });

      const result = await validator.validate(makeStatement(), TENANT_ID);

      expect(result.isSemanticValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('OCR_CORRUPTION');
    });

    it('falls back gracefully when LLM returns malformed JSON', async () => {
      claudeClient.sendMessage.mockResolvedValueOnce({
        content: 'not json at all',
        model: 'claude-3-5-haiku-20241022',
        usage: { inputTokens: 50, outputTokens: 10 },
        stopReason: 'end_turn',
      });

      const result = await validator.validate(makeStatement(), TENANT_ID);

      // parseValidationResponse returns default on parse failure
      expect(result.isSemanticValid).toBe(true);
      expect(result.semanticConfidence).toBe(75);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Fallback paths
  // ─────────────────────────────────────────────────────────────────

  describe('validate — fallback', () => {
    it('returns default result when claude client is not available', async () => {
      const unavailable = makeClaudeClient(false);
      validator = new SdkSemanticValidator(factory, config, unavailable);

      const result = await validator.validate(makeStatement(), TENANT_ID);

      expect(unavailable.sendMessage).not.toHaveBeenCalled();
      expect(result.isSemanticValid).toBe(true);
      expect(result.semanticConfidence).toBe(75);
      expect(result.summary).toContain('SDK unavailable');
    });

    it('returns default result when SDK is disabled', async () => {
      const disabledConfig = makeConfig(false);
      validator = new SdkSemanticValidator(
        factory,
        disabledConfig,
        claudeClient,
      );

      const result = await validator.validate(makeStatement(), TENANT_ID);

      expect(claudeClient.sendMessage).not.toHaveBeenCalled();
      expect(result.summary).toContain('SDK unavailable');
    });

    it('returns default result when claude client throws', async () => {
      claudeClient.sendMessage.mockRejectedValueOnce(
        new Error('500 server error'),
      );

      const result = await validator.validate(makeStatement(), TENANT_ID);

      expect(result.isSemanticValid).toBe(true);
      expect(result.summary).toContain('SDK unavailable');
    });

    it('returns default result when no claude client injected', async () => {
      validator = new SdkSemanticValidator(factory, config, undefined);

      const result = await validator.validate(makeStatement(), TENANT_ID);

      expect(result.summary).toContain('SDK unavailable');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // sanitizeForLlm
  // ─────────────────────────────────────────────────────────────────

  describe('sanitizeForLlm', () => {
    it('masks account number', () => {
      const sanitised = validator.sanitizeForLlm(
        makeStatement({ accountNumber: '63061274808' } as any),
      );
      expect(sanitised.maskedAccountNumber).toBe('******4808');
    });

    it('computes total credits and debits', () => {
      const sanitised = validator.sanitizeForLlm(makeStatement());
      expect(sanitised.totalCreditsRands).toBe('R 5000.00');
      expect(sanitised.totalDebitsRands).toBe('R 1500.00');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // sampleTransactions
  // ─────────────────────────────────────────────────────────────────

  describe('sampleTransactions', () => {
    it('returns all transactions when count <= 20', () => {
      const txs = Array.from({ length: 15 }, (_, i) => ({
        date: new Date(),
        description: `tx${String(i)}`,
        amountCents: 100,
        isCredit: true,
      }));

      const sampled = validator.sampleTransactions(txs as any);
      expect(sampled).toHaveLength(15);
    });

    it('samples max 20 when count > 20', () => {
      const txs = Array.from({ length: 50 }, (_, i) => ({
        date: new Date(),
        description: `tx${String(i)}`,
        amountCents: 100,
        isCredit: i % 2 === 0,
      }));

      const sampled = validator.sampleTransactions(txs as any);
      expect(sampled).toHaveLength(20);
    });
  });
});
