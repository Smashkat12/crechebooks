/**
 * SDK Payment Matcher Tests
 * TASK-SDK-004: PaymentMatcher SDK Migration
 *
 * Unit tests for SdkPaymentMatcher, parseMatchResponse, routeMatchModel,
 * findSimilarReferences, and hybrid matching integration.
 *
 * CRITICAL: Uses mocks for SDK and ruvector - no external dependencies.
 * ALL monetary values in CENTS (integers).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Transaction } from '@prisma/client';
import { SdkPaymentMatcher } from '../../../src/agents/payment-matcher/sdk-matcher';
import { PaymentMatcherAgent } from '../../../src/agents/payment-matcher/matcher.agent';
import { MatchDecisionLogger } from '../../../src/agents/payment-matcher/decision-logger';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import { SdkConfigService } from '../../../src/agents/sdk/sdk-config';
import { RuvectorService } from '../../../src/agents/sdk/ruvector.service';
import type { InvoiceCandidate } from '../../../src/agents/payment-matcher/interfaces/matcher.interface';
import type { SdkMatchResult } from '../../../src/agents/payment-matcher/interfaces/sdk-matcher.interface';

// ────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-001',
    tenantId: 'tenant-001',
    date: new Date('2025-06-15'),
    amountCents: 400_000,
    isCredit: true,
    description: 'SCHOOL FEE PAYMENT',
    reference: 'INV-2025-001',
    payeeName: 'JOHN SMITH',
    bankAccount: 'FNB-001',
    source: 'MANUAL',
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    matchStatus: null,
    matchedInvoiceId: null,
    matchConfidence: null,
    categoryCode: null,
    categoryConfidence: null,
    statementLineId: null,
    ...overrides,
  } as Transaction;
}

function makeCandidate(
  id: string,
  invoiceNumber: string,
  confidence: number,
  totalCents: number = 400_000,
  amountPaidCents: number = 0,
): InvoiceCandidate {
  return {
    invoice: {
      id,
      invoiceNumber,
      totalCents,
      amountPaidCents,
      parentId: 'parent-001',
      parent: { firstName: 'John', lastName: 'Smith' },
      child: { firstName: 'Emma' },
    },
    confidence,
    matchReasons: [`Deterministic score: ${String(confidence)}%`],
  };
}

// ────────────────────────────────────────────────────────────────────
// SdkPaymentMatcher unit tests
// ────────────────────────────────────────────────────────────────────

describe('SdkPaymentMatcher', () => {
  let sdkMatcher: SdkPaymentMatcher;
  let mockRuvector: {
    isAvailable: jest.Mock;
    generateEmbedding: jest.Mock;
    searchSimilar: jest.Mock;
    onModuleInit: jest.Mock;
  };
  let mockFactory: Partial<SdkAgentFactory>;
  let mockConfig: Partial<SdkConfigService>;

  beforeEach(async () => {
    mockRuvector = {
      isAvailable: jest.fn().mockReturnValue(false),
      generateEmbedding: jest.fn(),
      searchSimilar: jest.fn(),
      onModuleInit: jest.fn(),
    };

    mockFactory = {
      createMatcherAgent: jest.fn().mockReturnValue({
        description: 'test matcher',
        prompt: 'test prompt',
        tools: [],
        model: 'haiku',
      }),
    };

    mockConfig = {
      isEnabled: jest.fn().mockReturnValue(false),
      getModelForAgent: jest.fn().mockReturnValue('haiku'),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [
        {
          provide: SdkAgentFactory,
          useValue: mockFactory,
        },
        {
          provide: SdkConfigService,
          useValue: mockConfig,
        },
        {
          provide: RuvectorService,
          useValue: mockRuvector,
        },
        SdkPaymentMatcher,
      ],
    }).compile();

    sdkMatcher = module.get<SdkPaymentMatcher>(SdkPaymentMatcher);
  });

  // ──────────────────────────────────────────────────────────────────
  // parseMatchResponse
  // ──────────────────────────────────────────────────────────────────

  describe('parseMatchResponse', () => {
    it('should parse valid JSON response', () => {
      const json = JSON.stringify({
        bestMatchInvoiceId: 'inv-001',
        confidence: 85,
        reasoning: 'Exact reference match plus amount match',
        isPartialPayment: false,
        suggestedAllocation: [{ invoiceId: 'inv-001', amountCents: 400_000 }],
      });

      const result = sdkMatcher.parseMatchResponse(json);

      expect(result.bestMatchInvoiceId).toBe('inv-001');
      expect(result.confidence).toBe(85);
      expect(result.reasoning).toBe('Exact reference match plus amount match');
      expect(result.isPartialPayment).toBe(false);
      expect(result.suggestedAllocation).toHaveLength(1);
      expect(result.suggestedAllocation[0].invoiceId).toBe('inv-001');
      expect(result.suggestedAllocation[0].amountCents).toBe(400_000);
    });

    it('should handle markdown-wrapped JSON blocks', () => {
      const response = `Here is the result:
\`\`\`json
{
  "bestMatchInvoiceId": "inv-002",
  "confidence": 72,
  "reasoning": "Amount match with name similarity",
  "isPartialPayment": false,
  "suggestedAllocation": [{"invoiceId": "inv-002", "amountCents": 350000}]
}
\`\`\``;

      const result = sdkMatcher.parseMatchResponse(response);

      expect(result.bestMatchInvoiceId).toBe('inv-002');
      expect(result.confidence).toBe(72);
      expect(result.suggestedAllocation).toHaveLength(1);
    });

    it('should handle markdown blocks without language specifier', () => {
      const response = `\`\`\`
{
  "bestMatchInvoiceId": null,
  "confidence": 0,
  "reasoning": "No clear match found",
  "isPartialPayment": false,
  "suggestedAllocation": []
}
\`\`\``;

      const result = sdkMatcher.parseMatchResponse(response);

      expect(result.bestMatchInvoiceId).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should throw on malformed response', () => {
      expect(() => sdkMatcher.parseMatchResponse('not json at all')).toThrow(
        'Failed to parse LLM match response as JSON',
      );
    });

    it('should clamp confidence to 0-100', () => {
      const json = JSON.stringify({
        bestMatchInvoiceId: 'inv-001',
        confidence: 150,
        reasoning: 'test',
        isPartialPayment: false,
        suggestedAllocation: [],
      });

      const result = sdkMatcher.parseMatchResponse(json);
      expect(result.confidence).toBe(100);

      const json2 = JSON.stringify({
        bestMatchInvoiceId: 'inv-001',
        confidence: -10,
        reasoning: 'test',
        isPartialPayment: false,
        suggestedAllocation: [],
      });

      const result2 = sdkMatcher.parseMatchResponse(json2);
      expect(result2.confidence).toBe(0);
    });

    it('should provide defaults for missing fields', () => {
      const json = JSON.stringify({});

      const result = sdkMatcher.parseMatchResponse(json);

      expect(result.bestMatchInvoiceId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe('No reasoning provided');
      expect(result.isPartialPayment).toBe(false);
      expect(result.suggestedAllocation).toEqual([]);
    });

    it('should filter out malformed allocations', () => {
      const json = JSON.stringify({
        bestMatchInvoiceId: 'inv-001',
        confidence: 80,
        reasoning: 'test',
        isPartialPayment: false,
        suggestedAllocation: [
          { invoiceId: 'inv-001', amountCents: 200_000 },
          { invoiceId: 123, amountCents: 100_000 }, // invalid: invoiceId not string
          { invoiceId: 'inv-003' }, // invalid: missing amountCents
          { invoiceId: 'inv-004', amountCents: 100_000 }, // valid
        ],
      });

      const result = sdkMatcher.parseMatchResponse(json);
      expect(result.suggestedAllocation).toHaveLength(2);
      expect(result.suggestedAllocation[0].invoiceId).toBe('inv-001');
      expect(result.suggestedAllocation[1].invoiceId).toBe('inv-004');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // routeMatchModel
  // ──────────────────────────────────────────────────────────────────

  describe('routeMatchModel', () => {
    it('should route haiku for simple cases', () => {
      const candidates = [
        makeCandidate('inv-1', 'INV-001', 70),
        makeCandidate('inv-2', 'INV-002', 50),
      ];
      const transaction = makeTransaction({ amountCents: 400_000 });

      expect(sdkMatcher.routeMatchModel(candidates, transaction)).toBe('haiku');
    });

    it('should route sonnet for >2 high-confidence candidates', () => {
      const candidates = [
        makeCandidate('inv-1', 'INV-001', 75),
        makeCandidate('inv-2', 'INV-002', 72),
        makeCandidate('inv-3', 'INV-003', 68),
      ];
      const transaction = makeTransaction({ amountCents: 400_000 });

      expect(sdkMatcher.routeMatchModel(candidates, transaction)).toBe(
        'sonnet',
      );
    });

    it('should route sonnet for high-value transactions (>R50k)', () => {
      const candidates = [makeCandidate('inv-1', 'INV-001', 60)];
      const transaction = makeTransaction({ amountCents: 6_000_000 }); // R60,000

      expect(sdkMatcher.routeMatchModel(candidates, transaction)).toBe(
        'sonnet',
      );
    });

    it('should route sonnet for split payment signals', () => {
      // Two invoices: R2000 + R2000 = R4000 transaction amount
      const candidates = [
        makeCandidate('inv-1', 'INV-001', 50, 200_000, 0),
        makeCandidate('inv-2', 'INV-002', 50, 200_000, 0),
      ];
      const transaction = makeTransaction({ amountCents: 400_000 });

      expect(sdkMatcher.routeMatchModel(candidates, transaction)).toBe(
        'sonnet',
      );
    });

    it('should route haiku for single low-value candidates', () => {
      const candidates = [makeCandidate('inv-1', 'INV-001', 55)];
      const transaction = makeTransaction({ amountCents: 100_000 }); // R1,000

      expect(sdkMatcher.routeMatchModel(candidates, transaction)).toBe('haiku');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // findSimilarReferences
  // ──────────────────────────────────────────────────────────────────

  describe('findSimilarReferences', () => {
    it('should return results when ruvector is available', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockRuvector.searchSimilar.mockResolvedValue([
        {
          id: 'inv-001',
          score: 0.92,
          metadata: { reference: 'INV-2025-001' },
        },
        {
          id: 'inv-002',
          score: 0.75,
          metadata: { reference: 'INV-2025-002' },
        },
        {
          id: 'inv-003',
          score: 0.3, // below 0.5 threshold
          metadata: { reference: 'INV-2025-003' },
        },
      ]);

      const results = await sdkMatcher.findSimilarReferences(
        'INV-2025-001',
        'tenant-001',
      );

      expect(results).toHaveLength(2);
      expect(results[0].invoiceId).toBe('inv-001');
      expect(results[0].similarity).toBe(0.92);
      expect(results[1].invoiceId).toBe('inv-002');
      expect(results[1].similarity).toBe(0.75);
    });

    it('should return empty array when ruvector is unavailable', async () => {
      mockRuvector.isAvailable.mockReturnValue(false);

      const results = await sdkMatcher.findSimilarReferences(
        'INV-2025-001',
        'tenant-001',
      );

      expect(results).toEqual([]);
      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should return empty array when ruvector is undefined', async () => {
      // Create matcher without ruvector
      const module: TestingModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [
          { provide: SdkAgentFactory, useValue: mockFactory },
          { provide: SdkConfigService, useValue: mockConfig },
          SdkPaymentMatcher,
        ],
      }).compile();

      const matcherWithoutRuvector =
        module.get<SdkPaymentMatcher>(SdkPaymentMatcher);

      const results = await matcherWithoutRuvector.findSimilarReferences(
        'INV-2025-001',
        'tenant-001',
      );

      expect(results).toEqual([]);
    });

    it('should return empty array when ruvector throws', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.generateEmbedding.mockRejectedValue(
        new Error('Embedding failed'),
      );

      const results = await sdkMatcher.findSimilarReferences(
        'INV-2025-001',
        'tenant-001',
      );

      expect(results).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // resolveAmbiguity
  // ──────────────────────────────────────────────────────────────────

  describe('resolveAmbiguity', () => {
    it('should return structured SdkMatchResult', async () => {
      const transaction = makeTransaction();
      const candidates = [
        makeCandidate('inv-1', 'INV-001', 75),
        makeCandidate('inv-2', 'INV-002', 72),
      ];

      // SDK is not enabled, so it will use the fallback
      const result = await sdkMatcher.resolveAmbiguity(
        transaction,
        candidates,
        'tenant-001',
      );

      // Should get fallback result since SDK is unavailable
      expect(result).toBeDefined();
      expect(result.bestMatchInvoiceId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('SDK unavailable');
      expect(result.isPartialPayment).toBe(false);
      expect(result.suggestedAllocation).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // buildMatchMessage
  // ──────────────────────────────────────────────────────────────────

  describe('buildMatchMessage', () => {
    it('should build formatted message with transaction and candidates', () => {
      const transaction = makeTransaction();
      const candidates = [makeCandidate('inv-1', 'INV-001', 75, 400_000, 0)];

      const message = sdkMatcher.buildMatchMessage(transaction, candidates);

      expect(message).toContain('## Transaction');
      expect(message).toContain('txn-001');
      expect(message).toContain('400000');
      expect(message).toContain('INV-2025-001');
      expect(message).toContain('JOHN SMITH');
      expect(message).toContain('## Candidate Invoices');
      expect(message).toContain('### Invoice INV-001');
      expect(message).toContain('John Smith');
      expect(message).toContain('Emma');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Partial payment detection
  // ──────────────────────────────────────────────────────────────────

  describe('partial payment detection', () => {
    it('should detect split payment signal via routeMatchModel', () => {
      // Transaction amount matches sum of two invoices
      const candidates = [
        makeCandidate('inv-1', 'INV-001', 50, 150_000, 0), // R1500 outstanding
        makeCandidate('inv-2', 'INV-002', 50, 250_000, 0), // R2500 outstanding
      ];
      // R1500 + R2500 = R4000 = 400,000 cents
      const transaction = makeTransaction({ amountCents: 400_000 });

      expect(sdkMatcher.routeMatchModel(candidates, transaction)).toBe(
        'sonnet',
      );
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Hybrid matching integration tests (PaymentMatcherAgent + SdkPaymentMatcher)
// ────────────────────────────────────────────────────────────────────

describe('PaymentMatcherAgent hybrid matching (SDK-004)', () => {
  let agent: PaymentMatcherAgent;
  let mockDecisionLogger: {
    logDecision: jest.Mock;
    logEscalation: jest.Mock;
  };
  let mockSdkMatcher: {
    findSimilarReferences: jest.Mock;
    resolveAmbiguity: jest.Mock;
    isSdkAvailable: jest.Mock;
  };

  beforeEach(async () => {
    mockDecisionLogger = {
      logDecision: jest.fn().mockResolvedValue(undefined),
      logEscalation: jest.fn().mockResolvedValue(undefined),
    };

    mockSdkMatcher = {
      findSimilarReferences: jest.fn().mockResolvedValue([]),
      resolveAmbiguity: jest.fn().mockResolvedValue({
        bestMatchInvoiceId: null,
        confidence: 0,
        reasoning: 'SDK fallback',
        isPartialPayment: false,
        suggestedAllocation: [],
      } satisfies SdkMatchResult),
      isSdkAvailable: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        {
          provide: PrismaService,
          useValue: {}, // Not needed for unit tests
        },
        {
          provide: MatchDecisionLogger,
          useValue: mockDecisionLogger,
        },
        {
          provide: SdkPaymentMatcher,
          useValue: mockSdkMatcher,
        },
        PaymentMatcherAgent,
      ],
    }).compile();

    agent = module.get<PaymentMatcherAgent>(PaymentMatcherAgent);
  });

  it('should AUTO_APPLY single high-confidence match without SDK (fast path)', async () => {
    const transaction = makeTransaction();
    const candidates = [makeCandidate('inv-1', 'INV-001', 95)];

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    expect(decision.action).toBe('AUTO_APPLY');
    expect(decision.invoiceId).toBe('inv-1');
    expect(decision.confidence).toBe(95);
    // SDK should NOT be called for fast path
    expect(mockSdkMatcher.resolveAmbiguity).not.toHaveBeenCalled();
    expect(mockSdkMatcher.findSimilarReferences).not.toHaveBeenCalled();
  });

  it('should log decision with source: sdk when SDK resolves', async () => {
    const transaction = makeTransaction();
    // Two ambiguous candidates: both at 75% (below 80 threshold)
    const candidates = [
      makeCandidate('inv-1', 'INV-001', 55),
      makeCandidate('inv-2', 'INV-002', 50),
    ];

    mockSdkMatcher.resolveAmbiguity.mockResolvedValue({
      bestMatchInvoiceId: 'inv-1',
      confidence: 85,
      reasoning: 'Reference match confirms INV-001',
      isPartialPayment: false,
      suggestedAllocation: [{ invoiceId: 'inv-1', amountCents: 400_000 }],
    } satisfies SdkMatchResult);

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    expect(decision.action).toBe('AUTO_APPLY');
    expect(decision.invoiceId).toBe('inv-1');
    expect(decision.confidence).toBe(85);
    expect(mockDecisionLogger.logDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'sdk',
        invoiceId: 'inv-1',
        autoApplied: true,
      }),
    );
  });

  it('should force REVIEW_REQUIRED for HIGH_VALUE transactions via SDK', async () => {
    // R60,000 = 6,000,000 cents > HIGH_VALUE_THRESHOLD_CENTS (5,000,000)
    const transaction = makeTransaction({ amountCents: 6_000_000 });
    const candidates = [
      makeCandidate('inv-1', 'INV-001', 55, 6_000_000),
      makeCandidate('inv-2', 'INV-002', 50, 6_000_000),
    ];

    mockSdkMatcher.resolveAmbiguity.mockResolvedValue({
      bestMatchInvoiceId: 'inv-1',
      confidence: 95,
      reasoning: 'Clear match for high-value invoice',
      isPartialPayment: false,
      suggestedAllocation: [{ invoiceId: 'inv-1', amountCents: 6_000_000 }],
    } satisfies SdkMatchResult);

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    expect(decision.action).toBe('REVIEW_REQUIRED');
    expect(decision.invoiceId).toBe('inv-1');
    expect(decision.reasoning).toContain('High-value transaction');
    expect(decision.reasoning).toContain('forced to review');
  });

  it('should fall back to deterministic when LLM fails', async () => {
    const transaction = makeTransaction();
    const candidates = [
      makeCandidate('inv-1', 'INV-001', 55),
      makeCandidate('inv-2', 'INV-002', 50),
    ];

    // SDK throws an error
    mockSdkMatcher.resolveAmbiguity.mockRejectedValue(new Error('LLM timeout'));

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    // Should fall back to existing logic: best candidate at 55% is below 80%
    expect(decision.action).toBe('REVIEW_REQUIRED');
    expect(decision.confidence).toBe(55);
    expect(decision.reasoning).toContain('below threshold');
  });

  it('should fall back when SDK returns no match', async () => {
    const transaction = makeTransaction();
    const candidates = [makeCandidate('inv-1', 'INV-001', 55)];

    // SDK returns no match
    mockSdkMatcher.resolveAmbiguity.mockResolvedValue({
      bestMatchInvoiceId: null,
      confidence: 0,
      reasoning: 'Cannot determine match',
      isPartialPayment: false,
      suggestedAllocation: [],
    } satisfies SdkMatchResult);

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    // Falls back to deterministic: 55% is below 80
    expect(decision.action).toBe('REVIEW_REQUIRED');
    expect(decision.confidence).toBe(55);
  });

  it('should NO_MATCH when no candidates at all', async () => {
    const transaction = makeTransaction();

    const decision = await agent.makeMatchDecision(
      transaction,
      [],
      'tenant-001',
    );

    expect(decision.action).toBe('NO_MATCH');
    expect(decision.confidence).toBe(0);
    expect(mockSdkMatcher.resolveAmbiguity).not.toHaveBeenCalled();
  });

  it('should work without sdkMatcher (undefined)', async () => {
    // Create agent without SDK matcher
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: MatchDecisionLogger, useValue: mockDecisionLogger },
        PaymentMatcherAgent,
      ],
    }).compile();

    const agentWithoutSdk =
      module.get<PaymentMatcherAgent>(PaymentMatcherAgent);

    const transaction = makeTransaction();
    const candidates = [
      makeCandidate('inv-1', 'INV-001', 55),
      makeCandidate('inv-2', 'INV-002', 50),
    ];

    const decision = await agentWithoutSdk.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    // Pure deterministic: 55% below 80% threshold
    expect(decision.action).toBe('REVIEW_REQUIRED');
  });

  it('should try ruvector boost before SDK resolution', async () => {
    const transaction = makeTransaction({ reference: 'INV-2025-001' });
    // Candidate at 75% - just below 80% threshold
    const candidates = [makeCandidate('inv-1', 'INV-001', 75)];

    // Ruvector returns a match that would boost confidence
    mockSdkMatcher.findSimilarReferences.mockResolvedValue([
      { invoiceId: 'inv-1', reference: 'INV-2025-001', similarity: 0.9 },
    ]);

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    // 75 + round(0.9 * 10) = 75 + 9 = 84 >= 80 → AUTO_APPLY
    expect(decision.action).toBe('AUTO_APPLY');
    expect(decision.confidence).toBe(84);
    expect(mockDecisionLogger.logDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'deterministic+ruvector',
      }),
    );
    // SDK should NOT be called because ruvector resolved it
    expect(mockSdkMatcher.resolveAmbiguity).not.toHaveBeenCalled();
  });

  it('should handle ruvector failure gracefully', async () => {
    const transaction = makeTransaction({ reference: 'INV-2025-001' });
    const candidates = [makeCandidate('inv-1', 'INV-001', 55)];

    // Ruvector throws
    mockSdkMatcher.findSimilarReferences.mockRejectedValue(
      new Error('Ruvector down'),
    );

    // SDK also fails
    mockSdkMatcher.resolveAmbiguity.mockRejectedValue(new Error('SDK down'));

    const decision = await agent.makeMatchDecision(
      transaction,
      candidates,
      'tenant-001',
    );

    // Should still produce a valid decision via deterministic fallback
    expect(decision.action).toBe('REVIEW_REQUIRED');
    expect(decision.confidence).toBe(55);
  });
});
