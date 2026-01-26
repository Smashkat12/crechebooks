/**
 * SDK SARS Explainer Tests
 * TASK-SDK-005: SarsAgent SDK Enhancement (LLM Explanations)
 *
 * Tests for SdkSarsExplainer class: explain() for all 4 SARS types,
 * fallback behaviour, prompt building, system prompt content, model config,
 * and factory delegation.
 *
 * CRITICAL: Uses mocks for executeSdkInference - NEVER makes real API calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SdkSarsExplainer } from '../../../src/agents/sars-agent/sdk-sars-explainer';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import { SdkConfigService } from '../../../src/agents/sdk/sdk-config';
import type { SarsBreakdown } from '../../../src/agents/sars-agent/interfaces/sars.interface';
import type { ExplanationContext } from '../../../src/agents/sars-agent/interfaces/sdk-sars.interface';
import {
  SARS_EXPLAINER_SYSTEM_PROMPT,
  SARS_EXPLAINER_MODEL,
  buildPayePrompt,
  buildUifPrompt,
  buildEmp201Prompt,
  buildVat201Prompt,
  formatCentsAsRands,
} from '../../../src/agents/sars-agent/sars-prompt';

describe('SdkSarsExplainer', () => {
  let explainer: SdkSarsExplainer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ANTHROPIC_API_KEY: 'test-key',
              SDK_DISABLED: 'true', // Force fallback path for reliable testing
            }),
          ],
        }),
      ],
      providers: [SdkSarsExplainer, SdkAgentFactory, SdkConfigService],
    }).compile();

    explainer = module.get(SdkSarsExplainer);
  });

  describe('explain() - PAYE', () => {
    it('should return explanation string for PAYE', async () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 2500000,
        taxBeforeRebatesCents: 500000,
        totalRebatesCents: 150000,
        medicalCreditsCents: 30000,
        payeCents: 320000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-01',
        type: 'PAYE',
      };

      const explanation = await explainer.explain('PAYE', breakdown, context);

      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('PAYE');
      expect(explanation).toContain('2025-01');
      expect(explanation).toContain('accountant');
    });
  });

  describe('explain() - UIF', () => {
    it('should return explanation string for UIF', async () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 1500000,
        uifCents: 30000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-02',
        type: 'UIF',
      };

      const explanation = await explainer.explain('UIF', breakdown, context);

      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('UIF');
      expect(explanation).toContain('2025-02');
      expect(explanation).toContain('accountant');
    });
  });

  describe('explain() - EMP201', () => {
    it('should return explanation string for EMP201', async () => {
      const breakdown: SarsBreakdown = {
        payeCents: 200000,
        uifCents: 35424,
        sdlCents: 20000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-03',
        type: 'EMP201',
      };

      const explanation = await explainer.explain('EMP201', breakdown, context);

      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('EMP201');
      expect(explanation).toContain('2025-03');
      expect(explanation).toContain('accountant');
    });
  });

  describe('explain() - VAT201', () => {
    it('should return explanation string for VAT201', async () => {
      const breakdown: SarsBreakdown = {
        outputVatCents: 150000,
        inputVatCents: 80000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-01 to 2025-01',
        type: 'VAT201',
      };

      const explanation = await explainer.explain('VAT201', breakdown, context);

      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('VAT201');
      expect(explanation).toContain('accountant');
    });
  });

  describe('explain() - LLM failure fallback', () => {
    it('should return fallback explanation when LLM fails (not undefined)', async () => {
      // SDK is disabled so it will always use fallback
      const breakdown: SarsBreakdown = {
        grossAmountCents: 2500000,
        taxBeforeRebatesCents: 500000,
        totalRebatesCents: 150000,
        medicalCreditsCents: 30000,
        payeCents: 320000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-01',
        type: 'PAYE',
      };

      const explanation = await explainer.explain('PAYE', breakdown, context);

      // Should return a string, not undefined
      expect(explanation).toBeDefined();
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });

    it('should return fallback when SDK is available but inference throws', async () => {
      // Create explainer with SDK enabled
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                ANTHROPIC_API_KEY: 'test-key-enabled',
                SDK_DISABLED: 'false',
              }),
            ],
          }),
        ],
        providers: [SdkSarsExplainer, SdkAgentFactory, SdkConfigService],
      }).compile();

      const enabledExplainer = module.get(SdkSarsExplainer);

      const breakdown: SarsBreakdown = {
        grossAmountCents: 2500000,
        payeCents: 320000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-01',
        type: 'PAYE',
      };

      // executeSdkInference always throws (stub), so it should fall back
      const explanation = await enabledExplainer.explain(
        'PAYE',
        breakdown,
        context,
      );

      expect(explanation).toBeDefined();
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });
  });

  describe('fallback explanation includes key amounts', () => {
    it('should include PAYE amounts in fallback', async () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 2500000,
        taxBeforeRebatesCents: 500000,
        totalRebatesCents: 150000,
        medicalCreditsCents: 30000,
        payeCents: 320000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-01',
        type: 'PAYE',
      };

      const explanation = await explainer.explain('PAYE', breakdown, context);

      // Should include key formatted amounts
      expect(explanation).toContain('R25,000.00'); // gross
      expect(explanation).toContain('R3,200.00'); // net paye
    });

    it('should include UIF amounts in fallback', async () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 1500000,
        uifCents: 30000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-02',
        type: 'UIF',
      };

      const explanation = await explainer.explain('UIF', breakdown, context);

      expect(explanation).toContain('R15,000.00'); // gross
      expect(explanation).toContain('R300.00'); // total UIF
    });

    it('should include EMP201 amounts in fallback', async () => {
      const breakdown: SarsBreakdown = {
        payeCents: 200000,
        uifCents: 35424,
        sdlCents: 20000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-03',
        type: 'EMP201',
      };

      const explanation = await explainer.explain('EMP201', breakdown, context);

      expect(explanation).toContain('R2,000.00'); // paye
      expect(explanation).toContain('R354.24'); // uif
      expect(explanation).toContain('R200.00'); // sdl
    });

    it('should include VAT201 amounts in fallback', async () => {
      const breakdown: SarsBreakdown = {
        outputVatCents: 150000,
        inputVatCents: 80000,
      };
      const context: ExplanationContext = {
        tenantId: 'tenant-1',
        period: '2025-01 to 2025-01',
        type: 'VAT201',
      };

      const explanation = await explainer.explain('VAT201', breakdown, context);

      expect(explanation).toContain('R1,500.00'); // output vat
      expect(explanation).toContain('R800.00'); // input vat
      expect(explanation).toContain('Section 12(h)');
    });
  });

  describe('prompt building', () => {
    it('should format cents as rands correctly', () => {
      expect(formatCentsAsRands(0)).toBe('R0.00');
      expect(formatCentsAsRands(100)).toBe('R1.00');
      expect(formatCentsAsRands(123456)).toBe('R1,234.56');
      expect(formatCentsAsRands(2500000)).toBe('R25,000.00');
      expect(formatCentsAsRands(50)).toBe('R0.50');
      expect(formatCentsAsRands(100000000)).toBe('R1,000,000.00');
    });

    it('should build PAYE prompt with rands', () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 2500000,
        taxBeforeRebatesCents: 500000,
        totalRebatesCents: 150000,
        medicalCreditsCents: 30000,
        payeCents: 320000,
      };

      const prompt = buildPayePrompt(breakdown);

      expect(prompt).toContain('R25,000.00');
      expect(prompt).toContain('R5,000.00');
      expect(prompt).toContain('R1,500.00');
      expect(prompt).toContain('R300.00');
      expect(prompt).toContain('R3,200.00');
      expect(prompt).toContain('PAYE');
    });

    it('should build UIF prompt with rands', () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 1500000,
        uifCents: 30000,
      };

      const prompt = buildUifPrompt(breakdown, false);

      expect(prompt).toContain('R15,000.00');
      expect(prompt).toContain('R300.00');
      expect(prompt).toContain('UIF');
      expect(prompt).toContain('No');
    });

    it('should build UIF prompt with cap indicator', () => {
      const breakdown: SarsBreakdown = {
        grossAmountCents: 5000000,
        uifCents: 35424,
      };

      const prompt = buildUifPrompt(breakdown, true);

      expect(prompt).toContain('capped');
    });

    it('should build EMP201 prompt with rands', () => {
      const breakdown: SarsBreakdown = {
        payeCents: 200000,
        uifCents: 35424,
        sdlCents: 20000,
      };

      const prompt = buildEmp201Prompt(breakdown, 5, '2025-01');

      expect(prompt).toContain('R2,000.00');
      expect(prompt).toContain('R354.24');
      expect(prompt).toContain('R200.00');
      expect(prompt).toContain('5');
      expect(prompt).toContain('2025-01');
      expect(prompt).toContain('EMP201');
    });

    it('should build VAT201 prompt with rands', () => {
      const breakdown: SarsBreakdown = {
        outputVatCents: 150000,
        inputVatCents: 80000,
      };

      const prompt = buildVat201Prompt(breakdown, '2025-01 to 2025-01');

      expect(prompt).toContain('R1,500.00');
      expect(prompt).toContain('R800.00');
      expect(prompt).toContain('VAT201');
      expect(prompt).toContain('Section 12(h)');
    });
  });

  describe('system prompt content', () => {
    it('should contain "under 200 words" instruction', () => {
      expect(SARS_EXPLAINER_SYSTEM_PROMPT).toContain('under 200 words');
    });

    it('should contain "Section 12(h)" reference', () => {
      expect(SARS_EXPLAINER_SYSTEM_PROMPT).toContain('Section 12(h)');
    });

    it('should contain "accountant should review" instruction', () => {
      expect(SARS_EXPLAINER_SYSTEM_PROMPT).toContain(
        'accountant should review',
      );
    });

    it('should instruct plain text response format', () => {
      expect(SARS_EXPLAINER_SYSTEM_PROMPT).toContain('No JSON');
      expect(SARS_EXPLAINER_SYSTEM_PROMPT).toContain('No markdown');
    });

    it('should instruct not to suggest tax avoidance', () => {
      expect(SARS_EXPLAINER_SYSTEM_PROMPT).toContain(
        'Never suggest tax avoidance',
      );
    });
  });

  describe('model configuration', () => {
    it('should use sonnet model for explanations', () => {
      expect(SARS_EXPLAINER_MODEL).toBe('sonnet');
      expect(explainer.getModel()).toBe('sonnet');
    });
  });

  describe('getAgentDefinition()', () => {
    it('should delegate to factory.createSarsAgent', () => {
      const definition = explainer.getAgentDefinition('tenant-123');

      expect(definition).toBeDefined();
      expect(definition.description).toBeDefined();
      expect(definition.prompt).toContain('SARS');
      expect(definition.prompt).toContain('tenant-123');
      expect(definition.tools).toBeDefined();
      expect(definition.model).toBeDefined();
    });
  });

  describe('executeSdkInference()', () => {
    it('should throw when agentic-flow is not installed', async () => {
      await expect(
        explainer.executeSdkInference(
          {
            description: 'test',
            prompt: 'test',
            tools: [],
            model: 'sonnet',
          },
          'explain this',
          'tenant-1',
        ),
      ).rejects.toThrow('SDK inference not available');
    });
  });
});
