# Active Context

## Last Updated
2025-12-20 by AI Agent (TASK-SARS-001 Completed)

## Current Focus
CrecheBooks AI Bookkeeping System - Foundation Layer Implementation

## Project Overview
CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer.

## Active Task
**Phase**: Foundation Layer (Phase 1)
**Completed**: TASK-CORE-001, TASK-CORE-002, TASK-CORE-003, TASK-CORE-004, TASK-TRANS-001, TASK-TRANS-002, TASK-TRANS-003, TASK-BILL-001, TASK-BILL-002, TASK-BILL-003, TASK-PAY-001, TASK-SARS-001
**Next**: TASK-SARS-002 (SARS Submission Entity)

## GitHub Repository
https://github.com/Smashkat12/crechebooks

---

## TASK-SARS-001 Summary (COMPLETED)

### What Was Built
- EmploymentType enum (PERMANENT, CONTRACT, CASUAL)
- PayFrequency enum (MONTHLY, WEEKLY, DAILY, HOURLY)
- PayrollStatus enum (DRAFT, APPROVED, PAID)
- Staff model in Prisma schema (22 columns)
  - South African ID number (13 digits)
  - Tax number for SARS
  - Banking details (bank name, account, branch code)
  - Medical aid members for tax credits
  - Employment type and pay frequency
  - Start/end dates with isActive flag
  - FK to Tenant with composite unique on (tenantId, idNumber)
- Payroll model in Prisma schema (18 columns)
  - Basic salary, overtime, bonus, other earnings
  - PAYE deduction (payeCents)
  - UIF deductions (employee + employer)
  - Medical aid credit
  - Gross and net salary calculations
  - Status workflow (DRAFT → APPROVED → PAID)
  - FK to Staff and Tenant
  - Composite unique on (tenantId, staffId, payPeriodStart)
- Database migration `20251220131900_add_staff_payroll_entities`
- IStaff and IPayroll TypeScript interfaces
- CreateStaffDto, UpdateStaffDto, StaffFilterDto with validation
- CreatePayrollDto, UpdatePayrollDto, PayrollFilterDto with validation
- StaffRepository with 8 methods:
  - create, findById, findByIdNumber
  - findByTenantId (with filters), findActiveByTenantId
  - update, deactivate, delete
- PayrollRepository with 11 methods:
  - create, findById, findByTenantStaffPeriod
  - findByStaffId, findByTenantId, findByPeriod
  - update, approve, markAsPaid, delete
  - calculatePeriodTotals
- 84 new integration tests using REAL database (no mocks)
  - 37 tests for Staff repository
  - 47 tests for Payroll repository
- Updated all 13 existing test files with new cleanup order

### Key Design Decisions
1. **Status Workflow** - Payroll follows DRAFT → APPROVED → PAID transitions
2. **Immutable PAID** - Cannot update or delete PAID payrolls
3. **Cascade Prevention** - Cannot delete staff with payroll records
4. **BusinessException** - Used for status transition errors
5. **Prisma Enum Import** - Use @prisma/client enum for type safety in repository
6. **Date-Only Fields** - Use @db.Date for periods and dates

### Key Lessons Learned
1. **FK Cleanup Order** - CRITICAL: payroll → staff → payment → (rest)
2. **Prisma Enum vs Custom** - Use Prisma's generated enum in repositories, custom in DTOs
3. **Date-Only Comparison** - Set hours to 0,0,0,0 for @db.Date field comparisons
4. **BusinessException Signature** - (message, code, context) for status errors
5. **Log-Then-Throw** - Always log error context before throwing

### Key Files Created
```
src/database/
├── entities/
│   ├── staff.entity.ts         # IStaff, EmploymentType, PayFrequency
│   ├── payroll.entity.ts       # IPayroll, PayrollStatus
│   └── index.ts                # Updated
├── dto/
│   ├── staff.dto.ts            # Create, Update, Filter DTOs
│   ├── payroll.dto.ts          # Create, Update, Filter DTOs
│   └── index.ts                # Updated
├── repositories/
│   ├── staff.repository.ts     # 8 methods
│   ├── payroll.repository.ts   # 11 methods
│   └── index.ts                # Updated

prisma/
├── schema.prisma               # Staff, Payroll models, 3 enums
└── migrations/
    └── 20251220131900_add_staff_payroll_entities/
        └── migration.sql

tests/database/repositories/
├── staff.repository.spec.ts       # 37 tests with real DB
├── payroll.repository.spec.ts     # 47 tests with real DB
└── (13 existing files updated with new cleanup order)
```

### Verification
- Build: PASS
- Lint: PASS (0 errors, 0 warnings)
- Tests: 493 tests (all passing with --runInBand)
  - 84 new tests (staff + payroll)
  - 409 existing tests

---

## TASK-PAY-001 Summary (COMPLETED)

### What Was Built
- MatchType enum (EXACT, FUZZY, REFERENCE, AMOUNT, MANUAL, UNMATCHED)
- MatchedBy enum (SYSTEM, USER)
- Payment model in Prisma schema (17 columns)
  - Links Invoice to Transaction (nullable)
  - Match type and confidence tracking
  - Allocation tracking (amountCents, balanceCents)
  - Notes and timestamps
- Database migration `20251220095923_create_payments`
- IPayment TypeScript interface
- CreatePaymentDto, UpdatePaymentDto, PaymentFilterDto with validation
- PaymentRepository with 11 methods:
  - create, findById, findByTenant (with filters)
  - findByInvoice, findByTransaction, findByParent
  - findUnallocated, update, allocate, delete
  - getPaymentSummaryByParent
- 31 new integration tests using REAL database (no mocks)

### Verification
- Build: PASS
- Lint: PASS (0 errors, 0 warnings)
- Tests: 417 tests (all passing with --runInBand)

---

## Current Project State

### Prisma Schema (prisma/schema.prisma)
```
Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource, TransactionStatus, VatType, CategorizationSource, Gender, PreferredContact, FeeType, EnrollmentStatus, InvoiceStatus, DeliveryMethod, DeliveryStatus, LineType, MatchType, MatchedBy, EmploymentType, PayFrequency, PayrollStatus
Models: Tenant, User, AuditLog, Transaction, Categorization, PayeePattern, FeeStructure, Enrollment, Parent, Child, Invoice, InvoiceLine, Payment, Staff, Payroll
```

### Migrations Applied
1. `20251219225823_create_tenants`
2. `20251219233350_create_users`
3. `20251220000830_create_audit_logs` (with immutability rules)
4. `20251220004833_create_transactions`
5. `20251220010512_create_categorizations`
6. `20251220014604_create_payee_patterns`
7. `20251220020708_create_parents_and_children`
8. `20251220023800_create_fee_structures_and_enrollments`
9. `20251220033235_create_invoices_and_invoice_lines`
10. `20251220095923_create_payments`
11. `20251220131900_add_staff_payroll_entities`

### Test Cleanup Order (CRITICAL)
```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.payroll.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.child.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
});
```

### Project Structure
```
crechebooks/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── config/
│   ├── health/
│   ├── database/
│   │   ├── prisma/            # PrismaService, PrismaModule (GLOBAL)
│   │   ├── entities/          # 14 entity files
│   │   ├── dto/               # 14 DTO files
│   │   ├── repositories/      # 13 repositories
│   │   └── services/          # AuditLogService
│   └── shared/
│       ├── constants/
│       ├── exceptions/        # Custom exceptions
│       ├── interfaces/
│       └── utils/             # Money, Date utilities
├── prisma/
│   ├── schema.prisma
│   └── migrations/            # 11 migrations
├── prisma.config.ts           # Prisma 7 config
├── tests/
│   ├── shared/
│   └── database/
│       ├── repositories/      # 16 spec files (493 tests total)
│       └── services/          # audit-log spec
└── test/
```

---

## Recent Decisions
| Date | Decision | Impact |
|------|----------|--------|
| 2025-12-20 | Payroll status workflow DRAFT → APPROVED → PAID | Enforces proper payroll processing |
| 2025-12-20 | Cannot delete staff with payroll records | Preserves payroll history |
| 2025-12-20 | Use Prisma enum in repository, custom in DTO | Type safety with ESLint compliance |
| 2025-12-20 | BusinessException for status transitions | Clear error codes for workflow errors |

---

## Key File Locations
- Constitution: `specs/constitution.md`
- Data Models: `specs/technical/data-models.md`
- Task Index: `specs/tasks/_index.md`
- Progress: `.ai/progress.md`
- Decisions: `.ai/decisionLog.md`

---

## Verification Commands
```bash
npm run build           # Must compile without errors
npm run lint            # Must pass with 0 warnings
npm test -- --runInBand # All tests must pass (493 tests)
npm run test:e2e        # E2E tests must pass
```

---

## Current Blockers
- None - Ready for next task (TASK-SARS-002)

---

## Session Notes
TASK-SARS-001 completed with 493 tests passing.
Foundation Layer: 12/15 tasks complete (80%).
84 new tests added (staff + payroll).
All existing test files updated with new cleanup order.
