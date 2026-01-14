<task_spec id="TASK-AGENT-006" version="1.0">

<metadata>
  <title>PDF Extraction Validation Agent</title>
  <status>ready</status>
  <layer>agent</layer>
  <sequence>42</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <requirement_ref>NFR-DATA-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-015 (LLMWhisperer PDF Extraction)</task_ref>
    <task_ref status="COMPLETE">TASK-AGENT-001 (Claude Code Configuration)</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<problem_statement>
## The Problem

Current PDF extraction pipeline (LLMWhisperer OCR) is producing wildly incorrect amounts:
- **Actual PDF**: Opening R 0.00 → Closing R 100.00 (July), Opening R 100.00 → Closing R 3,531.00 (August)
- **System Extracted**: R 944,500.00, R 374,730.00, R 73,720.00

**Root Causes Identified:**
1. OCR misreads decimal separators (. vs ,) in South African format
2. OCR adds/removes digits due to poor image quality
3. Regex-based parsing has no semantic validation
4. No balance reconciliation (opening + transactions ≠ closing)
5. No cross-validation against expected transaction ranges

**Impact:**
- All downstream agents (Categorizer, Payment Matcher) process garbage data
- Reconciliation reports show massive false discrepancies
- User trust in system is compromised
</problem_statement>

<context>
This agent sits BETWEEN the PDF parser and the transaction import:

```
PDF File → [HybridPdfParser] → Raw Extracted Data → [ValidationAgent] → Validated Data → [TransactionImportService]
```

**Integration Point:**
- Called from `TransactionImportService.importBankStatement()`
- Receives: `ParsedBankStatement` from HybridPdfParser
- Returns: `ValidatedBankStatement` with confidence scores and corrections

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers)
- Tenant isolation on ALL queries
- NO mock data in tests - use real PostgreSQL
- Fail fast with descriptive errors
- Log all decisions to `.claude/logs/decisions.jsonl`
</context>

<solution_design>

## Agent Architecture

```typescript
// src/agents/extraction-validator/
├── validator.agent.ts          # Main agent
├── validator.module.ts         # NestJS module
├── balance-reconciler.ts       # Opening + transactions = closing
├── amount-sanity-checker.ts    # Detect impossible amounts
├── format-corrector.ts         # Fix common OCR errors
├── decision-logger.ts          # JSONL logging
├── index.ts
└── interfaces/
    └── validator.interface.ts
```

## Validation Rules

### Rule 1: Balance Reconciliation
```
openingBalance + Σ(credits) - Σ(debits) = closingBalance
```
If mismatch:
- Flag statement as INVALID
- Calculate expected vs actual difference
- Suggest which transactions may have OCR errors

### Rule 2: Amount Sanity Checks
For SA bank statements, typical ranges:
- Individual transactions: R 0.01 to R 1,000,000 (most < R 100,000)
- Opening/Closing balances: R 0 to R 10,000,000 (creche context)
- Amounts > R 1,000,000 are SUSPICIOUS and need verification

### Rule 3: Common OCR Error Detection
| Error Pattern | Detection | Correction |
|---------------|-----------|------------|
| Missing decimal | 10000 instead of 100.00 | Divide by 100 if balance fails |
| Extra zeros | 944500 instead of 9445 | Check balance reconciliation |
| Comma/period swap | 1.000,00 vs 1,000.00 | Normalize to SA format |
| Merged digits | 123456 from "123" and "456" | Split at logical points |

### Rule 4: Transaction Pattern Validation
Compare extracted data against known patterns:
- FNB statement date formats: DD Mon YYYY
- Amount always has 2 decimal places
- Balance running total should be monotonic within reason

## Confidence Scoring

```typescript
interface ValidationResult {
  isValid: boolean;
  confidence: number;        // 0-100
  balanceReconciled: boolean;
  corrections: Correction[]; // Suggested fixes
  flags: ValidationFlag[];   // Issues detected
  reasoning: string;         // Human-readable explanation
}
```

**Confidence Calculation:**
- Balance reconciles: +40 points
- All amounts in expected range: +20 points
- Date format consistency: +15 points
- No OCR error patterns detected: +15 points
- Previous statement continuity: +10 points

**Auto-Accept Threshold:** 90% confidence
**Review Required:** < 90% confidence
**Reject:** < 50% confidence OR balance mismatch > 10%

## Integration Flow

```typescript
// In TransactionImportService.importBankStatement()
async importBankStatement(file: Buffer, tenantId: string) {
  // 1. Parse PDF
  const rawData = await this.hybridParser.parse(file);

  // 2. NEW: Validate extraction
  const validation = await this.validationAgent.validate(rawData, tenantId);

  if (!validation.isValid) {
    // Log and escalate
    await this.escalationManager.escalate({
      type: 'EXTRACTION_INVALID',
      data: rawData,
      validation,
      tenantId,
    });
    throw new ExtractionValidationError(validation.reasoning);
  }

  // 3. Apply corrections if any
  const correctedData = this.applyCorrections(rawData, validation.corrections);

  // 4. Continue with import
  return this.createTransactions(correctedData, tenantId);
}
```

</solution_design>

<implementation_actions>

## Step 1: Create Agent Structure

```bash
mkdir -p src/agents/extraction-validator/interfaces
```

## Step 2: Implement Core Interfaces

```typescript
// src/agents/extraction-validator/interfaces/validator.interface.ts
export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  balanceReconciled: boolean;
  balanceDifference: number;  // In cents
  corrections: Correction[];
  flags: ValidationFlag[];
  reasoning: string;
}

export interface Correction {
  type: 'AMOUNT' | 'DATE' | 'DESCRIPTION';
  original: string | number;
  corrected: string | number;
  confidence: number;
  reason: string;
}

export interface ValidationFlag {
  severity: 'INFO' | 'WARNING' | 'ERROR';
  code: string;
  message: string;
  affectedField?: string;
  lineNumber?: number;
}
```

## Step 3: Implement Balance Reconciler

```typescript
// src/agents/extraction-validator/balance-reconciler.ts
export class BalanceReconciler {
  reconcile(statement: ParsedBankStatement): ReconciliationResult {
    const { openingBalance, closingBalance, transactions } = statement;

    // All amounts in cents
    const credits = transactions
      .filter(t => t.isCredit)
      .reduce((sum, t) => sum + t.amountCents, 0);

    const debits = transactions
      .filter(t => !t.isCredit)
      .reduce((sum, t) => sum + t.amountCents, 0);

    const calculatedClosing = openingBalance + credits - debits;
    const difference = Math.abs(calculatedClosing - closingBalance);
    const percentDiff = closingBalance > 0
      ? (difference / closingBalance) * 100
      : difference > 0 ? 100 : 0;

    return {
      reconciled: difference === 0,
      calculatedBalance: calculatedClosing,
      expectedBalance: closingBalance,
      difference,
      percentDifference: percentDiff,
      credits,
      debits,
    };
  }
}
```

## Step 4: Implement Amount Sanity Checker

```typescript
// src/agents/extraction-validator/amount-sanity-checker.ts
export class AmountSanityChecker {
  private readonly MAX_TRANSACTION_CENTS = 100_000_000; // R 1,000,000
  private readonly MAX_BALANCE_CENTS = 1_000_000_000;   // R 10,000,000
  private readonly SUSPICIOUS_THRESHOLD_CENTS = 10_000_000; // R 100,000

  checkAmount(amountCents: number, type: 'TRANSACTION' | 'BALANCE'): SanityResult {
    const maxAllowed = type === 'TRANSACTION'
      ? this.MAX_TRANSACTION_CENTS
      : this.MAX_BALANCE_CENTS;

    if (amountCents > maxAllowed) {
      return {
        valid: false,
        flag: 'AMOUNT_EXCEEDS_MAX',
        message: `Amount R ${amountCents / 100} exceeds maximum for ${type}`,
        suggestedCorrection: this.suggestCorrection(amountCents),
      };
    }

    if (amountCents > this.SUSPICIOUS_THRESHOLD_CENTS) {
      return {
        valid: true,
        flag: 'AMOUNT_SUSPICIOUS',
        message: `Large amount R ${amountCents / 100} may need verification`,
      };
    }

    return { valid: true };
  }

  suggestCorrection(amountCents: number): number | null {
    // Try dividing by powers of 10 to find reasonable amount
    for (const divisor of [100, 1000, 10000]) {
      const corrected = Math.round(amountCents / divisor);
      if (corrected >= 100 && corrected <= this.SUSPICIOUS_THRESHOLD_CENTS) {
        return corrected;
      }
    }
    return null;
  }
}
```

## Step 5: Implement Main Agent

```typescript
// src/agents/extraction-validator/validator.agent.ts
@Injectable()
export class ExtractionValidatorAgent {
  constructor(
    private readonly balanceReconciler: BalanceReconciler,
    private readonly sanityChecker: AmountSanityChecker,
    private readonly formatCorrector: FormatCorrector,
    private readonly decisionLogger: DecisionLogger,
    private readonly prisma: PrismaService,
  ) {}

  async validate(
    statement: ParsedBankStatement,
    tenantId: string,
  ): Promise<ValidationResult> {
    const flags: ValidationFlag[] = [];
    const corrections: Correction[] = [];
    let confidence = 0;

    // 1. Balance reconciliation
    const reconciliation = this.balanceReconciler.reconcile(statement);
    if (reconciliation.reconciled) {
      confidence += 40;
    } else {
      flags.push({
        severity: 'ERROR',
        code: 'BALANCE_MISMATCH',
        message: `Balance off by R ${reconciliation.difference / 100}`,
      });
    }

    // 2. Amount sanity checks
    const amountFlags = this.checkAllAmounts(statement);
    if (amountFlags.length === 0) {
      confidence += 20;
    } else {
      flags.push(...amountFlags);
    }

    // 3. Try corrections if balance doesn't reconcile
    if (!reconciliation.reconciled) {
      const suggestedCorrections = await this.suggestCorrections(
        statement,
        reconciliation,
      );
      corrections.push(...suggestedCorrections);
    }

    // 4. Check date consistency
    if (this.datesConsistent(statement)) {
      confidence += 15;
    }

    // 5. Check for OCR patterns
    if (!this.hasOcrPatterns(statement)) {
      confidence += 15;
    }

    // 6. Check continuity with previous statement
    const continuityScore = await this.checkContinuity(statement, tenantId);
    confidence += continuityScore;

    const isValid = confidence >= 90 && reconciliation.reconciled;

    const result: ValidationResult = {
      isValid,
      confidence,
      balanceReconciled: reconciliation.reconciled,
      balanceDifference: reconciliation.difference,
      corrections,
      flags,
      reasoning: this.generateReasoning(reconciliation, flags, corrections),
    };

    // Log decision
    await this.decisionLogger.logValidation(tenantId, statement, result);

    return result;
  }
}
```

## Step 6: Update TransactionImportService

Modify `src/database/services/transaction-import.service.ts` to use the validation agent.

## Step 7: Create Tests

```typescript
// tests/agents/extraction-validator/validator.agent.spec.ts
describe('ExtractionValidatorAgent', () => {
  describe('validate', () => {
    it('should pass valid statement with reconciled balance', async () => {
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000, // R 100.00
        transactions: [
          { amountCents: 10000, isCredit: true }, // R 100 credit
        ],
      });

      const result = await agent.validate(statement, tenantId);

      expect(result.isValid).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
      expect(result.balanceReconciled).toBe(true);
    });

    it('should reject statement with balance mismatch', async () => {
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 94450000, // R 944,500 - WRONG!
        transactions: [
          { amountCents: 10000, isCredit: true }, // R 100 credit
        ],
      });

      const result = await agent.validate(statement, tenantId);

      expect(result.isValid).toBe(false);
      expect(result.balanceReconciled).toBe(false);
      expect(result.flags).toContainEqual(
        expect.objectContaining({ code: 'BALANCE_MISMATCH' })
      );
    });

    it('should suggest corrections for obvious OCR errors', async () => {
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000, // R 100.00 - correct
        transactions: [
          { amountCents: 1000000, isCredit: true }, // R 10,000 - OCR error (missing decimal)
        ],
      });

      const result = await agent.validate(statement, tenantId);

      expect(result.corrections.length).toBeGreaterThan(0);
      expect(result.corrections[0].original).toBe(1000000);
      expect(result.corrections[0].corrected).toBe(10000);
    });
  });
});
```

</implementation_actions>

<validation_criteria>
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
- All validation agent tests pass
- Balance reconciliation detects mismatches
- Amount sanity checker flags impossible values
- Corrections suggested when balance fails but can be fixed
- Integration with TransactionImportService works
- Decisions logged to `.claude/logs/decisions.jsonl`
- Escalations created for invalid extractions
- 90%+ confidence required for auto-accept
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPatterns="extraction-validator" --verbose
</test_commands>

<future_enhancements>
## Phase 2: LLM-Powered Validation

Add Claude API integration for semantic validation:
- "Does R 944,500 make sense for a creche bank account?"
- "This transaction description says 'SALARY' but amount is R 0.10 - is this valid?"
- Use context from previous statements to detect anomalies

## Phase 3: Adaptive Learning

Train on corrections:
- Store user corrections to OCR errors
- Build bank-specific pattern library
- Improve sanity check thresholds based on tenant data
</future_enhancements>

</task_spec>
