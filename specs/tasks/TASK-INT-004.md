<task_spec id="TASK-INT-004" version="3.0">

<metadata>
  <title>E2E SARS Submission Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>61</sequence>
  <implements>
    <requirement_ref>REQ-SARS-003</requirement_ref>
    <requirement_ref>REQ-SARS-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Complete E2E integration test for the SARS tax submission workflow. Tests VAT201 and EMP201
generation, submission, and immutability. Validates complex tax calculations including PAYE
(current tax tables), UIF (capped at R177.12/month), SDL (1% above R500k threshold), and
VAT at 15%. Uses real database and services - mock only external SARS eFiling.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use real services with actual database</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API uses snake_case (e.g., period_start, period_end, output_vat)</rule>
  <rule>Internal services use camelCase (e.g., periodStart, periodEnd, outputVat)</rule>
  <rule>API amounts in decimal Rands, internal amounts in cents</rule>
  <rule>VAT rate is exactly 15%</rule>
  <rule>UIF capped at R177.12 per month (R17,712 × 1%)</rule>
  <rule>Submitted returns are immutable - no edits allowed</rule>
</critical_rules>

<project_context>
  <test_count>1536 tests currently passing</test_count>
  <surface_layer_status>100% complete (all 16 Surface Layer tasks done)</surface_layer_status>
  <currency>ZAR (South African Rand)</currency>
  <vat_rate>15%</vat_rate>
  <uif_rate>1% employee + 1% employer</uif_rate>
  <uif_monthly_cap>R177.12</uif_monthly_cap>
  <sdl_rate>1% of total payroll</sdl_rate>
  <sdl_threshold>R500,000 annual payroll</sdl_threshold>
</project_context>

<existing_infrastructure>
  <file path="src/api/sars/sars.controller.ts" purpose="SARS API endpoints">
    Key endpoints:
    - POST /sars/vat201 - Generate VAT201 return
    - POST /sars/emp201 - Generate EMP201 return
    - POST /sars/:id/submit - Mark submission as submitted to SARS

    POST /sars/vat201 body:
    { period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD" }

    POST /sars/emp201 body:
    { period_month: "YYYY-MM" }

    Response wraps in { success: true, data: {...} }
  </file>

  <file path="src/api/sars/dto/index.ts" purpose="SARS DTOs">
    Exports:
    - ApiGenerateVat201Dto (period_start, period_end)
    - ApiVat201ResponseDto (output_vat, input_vat, net_vat, items_requiring_review[])
    - ApiGenerateEmp201Dto (period_month)
    - ApiEmp201ResponseDto (total_paye, total_uif, total_sdl, employee_count)
    - ApiSubmitReturnDto (sars_reference, submitted_date)
  </file>

  <file path="src/database/services/vat-calculation.service.ts" purpose="VAT calculation">
    VatCalculationService.calculateVat201(tenantId, periodStart, periodEnd)
    Returns: { outputVatCents, inputVatCents, netVatCents, standardRated[], zeroRated[], exempt[] }
  </file>

  <file path="src/database/services/paye-calculation.service.ts" purpose="PAYE calculation">
    PayeCalculationService.calculatePaye(grossSalaryCents, taxYear)
    Returns: { payeCents, taxBracket, effectiveRate }

    Uses SARS tax tables for 2025.
  </file>

  <file path="src/database/services/uif-calculation.service.ts" purpose="UIF calculation">
    UifCalculationService.calculateUif(grossSalaryCents)
    Returns: { employeeCents, employerCents, cappedAt }

    Caps at R177.12/month per party.
  </file>

  <file path="src/database/services/vat201-generation.service.ts" purpose="VAT201 generation">
    Vat201GenerationService.generate(tenantId, periodStart, periodEnd, userId)
    Returns: SarsSubmission with line items, document path, and review items.
  </file>

  <file path="src/database/services/emp201-generation.service.ts" purpose="EMP201 generation">
    Emp201GenerationService.generate(tenantId, periodMonth, userId)
    Returns: SarsSubmission with payroll summaries, PAYE/UIF/SDL totals.
  </file>

  <file path="src/database/entities/sars-submission.entity.ts" purpose="SARS submission entity">
    SarsSubmissionType: VAT201, EMP201
    SarsSubmissionStatus: DRAFT, READY, SUBMITTED
    Fields: tenantId, submissionType, period, status, outputVatCents, inputVatCents,
            netVatCents, totalPayeCents, totalUifCents, totalSdlCents, isFinalized,
            submittedAt, sarsReference
  </file>

  <file path="src/database/entities/staff.entity.ts" purpose="Staff/Employee entity">
    Fields: tenantId, firstName, lastName, idNumber, taxNumber, grossSalaryCents,
            uifEligible, startDate, terminationDate
  </file>

  <file path="tests/api/sars/sars.controller.spec.ts" purpose="Controller tests">
    Pattern for testing: Use Test.createTestingModule with providers.
    Use jest.spyOn() for service method verification.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="tests/e2e/sars-submission.e2e.spec.ts">
    Complete E2E test suite:

    ```typescript
    import { Test, TestingModule } from '@nestjs/testing';
    import { INestApplication, ValidationPipe } from '@nestjs/common';
    import * as request from 'supertest';
    import { AppModule } from '../../src/app.module';
    import { PrismaService } from '../../src/database/prisma/prisma.service';

    describe('E2E: SARS Submission Flow', () => {
      let app: INestApplication;
      let prisma: PrismaService;
      let authToken: string;
      let testTenantId: string;

      beforeAll(async () => {
        // Setup app, VAT-registered tenant, user, token
        // Seed tax tables for 2025
      });

      afterAll(async () => {
        // Cleanup in order: sars_submissions, payroll, staff, transactions, invoices, tenant
      });

      describe('VAT201 Generation', () => {
        it('calculates output VAT from invoices at 15%', async () => {
          // Create invoices, verify vatCents = subtotalCents × 0.15
        });

        it('calculates input VAT from categorized expenses', async () => {
          // Create expense transactions with VAT categorization
        });

        it('distinguishes standard, zero-rated, and exempt', async () => {
          // Verify line items separated correctly
        });

        it('flags transactions missing VAT details', async () => {
          // Expenses without VAT amount should appear in items_requiring_review
        });

        it('generates VAT201 document (PDF)', async () => {
          // Verify document_path set, can download PDF
        });
      });

      describe('EMP201 Generation', () => {
        it('calculates PAYE using 2025 tax tables', async () => {
          // R15,000/month → verify correct monthly PAYE
        });

        it('calculates UIF at 1% capped at R177.12', async () => {
          // Employee earning R50,000 → UIF = R177.12 (capped)
        });

        it('calculates SDL when payroll exceeds R500k', async () => {
          // Add employees to exceed threshold, verify SDL = 1%
        });

        it('excludes SDL when below threshold', async () => {
          // Small payroll → total_sdl = 0
        });
      });

      describe('Submission and Immutability', () => {
        it('marks submission as finalized after submit', async () => {
          // POST /sars/:id/submit with sars_reference
          // Verify is_finalized = true
        });

        it('prevents editing after submission', async () => {
          // Try to update submitted return → 409 error
        });

        it('prevents re-submission', async () => {
          // POST /sars/:id/submit again → 409 Already submitted
        });
      });
    });
    ```
  </file>

  <file path="tests/fixtures/sars/tax-tables-2025.json">
    Current SARS tax tables:
    - PAYE brackets for 2025 tax year
    - UIF cap: R17,712/month
    - SDL threshold: R500,000/year
  </file>

  <file path="tests/helpers/sars-calculators.ts">
    Helper functions:
    - calculateExpectedPaye(grossAnnual) -> monthlyPaye
    - calculateExpectedUif(grossMonthly) -> { employee, employer }
    - calculateExpectedSdl(totalPayroll) -> sdlAmount
    - calculateExpectedVat(subtotal, vatType) -> vatAmount
  </file>
</files_to_create>

<test_requirements>
  <requirement>Use real database with actual Prisma operations</requirement>
  <requirement>Use real calculation services (not mocked)</requirement>
  <requirement>Mock only external SARS eFiling service</requirement>
  <requirement>VAT calculations exact to 2 decimal places</requirement>
  <requirement>PAYE matches 2025 SARS tax tables</requirement>
  <requirement>UIF capped at R177.12 per party per month</requirement>
  <requirement>SDL = 0 when annual payroll under R500k</requirement>
  <requirement>Submitted returns immutable at database level</requirement>
  <requirement>Audit trail for all submissions</requirement>
</test_requirements>

<endpoint_reference>
  | Method | Path | DTO In | DTO Out | Description |
  |--------|------|--------|---------|-------------|
  | POST | /sars/vat201 | ApiGenerateVat201Dto | ApiVat201ResponseDto | Generate VAT201 |
  | POST | /sars/emp201 | ApiGenerateEmp201Dto | ApiEmp201ResponseDto | Generate EMP201 |
  | POST | /sars/:id/submit | ApiSubmitReturnDto | SarsSubmissionDto | Mark submitted |
</endpoint_reference>

<calculation_examples>
  <example name="PAYE Calculation">
    Employee: R15,000/month = R180,000/year
    Tax bracket 2025: 18% on first R237,100
    PAYE = (180000 × 0.18) / 12 = R2,700/month
  </example>

  <example name="UIF Capping">
    Employee earning R50,000/month:
    Uncapped UIF = R50,000 × 1% = R500
    Capped UIF = R177.12 (max)
    Total: R177.12 employee + R177.12 employer = R354.24
  </example>

  <example name="VAT201 Calculation">
    Invoices issued: R50,000 (excl VAT)
    Output VAT: R50,000 × 15% = R7,500
    Expenses with VAT: R10,000 × 15% = R1,500 input VAT
    Net VAT payable: R7,500 - R1,500 = R6,000
  </example>
</calculation_examples>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test:e2e -- sars-submission.e2e.spec.ts - all tests pass</step>
  <step>Verify PAYE matches manual calculation using tax tables</step>
  <step>Verify UIF capping at R177.12</step>
  <step>Verify submitted returns cannot be edited</step>
</verification_steps>

<test_commands>
  <command>npm run test:e2e -- sars-submission.e2e.spec.ts</command>
  <command>npm run test:e2e -- sars-submission.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>
