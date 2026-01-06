<task_spec id="TASK-PAY-020" version="1.0">

<metadata>
  <title>Credit Balance Application to Future Invoices</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>145</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-PAY-008</requirement_ref>
    <requirement_ref>REQ-PAY-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-018</task_ref>
    <task_ref>TASK-BILL-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Purpose
After TASK-PAY-018 implements credit balance creation for overpayments, this task
enables applying those credits to future invoices.

## Current State
- TASK-PAY-018 creates CreditBalance records
- Invoice generation exists
- No mechanism to apply credit to invoices

## What Should Happen
1. When generating new invoices, check for available credit
2. Automatically apply credit to reduce invoice amount
3. Mark credit as applied (isApplied = true)
4. Create audit trail for credit application
5. Optionally: manual credit application by user

## Project Context
- Credit balances stored in credit_balances table
- InvoiceGenerationService handles invoice creation
- Financial precision: Decimal.js, cents storage
</context>

<input_context_files>
  <file purpose="credit_balance_service">apps/api/src/database/services/credit-balance.service.ts</file>
  <file purpose="invoice_generation">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="credit_balance_entity">apps/api/prisma/schema.prisma#CreditBalance</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-018 completed (CreditBalance model and service exists)</check>
  <check>TASK-BILL-012 completed (InvoiceGenerationService exists)</check>
</prerequisites>

<scope>
  <in_scope>
    - Add applyCreditToInvoice() method to CreditBalanceService
    - Modify invoice generation to check and apply credits
    - Create credit application line item (LineType.CREDIT)
    - Mark credit balances as applied
    - Handle partial credit application
    - Audit logging for credit applications
    - Unit tests
  </in_scope>
  <out_of_scope>
    - Manual credit application UI
    - Refund processing
    - Credit transfer between parents
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/credit-balance.service.ts">
      /**
       * Apply credit balance to an invoice
       * @returns Applied credit amount in cents
       */
      async applyCreditToInvoice(
        tenantId: string,
        parentId: string,
        invoiceId: string,
        maxAmountCents: number,
        userId: string,
      ): Promise&lt;number&gt;;

      /**
       * Get available credit balances for a parent
       */
      async getAvailableCreditBalances(
        tenantId: string,
        parentId: string,
      ): Promise&lt;CreditBalance[]&gt;;
    </signature>
  </signatures>

  <constraints>
    - Apply oldest credits first (FIFO)
    - Partial application allowed (use part of a credit)
    - Create new CreditBalance for remaining amount
    - Original credit marked as applied
    - Invoice line created with LineType.CREDIT
    - Credit cannot exceed invoice total
    - Must update invoice totals after applying credit
  </constraints>

  <verification>
    - Credits applied to new invoices automatically
    - FIFO order respected
    - Partial application works correctly
    - Invoice totals updated correctly
    - Credit marked as applied
    - Audit log created
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
CreditBalanceService additions:

  async applyCreditToInvoice(
    tenantId: string,
    parentId: string,
    invoiceId: string,
    maxAmountCents: number,
    userId: string,
  ): Promise<number> {
    // 1. Get available credits (oldest first)
    const availableCredits = await this.getAvailableCreditBalances(tenantId, parentId);

    if (availableCredits.length === 0) {
      return 0;
    }

    let remainingToApply = maxAmountCents;
    let totalApplied = 0;

    // 2. Apply credits in FIFO order
    for (const credit of availableCredits) {
      if (remainingToApply <= 0) break;

      const amountToApply = Math.min(credit.amountCents, remainingToApply);

      if (amountToApply === credit.amountCents) {
        // Full application - mark as applied
        await this.prisma.creditBalance.update({
          where: { id: credit.id },
          data: {
            isApplied: true,
            appliedToInvoiceId: invoiceId,
            appliedAt: new Date(),
          },
        });
      } else {
        // Partial application
        // Mark original as applied
        await this.prisma.creditBalance.update({
          where: { id: credit.id },
          data: {
            isApplied: true,
            appliedToInvoiceId: invoiceId,
            appliedAt: new Date(),
            amountCents: amountToApply, // Reduce to applied amount
          },
        });

        // Create new credit for remainder
        await this.prisma.creditBalance.create({
          data: {
            tenantId,
            parentId,
            amountCents: credit.amountCents - amountToApply,
            sourceType: 'SPLIT',
            sourceId: credit.id,
            description: `Remaining from ${credit.id}`,
            isApplied: false,
          },
        });
      }

      totalApplied += amountToApply;
      remainingToApply -= amountToApply;

      // Audit log
      await this.auditLogService.logUpdate({
        tenantId,
        userId,
        entityType: 'CreditBalance',
        entityId: credit.id,
        changeSummary: `Applied R${(amountToApply / 100).toFixed(2)} to invoice ${invoiceId}`,
      });
    }

    return totalApplied;
  }

  async getAvailableCreditBalances(tenantId: string, parentId: string): Promise<CreditBalance[]> {
    return this.prisma.creditBalance.findMany({
      where: {
        tenantId,
        parentId,
        isApplied: false,
      },
      orderBy: { createdAt: 'asc' }, // FIFO - oldest first
    });
  }

// InvoiceGenerationService modification:

  async createInvoice(...) {
    // ... existing invoice creation code ...

    // After calculating totals, check for available credit
    const availableCredit = await this.creditBalanceService.getAvailableCredit(
      tenantId,
      parentId
    );

    if (availableCredit > 0) {
      const creditToApply = Math.min(availableCredit, invoice.totalCents);

      if (creditToApply > 0) {
        // Apply credit
        const appliedCredit = await this.creditBalanceService.applyCreditToInvoice(
          tenantId,
          parentId,
          invoice.id,
          creditToApply,
          userId
        );

        // Add credit line item
        await this.invoiceLineRepo.create({
          invoiceId: invoice.id,
          description: 'Credit Applied',
          quantity: 1,
          unitPriceCents: -appliedCredit, // Negative amount
          discountCents: 0,
          subtotalCents: -appliedCredit,
          vatCents: 0,
          totalCents: -appliedCredit,
          lineType: 'CREDIT',
          accountCode: '4000',
          sortOrder: 99, // Last line
        });

        // Update invoice totals
        const newTotal = invoice.totalCents - appliedCredit;
        await this.invoiceRepo.update(tenantId, invoice.id, {
          totalCents: newTotal,
          amountPaidCents: appliedCredit, // Credit counts as paid
          status: newTotal <= 0 ? 'PAID' : 'DRAFT',
        });

        this.logger.log(`Applied R${(appliedCredit / 100).toFixed(2)} credit to invoice ${invoice.id}`);
      }
    }

    return invoice;
  }
</pseudo_code>

<files_to_modify>
  <file path="apps/api/src/database/services/credit-balance.service.ts">Add applyCreditToInvoice() and getAvailableCreditBalances()</file>
  <file path="apps/api/src/database/services/invoice-generation.service.ts">Add credit application during invoice creation</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/credit-balance.service.spec.ts">Additional tests for credit application</file>
</files_to_create>

<validation_criteria>
  <criterion>Credits applied to invoices automatically</criterion>
  <criterion>FIFO order respected (oldest credits first)</criterion>
  <criterion>Partial application creates remaining credit</criterion>
  <criterion>Invoice totals reduced by applied credit</criterion>
  <criterion>Credit line item created with LineType.CREDIT</criterion>
  <criterion>Applied credits marked isApplied=true</criterion>
  <criterion>Audit log entries created</criterion>
  <criterion>Unit tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- credit-balance.service</command>
  <command>npm run test -- invoice-generation.service</command>
</test_commands>

<implementation_notes>
## Implementation Summary (2026-01-06)

### Files Modified:

1. **apps/api/src/database/services/credit-balance.service.ts**:
   - Added `getAvailableCreditBalances(tenantId, parentId)` - alias for `getUnappliedCredits()`
   - Added `applyCreditToInvoice(tenantId, parentId, invoiceId, maxAmountCents, userId)`:
     - Gets available credits in FIFO order (oldest first)
     - Applies credits up to the maximum amount
     - Handles partial application by splitting credits:
       - Original credit reduced to applied amount and marked isApplied=true
       - New credit created for remaining balance with sourceType=ADJUSTMENT
     - Full audit trail for all operations
     - Returns total applied amount in cents

2. **apps/api/src/database/services/invoice-generation.service.ts**:
   - Added CreditBalanceService dependency injection
   - Added credit application logic after invoice totals are calculated:
     - Checks for available credit for the parent
     - If credit exists, applies it to reduce invoice total
     - Creates CREDIT line item with negative amount
     - Updates invoice totals (subtotalCents, totalCents)
     - If invoice total becomes <= 0, marks status as PAID
     - Logs all credit applications

### Key Implementation Details:
- **FIFO Order**: Oldest credits applied first via `orderBy: { createdAt: 'asc' }`
- **Partial Application**: Credits split when larger than invoice amount
- **Credit Line Item**: Added with LineType.CREDIT and negative unitPriceCents
- **Invoice Status**: Auto-sets to PAID if credit covers full invoice
- **Audit Trail**: All operations logged via AuditLogService
- **Financial Precision**: All amounts in cents, no floating point

### Verification:
- ✅ `getAvailableCreditBalances()` method added to CreditBalanceService
- ✅ `applyCreditToInvoice()` method added with FIFO and partial split support
- ✅ InvoiceGenerationService automatically applies credits
- ✅ Credit line item created with LineType.CREDIT
- ✅ Invoice totals updated after credit application
- ✅ Full audit logging for credit operations
- ✅ TypeScript builds without errors
</implementation_notes>

</task_spec>
