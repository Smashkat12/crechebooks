# Active Context

## Last Updated
2025-12-20 by AI Agent (TASK-BILL-003 Completed)

## Current Focus
CrecheBooks AI Bookkeeping System - Foundation Layer Implementation

## Project Overview
CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer.

## Active Task
**Phase**: Foundation Layer (Phase 1)
**Completed**: TASK-CORE-001, TASK-CORE-002, TASK-CORE-003, TASK-CORE-004, TASK-TRANS-001, TASK-TRANS-002, TASK-TRANS-003, TASK-BILL-001, TASK-BILL-002, TASK-BILL-003
**Next**: TASK-PAY-001 (Payment Entity and Types)

## GitHub Repository
https://github.com/Smashkat12/crechebooks

---

## TASK-BILL-003 Summary (COMPLETED)

### What Was Built
- InvoiceStatus enum (DRAFT, SENT, VIEWED, PARTIALLY_PAID, PAID, OVERDUE, VOID)
- DeliveryMethod enum (EMAIL, WHATSAPP, BOTH)
- DeliveryStatus enum (PENDING, SENT, DELIVERED, OPENED, FAILED)
- LineType enum (MONTHLY_FEE, REGISTRATION, EXTRA, DISCOUNT, CREDIT)
- Invoice model in Prisma schema (21 columns)
  - Xero integration field (xeroInvoiceId, unique)
  - Billing period tracking (billingPeriodStart, billingPeriodEnd)
  - Payment tracking (subtotalCents, vatCents, totalCents, amountPaidCents)
  - Delivery tracking (deliveryMethod, deliveryStatus, deliveredAt)
  - Soft delete pattern (isDeleted)
  - FK to Parent and Child
- InvoiceLine model in Prisma schema (12 columns)
  - Line item details (description, quantity, unitPriceCents)
  - VAT calculation support (vatCents, subtotalCents, totalCents)
  - Line types for categorization
  - Cascade delete from Invoice (onDelete: Cascade)
- Database migration `20251220033235_create_invoices_and_invoice_lines`
- IInvoice and IInvoiceLine TypeScript interfaces
- CreateInvoiceDto, UpdateInvoiceDto, InvoiceFilterDto with validation
- CreateInvoiceLineDto, UpdateInvoiceLineDto, BatchCreateInvoiceLinesDto
- InvoiceRepository with 13 methods:
  - create, findById, findByIdWithLines
  - findByTenant (with filters), findByInvoiceNumber
  - findByParent, findByChild, findByStatus, findOverdue
  - update, softDelete, delete
  - updateDeliveryStatus, recordPayment
- InvoiceLineRepository with 8 methods:
  - create, createMany, findById, findByInvoice
  - update, delete, deleteByInvoice, reorderLines
- 66 new integration tests using REAL database (no mocks)
- Updated all 9 existing test files with new cleanup order

### Key Design Decisions
1. **Cascade Delete** - InvoiceLine cascades from Invoice (onDelete: Cascade)
2. **Soft Delete for Invoice** - Use isDeleted flag instead of hard delete
3. **Date-Only Fields** - Use @db.Date for billing period and dates
4. **Unique Invoice Number** - Composite unique on (tenantId, invoiceNumber)
5. **Payment Tracking** - amountPaidCents accumulates payments, status auto-updates
6. **Delivery Status** - Tracks delivery lifecycle (PENDING → SENT → DELIVERED → OPENED)

### Key Lessons Learned
1. **FK Cleanup Order** - CRITICAL: InvoiceLine first, then Invoice (new tables at top)
2. **Composite Unique Naming** - Prisma names it `tenantId_invoiceNumber` for queries
3. **findByIdWithLines** - Use `include` to fetch related lines in one query
4. **recordPayment** - Auto-updates status based on payment vs total amounts

### Key Files Created
```
src/database/
├── entities/
│   ├── invoice.entity.ts         # IInvoice, InvoiceStatus, DeliveryMethod, DeliveryStatus
│   ├── invoice-line.entity.ts    # IInvoiceLine, LineType
│   └── index.ts                  # Updated
├── dto/
│   ├── invoice.dto.ts            # Create, Update, Filter DTOs
│   ├── invoice-line.dto.ts       # Create, Update, Batch DTOs
│   └── index.ts                  # Updated
├── repositories/
│   ├── invoice.repository.ts     # 13 methods
│   ├── invoice-line.repository.ts # 8 methods
│   └── index.ts                  # Updated

prisma/
├── schema.prisma                 # Invoice, InvoiceLine models, 4 enums
└── migrations/
    └── 20251220033235_create_invoices_and_invoice_lines/
        └── migration.sql

tests/database/repositories/
├── invoice.repository.spec.ts       # 37 tests with real DB
├── invoice-line.repository.spec.ts  # 29 tests with real DB
└── (9 existing files updated with new cleanup order)
```

### Verification
- Build: PASS
- Lint: PASS (0 errors, 0 warnings)
- Tests: 378 tests (all passing with --runInBand)
  - 66 new tests (invoice + invoice-line)
  - 312 existing tests

---

## TASK-BILL-002 Summary (COMPLETED)

### What Was Built
- FeeType enum (FULL_DAY, HALF_DAY, HOURLY, CUSTOM)
- EnrollmentStatus enum (ACTIVE, PENDING, WITHDRAWN, GRADUATED)
- FeeStructure model in Prisma schema (13 columns)
  - Sibling discount percentage field
  - Effective date range (effectiveFrom, effectiveTo)
  - VAT inclusive flag
- Enrollment model in Prisma schema (11 columns)
  - Links Child to FeeStructure
  - Custom fee override for special cases
  - Sibling discount applied flag
  - Cascade delete from Child (onDelete: Cascade)
- Database migration `20251220023800_create_fee_structures_and_enrollments`
- IFeeStructure and IEnrollment TypeScript interfaces
- CreateFeeStructureDto, UpdateFeeStructureDto, FeeStructureFilterDto
- CreateEnrollmentDto, UpdateEnrollmentDto, EnrollmentFilterDto
- FeeStructureRepository with 7 methods:
  - create, findById, findByTenant (with filters)
  - findActiveByTenant, findEffectiveOnDate
  - update, deactivate, delete
- EnrollmentRepository with 8 methods:
  - create, findById, findByTenant, findByChild
  - findActiveByChild, findByStatus
  - update, delete, withdraw
- 55 new integration tests using REAL database (no mocks)
- Updated all 7 existing test files with new cleanup order

### Key Design Decisions
1. **Cascade Delete** - Enrollment cascades from Child (not FeeStructure)
2. **Soft Delete for FeeStructure** - Use deactivate() instead of delete() when enrollments exist
3. **Date-Only Fields** - Use @db.Date for effectiveFrom, effectiveTo, startDate, endDate
4. **Sibling Discount** - Stored as Decimal(5,2) percentage on FeeStructure, boolean flag on Enrollment
5. **Withdraw Method** - Sets status to WITHDRAWN and endDate to current date

### Key Lessons Learned
1. **FK Cleanup Order** - CRITICAL: Delete in leaf-to-root order (enrollment → feeStructure → child → parent → ...)
2. **Date-Only Comparison** - @db.Date fields strip time to 00:00:00 UTC; compare year/month/day, not milliseconds
3. **Prisma Generate** - MUST run `pnpm prisma generate` after schema changes before build
4. **Test Race Conditions** - Always run with `--runInBand` to avoid parallel conflicts

### Key Files Created
```
src/database/
├── entities/
│   ├── fee-structure.entity.ts  # IFeeStructure interface, FeeType enum
│   ├── enrollment.entity.ts     # IEnrollment interface, EnrollmentStatus enum
│   └── index.ts                 # Updated
├── dto/
│   ├── fee-structure.dto.ts     # Create, Update, Filter DTOs
│   ├── enrollment.dto.ts        # Create, Update, Filter DTOs
│   └── index.ts                 # Updated
├── repositories/
│   ├── fee-structure.repository.ts  # 7 methods
│   ├── enrollment.repository.ts     # 8 methods
│   └── index.ts                 # Updated

prisma/
├── schema.prisma                # FeeStructure, Enrollment models, enums
└── migrations/
    └── 20251220023800_create_fee_structures_and_enrollments/
        └── migration.sql

tests/database/repositories/
├── fee-structure.repository.spec.ts  # 24 tests with real DB
├── enrollment.repository.spec.ts     # 31 tests with real DB
├── tenant.repository.spec.ts         # Updated cleanup order
├── user.repository.spec.ts           # Updated cleanup order
├── transaction.repository.spec.ts    # Updated cleanup order
├── categorization.repository.spec.ts # Updated cleanup order
├── payee-pattern.repository.spec.ts  # Updated cleanup order
├── parent.repository.spec.ts         # Updated cleanup order
└── child.repository.spec.ts          # Updated cleanup order
```

### Verification
- Build: PASS
- Lint: PASS (0 errors, 0 warnings)
- Tests: 304 tests (all passing with --runInBand)
  - 55 new tests (fee structure + enrollment)
  - 249 existing tests

---

## Current Project State

### Prisma Schema (prisma/schema.prisma)
```
Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource, TransactionStatus, VatType, CategorizationSource, Gender, PreferredContact, FeeType, EnrollmentStatus, InvoiceStatus, DeliveryMethod, DeliveryStatus, LineType
Models: Tenant, User, AuditLog, Transaction, Categorization, PayeePattern, FeeStructure, Enrollment, Parent, Child, Invoice, InvoiceLine
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

### Test Cleanup Order (CRITICAL)
```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
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
│   │   ├── entities/          # 12 entity files
│   │   ├── dto/               # 12 DTO files
│   │   ├── repositories/      # 11 repositories
│   │   └── services/          # AuditLogService
│   └── shared/
│       ├── constants/
│       ├── exceptions/        # Custom exceptions
│       ├── interfaces/
│       └── utils/             # Money, Date utilities
├── prisma/
│   ├── schema.prisma
│   └── migrations/            # 9 migrations
├── prisma.config.ts           # Prisma 7 config
├── tests/
│   ├── shared/
│   └── database/
│       ├── repositories/      # 11 spec files (378 tests total)
│       └── services/          # audit-log spec
└── test/
```

---

## Recent Decisions
| Date | Decision | Impact |
|------|----------|--------|
| 2025-12-20 | Cascade delete InvoiceLine from Invoice | Deleting invoice removes all lines |
| 2025-12-20 | Soft delete for Invoice | Use isDeleted flag instead of hard delete |
| 2025-12-20 | recordPayment auto-updates status | Tracks partial vs full payment |
| 2025-12-20 | Composite unique (tenantId, invoiceNumber) | Ensures unique invoice numbers per tenant |

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
pnpm run build           # Must compile without errors
pnpm run lint            # Must pass with 0 warnings
npx jest --runInBand     # All tests must pass (378 tests)
pnpm run test:e2e        # E2E tests must pass
```

---

## Current Blockers
- None - Ready for next task (TASK-PAY-001)

---

## Session Notes
TASK-BILL-003 completed with 378 tests passing.
Foundation Layer: 10/15 tasks complete (66.7%).
66 new tests added (invoice + invoice-line).
All existing test files updated with new cleanup order.
