<task_spec id="TASK-AGENT-002" version="3.0">

<metadata>
  <title>Transaction Categorizer Agent</title>
  <status>COMPLETE</status>
  <layer>agent</layer>
  <sequence>38</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-012</task_ref>
    <task_ref status="PENDING">TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the Transaction Categorizer Agent that wraps the existing CategorizationService
with Claude Code agent capabilities. The CategorizationService already exists in
src/database/services/categorization.service.ts with a placeholder `invokeAIAgent` method.
This task replaces that placeholder with real Claude Code agent calls that:
- Load context from .claude/context/ JSON files
- Use pattern matching from payee_patterns.json
- Calculate confidence scores deterministically
- Log all decisions to .claude/logs/decisions.jsonl
- Escalate low-confidence (<80%) transactions

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers) - NEVER rands as floats
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries
- 80% confidence threshold for auto-apply (L3 autonomy)

**EXISTING INFRASTRUCTURE (DO NOT RECREATE):**
- CategorizationService at src/database/services/categorization.service.ts
- PatternLearningService at src/database/services/pattern-learning.service.ts
- CategorizationRepository at src/database/repositories/categorization.repository.ts
- PayeePatternRepository at src/database/repositories/payee-pattern.repository.ts
- TransactionRepository at src/database/repositories/transaction.repository.ts
- VatType, CategorizationSource enums in entities
</context>

<existing_service>
CategorizationService (src/database/services/categorization.service.ts) methods:

```typescript
// ALREADY EXISTS - these methods work
categorizeTransactions(transactionIds: string[], tenantId: string): Promise<CategorizationBatchResult>
categorizeTransaction(transactionId: string, tenantId: string): Promise<CategorizationItemResult>
updateCategorization(transactionId: string, dto: UserCategorizationDto, userId: string, tenantId: string): Promise<Transaction>
getSuggestions(transactionId: string, tenantId: string): Promise<CategorySuggestion[]>

// PLACEHOLDER TO REPLACE - lines 503-592
private async invokeAIAgent(transaction: Transaction, _tenantId: string): Promise<AICategorization>
// This has hardcoded keyword matching - needs to use .claude/context/payee_patterns.json
```

Key types from src/database/dto/categorization-service.dto.ts:
```typescript
interface AICategorization {
  accountCode: string;
  accountName: string;
  confidenceScore: number;  // 0-100
  reasoning: string;
  vatType: VatType;
  isSplit: boolean;
}

const CATEGORIZATION_CONSTANTS = {
  AUTO_THRESHOLD: 80,           // >= 80 = auto-apply
  REVIEW_THRESHOLD: 50,         // < 50 = low confidence
  SPLIT_TOLERANCE_CENTS: 1,     // 1 cent tolerance for splits
  MAX_BATCH_SIZE: 100,
};
```
</existing_service>

<files_to_create>
1. src/agents/transaction-categorizer/categorizer.agent.ts - Main agent wrapping service
2. src/agents/transaction-categorizer/context-loader.ts - Load .claude/context/ JSON files
3. src/agents/transaction-categorizer/pattern-matcher.ts - Match against payee_patterns.json
4. src/agents/transaction-categorizer/confidence-scorer.ts - Calculate confidence deterministically
5. src/agents/transaction-categorizer/decision-logger.ts - Log to .claude/logs/decisions.jsonl
6. src/agents/transaction-categorizer/interfaces/categorizer.interface.ts - TypeScript types
7. src/agents/transaction-categorizer/categorizer.module.ts - NestJS module
8. .claude/agents/transaction-categorizer/categorize-transaction.md - Agent skill doc
9. tests/agents/transaction-categorizer/categorizer.agent.spec.ts - Integration tests
10. tests/agents/transaction-categorizer/pattern-matcher.spec.ts - Unit tests
</files_to_create>

<files_to_modify>
1. src/database/services/categorization.service.ts - Inject and use TransactionCategorizerAgent
2. src/app.module.ts - Import TransactionCategorizerModule
</files_to_modify>

<implementation_reference>

## Agent Structure
```
src/agents/
└── transaction-categorizer/
    ├── categorizer.agent.ts      # Main agent class
    ├── context-loader.ts         # Load JSON context files
    ├── pattern-matcher.ts        # Regex pattern matching
    ├── confidence-scorer.ts      # Deterministic scoring
    ├── decision-logger.ts        # JSONL logging
    ├── categorizer.module.ts     # NestJS module
    └── interfaces/
        └── categorizer.interface.ts
```

## Context Loader (src/agents/transaction-categorizer/context-loader.ts)
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PayeePattern {
  id: string;
  regex: string;
  accountCode: string;
  accountName: string;
  confidence: number;
  vatType: string;
  flagForReview?: boolean;
  reviewReason?: string;
}

export interface ChartOfAccountsEntry {
  code: string;
  name: string;
  type: string;
  category: string;
}

export interface AgentContext {
  patterns: PayeePattern[];
  chartOfAccounts: ChartOfAccountsEntry[];
  autoApplyThreshold: number;
}

@Injectable()
export class ContextLoader implements OnModuleInit {
  private readonly logger = new Logger(ContextLoader.name);
  private context: AgentContext | null = null;
  private readonly contextPath = path.join(process.cwd(), '.claude/context');

  async onModuleInit(): Promise<void> {
    await this.loadContext();
  }

  async loadContext(): Promise<AgentContext> {
    try {
      const [patternsRaw, coaRaw] = await Promise.all([
        fs.readFile(path.join(this.contextPath, 'payee_patterns.json'), 'utf-8'),
        fs.readFile(path.join(this.contextPath, 'chart_of_accounts.json'), 'utf-8'),
      ]);

      const patterns = JSON.parse(patternsRaw) as { patterns: PayeePattern[]; autoApplyConfidenceThreshold: number };
      const coa = JSON.parse(coaRaw) as { accounts: ChartOfAccountsEntry[] };

      this.context = {
        patterns: patterns.patterns,
        chartOfAccounts: coa.accounts,
        autoApplyThreshold: patterns.autoApplyConfidenceThreshold * 100, // Convert to 0-100 scale
      };

      this.logger.log(`Loaded ${this.context.patterns.length} patterns, ${this.context.chartOfAccounts.length} accounts`);
      return this.context;
    } catch (error) {
      throw new Error(`Failed to load agent context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getContext(): AgentContext {
    if (!this.context) {
      throw new Error('Context not loaded. Call loadContext() first or wait for module init.');
    }
    return this.context;
  }

  getPattern(accountCode: string): PayeePattern | undefined {
    return this.context?.patterns.find(p => p.accountCode === accountCode);
  }

  getAccount(code: string): ChartOfAccountsEntry | undefined {
    return this.context?.chartOfAccounts.find(a => a.code === code);
  }
}
```

## Pattern Matcher (src/agents/transaction-categorizer/pattern-matcher.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ContextLoader, PayeePattern } from './context-loader';

export interface PatternMatch {
  pattern: PayeePattern;
  matchedText: string;
  confidence: number;
}

@Injectable()
export class PatternMatcher {
  private readonly logger = new Logger(PatternMatcher.name);
  private compiledPatterns: Map<string, RegExp> = new Map();

  constructor(private readonly contextLoader: ContextLoader) {}

  /**
   * Match payee/description against all patterns
   * Returns matches sorted by confidence (highest first)
   */
  match(payee: string, description: string): PatternMatch[] {
    const context = this.contextLoader.getContext();
    const matches: PatternMatch[] = [];
    const textToMatch = `${payee} ${description}`.toUpperCase();

    for (const pattern of context.patterns) {
      try {
        let regex = this.compiledPatterns.get(pattern.id);
        if (!regex) {
          regex = new RegExp(pattern.regex, 'i');
          this.compiledPatterns.set(pattern.id, regex);
        }

        const match = textToMatch.match(regex);
        if (match) {
          matches.push({
            pattern,
            matchedText: match[0],
            confidence: pattern.confidence * 100, // Convert to 0-100
          });
        }
      } catch (error) {
        this.logger.warn(`Invalid regex pattern ${pattern.id}: ${pattern.regex}`);
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get best match or null if no patterns match
   */
  getBestMatch(payee: string, description: string): PatternMatch | null {
    const matches = this.match(payee, description);
    return matches.length > 0 ? matches[0] : null;
  }
}
```

## Confidence Scorer (src/agents/transaction-categorizer/confidence-scorer.ts)
```typescript
import { Injectable } from '@nestjs/common';

export interface ConfidenceInput {
  patternConfidence: number;       // 0-100 from pattern match
  hasPatternMatch: boolean;
  hasHistoricalMatch: boolean;
  historicalMatchCount: number;    // How many times this payee was categorized similarly
  isAmountTypical: boolean;        // Is amount within typical range for this account
  descriptionQuality: number;      // 0-100 based on description richness
}

@Injectable()
export class ConfidenceScorer {
  /**
   * Calculate deterministic confidence score
   * Formula:
   *   Base: pattern confidence * 0.6 (max 60 points)
   *   Historical: +25 points if historical match, +5 per additional match (max 30)
   *   Typical amount: +10 points
   *   Description quality: +0-10 points based on description richness
   */
  calculate(input: ConfidenceInput): number {
    let score = 0;

    // Pattern match contribution (0-60 points)
    if (input.hasPatternMatch) {
      score += input.patternConfidence * 0.6;
    }

    // Historical match contribution (0-30 points)
    if (input.hasHistoricalMatch) {
      score += 25;
      score += Math.min(5, input.historicalMatchCount - 1) * 1; // +1 per additional match, max +5
    }

    // Typical amount (0-10 points)
    if (input.isAmountTypical) {
      score += 10;
    }

    // Description quality bonus (0-10 points)
    score += (input.descriptionQuality / 100) * 10;

    // Clamp to 0-100
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Determine if confidence meets auto-apply threshold
   */
  meetsAutoApplyThreshold(confidence: number, threshold: number = 80): boolean {
    return confidence >= threshold;
  }
}
```

## Decision Logger (src/agents/transaction-categorizer/decision-logger.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DecisionLogEntry {
  timestamp: string;
  agent: 'transaction-categorizer';
  tenantId: string;
  transactionId: string;
  decision: 'categorize' | 'escalate' | 'skip';
  accountCode?: string;
  accountName?: string;
  confidence: number;
  source: 'PATTERN' | 'HISTORICAL' | 'FALLBACK';
  autoApplied: boolean;
  reasoning: string;
  patternId?: string;
}

@Injectable()
export class DecisionLogger {
  private readonly logger = new Logger(DecisionLogger.name);
  private readonly logPath = path.join(process.cwd(), '.claude/logs/decisions.jsonl');

  async log(entry: Omit<DecisionLogEntry, 'timestamp' | 'agent'>): Promise<void> {
    const fullEntry: DecisionLogEntry = {
      timestamp: new Date().toISOString(),
      agent: 'transaction-categorizer',
      ...entry,
    };

    try {
      await fs.appendFile(this.logPath, JSON.stringify(fullEntry) + '\n');
    } catch (error) {
      // Log to console but don't fail - logging is non-critical
      this.logger.error(`Failed to write decision log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async logEscalation(
    tenantId: string,
    transactionId: string,
    reason: string,
    suggestedAccount?: string,
    confidence?: number,
  ): Promise<void> {
    const escalationPath = path.join(process.cwd(), '.claude/logs/escalations.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      agent: 'transaction-categorizer',
      tenantId,
      transactionId,
      type: 'LOW_CONFIDENCE_CATEGORIZATION',
      reason,
      suggestedAccount,
      confidence,
      status: 'pending',
    };

    try {
      await fs.appendFile(escalationPath, JSON.stringify(entry) + '\n');
    } catch (error) {
      this.logger.error(`Failed to write escalation log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
```

## Main Agent (src/agents/transaction-categorizer/categorizer.agent.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { VatType } from '@prisma/client';
import { ContextLoader } from './context-loader';
import { PatternMatcher } from './pattern-matcher';
import { ConfidenceScorer, ConfidenceInput } from './confidence-scorer';
import { DecisionLogger } from './decision-logger';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface CategorizationResult {
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  reasoning: string;
  vatType: VatType;
  isSplit: boolean;
  autoApplied: boolean;
  patternId?: string;
}

@Injectable()
export class TransactionCategorizerAgent {
  private readonly logger = new Logger(TransactionCategorizerAgent.name);

  constructor(
    private readonly contextLoader: ContextLoader,
    private readonly patternMatcher: PatternMatcher,
    private readonly confidenceScorer: ConfidenceScorer,
    private readonly decisionLogger: DecisionLogger,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Categorize a transaction using pattern matching and historical analysis
   */
  async categorize(transaction: Transaction, tenantId: string): Promise<CategorizationResult> {
    const context = this.contextLoader.getContext();
    const payee = transaction.payeeName || '';
    const description = transaction.description || '';

    // 1. Try pattern matching
    const patternMatch = this.patternMatcher.getBestMatch(payee, description);

    // 2. Check historical categorizations for this payee
    const historicalMatch = await this.getHistoricalCategorization(tenantId, payee);

    // 3. Calculate confidence score
    const confidenceInput: ConfidenceInput = {
      patternConfidence: patternMatch?.confidence || 0,
      hasPatternMatch: patternMatch !== null,
      hasHistoricalMatch: historicalMatch !== null,
      historicalMatchCount: historicalMatch?.count || 0,
      isAmountTypical: await this.isAmountTypical(tenantId, patternMatch?.pattern.accountCode, transaction.amountCents),
      descriptionQuality: this.calculateDescriptionQuality(description),
    };

    const confidence = this.confidenceScorer.calculate(confidenceInput);
    const meetsThreshold = this.confidenceScorer.meetsAutoApplyThreshold(confidence, context.autoApplyThreshold);

    // 4. Determine account code and name
    let accountCode: string;
    let accountName: string;
    let vatType: VatType;
    let reasoning: string;
    let source: 'PATTERN' | 'HISTORICAL' | 'FALLBACK';

    if (patternMatch) {
      accountCode = patternMatch.pattern.accountCode;
      accountName = patternMatch.pattern.accountName;
      vatType = this.mapVatType(patternMatch.pattern.vatType);
      reasoning = `Matched pattern "${patternMatch.pattern.id}": ${patternMatch.matchedText}`;
      source = 'PATTERN';
    } else if (historicalMatch) {
      accountCode = historicalMatch.accountCode;
      accountName = historicalMatch.accountName;
      vatType = VatType.STANDARD; // Default for historical
      reasoning = `Historical match: ${historicalMatch.count} similar transactions`;
      source = 'HISTORICAL';
    } else {
      // Fallback based on credit/debit
      if (transaction.isCredit) {
        accountCode = '4100';
        accountName = 'Other Income';
        vatType = VatType.EXEMPT;
      } else {
        accountCode = '8100';
        accountName = 'General Expenses';
        vatType = VatType.STANDARD;
      }
      reasoning = 'No pattern or historical match - using default account';
      source = 'FALLBACK';
    }

    // 5. Check if pattern requires review
    const requiresReview = patternMatch?.pattern.flagForReview || false;

    // 6. Log decision
    const autoApplied = meetsThreshold && !requiresReview;
    await this.decisionLogger.log({
      tenantId,
      transactionId: transaction.id,
      decision: autoApplied ? 'categorize' : 'escalate',
      accountCode,
      accountName,
      confidence,
      source,
      autoApplied,
      reasoning,
      patternId: patternMatch?.pattern.id,
    });

    // 7. Log escalation if needed
    if (!meetsThreshold || requiresReview) {
      const escalationReason = requiresReview
        ? patternMatch?.pattern.reviewReason || 'Pattern requires review'
        : `Confidence ${confidence}% below threshold ${context.autoApplyThreshold}%`;
      await this.decisionLogger.logEscalation(tenantId, transaction.id, escalationReason, accountCode, confidence);
    }

    return {
      accountCode,
      accountName,
      confidenceScore: confidence,
      reasoning,
      vatType,
      isSplit: false,
      autoApplied,
      patternId: patternMatch?.pattern.id,
    };
  }

  private async getHistoricalCategorization(tenantId: string, payee: string): Promise<{
    accountCode: string;
    accountName: string;
    count: number;
  } | null> {
    if (!payee) return null;

    const result = await this.prisma.categorization.groupBy({
      by: ['accountCode', 'accountName'],
      where: {
        transaction: {
          tenantId,
          payeeName: { contains: payee, mode: 'insensitive' },
          isDeleted: false,
        },
      },
      _count: true,
      orderBy: { _count: { accountCode: 'desc' } },
      take: 1,
    });

    if (result.length === 0) return null;

    return {
      accountCode: result[0].accountCode,
      accountName: result[0].accountName,
      count: result[0]._count,
    };
  }

  private async isAmountTypical(tenantId: string, accountCode: string | undefined, amountCents: number): Promise<boolean> {
    if (!accountCode) return false;

    // Get average and stddev for this account
    const stats = await this.prisma.transaction.aggregate({
      where: {
        tenantId,
        categorization: { accountCode },
        isDeleted: false,
      },
      _avg: { amountCents: true },
      _count: true,
    });

    if (!stats._avg.amountCents || stats._count < 3) return true; // Not enough data

    const avg = stats._avg.amountCents;
    // Consider typical if within 2x of average
    return amountCents >= avg * 0.5 && amountCents <= avg * 2;
  }

  private calculateDescriptionQuality(description: string): number {
    if (!description) return 0;
    const words = description.split(/\s+/).filter(w => w.length > 2).length;
    // More words = better quality, max 100 at 10+ words
    return Math.min(100, words * 10);
  }

  private mapVatType(type: string): VatType {
    switch (type.toUpperCase()) {
      case 'STANDARD': return VatType.STANDARD;
      case 'ZERO_RATED': return VatType.ZERO_RATED;
      case 'EXEMPT': return VatType.EXEMPT;
      case 'NO_VAT': return VatType.NO_VAT;
      default: return VatType.STANDARD;
    }
  }
}
```

## NestJS Module (src/agents/transaction-categorizer/categorizer.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { TransactionCategorizerAgent } from './categorizer.agent';
import { ContextLoader } from './context-loader';
import { PatternMatcher } from './pattern-matcher';
import { ConfidenceScorer } from './confidence-scorer';
import { DecisionLogger } from './decision-logger';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [
    TransactionCategorizerAgent,
    ContextLoader,
    PatternMatcher,
    ConfidenceScorer,
    DecisionLogger,
  ],
  exports: [TransactionCategorizerAgent],
})
export class TransactionCategorizerModule {}
```

## Agent Skill Doc (.claude/agents/transaction-categorizer/categorize-transaction.md)
```markdown
# Transaction Categorizer Agent Skill

## Purpose
Categorize bank transactions into Chart of Accounts categories using pattern matching
and historical analysis.

## Context Files Required
- .claude/context/payee_patterns.json - Regex patterns for payee matching
- .claude/context/chart_of_accounts.json - Valid account codes and names

## Algorithm
1. Load context (patterns, chart of accounts)
2. Match transaction payee/description against regex patterns
3. Check historical categorizations for similar payees
4. Calculate confidence score (0-100):
   - Pattern match: up to 60 points (pattern confidence * 0.6)
   - Historical match: up to 30 points (25 base + 5 bonus)
   - Typical amount: up to 10 points
5. If confidence >= 80%: Auto-apply categorization
6. If confidence < 80%: Escalate for human review

## Autonomy Level
- L3 (Full Auto): confidence >= 80% AND pattern doesn't require review
- L1 (Suggest Only): confidence < 80% OR pattern flagged for review

## Decision Logging
All decisions logged to .claude/logs/decisions.jsonl with:
- Transaction ID
- Account code assigned
- Confidence score
- Pattern matched (if any)
- Reasoning explanation

## Escalations
Low-confidence or flagged transactions logged to .claude/logs/escalations.jsonl
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database - NO MOCKS.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { TransactionCategorizerAgent } from '../../src/agents/transaction-categorizer/categorizer.agent';
import { ContextLoader } from '../../src/agents/transaction-categorizer/context-loader';
import { PatternMatcher } from '../../src/agents/transaction-categorizer/pattern-matcher';
import { ConfidenceScorer } from '../../src/agents/transaction-categorizer/confidence-scorer';
import { DecisionLogger } from '../../src/agents/transaction-categorizer/decision-logger';
import { Tenant, Transaction, VatType } from '@prisma/client';

describe('TransactionCategorizerAgent', () => {
  let agent: TransactionCategorizerAgent;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
    agent = module.get<TransactionCategorizerAgent>(TransactionCategorizerAgent);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Categorizer Test Creche',
        email: 'cat@test.co.za',
        taxStatus: 'VAT_REGISTERED',
      },
    });
  });

  afterAll(async () => {
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
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBe('8100');
      expect(result.accountName).toContain('Bank');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
      expect(result.autoApplied).toBe(true);
    });

    it('should categorize utilities correctly', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 150000,
          isCredit: false,
          description: 'ESKOM PREPAID',
          payeeName: 'ESKOM',
          bankAccount: 'FNB-001',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.accountCode).toBe('5200');
      expect(result.vatType).toBe(VatType.STANDARD);
    });

    it('should escalate low-confidence transactions', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 25000,
          isCredit: false,
          description: 'UNKNOWN PAYMENT ABC123',
          payeeName: 'UNKNOWN',
          bankAccount: 'FNB-001',
        },
      });

      const result = await agent.categorize(transaction, testTenant.id);

      expect(result.confidenceScore).toBeLessThan(80);
      expect(result.autoApplied).toBe(false);
    });

    it('should use historical match when no pattern matches', async () => {
      // Create historical categorization
      const historicalTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date(),
          amountCents: 10000,
          isCredit: false,
          description: 'ACME SUPPLIES',
          payeeName: 'ACME',
          bankAccount: 'FNB-001',
        },
      });
      await prisma.categorization.create({
        data: {
          transactionId: historicalTx.id,
          accountCode: '5300',
          accountName: 'Educational Supplies',
          confidenceScore: 95,
          source: 'USER_OVERRIDE',
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
          payeeName: 'ACME',
          bankAccount: 'FNB-001',
        },
      });

      const result = await agent.categorize(newTx, testTenant.id);

      expect(result.accountCode).toBe('5300');
      expect(result.reasoning).toContain('Historical');
    });
  });
});

describe('PatternMatcher', () => {
  let matcher: PatternMatcher;
  let contextLoader: ContextLoader;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PatternMatcher, ContextLoader],
    }).compile();

    contextLoader = module.get<ContextLoader>(ContextLoader);
    matcher = module.get<PatternMatcher>(PatternMatcher);
    await contextLoader.loadContext();
  });

  it('should match FNB bank charges', () => {
    const matches = matcher.match('FNB', 'FNB CHEQUE MONTHLY');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.accountCode).toBe('8100');
  });

  it('should match SARS payments', () => {
    const matches = matcher.match('SARS', 'SARS PAYMENT');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].pattern.flagForReview).toBe(true);
  });

  it('should return empty for no match', () => {
    const matches = matcher.match('RANDOM', 'RANDOM PAYMENT XYZ');
    expect(matches.length).toBe(0);
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

    expect(score).toBeLessThan(20);
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- Pattern matching works with .claude/context/payee_patterns.json
- Confidence >= 80% results in autoApplied = true
- Confidence < 80% results in autoApplied = false and escalation logged
- All decisions logged to .claude/logs/decisions.jsonl
- Escalations logged to .claude/logs/escalations.jsonl
- Historical matching works for repeat payees
- VAT types correctly mapped from patterns
- SARS payments flagged for review (per pattern config)
- No 'any' types used
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="transaction-categorizer" --verbose
</test_commands>

</task_spec>
