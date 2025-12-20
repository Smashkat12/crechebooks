<task_spec id="TASK-TRANS-012" version="2.0">

<metadata>
  <title>Transaction Categorization Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>17</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
    <requirement_ref>REQ-TRANS-004</requirement_ref>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
    <requirement_ref>REQ-TRANS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-002</task_ref>
    <task_ref>TASK-TRANS-003</task_ref>
    <task_ref>TASK-TRANS-011</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<critical_context>
## MUST READ BEFORE IMPLEMENTING

This is the CrecheBooks AI Bookkeeping System for South African creches.

### Project Standards (from specs/constitution.md)
- **Framework**: NestJS 10.x with TypeScript
- **Database**: PostgreSQL 16.x with Prisma ORM
- **Monetary values**: ALL money as integers (cents) - NEVER use floats
- **Financial calculations**: Use Decimal.js with banker's rounding
- **Currency**: ZAR (South African Rand) only
- **VAT Rate**: 15%
- **No 'any' type**: Use proper typing or 'unknown'
- **Fail-fast**: All errors logged with context before re-throwing
- **Multi-tenant**: ALL queries must filter by tenantId

### Test Requirements
- **NO MOCK DATA**: Use REAL PostgreSQL database
- **Run with --runInBand**: Prevent parallel database conflicts
- **Test cleanup order**: Delete child tables before parents (FK constraints)

### Error Handling Pattern (MANDATORY)
```typescript
try {
  // operation
} catch (error) {
  this.logger.error(
    `Failed to [operation]: ${JSON.stringify(context)}`,
    error instanceof Error ? error.stack : String(error),
  );
  throw error; // Re-throw - NEVER swallow errors
}
```
</critical_context>

<current_codebase_state>
## Actual File Paths (as of 2025-12-20)

### Source Structure
```
src/
├── config/
│   ├── queue.config.ts           # Bull queue config - QUEUE_NAMES.CATEGORIZATION exists
│   └── index.ts
├── database/
│   ├── dto/
│   │   ├── categorization.dto.ts # CreateCategorizationDto, UpdateCategorizationDto, ReviewCategorizationDto
│   │   ├── payee-pattern.dto.ts  # CreatePayeePatternDto, UpdatePayeePatternDto
│   │   ├── transaction.dto.ts    # CreateTransactionDto, TransactionFilterDto
│   │   ├── import.dto.ts         # ParsedTransaction, ImportResult
│   │   └── index.ts
│   ├── entities/
│   │   ├── categorization.entity.ts  # VatType, CategorizationSource, ICategorization
│   │   ├── payee-pattern.entity.ts   # IPayeePattern
│   │   ├── transaction.entity.ts     # ImportSource, TransactionStatus, ITransaction
│   │   └── index.ts
│   ├── repositories/
│   │   ├── categorization.repository.ts   # EXISTING - needs new methods
│   │   ├── payee-pattern.repository.ts    # EXISTING - has findByPayeeName, findByTenant
│   │   ├── transaction.repository.ts      # EXISTING - needs findByIds method
│   │   └── index.ts
│   ├── services/
│   │   ├── audit-log.service.ts
│   │   ├── transaction-import.service.ts  # COMPLETED in TASK-TRANS-011
│   │   └── index.ts
│   ├── parsers/                  # CSV/PDF parsers from TASK-TRANS-011
│   ├── prisma/
│   │   └── prisma.service.ts
│   └── database.module.ts
└── shared/
    └── exceptions/
        └── index.ts              # ValidationException, NotFoundException, BusinessException, DatabaseException
```

### Test Structure
```
tests/
└── database/
    ├── repositories/
    │   ├── categorization.repository.spec.ts
    │   └── payee-pattern.repository.spec.ts
    └── services/
        ├── transaction-import.service.spec.ts  # 10 tests - reference pattern
        └── [NEW] categorization.service.spec.ts
```

### Existing Enums
```typescript
// src/database/entities/categorization.entity.ts
export enum VatType {
  STANDARD = 'STANDARD',
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}

export enum CategorizationSource {
  AI_AUTO = 'AI_AUTO',
  AI_SUGGESTED = 'AI_SUGGESTED',
  USER_OVERRIDE = 'USER_OVERRIDE',
  RULE_BASED = 'RULE_BASED',
}

// src/database/entities/transaction.entity.ts
export enum TransactionStatus {
  PENDING = 'PENDING',
  CATEGORIZED = 'CATEGORIZED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  SYNCED = 'SYNCED',
}
```

### Existing Repository Methods

#### CategorizationRepository (src/database/repositories/categorization.repository.ts)
- `create(dto: CreateCategorizationDto): Promise<Categorization>`
- `findById(id: string): Promise<Categorization | null>`
- `findByTransaction(transactionId: string): Promise<Categorization[]>`
- `findPendingReview(tenantId: string): Promise<Categorization[]>`
- `findWithFilters(tenantId: string, filter: CategorizationFilterDto): Promise<PaginatedCategorizationResult>`
- `review(id: string, dto: ReviewCategorizationDto): Promise<Categorization>`
- `update(id: string, dto: UpdateCategorizationDto): Promise<Categorization>`
- `delete(id: string): Promise<void>`

#### PayeePatternRepository (src/database/repositories/payee-pattern.repository.ts)
- `create(dto: CreatePayeePatternDto): Promise<PayeePattern>`
- `findById(id: string): Promise<PayeePattern | null>`
- `findByTenant(tenantId: string, filter: PayeePatternFilterDto): Promise<PayeePattern[]>`
- `findByPayeeName(tenantId: string, payeeName: string): Promise<PayeePattern | null>`
- `incrementMatchCount(id: string): Promise<PayeePattern>`
- `update(id: string, dto: UpdatePayeePatternDto): Promise<PayeePattern>`
- `delete(id: string): Promise<void>`

#### TransactionRepository (src/database/repositories/transaction.repository.ts)
- `create(dto: CreateTransactionDto): Promise<Transaction>`
- `createMany(dtos: CreateTransactionDto[]): Promise<Transaction[]>`
- `findById(tenantId: string, id: string): Promise<Transaction | null>`
- `findByTenant(tenantId: string, filter: TransactionFilterDto): Promise<PaginatedResult<Transaction>>`
- `findPending(tenantId: string): Promise<Transaction[]>`
- `update(tenantId: string, id: string, dto: UpdateTransactionDto): Promise<Transaction>`
- `softDelete(tenantId: string, id: string): Promise<Transaction>`
- `markReconciled(tenantId: string, id: string): Promise<Transaction>`

### Queue Configuration (src/config/queue.config.ts)
```typescript
export const QUEUE_NAMES = {
  CATEGORIZATION: 'transaction-categorization',
} as const;
```
</current_codebase_state>

<context>
This task creates the CategorizationService which orchestrates AI-powered transaction
categorization. The service:
1. Loads tenant-specific payee patterns
2. Tries pattern matching FIRST (fast path)
3. Falls back to AI categorization via Claude Code agent
4. Applies confidence thresholds (>=80% auto-apply, <80% review required)
5. Handles split transactions with validation
6. Creates audit trails for all categorizations
7. Queues Xero sync for auto-categorized transactions

This is called from TransactionImportService (TASK-TRANS-011) after transactions are imported.
</context>

<prerequisites>
  <check>TASK-TRANS-002 completed - Categorization entity exists ✅</check>
  <check>TASK-TRANS-003 completed - PayeePattern entity exists ✅</check>
  <check>TASK-TRANS-011 completed - TransactionImportService exists ✅</check>
  <check>CategorizationRepository exists with CRUD methods ✅</check>
  <check>PayeePatternRepository exists with findByPayeeName ✅</check>
  <check>QUEUE_NAMES.CATEGORIZATION defined in queue.config.ts ✅</check>
</prerequisites>

<scope>
  <in_scope>
    - Create CategorizationService in src/database/services/
    - Add findByIds to TransactionRepository
    - Add findRecent and findSimilar to CategorizationRepository
    - Create categorization DTOs for service layer
    - Implement pattern matching using PayeePatternRepository.findByPayeeName
    - Implement AI categorization agent (placeholder - returns structured response)
    - Validate split amounts equal transaction total (to 1 cent)
    - Update transaction status after categorization
    - Add xero-sync queue job for auto-categorized (placeholder)
    - Integration tests using REAL database
  </in_scope>
  <out_of_scope>
    - Pattern learning logic (TASK-TRANS-013)
    - Xero sync implementation (TASK-TRANS-014)
    - Actual Claude API calls (will be placeholder returning structured data)
    - User correction UI
    - Manual categorization endpoint
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/database/services/categorization.service.ts">
      @Injectable()
      export class CategorizationService {
        constructor(
          private readonly transactionRepo: TransactionRepository,
          private readonly categorizationRepo: CategorizationRepository,
          private readonly payeePatternRepo: PayeePatternRepository,
          private readonly auditLogService: AuditLogService,
        )

        async categorizeTransactions(
          transactionIds: string[],
          tenantId: string
        ): Promise&lt;CategorizationBatchResult&gt;

        async categorizeTransaction(
          transactionId: string,
          tenantId: string
        ): Promise&lt;CategorizationItemResult&gt;

        async updateCategorization(
          transactionId: string,
          dto: UserCategorizationDto,
          userId: string,
          tenantId: string
        ): Promise&lt;Transaction&gt;

        async getSuggestions(
          transactionId: string,
          tenantId: string
        ): Promise&lt;CategorySuggestion[]&gt;

        private async tryPatternMatch(
          transaction: Transaction,
          tenantId: string
        ): Promise&lt;PatternMatchResult | null&gt;

        private async invokeAIAgent(
          transaction: Transaction,
          tenantId: string
        ): Promise&lt;AICategorization&gt;

        private validateSplits(
          splits: SplitItem[],
          totalCents: number
        ): void
      }
    </signature>
    <signature file="src/database/dto/categorization-service.dto.ts">
      export interface CategorizationBatchResult {
        totalProcessed: number;
        autoCategorized: number;
        reviewRequired: number;
        failed: number;
        results: CategorizationItemResult[];
        statistics: {
          avgConfidence: number;
          patternMatchRate: number;
        };
      }

      export interface CategorizationItemResult {
        transactionId: string;
        status: 'AUTO_APPLIED' | 'REVIEW_REQUIRED' | 'FAILED';
        accountCode?: string;
        accountName?: string;
        confidenceScore?: number;
        source: CategorizationSource;
        error?: string;
      }

      export interface UserCategorizationDto {
        accountCode: string;
        accountName: string;
        isSplit: boolean;
        splits?: SplitItem[];
        vatType: VatType;
        createPattern?: boolean;
      }

      export interface SplitItem {
        accountCode: string;
        accountName: string;
        amountCents: number;
        vatType: VatType;
        description?: string;
      }

      export interface CategorySuggestion {
        accountCode: string;
        accountName: string;
        confidenceScore: number;
        reason: string;
        source: 'PATTERN' | 'AI' | 'SIMILAR_TX';
      }

      export interface PatternMatchResult {
        pattern: PayeePattern;
        confidenceBoost: number;
      }

      export interface AICategorization {
        accountCode: string;
        accountName: string;
        confidenceScore: number;
        reasoning: string;
        vatType: VatType;
        isSplit: boolean;
        splits?: SplitItem[];
      }
    </signature>
  </signatures>

  <constraints>
    - Confidence threshold for auto-categorization: >= 80%
    - Must check pattern matches BEFORE invoking AI
    - Pattern confidence boost: +15% to AI confidence (if pattern matches)
    - Split amounts must equal transaction total (validate to 1 cent tolerance)
    - Must create audit trail for every categorization
    - Must filter ALL data by tenantId (multi-tenant isolation)
    - Must NOT use 'any' type anywhere
    - Must update transaction status to CATEGORIZED or REVIEW_REQUIRED
    - AI agent timeout: 30 seconds (for future implementation)
    - All monetary calculations use integer cents
  </constraints>

  <verification>
    - Pattern matching correctly uses PayeePatternRepository.findByPayeeName
    - AI agent placeholder returns valid categorizations with confidence scores
    - Confidence threshold correctly separates auto vs review (80%)
    - Split transaction validation prevents amounts != total
    - Categorization audit trail is created via CategorizationRepository.create
    - Transaction status updated correctly
    - Multi-tenant isolation verified in all queries
    - All 15+ tests pass using REAL database (no mocks)
    - Build passes with 0 TypeScript errors
    - Lint passes with 0 errors
  </verification>
</definition_of_done>

<implementation_steps>
## Step 1: Add Missing Repository Methods

### 1a. TransactionRepository.findByIds
Add to `src/database/repositories/transaction.repository.ts`:
```typescript
async findByIds(tenantId: string, ids: string[]): Promise<Transaction[]> {
  try {
    return await this.prisma.transaction.findMany({
      where: {
        id: { in: ids },
        tenantId,
        isDeleted: false,
      },
    });
  } catch (error) {
    this.logger.error(
      `Failed to find transactions by ids: ${ids.join(', ')}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'findByIds',
      'Failed to find transactions',
      error instanceof Error ? error : undefined,
    );
  }
}
```

### 1b. CategorizationRepository.findRecent
Add to `src/database/repositories/categorization.repository.ts`:
```typescript
async findRecent(tenantId: string, limit: number = 100): Promise<Categorization[]> {
  try {
    return await this.prisma.categorization.findMany({
      where: {
        transaction: {
          tenantId,
          isDeleted: false,
        },
        source: { in: [CategorizationSource.AI_AUTO, CategorizationSource.USER_OVERRIDE] },
      },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    this.logger.error(
      `Failed to find recent categorizations for tenant: ${tenantId}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'findRecent',
      'Failed to find recent categorizations',
      error instanceof Error ? error : undefined,
    );
  }
}
```

### 1c. CategorizationRepository.findSimilarByDescription
Add to `src/database/repositories/categorization.repository.ts`:
```typescript
interface SimilarCategorizationResult {
  accountCode: string;
  accountName: string;
  count: number;
}

async findSimilarByDescription(
  tenantId: string,
  description: string,
  limit: number = 5,
): Promise<SimilarCategorizationResult[]> {
  try {
    // Extract keywords from description (first 3 significant words)
    const keywords = description
      .replace(/[^a-zA-Z\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3);

    if (keywords.length === 0) {
      return [];
    }

    const categorizations = await this.prisma.categorization.findMany({
      where: {
        transaction: {
          tenantId,
          isDeleted: false,
          description: {
            contains: keywords[0],
            mode: 'insensitive',
          },
        },
        source: { in: [CategorizationSource.AI_AUTO, CategorizationSource.USER_OVERRIDE] },
      },
      select: {
        accountCode: true,
        accountName: true,
      },
    });

    // Group by accountCode and count
    const counts = new Map<string, { accountCode: string; accountName: string; count: number }>();
    for (const cat of categorizations) {
      const existing = counts.get(cat.accountCode);
      if (existing) {
        existing.count++;
      } else {
        counts.set(cat.accountCode, {
          accountCode: cat.accountCode,
          accountName: cat.accountName,
          count: 1,
        });
      }
    }

    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch (error) {
    this.logger.error(
      `Failed to find similar categorizations for: ${description}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'findSimilarByDescription',
      'Failed to find similar categorizations',
      error instanceof Error ? error : undefined,
    );
  }
}
```

## Step 2: Create Categorization Service DTOs

Create `src/database/dto/categorization-service.dto.ts` with all interfaces from signatures.

## Step 3: Create CategorizationService

Create `src/database/services/categorization.service.ts`:

Key implementation notes:
1. Try pattern match first via `payeePatternRepo.findByPayeeName()`
2. If pattern matches, use pattern's defaultAccountCode + boost confidence
3. If no pattern, call AI agent (placeholder)
4. Apply 80% threshold
5. Create categorization record
6. Update transaction status
7. Log to audit trail

## Step 4: AI Agent Placeholder

For now, the AI agent should return a deterministic categorization based on description keywords:
- "WOOLWORTHS", "CHECKERS", "PICK N PAY" → account code "5100" (Groceries)
- "ELECTRICITY", "ESKOM" → account code "5200" (Utilities)
- "SALARY", "PAYMENT" (credit) → account code "4100" (Fee Income)
- Default → account code "5900" (General Expenses)

This placeholder will be replaced with actual Claude API calls in TASK-AGENT-002.

## Step 5: Update Module

Add to `src/database/database.module.ts`:
```typescript
providers: [
  // ... existing
  CategorizationService,
],
exports: [
  // ... existing
  CategorizationService,
],
```

## Step 6: Integration Tests

Create `tests/database/services/categorization.service.spec.ts`:

Test cases (minimum 15):
1. categorizeTransaction - pattern match found, auto-categorized
2. categorizeTransaction - no pattern, AI fallback, high confidence
3. categorizeTransaction - no pattern, AI fallback, low confidence (review required)
4. categorizeTransactions - batch of 5, mixed results
5. updateCategorization - user override with valid data
6. updateCategorization - split transaction valid
7. updateCategorization - split transaction invalid (amounts don't match)
8. getSuggestions - returns pattern, AI, and similar suggestions
9. validateSplits - amounts equal total passes
10. validateSplits - amounts don't equal total throws
11. transaction status updated to CATEGORIZED after auto
12. transaction status updated to REVIEW_REQUIRED after low confidence
13. multi-tenant isolation - tenant A cannot see tenant B data
14. non-existent transaction throws NotFoundException
15. categorization audit trail created

Follow test pattern from `tests/database/services/transaction-import.service.spec.ts`.
</implementation_steps>

<test_cleanup_order>
CRITICAL: Clean tables in this exact order in beforeEach:
```typescript
beforeEach(async () => {
  await prisma.reconciliation.deleteMany({});
  await prisma.sarsSubmission.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.child.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
});
```
</test_cleanup_order>

<files_to_create>
  <file path="src/database/dto/categorization-service.dto.ts">Service-layer DTOs for categorization</file>
  <file path="src/database/services/categorization.service.ts">Main categorization service</file>
  <file path="tests/database/services/categorization.service.spec.ts">Integration tests (15+ tests)</file>
</files_to_create>

<files_to_modify>
  <file path="src/database/repositories/transaction.repository.ts">Add findByIds method</file>
  <file path="src/database/repositories/categorization.repository.ts">Add findRecent, findSimilarByDescription methods</file>
  <file path="src/database/database.module.ts">Register CategorizationService</file>
  <file path="src/database/services/index.ts">Export CategorizationService</file>
  <file path="src/database/dto/index.ts">Export new DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Pattern matching uses existing PayeePatternRepository.findByPayeeName</criterion>
  <criterion>AI agent placeholder returns deterministic categorizations</criterion>
  <criterion>Confidence threshold (80%) correctly separates auto vs review</criterion>
  <criterion>Split transactions validate amounts equal total (1 cent tolerance)</criterion>
  <criterion>Transaction status updated to CATEGORIZED or REVIEW_REQUIRED</criterion>
  <criterion>Multi-tenant isolation verified in all queries</criterion>
  <criterion>All 15+ tests pass using REAL database</criterion>
  <criterion>Build passes: npm run build</criterion>
  <criterion>Lint passes: npm run lint</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm test -- --testPathPatterns="tests/database/services/categorization" --runInBand</command>
  <command>npm test -- --runInBand</command>
</test_commands>

<anti_patterns_to_avoid>
- NO mock data - use real PostgreSQL database
- NO 'any' type - use proper TypeScript types
- NO swallowing errors - always log and re-throw
- NO backwards compatibility hacks - fail fast
- NO floating point for money - always use integer cents
- NO skipping tenantId checks - multi-tenant isolation is mandatory
</anti_patterns_to_avoid>

</task_spec>
