<task_spec id="TASK-SARS-011" version="1.0">

<metadata>
  <title>VAT Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>28</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-002</requirement_ref>
    <requirement_ref>REQ-SARS-004</requirement_ref>
    <requirement_ref>REQ-SARS-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-002</task_ref>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the VATService which handles all Value-Added Tax calculations for
South African SARS compliance. The service calculates output VAT (on sales/invoices)
and input VAT (on purchases), distinguishes between standard-rated (15%), zero-rated,
and exempt supplies, and flags missing VAT details required for VAT201 submissions.
The service must use Decimal.js with banker's rounding for all monetary calculations
to ensure accuracy and SARS compliance.
</context>

<input_context_files>
  <file purpose="technical_spec">specs/technical/api-contracts.md#SarsService</file>
  <file purpose="vat_requirements">specs/requirements/sars-requirements.md</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="invoice_entity">src/database/entities/invoice.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-002 completed (Transaction categorization exists)</check>
  <check>TASK-BILL-003 completed (Invoice entities exist)</check>
  <check>Decimal.js library installed</check>
  <check>TypeScript compilation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Create VATService class in src/core/sars/
    - Implement calculateOutputVAT method (for invoices/sales)
    - Implement calculateInputVAT method (for expenses/purchases)
    - Implement classifyVATType method (STANDARD, ZERO_RATED, EXEMPT, NO_VAT)
    - Implement validateVATDetails method
    - Implement getFlaggedItems method for missing VAT info
    - Use South African VAT rate of 15% (configurable constant)
    - Use Decimal.js banker's rounding for all calculations
    - Handle zero-rated vs exempt distinction
    - Create VATCalculationResult interface
    - Create VATFlaggedItem interface
    - Unit tests with edge cases
  </in_scope>
  <out_of_scope>
    - VAT201 document generation (TASK-SARS-014)
    - API endpoints
    - Database persistence of calculations
    - Historical VAT rate changes
    - Foreign currency VAT calculations
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/sars/vat.service.ts">
      import Decimal from 'decimal.js';

      enum VATType {
        STANDARD = 'STANDARD',
        ZERO_RATED = 'ZERO_RATED',
        EXEMPT = 'EXEMPT',
        NO_VAT = 'NO_VAT'
      }

      interface VATCalculationResult {
        totalExcludingVAT: Decimal;
        vatAmount: Decimal;
        totalIncludingVAT: Decimal;
        standardRated: Decimal;
        zeroRated: Decimal;
        exempt: Decimal;
        itemCount: number;
      }

      interface VATFlaggedItem {
        transactionId?: string;
        invoiceId?: string;
        description: string;
        issue: string;
        amount: Decimal;
        severity: 'WARNING' | 'ERROR';
      }

      @Injectable()
      export class VATService {
        private readonly VAT_RATE = new Decimal('0.15'); // SA 15% VAT

        async calculateOutputVAT(
          invoices: Invoice[],
          periodStart: Date,
          periodEnd: Date
        ): Promise&lt;VATCalculationResult&gt;;

        async calculateInputVAT(
          transactions: Transaction[],
          periodStart: Date,
          periodEnd: Date
        ): Promise&lt;VATCalculationResult&gt;;

        classifyVATType(
          accountCode: string,
          description: string,
          supplierVATNumber?: string
        ): VATType;

        validateVATDetails(
          transaction: Transaction | Invoice
        ): ValidationResult;

        getFlaggedItems(
          transactions: Transaction[],
          invoices: Invoice[]
        ): VATFlaggedItem[];

        private calculateVAT(amount: Decimal, vatType: VATType): Decimal;
        private extractVATFromInclusive(amountIncVAT: Decimal): Decimal;
      }
    </signature>
    <signature file="src/core/sars/interfaces/vat.interface.ts">
      export enum VATType {
        STANDARD = 'STANDARD',
        ZERO_RATED = 'ZERO_RATED',
        EXEMPT = 'EXEMPT',
        NO_VAT = 'NO_VAT'
      }

      export interface VATCalculationResult {
        totalExcludingVAT: Decimal;
        vatAmount: Decimal;
        totalIncludingVAT: Decimal;
        standardRated: Decimal;
        zeroRated: Decimal;
        exempt: Decimal;
        itemCount: number;
      }

      export interface VATFlaggedItem {
        transactionId?: string;
        invoiceId?: string;
        description: string;
        issue: string;
        amount: Decimal;
        severity: 'WARNING' | 'ERROR';
      }

      export interface ValidationResult {
        isValid: boolean;
        errors: string[];
        warnings: string[];
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - VAT rate must be 15% (SA current rate)
    - Must NOT use 'any' type anywhere
    - Must distinguish zero-rated (0% but claimable) vs exempt (0% not claimable)
    - calculateOutputVAT must only process invoices in period
    - calculateInputVAT must only process categorized expense transactions
    - Flagged items must include severity level
    - Must handle both VAT-inclusive and VAT-exclusive amounts
    - Zero-rated items: Exports, basic foodstuffs (per SA VAT Act)
    - Exempt items: Financial services, residential rent
    - All methods must be async to allow future DB queries
    - Must validate VAT numbers format (10 digits for SA)
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Unit tests pass with 100% coverage
    - VAT calculation with R1000 excl VAT yields R150 VAT exactly
    - Banker's rounding test: R100.125 rounds to R100.12, R100.135 rounds to R100.14
    - Zero-rated items return 0 VAT but are counted separately from exempt
    - Missing VAT number on expense >R5000 triggers ERROR flag
    - Output VAT on invoice with 15% matches expected value
    - Input VAT extraction from inclusive amount is accurate
    - getFlaggedItems identifies missing supplier details
  </verification>
</definition_of_done>

<pseudo_code>
VATService Implementation (src/core/sars/vat.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN,
      toExpPos: 9e15,
      minE: -9e15
    })

  calculateOutputVAT(invoices, periodStart, periodEnd):
    Filter invoices by date range (issue_date >= periodStart AND <= periodEnd)
    Initialize totals with Decimal.js

    For each invoice:
      Get vatType from classifyVATType
      Add to appropriate bucket (standard/zero/exempt)
      Calculate VAT amount using calculateVAT
      Accumulate totals

    Return VATCalculationResult:
      totalExcludingVAT = sum of all subtotals
      vatAmount = sum of all VAT
      totalIncludingVAT = totalExcludingVAT + vatAmount
      standardRated, zeroRated, exempt = respective buckets
      itemCount = invoice count

  calculateInputVAT(transactions, periodStart, periodEnd):
    Filter transactions:
      - date >= periodStart AND <= periodEnd
      - is_credit = false (expenses only)
      - status = CATEGORIZED
      - account category is expense

    Initialize totals with Decimal.js

    For each transaction:
      Get vatType from classifyVATType
      Determine if amount is VAT-inclusive or exclusive
      Calculate/extract VAT using extractVATFromInclusive or calculateVAT
      Add to appropriate bucket
      Accumulate totals

    Return VATCalculationResult

  classifyVATType(accountCode, description, supplierVATNumber):
    Check account code against mapping:
      - If account in ZERO_RATED_ACCOUNTS: return ZERO_RATED
        Examples: 1200 (Exports), certain food accounts
      - If account in EXEMPT_ACCOUNTS: return EXEMPT
        Examples: 8100 (Bank charges), 8200 (Interest)
      - If supplierVATNumber is null/empty: return NO_VAT
      - Else: return STANDARD

    Fallback description keyword matching:
      - Contains "export": ZERO_RATED
      - Contains "bank charge", "interest": EXEMPT
      - Default: STANDARD if supplier has VAT number

  validateVATDetails(item):
    errors = []
    warnings = []

    If item is Transaction (expense):
      If amount > R5000 AND no supplier VAT number:
        errors.push("VAT number required for expense > R5000")
      If amount > R2000 AND no supplier name:
        warnings.push("Supplier name recommended")

    If item is Invoice (output):
      If vatType = STANDARD AND vatCents = 0:
        errors.push("Missing VAT on standard-rated invoice")
      If total != subtotal + VAT (with 1 cent tolerance):
        errors.push("VAT calculation mismatch")

    Return { isValid: errors.length === 0, errors, warnings }

  getFlaggedItems(transactions, invoices):
    flagged = []

    For each transaction:
      validationResult = validateVATDetails(transaction)
      If validationResult has errors:
        flagged.push({
          transactionId: transaction.id,
          description: transaction.description,
          issue: errors.join('; '),
          amount: new Decimal(transaction.amountCents).div(100),
          severity: 'ERROR'
        })
      If validationResult has warnings:
        flagged.push({ ... severity: 'WARNING' })

    For each invoice:
      validationResult = validateVATDetails(invoice)
      If issues found:
        flagged.push similar structure

    Return flagged

  private calculateVAT(amount: Decimal, vatType: VATType):
    If vatType === STANDARD:
      Return amount.mul(VAT_RATE) // 15% of amount
    Else:
      Return new Decimal(0)

  private extractVATFromInclusive(amountIncVAT: Decimal):
    // VAT-inclusive amount to VAT amount
    // VAT = amountIncVAT - (amountIncVAT / 1.15)
    // Simplified: amountIncVAT * (0.15 / 1.15)
    divisor = new Decimal(1).plus(VAT_RATE) // 1.15
    exclusive = amountIncVAT.div(divisor)
    vat = amountIncVAT.minus(exclusive)
    Return vat

Constants:
  ZERO_RATED_ACCOUNTS = ['1200', '4100'] // Exports, basic food
  EXEMPT_ACCOUNTS = ['8100', '8200', '4200'] // Bank charges, interest, rent
  VAT_NUMBER_REGEX = /^\d{10}$/
</pseudo_code>

<files_to_create>
  <file path="src/core/sars/vat.service.ts">VATService class with all methods</file>
  <file path="src/core/sars/interfaces/vat.interface.ts">VAT interfaces and enums</file>
  <file path="src/core/sars/constants/vat.constants.ts">VAT rate and account mappings</file>
  <file path="tests/core/sars/vat.service.spec.ts">Comprehensive unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/sars/index.ts">Export VATService and interfaces</file>
</files_to_modify>

<validation_criteria>
  <criterion>VATService compiles without TypeScript errors</criterion>
  <criterion>All methods use Decimal.js for monetary calculations</criterion>
  <criterion>Banker's rounding applied correctly (ROUND_HALF_EVEN)</criterion>
  <criterion>15% VAT rate used consistently</criterion>
  <criterion>Zero-rated and exempt properly distinguished</criterion>
  <criterion>Output VAT calculation accurate for invoice period</criterion>
  <criterion>Input VAT calculation accurate for expense period</criterion>
  <criterion>VAT extraction from inclusive amounts is precise</criterion>
  <criterion>Missing VAT details correctly flagged</criterion>
  <criterion>Unit tests cover edge cases (zero amounts, null values, boundary dates)</criterion>
  <criterion>No 'any' types used</criterion>
  <criterion>All public methods documented with JSDoc</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "VATService"</command>
  <command>npm run lint -- src/core/sars/vat.service.ts</command>
</test_commands>

</task_spec>
