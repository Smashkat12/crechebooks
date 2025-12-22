<task_spec id="TASK-INT-003" version="3.0">

<metadata>
  <title>E2E Payment Matching Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>60</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-PAY-032</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Complete E2E integration test for the payment matching workflow. Tests the full cycle from
bank transaction import, through AI-powered invoice matching (80%+ confidence auto-apply),
manual review queue, payment allocation (including split payments), arrears calculation,
and payment reminder generation. Uses real database and services, validates matching accuracy
and financial integrity.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use real services with actual database</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API uses snake_case (e.g., transaction_id, invoice_id, confidence_score)</rule>
  <rule>Internal services use camelCase (e.g., transactionId, invoiceId, confidenceScore)</rule>
  <rule>API amounts in decimal Rands, internal amounts in cents</rule>
  <rule>Auto-apply threshold: 80% confidence</rule>
  <rule>Allocations must not exceed transaction amount</rule>
  <rule>Payment allocation must update invoice amountPaidCents</rule>
</critical_rules>

<project_context>
  <test_count>1536 tests currently passing</test_count>
  <surface_layer_status>100% complete (all 16 Surface Layer tasks done)</surface_layer_status>
  <matching_threshold>80% confidence for auto-apply</matching_threshold>
  <currency>ZAR (South African Rand)</currency>
</project_context>

<existing_infrastructure>
  <file path="src/api/payment/payment.controller.ts" purpose="Payment API endpoints">
    Key endpoints:
    - POST /payments - Manual payment allocation
    - GET /payments - List payments with filters
    - POST /payments/match - Trigger AI payment matching
    - GET /payments/arrears - Get arrears dashboard report

    POST /payments body:
    { transaction_id: string, allocations: [{ invoice_id, amount }] }

    POST /payments/match body:
    { transaction_ids?: string[] } // If empty, matches all unallocated credits

    Response wraps in { success: true, data: {...} }
  </file>

  <file path="src/api/payment/dto/index.ts" purpose="Payment DTOs">
    Exports:
    - ApiAllocatePaymentDto (transaction_id, allocations: [{invoice_id, amount}])
    - AllocatePaymentResponseDto (payments, unallocated_amount, invoices_updated)
    - ListPaymentsQueryDto (page, limit, invoice_id, transaction_id, match_type, matched_by, is_reversed)
    - PaymentListResponseDto, PaymentListItemDto
    - ApiMatchPaymentsDto (transaction_ids?: string[])
    - ApiMatchingResultResponseDto (summary, auto_matched[], review_required[])
    - ApiArrearsQueryDto (date_from, date_to, parent_id, min_amount, debtor_limit)
    - ApiArrearsReportResponseDto (summary, top_debtors[], invoices[], generated_at)
  </file>

  <file path="src/database/services/payment-matching.service.ts" purpose="AI payment matching">
    PaymentMatchingService.matchPayments({ tenantId, transactionIds? }) -> MatchingResult
    Returns: { processed, autoApplied, reviewRequired, noMatch, results[] }

    Matching algorithm:
    1. Reference number match (exact) = 100% confidence
    2. Parent name + amount match = 90% confidence
    3. Amount + date proximity = 75% confidence (review required)
    4. No match found = 0%
  </file>

  <file path="src/database/services/payment-allocation.service.ts" purpose="Payment allocation">
    PaymentAllocationService.allocatePayment({ tenantId, transactionId, allocations, userId })
    Returns: { payments[], unallocatedAmountCents, invoicesUpdated }

    Validates:
    - Transaction is a credit (positive amount)
    - Transaction not already fully allocated
    - Allocation amounts don't exceed transaction
    - Invoice exists and belongs to tenant
  </file>

  <file path="src/database/services/arrears.service.ts" purpose="Arrears calculation">
    ArrearsService.getArrearsReport(tenantId, filter?) -> ArrearsReport
    Returns: { summary, topDebtors[], invoices[], generatedAt }

    Aging buckets: current (0-30), days_30 (31-60), days_60 (61-90), days_90_plus (90+)
  </file>

  <file path="src/database/services/reminder.service.ts" purpose="Payment reminders">
    ReminderService.generateReminders(tenantId) -> Reminder[]
    ReminderService.sendReminders(reminderIds, method) -> SendResult
  </file>

  <file path="src/database/entities/payment.entity.ts" purpose="Payment entity">
    MatchType: EXACT_REFERENCE, PARENT_AMOUNT, AMOUNT_ONLY, MANUAL
    MatchedBy: AI, USER
    Fields: tenantId, invoiceId, transactionId, amountCents, paymentDate,
            reference, matchType, matchedBy, matchConfidence, isReversed
  </file>

  <file path="src/database/entities/transaction.entity.ts" purpose="Transaction entity">
    TransactionStatus: PENDING, CATEGORIZED, REVIEW_REQUIRED, SYNCED, FAILED
    Fields: tenantId, amountCents, isCredit, status, isReconciled
    Note: Payment matching only applies to credit transactions (isCredit = true)
  </file>

  <file path="tests/api/payment/payment.controller.spec.ts" purpose="Controller tests">
    Pattern for testing: Use Test.createTestingModule with providers.
    Use jest.spyOn() for service method verification.
    Create typed Payment and Invoice objects for test data.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="tests/e2e/payment-matching.e2e.spec.ts">
    Complete E2E test suite:

    ```typescript
    import { Test, TestingModule } from '@nestjs/testing';
    import { INestApplication, ValidationPipe } from '@nestjs/common';
    import * as request from 'supertest';
    import { AppModule } from '../../src/app.module';
    import { PrismaService } from '../../src/database/prisma/prisma.service';

    describe('E2E: Payment Matching Flow', () => {
      let app: INestApplication;
      let prisma: PrismaService;
      let authToken: string;
      let testTenantId: string;

      beforeAll(async () => {
        // Setup app, tenant, user, token
        // Create test invoices (SENT status, various amounts)
        // Create test transactions (credits with various patterns)
      });

      afterAll(async () => {
        // Cleanup in order: payments, transactions, invoices, etc.
      });

      describe('AI Payment Matching', () => {
        it('auto-applies exact reference matches at 100% confidence', async () => {
          // Transaction with reference = invoice number
          // POST /payments/match
          // Expect auto_applied: 1, status: AUTO_APPLIED
        });

        it('auto-applies parent name + amount match at 90% confidence', async () => {
          // Transaction from "SMITH J" for exact invoice amount
          // Expect auto_applied: 1 if >= 80%
        });

        it('flags low confidence matches for review', async () => {
          // Amount match only (no reference, name unclear)
          // Expect review_required: 1 with suggested_matches[]
        });

        it('handles multiple outstanding invoices for same parent', async () => {
          // Parent with 3 invoices, payment covers 1.5 invoices
          // Expect review_required with all 3 as suggested_matches
        });

        it('returns no_match when transaction cannot be matched', async () => {
          // Random credit with no matching invoice
          // Expect no_match: 1
        });
      });

      describe('Manual Payment Allocation', () => {
        it('allocates full payment to single invoice', async () => {
          // POST /payments with transaction_id and one allocation
          // Verify invoice.amountPaidCents updated
          // Verify invoice.status = PAID
        });

        it('allocates partial payment to single invoice', async () => {
          // Payment less than invoice total
          // Verify invoice.status = PARTIALLY_PAID
        });

        it('splits payment across multiple invoices', async () => {
          // One transaction, multiple allocations
          // Verify each invoice.amountPaidCents updated
          // Verify unallocated_amount = 0 (or remaining)
        });

        it('returns unallocated amount when payment exceeds invoice', async () => {
          // Overpayment scenario
          // Verify unallocated_amount > 0
        });

        it('rejects allocation exceeding transaction amount', async () => {
          // Try to allocate more than transaction.amountCents
          // Expect 400 error
        });
      });

      describe('Arrears Reporting', () => {
        it('calculates aging buckets correctly', async () => {
          // GET /payments/arrears
          // Verify summary.aging.current, days_30, days_60, days_90_plus
        });

        it('ranks top debtors by outstanding amount', async () => {
          // Verify top_debtors sorted by total_outstanding desc
        });

        it('filters by parent_id', async () => {
          // GET /payments/arrears?parent_id=xxx
          // Verify only that parent's invoices returned
        });

        it('filters by min_amount', async () => {
          // GET /payments/arrears?min_amount=1000
          // Verify all returned invoices have outstanding >= 1000
        });
      });

      describe('Payment Reminders', () => {
        it('generates reminders for overdue invoices', async () => {
          // Invoices past due date
          // Verify reminders created
        });

        it('sends reminders via email', async () => {
          // Mock email service, verify reminder sent
        });
      });
    });
    ```
  </file>

  <file path="tests/fixtures/payments/matching-scenarios.json">
    Test scenarios:
    - Exact reference match (INV-2025-001)
    - Parent name match (SMITH J → John Smith)
    - Amount only match (R3,450.00)
    - No match scenario
    - Multi-invoice parent
  </file>

  <file path="tests/helpers/payment-fixtures.ts">
    Helper functions:
    - createTestInvoice(parentId, childId, totalCents, status)
    - createTestCreditTransaction(tenantId, amountCents, reference, payeeName)
    - calculateExpectedAging(invoices) -> AgingBuckets
  </file>
</files_to_create>

<test_requirements>
  <requirement>Use real database with actual Prisma operations</requirement>
  <requirement>Use real PaymentMatchingService (not mocked)</requirement>
  <requirement>Use real PaymentAllocationService (not mocked)</requirement>
  <requirement>Auto-apply only when confidence >= 80%</requirement>
  <requirement>Exact reference match must return 100% confidence</requirement>
  <requirement>Parent name + amount match must return 90% confidence</requirement>
  <requirement>All allocations must be audited (created_by, created_at)</requirement>
  <requirement>Invoice status transitions must be correct (SENT -> PARTIALLY_PAID -> PAID)</requirement>
  <requirement>Arrears aging must be based on due_date, not issue_date</requirement>
  <requirement>Overpayment handling must track unallocated amount</requirement>
</test_requirements>

<endpoint_reference>
  | Method | Path | DTO In | DTO Out | Description |
  |--------|------|--------|---------|-------------|
  | POST | /payments | ApiAllocatePaymentDto | AllocatePaymentResponseDto | Manual allocation |
  | GET | /payments | ListPaymentsQueryDto | PaymentListResponseDto | List payments |
  | POST | /payments/match | ApiMatchPaymentsDto | ApiMatchingResultResponseDto | AI matching |
  | GET | /payments/arrears | ApiArrearsQueryDto | ApiArrearsReportResponseDto | Arrears report |
</endpoint_reference>

<matching_examples>
  <example name="Exact Reference Match">
    Transaction: { reference: "INV-2025-0042", amount: 3450.00 }
    Invoice: { invoiceNumber: "INV-2025-0042", total: 3450.00 }
    Result: 100% confidence, AUTO_APPLIED
  </example>

  <example name="Parent Name + Amount Match">
    Transaction: { payeeName: "SMITH J", amount: 3450.00 }
    Parent: { firstName: "John", lastName: "Smith" }
    Invoice: { parentId: parent.id, total: 3450.00 }
    Result: 90% confidence, AUTO_APPLIED (>= 80%)
  </example>

  <example name="Amount Only Match (Review Required)">
    Transaction: { payeeName: "UNKNOWN", amount: 3450.00 }
    Invoice: { total: 3450.00 }
    Result: 75% confidence, REVIEW_REQUIRED (< 80%)
  </example>

  <example name="Split Payment">
    Transaction: { amount: 5000.00 }
    Allocations: [
      { invoiceId: "inv-1", amount: 3450.00 },
      { invoiceId: "inv-2", amount: 1550.00 }
    ]
    Result: Two payments created, unallocated = 0
  </example>
</matching_examples>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test:e2e -- payment-matching.e2e.spec.ts - all tests pass</step>
  <step>Verify exact reference matches return 100% confidence</step>
  <step>Verify auto-apply only for >= 80% confidence</step>
  <step>Verify invoice status updates correctly on payment</step>
  <step>Verify arrears aging buckets calculated correctly</step>
</verification_steps>

<test_commands>
  <command>npm run test:e2e -- payment-matching.e2e.spec.ts</command>
  <command>npm run test:e2e -- payment-matching.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>
