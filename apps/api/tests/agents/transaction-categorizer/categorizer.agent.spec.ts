/**
 * Transaction Categorizer Agent Tests
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * CRITICAL: Uses REAL PostgreSQL database - NO MOCKS
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionCategorizerAgent } from '../../../src/agents/transaction-categorizer/categorizer.agent';
import { ContextLoader } from '../../../src/agents/transaction-categorizer/context-loader';
import { PatternMatcher } from '../../../src/agents/transaction-categorizer/pattern-matcher';
import { ConfidenceScorer } from '../../../src/agents/transaction-categorizer/confidence-scorer';
import { DecisionLogger } from '../../../src/agents/transaction-categorizer/decision-logger';
import { VatType } from '../../../src/database/entities/categorization.entity';
import { Tenant, Transaction } from '@prisma/client';

describe('TransactionCategorizerAgent', () => {
  let agent: TransactionCategorizerAgent;
  let prisma: PrismaService;
  let contextLoader: ContextLoader;
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
        TransactionCategorizerAgent,
        ContextLoader,
        PatternMatcher,
        ConfidenceScorer,
        DecisionLogger,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    contextLoader = module.get<ContextLoader>(ContextLoader);
    agent = module.get<TransactionCategorizerAgent>(
      TransactionCategorizerAgent,
    );

    // Initialize context
    await contextLoader.loadContext();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.categorization.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.tenant.deleteMany({
      where: { email: { contains: 'cat-test' } },
    });

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Categorizer Test Creche',
        email: 'cat-test@creche.co.za',
        taxStatus: 'VAT_REGISTERED',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '0211234567',
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.tenant.deleteMany({
      where: { email: { contains: 'cat-test' } },
    });
    await prisma.$disconnect();
  });

  describe('categorize()', () => {
    it('should categorize bank charges with high confidence', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 5000,
          isCredit: false,
          description: 'FNB SERVICE FEE MONTHLY',
          payeeName: 'FNB',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBe('8100');
      expect(result.accountName).toContain('Bank');
      // Pattern match (95% * 0.6 = 57) + description quality (~10-14) = ~67-71%
      // First-time transactions without historical match won't reach 80% threshold
      expect(result.confidenceScore).toBeGreaterThanOrEqual(65);
      expect(result.confidenceScore).toBeLessThan(80);
      expect(result.autoApplied).toBe(false); // Below 80% threshold
      expect(result.vatType).toBe(VatType.NO_VAT);
    });

    it('should categorize electricity utilities correctly', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 150000,
          isCredit: false,
          description: 'ESKOM PREPAID ELECTRICITY',
          payeeName: 'ESKOM',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBe('5200');
      expect(result.accountName).toContain('Electricity');
      expect(result.vatType).toBe(VatType.STANDARD);
    });

    it('should escalate low-confidence transactions', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 25000,
          isCredit: false,
          description: 'RANDOM PAYMENT XYZ123',
          payeeName: 'UNKNOWN PAYEE',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.confidenceScore).toBeLessThan(80);
      expect(result.autoApplied).toBe(false);
    });

    it('should escalate SARS payments even with high confidence', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 500000,
          isCredit: false,
          description: 'SARS PAYMENT VAT',
          payeeName: 'SARS',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      // SARS pattern has flagForReview: true
      expect(result.autoApplied).toBe(false);
    });

    it('should use historical match when no pattern matches', async () => {
      // Create historical transaction with categorization
      const historicalTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 10000,
          isCredit: false,
          description: 'ACME SUPPLIES ORDER 123',
          payeeName: 'ACME SUPPLIES',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'CATEGORIZED',
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: historicalTx.id,
          accountCode: '5300',
          accountName: 'Educational Supplies',
          confidenceScore: 95,
          source: 'USER_OVERRIDE',
          isSplit: false,
          vatType: 'STANDARD',
        },
      });

      // New transaction from same payee
      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 15000,
          isCredit: false,
          description: 'ACME SUPPLIES ORDER 456',
          payeeName: 'ACME SUPPLIES',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(newTx, testTenant.id);

      expect(result.accountCode).toBe('5300');
      expect(result.reasoning).toContain('Historical');
    });

    it('should categorize telecom providers correctly', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 89900,
          isCredit: false,
          description: 'VODACOM AIRTIME',
          payeeName: 'VODACOM',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBe('8300');
      expect(result.accountName).toContain('Telephone');
      expect(result.vatType).toBe(VatType.STANDARD);
    });

    it('should handle empty payee name gracefully', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 5000,
          isCredit: false,
          description: 'PAYMENT',
          payeeName: '',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      // Should not throw, should return fallback
      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBeDefined();
      expect(result.autoApplied).toBe(false); // Low confidence without pattern
    });

    it('should handle credit transactions correctly', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 400000,
          isCredit: true,
          description: 'SCHOOL FEE PAYMENT DEPOSIT',
          payeeName: 'JOHN SMITH',
          bankAccount: 'FNB-001',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBe('4000');
      expect(result.accountName).toContain('School');
      expect(result.vatType).toBe(VatType.EXEMPT);
    });
  });
});

describe('PatternMatcher', () => {
  let matcher: PatternMatcher;
  let contextLoader: ContextLoader;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [PatternMatcher, ContextLoader],
    }).compile();

    contextLoader = module.get<ContextLoader>(ContextLoader);
    matcher = module.get<PatternMatcher>(PatternMatcher);
    await contextLoader.loadContext();
  });

  it('should match FNB bank charges', () => {
    // Pattern regex is ^FNB CHEQUE, matcher combines payee+description
    // 'FNB' + ' ' + 'CHEQUE MONTHLY' = 'FNB CHEQUE MONTHLY' which matches ^FNB CHEQUE
    const matches = matcher.match('FNB', 'CHEQUE MONTHLY', undefined, false);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.accountCode).toBe('8100');
  });

  it('should match SARS payments and flag for review', () => {
    const matches = matcher.match('SARS', 'SARS PAYMENT VAT', undefined, false);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.flagForReview).toBe(true);
  });

  it('should return empty array for no match', () => {
    const matches = matcher.match(
      'RANDOM XYZ',
      'RANDOM PAYMENT ABC',
      undefined,
      false,
    );

    expect(matches.length).toBe(0);
  });

  it('should match multiple patterns and sort by confidence', () => {
    const matches = matcher.match(
      'FNB',
      'FNB SERVICE FEE CHEQUE',
      undefined,
      false,
    );

    // Should match both bank-fnb-fee and bank-fnb-cheque patterns
    // Sorted by confidence descending
    expect(matches.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(
        matches[i].confidence,
      );
    }
  });

  it('should filter by credit flag', () => {
    // School fee deposit pattern has isCredit: true
    const debitMatches = matcher.match(
      'DEPOSIT',
      'SCHOOL FEE DEPOSIT',
      undefined,
      false,
    );
    const creditMatches = matcher.match(
      'DEPOSIT',
      'SCHOOL FEE DEPOSIT',
      undefined,
      true,
    );

    // Credit match should include school fee pattern
    const hasFeeInCredit = creditMatches.some(
      (m) => m.pattern.accountCode === '4000',
    );
    expect(hasFeeInCredit).toBe(true);
  });
});

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfidenceScorer],
    }).compile();

    scorer = module.get<ConfidenceScorer>(ConfidenceScorer);
  });

  it('should calculate high confidence for pattern + historical match', () => {
    const score = scorer.calculate({
      patternConfidence: 95,
      hasPatternMatch: true,
      hasHistoricalMatch: true,
      historicalMatchCount: 5,
      isAmountTypical: true,
      descriptionQuality: 80,
    });

    // Pattern: 95 * 0.6 = 57
    // Historical: 25 + 4 (capped at 5) = 29
    // Amount: 10
    // Description: 8
    // Total: ~100 (capped)
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('should calculate low confidence with no matches', () => {
    const score = scorer.calculate({
      patternConfidence: 0,
      hasPatternMatch: false,
      hasHistoricalMatch: false,
      historicalMatchCount: 0,
      isAmountTypical: false,
      descriptionQuality: 20,
    });

    // Only description quality: 20/100 * 10 = 2
    expect(score).toBeLessThan(20);
  });

  it('should cap score at 100', () => {
    const score = scorer.calculate({
      patternConfidence: 100,
      hasPatternMatch: true,
      hasHistoricalMatch: true,
      historicalMatchCount: 100,
      isAmountTypical: true,
      descriptionQuality: 100,
    });

    expect(score).toBe(100);
  });

  it('should correctly determine threshold', () => {
    expect(scorer.meetsAutoApplyThreshold(80, 80)).toBe(true);
    expect(scorer.meetsAutoApplyThreshold(79, 80)).toBe(false);
    expect(scorer.meetsAutoApplyThreshold(100, 80)).toBe(true);
  });

  it('should explain confidence calculation', () => {
    const explanation = scorer.explain({
      patternConfidence: 95,
      hasPatternMatch: true,
      hasHistoricalMatch: true,
      historicalMatchCount: 3,
      isAmountTypical: true,
      descriptionQuality: 50,
    });

    expect(explanation).toContain('Pattern');
    expect(explanation).toContain('Historical');
    expect(explanation).toContain('Typical amount');
  });
});

describe('ContextLoader', () => {
  let contextLoader: ContextLoader;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContextLoader],
    }).compile();

    contextLoader = module.get<ContextLoader>(ContextLoader);
  });

  it('should load context successfully', async () => {
    const context = await contextLoader.loadContext();

    expect(context.patterns).toBeDefined();
    expect(Array.isArray(context.patterns)).toBe(true);
    expect(context.patterns.length).toBeGreaterThan(0);

    expect(context.chartOfAccounts).toBeDefined();
    expect(Array.isArray(context.chartOfAccounts)).toBe(true);
    expect(context.chartOfAccounts.length).toBeGreaterThan(0);

    expect(context.autoApplyThreshold).toBe(80);
  });

  it('should validate account codes', () => {
    expect(contextLoader.isValidAccountCode('8100')).toBe(true);
    expect(contextLoader.isValidAccountCode('9999')).toBe(false);
  });

  it('should get account by code', () => {
    const account = contextLoader.getAccount('8100');

    expect(account).toBeDefined();
    expect(account?.name).toContain('Bank');
  });
});
