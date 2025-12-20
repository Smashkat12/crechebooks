# Active Context

## Last Updated
2025-12-20 by AI Agent (TASK-BILL-002 Completed)

## Current Focus
CrecheBooks AI Bookkeeping System - Foundation Layer Implementation

## Project Overview
CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer.

## Active Task
**Phase**: Foundation Layer (Phase 1)
**Completed**: TASK-CORE-001, TASK-CORE-002, TASK-CORE-003, TASK-CORE-004, TASK-TRANS-001, TASK-TRANS-002, TASK-TRANS-003, TASK-BILL-001, TASK-BILL-002
**Next**: TASK-BILL-003 (Invoice and Invoice Line Entities)

## GitHub Repository
https://github.com/Smashkat12/crechebooks

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
Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource, TransactionStatus, VatType, CategorizationSource, Gender, PreferredContact, FeeType, EnrollmentStatus
Models: Tenant, User, AuditLog, Transaction, Categorization, PayeePattern, FeeStructure, Enrollment, Parent, Child
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

### Test Cleanup Order (CRITICAL)
```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
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
│   │   ├── entities/          # 10 entity files (tenant, user, audit-log, transaction, categorization, payee-pattern, parent, child, fee-structure, enrollment)
│   │   ├── dto/               # 10 DTO files
│   │   ├── repositories/      # 9 repositories (tenant, user, transaction, categorization, payee-pattern, parent, child, fee-structure, enrollment)
│   │   └── services/          # AuditLogService
│   └── shared/
│       ├── constants/
│       ├── exceptions/        # Custom exceptions
│       ├── interfaces/
│       └── utils/             # Money, Date utilities
├── prisma/
│   ├── schema.prisma
│   └── migrations/            # 8 migrations
├── prisma.config.ts           # Prisma 7 config
├── tests/
│   ├── shared/
│   └── database/
│       ├── repositories/      # 9 spec files (304 tests total)
│       └── services/          # audit-log spec
└── test/
```

---

## Recent Decisions
| Date | Decision | Impact |
|------|----------|--------|
| 2025-12-20 | Cascade delete Enrollment from Child | Deleting child removes all enrollments |
| 2025-12-20 | Soft delete for FeeStructure | Use deactivate() when enrollments exist |
| 2025-12-20 | Date-only fields for billing dates | Compare year/month/day, not timestamps |
| 2025-12-20 | Sibling discount on FeeStructure | Percentage stored as Decimal(5,2) |

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
npx jest --runInBand     # All tests must pass (304 tests)
pnpm run test:e2e        # E2E tests must pass
```

---

## Current Blockers
- None - Ready for next task (TASK-BILL-003)

---

## Session Notes
TASK-BILL-002 completed with 304 tests passing.
Foundation Layer: 9/15 tasks complete (60%).
55 new tests added (fee structure + enrollment).
All existing test files updated with new cleanup order.
Commit c60925c pushed to origin/main.
