/**
 * SDK Agent Factory Tests
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * Tests all 6 factory methods return correct agent definitions,
 * and model/provider overrides via environment variables.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import {
  SdkConfigService,
  AgentType,
} from '../../../src/agents/sdk/sdk-config';
import { AgentDefinition } from '../../../src/agents/sdk/interfaces/sdk-agent.interface';
import { AgentToolRegistry } from '../../../src/agents/sdk/tools/tool-registry.service';

// Minimal registry stub — returns the real per-agent allowlist so the factory
// produces populated tool lists for definition-shape assertions, without
// pulling in Prisma/services required by the real registry.
const fakeRegistry: Partial<AgentToolRegistry> = {
  getToolNamesForAgent(agent: AgentType): string[] {
    const map: Record<AgentType, string[]> = {
      categorizer: ['list_transactions', 'get_tenant', 'categorize_transactions'],
      matcher: ['list_invoices', 'list_payments', 'list_transactions', 'allocate_payment', 'run_payment_matching'],
      sars: ['get_tenant', 'get_dashboard_metrics'],
      extraction: ['get_tenant'],
      orchestrator: ['list_invoices', 'list_payments', 'list_transactions', 'get_arrears_summary', 'get_dashboard_metrics', 'list_children', 'list_parents', 'list_staff', 'get_tenant', 'generate_invoices', 'run_payment_matching', 'allocate_payment', 'categorize_transactions'],
      conversational: ['list_invoices', 'list_payments', 'list_transactions', 'get_arrears_summary', 'get_dashboard_metrics', 'list_children', 'list_parents', 'list_staff', 'get_tenant'],
    };
    return map[agent] ?? [];
  },
};

describe('SdkAgentFactory', () => {
  let factory: SdkAgentFactory;
  const tenantId = 'test-tenant-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ANTHROPIC_API_KEY: 'test-api-key-12345',
              SDK_DISABLED: 'false',
              SDK_MODEL_CATEGORIZER: 'haiku',
              SDK_MODEL_MATCHER: 'haiku',
              SDK_MODEL_SARS: 'sonnet',
              SDK_MODEL_EXTRACTION: 'haiku',
              SDK_MODEL_ORCHESTRATOR: 'sonnet',
              SDK_MODEL_CONVERSATIONAL: 'sonnet',
              SDK_MAX_TOKENS: '1024',
              SDK_TEMPERATURE: '0',
            }),
          ],
        }),
      ],
      providers: [
        SdkAgentFactory,
        SdkConfigService,
        { provide: AgentToolRegistry, useValue: fakeRegistry },
      ],
    }).compile();

    factory = module.get<SdkAgentFactory>(SdkAgentFactory);
  });

  /**
   * Helper to validate common AgentDefinition structure
   */
  function assertValidAgentDefinition(def: AgentDefinition): void {
    expect(def).toBeDefined();
    expect(def.description).toBeDefined();
    expect(def.description.length).toBeGreaterThan(0);
    expect(def.prompt).toBeDefined();
    expect(def.prompt.length).toBeGreaterThan(0);
    expect(def.tools).toBeDefined();
    expect(Array.isArray(def.tools)).toBe(true);
    expect(def.tools.length).toBeGreaterThan(0);
    expect(def.model).toBeDefined();
    expect(def.model.length).toBeGreaterThan(0);
  }

  describe('createCategorizerAgent', () => {
    it('should return a valid agent definition', () => {
      const def = factory.createCategorizerAgent(tenantId);
      assertValidAgentDefinition(def);
    });

    it('should include tenant ID in prompt', () => {
      const def = factory.createCategorizerAgent(tenantId);
      expect(def.prompt).toContain(tenantId);
    });

    it('should include SA-specific domain knowledge', () => {
      const def = factory.createCategorizerAgent(tenantId);
      expect(def.prompt).toContain('South African');
      expect(def.prompt).toContain('VAT');
      expect(def.prompt).toContain('CENTS');
    });

    it('should use haiku model for categoriser', () => {
      const def = factory.createCategorizerAgent(tenantId);
      expect(def.model).toBe('haiku');
    });

    it('should include registry-bound tools', () => {
      const def = factory.createCategorizerAgent(tenantId);
      expect(def.tools).toContain('list_transactions');
      expect(def.tools).toContain('categorize_transactions');
    });
  });

  describe('createMatcherAgent', () => {
    it('should return a valid agent definition', () => {
      const def = factory.createMatcherAgent(tenantId);
      assertValidAgentDefinition(def);
    });

    it('should include matching strategy in prompt', () => {
      const def = factory.createMatcherAgent(tenantId);
      expect(def.prompt).toContain('EXACT_AMOUNT');
      expect(def.prompt).toContain('REFERENCE');
    });

    it('should use haiku model for matcher', () => {
      const def = factory.createMatcherAgent(tenantId);
      expect(def.model).toBe('haiku');
    });
  });

  describe('createSarsAgent', () => {
    it('should return a valid agent definition', () => {
      const def = factory.createSarsAgent(tenantId);
      assertValidAgentDefinition(def);
    });

    it('should include SARS-specific domain knowledge', () => {
      const def = factory.createSarsAgent(tenantId);
      expect(def.prompt).toContain('SARS');
      expect(def.prompt).toContain('VAT201');
      expect(def.prompt).toContain('EMP501');
      expect(def.prompt).toContain('PAYE');
    });

    it('should use sonnet model for SARS (complex reasoning)', () => {
      const def = factory.createSarsAgent(tenantId);
      expect(def.model).toBe('sonnet');
    });
  });

  describe('createExtractionValidatorAgent', () => {
    it('should return a valid agent definition', () => {
      const def = factory.createExtractionValidatorAgent(tenantId);
      assertValidAgentDefinition(def);
    });

    it('should include validation checks in prompt', () => {
      const def = factory.createExtractionValidatorAgent(tenantId);
      expect(def.prompt).toContain('Amount consistency');
      expect(def.prompt).toContain('VAT number');
    });

    it('should use haiku model for extraction', () => {
      const def = factory.createExtractionValidatorAgent(tenantId);
      expect(def.model).toBe('haiku');
    });
  });

  describe('createOrchestratorAgent', () => {
    it('should return a valid agent definition', () => {
      const def = factory.createOrchestratorAgent(tenantId);
      assertValidAgentDefinition(def);
    });

    it('should include workflow types in prompt', () => {
      const def = factory.createOrchestratorAgent(tenantId);
      expect(def.prompt).toContain('BANK_IMPORT');
      expect(def.prompt).toContain('MONTH_END');
    });

    it('should use sonnet model for orchestrator (complex reasoning)', () => {
      const def = factory.createOrchestratorAgent(tenantId);
      expect(def.model).toBe('sonnet');
    });
  });

  describe('createConversationalAgent', () => {
    it('should return a valid agent definition', () => {
      const def = factory.createConversationalAgent(tenantId);
      assertValidAgentDefinition(def);
    });

    it('should include user-friendly personality traits', () => {
      const def = factory.createConversationalAgent(tenantId);
      expect(def.prompt).toContain('friendly');
      expect(def.prompt).toContain('creche');
    });

    it('should use sonnet model for conversational (complex reasoning)', () => {
      const def = factory.createConversationalAgent(tenantId);
      expect(def.model).toBe('sonnet');
    });
  });

  describe('createAgent (generic factory method)', () => {
    const agentTypes: AgentType[] = [
      'categorizer',
      'matcher',
      'sars',
      'extraction',
      'orchestrator',
      'conversational',
    ];

    it.each(agentTypes)('should create a valid %s agent', (agentType) => {
      const def = factory.createAgent(agentType, tenantId);
      assertValidAgentDefinition(def);
      expect(def.prompt).toContain(tenantId);
    });
  });

  describe('model override via env vars', () => {
    it('should use custom model when SDK_MODEL_{TYPE} is set', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                ANTHROPIC_API_KEY: 'test-api-key-12345',
                SDK_MODEL_CATEGORIZER: 'opus',
                SDK_MODEL_SARS: 'haiku',
              }),
            ],
          }),
        ],
        providers: [SdkAgentFactory, SdkConfigService],
      }).compile();

      const customFactory = module.get<SdkAgentFactory>(SdkAgentFactory);

      const categorizerDef = customFactory.createCategorizerAgent(tenantId);
      expect(categorizerDef.model).toBe('opus');

      const sarsDef = customFactory.createSarsAgent(tenantId);
      expect(sarsDef.model).toBe('haiku');
    });

    it('should fall back to default model when env var is empty', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                ANTHROPIC_API_KEY: 'test-api-key-12345',
                // SDK_MODEL_CATEGORIZER not set - should use default 'haiku'
              }),
            ],
          }),
        ],
        providers: [SdkAgentFactory, SdkConfigService],
      }).compile();

      const defaultFactory = module.get<SdkAgentFactory>(SdkAgentFactory);
      const def = defaultFactory.createCategorizerAgent(tenantId);
      expect(def.model).toBe('haiku');
    });
  });
});
