<task_spec id="TASK-PAY-011" version="2.0">

<metadata>
  <title>Payment Matching Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>24</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
    <requirement_ref>REQ-PAY-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<!-- ============================================================
     CRITICAL IMPLEMENTATION RULES
     ============================================================ -->

<implementation_rules>
  <rule id="NO_BACKWARDS_COMPAT">NO backwards compatibility code. System must work or FAIL FAST with clear errors.</rule>
  <rule id="NO_WORKAROUNDS">NO workarounds or fallbacks. If something fails, throw BusinessException with details.</rule>
  <rule id="NO_MOCK_DATA">Tests use REAL database. Only mock EXTERNAL services (APIs that require credentials).</rule>
  <rule id="FAIL_FAST">All errors must throw immediately with full context for debugging.</rule>
  <rule id="TENANT_ISOLATION">ALL operations MUST filter by tenantId - no cross-tenant data access.</rule>
  <rule id="DECIMAL_JS">ALL monetary calculations use Decimal.js with banker's rounding.</rule>
</implementation_rules>

<!-- ============================================================
     PROJECT CONTEXT (Current State as of 2025-12-20)
     ============================================================ -->

<project_context>
  <test_count>874 tests currently passing</test_count>
  <completed_tasks>
    - TASK-PAY-001: Payment entity and repository (complete)
    - TASK-BILL-003: Invoice and InvoiceLine entities (complete)
    - TASK-TRANS-001: Transaction entity (complete)
    - TASK-BILL-011: Enrollment Management Service (complete)
    - TASK-BILL-012: Invoice Generation Service (complete)
    - TASK-BILL-013: Invoice Delivery Service (complete)
    - TASK-BILL-014: Pro-rata Calculation Service (complete)
  </completed_tasks>

  <file_structure>
    Services go in: src/database/services/
    DTOs go in: src/database/dto/
    Repositories are in: src/database/repositories/
    Entities are in: src/database/entities/
    Tests go in: tests/database/services/
    Module: src/database/database.module.ts
    Constants: src/database/constants/
  </file_structure>

  <available_repositories>
    - PaymentRepository: src/database/repositories/payment.repository.ts
    - InvoiceRepository: src/database/repositories/invoice.repository.ts
    - TransactionRepository: src/database/repositories/transaction.repository.ts
    - ParentRepository: src/database/repositories/parent.repository.ts
  </available_repositories>

  <exception_classes>
    All in src/shared/exceptions/base.exception.ts:
    - NotFoundException(resource, identifier)
    - BusinessException(message, code, details?)
    - DatabaseException(operation, message, originalError?)
    - ConflictException(message, details?)
  </exception_classes>
</project_context>

<!-- ============================================================
     EXISTING ENTITY SCHEMAS (For Reference)
     ============================================================ -->

<existing_entities>
  <entity name="Payment" file="src/database/entities/payment.entity.ts">
    ```typescript
    export enum MatchType {
      EXACT = 'EXACT',
      PARTIAL = 'PARTIAL',
      MANUAL = 'MANUAL',
      OVERPAYMENT = 'OVERPAYMENT',
    }

    export enum MatchedBy {
      AI_AUTO = 'AI_AUTO',
      USER = 'USER',
    }

    export interface IPayment {
      id: string;
      tenantId: string;
      xeroPaymentId: string | null;
      transactionId: string | null;
      invoiceId: string;
      amountCents: number;
      paymentDate: Date;
      reference: string | null;
      matchType: MatchType;
      matchConfidence: number | null;  // 0-100
      matchedBy: MatchedBy;
      isReversed: boolean;
      reversedAt: Date | null;
      reversalReason: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
    ```
  </entity>

  <entity name="Invoice" file="src/database/entities/invoice.entity.ts">
    ```typescript
    export interface IInvoice {
      id: string;
      tenantId: string;
      invoiceNumber: string;  // Format: INV-YYYY-NNNNN
      parentId: string;
      childId: string;
      totalCents: number;
      amountPaidCents: number;  // Track how much has been paid
      status: InvoiceStatus;  // DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, VOID
      dueDate: Date;
      // ... other fields
    }
    ```
  </entity>

  <entity name="Transaction" file="src/database/entities/transaction.entity.ts">
    ```typescript
    export interface ITransaction {
      id: string;
      tenantId: string;
      description: string;
      payeeName: string | null;  // Bank description - may contain parent name
      reference: string | null;  // May contain invoice number
      amountCents: number;  // Negative for debits, positive for credits
      isCredit: boolean;
      date: Date;
      status: TransactionStatus;
      isReconciled: boolean;
      // ... other fields
    }
    ```
  </entity>

  <entity name="Parent" file="src/database/entities/parent.entity.ts">
    ```typescript
    export interface IParent {
      id: string;
      tenantId: string;
      firstName: string;
      lastName: string;
      // Full name for matching: `${firstName} ${lastName}`
    }
    ```
  </entity>
</existing_entities>

<!-- ============================================================
     EXISTING REPOSITORY METHODS (For Reference)
     ============================================================ -->

<existing_repository_methods>
  <repository name="PaymentRepository" file="src/database/repositories/payment.repository.ts">
    - create(dto: CreatePaymentDto): Promise&lt;Payment&gt;
    - findById(id: string): Promise&lt;Payment | null&gt;
    - findByTransactionId(transactionId: string): Promise&lt;Payment[]&gt;
    - findByInvoiceId(invoiceId: string): Promise&lt;Payment[]&gt;
    - findByTenantId(tenantId: string, filter?: PaymentFilterDto): Promise&lt;Payment[]&gt;
    - calculateTotalPaidForInvoice(invoiceId: string): Promise&lt;number&gt;
  </repository>

  <repository name="InvoiceRepository" file="src/database/repositories/invoice.repository.ts">
    - findById(id: string): Promise&lt;Invoice | null&gt;
    - findByInvoiceNumber(tenantId: string, invoiceNumber: string): Promise&lt;Invoice | null&gt;
    - findByTenant(tenantId: string, filter: InvoiceFilterDto): Promise&lt;Invoice[]&gt;
    - findByStatus(tenantId: string, status: InvoiceStatus): Promise&lt;Invoice[]&gt;
    - findOverdue(tenantId: string): Promise&lt;Invoice[]&gt;
    - recordPayment(id: string, amountCents: number): Promise&lt;Invoice&gt;
  </repository>

  <repository name="TransactionRepository" file="src/database/repositories/transaction.repository.ts">
    - findById(tenantId: string, id: string): Promise&lt;Transaction | null&gt;
    - findByIds(tenantId: string, ids: string[]): Promise&lt;Transaction[]&gt;
    - findByTenant(tenantId: string, filter: TransactionFilterDto): Promise&lt;PaginatedResult&lt;Transaction&gt;&gt;
  </repository>

  <repository name="ParentRepository" file="src/database/repositories/parent.repository.ts">
    - findById(id: string): Promise&lt;Parent | null&gt;
  </repository>
</existing_repository_methods>

<!-- ============================================================
     TASK CONTEXT
     ============================================================ -->

<context>
This task creates the PaymentMatchingService which matches bank transactions (credits)
to outstanding invoices. The service uses a confidence scoring algorithm to identify matches:

- **Exact Match (100%)**: Transaction reference exactly matches invoice number AND amounts match
- **High Confidence (80-99%)**: Reference partial match + amount match + name similarity
- **Medium Confidence (50-79%)**: Amount match + name similarity
- **Low Confidence (&lt;50%)**: Weak correlation - flagged for manual review

Auto-apply rules:
- Single exact match (100%): Auto-apply immediately
- Single high-confidence match (>=80%): Auto-apply immediately
- Multiple high-confidence matches: Flag for review (ambiguous)
- Low confidence: Flag for review

This is a DETERMINISTIC matching service (no AI agent integration in this task).
AI agent integration will be added in TASK-AGENT-003.
</context>

<!-- ============================================================
     SCOPE
     ============================================================ -->

<scope>
  <in_scope>
    - Create PaymentMatchingService in src/database/services/
    - Create payment-matching.dto.ts in src/database/dto/
    - Implement matchPayments() - orchestrates matching for batch of transactions
    - Implement findExactMatches() - reference + amount exact matching
    - Implement findPartialMatches() - fuzzy matching on name/amount
    - Implement calculateConfidence() - scoring algorithm
    - Implement autoApplyMatch() - creates Payment record and updates Invoice
    - String similarity function for fuzzy name matching
    - Comprehensive integration tests using real database
    - Add to database.module.ts providers/exports
    - Add export to services/index.ts
    - Add export to dto/index.ts
  </in_scope>

  <out_of_scope>
    - AI agent integration (TASK-AGENT-003)
    - Payment allocation for partial/split payments (TASK-PAY-012)
    - Arrears calculation (TASK-PAY-013)
    - API endpoints (TASK-PAY-031)
    - Xero synchronization
  </out_of_scope>
</scope>

<!-- ============================================================
     DEFINITION OF DONE - File Signatures
     ============================================================ -->

<definition_of_done>
  <signatures>
    <signature file="src/database/dto/payment-matching.dto.ts">
      ```typescript
      import { IsUUID, IsArray, IsOptional, IsInt, Min } from 'class-validator';

      /**
       * Match type for confidence scoring
       */
      export enum MatchConfidenceLevel {
        EXACT = 'EXACT',           // 100% - reference + amount exact
        HIGH = 'HIGH',             // 80-99% - strong correlation
        MEDIUM = 'MEDIUM',         // 50-79% - moderate correlation
        LOW = 'LOW',               // &lt;50% - weak correlation
      }

      /**
       * Candidate match for a transaction
       */
      export interface MatchCandidate {
        transactionId: string;
        invoiceId: string;
        invoiceNumber: string;
        confidenceLevel: MatchConfidenceLevel;
        confidenceScore: number;  // 0-100
        matchReasons: string[];   // Human-readable explanations
        parentId: string;
        parentName: string;
        childName: string;
        invoiceOutstandingCents: number;
        transactionAmountCents: number;
      }

      /**
       * Result of matching a single transaction
       */
      export interface TransactionMatchResult {
        transactionId: string;
        status: 'AUTO_APPLIED' | 'REVIEW_REQUIRED' | 'NO_MATCH';
        appliedMatch?: AppliedMatch;
        candidates?: MatchCandidate[];  // For review
        reason: string;
      }

      /**
       * Successfully applied match
       */
      export interface AppliedMatch {
        paymentId: string;
        transactionId: string;
        invoiceId: string;
        invoiceNumber: string;
        amountCents: number;
        confidenceScore: number;
      }

      /**
       * Batch matching result
       */
      export interface MatchingBatchResult {
        processed: number;
        autoApplied: number;
        reviewRequired: number;
        noMatch: number;
        results: TransactionMatchResult[];
      }

      /**
       * DTO for initiating batch matching
       */
      export class MatchPaymentsDto {
        @IsUUID()
        tenantId!: string;

        @IsOptional()
        @IsArray()
        @IsUUID('4', { each: true })
        transactionIds?: string[];  // If empty, match all unallocated credits
      }

      /**
       * DTO for manually applying a suggested match
       */
      export class ApplyMatchDto {
        @IsUUID()
        tenantId!: string;

        @IsUUID()
        transactionId!: string;

        @IsUUID()
        invoiceId!: string;

        @IsOptional()
        @IsInt()
        @Min(1)
        amountCents?: number;  // Optional override for partial payment
      }
      ```
    </signature>

    <signature file="src/database/services/payment-matching.service.ts">
      ```typescript
      import { Injectable, Logger } from '@nestjs/common';
      import Decimal from 'decimal.js';
      import { Payment, Invoice, Transaction, Parent, Child } from '@prisma/client';
      import { PrismaService } from '../prisma/prisma.service';
      import { PaymentRepository } from '../repositories/payment.repository';
      import { InvoiceRepository } from '../repositories/invoice.repository';
      import { TransactionRepository } from '../repositories/transaction.repository';
      import { ParentRepository } from '../repositories/parent.repository';
      import { AuditLogService } from './audit-log.service';
      import {
        MatchingBatchResult,
        TransactionMatchResult,
        MatchCandidate,
        AppliedMatch,
        MatchConfidenceLevel,
        MatchPaymentsDto,
        ApplyMatchDto,
      } from '../dto/payment-matching.dto';
      import { MatchType, MatchedBy } from '../entities/payment.entity';
      import { InvoiceStatus } from '../entities/invoice.entity';
      import { NotFoundException, BusinessException } from '../../shared/exceptions';

      // Configure Decimal.js for banker's rounding
      Decimal.set({
        precision: 20,
        rounding: Decimal.ROUND_HALF_EVEN,
      });

      /** Confidence threshold for auto-apply */
      const AUTO_APPLY_THRESHOLD = 80;

      /** Minimum confidence to include as candidate */
      const CANDIDATE_THRESHOLD = 20;

      @Injectable()
      export class PaymentMatchingService {
        private readonly logger = new Logger(PaymentMatchingService.name);

        constructor(
          private readonly prisma: PrismaService,
          private readonly paymentRepo: PaymentRepository,
          private readonly invoiceRepo: InvoiceRepository,
          private readonly transactionRepo: TransactionRepository,
          private readonly parentRepo: ParentRepository,
          private readonly auditLogService: AuditLogService,
        ) {}

        /**
         * Match transactions to outstanding invoices
         * @param dto - Contains tenantId and optional transactionIds
         * @returns Batch result with statistics and individual results
         */
        async matchPayments(dto: MatchPaymentsDto): Promise&lt;MatchingBatchResult&gt;;

        /**
         * Find exact matches for a transaction
         * Exact = reference matches invoice number AND amounts match
         * @returns Array of exact match candidates (should be 0 or 1)
         */
        async findExactMatches(
          transaction: Transaction,
          outstandingInvoices: Array&lt;Invoice & { parent: Parent; child: Child }&gt;,
        ): Promise&lt;MatchCandidate[]&gt;;

        /**
         * Find partial/fuzzy matches for a transaction
         * Uses name similarity and amount proximity
         * @returns Array of candidates sorted by confidence DESC
         */
        async findPartialMatches(
          transaction: Transaction,
          outstandingInvoices: Array&lt;Invoice & { parent: Parent; child: Child }&gt;,
        ): Promise&lt;MatchCandidate[]&gt;;

        /**
         * Calculate confidence score for a transaction-invoice pair
         * @returns Score 0-100
         */
        calculateConfidence(
          transaction: Transaction,
          invoice: Invoice & { parent: Parent; child: Child },
        ): { score: number; reasons: string[] };

        /**
         * Auto-apply a match (create Payment, update Invoice)
         * @throws BusinessException if transaction already allocated
         */
        async autoApplyMatch(
          candidate: MatchCandidate,
          tenantId: string,
        ): Promise&lt;AppliedMatch&gt;;

        /**
         * Manually apply a suggested match (called from API)
         * @throws NotFoundException if transaction or invoice not found
         * @throws BusinessException if transaction already allocated
         */
        async applyMatch(dto: ApplyMatchDto): Promise&lt;AppliedMatch&gt;;

        /**
         * Calculate string similarity (Levenshtein-based)
         * @returns Similarity score 0-1 (1 = identical)
         */
        private calculateStringSimilarity(str1: string, str2: string): number;

        /**
         * Normalize string for comparison (lowercase, remove special chars)
         */
        private normalizeString(str: string): string;

        /**
         * Get outstanding invoices for tenant (with parent/child relations)
         */
        private async getOutstandingInvoices(
          tenantId: string,
        ): Promise&lt;Array&lt;Invoice & { parent: Parent; child: Child }&gt;&gt;;

        /**
         * Get unallocated credit transactions for tenant
         */
        private async getUnallocatedCredits(
          tenantId: string,
          transactionIds?: string[],
        ): Promise&lt;Transaction[]&gt;;

        /**
         * Check if transaction is already allocated to a payment
         */
        private async isTransactionAllocated(transactionId: string): Promise&lt;boolean&gt;;
      }
      ```
    </signature>
  </signatures>

  <constraints>
    - ALL monetary calculations MUST use Decimal.js with banker's rounding
    - Confidence scores are integers 0-100
    - Auto-apply ONLY when single match with confidence >= 80
    - NEVER auto-apply when multiple high-confidence matches exist (ambiguous)
    - ALWAYS log matching decisions to audit trail
    - ALWAYS verify tenant isolation before any operation
    - Transaction.amountCents is positive for credits (payments in), negative for debits
    - Only match CREDIT transactions (isCredit = true)
    - Invoice outstanding = totalCents - amountPaidCents
    - Amount match tolerance: within 1% or R1, whichever is greater
    - MUST check if transaction already allocated before creating payment
    - MUST update Invoice.amountPaidCents and Invoice.status after payment
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All tests pass (target: 900+ total tests)
    - Exact matches identified correctly (100% confidence)
    - Partial matches scored correctly by algorithm
    - Auto-apply triggers only for single high-confidence matches
    - Multiple matches flag for review correctly
    - Payment records created correctly
    - Invoice amountPaidCents updated correctly
    - Invoice status transitions correctly (SENT → PARTIALLY_PAID → PAID)
    - Audit logs created for all matching decisions
    - Tenant isolation enforced
    - Already-allocated transactions rejected with BusinessException
  </verification>
</definition_of_done>

<!-- ============================================================
     CONFIDENCE SCORING ALGORITHM
     ============================================================ -->

<confidence_algorithm>
  ```
  Score Components (max 100 points):

  1. REFERENCE MATCH (0-40 points)
     - Exact match: transaction.reference === invoice.invoiceNumber → +40
     - Contains invoice number: transaction.reference.includes(invoiceNumber) → +30
     - Last 4 digits match: reference ends with invoiceNumber.slice(-4) → +15
     - No reference: +0

  2. AMOUNT MATCH (0-40 points)
     - Exact match: |transactionAmount - outstandingAmount| === 0 → +40
     - Within 1% or R1: → +35
     - Within 5%: → +25
     - Within 10%: → +15
     - Partial (transaction < outstanding): → +10
     - No match: +0

  3. NAME SIMILARITY (0-20 points)
     - Check transaction.payeeName against parent full name
     - Exact match (normalized): +20
     - Similarity > 0.8: +15
     - Similarity > 0.6: +10
     - Similarity > 0.4: +5
     - No payeeName: +0

  Confidence Levels:
  - EXACT: score === 100 (reference + amount exact match)
  - HIGH: score >= 80
  - MEDIUM: score >= 50
  - LOW: score >= 20
  - Below 20: not included as candidate
  ```
</confidence_algorithm>

<!-- ============================================================
     PSEUDO CODE
     ============================================================ -->

<pseudo_code>
```typescript
// payment-matching.service.ts

async matchPayments(dto: MatchPaymentsDto): Promise<MatchingBatchResult> {
  this.logger.log(`Starting payment matching for tenant ${dto.tenantId}`);

  // 1. Get unallocated credit transactions
  const transactions = await this.getUnallocatedCredits(dto.tenantId, dto.transactionIds);

  if (transactions.length === 0) {
    return { processed: 0, autoApplied: 0, reviewRequired: 0, noMatch: 0, results: [] };
  }

  // 2. Get outstanding invoices with parent/child relations
  const outstandingInvoices = await this.getOutstandingInvoices(dto.tenantId);

  if (outstandingInvoices.length === 0) {
    // No invoices to match - all transactions are "no match"
    return {
      processed: transactions.length,
      autoApplied: 0,
      reviewRequired: 0,
      noMatch: transactions.length,
      results: transactions.map(t => ({
        transactionId: t.id,
        status: 'NO_MATCH',
        reason: 'No outstanding invoices found',
      })),
    };
  }

  // 3. Process each transaction
  const results: TransactionMatchResult[] = [];
  let autoApplied = 0, reviewRequired = 0, noMatch = 0;

  for (const transaction of transactions) {
    // Skip if already allocated (race condition check)
    if (await this.isTransactionAllocated(transaction.id)) {
      results.push({
        transactionId: transaction.id,
        status: 'NO_MATCH',
        reason: 'Transaction already allocated',
      });
      noMatch++;
      continue;
    }

    // Try exact matches first
    const exactMatches = await this.findExactMatches(transaction, outstandingInvoices);

    if (exactMatches.length === 1) {
      // Single exact match - auto-apply
      const applied = await this.autoApplyMatch(exactMatches[0], dto.tenantId);
      results.push({
        transactionId: transaction.id,
        status: 'AUTO_APPLIED',
        appliedMatch: applied,
        reason: 'Exact match: reference and amount',
      });
      autoApplied++;
      continue;
    }

    // Try partial matches
    const partialMatches = await this.findPartialMatches(transaction, outstandingInvoices);

    if (partialMatches.length === 0) {
      results.push({
        transactionId: transaction.id,
        status: 'NO_MATCH',
        reason: 'No matching invoices found',
      });
      noMatch++;
      continue;
    }

    // Check for single high-confidence match
    const highConfidence = partialMatches.filter(m => m.confidenceScore >= AUTO_APPLY_THRESHOLD);

    if (highConfidence.length === 1) {
      // Single high-confidence - auto-apply
      const applied = await this.autoApplyMatch(highConfidence[0], dto.tenantId);
      results.push({
        transactionId: transaction.id,
        status: 'AUTO_APPLIED',
        appliedMatch: applied,
        reason: `High confidence match (${highConfidence[0].confidenceScore}%)`,
      });
      autoApplied++;
    } else {
      // Multiple matches or low confidence - require review
      results.push({
        transactionId: transaction.id,
        status: 'REVIEW_REQUIRED',
        candidates: partialMatches.slice(0, 5), // Top 5 suggestions
        reason: highConfidence.length > 1
          ? 'Multiple high-confidence matches - manual selection required'
          : 'No high-confidence match found',
      });
      reviewRequired++;
    }
  }

  this.logger.log(`Matching complete: ${autoApplied} auto-applied, ${reviewRequired} review, ${noMatch} no match`);

  return {
    processed: transactions.length,
    autoApplied,
    reviewRequired,
    noMatch,
    results,
  };
}

calculateConfidence(
  transaction: Transaction,
  invoice: Invoice & { parent: Parent; child: Child },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const transactionAmount = Math.abs(transaction.amountCents);
  const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;

  // 1. REFERENCE MATCH (0-40 points)
  if (transaction.reference) {
    const normalizedRef = this.normalizeString(transaction.reference);
    const normalizedInvoice = this.normalizeString(invoice.invoiceNumber);

    if (normalizedRef === normalizedInvoice) {
      score += 40;
      reasons.push('Exact reference match');
    } else if (normalizedRef.includes(normalizedInvoice)) {
      score += 30;
      reasons.push('Reference contains invoice number');
    } else if (normalizedRef.endsWith(normalizedInvoice.slice(-4))) {
      score += 15;
      reasons.push('Reference ends with invoice suffix');
    }
  }

  // 2. AMOUNT MATCH (0-40 points)
  const amountDiff = Math.abs(transactionAmount - outstandingAmount);
  const percentDiff = outstandingAmount > 0 ? amountDiff / outstandingAmount : 1;

  if (amountDiff === 0) {
    score += 40;
    reasons.push('Exact amount match');
  } else if (percentDiff <= 0.01 || amountDiff <= 100) {
    score += 35;
    reasons.push('Amount within 1% or R1');
  } else if (percentDiff <= 0.05) {
    score += 25;
    reasons.push('Amount within 5%');
  } else if (percentDiff <= 0.10) {
    score += 15;
    reasons.push('Amount within 10%');
  } else if (transactionAmount < outstandingAmount) {
    score += 10;
    reasons.push('Partial payment (less than outstanding)');
  }

  // 3. NAME SIMILARITY (0-20 points)
  if (transaction.payeeName) {
    const parentName = `${invoice.parent.firstName} ${invoice.parent.lastName}`;
    const similarity = this.calculateStringSimilarity(
      this.normalizeString(transaction.payeeName),
      this.normalizeString(parentName),
    );

    if (similarity === 1) {
      score += 20;
      reasons.push('Exact name match');
    } else if (similarity > 0.8) {
      score += 15;
      reasons.push(`Strong name similarity (${Math.round(similarity * 100)}%)`);
    } else if (similarity > 0.6) {
      score += 10;
      reasons.push(`Good name similarity (${Math.round(similarity * 100)}%)`);
    } else if (similarity > 0.4) {
      score += 5;
      reasons.push(`Weak name similarity (${Math.round(similarity * 100)}%)`);
    }
  }

  return { score: Math.min(score, 100), reasons };
}

async autoApplyMatch(
  candidate: MatchCandidate,
  tenantId: string,
): Promise<AppliedMatch> {
  // Double-check not already allocated
  if (await this.isTransactionAllocated(candidate.transactionId)) {
    throw new BusinessException(
      `Transaction ${candidate.transactionId} is already allocated to a payment`,
      'TRANSACTION_ALREADY_ALLOCATED',
    );
  }

  // Determine match type
  const matchType = candidate.confidenceScore === 100 ? MatchType.EXACT : MatchType.PARTIAL;

  // Create payment record
  const payment = await this.paymentRepo.create({
    tenantId,
    transactionId: candidate.transactionId,
    invoiceId: candidate.invoiceId,
    amountCents: candidate.transactionAmountCents,
    paymentDate: new Date(),  // Could also use transaction.date
    matchType,
    matchConfidence: candidate.confidenceScore,
    matchedBy: MatchedBy.AI_AUTO,
  });

  // Update invoice with payment
  await this.invoiceRepo.recordPayment(candidate.invoiceId, candidate.transactionAmountCents);

  // Create audit log
  await this.auditLogService.logAction({
    tenantId,
    entityType: 'Payment',
    entityId: payment.id,
    action: 'CREATE',
    afterValue: {
      transactionId: candidate.transactionId,
      invoiceId: candidate.invoiceId,
      invoiceNumber: candidate.invoiceNumber,
      amountCents: candidate.transactionAmountCents,
      confidenceScore: candidate.confidenceScore,
      matchReasons: candidate.matchReasons,
    },
    changeSummary: `Auto-matched transaction to invoice ${candidate.invoiceNumber} with ${candidate.confidenceScore}% confidence`,
  });

  this.logger.log(
    `Auto-applied match: Transaction ${candidate.transactionId} → Invoice ${candidate.invoiceNumber} (${candidate.confidenceScore}%)`,
  );

  return {
    paymentId: payment.id,
    transactionId: candidate.transactionId,
    invoiceId: candidate.invoiceId,
    invoiceNumber: candidate.invoiceNumber,
    amountCents: candidate.transactionAmountCents,
    confidenceScore: candidate.confidenceScore,
  };
}

// Levenshtein-based similarity
private calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  const distance = matrix[str1.length][str2.length];
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

private normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')  // Remove special chars
    .trim();
}
```
</pseudo_code>

<!-- ============================================================
     FILES TO CREATE
     ============================================================ -->

<files_to_create>
  <file path="src/database/dto/payment-matching.dto.ts">
    DTOs for payment matching: MatchCandidate, MatchingBatchResult, MatchPaymentsDto, ApplyMatchDto
  </file>
  <file path="src/database/services/payment-matching.service.ts">
    PaymentMatchingService with confidence-based matching algorithm
  </file>
  <file path="tests/database/services/payment-matching.service.spec.ts">
    Integration tests using real database (not mocks)
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/database/services/index.ts">
    Add: export * from './payment-matching.service';
  </file>
  <file path="src/database/dto/index.ts">
    Add: export * from './payment-matching.dto';
  </file>
  <file path="src/database/database.module.ts">
    Add PaymentMatchingService to providers and exports
  </file>
</files_to_modify>

<!-- ============================================================
     TEST REQUIREMENTS
     ============================================================ -->

<test_requirements>
  <critical_rule>
    Tests MUST use REAL database with REAL data.
    NO mocks except for external APIs that require credentials.
    Tests must actually verify the matching algorithm works correctly.
  </critical_rule>

  <test_structure>
    ```typescript
    // tests/database/services/payment-matching.service.spec.ts

    import 'dotenv/config';
    import { Test, TestingModule } from '@nestjs/testing';
    import { PrismaService } from '../../../src/database/prisma/prisma.service';
    import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';
    import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
    import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
    import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
    import { ParentRepository } from '../../../src/database/repositories/parent.repository';
    import { AuditLogService } from '../../../src/database/services/audit-log.service';
    // ... other imports

    describe('PaymentMatchingService', () => {
      let service: PaymentMatchingService;
      let prisma: PrismaService;
      let testTenant: Tenant;
      let testParent: Parent;
      let testChild: Child;

      beforeAll(async () => {
        // Create test module with REAL providers
      });

      beforeEach(async () => {
        // Create fresh test data for each test
      });

      afterEach(async () => {
        // Clean up test data
      });

      afterAll(async () => {
        await prisma.$disconnect();
      });

      describe('matchPayments', () => {
        // Test cases...
      });
    });
    ```
  </test_structure>

  <test_cases>
    <test name="Exact match - auto-apply">
      Create transaction with reference = invoice number, amount = outstanding.
      Verify: 100% confidence, auto-applied, payment created, invoice updated.
    </test>
    <test name="High confidence - auto-apply">
      Create transaction with partial reference match + exact amount.
      Verify: >= 80% confidence, auto-applied.
    </test>
    <test name="Low confidence - review required">
      Create transaction with only amount match.
      Verify: &lt; 80% confidence, flagged for review with candidates.
    </test>
    <test name="Multiple high confidence - review required">
      Create 2 invoices with same amount, transaction matches both.
      Verify: NOT auto-applied, flagged for review.
    </test>
    <test name="No match">
      Create transaction with no matching invoice.
      Verify: status = NO_MATCH.
    </test>
    <test name="Already allocated - rejected">
      Create transaction that already has a payment.
      Verify: BusinessException thrown.
    </test>
    <test name="Name similarity scoring">
      Test various name variations (J. Smith, John Smith, Smith John).
      Verify: correct similarity scores.
    </test>
    <test name="Invoice status updates">
      Verify SENT → PARTIALLY_PAID → PAID transitions.
    </test>
    <test name="Tenant isolation">
      Create invoices for different tenants.
      Verify: only matches same-tenant invoices.
    </test>
    <test name="Partial payment">
      Transaction amount &lt; invoice outstanding.
      Verify: matched as partial, invoice becomes PARTIALLY_PAID.
    </test>
  </test_cases>
</test_requirements>

<!-- ============================================================
     VALIDATION COMMANDS
     ============================================================ -->

<test_commands>
  <command>npm run lint</command>
  <command>npm run build</command>
  <command>npm test -- payment-matching.service.spec.ts</command>
  <command>npm test</command>
</test_commands>

<success_criteria>
  - npm run lint: No errors
  - npm run build: No TypeScript errors
  - npm test: All tests pass (target: 900+ total tests, ~26 new tests)
  - Integration tests verify real database operations
  - Matching algorithm produces correct confidence scores
  - Auto-apply/review logic works correctly
  - Tenant isolation verified
</success_criteria>

</task_spec>
