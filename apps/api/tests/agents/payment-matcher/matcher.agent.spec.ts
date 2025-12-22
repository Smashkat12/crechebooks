/**
 * Payment Matcher Agent Tests
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * CRITICAL: Uses REAL PostgreSQL database - NO MOCKS
 * ALL monetary values in CENTS (integers)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PaymentMatcherAgent } from '../../../src/agents/payment-matcher/matcher.agent';
import { MatchDecisionLogger } from '../../../src/agents/payment-matcher/decision-logger';
import { Tenant, Parent, Child, Invoice, Transaction } from '@prisma/client';

describe('PaymentMatcherAgent', () => {
  let agent: PaymentMatcherAgent;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [PrismaService, PaymentMatcherAgent, MatchDecisionLogger],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    agent = module.get<PaymentMatcherAgent>(PaymentMatcherAgent);
  });

  beforeEach(async () => {
    // Clean up test data in correct order (respecting foreign keys)
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({
      where: { email: { contains: 'matcher-test' } },
    });
    await prisma.tenant.deleteMany({
      where: { email: { contains: 'matcher-test' } },
    });

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Matcher Test Creche',
        email: 'matcher-test@creche.co.za',
        taxStatus: 'VAT_REGISTERED',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '0211234567',
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.matcher-test@example.com',
        phone: '0821234567',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: new Date('2021-03-15'),
        parentId: testParent.id,
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({
      where: { email: { contains: 'matcher-test' } },
    });
    await prisma.tenant.deleteMany({
      where: { email: { contains: 'matcher-test' } },
    });
    await prisma.$disconnect();
  });

  describe('findCandidates()', () => {
    it('should find invoice with exact reference match', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-001',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'DEPOSIT',
          reference: 'INV-2025-001',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].invoice.id).toBe(invoice.id);
      expect(candidates[0].confidence).toBeGreaterThanOrEqual(80);
      expect(candidates[0].matchReasons).toContain('Exact reference match');
      expect(candidates[0].matchReasons).toContain('Exact amount match');
    });

    it('should find invoice with partial reference match', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-002',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 350000,
          totalCents: 350000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 350000,
          isCredit: true,
          description: 'SCHOOL FEE PAYMENT INV-2025-002 SMITH',
          reference: 'SCHOOL FEE INV-2025-002',
          payeeName: 'J SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].invoice.id).toBe(invoice.id);
      expect(candidates[0].matchReasons).toContain(
        'Reference contains invoice number',
      );
    });

    it('should find invoice with amount match only', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-003',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 425000,
          totalCents: 425000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 425000,
          isCredit: true,
          description: 'DEPOSIT',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].invoice.id).toBe(invoice.id);
      expect(candidates[0].matchReasons).toContain('Exact amount match');
      expect(candidates[0].matchReasons).toContain('Exact name match');
    });

    it('should match within 1% tolerance', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-004',
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

      // Payment slightly different (within 1%)
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 503000, // R50 difference on R5000 = 1%
          isCredit: true,
          description: 'DEPOSIT',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].matchReasons).toContain('Amount within 1% or R1');
    });

    it('should exclude fully paid invoices', async () => {
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-005',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 400000, // Fully paid
          status: 'PAID',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'DEPOSIT',
          reference: 'INV-2025-005',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(0);
    });

    it('should handle partial payments', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-006',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 200000, // Half paid
          status: 'PARTIALLY_PAID',
        },
      });

      // Payment for remaining amount
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 200000,
          isCredit: true,
          description: 'DEPOSIT',
          reference: 'INV-2025-006',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].invoice.id).toBe(invoice.id);
      expect(candidates[0].matchReasons).toContain('Exact amount match');
    });

    it('should enforce tenant isolation', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          email: 'other.matcher-test@creche.co.za',
          taxStatus: 'VAT_REGISTERED',
          addressLine1: '456 Other Street',
          city: 'Johannesburg',
          province: 'Gauteng',
          postalCode: '2000',
          phone: '0111234567',
        },
      });

      const otherParent = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane.matcher-test@example.com',
          phone: '0829876543',
        },
      });

      const otherChild = await prisma.child.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Tom',
          lastName: 'Doe',
          dateOfBirth: new Date('2020-06-01'),
          parentId: otherParent.id,
        },
      });

      await prisma.invoice.create({
        data: {
          tenantId: otherTenant.id,
          parentId: otherParent.id,
          childId: otherChild.id,
          invoiceNumber: 'INV-OTHER-001',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'DEPOSIT',
          reference: 'INV-OTHER-001',
          payeeName: 'JANE DOE',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      // Should NOT find other tenant's invoice
      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(0);
    });
  });

  describe('makeMatchDecision()', () => {
    it('should AUTO_APPLY single high-confidence match', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-010',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'DEPOSIT',
          reference: 'INV-2025-010',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);
      const decision = await agent.makeMatchDecision(
        transaction,
        candidates,
        testTenant.id,
      );

      expect(decision.action).toBe('AUTO_APPLY');
      expect(decision.invoiceId).toBe(invoice.id);
      expect(decision.confidence).toBeGreaterThanOrEqual(80);
      expect(decision.reasoning).toContain('Exact reference match');
    });

    it('should REVIEW_REQUIRED for multiple high-confidence matches', async () => {
      // Create two invoices with same amount
      const invoice1 = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-011',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const invoice2 = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-012',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      // Transaction matches both invoices by amount (40) + name (20) = 60% each
      // Use custom threshold of 55 so both are "high confidence" → triggers ambiguous logic
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'SCHOOL FEE PAYMENT',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);
      // Use custom threshold of 55 so both 60% matches are "high confidence"
      const decision = await agent.makeMatchDecision(
        transaction,
        candidates,
        testTenant.id,
        55, // Custom threshold - both invoices at 60% will be high confidence
      );

      expect(decision.action).toBe('REVIEW_REQUIRED');
      expect(decision.reasoning).toContain('Ambiguous');
      expect(decision.alternatives.length).toBeGreaterThanOrEqual(1);
    });

    it('should REVIEW_REQUIRED for low-confidence match', async () => {
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-013',
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

      // Transaction with amount within 10% (25 pts) and weak name match (5 pts)
      // Total ~30 pts - enough to be a candidate (>=20) but not auto-apply (>=80)
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 470000, // Within 10% of 500000 (15 pts) + partial payment
          isCredit: true,
          description: 'DEPOSIT',
          payeeName: 'J SMITH', // Similar to JOHN SMITH for weak match
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);
      const decision = await agent.makeMatchDecision(
        transaction,
        candidates,
        testTenant.id,
      );

      expect(decision.action).toBe('REVIEW_REQUIRED');
      expect(decision.confidence).toBeLessThan(80);
      expect(decision.reasoning).toContain('below threshold');
    });

    it('should NO_MATCH when no candidates found', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 999999,
          isCredit: true,
          description: 'RANDOM DEPOSIT',
          payeeName: 'UNKNOWN PERSON',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);
      const decision = await agent.makeMatchDecision(
        transaction,
        candidates,
        testTenant.id,
      );

      expect(decision.action).toBe('NO_MATCH');
      expect(decision.confidence).toBe(0);
      expect(decision.reasoning).toContain('No matching invoices');
    });

    it('should respect custom threshold', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-014',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 400000,
          totalCents: 400000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      // Transaction with amount match only (~60 points)
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'DEPOSIT',
          payeeName: 'DIFFERENT NAME', // Won't match
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      // With high threshold (90), should need review
      const highThresholdDecision = await agent.makeMatchDecision(
        transaction,
        candidates,
        testTenant.id,
        90,
      );
      expect(highThresholdDecision.action).toBe('REVIEW_REQUIRED');

      // With low threshold (40), should auto-apply
      const lowThresholdDecision = await agent.makeMatchDecision(
        transaction,
        candidates,
        testTenant.id,
        40,
      );
      expect(lowThresholdDecision.action).toBe('AUTO_APPLY');
    });
  });

  describe('name similarity scoring', () => {
    it('should give high score for exact name match', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-020',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 100000,
          isCredit: true,
          description: 'DEPOSIT',
          payeeName: 'JOHN SMITH', // Exact match
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].matchReasons).toContain('Exact name match');
    });

    it('should give good score for similar name', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-021',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 100000,
          isCredit: true,
          description: 'DEPOSIT',
          payeeName: 'J SMITH', // Similar to "John Smith"
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      // Should have some name similarity score
      const hasNameSimilarity = candidates[0].matchReasons.some((r) =>
        r.toLowerCase().includes('name'),
      );
      expect(hasNameSimilarity).toBe(true);
    });
  });

  describe('reference suffix matching', () => {
    it('should match invoice suffix in reference', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          parentId: testParent.id,
          childId: testChild.id,
          invoiceNumber: 'INV-2025-030',
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 300000,
          totalCents: 300000,
          amountPaidCents: 0,
          status: 'SENT',
        },
      });

      // Reference ends with invoice suffix (last 4 chars of normalized invoice number)
      // Invoice: 'INV-2025-030' → normalized: 'inv2025030' → last 4: '5030'
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 300000,
          isCredit: true,
          description: 'DEPOSIT',
          reference: 'SCHOOL FEES 5030', // Ends with "5030" matching invoice suffix
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const candidates = await agent.findCandidates(transaction, testTenant.id);

      expect(candidates.length).toBe(1);
      expect(candidates[0].matchReasons).toContain(
        'Reference ends with invoice suffix',
      );
    });
  });
});

describe('MatchDecisionLogger', () => {
  let logger: MatchDecisionLogger;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MatchDecisionLogger],
    }).compile();

    logger = module.get<MatchDecisionLogger>(MatchDecisionLogger);
  });

  it('should log decision without throwing', async () => {
    await expect(
      logger.logDecision({
        tenantId: 'test-tenant-id',
        transactionId: 'test-transaction-id',
        transactionAmountCents: 400000,
        decision: 'match',
        invoiceId: 'test-invoice-id',
        invoiceNumber: 'INV-2025-001',
        confidence: 95,
        autoApplied: true,
        reasoning: 'Exact reference match; Exact amount match',
        candidateCount: 1,
      }),
    ).resolves.not.toThrow();
  });

  it('should log escalation without throwing', async () => {
    await expect(
      logger.logEscalation(
        'test-tenant-id',
        'test-transaction-id',
        'AMBIGUOUS_MATCH',
        '2 invoices with confidence >= 80%',
        ['uuid1', 'uuid2'],
        ['INV-2025-001', 'INV-2025-002'],
      ),
    ).resolves.not.toThrow();
  });
});
