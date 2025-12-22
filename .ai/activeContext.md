# Active Context

## Current Session: 2025-12-22

### Completed This Session
- TASK-BILL-031: Invoice Controller and DTOs (10 tests)
  - GET /api/v1/invoices with pagination and filtering
  - ListInvoicesQueryDto, InvoiceResponseDto, ParentSummaryDto, ChildSummaryDto
  - @CurrentUser() for tenant isolation
  - Cents → Rands conversion, dates as YYYY-MM-DD strings
  - 10 unit tests covering all filters and tenant isolation

- TASK-BILL-032: Invoice Generation Endpoint (8 tests)
  - POST /api/v1/invoices/generate for batch invoice generation
  - GenerateInvoicesDto with YYYY-MM format validation
  - Future month rejection with BadRequestException
  - @Roles(OWNER, ADMIN) restriction
  - InvoiceGenerationService integration
  - 8 unit tests covering generation, role guards, and error scenarios

### Key Decisions Made
1. Used `@Roles(UserRole.OWNER, UserRole.ADMIN)` for role-based access control
2. Used cents → decimal conversion (divide by 100) for API responses
3. Used YYYY-MM format for billing_month with regex validation
4. Used snake_case for API response fields per REST conventions
5. BillingModule includes all InvoiceGenerationService dependencies

### Previously Completed (2025-12-22)
- TASK-TRANS-031: Transaction Controller and DTOs (9 tests)
- TASK-TRANS-032: Transaction Import Endpoint (7 tests)
- TASK-TRANS-033: Categorization Endpoint (8 tests)

### Previously Completed (2025-12-21)
- TASK-API-001: Authentication Controller and Guards (65 tests)
- TASK-AGENT-001 to TASK-AGENT-005: Claude Code Agents (56 tests)
- TASK-TRANS-015: LLMWhisperer PDF Extraction (62 tests)
- TASK-RECON-011/012/013: Reconciliation Services (45 tests)

### Next Steps
1. TASK-BILL-033: Invoice Delivery Endpoint (POST /invoices/send)
2. TASK-BILL-034: Enrollment Controller
3. Continue Surface Layer implementation
