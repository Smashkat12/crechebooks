<task_spec id="TASK-TRANS-022" version="1.0">

<metadata>
  <title>Reversal Transaction Detection</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>logic</layer>
  <sequence>128</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <edge_case_ref>EC-TRANS-006</edge_case_ref>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-012</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use pattern matching and temporal analysis thinking.
This task involves:
1. Detecting transactions that appear to be reversals of previous transactions
2. Matching by: negative amount, similar date, similar/same payee
3. Linking reversal to original transaction
4. Suggesting same category with opposite sign
5. Flagging uncertain reversals for review
</reasoning_mode>

<context>
EDGE CASE EC-TRANS-006: "Transaction appears to be a reversal or refund of an earlier transaction."

Expected behavior:
- Detect matching amount (negative) and similar date/payee
- Link as reversal
- Suggest same category with opposite sign
- Flag for review if uncertain

This is important for accurate financial reporting - reversals should be linked to originals.
</context>

<current_state>
## Codebase State
- TransactionCategorizationService handles categorization
- Transaction entity has: amount, date, payee, description
- No reversal detection logic exists
- No linking between transactions (except splits)

## Reversal Indicators
Common patterns:
- Amount is exact negative of original
- Payee contains "REV", "REVERSAL", "REFUND", "R/D"
- Date within 3-7 days of original
- Reference may contain original reference
</current_state>

<input_context_files>
  <file purpose="categorization_service">apps/api/src/database/services/transaction-categorization.service.ts</file>
  <file purpose="transaction_entity">apps/api/src/database/entities/transaction.entity.ts</file>
  <file purpose="import_service">apps/api/src/database/services/transaction-import.service.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - ReversalDetectionService creation
    - Detection during import
    - Detection during categorization
    - Linking reversal to original (new field)
    - Confidence scoring for reversal detection
    - Flagging uncertain reversals for review
    - Auto-suggest category from original
  </in_scope>
  <out_of_scope>
    - UI for reversal display (surface layer task)
    - Manual linking of reversals
    - Reversal of already-reconciled transactions
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/reversal-detection.service.ts">
      export interface ReversalMatch {
        originalTransactionId: string;
        confidence: number;
        matchReason: string;
        suggestedCategory: string;
      }

      @Injectable()
      export class ReversalDetectionService {
        async detectReversal(
          tenantId: string,
          transaction: Transaction
        ): Promise<ReversalMatch | null>;

        async findPotentialOriginals(
          tenantId: string,
          amount: Decimal,
          date: Date,
          payee: string
        ): Promise<Transaction[]>;

        async linkReversal(
          reversalId: string,
          originalId: string
        ): Promise<void>;

        async getReversalsFor(
          transactionId: string
        ): Promise<Transaction[]>;
      }
    </signature>
    <signature file="apps/api/src/database/entities/transaction.entity.ts">
      // Add to existing entity
      @Column({ nullable: true })
      reversesTransactionId?: string;

      @Column({ default: false })
      isReversal: boolean;

      @ManyToOne(() => Transaction, { nullable: true })
      reversesTransaction?: Transaction;
    </signature>
  </signatures>

  <constraints>
    - Match window: 7 days before/after transaction date
    - Amount must be exact negative match
    - Payee similarity threshold: 80% (Levenshtein)
    - Confidence thresholds: 90%+ auto-link, 70-89% flag for review, <70% ignore
    - Do not auto-link reconciled transactions
    - Audit log for all linking operations
  </constraints>

  <verification>
    - Reversals detected on import
    - Exact negative amounts matched
    - Date window respected
    - Payee variations handled
    - High confidence auto-linked
    - Low confidence flagged
    - Original transaction linked correctly
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/reversal-detection.service.ts">Main service</file>
  <file path="apps/api/src/database/services/__tests__/reversal-detection.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/entities/transaction.entity.ts">Add reversal fields</file>
  <file path="apps/api/src/database/services/transaction-import.service.ts">Call detection on import</file>
  <file path="apps/api/src/database/services/transaction-categorization.service.ts">Use original category</file>
  <file path="apps/api/prisma/schema.prisma">Add reversal relation</file>
</files_to_modify>

<validation_criteria>
  <criterion>ReversalDetectionService created</criterion>
  <criterion>Reversals detected on import</criterion>
  <criterion>Exact amount matching works</criterion>
  <criterion>Date window filter applied</criterion>
  <criterion>High confidence auto-linked</criterion>
  <criterion>Low confidence flagged for review</criterion>
  <criterion>Migration runs successfully</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_reversal_fields</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="reversal-detection" --verbose</command>
</test_commands>

</task_spec>
