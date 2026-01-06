# TASK-STMT-002: Payment Allocation to Invoices Service

## Metadata
- **Task ID**: TASK-STMT-002
- **Phase**: 12 - Account Statements
- **Layer**: logic
- **Priority**: P1-CRITICAL
- **Dependencies**: TASK-STMT-001, TASK-PAY-012, TASK-TRANS-001
- **Estimated Effort**: 6 hours

## Objective
Enhance the payment allocation system to properly link bank transactions (categorized as "Fee Income") to specific parent accounts and outstanding invoices.

## Business Context
When a parent pays school fees via EFT:
1. Transaction appears in bank feed
2. Admin categorizes it as "School Fees Income"
3. System prompts admin to allocate payment to parent account
4. Admin selects which invoice(s) the payment covers
5. Invoices are marked as paid (full/partial)
6. Overpayments create credit balance for future use

This is the standard "Receive Payment" workflow in Xero/QuickBooks.

## Technical Requirements

### 1. Payment Allocation Enhancement (`apps/api/src/database/services/payment-allocation.service.ts`)

```typescript
export interface AllocatePaymentInput {
  tenantId: string;
  transactionId: string;        // Bank transaction being allocated
  parentId: string;             // Parent account to credit
  allocations: InvoiceAllocation[];
  userId: string;
}

export interface InvoiceAllocation {
  invoiceId: string;
  amountCents: number;          // Amount to apply to this invoice
}

export interface PaymentAllocationResult {
  payment: Payment;
  invoicesUpdated: Invoice[];
  creditBalanceCreated?: number; // If overpayment
  remainingUnallocated?: number; // If partial allocation
}

@Injectable()
export class PaymentAllocationService {
  /**
   * Allocate a bank transaction to one or more invoices
   * Handles:
   * - Full payment (exact match)
   * - Partial payment (invoice partially paid)
   * - Overpayment (creates credit balance)
   * - Multi-invoice allocation (payment covers multiple invoices)
   */
  async allocateTransactionToInvoices(
    input: AllocatePaymentInput
  ): Promise<PaymentAllocationResult>;

  /**
   * Get outstanding invoices for a parent that can receive payment
   */
  async getOutstandingInvoicesForParent(
    tenantId: string,
    parentId: string
  ): Promise<OutstandingInvoice[]>;

  /**
   * Get suggested allocation based on invoice dates and amounts
   * Uses FIFO (oldest invoice first) by default
   */
  async suggestAllocation(
    tenantId: string,
    parentId: string,
    paymentAmountCents: number
  ): Promise<InvoiceAllocation[]>;

  /**
   * Apply existing credit balance to new invoices
   */
  async applyCreditToInvoice(
    tenantId: string,
    parentId: string,
    invoiceId: string,
    amountCents: number,
    userId: string
  ): Promise<PaymentAllocationResult>;
}
```

### 2. Parent Account Balance Service (`apps/api/src/database/services/parent-account.service.ts`)

```typescript
export interface ParentAccountBalance {
  parentId: string;
  parentName: string;
  totalOutstandingCents: number;   // Sum of unpaid invoices
  creditBalanceCents: number;       // Available credit from overpayments
  netBalanceCents: number;          // Outstanding - Credit (positive = owes, negative = credit)
  oldestUnpaidInvoice?: {
    invoiceNumber: string;
    dueDate: Date;
    amountDueCents: number;
  };
  invoiceCount: number;
  lastPaymentDate?: Date;
  lastPaymentAmountCents?: number;
}

@Injectable()
export class ParentAccountService {
  /**
   * Get account balance summary for a parent
   */
  async getAccountBalance(
    tenantId: string,
    parentId: string
  ): Promise<ParentAccountBalance>;

  /**
   * Get account balances for all parents (for dashboard)
   */
  async getAllAccountBalances(
    tenantId: string,
    options?: { onlyWithBalance?: boolean; sortBy?: 'balance' | 'name' }
  ): Promise<ParentAccountBalance[]>;

  /**
   * Get account transaction history (for statement generation)
   */
  async getAccountHistory(
    tenantId: string,
    parentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AccountTransaction[]>;
}

export interface AccountTransaction {
  date: Date;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'CREDIT_APPLIED' | 'ADJUSTMENT';
  referenceNumber: string;
  description: string;
  debitCents: number;    // Charges (invoices)
  creditCents: number;   // Payments/credits
  balanceCents: number;  // Running balance
  documentId: string;
}
```

### 3. Transaction Allocation Link

When a transaction is categorized as "School Fees" or "Fee Income":
- The system should trigger the allocation workflow
- Store the link between Transaction → Payment → Invoice(s)

```typescript
// In categorization flow, detect if category is fee income
if (category.accountCode === '4000' || category.name.includes('Fees')) {
  // Mark transaction as requiring allocation
  await this.transactionRepo.update(transactionId, {
    requiresAllocation: true,
    allocationType: 'FEE_INCOME',
  });
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/database/services/payment-allocation.service.ts` | MODIFY | Enhance with transaction-to-invoice allocation |
| `apps/api/src/database/services/parent-account.service.ts` | CREATE | Parent account balance service |
| `apps/api/src/database/services/parent-account.service.spec.ts` | CREATE | Service tests |
| `apps/api/prisma/schema.prisma` | MODIFY | Add requiresAllocation to Transaction |

## Acceptance Criteria

- [ ] Allocate single transaction to single invoice (full payment)
- [ ] Allocate single transaction to multiple invoices
- [ ] Handle partial payments correctly
- [ ] Create credit balance from overpayments
- [ ] Apply credit balance to new invoices
- [ ] FIFO allocation suggestion works
- [ ] Invoice status updates correctly (PAID, PARTIALLY_PAID)
- [ ] All amounts use Decimal.js with banker's rounding
- [ ] Audit trail for all allocations
- [ ] Unit tests with >90% coverage

## Test Cases

1. Full payment exactly matches invoice amount
2. Payment covers multiple invoices
3. Partial payment (less than invoice amount)
4. Overpayment creates credit balance
5. Credit balance applied to new invoice
6. FIFO allocation suggestion
7. Parent with multiple children and invoices
8. Concurrent payment allocation
9. Allocation to already-paid invoice (error)
10. Reversal/refund handling
