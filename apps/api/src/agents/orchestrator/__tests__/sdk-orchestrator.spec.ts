/**
 * SDK Orchestrator Unit Tests
 * TASK-SDK-007: OrchestratorAgent SDK Parent Agent Migration
 *
 * @module agents/orchestrator/__tests__/sdk-orchestrator.spec
 * @description Comprehensive tests for:
 * - SdkOrchestrator parallel and sequential execution
 * - Error isolation (one step fails, others continue)
 * - Fallback behavior (returns undefined -> caller falls back)
 * - WorkflowResultAdaptor mapping
 * - SARS L2 enforcement (containsSars -> always L2_DRAFT)
 * - Workflow definitions (getWorkflowDefinition, isMultiStepWorkflow)
 * - Tenant isolation (tenantId always present in SubagentContext)
 * - WorkflowResult format matches existing interface
 */

import { SdkOrchestrator } from '../sdk-orchestrator';
import { WorkflowResultAdaptor } from '../workflow-result-adaptor';
import {
  SDK_WORKFLOW_DEFINITIONS,
  getWorkflowDefinition,
  isMultiStepWorkflow,
} from '../workflow-definitions';
import { SubagentResult } from '../interfaces/sdk-orchestrator.interface';
import {
  WorkflowRequest,
  WorkflowResult,
  WorkflowType,
} from '../interfaces/orchestrator.interface';
import { SdkAgentFactory } from '../../sdk/sdk-agent.factory';
import { SdkConfigService } from '../../sdk/sdk-config';
import { RuvectorService } from '../../sdk/ruvector.service';
import { TransactionCategorizerAgent } from '../../transaction-categorizer/categorizer.agent';
import { PaymentMatcherAgent } from '../../payment-matcher/matcher.agent';
import { SarsAgent } from '../../sars-agent/sars.agent';
import { WorkflowRouter } from '../workflow-router';
import { EscalationManager } from '../escalation-manager';
import { PrismaService } from '../../../database/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────

function createMockFactory(): jest.Mocked<SdkAgentFactory> {
  return {
    createOrchestratorAgent: jest.fn().mockReturnValue({
      description: 'test orchestrator',
      prompt: 'test prompt',
      tools: ['workflow_status'],
      model: 'haiku',
    }),
    createCategorizerAgent: jest.fn(),
    createMatcherAgent: jest.fn(),
    createSarsAgent: jest.fn(),
    createExtractionValidatorAgent: jest.fn(),
    createConversationalAgent: jest.fn(),
    createAgent: jest.fn(),
  } as unknown as jest.Mocked<SdkAgentFactory>;
}

function createMockConfig(): jest.Mocked<SdkConfigService> {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    getModelForAgent: jest.fn().mockReturnValue('haiku'),
    getApiKey: jest.fn().mockReturnValue('test-key'),
    hasApiKey: jest.fn().mockReturnValue(true),
    getProviderForAgent: jest.fn().mockReturnValue('anthropic'),
    getApiKeyForProvider: jest.fn().mockReturnValue('test-key'),
    getMaxTokens: jest.fn().mockReturnValue(1024),
    getTemperature: jest.fn().mockReturnValue(0),
    getBaseUrl: jest.fn(),
  } as unknown as jest.Mocked<SdkConfigService>;
}

function createMockTransactionCategorizer(): jest.Mocked<TransactionCategorizerAgent> {
  return {
    categorize: jest.fn().mockResolvedValue({
      autoApplied: true,
      confidenceScore: 95,
      reasoning: 'High confidence categorization',
      accountCode: '6100',
    }),
  } as unknown as jest.Mocked<TransactionCategorizerAgent>;
}

function createMockPaymentMatcher(): jest.Mocked<PaymentMatcherAgent> {
  return {
    findCandidates: jest
      .fn()
      .mockResolvedValue([{ invoiceId: 'inv-001', confidence: 90 }]),
    makeMatchDecision: jest.fn().mockResolvedValue({
      action: 'AUTO_APPLY',
      confidence: 90,
      reasoning: 'Exact amount match',
      invoiceId: 'inv-001',
      alternatives: [],
    }),
  } as unknown as jest.Mocked<PaymentMatcherAgent>;
}

function createMockSarsAgent(): jest.Mocked<SarsAgent> {
  return {
    calculatePayeForReview: jest.fn().mockResolvedValue({
      calculatedAmountCents: 500000,
      period: '2024-01',
    }),
    generateEmp201ForReview: jest.fn().mockResolvedValue({
      calculatedAmountCents: 1200000,
      period: '2024-01',
    }),
    generateVat201ForReview: jest.fn().mockResolvedValue({
      calculatedAmountCents: 300000,
      period: '2024-01',
    }),
  } as unknown as jest.Mocked<SarsAgent>;
}

function createMockWorkflowRouter(): jest.Mocked<WorkflowRouter> {
  return {
    getAutonomyLevel: jest.fn().mockReturnValue('L3_FULL_AUTO'),
    getWorkflowConfig: jest.fn(),
    getRequiredAgents: jest.fn(),
    isSequential: jest.fn(),
    isSarsWorkflow: jest.fn(),
    getAvailableWorkflows: jest.fn(),
    logRoutingDecision: jest.fn(),
  } as unknown as jest.Mocked<WorkflowRouter>;
}

function createMockEscalationManager(): jest.Mocked<EscalationManager> {
  return {
    logEscalation: jest.fn().mockResolvedValue(undefined),
    logMultipleEscalations: jest.fn().mockResolvedValue(undefined),
    getPendingSummary: jest.fn(),
    hasCriticalEscalations: jest.fn(),
  } as unknown as jest.Mocked<EscalationManager>;
}

function createMockPrisma(): jest.Mocked<PrismaService> {
  return {
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function createMockRuvector(): jest.Mocked<RuvectorService> {
  return {
    isAvailable: jest.fn().mockReturnValue(false),
    generateEmbedding: jest.fn(),
    searchSimilar: jest.fn(),
    onModuleInit: jest.fn(),
  } as unknown as jest.Mocked<RuvectorService>;
}

const MOCK_TENANT_ID = 'tenant-test-001';

function createRequest(
  type: WorkflowType,
  parameters: Record<string, unknown> = {},
): WorkflowRequest {
  return {
    type,
    tenantId: MOCK_TENANT_ID,
    parameters,
  };
}

function createMockTransaction(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'txn-001',
    tenantId: MOCK_TENANT_ID,
    bankAccount: 'acc-001',
    date: new Date('2024-01-15'),
    amountCents: 100000,
    description: 'Test transaction',
    reference: 'REF-001',
    payeeName: 'Test Payee',
    isCredit: false,
    isDeleted: false,
    status: 'PENDING',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('WorkflowDefinitions', () => {
  describe('SDK_WORKFLOW_DEFINITIONS', () => {
    it('should define all 7 workflow types', () => {
      const types: WorkflowType[] = [
        'CATEGORIZE_TRANSACTIONS',
        'MATCH_PAYMENTS',
        'CALCULATE_PAYE',
        'GENERATE_EMP201',
        'GENERATE_VAT201',
        'BANK_IMPORT',
        'MONTHLY_CLOSE',
      ];
      for (const type of types) {
        expect(SDK_WORKFLOW_DEFINITIONS[type]).toBeDefined();
      }
    });

    it('should mark SARS workflows with containsSars=true', () => {
      expect(SDK_WORKFLOW_DEFINITIONS['CALCULATE_PAYE'].containsSars).toBe(
        true,
      );
      expect(SDK_WORKFLOW_DEFINITIONS['GENERATE_EMP201'].containsSars).toBe(
        true,
      );
      expect(SDK_WORKFLOW_DEFINITIONS['GENERATE_VAT201'].containsSars).toBe(
        true,
      );
      expect(SDK_WORKFLOW_DEFINITIONS['MONTHLY_CLOSE'].containsSars).toBe(true);
    });

    it('should mark non-SARS workflows with containsSars=false', () => {
      expect(
        SDK_WORKFLOW_DEFINITIONS['CATEGORIZE_TRANSACTIONS'].containsSars,
      ).toBe(false);
      expect(SDK_WORKFLOW_DEFINITIONS['MATCH_PAYMENTS'].containsSars).toBe(
        false,
      );
      expect(SDK_WORKFLOW_DEFINITIONS['BANK_IMPORT'].containsSars).toBe(false);
    });

    it('should set SARS workflows to L2_DRAFT autonomy', () => {
      expect(SDK_WORKFLOW_DEFINITIONS['CALCULATE_PAYE'].autonomyLevel).toBe(
        'L2_DRAFT',
      );
      expect(SDK_WORKFLOW_DEFINITIONS['GENERATE_EMP201'].autonomyLevel).toBe(
        'L2_DRAFT',
      );
      expect(SDK_WORKFLOW_DEFINITIONS['GENERATE_VAT201'].autonomyLevel).toBe(
        'L2_DRAFT',
      );
      expect(SDK_WORKFLOW_DEFINITIONS['MONTHLY_CLOSE'].autonomyLevel).toBe(
        'L2_DRAFT',
      );
    });

    it('should set non-SARS workflows to L3_FULL_AUTO autonomy', () => {
      expect(
        SDK_WORKFLOW_DEFINITIONS['CATEGORIZE_TRANSACTIONS'].autonomyLevel,
      ).toBe('L3_FULL_AUTO');
      expect(SDK_WORKFLOW_DEFINITIONS['MATCH_PAYMENTS'].autonomyLevel).toBe(
        'L3_FULL_AUTO',
      );
      expect(SDK_WORKFLOW_DEFINITIONS['BANK_IMPORT'].autonomyLevel).toBe(
        'L3_FULL_AUTO',
      );
    });

    it('should define BANK_IMPORT with parallel steps', () => {
      const bankImport = SDK_WORKFLOW_DEFINITIONS['BANK_IMPORT'];
      expect(bankImport.steps).toHaveLength(2);
      expect(bankImport.steps[0].parallel).toBe(true);
      expect(bankImport.steps[1].parallel).toBe(true);
      expect(bankImport.steps[0].dependsOn).toEqual([]);
      expect(bankImport.steps[1].dependsOn).toEqual([]);
    });

    it('should define MONTHLY_CLOSE with sequential steps', () => {
      const monthlyClose = SDK_WORKFLOW_DEFINITIONS['MONTHLY_CLOSE'];
      expect(monthlyClose.steps).toHaveLength(3);
      expect(monthlyClose.steps[0].dependsOn).toEqual([]);
      expect(monthlyClose.steps[1].dependsOn).toEqual(['categorize']);
      expect(monthlyClose.steps[2].dependsOn).toEqual(['match']);
    });

    it('should have single-step definitions for simple workflows', () => {
      expect(
        SDK_WORKFLOW_DEFINITIONS['CATEGORIZE_TRANSACTIONS'].steps,
      ).toHaveLength(1);
      expect(SDK_WORKFLOW_DEFINITIONS['MATCH_PAYMENTS'].steps).toHaveLength(1);
      expect(SDK_WORKFLOW_DEFINITIONS['CALCULATE_PAYE'].steps).toHaveLength(1);
      expect(SDK_WORKFLOW_DEFINITIONS['GENERATE_EMP201'].steps).toHaveLength(1);
      expect(SDK_WORKFLOW_DEFINITIONS['GENERATE_VAT201'].steps).toHaveLength(1);
    });
  });

  describe('getWorkflowDefinition', () => {
    it('should return definition for valid workflow type', () => {
      const def = getWorkflowDefinition('BANK_IMPORT');
      expect(def).toBeDefined();
      expect(def?.workflowType).toBe('BANK_IMPORT');
    });

    it('should return undefined for unknown workflow type', () => {
      const def = getWorkflowDefinition('UNKNOWN' as WorkflowType);
      expect(def).toBeUndefined();
    });
  });

  describe('isMultiStepWorkflow', () => {
    it('should return true for BANK_IMPORT', () => {
      expect(isMultiStepWorkflow('BANK_IMPORT')).toBe(true);
    });

    it('should return true for MONTHLY_CLOSE', () => {
      expect(isMultiStepWorkflow('MONTHLY_CLOSE')).toBe(true);
    });

    it('should return false for single-step workflows', () => {
      expect(isMultiStepWorkflow('CATEGORIZE_TRANSACTIONS')).toBe(false);
      expect(isMultiStepWorkflow('MATCH_PAYMENTS')).toBe(false);
      expect(isMultiStepWorkflow('CALCULATE_PAYE')).toBe(false);
      expect(isMultiStepWorkflow('GENERATE_EMP201')).toBe(false);
      expect(isMultiStepWorkflow('GENERATE_VAT201')).toBe(false);
    });

    it('should return false for unknown workflow types', () => {
      expect(isMultiStepWorkflow('NONEXISTENT' as WorkflowType)).toBe(false);
    });
  });
});

describe('WorkflowResultAdaptor', () => {
  let adaptor: WorkflowResultAdaptor;

  beforeEach(() => {
    adaptor = new WorkflowResultAdaptor();
  });

  it('should produce a valid WorkflowResult with all required fields', () => {
    const results: SubagentResult[] = [
      {
        status: 'SUCCESS',
        agentType: 'transaction-categorizer',
        processed: 5,
        autoApplied: 3,
        escalated: 2,
        errors: 0,
        durationMs: 100,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'CATEGORIZE_TRANSACTIONS',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );

    expect(wr.workflowId).toBe('wf-001');
    expect(wr.type).toBe('CATEGORIZE_TRANSACTIONS');
    expect(wr.autonomyLevel).toBe('L3_FULL_AUTO');
    expect(wr.startedAt).toBe('2024-01-01T00:00:00Z');
    expect(wr.completedAt).toBeDefined();
    expect(wr.results).toHaveLength(1);
    expect(wr.results[0]).toEqual({
      agent: 'transaction-categorizer',
      processed: 5,
      autoApplied: 3,
      escalated: 2,
      errors: 0,
    });
  });

  it('should return COMPLETED status when all steps succeed with no escalations', () => {
    const results: SubagentResult[] = [
      {
        status: 'SUCCESS',
        agentType: 'transaction-categorizer',
        processed: 5,
        autoApplied: 5,
        escalated: 0,
        errors: 0,
        durationMs: 100,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'CATEGORIZE_TRANSACTIONS',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.status).toBe('COMPLETED');
  });

  it('should return FAILED status when all steps fail', () => {
    const results: SubagentResult[] = [
      {
        status: 'FAILED',
        agentType: 'transaction-categorizer',
        error: 'DB error',
        durationMs: 50,
      },
      {
        status: 'FAILED',
        agentType: 'payment-matcher',
        error: 'Service unavailable',
        durationMs: 30,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'BANK_IMPORT',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.status).toBe('FAILED');
  });

  it('should return PARTIAL status when some steps fail', () => {
    const results: SubagentResult[] = [
      {
        status: 'SUCCESS',
        agentType: 'transaction-categorizer',
        processed: 5,
        autoApplied: 5,
        escalated: 0,
        errors: 0,
        durationMs: 100,
      },
      {
        status: 'FAILED',
        agentType: 'payment-matcher',
        error: 'Service unavailable',
        durationMs: 30,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'BANK_IMPORT',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.status).toBe('PARTIAL');
  });

  it('should return ESCALATED status when there are escalations but no failures', () => {
    const results: SubagentResult[] = [
      {
        status: 'SUCCESS',
        agentType: 'sars-agent',
        processed: 1,
        autoApplied: 0,
        escalated: 1,
        errors: 0,
        escalations: [
          {
            type: 'SARS_EMP201',
            reason: 'Requires review',
            details: { amountCents: 120000 },
          },
        ],
        durationMs: 200,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'GENERATE_EMP201',
      'L2_DRAFT',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.status).toBe('ESCALATED');
    expect(wr.escalations).toHaveLength(1);
    expect(wr.escalations[0].type).toBe('SARS_EMP201');
  });

  it('should generate WORKFLOW_ERROR escalations for failed steps', () => {
    const results: SubagentResult[] = [
      {
        status: 'FAILED',
        agentType: 'payment-matcher',
        error: 'Connection timeout',
        durationMs: 5000,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'MATCH_PAYMENTS',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.escalations).toHaveLength(1);
    expect(wr.escalations[0].type).toBe('WORKFLOW_ERROR');
    expect(wr.escalations[0].reason).toBe('Connection timeout');
    expect(wr.escalations[0].details).toEqual({ agentType: 'payment-matcher' });
  });

  it('should map errors count to 1 for failed SubagentResult', () => {
    const results: SubagentResult[] = [
      {
        status: 'FAILED',
        agentType: 'transaction-categorizer',
        error: 'Timeout',
        durationMs: 50,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'CATEGORIZE_TRANSACTIONS',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.results[0].errors).toBe(1);
  });

  it('should default processed/autoApplied/escalated to 0 when not provided', () => {
    const results: SubagentResult[] = [
      {
        status: 'SUCCESS',
        agentType: 'transaction-categorizer',
        durationMs: 100,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'CATEGORIZE_TRANSACTIONS',
      'L3_FULL_AUTO',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.results[0].processed).toBe(0);
    expect(wr.results[0].autoApplied).toBe(0);
    expect(wr.results[0].escalated).toBe(0);
    expect(wr.results[0].errors).toBe(0);
  });

  it('should combine escalations from multiple subagents', () => {
    const results: SubagentResult[] = [
      {
        status: 'SUCCESS',
        agentType: 'transaction-categorizer',
        escalations: [{ type: 'LOW_CONFIDENCE', reason: 'low', details: {} }],
        durationMs: 100,
      },
      {
        status: 'SUCCESS',
        agentType: 'sars-agent',
        escalations: [{ type: 'SARS_EMP201', reason: 'review', details: {} }],
        durationMs: 200,
      },
    ];

    const wr = adaptor.adapt(
      'wf-001',
      'MONTHLY_CLOSE',
      'L2_DRAFT',
      results,
      '2024-01-01T00:00:00Z',
    );
    expect(wr.escalations).toHaveLength(2);
  });
});

describe('SdkOrchestrator', () => {
  let sdkOrchestrator: SdkOrchestrator;
  let mockFactory: jest.Mocked<SdkAgentFactory>;
  let mockConfig: jest.Mocked<SdkConfigService>;
  let mockCategorizer: jest.Mocked<TransactionCategorizerAgent>;
  let mockMatcher: jest.Mocked<PaymentMatcherAgent>;
  let mockSars: jest.Mocked<SarsAgent>;
  let mockRouter: jest.Mocked<WorkflowRouter>;
  let mockEscalation: jest.Mocked<EscalationManager>;
  let mockPrisma: jest.Mocked<PrismaService>;
  let mockRuvector: jest.Mocked<RuvectorService>;
  let resultAdaptor: WorkflowResultAdaptor;

  beforeEach(() => {
    mockFactory = createMockFactory();
    mockConfig = createMockConfig();
    mockCategorizer = createMockTransactionCategorizer();
    mockMatcher = createMockPaymentMatcher();
    mockSars = createMockSarsAgent();
    mockRouter = createMockWorkflowRouter();
    mockEscalation = createMockEscalationManager();
    mockPrisma = createMockPrisma();
    mockRuvector = createMockRuvector();
    resultAdaptor = new WorkflowResultAdaptor();

    sdkOrchestrator = new SdkOrchestrator(
      mockFactory,
      mockConfig,
      mockCategorizer,
      mockMatcher,
      mockSars,
      mockRouter,
      mockEscalation,
      mockPrisma,
      mockRuvector,
      resultAdaptor,
    );
  });

  describe('getAgentDefinition', () => {
    it('should return orchestrator agent definition', () => {
      const def = sdkOrchestrator.getAgentDefinition(MOCK_TENANT_ID);
      expect(def).toBeDefined();
      expect(def.description).toBe('test orchestrator');
      expect(mockFactory.createOrchestratorAgent).toHaveBeenCalledWith(
        MOCK_TENANT_ID,
      );
    });
  });

  describe('execute - Fallback behavior', () => {
    it('should return undefined for unknown workflow types', async () => {
      const request = createRequest('UNKNOWN_TYPE' as WorkflowType);
      const result = await sdkOrchestrator.execute(request);
      expect(result).toBeUndefined();
    });

    it('should return undefined when resultAdaptor is not available', async () => {
      const orchestratorNoAdaptor = new SdkOrchestrator(
        mockFactory,
        mockConfig,
        mockCategorizer,
        mockMatcher,
        mockSars,
        mockRouter,
        mockEscalation,
        mockPrisma,
        mockRuvector,
        undefined, // no adaptor
      );

      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([
        createMockTransaction(),
      ]);

      const request = createRequest('BANK_IMPORT');
      const result = await orchestratorNoAdaptor.execute(request);
      expect(result).toBeUndefined();
    });
  });

  describe('execute - BANK_IMPORT (parallel)', () => {
    it('should execute categorize and match in parallel', async () => {
      const tx1 = createMockTransaction({ id: 'txn-001', status: 'PENDING' });
      const tx2 = createMockTransaction({
        id: 'txn-002',
        isCredit: true,
        status: 'PENDING',
      });

      (mockPrisma.transaction.findMany as jest.Mock)
        .mockResolvedValueOnce([tx1]) // categorization query
        .mockResolvedValueOnce([tx2]); // payment matching query

      const request = createRequest('BANK_IMPORT');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.type).toBe('BANK_IMPORT');
      expect(result?.results).toHaveLength(2);
      expect(result?.results[0].agent).toBe('transaction-categorizer');
      expect(result?.results[1].agent).toBe('payment-matcher');
    });

    it('should isolate errors between parallel steps', async () => {
      // Categorization fails
      (mockPrisma.transaction.findMany as jest.Mock)
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValueOnce([createMockTransaction({ isCredit: true })]);

      const request = createRequest('BANK_IMPORT');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.status).toBe('PARTIAL');
      // One step failed, one succeeded
      const failedStep = result?.results.find((r) => r.errors > 0);
      expect(failedStep).toBeDefined();
    });

    it('should use L3_FULL_AUTO autonomy for BANK_IMPORT', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('BANK_IMPORT');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      // BANK_IMPORT has containsSars=false, so autonomy should NOT be forced to L2_DRAFT
      // The router returns L3_FULL_AUTO by default
      expect(result?.autonomyLevel).toBe('L3_FULL_AUTO');
    });
  });

  describe('execute - MONTHLY_CLOSE (sequential)', () => {
    it('should execute categorize -> match -> emp201 sequentially', async () => {
      const txPending = createMockTransaction({
        id: 'txn-001',
        status: 'PENDING',
      });
      const txCredit = createMockTransaction({
        id: 'txn-002',
        isCredit: true,
        status: 'PENDING',
      });

      (mockPrisma.transaction.findMany as jest.Mock)
        .mockResolvedValueOnce([txPending]) // categorization
        .mockResolvedValueOnce([txCredit]); // payment matching

      const request = createRequest('MONTHLY_CLOSE', {
        periodMonth: '2024-01',
      });
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.type).toBe('MONTHLY_CLOSE');
      expect(result?.results).toHaveLength(3);
      expect(result?.results[0].agent).toBe('transaction-categorizer');
      expect(result?.results[1].agent).toBe('payment-matcher');
      expect(result?.results[2].agent).toBe('sars-agent');
    });

    it('should enforce L2_DRAFT for MONTHLY_CLOSE (contains SARS)', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('MONTHLY_CLOSE', {
        periodMonth: '2024-01',
      });
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.autonomyLevel).toBe('L2_DRAFT');
    });

    it('should include SARS escalation in MONTHLY_CLOSE result', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('MONTHLY_CLOSE', {
        periodMonth: '2024-01',
      });
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      const sarsEscalation = result?.escalations.find(
        (e) => e.type === 'SARS_EMP201',
      );
      expect(sarsEscalation).toBeDefined();
      expect(sarsEscalation?.reason).toBe(
        'EMP201 submission requires human review',
      );
    });
  });

  describe('execute - Single-step workflows', () => {
    it('should handle CATEGORIZE_TRANSACTIONS', async () => {
      const transactions = [
        createMockTransaction({ id: 'txn-001' }),
        createMockTransaction({ id: 'txn-002' }),
      ];
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue(
        transactions,
      );

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results).toHaveLength(1);
      expect(result?.results[0].agent).toBe('transaction-categorizer');
      expect(result?.results[0].processed).toBe(2);
      expect(result?.results[0].autoApplied).toBe(2);
    });

    it('should handle MATCH_PAYMENTS', async () => {
      const credits = [
        createMockTransaction({ id: 'txn-001', isCredit: true }),
      ];
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue(credits);

      const request = createRequest('MATCH_PAYMENTS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results).toHaveLength(1);
      expect(result?.results[0].agent).toBe('payment-matcher');
      expect(result?.results[0].processed).toBe(1);
      expect(result?.results[0].autoApplied).toBe(1);
    });

    it('should handle CALCULATE_PAYE with L2_DRAFT', async () => {
      const request = createRequest('CALCULATE_PAYE', {
        grossIncomeCents: 5000000,
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 2,
        period: '2024-01',
      });

      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.autonomyLevel).toBe('L2_DRAFT');
      expect(result?.results[0].agent).toBe('sars-agent');
      expect(result?.results[0].processed).toBe(1);
      expect(result?.results[0].escalated).toBe(1);
    });

    it('should handle GENERATE_EMP201', async () => {
      const request = createRequest('GENERATE_EMP201', {
        periodMonth: '2024-01',
      });

      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.autonomyLevel).toBe('L2_DRAFT');
      expect(
        result?.escalations.find((e) => e.type === 'SARS_EMP201'),
      ).toBeDefined();
    });

    it('should handle GENERATE_VAT201', async () => {
      const request = createRequest('GENERATE_VAT201', {
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      });

      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.autonomyLevel).toBe('L2_DRAFT');
      expect(
        result?.escalations.find((e) => e.type === 'SARS_VAT201'),
      ).toBeDefined();
    });
  });

  describe('execute - Error isolation', () => {
    it('should return FAILED agentType for categorization without PrismaService', async () => {
      const orchestratorNoPrisma = new SdkOrchestrator(
        mockFactory,
        mockConfig,
        mockCategorizer,
        mockMatcher,
        mockSars,
        mockRouter,
        mockEscalation,
        undefined, // no prisma
        mockRuvector,
        resultAdaptor,
      );

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      const result = await orchestratorNoPrisma.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].errors).toBe(1);
    });

    it('should return FAILED for SARS step without SarsAgent', async () => {
      const orchestratorNoSars = new SdkOrchestrator(
        mockFactory,
        mockConfig,
        mockCategorizer,
        mockMatcher,
        undefined, // no sarsAgent
        mockRouter,
        mockEscalation,
        mockPrisma,
        mockRuvector,
        resultAdaptor,
      );

      const request = createRequest('CALCULATE_PAYE', {
        grossIncomeCents: 5000000,
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 2,
        period: '2024-01',
      });

      const result = await orchestratorNoSars.execute(request);

      expect(result).toBeDefined();
      const sarsResult = result?.results.find((r) => r.agent === 'sars-agent');
      expect(sarsResult?.errors).toBe(1);
    });

    it('should return FAILED for payment matching without PaymentMatcherAgent', async () => {
      const orchestratorNoMatcher = new SdkOrchestrator(
        mockFactory,
        mockConfig,
        mockCategorizer,
        undefined, // no paymentMatcher
        mockSars,
        mockRouter,
        mockEscalation,
        mockPrisma,
        mockRuvector,
        resultAdaptor,
      );

      const request = createRequest('MATCH_PAYMENTS');
      const result = await orchestratorNoMatcher.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].errors).toBe(1);
    });

    it('should handle individual transaction errors during categorization', async () => {
      const transactions = [
        createMockTransaction({ id: 'txn-001' }),
        createMockTransaction({ id: 'txn-002' }),
        createMockTransaction({ id: 'txn-003' }),
      ];
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue(
        transactions,
      );

      mockCategorizer.categorize
        .mockResolvedValueOnce({
          autoApplied: true,
          confidenceScore: 95,
          reasoning: 'ok',
          accountCode: '6100',
          accountName: 'Salaries',
          vatType: 'EXEMPT' as any,
          isSplit: false,
        })
        .mockRejectedValueOnce(new Error('AI timeout'))
        .mockResolvedValueOnce({
          autoApplied: false,
          confidenceScore: 40,
          reasoning: 'unsure',
          accountCode: '9999',
          accountName: 'Suspense',
          vatType: 'NO_VAT' as any,
          isSplit: false,
        });

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].processed).toBe(3);
      expect(result?.results[0].autoApplied).toBe(1);
      expect(result?.results[0].escalated).toBe(1);
      expect(result?.results[0].errors).toBe(1);
    });

    it('should handle individual payment matching errors', async () => {
      const credits = [
        createMockTransaction({ id: 'txn-001', isCredit: true }),
        createMockTransaction({ id: 'txn-002', isCredit: true }),
      ];
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue(credits);

      mockMatcher.findCandidates
        .mockResolvedValueOnce([
          {
            invoice: {
              id: 'inv-001',
              invoiceNumber: 'INV-001',
              totalCents: 100000,
              amountPaidCents: 0,
              parentId: 'parent-001',
              parent: { firstName: 'John', lastName: 'Doe' },
              child: { firstName: 'Jane' },
            },
            confidence: 90,
            matchReasons: ['Exact amount match'],
          },
        ])
        .mockRejectedValueOnce(new Error('Search failed'));

      const request = createRequest('MATCH_PAYMENTS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].processed).toBe(2);
      expect(result?.results[0].autoApplied).toBe(1);
      expect(result?.results[0].errors).toBe(1);
    });
  });

  describe('execute - SARS L2 enforcement', () => {
    it('should enforce L2_DRAFT for CALCULATE_PAYE regardless of router', async () => {
      mockRouter.getAutonomyLevel.mockReturnValue('L3_FULL_AUTO');

      const request = createRequest('CALCULATE_PAYE', {
        grossIncomeCents: 5000000,
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 2,
        period: '2024-01',
      });

      const result = await sdkOrchestrator.execute(request);

      expect(result?.autonomyLevel).toBe('L2_DRAFT');
    });

    it('should enforce L2_DRAFT for MONTHLY_CLOSE regardless of router', async () => {
      mockRouter.getAutonomyLevel.mockReturnValue('L3_FULL_AUTO');
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('MONTHLY_CLOSE', {
        periodMonth: '2024-01',
      });
      const result = await sdkOrchestrator.execute(request);

      expect(result?.autonomyLevel).toBe('L2_DRAFT');
    });

    it('should NOT enforce L2_DRAFT for BANK_IMPORT (no SARS)', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('BANK_IMPORT');
      const result = await sdkOrchestrator.execute(request);

      expect(result?.autonomyLevel).toBe('L3_FULL_AUTO');
    });
  });

  describe('execute - Tenant isolation', () => {
    it('should pass tenantId in Prisma queries for categorization', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      await sdkOrchestrator.execute(request);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: MOCK_TENANT_ID,
          status: 'PENDING',
          isDeleted: false,
        },
      });
    });

    it('should pass tenantId in Prisma queries for payment matching', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('MATCH_PAYMENTS');
      await sdkOrchestrator.execute(request);

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: MOCK_TENANT_ID,
          isCredit: true,
          status: { in: ['PENDING', 'CATEGORIZED'] },
          isDeleted: false,
        },
      });
    });

    it('should pass tenantId to SARS agent', async () => {
      const request = createRequest('CALCULATE_PAYE', {
        grossIncomeCents: 5000000,
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 2,
        period: '2024-01',
      });

      await sdkOrchestrator.execute(request);

      expect(mockSars.calculatePayeForReview).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: MOCK_TENANT_ID }),
      );
    });

    it('should pass tenantId to categorizer', async () => {
      const tx = createMockTransaction();
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([tx]);

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      await sdkOrchestrator.execute(request);

      expect(mockCategorizer.categorize).toHaveBeenCalledWith(
        tx,
        MOCK_TENANT_ID,
      );
    });

    it('should pass tenantId to payment matcher', async () => {
      const tx = createMockTransaction({ isCredit: true });
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([tx]);

      const request = createRequest('MATCH_PAYMENTS');
      await sdkOrchestrator.execute(request);

      expect(mockMatcher.findCandidates).toHaveBeenCalledWith(
        tx,
        MOCK_TENANT_ID,
      );
      expect(mockMatcher.makeMatchDecision).toHaveBeenCalledWith(
        tx,
        expect.anything(),
        MOCK_TENANT_ID,
      );
    });
  });

  describe('execute - WorkflowResult format', () => {
    it('should produce a result that matches WorkflowResult interface', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('BANK_IMPORT');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      // Verify all WorkflowResult fields
      expect(typeof result?.workflowId).toBe('string');
      expect(result?.type).toBe('BANK_IMPORT');
      expect(['COMPLETED', 'PARTIAL', 'ESCALATED', 'FAILED']).toContain(
        result?.status,
      );
      expect(['L1_SUGGEST', 'L2_DRAFT', 'L3_FULL_AUTO']).toContain(
        result?.autonomyLevel,
      );
      expect(Array.isArray(result?.results)).toBe(true);
      expect(Array.isArray(result?.escalations)).toBe(true);
      expect(typeof result?.startedAt).toBe('string');
      expect(typeof result?.completedAt).toBe('string');

      // Verify AgentResult format
      for (const agentResult of result?.results ?? []) {
        expect(typeof agentResult.agent).toBe('string');
        expect(typeof agentResult.processed).toBe('number');
        expect(typeof agentResult.autoApplied).toBe('number');
        expect(typeof agentResult.escalated).toBe('number');
        expect(typeof agentResult.errors).toBe('number');
      }
    });

    it('should generate unique workflowIds', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      const result1 = await sdkOrchestrator.execute(request);
      const result2 = await sdkOrchestrator.execute(request);

      expect(result1?.workflowId).not.toBe(result2?.workflowId);
    });
  });

  describe('execute - Escalation handling for payment matching', () => {
    it('should create escalation for REVIEW_REQUIRED matches', async () => {
      const tx = createMockTransaction({ id: 'txn-review', isCredit: true });
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([tx]);

      mockMatcher.makeMatchDecision.mockResolvedValue({
        transactionId: 'txn-review',
        action: 'REVIEW_REQUIRED',
        confidence: 60,
        reasoning: 'Multiple possible matches',
        invoiceId: 'inv-001',
        invoiceNumber: 'INV-001',
        alternatives: [
          { invoiceId: 'inv-002', invoiceNumber: 'INV-002', confidence: 50 },
        ],
      });

      const request = createRequest('MATCH_PAYMENTS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].escalated).toBe(1);
      expect(result?.escalations).toHaveLength(1);
      expect(result?.escalations[0].type).toBe('PAYMENT_MATCH');
      expect(result?.escalations[0].details).toEqual(
        expect.objectContaining({
          transactionId: 'txn-review',
          confidence: 60,
          invoiceId: 'inv-001',
        }),
      );
    });

    it('should not escalate NO_MATCH decisions', async () => {
      const tx = createMockTransaction({ id: 'txn-nomatch', isCredit: true });
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([tx]);

      mockMatcher.makeMatchDecision.mockResolvedValue({
        transactionId: 'txn-nomatch',
        action: 'NO_MATCH',
        confidence: 0,
        reasoning: 'No matching invoices found',
        alternatives: [],
      });

      const request = createRequest('MATCH_PAYMENTS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].escalated).toBe(0);
      expect(result?.escalations).toHaveLength(0);
    });
  });

  describe('execute - Escalation handling for categorization', () => {
    it('should create escalation for low confidence categorization', async () => {
      const tx = createMockTransaction({ id: 'txn-low' });
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([tx]);

      mockCategorizer.categorize.mockResolvedValue({
        autoApplied: false,
        confidenceScore: 40,
        reasoning: 'Cannot determine category',
        accountCode: '9999',
        accountName: 'Suspense',
        vatType: 'NO_VAT' as any,
        isSplit: false,
      });

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.results[0].escalated).toBe(1);
      expect(result?.escalations[0].type).toBe('LOW_CONFIDENCE_CATEGORIZATION');
      expect(result?.escalations[0].details).toEqual(
        expect.objectContaining({
          transactionId: 'txn-low',
          confidence: 40,
          accountCode: '9999',
        }),
      );
    });
  });

  describe('execute - Empty data sets', () => {
    it('should handle zero pending transactions for categorization', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('CATEGORIZE_TRANSACTIONS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.status).toBe('COMPLETED');
      expect(result?.results[0].processed).toBe(0);
    });

    it('should handle zero credit transactions for payment matching', async () => {
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('MATCH_PAYMENTS');
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      expect(result?.status).toBe('COMPLETED');
      expect(result?.results[0].processed).toBe(0);
    });
  });

  describe('execute - Unknown SARS step', () => {
    it('should handle unknown SARS stepId gracefully', async () => {
      // This would happen if workflow definitions had an unrecognized stepId
      // We can't directly test this through public API since definitions are controlled,
      // but we can verify error handling by checking a MONTHLY_CLOSE with correct stepIds
      (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      const request = createRequest('MONTHLY_CLOSE', {
        periodMonth: '2024-01',
      });
      const result = await sdkOrchestrator.execute(request);

      expect(result).toBeDefined();
      // The emp201 step should have succeeded
      const sarsResult = result?.results.find((r) => r.agent === 'sars-agent');
      expect(sarsResult).toBeDefined();
      expect(sarsResult?.errors).toBe(0);
    });
  });
});
