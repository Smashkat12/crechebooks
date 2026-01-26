/**
 * Orchestrator Agent Tests
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * CRITICAL: Tests use REAL PostgreSQL database - NO MOCKS.
 */
jest.setTimeout(30000);
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { OrchestratorAgent } from '../../../src/agents/orchestrator/orchestrator.agent';
import { WorkflowRouter } from '../../../src/agents/orchestrator/workflow-router';
import { EscalationManager } from '../../../src/agents/orchestrator/escalation-manager';
import { TransactionCategorizerAgent } from '../../../src/agents/transaction-categorizer/categorizer.agent';
import { PaymentMatcherAgent } from '../../../src/agents/payment-matcher/matcher.agent';
import { SarsAgent } from '../../../src/agents/sars-agent/sars.agent';
import { SarsDecisionLogger } from '../../../src/agents/sars-agent/decision-logger';
import { SarsContextValidator } from '../../../src/agents/sars-agent/context-validator';
import { ContextLoader } from '../../../src/agents/transaction-categorizer/context-loader';
import { PatternMatcher } from '../../../src/agents/transaction-categorizer/pattern-matcher';
import { ConfidenceScorer } from '../../../src/agents/transaction-categorizer/confidence-scorer';
import { DecisionLogger } from '../../../src/agents/transaction-categorizer/decision-logger';
import { MatchDecisionLogger } from '../../../src/agents/payment-matcher/decision-logger';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayeService } from '../../../src/database/services/paye.service';
import { UifService } from '../../../src/database/services/uif.service';
import { Emp201Service } from '../../../src/database/services/emp201.service';
import { Vat201Service } from '../../../src/database/services/vat201.service';
import { VatAdjustmentService } from '../../../src/database/services/vat-adjustment.service';
import { VatService } from '../../../src/database/services/vat.service';
import { Tenant, TaxStatus, TransactionStatus } from '@prisma/client';

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;
  let workflowRouter: WorkflowRouter;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [
        PrismaService,
        OrchestratorAgent,
        WorkflowRouter,
        EscalationManager,
        TransactionCategorizerAgent,
        PaymentMatcherAgent,
        SarsAgent,
        SarsDecisionLogger,
        SarsContextValidator,
        ContextLoader,
        PatternMatcher,
        ConfidenceScorer,
        DecisionLogger,
        MatchDecisionLogger,
        PayeService,
        UifService,
        Emp201Service,
        Vat201Service,
        VatAdjustmentService,
        VatService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    orchestrator = module.get<OrchestratorAgent>(OrchestratorAgent);
    workflowRouter = module.get<WorkflowRouter>(WorkflowRouter);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean up test data using TRUNCATE CASCADE to handle all FK constraints
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE tenants CASCADE`);

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Orchestrator Test Creche',
        email: 'orchestrator-test@creche.co.za',
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '0211234567',
      },
    });
  }, 15000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('WorkflowRouter', () => {
    it('should return L3 for CATEGORIZE_TRANSACTIONS', () => {
      const level = workflowRouter.getAutonomyLevel('CATEGORIZE_TRANSACTIONS');
      expect(level).toBe('L3_FULL_AUTO');
    });

    it('should return L3 for MATCH_PAYMENTS', () => {
      const level = workflowRouter.getAutonomyLevel('MATCH_PAYMENTS');
      expect(level).toBe('L3_FULL_AUTO');
    });

    it('should return L2 for all SARS workflows', () => {
      expect(workflowRouter.getAutonomyLevel('CALCULATE_PAYE')).toBe(
        'L2_DRAFT',
      );
      expect(workflowRouter.getAutonomyLevel('GENERATE_EMP201')).toBe(
        'L2_DRAFT',
      );
      expect(workflowRouter.getAutonomyLevel('GENERATE_VAT201')).toBe(
        'L2_DRAFT',
      );
    });

    it('should return L2 for MONTHLY_CLOSE', () => {
      const level = workflowRouter.getAutonomyLevel('MONTHLY_CLOSE');
      expect(level).toBe('L2_DRAFT');
    });

    it('should identify SARS workflows', () => {
      expect(workflowRouter.isSarsWorkflow('CALCULATE_PAYE')).toBe(true);
      expect(workflowRouter.isSarsWorkflow('GENERATE_EMP201')).toBe(true);
      expect(workflowRouter.isSarsWorkflow('CATEGORIZE_TRANSACTIONS')).toBe(
        false,
      );
    });

    it('should list available workflows', () => {
      const workflows = workflowRouter.getAvailableWorkflows();
      expect(workflows).toContain('CATEGORIZE_TRANSACTIONS');
      expect(workflows).toContain('MATCH_PAYMENTS');
      expect(workflows).toContain('BANK_IMPORT');
      expect(workflows).toContain('MONTHLY_CLOSE');
    });
  });

  describe('executeWorkflow - CATEGORIZE_TRANSACTIONS', () => {
    it('should execute CATEGORIZE workflow with correct autonomy', async () => {
      // Create test transactions
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'test-account',
            date: new Date(),
            description: 'WOOLWORTHS GROCERY STORE',
            amountCents: 150000,
            isCredit: false,
            source: 'MANUAL',
            status: TransactionStatus.PENDING,
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'test-account',
            date: new Date(),
            description: 'SALARY PAYMENT',
            amountCents: 2000000,
            isCredit: false,
            source: 'MANUAL',
            status: TransactionStatus.PENDING,
          },
        ],
      });

      const result = await orchestrator.executeWorkflow({
        type: 'CATEGORIZE_TRANSACTIONS',
        tenantId: testTenant.id,
        parameters: {},
      });

      expect(result.autonomyLevel).toBe('L3_FULL_AUTO');
      expect(
        result.results.some((r) => r.agent === 'transaction-categorizer'),
      ).toBe(true);
      expect(result.results[0].processed).toBe(2);
    });
  });

  describe('executeWorkflow - MATCH_PAYMENTS', () => {
    it('should execute MATCH_PAYMENTS workflow', async () => {
      // Create parent, child, fee structure for invoice
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.co.za',
          phone: '0821234567',
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: new Date('2020-01-15'),
        },
      });

      const feeStructure = await prisma.feeStructure.create({
        data: {
          tenantId: testTenant.id,
          name: 'Test Fee',
          feeType: 'FULL_DAY',
          amountCents: 500000,
          effectiveFrom: new Date('2025-01-01'),
        },
      });

      await prisma.enrollment.create({
        data: {
          tenantId: testTenant.id,
          childId: child.id,
          feeStructureId: feeStructure.id,
          startDate: new Date('2025-01-01'),
        },
      });

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          childId: child.id,
          invoiceNumber: 'INV-001',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 500000,
          totalCents: 500000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      // Create credit transaction
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'test-account',
          date: new Date(),
          description: 'PAYMENT JOHN DOE',
          reference: 'INV-001',
          amountCents: 500000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.PENDING,
        },
      });

      const result = await orchestrator.executeWorkflow({
        type: 'MATCH_PAYMENTS',
        tenantId: testTenant.id,
        parameters: {},
      });

      expect(result.autonomyLevel).toBe('L3_FULL_AUTO');
      expect(result.results.some((r) => r.agent === 'payment-matcher')).toBe(
        true,
      );
      expect(result.results[0].processed).toBe(1);
    });
  });

  describe('executeWorkflow - BANK_IMPORT', () => {
    it('should execute both categorization and matching', async () => {
      const result = await orchestrator.executeWorkflow({
        type: 'BANK_IMPORT',
        tenantId: testTenant.id,
        parameters: {},
      });

      expect(result.autonomyLevel).toBe('L3_FULL_AUTO');
      // Should have results from both agents
      expect(result.results.length).toBe(2);
      expect(result.results.map((r) => r.agent)).toContain(
        'transaction-categorizer',
      );
      expect(result.results.map((r) => r.agent)).toContain('payment-matcher');
    });
  });

  describe('executeWorkflow - GENERATE_EMP201', () => {
    it('should ALWAYS return L2_DRAFT and ESCALATED for EMP201', async () => {
      // Create staff and payroll data required for EMP201
      const staff = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Employee',
          idNumber: '9001015800083',
          dateOfBirth: new Date('1990-01-01'),
          email: 'employee@test.co.za',
          phone: '0821234567',
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          basicSalaryCents: 2000000,
          payFrequency: 'MONTHLY',
          isActive: true,
        },
      });

      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: staff.id,
          payPeriodStart: new Date(2025, 0, 1), // Jan 1, 2025 local time (matches service query)
          payPeriodEnd: new Date(2025, 0, 31), // Jan 31, 2025 local time
          basicSalaryCents: 2000000,
          grossSalaryCents: 2000000,
          payeCents: 200000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
          netSalaryCents: 1782288,
          status: 'APPROVED',
        },
      });

      const result = await orchestrator.executeWorkflow({
        type: 'GENERATE_EMP201',
        tenantId: testTenant.id,
        parameters: { periodMonth: '2025-01' },
      });

      expect(result.autonomyLevel).toBe('L2_DRAFT');
      expect(result.status).toBe('ESCALATED');
      expect(result.results.some((r) => r.agent === 'sars-agent')).toBe(true);
      expect(result.escalations.some((e) => e.type === 'SARS_EMP201')).toBe(
        true,
      );
    });
  });

  describe('executeWorkflow - SARS workflows always escalate', () => {
    it('should always escalate PAYE calculations', async () => {
      const result = await orchestrator.executeWorkflow({
        type: 'CALCULATE_PAYE',
        tenantId: testTenant.id,
        parameters: {
          grossIncomeCents: 2500000,
          payFrequency: 'MONTHLY',
          dateOfBirth: new Date('1990-01-15'),
          medicalAidMembers: 2,
          period: '2025-01',
        },
      });

      expect(result.autonomyLevel).toBe('L2_DRAFT');
      expect(result.status).toBe('ESCALATED');
      expect(result.escalations.some((e) => e.type === 'SARS_PAYE')).toBe(true);
    });

    it('should always escalate VAT201', async () => {
      const result = await orchestrator.executeWorkflow({
        type: 'GENERATE_VAT201',
        tenantId: testTenant.id,
        parameters: {
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
        },
      });

      expect(result.autonomyLevel).toBe('L2_DRAFT');
      expect(result.status).toBe('ESCALATED');
      expect(result.escalations.some((e) => e.type === 'SARS_VAT201')).toBe(
        true,
      );
    });
  });

  describe('executeWorkflow - MONTHLY_CLOSE', () => {
    it('should execute all agents and escalate', async () => {
      // Create staff and payroll data required for MONTHLY_CLOSE (EMP201)
      const staff = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Monthly',
          lastName: 'Employee',
          idNumber: '9002025800084',
          dateOfBirth: new Date('1990-02-02'),
          email: 'monthly@test.co.za',
          phone: '0821234568',
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          basicSalaryCents: 1800000,
          payFrequency: 'MONTHLY',
          isActive: true,
        },
      });

      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: staff.id,
          payPeriodStart: new Date(2025, 0, 1), // Jan 1, 2025 local time (matches service query)
          payPeriodEnd: new Date(2025, 0, 31), // Jan 31, 2025 local time
          basicSalaryCents: 1800000,
          grossSalaryCents: 1800000,
          payeCents: 180000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
          netSalaryCents: 1602288,
          status: 'APPROVED',
        },
      });

      const result = await orchestrator.executeWorkflow({
        type: 'MONTHLY_CLOSE',
        tenantId: testTenant.id,
        parameters: { periodMonth: '2025-01' },
      });

      expect(result.autonomyLevel).toBe('L2_DRAFT');
      expect(result.status).toBe('ESCALATED');

      // Should have run multiple agents
      const agents = result.results.map((r) => r.agent);
      expect(agents).toContain('transaction-categorizer');
      expect(agents).toContain('payment-matcher');
      expect(agents).toContain('sars-agent');

      // Should have monthly close escalation
      expect(result.escalations.some((e) => e.type === 'MONTHLY_CLOSE')).toBe(
        true,
      );
    });
  });

  describe('Error handling', () => {
    it('should throw for unknown workflow type', async () => {
      await expect(
        orchestrator.executeWorkflow({
          type: 'UNKNOWN_WORKFLOW' as any,
          tenantId: testTenant.id,
          parameters: {},
        }),
      ).rejects.toThrow('Unknown workflow type: UNKNOWN_WORKFLOW');
    });
  });

  describe('Escalation summary', () => {
    it('should track pending escalations', async () => {
      // Generate some escalations
      await orchestrator.executeWorkflow({
        type: 'GENERATE_EMP201',
        tenantId: testTenant.id,
        parameters: { periodMonth: '2025-01' },
      });

      const summary = await orchestrator.getEscalationSummary(testTenant.id);
      expect(summary.size).toBeGreaterThan(0);
    });
  });
});
