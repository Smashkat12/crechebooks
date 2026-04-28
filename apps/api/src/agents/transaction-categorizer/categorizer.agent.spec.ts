/**
 * TransactionCategorizerAgent unit tests
 * Asserts that CategorizationResult.source is populated on PATTERN and FALLBACK paths.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TransactionCategorizerAgent } from './categorizer.agent';
import { ContextLoader } from './context-loader';
import { PatternMatcher } from './pattern-matcher';
import { ConfidenceScorer } from './confidence-scorer';
import { DecisionLogger } from './decision-logger';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Transaction } from '@prisma/client';
import { VatType } from '../../database/entities/categorization.entity';
import { AgentContext, PatternMatch } from './interfaces/categorizer.interface';

// Minimal mock transaction
const makeTx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-001',
    tenantId: 'tenant-001',
    bankAccount: 'acc-001',
    xeroTransactionId: null,
    date: new Date('2025-01-15'),
    amountCents: 100000,
    description: 'EDGARS STORE PAYMENT',
    reference: null,
    payeeName: 'EDGARS',
    isCredit: false,
    isDeleted: false,
    deletedAt: null,
    source: 'BANK_FEED',
    importBatchId: null,
    status: 'PENDING',
    isReconciled: false,
    reconciledAt: null,
    transactionHash: null,
    duplicateOfId: null,
    duplicateStatus: 'NONE',
    reversesTransactionId: null,
    isReversal: false,
    xeroAccountCode: null,
    supplierId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Transaction;

const mockContext: AgentContext = {
  patterns: [],
  chartOfAccounts: [],
  autoApplyThreshold: 80,
};

const mockPatternMatch: PatternMatch = {
  pattern: {
    id: 'edgars',
    regex: 'EDGARS',
    accountCode: '5100',
    accountName: 'Groceries & Supplies',
    confidence: 90,
    vatType: 'STANDARD',
  },
  matchedText: 'EDGARS',
  confidence: 90,
};

describe('TransactionCategorizerAgent — source field', () => {
  let agent: TransactionCategorizerAgent;
  let contextLoaderMock: jest.Mocked<ContextLoader>;
  let patternMatcherMock: jest.Mocked<PatternMatcher>;
  let confidenceScorerMock: jest.Mocked<ConfidenceScorer>;
  let decisionLoggerMock: jest.Mocked<DecisionLogger>;
  let prismaServiceMock: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    contextLoaderMock = {
      getContext: jest.fn().mockReturnValue(mockContext),
    } as unknown as jest.Mocked<ContextLoader>;

    patternMatcherMock = {
      getBestMatch: jest.fn(),
    } as unknown as jest.Mocked<PatternMatcher>;

    confidenceScorerMock = {
      calculate: jest.fn().mockReturnValue(85),
      meetsAutoApplyThreshold: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<ConfidenceScorer>;

    decisionLoggerMock = {
      log: jest.fn().mockResolvedValue(undefined),
      logEscalation: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DecisionLogger>;

    prismaServiceMock = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      transaction: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { amountCents: null },
          _count: { _all: 0 },
        }),
      },
    } as unknown as jest.Mocked<PrismaService>;
  });

  async function buildAgent(): Promise<TransactionCategorizerAgent> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionCategorizerAgent,
        { provide: ContextLoader, useValue: contextLoaderMock },
        { provide: PatternMatcher, useValue: patternMatcherMock },
        { provide: ConfidenceScorer, useValue: confidenceScorerMock },
        { provide: DecisionLogger, useValue: decisionLoggerMock },
        { provide: PrismaService, useValue: prismaServiceMock },
      ],
    }).compile();
    return module.get<TransactionCategorizerAgent>(TransactionCategorizerAgent);
  }

  it('Test 1: pattern matches at ≥80% confidence → source === "PATTERN"', async () => {
    patternMatcherMock.getBestMatch.mockReturnValue(mockPatternMatch);
    agent = await buildAgent();

    const result = await agent.categorize(makeTx(), 'tenant-001');

    expect(result.source).toBe('PATTERN');
    expect(result.accountCode).toBe('5100');
  });

  it('Test 2: no pattern, no SDK, no historical → source === "FALLBACK"', async () => {
    patternMatcherMock.getBestMatch.mockReturnValue(null);
    // prisma.$queryRaw returns [] → no historical match
    agent = await buildAgent();

    const result = await agent.categorize(makeTx(), 'tenant-001');

    expect(result.source).toBe('FALLBACK');
    expect(result.accountCode).toBe('5900'); // debit fallback
  });
});
