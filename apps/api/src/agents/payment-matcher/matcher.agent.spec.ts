/**
 * PaymentMatcherAgent unit tests
 * Asserts that MatchDecision.source is populated on all code paths.
 * Regression: buildMatchMessage includes middleName + lastName for child (AUDIT-PEOPLE-03).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMatcherAgent } from './matcher.agent';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MatchDecisionLogger } from './decision-logger';
import { SdkPaymentMatcher } from './sdk-matcher';
import { Transaction } from '@prisma/client';
import { InvoiceCandidate } from './interfaces/matcher.interface';

// Minimal mock transaction
const makeTx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: 'tx-001',
    tenantId: 'tenant-001',
    bankAccount: 'acc-001',
    xeroTransactionId: null,
    date: new Date('2025-01-15'),
    amountCents: 100000,
    description: 'Payment from Parent',
    reference: 'INV-2025-001',
    payeeName: 'Parent Name',
    isCredit: true,
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

// Single invoice candidate at 90% confidence (above AUTO_APPLY threshold)
const makeHighConfidenceCandidate = (): InvoiceCandidate => ({
  invoice: {
    id: 'inv-001',
    invoiceNumber: 'INV-2025-001',
    totalCents: 100000,
    amountPaidCents: 0,
    parentId: 'parent-001',
    parent: { firstName: 'Parent', lastName: 'Name' },
    child: { firstName: 'Child', middleName: null, lastName: 'Smith' },
  },
  confidence: 90,
  matchReasons: ['Exact amount match', 'Reference contains invoice number'],
});

describe('PaymentMatcherAgent — source field', () => {
  let agent: PaymentMatcherAgent;
  let decisionLoggerMock: jest.Mocked<MatchDecisionLogger>;
  let prismaServiceMock: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    decisionLoggerMock = {
      logDecision: jest.fn().mockResolvedValue(undefined),
      logEscalation: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MatchDecisionLogger>;

    prismaServiceMock = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as jest.Mocked<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMatcherAgent,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: MatchDecisionLogger, useValue: decisionLoggerMock },
      ],
    }).compile();

    agent = module.get<PaymentMatcherAgent>(PaymentMatcherAgent);
  });

  it('Test 1: single high-confidence match with no SDK → source === "deterministic"', async () => {
    const tx = makeTx();
    const candidates = [makeHighConfidenceCandidate()];

    const decision = await agent.makeMatchDecision(tx, candidates, tx.tenantId);

    expect(decision.source).toBe('deterministic');
    expect(decision.action).toBe('AUTO_APPLY');
  });

  it('Test 2: no candidates → source === "deterministic"', async () => {
    const tx = makeTx();

    const decision = await agent.makeMatchDecision(tx, [], tx.tenantId);

    expect(decision.source).toBe('deterministic');
    expect(decision.action).toBe('NO_MATCH');
  });
});

describe('PaymentMatcherAgent — source field with SdkPaymentMatcher', () => {
  let agent: PaymentMatcherAgent;
  let decisionLoggerMock: jest.Mocked<MatchDecisionLogger>;
  let prismaServiceMock: jest.Mocked<PrismaService>;
  let sdkMatcherMock: jest.Mocked<SdkPaymentMatcher>;

  beforeEach(async () => {
    decisionLoggerMock = {
      logDecision: jest.fn().mockResolvedValue(undefined),
      logEscalation: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MatchDecisionLogger>;

    prismaServiceMock = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as jest.Mocked<PrismaService>;

    sdkMatcherMock = {
      resolveAmbiguity: jest.fn().mockResolvedValue({
        bestMatchInvoiceId: 'inv-001',
        confidence: 85,
        reasoning: 'SDK resolved ambiguity',
        isPartialPayment: false,
        suggestedAllocation: [],
      }),
      findSimilarReferences: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SdkPaymentMatcher>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMatcherAgent,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: MatchDecisionLogger, useValue: decisionLoggerMock },
        { provide: SdkPaymentMatcher, useValue: sdkMatcherMock },
      ],
    }).compile();

    agent = module.get<PaymentMatcherAgent>(PaymentMatcherAgent);
  });

  it('Test 3: SDK resolveAmbiguity succeeds → source === "sdk"', async () => {
    const tx = makeTx({ reference: null }); // no reference → ruvector won't trigger

    // Two candidates at 85% — ambiguous, will fall through to SDK
    const candidates: InvoiceCandidate[] = [
      { ...makeHighConfidenceCandidate(), confidence: 85 },
      {
        invoice: {
          id: 'inv-002',
          invoiceNumber: 'INV-2025-002',
          totalCents: 100000,
          amountPaidCents: 0,
          parentId: 'parent-002',
          parent: { firstName: 'Other', lastName: 'Parent' },
          child: { firstName: 'Child2', middleName: null, lastName: 'Jones' },
        },
        confidence: 85,
        matchReasons: ['Exact amount match'],
      },
    ];

    const decision = await agent.makeMatchDecision(tx, candidates, tx.tenantId);

    expect(decision.source).toBe('sdk');
    expect(sdkMatcherMock.resolveAmbiguity).toHaveBeenCalled();
  });
});

describe('SdkPaymentMatcher.buildMatchMessage — child full name (AUDIT-PEOPLE-03)', () => {
  // buildMatchMessage is a pure string builder — instantiate with minimal stubs.
  const sdkMatcher = new SdkPaymentMatcher(
    {} as never, // SdkAgentFactory — not used by buildMatchMessage
    {} as never, // SdkConfigService — not used by buildMatchMessage
  );

  const makeTxSimple = (): Transaction =>
    ({
      id: 'tx-reg-01',
      tenantId: 'tenant-001',
      bankAccount: 'acc-001',
      xeroTransactionId: null,
      date: new Date('2025-03-10'),
      amountCents: 200000,
      description: 'Mary Catherine Smith school fees',
      reference: null,
      payeeName: 'Mary Catherine Smith',
      isCredit: true,
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
    }) as Transaction;

  it('Test 4: child with middleName renders full name in LLM prompt', () => {
    const tx = makeTxSimple();
    const candidate: InvoiceCandidate = {
      invoice: {
        id: 'inv-003',
        invoiceNumber: 'INV-2025-003',
        totalCents: 200000,
        amountPaidCents: 0,
        parentId: 'parent-003',
        parent: { firstName: 'John', middleName: null, lastName: 'Smith' },
        child: {
          firstName: 'Mary',
          middleName: 'Catherine',
          lastName: 'Smith',
        },
      },
      confidence: 75,
      matchReasons: ['Amount match'],
    };

    const message = sdkMatcher.buildMatchMessage(tx, [candidate]);

    expect(message).toContain('Mary Catherine Smith');
    expect(message).not.toMatch(/- Child: Mary\s*$/m);
  });

  it('Test 5: child without middleName renders "First Last" in LLM prompt', () => {
    const tx = makeTxSimple();
    const candidate: InvoiceCandidate = {
      invoice: {
        id: 'inv-004',
        invoiceNumber: 'INV-2025-004',
        totalCents: 200000,
        amountPaidCents: 0,
        parentId: 'parent-004',
        parent: { firstName: 'John', middleName: null, lastName: 'Smith' },
        child: { firstName: 'Mary', middleName: null, lastName: 'Smith' },
      },
      confidence: 75,
      matchReasons: ['Amount match'],
    };

    const message = sdkMatcher.buildMatchMessage(tx, [candidate]);

    expect(message).toContain('Mary Smith');
    expect(message).not.toMatch(/- Child: Mary\s*$/m);
  });
});
