<task_spec id="TASK-TRANS-020" version="1.0">

<metadata>
  <title>Split Transaction UI Implementation</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>126</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-TRANS-009</requirement_ref>
    <user_story_ref>US-TRANS-004</user_story_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-WEB-011</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-002</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use UI/UX design thinking with form validation patterns.
This task involves:
1. Creating a split transaction modal/dialog component
2. Dynamic form for adding multiple category allocations
3. Real-time validation ensuring split amounts equal transaction total
4. Integration with existing transaction detail view
5. API integration for saving split transactions
</reasoning_mode>

<context>
GAP: REQ-TRANS-009 specifies split transaction support. Backend logic exists in TransactionCategorizationService but NO UI allows users to split a single transaction across multiple categories.

Acceptance Criteria (from US-TRANS-004):
- AC-TRANS-004a: User can select "Split Transaction" and allocate portions to different categories
- AC-TRANS-004b: System validates that split amounts equal the transaction total

Edge Case EC-TRANS-005: "User attempts to split transaction but amounts don't equal total" must display validation error.
</context>

<current_state>
## Codebase State
- Transaction entity supports splits via parentTransactionId field
- TransactionCategorizationService has categorization logic
- Transaction list page exists at apps/web/src/app/(dashboard)/transactions/page.tsx
- No split UI component exists
- Category selection component exists (can be reused)

## Backend Support
```typescript
// Transaction entity already has:
parentTransactionId?: string;  // For split child transactions
splitAmounts?: { categoryId: string; amount: Decimal }[];
```
</current_state>

<input_context_files>
  <file purpose="transaction_entity">apps/api/src/database/entities/transaction.entity.ts</file>
  <file purpose="categorization_service">apps/api/src/database/services/transaction-categorization.service.ts</file>
  <file purpose="transactions_page">apps/web/src/app/(dashboard)/transactions/page.tsx</file>
  <file purpose="transaction_detail">apps/web/src/app/(dashboard)/transactions/[id]/page.tsx</file>
  <file purpose="category_select">apps/web/src/components/transactions/CategorySelect.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - SplitTransactionModal component
    - Dynamic split row add/remove functionality
    - Amount validation (must equal total)
    - Category selection per split
    - Save split to API
    - Display existing splits in transaction detail
    - Edit existing splits
  </in_scope>
  <out_of_scope>
    - Backend split logic changes (already exists)
    - Xero sync for splits (handled by existing sync)
    - Bulk split operations
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/transactions/SplitTransactionModal.tsx">
      export interface SplitRow {
        id: string;
        categoryId: string;
        categoryName: string;
        amount: string;
        description?: string;
      }

      export interface SplitTransactionModalProps {
        transaction: Transaction;
        isOpen: boolean;
        onClose: () => void;
        onSave: (splits: SplitRow[]) => Promise<void>;
      }

      export function SplitTransactionModal({
        transaction,
        isOpen,
        onClose,
        onSave,
      }: SplitTransactionModalProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/transactions/SplitRowInput.tsx">
      export interface SplitRowInputProps {
        row: SplitRow;
        categories: Category[];
        onUpdate: (row: SplitRow) => void;
        onRemove: () => void;
        canRemove: boolean;
      }

      export function SplitRowInput({
        row,
        categories,
        onUpdate,
        onRemove,
        canRemove,
      }: SplitRowInputProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/hooks/useSplitTransaction.ts">
      export function useSplitTransaction(transactionId: string): {
        splits: SplitRow[];
        addSplit: () => void;
        removeSplit: (id: string) => void;
        updateSplit: (id: string, updates: Partial<SplitRow>) => void;
        total: Decimal;
        remaining: Decimal;
        isValid: boolean;
        validationError: string | null;
        saveSplits: () => Promise<void>;
        isLoading: boolean;
      };
    </signature>
  </signatures>

  <constraints>
    - Minimum 2 splits required
    - Split amounts must equal transaction total exactly (Decimal.js comparison)
    - Each split requires a category
    - Amount input formatted as currency (ZAR)
    - Real-time validation feedback
    - Cannot split already-reconciled transactions (show warning)
    - Accessible modal with focus trap
  </constraints>

  <verification>
    - Split modal opens from transaction detail
    - Can add/remove split rows dynamically
    - Validation error shown when totals don't match
    - Save button disabled until valid
    - Existing splits load correctly
    - Splits save to API successfully
    - UI updates after save
    - Works on mobile
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/transactions/SplitTransactionModal.tsx">Main modal component</file>
  <file path="apps/web/src/components/transactions/SplitRowInput.tsx">Individual row component</file>
  <file path="apps/web/src/components/transactions/SplitSummary.tsx">Summary showing total/remaining</file>
  <file path="apps/web/src/hooks/useSplitTransaction.ts">State management hook</file>
  <file path="apps/web/src/lib/api/split-transaction.ts">API client functions</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/transactions/[id]/page.tsx">Add split button and display</file>
</files_to_modify>

<validation_criteria>
  <criterion>SplitTransactionModal component created and functional</criterion>
  <criterion>Dynamic row add/remove works</criterion>
  <criterion>Validation prevents mismatched totals</criterion>
  <criterion>Error message: "Split amounts (R{total}) must equal transaction amount (R{expected})"</criterion>
  <criterion>Saves to API correctly</criterion>
  <criterion>Existing splits display on transaction detail</criterion>
  <criterion>Mobile responsive</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="Split" --verbose</command>
  <command>npm run lint --filter=web</command>
</test_commands>

</task_spec>
