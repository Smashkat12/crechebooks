<task_spec id="TASK-INT-002" version="3.0">

<metadata>
  <title>E2E Billing Cycle Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>59</sequence>
  <implements>
    <requirement_ref>REQ-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Complete E2E integration test for the monthly billing cycle workflow. Tests child enrollment,
invoice generation with pro-rata calculations, sibling discounts, VAT at 15%, ad-hoc charges,
multi-channel delivery (email/WhatsApp), and payment receipt. Uses real database and services,
mocks only external delivery services (email, WhatsApp, Xero).
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use real services with actual database</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API uses snake_case (e.g., parent_id, billing_month, invoice_ids)</rule>
  <rule>Internal services use camelCase (e.g., parentId, billingMonth, invoiceIds)</rule>
  <rule>API amounts in decimal Rands, internal amounts in cents</rule>
  <rule>Use Decimal.js for all financial calculations - no floating point arithmetic</rule>
  <rule>Sibling discount: 10% second child, 15% third child onward</rule>
  <rule>VAT rate: 15% exactly</rule>
</critical_rules>

<project_context>
  <test_count>1536 tests currently passing</test_count>
  <surface_layer_status>100% complete (all 16 Surface Layer tasks done)</surface_layer_status>
  <currency>ZAR (South African Rand)</currency>
  <vat_rate>15%</vat_rate>
  <sibling_discount_2nd>10%</sibling_discount_2nd>
  <sibling_discount_3rd_plus>15%</sibling_discount_3rd_plus>
</project_context>

<existing_infrastructure>
  <file path="src/api/billing/child.controller.ts" purpose="Child enrollment endpoints">
    Key endpoints:
    - POST /children - Register child with initial enrollment
    - GET /children - List children with pagination
    - GET /children/:id - Get child details
    - PUT /children/:id - Update child details

    Request body: { parent_id, first_name, last_name, date_of_birth, fee_structure_id, start_date, ... }
    Response: { success: true, data: { child: {...}, enrollment: {...} } }
  </file>

  <file path="src/api/billing/invoice.controller.ts" purpose="Invoice endpoints">
    Key endpoints:
    - GET /invoices - List invoices with filters
    - POST /invoices/generate - Generate monthly invoices
    - POST /invoices/send - Send invoices via email/WhatsApp

    POST /invoices/generate body:
    { billing_month: "YYYY-MM", child_ids?: string[], include_adhoc?: boolean }

    POST /invoices/send body:
    { invoice_ids: string[], delivery_method: "EMAIL" | "WHATSAPP" }
  </file>

  <file path="src/api/billing/dto/index.ts" purpose="Billing DTOs">
    Exports:
    - EnrollChildDto, EnrollChildResponseDto
    - ListChildrenQueryDto, ChildListResponseDto, ChildDetailResponseDto
    - ListInvoicesQueryDto, InvoiceListResponseDto, InvoiceResponseDto
    - GenerateInvoicesDto (billing_month, child_ids?, include_adhoc?)
    - GenerateInvoicesResponseDto (invoices_created, total_amount, invoices[], errors[])
    - ApiSendInvoicesDto (invoice_ids, delivery_method)
    - SendInvoicesResponseDto (sent, failed, failures[])
  </file>

  <file path="src/database/services/invoice-generation.service.ts" purpose="Invoice generation">
    InvoiceGenerationService.generateMonthlyInvoices(tenantId, billingMonth, userId, childIds?)
    Returns: { invoicesCreated, totalAmountCents, invoices[], errors[] }

    Handles:
    - Fee structure lookup
    - Pro-rata calculation for mid-month enrollments
    - Sibling discount application
    - VAT calculation at 15%
    - Ad-hoc charge inclusion
  </file>

  <file path="src/database/services/pro-rata.service.ts" purpose="Pro-rata calculation">
    ProRataService.calculateProRata(monthlyAmountCents, startDate, endDate, billingMonth)
    Uses calendar days in month for exact pro-rata calculation.
  </file>

  <file path="src/database/services/invoice-delivery.service.ts" purpose="Invoice delivery">
    InvoiceDeliveryService.sendInvoices({ tenantId, invoiceIds, method })
    Returns: { sent, failed, failures[] }

    Handles:
    - Email delivery with PDF attachment
    - WhatsApp delivery with payment link
    - Partial success/failure tracking
    - Delivery status updates
  </file>

  <file path="src/database/services/enrollment.service.ts" purpose="Enrollment management">
    EnrollmentService.enrollChild(tenantId, childId, feeStructureId, startDate, userId)
    EnrollmentService.updateEnrollment(enrollmentId, updates, userId)
    EnrollmentService.endEnrollment(enrollmentId, endDate, userId)
  </file>

  <file path="src/database/entities/invoice.entity.ts" purpose="Invoice entity">
    InvoiceStatus: DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED
    DeliveryStatus: PENDING, SENT, DELIVERED, FAILED
    Fields: tenantId, parentId, childId, invoiceNumber, billingPeriodStart/End,
            subtotalCents, vatCents, totalCents, amountPaidCents, status, deliveryStatus
  </file>

  <file path="src/database/entities/enrollment.entity.ts" purpose="Enrollment entity">
    EnrollmentStatus: ACTIVE, SUSPENDED, WITHDRAWN
    Fields: tenantId, childId, feeStructureId, startDate, endDate, status, siblingOrder
  </file>

  <file path="src/database/entities/fee-structure.entity.ts" purpose="Fee structure entity">
    BillingFrequency: MONTHLY, WEEKLY, DAILY
    Fields: tenantId, name, amountCents, billingFrequency, includesVat
  </file>

  <file path="tests/api/billing/invoice.controller.spec.ts" purpose="Controller tests">
    Pattern for testing: Use Test.createTestingModule with providers.
    Use jest.spyOn() for service method verification.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="tests/e2e/billing-cycle.e2e.spec.ts">
    Complete E2E test suite:

    ```typescript
    import { Test, TestingModule } from '@nestjs/testing';
    import { INestApplication, ValidationPipe } from '@nestjs/common';
    import * as request from 'supertest';
    import { AppModule } from '../../src/app.module';
    import { PrismaService } from '../../src/database/prisma/prisma.service';
    import Decimal from 'decimal.js';

    describe('E2E: Billing Cycle Flow', () => {
      let app: INestApplication;
      let prisma: PrismaService;
      let authToken: string;
      let testTenantId: string;

      beforeAll(async () => {
        // Setup app and test data
      });

      afterAll(async () => {
        // Cleanup in correct order (payments, invoices, enrollments, children, parents, tenant)
      });

      describe('Child Enrollment', () => {
        it('enrolls children with different fee structures', async () => {
          // POST /children with first_name, last_name, parent_id, fee_structure_id, start_date
        });
      });

      describe('Invoice Generation', () => {
        it('generates monthly invoices with correct amounts', async () => {
          // POST /invoices/generate with billing_month: "2025-01"
          // Verify response has invoices_created count
        });

        it('calculates pro-rata for mid-month enrollment', async () => {
          // Child starting Jan 15 in 31-day month = 17/31 of monthly fee
        });

        it('applies sibling discount correctly', async () => {
          // 2nd child: 10% off, 3rd+: 15% off
        });

        it('calculates VAT at 15%', async () => {
          // Verify vatCents = subtotalCents * 0.15 (rounded using banker's rounding)
        });

        it('includes ad-hoc charges in invoice', async () => {
          // Create ad-hoc charge, then generate invoice with include_adhoc: true
        });
      });

      describe('Invoice Delivery', () => {
        it('delivers invoices via email with PDF', async () => {
          // POST /invoices/send with delivery_method: "EMAIL"
        });

        it('delivers invoices via WhatsApp', async () => {
          // POST /invoices/send with delivery_method: "WHATSAPP"
        });

        it('handles failed deliveries gracefully', async () => {
          // Invalid email returns failures array, doesn't block other deliveries
        });
      });

      describe('Payment and Status', () => {
        it('updates invoice status on payment receipt', async () => {
          // Full payment -> PAID
          // Partial payment -> PARTIALLY_PAID
        });
      });
    });
    ```
  </file>

  <file path="tests/helpers/email-mock.ts">
    Email MCP mock server for testing delivery.
  </file>

  <file path="tests/helpers/whatsapp-mock.ts">
    WhatsApp MCP mock server for testing delivery.
  </file>

  <file path="tests/helpers/billing-calculators.ts">
    Helper functions for expected value calculation:
    - calculateProRata(monthlyAmount, startDay, daysInMonth)
    - calculateSiblingDiscount(baseAmount, siblingOrder)
    - calculateVat(subtotal, vatRate)
    - calculateTotal(subtotal, vat)
  </file>

  <file path="tests/fixtures/billing/test-scenarios.json">
    Predefined billing scenarios with expected values.
  </file>
</files_to_create>

<test_requirements>
  <requirement>Use real database with actual Prisma operations</requirement>
  <requirement>Use real calculation services (InvoiceGenerationService, ProRataService)</requirement>
  <requirement>Mock only external services (email, WhatsApp, Xero)</requirement>
  <requirement>Pro-rata calculations must be exact to the day</requirement>
  <requirement>Sibling discounts: 10% for 2nd child, 15% for 3rd+ child</requirement>
  <requirement>VAT calculations must be exact to 2 decimal places</requirement>
  <requirement>Email delivery must include valid PDF attachment</requirement>
  <requirement>WhatsApp delivery must include payment link</requirement>
  <requirement>Failed deliveries must not block successful ones</requirement>
  <requirement>Invoice status transitions must be atomic and correct</requirement>
  <requirement>No rounding errors - use Decimal.js for all calculations</requirement>
</test_requirements>

<endpoint_reference>
  | Method | Path | DTO In | DTO Out | Description |
  |--------|------|--------|---------|-------------|
  | POST | /children | EnrollChildDto | EnrollChildResponseDto | Enroll child |
  | GET | /children | ListChildrenQueryDto | ChildListResponseDto | List children |
  | GET | /children/:id | - | ChildDetailResponseDto | Get child |
  | PUT | /children/:id | ApiUpdateChildDto | ChildDetailResponseDto | Update child |
  | GET | /invoices | ListInvoicesQueryDto | InvoiceListResponseDto | List invoices |
  | POST | /invoices/generate | GenerateInvoicesDto | GenerateInvoicesResponseDto | Generate invoices |
  | POST | /invoices/send | ApiSendInvoicesDto | SendInvoicesResponseDto | Send invoices |
</endpoint_reference>

<calculation_examples>
  <example name="Pro-rata Calculation">
    Child enrolled Jan 15, 2025 (31-day month):
    Days enrolled: 17 (Jan 15-31)
    Monthly fee: R3,000
    Pro-rata fee: R3,000 × (17/31) = R1,645.16
  </example>

  <example name="Sibling Discount">
    Family with 3 children:
    - Child 1: Full fee = R3,000
    - Child 2: R3,000 - 10% = R2,700
    - Child 3: R3,000 - 15% = R2,550
    Total before VAT: R8,250
  </example>

  <example name="VAT Calculation">
    Subtotal: R3,250.00
    VAT (15%): R487.50
    Total: R3,737.50
  </example>
</calculation_examples>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test:e2e -- billing-cycle.e2e.spec.ts - all tests pass</step>
  <step>Verify pro-rata calculations are exact</step>
  <step>Verify sibling discounts applied correctly</step>
  <step>Verify VAT is exactly 15%</step>
  <step>Verify email mock receives PDF attachment</step>
  <step>Verify WhatsApp mock receives payment link</step>
</verification_steps>

<test_commands>
  <command>npm run test:e2e -- billing-cycle.e2e.spec.ts</command>
  <command>npm run test:e2e -- billing-cycle.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>
