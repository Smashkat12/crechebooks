/**
 * SARS Agent Tests
 * TASK-AGENT-004: SARS Calculation Agent
 *
 * CRITICAL: Tests use REAL PostgreSQL database - NO MOCKS.
 * All SARS calculations must ALWAYS return requiresReview: true.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SarsAgent } from '../../../src/agents/sars-agent/sars.agent';
import { SarsDecisionLogger } from '../../../src/agents/sars-agent/decision-logger';
import { SarsContextValidator } from '../../../src/agents/sars-agent/context-validator';
import { PayeService } from '../../../src/database/services/paye.service';
import { UifService } from '../../../src/database/services/uif.service';
import { Emp201Service } from '../../../src/database/services/emp201.service';
import { Vat201Service } from '../../../src/database/services/vat201.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { VatService } from '../../../src/database/services/vat.service';
import { Tenant, TaxStatus } from '@prisma/client';

describe('SarsAgent', () => {
  let agent: SarsAgent;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let contextValidator: SarsContextValidator;

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
        SarsAgent,
        SarsDecisionLogger,
        SarsContextValidator,
        PayeService,
        UifService,
        Emp201Service,
        Vat201Service,
        VatService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    agent = module.get<SarsAgent>(SarsAgent);
    contextValidator = module.get<SarsContextValidator>(SarsContextValidator);

    // Initialize context
    await contextValidator.loadContext();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'SARS Agent Test Creche',
        email: 'sars-test@creche.co.za',
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '0211234567',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('calculatePayeForReview()', () => {
    it('should ALWAYS return requiresReview: true for PAYE', async () => {
      const decision = await agent.calculatePayeForReview({
        tenantId: testTenant.id,
        grossIncomeCents: 2500000, // R25,000
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-15'),
        medicalAidMembers: 2,
        period: '2025-01',
      });

      expect(decision.type).toBe('PAYE');
      expect(decision.action).toBe('DRAFT_FOR_REVIEW');
      expect(decision.requiresReview).toBe(true);
      expect(decision.calculatedAmountCents).toBeGreaterThanOrEqual(0);
      expect(decision.reasoning).toContain('PAYE');
    });

    it('should calculate correct PAYE for standard salary', async () => {
      const decision = await agent.calculatePayeForReview({
        tenantId: testTenant.id,
        grossIncomeCents: 2000000, // R20,000/month = R240,000/year
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-05-20'),
        medicalAidMembers: 0,
        period: '2025-02',
      });

      // Annual income R240,000 is in bracket 2 (26% rate)
      // Expected annual tax roughly: R42,678 + (R240,000 - R237,100) * 26% = ~R43,432
      // After primary rebate R17,600 = ~R25,832 annual = ~R2,153/month
      expect(decision.calculatedAmountCents).toBeGreaterThan(100000); // > R1,000
      expect(decision.calculatedAmountCents).toBeLessThan(400000); // < R4,000
      expect(decision.breakdown).toBeDefined();
      expect(decision.breakdown?.grossAmountCents).toBe(2000000);
    });

    it('should apply age rebates correctly for senior citizens', async () => {
      // Calculate for person over 65
      const seniorDecision = await agent.calculatePayeForReview({
        tenantId: testTenant.id,
        grossIncomeCents: 2500000, // R25,000
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1955-01-15'), // Age 70
        medicalAidMembers: 1,
        period: '2025-03',
      });

      // Calculate for person under 65 with same income
      const juniorDecision = await agent.calculatePayeForReview({
        tenantId: testTenant.id,
        grossIncomeCents: 2500000, // R25,000
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-15'), // Age 35
        medicalAidMembers: 1,
        period: '2025-03',
      });

      // Senior should pay less due to secondary rebate
      expect(seniorDecision.calculatedAmountCents).toBeLessThan(
        juniorDecision.calculatedAmountCents,
      );
      expect(seniorDecision.requiresReview).toBe(true);
      expect(juniorDecision.requiresReview).toBe(true);
    });

    it('should return zero PAYE for income below threshold', async () => {
      const decision = await agent.calculatePayeForReview({
        tenantId: testTenant.id,
        grossIncomeCents: 700000, // R7,000/month = R84,000/year (below R95,400 threshold)
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1990-01-15'),
        medicalAidMembers: 0,
        period: '2025-04',
      });

      expect(decision.calculatedAmountCents).toBe(0);
      expect(decision.requiresReview).toBe(true);
    });
  });

  describe('calculateUifForReview()', () => {
    it('should ALWAYS return requiresReview: true for UIF', async () => {
      const decision = await agent.calculateUifForReview({
        tenantId: testTenant.id,
        grossRemunerationCents: 1500000, // R15,000
        period: '2025-01',
      });

      expect(decision.type).toBe('UIF');
      expect(decision.action).toBe('DRAFT_FOR_REVIEW');
      expect(decision.requiresReview).toBe(true);
    });

    it('should calculate UIF at 2% total rate', async () => {
      const decision = await agent.calculateUifForReview({
        tenantId: testTenant.id,
        grossRemunerationCents: 1000000, // R10,000
        period: '2025-02',
      });

      // UIF = 1% employee + 1% employer = 2% total
      // R10,000 * 2% = R200 = 20,000 cents
      expect(decision.calculatedAmountCents).toBe(20000);
      expect(decision.breakdown?.uifCents).toBe(20000);
    });

    it('should cap UIF at maximum contribution', async () => {
      const decision = await agent.calculateUifForReview({
        tenantId: testTenant.id,
        grossRemunerationCents: 5000000, // R50,000 (above R17,712 cap)
        period: '2025-03',
      });

      // Maximum UIF = R177.12 * 2 = R354.24 = 35424 cents
      expect(decision.calculatedAmountCents).toBe(35424);
      expect(decision.reasoning).toContain('capped');
    });
  });

  describe('generateEmp201ForReview()', () => {
    it('should ALWAYS return requiresReview: true for EMP201', async () => {
      // Create staff and payroll records first
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

      const decision = await agent.generateEmp201ForReview({
        tenantId: testTenant.id,
        periodMonth: '2025-01',
      });

      expect(decision.type).toBe('EMP201');
      expect(decision.action).toBe('DRAFT_FOR_REVIEW');
      expect(decision.requiresReview).toBe(true);
      expect(decision.reasoning).toContain('EMP201');
      expect(decision.reasoning).toContain('2025-01');
    });
  });

  describe('generateVat201ForReview()', () => {
    it('should ALWAYS return requiresReview: true for VAT201', async () => {
      const decision = await agent.generateVat201ForReview({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(decision.type).toBe('VAT201');
      expect(decision.action).toBe('DRAFT_FOR_REVIEW');
      expect(decision.requiresReview).toBe(true);
      expect(decision.reasoning).toContain('VAT201');
    });

    it('should include output and input VAT in breakdown', async () => {
      const decision = await agent.generateVat201ForReview({
        tenantId: testTenant.id,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
      });

      expect(decision.breakdown).toBeDefined();
      expect(decision.breakdown?.outputVatCents).toBeDefined();
      expect(decision.breakdown?.inputVatCents).toBeDefined();
    });
  });

  describe('SarsContextValidator', () => {
    it('should load SARS tables context', () => {
      const context = contextValidator.getContext();
      expect(context.version).toBe('2025');
      expect(context.paye.taxBrackets.length).toBe(7);
      expect(context.vat.standardRate).toBe(0.15);
    });

    it('should return correct VAT rate', () => {
      const rate = contextValidator.getVatRate();
      expect(rate).toBe(0.15);
    });

    it('should return correct UIF rates', () => {
      const rates = contextValidator.getUifRates();
      expect(rates.employeeRate).toBe(0.01);
      expect(rates.employerRate).toBe(0.01);
      expect(rates.maxContributionCents).toBe(17712);
    });

    it('should return correct rebate amounts', () => {
      expect(contextValidator.getPrimaryRebateCents()).toBe(1760000);
      expect(contextValidator.getSecondaryRebateCents()).toBe(975000);
      expect(contextValidator.getTertiaryRebateCents()).toBe(325500);
    });

    it('should validate correct PAYE calculation', () => {
      // Income in bracket 1: R100,000/year, tax = 18% = R18,000
      const result = contextValidator.validatePayeCalculation(10000000, 1800000);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should validate correct UIF calculation', () => {
      // R10,000 gross * 2% = R200 total
      const result = contextValidator.validateUifCalculation(1000000, 20000);
      expect(result.isValid).toBe(true);
    });

    it('should flag incorrect UIF calculation', () => {
      // R10,000 gross * 2% should be R200, not R300
      const result = contextValidator.validateUifCalculation(1000000, 30000);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('All SARS decisions must require review', () => {
    it('should never auto-apply any SARS calculation', async () => {
      const payeDecision = await agent.calculatePayeForReview({
        tenantId: testTenant.id,
        grossIncomeCents: 5000000,
        payFrequency: 'MONTHLY',
        dateOfBirth: new Date('1985-06-15'),
        medicalAidMembers: 3,
        period: '2025-05',
      });

      const uifDecision = await agent.calculateUifForReview({
        tenantId: testTenant.id,
        grossRemunerationCents: 5000000,
        period: '2025-05',
      });

      // All SARS decisions MUST have these properties
      for (const decision of [payeDecision, uifDecision]) {
        expect(decision.action).toBe('DRAFT_FOR_REVIEW');
        expect(decision.requiresReview).toBe(true);
      }
    });
  });
});
