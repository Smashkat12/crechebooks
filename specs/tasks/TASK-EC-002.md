<task_spec id="TASK-EC-002" version="1.0">

<metadata>
  <title>Conflicting Correction Resolution UI</title>
  <status>pending</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>137</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <edge_case_ref>EC-TRANS-009</edge_case_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-013</task_ref>
    <task_ref status="COMPLETE">TASK-WEB-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use conflict resolution and decision UI patterns.
This task involves:
1. Detecting when user makes conflicting corrections
2. Presenting conflict to user with context
3. Offering resolution options (update all, just this one, create rule)
4. Storing user preference for future conflicts
5. Clear explanation of impact of each choice
</reasoning_mode>

<context>
EDGE CASE EC-TRANS-009: "User makes conflicting corrections (same payee categorized differently)."

Expected behavior:
- Present conflict to user: "You previously categorized [Payee] as [Category A]. Would you like to update all transactions or just this one?"
- Store user preference

Example: User categorized "WOOLWORTHS" as "Food" but later categorizes another "WOOLWORTHS" transaction as "Supplies". The system should ask which is correct.
</context>

<current_state>
## Codebase State
- PatternLearningService tracks corrections
- PayeePattern stores category mappings
- No conflict detection on correction
- No conflict resolution UI
- Corrections silently override previous patterns

## Current Correction Flow
```typescript
// In pattern-learning.service.ts
async learnFromCorrection(transactionId, newCategory) {
  // Simply overwrites - no conflict handling!
  await this.updatePattern(payee, newCategory);
}
```
</current_state>

<input_context_files>
  <file purpose="pattern_service">apps/api/src/database/services/pattern-learning.service.ts</file>
  <file purpose="transaction_page">apps/web/src/app/(dashboard)/transactions/page.tsx</file>
  <file purpose="transaction_detail">apps/web/src/app/(dashboard)/transactions/[id]/page.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - ConflictingCorrectionModal component
    - Conflict detection on correction attempt
    - Resolution options: update all, just this one, split rule
    - Impact preview (how many transactions affected)
    - User preference storage
    - API endpoint for conflict detection
  </in_scope>
  <out_of_scope>
    - Automatic conflict resolution
    - Bulk conflict resolution
    - Complex rule merging
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/transactions/ConflictingCorrectionModal.tsx">
      export interface CorrectionConflict {
        payee: string;
        existingCategory: string;
        newCategory: string;
        existingTransactionCount: number;
        affectedTransactionIds: string[];
      }

      export interface ConflictingCorrectionModalProps {
        conflict: CorrectionConflict;
        isOpen: boolean;
        onClose: () => void;
        onResolve: (resolution: ConflictResolution) => Promise<void>;
      }

      export type ConflictResolution =
        | { type: 'update_all' }
        | { type: 'just_this_one' }
        | { type: 'split_by_amount'; threshold: number }
        | { type: 'split_by_description'; pattern: string };

      export function ConflictingCorrectionModal({
        conflict,
        isOpen,
        onClose,
        onResolve,
      }: ConflictingCorrectionModalProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/transactions/ConflictResolutionOptions.tsx">
      export interface ConflictResolutionOptionsProps {
        conflict: CorrectionConflict;
        selectedOption: ConflictResolution | null;
        onSelect: (resolution: ConflictResolution) => void;
      }

      export function ConflictResolutionOptions({
        conflict,
        selectedOption,
        onSelect,
      }: ConflictResolutionOptionsProps): JSX.Element;
    </signature>
    <signature file="apps/api/src/database/services/correction-conflict.service.ts">
      @Injectable()
      export class CorrectionConflictService {
        async detectConflict(
          tenantId: string,
          payee: string,
          newCategory: string
        ): Promise<CorrectionConflict | null>;

        async resolveConflict(
          tenantId: string,
          transactionId: string,
          resolution: ConflictResolution
        ): Promise<void>;

        async getAffectedTransactions(
          tenantId: string,
          payee: string,
          currentCategory: string
        ): Promise<Transaction[]>;
      }
    </signature>
  </signatures>

  <constraints>
    - Conflict only detected if payee has existing pattern
    - Show count of affected transactions
    - "Update all" applies new category to past transactions
    - "Just this one" creates exception, keeps pattern
    - Split rules create conditional patterns
    - Store resolution preference per payee
    - Clear wording explaining each option
  </constraints>

  <verification>
    - Conflict detected when correction differs from pattern
    - Modal shows with clear options
    - Impact count accurate
    - "Update all" updates historical transactions
    - "Just this one" preserves pattern
    - Resolution persisted
    - Future conflicts remember preference
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/transactions/ConflictingCorrectionModal.tsx">Main modal</file>
  <file path="apps/web/src/components/transactions/ConflictResolutionOptions.tsx">Options display</file>
  <file path="apps/web/src/components/transactions/ImpactPreview.tsx">Affected transactions preview</file>
  <file path="apps/api/src/database/services/correction-conflict.service.ts">Backend service</file>
  <file path="apps/api/src/database/services/__tests__/correction-conflict.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/pattern-learning.service.ts">Add conflict detection</file>
  <file path="apps/web/src/app/(dashboard)/transactions/[id]/page.tsx">Integrate modal</file>
</files_to_modify>

<validation_criteria>
  <criterion>Conflict detected on differing correction</criterion>
  <criterion>Modal displays with conflict details</criterion>
  <criterion>All resolution options work</criterion>
  <criterion>Impact preview accurate</criterion>
  <criterion>Historical transactions updated when needed</criterion>
  <criterion>Preference stored for future</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="correction-conflict|Conflicting" --verbose</command>
</test_commands>

</task_spec>
