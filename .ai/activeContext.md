# Active Context

## Current Session: 2025-12-22

### Completed This Session
- TASK-SARS-031: SARS Controller and DTOs (8 tests)
  - POST /sars/:id/submit for marking submissions as filed
  - ApiMarkSubmittedDto with snake_case sars_reference field
  - SarsSubmissionResponseDto with snake_case fields
  - snake_case API → camelCase service transformation
  - Error propagation (NotFoundException, BusinessException)
  - @Roles(OWNER, ADMIN) access control

- TASK-SARS-032: VAT201 Endpoint (11 tests)
  - POST /sars/vat201 for VAT201 return generation
  - ApiGenerateVat201Dto with period_start, period_end
  - Period validation (end > start)
  - Cents → Rands conversion for output_vat, input_vat, net_vat
  - Flagged items extraction from documentData
  - @Roles(OWNER, ADMIN, ACCOUNTANT) access control

- TASK-SARS-033: EMP201 Endpoint (12 tests)
  - POST /sars/emp201 for EMP201 employer reconciliation
  - ApiGenerateEmp201Dto with period_month (YYYY-MM)
  - Summary and employees extraction from documentData
  - Cents → Rands conversion for PAYE, UIF, SDL totals
  - Validation issues extraction
  - @Roles(OWNER, ADMIN, ACCOUNTANT) access control

- TASK-PAY-032: Payment Matching Endpoint (10 tests)
  - POST /payments/match for AI-powered payment matching
  - ApiMatchPaymentsDto with snake_case transaction_ids field
  - ApiMatchingResultResponseDto with auto_matched, review_required arrays
  - snake_case API → camelCase service transformation
  - Cents → Rands decimal conversion for API responses
  - Confidence level mapping (EXACT, HIGH, MEDIUM, LOW)
  - 10 unit tests covering matching, review-required, no-match, auth

- TASK-PAY-033: Arrears Dashboard Endpoint (11 tests)
  - GET /payments/arrears for aging analysis dashboard
  - ApiArrearsQueryDto with min_amount, max_days, debtor_limit filters
  - ApiArrearsReportResponseDto with aging buckets and debtor list
  - Aging buckets: current, 30, 60, 90, 120+ days
  - Date formatting for oldest_invoice_date
  - debtor_limit query param controls response size
  - 11 unit tests covering filters, limits, role access

- TASK-PAY-031: Payment Controller and DTOs (15 tests)
  - POST /payments for manual payment allocation to invoices
  - GET /payments with pagination and filtering
  - ApiAllocatePaymentDto, ApiAllocationDto for request body
  - PaymentDto, PaymentListItemDto, PaymentListResponseDto for responses
  - ListPaymentsQueryDto with filters: invoice_id, transaction_id, match_type, matched_by, is_reversed
  - @Roles(OWNER, ADMIN) for POST, extended roles for GET
  - PaymentAllocationService.allocatePayment() integration
  - snake_case API → camelCase service transformation
  - Cents → Rands decimal conversion for API responses
  - Prisma enum to entity enum compatibility handling
  - 15 unit tests covering allocation, listing, pagination, filters, auth

- TASK-BILL-033: Invoice Delivery Endpoint (11 tests)
  - POST /invoices/send for email/WhatsApp invoice delivery

- TASK-BILL-034: Enrollment Controller (18 tests)
  - POST /children for child enrollment

### Key Decisions Made
1. Used `@Roles(UserRole.OWNER, UserRole.ADMIN)` for payment allocation (write operation)
2. Extended roles (VIEWER, ACCOUNTANT) for payment listing (read operation)
3. Used `import type { IUser }` for decorator compatibility with isolatedModules
4. Used Prisma enum imports directly (`@prisma/client`) instead of entity enums
5. Added eslint-disable comments for necessary `any` casts for Prisma/entity enum compatibility
6. Used Math.round(amount * 100) for decimal → cents conversion
7. Used amountCents / 100 for cents → decimal conversion
8. PaymentModule imports PaymentRepository, InvoiceRepository, PaymentAllocationService

### Previously Completed (2025-12-22)
- TASK-BILL-031: Invoice Controller and DTOs (10 tests)
- TASK-BILL-032: Invoice Generation Endpoint (8 tests)
- TASK-TRANS-031: Transaction Controller and DTOs (9 tests)
- TASK-TRANS-032: Transaction Import Endpoint (7 tests)
- TASK-TRANS-033: Categorization Endpoint (8 tests)

### Previously Completed (2025-12-21)
- TASK-API-001: Authentication Controller and Guards (65 tests)
- TASK-AGENT-001 to TASK-AGENT-005: Claude Code Agents (56 tests)
- TASK-TRANS-015: LLMWhisperer PDF Extraction (62 tests)
- TASK-RECON-011/012/013: Reconciliation Services (45 tests)

### Next Steps
1. TASK-RECON-031: Reconciliation Controller
2. TASK-RECON-032: Financial Reports Endpoint
3. TASK-INT-001 to TASK-INT-005: E2E Integration Tests
