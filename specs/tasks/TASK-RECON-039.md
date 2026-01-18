<task_spec id="TASK-RECON-039" version="2.0">

<metadata>
  <title>Fix CSV Import Fee Detection and Sign Correction</title>
  <status>COMPLETE</status>
  <phase>18</phase>
  <layer>logic</layer>
  <sequence>258</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-RECON-016</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-011</task_ref>
    <task_ref status="PENDING">TASK-RECON-038</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
  <last_updated>2026-01-18</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Bug State

  **File:** `apps/api/src/database/parsers/csv-parser.ts`
  **Location:** After line 168 (isCredit determination logic)

  **Problem:**
  - CSV bank statements sometimes have fee transactions marked as "Credit" in the Type column
  - The parser blindly trusts the CSV Type column
  - Fee transactions like "Cash Deposit Fee" should ALWAYS be DEBIT regardless of CSV markup
  - This causes reconciliation mismatches when bank statement fees show as positive

  **Example CSV Row:**
  ```csv
  Date,Description,Type,Amount
  17/10/2025,Cash Deposit Fee,Credit,52.64
  ```

  **Current Parsing (BUGGY):**
  ```typescript
  // Line ~168 - Blindly trusts CSV Type column
  const isCredit = type.toLowerCase() === 'credit';
  ```

  **Impact:**
  - Fee transactions imported with wrong sign
  - Reconciliation cannot match Xero fees (negative) with Bank fees (positive)
  - Balance calculations are incorrect
  - Parent invoice allocations affected

  **Sign Convention Standard:**
  ```
  Fee/Charge transactions: MUST be isCredit=false regardless of CSV markup
  Keywords: fee, charge, bank charge, service fee, debit order fee
  ```

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Fee Detection Pattern
  ```typescript
  const FEE_KEYWORDS = [
    'fee', 'charge', 'bank charge', 'service fee',
    'debit order fee', 'cash deposit fee', 'withdrawal fee',
    'monthly fee', 'transaction fee', 'atm fee'
  ];

  function isFeeTransaction(description: string): boolean {
    const lowerDesc = description.toLowerCase();
    return FEE_KEYWORDS.some(keyword => lowerDesc.includes(keyword));
  }
  ```

  ### 3. Sign Correction Pattern
  ```typescript
  // After determining isCredit from CSV:
  if (isFeeTransaction(description) && isCredit) {
    logger.warn(`Fee "${description}" incorrectly marked as credit, correcting to debit`);
    isCredit = false;
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
This task fixes a bug where the CSV parser incorrectly imports fee transactions as credits when the bank statement CSV marks them incorrectly. Banks sometimes export fees with "Credit" type, but accounting standards require fees to be DEBITS.

**Root Cause:**
- CSV parser trusts the Type column without validation
- No semantic analysis of description to detect fee transactions
- No correction logic for known fee patterns

**Accounting Standard:**
- Bank Fees ALWAYS reduce your bank balance
- They are DEBITS regardless of how the bank CSV marks them
- The CSV Type column is often unreliable for fees
</context>

<scope>
  <in_scope>
    - Add fee detection function to csv-parser.ts
    - Add sign correction logic after isCredit determination
    - Log warnings when correcting fee signs
    - Add comprehensive unit tests for fee detection
    - Handle all common fee transaction patterns
  </in_scope>
  <out_of_scope>
    - Xero bank feed changes (separate task TASK-RECON-038)
    - Payment allocation changes (separate task)
    - UI changes for highlighting corrected transactions
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- CODE CHANGES                                -->
<!-- ============================================ -->

<service_changes>
## File: apps/api/src/database/parsers/csv-parser.ts

### Add Fee Detection Constants (top of file):
```typescript
/**
 * Keywords that indicate a transaction is a fee/charge
 * These transactions should ALWAYS be debits (isCredit=false)
 */
const FEE_KEYWORDS = [
  'fee',
  'charge',
  'bank charge',
  'bank charges',
  'service fee',
  'service charge',
  'debit order fee',
  'cash deposit fee',
  'cash handling fee',
  'withdrawal fee',
  'monthly fee',
  'transaction fee',
  'atm fee',
  'card fee',
  'account fee',
  'maintenance fee',
  'penalty',
  'interest charge',
] as const;

/**
 * Detects if a transaction description indicates a fee/charge
 * @param description Transaction description from CSV
 * @returns true if transaction is a fee that should be a debit
 */
function isFeeTransaction(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  return FEE_KEYWORDS.some(keyword => lowerDesc.includes(keyword));
}
```

### Modify parseRow Function (after line ~168):
```typescript
// Current code (around line 168):
const typeColumn = row[typeIndex]?.trim() || '';
let isCredit = typeColumn.toLowerCase() === 'credit';

// ADD THIS AFTER:
// Fee correction: Bank fees must ALWAYS be debits regardless of CSV markup
if (isFeeTransaction(description) && isCredit) {
  this.logger.warn(
    `CSV import: Fee transaction "${description}" marked as credit, correcting to debit`,
    {
      originalType: typeColumn,
      amount: amountValue,
      rowNumber: rowIndex + 2 // +2 for header and 0-index
    }
  );
  isCredit = false;
}
```

### Add Audit Trail for Corrections:
```typescript
// Track corrections for reporting
interface CsvImportResult {
  transactions: Transaction[];
  corrections: Array<{
    rowNumber: number;
    description: string;
    correctionType: 'FEE_SIGN_CORRECTION';
    originalValue: string;
    correctedValue: string;
  }>;
  warnings: string[];
}
```
</service_changes>

<!-- ============================================ -->
<!-- TEST REQUIREMENTS                           -->
<!-- ============================================ -->

<test_requirements>
## Unit Tests Required

### File: apps/api/tests/database/parsers/csv-parser.spec.ts

```typescript
describe('CsvParser - Fee Detection', () => {
  describe('isFeeTransaction', () => {
    it.each([
      ['Cash Deposit Fee', true],
      ['Bank Charges', true],
      ['Monthly Service Fee', true],
      ['ATM Fee', true],
      ['Debit Order Fee', true],
      ['Transaction Fee', true],
      ['Payment Received', false],
      ['Salary Deposit', false],
      ['Transfer from Savings', false],
      ['Purchase - Woolworths', false],
    ])('should detect "%s" as fee: %s', (description, expected) => {
      expect(isFeeTransaction(description)).toBe(expected);
    });
  });

  describe('parseRow - Fee Sign Correction', () => {
    it('should correct fee marked as credit to debit', async () => {
      const csvRow = {
        Date: '17/10/2025',
        Description: 'Cash Deposit Fee',
        Type: 'Credit',  // Incorrectly marked
        Amount: '52.64',
      };

      const result = await parser.parseRow(csvRow, 1);

      expect(result.isCredit).toBe(false); // Should be corrected to debit
      expect(result.amountCents).toBe(5264);
    });

    it('should keep fee as debit when correctly marked', async () => {
      const csvRow = {
        Date: '17/10/2025',
        Description: 'Monthly Bank Charges',
        Type: 'Debit',
        Amount: '25.00',
      };

      const result = await parser.parseRow(csvRow, 1);

      expect(result.isCredit).toBe(false);
      expect(result.amountCents).toBe(2500);
    });

    it('should not affect non-fee credits', async () => {
      const csvRow = {
        Date: '17/10/2025',
        Description: 'Salary Deposit',
        Type: 'Credit',
        Amount: '15000.00',
      };

      const result = await parser.parseRow(csvRow, 1);

      expect(result.isCredit).toBe(true); // Should remain credit
      expect(result.amountCents).toBe(1500000);
    });

    it('should log warning when correcting fee sign', async () => {
      const loggerWarnSpy = jest.spyOn(parser['logger'], 'warn');

      const csvRow = {
        Date: '17/10/2025',
        Description: 'Service Charge',
        Type: 'Credit',
        Amount: '10.00',
      };

      await parser.parseRow(csvRow, 5);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('marked as credit, correcting to debit'),
        expect.objectContaining({ rowNumber: 7 })
      );
    });
  });
});
```

### Integration Test
```typescript
describe('CsvParser - Full Import with Fee Corrections', () => {
  it('should import CSV with mixed transactions and correct fee signs', async () => {
    const csvContent = `Date,Description,Type,Amount
17/10/2025,Cash Deposit,Credit,1000.00
17/10/2025,Cash Deposit Fee,Credit,6.36
18/10/2025,Bank Charges,Debit,25.00
19/10/2025,Salary,Credit,15000.00`;

    const result = await parser.parse(csvContent, tenantId);

    expect(result.transactions).toHaveLength(4);

    // Cash Deposit - should be credit
    expect(result.transactions[0].isCredit).toBe(true);
    expect(result.transactions[0].amountCents).toBe(100000);

    // Cash Deposit Fee - CORRECTED to debit
    expect(result.transactions[1].isCredit).toBe(false);
    expect(result.transactions[1].amountCents).toBe(636);

    // Bank Charges - already debit
    expect(result.transactions[2].isCredit).toBe(false);
    expect(result.transactions[2].amountCents).toBe(2500);

    // Salary - should be credit
    expect(result.transactions[3].isCredit).toBe(true);
    expect(result.transactions[3].amountCents).toBe(1500000);

    // Should have 1 correction
    expect(result.corrections).toHaveLength(1);
    expect(result.corrections[0].correctionType).toBe('FEE_SIGN_CORRECTION');
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
pnpm test -- --testPathPattern="csv-parser" --runInBand

# 3. Run all parser tests
pnpm test -- --testPathPattern="parsers" --runInBand

# 4. Full test suite
pnpm test --runInBand

# 5. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] Fee detection function added to csv-parser.ts
  - [ ] Sign correction logic implemented after isCredit determination
  - [ ] Warning logging added for corrected transactions
  - [ ] Corrections tracking added to import result
  - [ ] Unit tests added for fee detection (10+ cases)
  - [ ] Unit tests added for sign correction
  - [ ] Integration test for full CSV import with corrections
  - [ ] All existing tests pass
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors/warnings
  - [ ] Manual verification: CSV fees imported as debits
</definition_of_done>

<anti_patterns>
  - **NEVER** blindly trust CSV Type column for fee transactions
  - **NEVER** import fees as credits (they are always debits)
  - **NEVER** silently correct data without logging
  - **NEVER** use hardcoded strings - use constants for fee keywords
</anti_patterns>

</task_spec>
