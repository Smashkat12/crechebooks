<task_spec id="TASK-RECON-040" version="2.0">

<metadata>
  <title>Fix Payment Allocation Fee Deduction</title>
  <status>COMPLETE</status>
  <phase>18</phase>
  <layer>logic</layer>
  <sequence>259</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-PAY-015</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-RECON-038</task_ref>
    <task_ref status="PENDING">TASK-RECON-039</task_ref>
    <task_ref status="COMPLETE">TASK-PAY-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-18</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Bug State

  **File:** `apps/api/src/database/services/payment-allocation.service.ts`
  **Location:** Payment allocation logic

  **Problem:**
  - When a payment has an associated bank fee (from a split transaction), the allocation service
    credits the GROSS amount to the parent invoice instead of the NET amount
  - Example: Parent pays R100, bank charges R6.36 fee, parent should get R100 credit (not R106.36)
  - The fee should be recorded separately as an accrued bank charge, not added to invoice payment

  **Current Flow (BUGGY):**
  ```
  Xero shows: R106.36 (GROSS)
  Bank shows: R100.00 (NET after fee)
  Split created: R100 NET + R6.36 FEE

  CURRENT BUG: Invoice credited with R106.36 (GROSS)
  SHOULD BE: Invoice credited with R100.00 (NET)
  ```

  **Impact:**
  - Parent invoices show over-credited amounts
  - Balance calculations are wrong
  - Parents appear to have paid more than they actually did
  - Financial reports show incorrect payment totals

  **Correct Accounting:**
  ```
  1. Parent pays R100 (appears as R100 in bank)
  2. Xero shows R106.36 (gross before fee)
  3. Split: NET R100 + FEE R6.36
  4. Invoice allocation: R100 (NET amount only)
  5. Bank fee: R6.36 recorded as accrued charge (separate expense)
  ```

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Split Transaction Awareness
  ```typescript
  // When allocating payment, check if it's from a split transaction
  if (payment.xeroSplitId) {
    // Use NET amount (bankStatementAmount) not GROSS (xeroAmount)
    const split = await this.xeroSplitRepository.findById(payment.xeroSplitId);
    allocationAmount = split.netAmountCents;
  } else {
    allocationAmount = payment.amountCents;
  }
  ```

  ### 3. Fee Recording Pattern
  ```typescript
  // Record fee separately as accrued bank charge
  if (split.feeAmountCents > 0) {
    await this.accruedBankChargeService.recordFee({
      tenantId: payment.tenantId,
      xeroSplitId: split.id,
      feeType: split.feeType,
      amountCents: split.feeAmountCents,
      description: `Bank fee for payment ${payment.id}`,
    });
  }
  ```

  ### 4. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task fixes a critical bug where payment allocations don't account for bank fees from split transactions. When a Xero transaction is split to separate the gross amount from the bank fee, the payment allocation should only credit the NET amount to the invoice, not the GROSS.

**Root Cause:**
- Payment allocation service doesn't check for associated split transactions
- It always uses the payment amount directly, which may be the GROSS Xero amount
- No distinction between NET (actual payment) and GROSS (before bank fee)

**Business Rules:**
1. Parent makes payment of R100
2. Bank deposits R100 (NET) to account
3. Xero records R106.36 (GROSS before R6.36 fee deducted by bank)
4. Split transaction records: R100 NET + R6.36 FEE
5. Invoice allocation: Credit R100 only (what parent actually paid)
6. Bank fee: Record R6.36 as business expense (accrued charge)
</context>

<scope>
  <in_scope>
    - Modify payment-allocation.service.ts to check for split transactions
    - Use NET amount from split for invoice allocation
    - Ensure fee is recorded separately (already handled by split service)
    - Add unit tests for split-aware allocation
    - Update integration tests for payment matching with splits
  </in_scope>
  <out_of_scope>
    - Xero bank feed sign fixes (TASK-RECON-038)
    - CSV parser fee detection (TASK-RECON-039)
    - Accrued bank charge recording (already in split service)
    - UI for displaying split allocations
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- CODE CHANGES                                -->
<!-- ============================================ -->

<service_changes>
## File: apps/api/src/database/services/payment-allocation.service.ts

### Add Split Repository Injection:
```typescript
@Injectable()
export class PaymentAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepository: PaymentRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly xeroSplitRepository: XeroSplitRepository, // ADD THIS
    private readonly logger: Logger,
  ) {}
```

### Modify allocatePayment Method:
```typescript
async allocatePayment(
  tenantId: string,
  paymentId: string,
  invoiceId: string,
): Promise<PaymentAllocation> {
  const payment = await this.paymentRepository.findById(tenantId, paymentId);
  if (!payment) {
    throw new NotFoundException(`Payment ${paymentId} not found`);
  }

  const invoice = await this.invoiceRepository.findById(tenantId, invoiceId);
  if (!invoice) {
    throw new NotFoundException(`Invoice ${invoiceId} not found`);
  }

  // FIXED: Check if payment is from a split transaction
  let allocationAmountCents = payment.amountCents;

  if (payment.xeroSplitId) {
    const split = await this.xeroSplitRepository.findById(payment.xeroSplitId);
    if (split) {
      // Use NET amount from split, not GROSS
      allocationAmountCents = split.netAmountCents;

      this.logger.log(
        `Payment ${paymentId} is from split transaction: using NET amount ${split.netAmountCents} instead of GROSS ${payment.amountCents}`,
        {
          splitId: split.id,
          grossCents: payment.amountCents,
          netCents: split.netAmountCents,
          feeCents: split.feeAmountCents,
        }
      );
    }
  }

  // Continue with allocation using correct amount
  const allocation = await this.createAllocation({
    tenantId,
    paymentId,
    invoiceId,
    amountCents: allocationAmountCents,
  });

  // Update invoice balance
  await this.invoiceRepository.updateBalance(
    tenantId,
    invoiceId,
    invoice.balanceDueCents - allocationAmountCents,
  );

  return allocation;
}
```

### Add Bulk Allocation Support:
```typescript
async allocatePaymentsToInvoice(
  tenantId: string,
  invoiceId: string,
  paymentIds: string[],
): Promise<PaymentAllocation[]> {
  const allocations: PaymentAllocation[] = [];

  for (const paymentId of paymentIds) {
    const payment = await this.paymentRepository.findById(tenantId, paymentId);
    if (!payment) continue;

    // Determine allocation amount considering splits
    let amountCents = payment.amountCents;

    if (payment.xeroSplitId) {
      const split = await this.xeroSplitRepository.findById(payment.xeroSplitId);
      if (split) {
        amountCents = split.netAmountCents;
        this.logger.debug(`Using NET amount ${amountCents} for split payment`);
      }
    }

    const allocation = await this.allocatePayment(tenantId, paymentId, invoiceId);
    allocations.push(allocation);
  }

  return allocations;
}
```

### Add Split-Aware Auto-Allocation:
```typescript
async autoAllocatePayment(
  tenantId: string,
  paymentId: string,
): Promise<PaymentAllocation[]> {
  const payment = await this.paymentRepository.findById(tenantId, paymentId);
  if (!payment) {
    throw new NotFoundException(`Payment ${paymentId} not found`);
  }

  // Get allocation amount (NET if from split, otherwise full amount)
  let availableAmountCents = payment.amountCents;

  if (payment.xeroSplitId) {
    const split = await this.xeroSplitRepository.findById(payment.xeroSplitId);
    if (split) {
      availableAmountCents = split.netAmountCents;
    }
  }

  // Find unpaid invoices for the parent
  const unpaidInvoices = await this.invoiceRepository.findUnpaidByParent(
    tenantId,
    payment.parentId,
  );

  const allocations: PaymentAllocation[] = [];
  let remainingAmount = availableAmountCents;

  for (const invoice of unpaidInvoices) {
    if (remainingAmount <= 0) break;

    const allocateAmount = Math.min(remainingAmount, invoice.balanceDueCents);

    const allocation = await this.createAllocation({
      tenantId,
      paymentId,
      invoiceId: invoice.id,
      amountCents: allocateAmount,
    });

    allocations.push(allocation);
    remainingAmount -= allocateAmount;
  }

  return allocations;
}
```
</service_changes>

<!-- ============================================ -->
<!-- TEST REQUIREMENTS                           -->
<!-- ============================================ -->

<test_requirements>
## Unit Tests Required

### File: apps/api/tests/database/services/payment-allocation.service.spec.ts

```typescript
describe('PaymentAllocationService - Split Transaction Handling', () => {
  let service: PaymentAllocationService;
  let mockPaymentRepository: jest.Mocked<PaymentRepository>;
  let mockInvoiceRepository: jest.Mocked<InvoiceRepository>;
  let mockXeroSplitRepository: jest.Mocked<XeroSplitRepository>;

  beforeEach(async () => {
    // Setup mocks
  });

  describe('allocatePayment with split transaction', () => {
    it('should allocate NET amount when payment has xeroSplitId', async () => {
      const payment = {
        id: 'pay-001',
        tenantId: 'tenant-001',
        amountCents: 10636, // GROSS (R106.36)
        xeroSplitId: 'split-001',
      };

      const split = {
        id: 'split-001',
        netAmountCents: 10000, // NET (R100.00)
        feeAmountCents: 636,   // FEE (R6.36)
      };

      const invoice = {
        id: 'inv-001',
        balanceDueCents: 10000,
      };

      mockPaymentRepository.findById.mockResolvedValue(payment);
      mockXeroSplitRepository.findById.mockResolvedValue(split);
      mockInvoiceRepository.findById.mockResolvedValue(invoice);

      const result = await service.allocatePayment(
        'tenant-001',
        'pay-001',
        'inv-001',
      );

      // Should allocate R100 (NET), not R106.36 (GROSS)
      expect(result.amountCents).toBe(10000);
      expect(mockInvoiceRepository.updateBalance).toHaveBeenCalledWith(
        'tenant-001',
        'inv-001',
        0, // Balance should be 0 after R100 allocation
      );
    });

    it('should allocate full amount when payment has no split', async () => {
      const payment = {
        id: 'pay-002',
        tenantId: 'tenant-001',
        amountCents: 10000,
        xeroSplitId: null,
      };

      const invoice = {
        id: 'inv-002',
        balanceDueCents: 10000,
      };

      mockPaymentRepository.findById.mockResolvedValue(payment);
      mockInvoiceRepository.findById.mockResolvedValue(invoice);

      const result = await service.allocatePayment(
        'tenant-001',
        'pay-002',
        'inv-002',
      );

      expect(result.amountCents).toBe(10000);
    });

    it('should log when using NET amount from split', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');

      const payment = {
        id: 'pay-003',
        amountCents: 10636,
        xeroSplitId: 'split-002',
      };

      const split = {
        id: 'split-002',
        netAmountCents: 10000,
        feeAmountCents: 636,
      };

      mockPaymentRepository.findById.mockResolvedValue(payment);
      mockXeroSplitRepository.findById.mockResolvedValue(split);
      mockInvoiceRepository.findById.mockResolvedValue({ id: 'inv-003', balanceDueCents: 10000 });

      await service.allocatePayment('tenant-001', 'pay-003', 'inv-003');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('using NET amount'),
        expect.objectContaining({
          grossCents: 10636,
          netCents: 10000,
          feeCents: 636,
        }),
      );
    });
  });

  describe('autoAllocatePayment with split', () => {
    it('should auto-allocate using NET amount across multiple invoices', async () => {
      const payment = {
        id: 'pay-004',
        amountCents: 25000, // GROSS R250
        xeroSplitId: 'split-003',
        parentId: 'parent-001',
      };

      const split = {
        id: 'split-003',
        netAmountCents: 24000, // NET R240
        feeAmountCents: 1000,  // FEE R10
      };

      const invoices = [
        { id: 'inv-a', balanceDueCents: 10000 },
        { id: 'inv-b', balanceDueCents: 10000 },
        { id: 'inv-c', balanceDueCents: 10000 },
      ];

      mockPaymentRepository.findById.mockResolvedValue(payment);
      mockXeroSplitRepository.findById.mockResolvedValue(split);
      mockInvoiceRepository.findUnpaidByParent.mockResolvedValue(invoices);

      const results = await service.autoAllocatePayment('tenant-001', 'pay-004');

      // Should allocate R240 NET across invoices (R100 + R100 + R40)
      expect(results).toHaveLength(3);
      expect(results[0].amountCents).toBe(10000);
      expect(results[1].amountCents).toBe(10000);
      expect(results[2].amountCents).toBe(4000); // Remaining R40
    });
  });
});
```

### Integration Test
```typescript
describe('PaymentAllocation - E2E with Split', () => {
  it('should correctly allocate payment with bank fee split', async () => {
    // Create test data
    const parent = await createTestParent(tenantId);
    const invoice = await createTestInvoice(tenantId, parent.id, 10000); // R100

    // Simulate Xero transaction with fee
    const xeroTransaction = await createXeroTransaction(tenantId, {
      amountCents: 10636, // GROSS R106.36
      description: 'Payment + Cash Deposit Fee',
    });

    // Create split
    const split = await xeroSplitService.createSplit({
      tenantId,
      xeroTransactionId: xeroTransaction.id,
      netAmountCents: 10000,
      feeAmountCents: 636,
      feeType: 'CASH_DEPOSIT_FEE',
    });

    // Create payment linked to split
    const payment = await paymentService.createPayment({
      tenantId,
      parentId: parent.id,
      amountCents: 10636, // GROSS
      xeroSplitId: split.id,
    });

    // Allocate payment
    const allocation = await allocationService.allocatePayment(
      tenantId,
      payment.id,
      invoice.id,
    );

    // Verify allocation is NET amount
    expect(allocation.amountCents).toBe(10000); // R100 NET

    // Verify invoice balance is 0
    const updatedInvoice = await invoiceRepository.findById(tenantId, invoice.id);
    expect(updatedInvoice.balanceDueCents).toBe(0);

    // Verify fee is recorded separately
    const accruedCharge = await accruedChargeRepository.findBySplitId(split.id);
    expect(accruedCharge).toBeTruthy();
    expect(accruedCharge.amountCents).toBe(636);
  });
});
```
</test_requirements>

<!-- ============================================ -->
<!-- VERIFICATION                                -->
<!-- ============================================ -->

<verification_commands>
```bash
# 1. Build must pass
cd apps/api && pnpm run build

# 2. Run specific tests
pnpm test -- --testPathPattern="payment-allocation" --runInBand

# 3. Run all payment tests
pnpm test -- --testPathPattern="payment" --runInBand

# 4. Run split-related tests
pnpm test -- --testPathPattern="split|xero" --runInBand

# 5. Full test suite
pnpm test --runInBand

# 6. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] XeroSplitRepository injected into PaymentAllocationService
  - [ ] allocatePayment checks for xeroSplitId and uses NET amount
  - [ ] autoAllocatePayment uses NET amount for split payments
  - [ ] Logging added for split-aware allocations
  - [ ] Unit tests for split-aware allocation
  - [ ] Unit tests for auto-allocation with splits
  - [ ] Integration test for full payment flow with split
  - [ ] All existing tests pass
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors/warnings
  - [ ] Manual verification: Parent invoice shows correct (NET) allocation amount
</definition_of_done>

<anti_patterns>
  - **NEVER** allocate GROSS amount when payment has a split
  - **NEVER** ignore the fee component of split transactions
  - **NEVER** double-count fees in allocation
  - **NEVER** modify existing split service behavior - only consume its data
</anti_patterns>

</task_spec>
