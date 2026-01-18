<task_spec id="TASK-RECON-038" version="2.0">

<metadata>
  <title>Fix Xero Bank Feed Fee Sign Preservation</title>
  <status>COMPLETE</status>
  <phase>18</phase>
  <layer>logic</layer>
  <sequence>257</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-RECON-015</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-037</task_ref>
    <task_ref status="COMPLETE">TASK-XERO-008</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>2 hours</estimated_effort>
  <last_updated>2026-01-18</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Bug State

  **File:** `apps/api/src/integrations/xero/bank-feed.service.ts`
  **Line:** 619

  **Current (BUGGY) Code:**
  ```typescript
  // Line 619 - Math.abs() STRIPS negative sign from fee transactions!
  amountCents: Math.abs(amountCents),
  ```

  **Problem:**
  - Xero sends fee transactions with NEGATIVE amounts (e.g., -R6.36 for Cash Deposit Fee)
  - The `Math.abs()` call converts -636 cents to +636 cents
  - This causes fees to display as POSITIVE (+R6.36) instead of NEGATIVE (-R6.36)
  - Violates accounting standard: fees are DEBITS (reduce bank balance)

  **Impact:**
  - Reconciliation amounts mismatch between Xero and Bank
  - Parent invoice allocations may be incorrect
  - Balance sheet integrity compromised
  - User confusion when viewing fee transactions

  **Sign Convention Standard:**
  ```
  amountCents (number) + isCredit (boolean)
  - Fees/Charges: amountCents=NEGATIVE, isCredit=false (DEBIT)
  - Income: amountCents=POSITIVE, isCredit=true (CREDIT)
  ```

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Sign Convention Pattern
  ```typescript
  // CORRECT: Preserve Xero's sign, set isCredit based on amount direction
  const amountCents = Math.round(xeroAmount * 100);
  const isCredit = amountCents > 0;

  return {
    amountCents, // Keep original sign!
    isCredit,
  };
  ```

  ### 3. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```

  ### 4. Repository Pattern
  - Every method has try/catch with logging
  - Re-throw custom exceptions (NEVER swallow errors)
</critical_patterns>

<context>
This task fixes a critical bug where the Xero bank feed service strips the sign from fee transactions using `Math.abs()`. This causes:
1. Fees to display as positive instead of negative
2. Reconciliation mismatches when matching Xero transactions to bank statements
3. Incorrect allocations to parent invoices

**Root Cause Analysis:**
The original developer likely used `Math.abs()` thinking all amounts should be positive, but this violates the sign convention where:
- `amountCents` carries the sign (positive=credit, negative=debit)
- `isCredit` boolean indicates direction

**Accounting Standard:**
- Bank Fees are DEBITS (reduce bank balance)
- Should appear as NEGATIVE amounts with `isCredit: false`
</context>

<scope>
  <in_scope>
    - Remove Math.abs() from bank-feed.service.ts line 619
    - Ensure amountCents preserves Xero's original sign
    - Add unit tests for fee transaction sign preservation
    - Update any related transformation functions
  </in_scope>
  <out_of_scope>
    - CSV parser changes (separate task)
    - Payment allocation changes (separate task)
    - UI changes for displaying fees
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- CODE CHANGES                                -->
<!-- ============================================ -->

<service_changes>
## File: apps/api/src/integrations/xero/bank-feed.service.ts

### Current Code (Line ~619):
```typescript
private transformBankTransaction(xeroTx: XeroBankTransaction): BankTransaction {
  const amountCents = Math.abs(Math.round(xeroTx.amount * 100)); // BUG!
  const isCredit = xeroTx.amount > 0;

  return {
    // ...
    amountCents,
    isCredit,
  };
}
```

### Fixed Code:
```typescript
private transformBankTransaction(xeroTx: XeroBankTransaction): BankTransaction {
  // FIXED: Preserve Xero's sign - DO NOT use Math.abs()
  // Xero sends negative amounts for fees/debits, positive for credits
  const amountCents = Math.round(xeroTx.amount * 100);
  const isCredit = amountCents > 0;

  return {
    // ...
    amountCents,
    isCredit,
  };
}
```

### Additional Validation (Optional):
```typescript
// Add fee detection logging for audit purposes
if (this.isFeeTransaction(xeroTx.description) && amountCents > 0) {
  this.logger.warn(
    `Fee transaction "${xeroTx.description}" has positive amount - verify sign convention`,
    { transactionId: xeroTx.bankTransactionID, amountCents }
  );
}

private isFeeTransaction(description: string): boolean {
  return /\b(fee|charge|bank charges|service fee)\b/i.test(description);
}
```
</service_changes>

<!-- ============================================ -->
<!-- TEST REQUIREMENTS                           -->
<!-- ============================================ -->

<test_requirements>
## Unit Tests Required

### File: apps/api/tests/integrations/xero/bank-feed.service.spec.ts

```typescript
describe('BankFeedService - Fee Sign Preservation', () => {
  describe('transformBankTransaction', () => {
    it('should preserve negative sign for fee transactions', () => {
      const xeroTx = {
        bankTransactionID: 'tx-001',
        amount: -6.36, // Negative fee from Xero
        description: 'Cash Deposit Fee',
        date: '2025-10-17',
      };

      const result = service['transformBankTransaction'](xeroTx);

      expect(result.amountCents).toBe(-636); // Should be NEGATIVE
      expect(result.isCredit).toBe(false);   // Fee is a DEBIT
    });

    it('should preserve positive sign for credit transactions', () => {
      const xeroTx = {
        bankTransactionID: 'tx-002',
        amount: 100.00, // Positive credit
        description: 'Payment Received',
        date: '2025-10-17',
      };

      const result = service['transformBankTransaction'](xeroTx);

      expect(result.amountCents).toBe(10000); // Should be POSITIVE
      expect(result.isCredit).toBe(true);     // Credit
    });

    it('should handle bank charges correctly', () => {
      const xeroTx = {
        bankTransactionID: 'tx-003',
        amount: -52.64, // Bank service charge
        description: 'Monthly Service Fee',
        date: '2025-10-17',
      };

      const result = service['transformBankTransaction'](xeroTx);

      expect(result.amountCents).toBe(-5264);
      expect(result.isCredit).toBe(false);
    });
  });
});
```

### Integration Test
```typescript
describe('BankFeedService - Integration', () => {
  it('should import Xero transactions with correct signs', async () => {
    // Mock Xero API response with mixed positive/negative transactions
    const xeroTransactions = [
      { amount: 1000.00, description: 'Cash Deposit' },
      { amount: -6.36, description: 'Cash Deposit Fee' },
      { amount: -25.00, description: 'Bank Charges' },
    ];

    const results = await service.importTransactions(tenantId, xeroTransactions);

    expect(results[0].amountCents).toBe(100000);
    expect(results[0].isCredit).toBe(true);

    expect(results[1].amountCents).toBe(-636);
    expect(results[1].isCredit).toBe(false);

    expect(results[2].amountCents).toBe(-2500);
    expect(results[2].isCredit).toBe(false);
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
pnpm test -- --testPathPattern="bank-feed.service" --runInBand

# 3. Run all reconciliation tests
pnpm test -- --testPathPattern="reconciliation" --runInBand

# 4. Full test suite
pnpm test --runInBand

# 5. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] Math.abs() removed from bank-feed.service.ts line 619
  - [ ] amountCents preserves original Xero sign
  - [ ] isCredit is correctly derived from sign
  - [ ] Unit tests added for fee sign preservation
  - [ ] All existing tests pass
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors/warnings
  - [ ] Manual verification: Fee transactions show as negative in reconciliation UI
</definition_of_done>

<anti_patterns>
  - **NEVER** use Math.abs() on financial amounts without explicit reason
  - **NEVER** assume all amounts should be positive
  - **NEVER** ignore the sign convention (amountCents + isCredit)
  - **NEVER** swallow errors in financial transformations
</anti_patterns>

</task_spec>
