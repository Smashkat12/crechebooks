<task_spec id="TASK-SARS-014" version="1.0">

<metadata>
  <title>VAT201 Generation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>31</sequence>
  <implements>
    <requirement_ref>REQ-SARS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-011</task_ref>
    <task_ref>TASK-SARS-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the VAT201Service which generates the South African VAT201 return
document. The service uses the VATService to calculate output and input VAT for a
period, populates the VAT201 form fields according to SARS specifications, validates
the submission data, calculates net VAT due/refundable, and generates the submission
record with document structure. The service handles all 15 fields of the VAT201 form
with Decimal.js precision.
</context>

<input_context_files>
  <file purpose="technical_spec">specs/technical/api-contracts.md#SarsService</file>
  <file purpose="vat_requirements">specs/requirements/sars-requirements.md</file>
  <file purpose="vat_service">src/core/sars/vat.service.ts</file>
  <file purpose="sars_submission_entity">src/database/entities/sars-submission.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-011 completed (VATService exists)</check>
  <check>TASK-SARS-002 completed (SarsSubmission entity exists)</check>
  <check>Decimal.js library installed</check>
  <check>TypeScript compilation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Create VAT201Service class in src/core/sars/
    - Implement generateVAT201 method (main generation logic)
    - Implement populateFields method (populate all 15 VAT201 fields)
    - Implement validateSubmission method (pre-submission validation)
    - Implement generateDocument method (create document structure)
    - Implement calculateNetVAT method (field 19: output - input)
    - Use VATService for output and input VAT calculations
    - Create VAT201Document interface matching SARS format
    - Create VAT201Fields interface for all 15 fields
    - Handle negative net VAT (refund due)
    - Store submission as DRAFT with SarsSubmissionRepository
    - Use Decimal.js banker's rounding
    - Unit tests with realistic scenarios
  </in_scope>
  <out_of_scope>
    - API endpoints
    - PDF rendering of VAT201
    - eFiling integration
    - Historical period submissions
    - Import/export VAT calculations
    - Bad debt adjustments
    - VAT201 amendment logic
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/sars/vat201.service.ts">
      import Decimal from 'decimal.js';
      import { VATService } from './vat.service';

      interface VAT201Fields {
        field1: Decimal;   // Output tax on standard-rated supplies
        field2: Decimal;   // Output tax on zero-rated supplies
        field3: Decimal;   // Output tax on exempt supplies
        field4: Decimal;   // Total output tax (1+2+3)
        field5: Decimal;   // Input tax
        field6: Decimal;   // Total deductible input tax
        field7: Decimal;   // Adjustments
        field8: Decimal;   // Imported services
        field9: Decimal;   // Bad debts recovered
        field10: Decimal;  // Reverse adjustments
        field11: Decimal;  // Credit transfer
        field12: Decimal;  // Vendor number
        field13: Decimal;  // Provisional payments
        field14: Decimal;  // Total (sum of applicable fields)
        field15: Decimal;  // Net VAT (refund if negative)
        field16: Decimal;  // Payments made
        field17: Decimal;  // Interest
        field18: Decimal;  // Penalty
        field19: Decimal;  // Total amount due/refundable
      }

      interface VAT201Document {
        submissionId: string;
        tenantId: string;
        vatNumber: string;
        periodStart: Date;
        periodEnd: Date;
        fields: VAT201Fields;
        netVAT: Decimal;
        isDueToSARS: boolean;
        isRefundDue: boolean;
        flaggedItems: VATFlaggedItem[];
        generatedAt: Date;
      }

      @Injectable()
      export class VAT201Service {
        constructor(
          private vatService: VATService,
          private sarsSubmissionRepository: SarsSubmissionRepository
        ) {}

        async generateVAT201(
          tenantId: string,
          periodStart: Date,
          periodEnd: Date
        ): Promise&lt;SarsSubmission&gt;;

        populateFields(
          outputVAT: VATCalculationResult,
          inputVAT: VATCalculationResult
        ): VAT201Fields;

        validateSubmission(
          document: VAT201Document
        ): ValidationResult;

        generateDocument(
          tenantId: string,
          vatNumber: string,
          periodStart: Date,
          periodEnd: Date,
          fields: VAT201Fields,
          flaggedItems: VATFlaggedItem[]
        ): VAT201Document;

        calculateNetVAT(fields: VAT201Fields): Decimal;
      }
    </signature>
    <signature file="src/core/sars/interfaces/vat201.interface.ts">
      export interface VAT201Fields {
        field1: Decimal;
        field2: Decimal;
        field3: Decimal;
        field4: Decimal;
        field5: Decimal;
        field6: Decimal;
        field7: Decimal;
        field8: Decimal;
        field9: Decimal;
        field10: Decimal;
        field11: Decimal;
        field12: Decimal;
        field13: Decimal;
        field14: Decimal;
        field15: Decimal;
        field16: Decimal;
        field17: Decimal;
        field18: Decimal;
        field19: Decimal;
      }

      export interface VAT201Document {
        submissionId: string;
        tenantId: string;
        vatNumber: string;
        periodStart: Date;
        periodEnd: Date;
        fields: VAT201Fields;
        netVAT: Decimal;
        isDueToSARS: boolean;
        isRefundDue: boolean;
        flaggedItems: VATFlaggedItem[];
        generatedAt: Date;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - Must populate all 15 standard VAT201 fields
    - Field 1 = Output VAT on standard-rated supplies
    - Field 4 = Total output tax
    - Field 5 = Input tax (deductible)
    - Field 19 = Net VAT (positive = due, negative = refund)
    - Must NOT use 'any' type anywhere
    - Must validate VAT number format (10 digits)
    - Must check period is complete month(s)
    - Zero-rated supplies in field 2 (0 VAT amount)
    - Exempt supplies in field 3 (0 VAT amount)
    - Must flag items requiring review before submission
    - Document must be stored as JSON in sars_submissions table
    - Status must be DRAFT initially
    - Must include flagged items in document
    - Net VAT calculation: field 4 - field 5 (simplified for initial version)
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Unit tests pass with 100% coverage
    - Output VAT R10,000, Input VAT R3,000: Net VAT = R7,000 (due to SARS)
    - Output VAT R5,000, Input VAT R8,000: Net VAT = -R3,000 (refund)
    - All 15 fields populated with Decimal values
    - Banker's rounding applied to all fields
    - Zero-rated supplies counted separately
    - Flagged items included in document
    - Submission stored with DRAFT status
    - VAT number validation catches invalid formats
    - Period validation ensures complete months
    - isDueToSARS flag set correctly (netVAT > 0)
    - isRefundDue flag set correctly (netVAT < 0)
  </verification>
</definition_of_done>

<pseudo_code>
VAT201Service Implementation (src/core/sars/vat201.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN
    })

  generateVAT201(tenantId, periodStart, periodEnd):
    // Step 1: Get tenant details and validate
    tenant = await tenantRepository.findById(tenantId)
    If !tenant.isVATRegistered OR !tenant.vatNumber:
      Throw error "Tenant not VAT registered"

    // Step 2: Get transactions and invoices for period
    invoices = await invoiceRepository.findByPeriod(tenantId, periodStart, periodEnd)
    transactions = await transactionRepository.findByPeriod(tenantId, periodStart, periodEnd)

    // Step 3: Calculate output VAT (sales)
    outputVAT = await vatService.calculateOutputVAT(invoices, periodStart, periodEnd)

    // Step 4: Calculate input VAT (purchases)
    inputVAT = await vatService.calculateInputVAT(transactions, periodStart, periodEnd)

    // Step 5: Get flagged items requiring review
    flaggedItems = vatService.getFlaggedItems(transactions, invoices)

    // Step 6: Populate VAT201 fields
    fields = populateFields(outputVAT, inputVAT)

    // Step 7: Generate document structure
    document = generateDocument(
      tenantId,
      tenant.vatNumber,
      periodStart,
      periodEnd,
      fields,
      flaggedItems
    )

    // Step 8: Validate document
    validationResult = validateSubmission(document)
    If !validationResult.isValid:
      Log warnings

    // Step 9: Store submission as DRAFT
    submission = await sarsSubmissionRepository.create({
      tenantId,
      submissionType: 'VAT201',
      period: format(periodStart, 'yyyy-MM'),
      status: 'DRAFT',
      documentData: JSON.stringify(document),
      flaggedItemsCount: flaggedItems.length
    })

    Return submission

  populateFields(outputVAT, inputVAT):
    fields = {
      field1: outputVAT.standardRated,        // Standard-rated output VAT
      field2: new Decimal(0),                 // Zero-rated output (0 VAT)
      field3: new Decimal(0),                 // Exempt output (0 VAT)
      field4: outputVAT.vatAmount,            // Total output tax
      field5: inputVAT.vatAmount,             // Input tax
      field6: inputVAT.vatAmount,             // Total deductible input
      field7: new Decimal(0),                 // Adjustments (future)
      field8: new Decimal(0),                 // Imported services (future)
      field9: new Decimal(0),                 // Bad debts (future)
      field10: new Decimal(0),                // Reverse adjustments (future)
      field11: new Decimal(0),                // Credit transfer (future)
      field12: new Decimal(0),                // Vendor number (N/A)
      field13: new Decimal(0),                // Provisional payments
      field14: outputVAT.vatAmount,           // Total
      field15: calculateNetVAT(fields),       // Net VAT
      field16: new Decimal(0),                // Payments made
      field17: new Decimal(0),                // Interest
      field18: new Decimal(0),                // Penalty
      field19: new Decimal(0)                 // Total due/refundable
    }

    // Calculate field 19 (net amount)
    fields.field19 = calculateNetVAT(fields)

    Return fields

  validateSubmission(document):
    errors = []
    warnings = []

    // Validate VAT number format
    If !document.vatNumber.match(/^\d{10}$/):
      errors.push("Invalid VAT number format (must be 10 digits)")

    // Validate period dates
    If document.periodStart >= document.periodEnd:
      errors.push("Invalid period: start date must be before end date")

    // Check for flagged items
    If document.flaggedItems.length > 0:
      warnings.push(`${document.flaggedItems.length} items require review`)

    // Validate net VAT is reasonable
    If document.netVAT.abs() > new Decimal(1000000):
      warnings.push("Net VAT amount is unusually large")

    Return {
      isValid: errors.length === 0,
      errors,
      warnings
    }

  generateDocument(tenantId, vatNumber, periodStart, periodEnd, fields, flaggedItems):
    netVAT = calculateNetVAT(fields)

    Return VAT201Document:
      submissionId: uuid()
      tenantId
      vatNumber
      periodStart
      periodEnd
      fields
      netVAT
      isDueToSARS: netVAT > 0
      isRefundDue: netVAT < 0
      flaggedItems
      generatedAt: new Date()

  calculateNetVAT(fields: VAT201Fields): Decimal:
    // Simplified: Output VAT - Input VAT
    // Field 4 (total output) - Field 5 (input tax)
    netVAT = fields.field4.minus(fields.field5)

    // Add adjustments when implemented
    // netVAT = netVAT.plus(fields.field7)

    Return netVAT

Unit Tests (tests/core/sars/vat201.service.spec.ts):
  Test case: Standard VAT201 generation
    Input:
      - Period: Jan 2025
      - Output VAT: R15,000
      - Input VAT: R5,500
    Expected:
      - field1: R15,000
      - field4: R15,000
      - field5: R5,500
      - field19: R9,500 (due to SARS)
      - isDueToSARS: true
      - status: DRAFT

  Test case: Refund scenario
    Input:
      - Output VAT: R3,000
      - Input VAT: R8,000
    Expected:
      - field19: -R5,000 (refund)
      - isRefundDue: true
      - isDueToSARS: false

  Test case: Flagged items included
    Input:
      - 3 transactions missing VAT numbers
    Expected:
      - flaggedItems.length: 3
      - flaggedItemsCount: 3 in submission

  Test case: Invalid VAT number
    Input: vatNumber = "12345" (too short)
    Expected: ValidationError thrown

  Test case: Invalid period
    Input: periodStart > periodEnd
    Expected: ValidationError thrown
</pseudo_code>

<files_to_create>
  <file path="src/core/sars/vat201.service.ts">VAT201Service class</file>
  <file path="src/core/sars/interfaces/vat201.interface.ts">VAT201 interfaces</file>
  <file path="tests/core/sars/vat201.service.spec.ts">Comprehensive unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/sars/index.ts">Export VAT201Service and interfaces</file>
</files_to_modify>

<validation_criteria>
  <criterion>VAT201Service compiles without TypeScript errors</criterion>
  <criterion>All 15 VAT201 fields populated correctly</criterion>
  <criterion>Decimal.js used for all monetary calculations</criterion>
  <criterion>Banker's rounding applied throughout</criterion>
  <criterion>Net VAT calculation accurate (output - input)</criterion>
  <criterion>isDueToSARS flag set when net VAT positive</criterion>
  <criterion>isRefundDue flag set when net VAT negative</criterion>
  <criterion>Flagged items included in document</criterion>
  <criterion>Submission stored with DRAFT status</criterion>
  <criterion>VAT number validation works</criterion>
  <criterion>Period validation works</criterion>
  <criterion>Document structure matches SARS format</criterion>
  <criterion>Unit tests cover due and refund scenarios</criterion>
  <criterion>No 'any' types used</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "VAT201Service"</command>
  <command>npm run lint -- src/core/sars/vat201.service.ts</command>
</test_commands>

</task_spec>
