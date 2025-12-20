# Active Context

## Last Updated
2025-12-20 by AI Agent (TASK-TRANS-002 Completed)

## Current Focus
CrecheBooks AI Bookkeeping System - Foundation Layer Implementation

## Project Overview
CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer.

## Active Task
**Phase**: Foundation Layer (Phase 1)
**Completed**: TASK-CORE-001, TASK-CORE-002, TASK-CORE-003, TASK-CORE-004, TASK-TRANS-001, TASK-TRANS-002
**Next**: TASK-TRANS-003 (to be determined from task index)

## GitHub Repository
https://github.com/Smashkat12/crechebooks

---

## TASK-TRANS-002 Summary (COMPLETED)

### What Was Built
- VatType enum (STANDARD, ZERO_RATED, EXEMPT, NO_VAT)
- CategorizationSource enum (AI_AUTO, AI_SUGGESTED, USER_OVERRIDE, RULE_BASED)
- Categorization model with Transaction and User relations
- Database migration `20251220012120_create_categorizations` with 14 columns
- ICategorization TypeScript interface
- CreateCategorizationDto, UpdateCategorizationDto, ReviewCategorizationDto, CategorizationFilterDto
- CategorizationRepository with 7 methods + 2 validation helpers:
  - create, findById, findByTransaction, findPendingReview
  - findWithFilters (paginated), review, update, delete
  - validateSplitTransaction, validateVatCalculation
- 28 integration tests using REAL database (no mocks)
- Business validation: split transactions require splitAmountCents
- Business validation: STANDARD VAT type requires vatAmountCents
- Review workflow: sets reviewedBy, reviewedAt, changes source to USER_OVERRIDE

### Key Design Decisions
1. **Relation-based Reviewer Update** - Use `connect: { id }` for reviewer relation
2. **P2025 Error Handling** - Handle missing connect records as NotFoundException
3. **Confidence as Decimal(5,2)** - Store 0-100 with 2 decimal precision
4. **ValidateIf Typing** - Type callback parameter to satisfy ESLint
5. **Review Changes Source** - All reviewed categorizations become USER_OVERRIDE

### Key Files Created
```
src/database/
├── entities/
│   ├── categorization.entity.ts  # VatType, CategorizationSource, ICategorization
│   └── index.ts                  # Updated
├── dto/
│   ├── categorization.dto.ts     # Create, Update, Review, Filter DTOs
│   └── index.ts                  # Updated
├── repositories/
│   ├── categorization.repository.ts  # 7 methods + 2 validators
│   └── index.ts                  # Updated

prisma/
├── schema.prisma                 # VatType, CategorizationSource enums, Categorization model
│                                 # Updated Transaction (categorizations relation)
│                                 # Updated User (reviewedCategorizations relation)
└── migrations/
    └── 20251220012120_create_categorizations/
        └── migration.sql

tests/database/repositories/
├── categorization.repository.spec.ts  # 28 tests with real DB
├── tenant.repository.spec.ts          # Updated cleanup order
├── user.repository.spec.ts            # Updated cleanup order
└── transaction.repository.spec.ts     # Updated cleanup order
```

### Verification
- Build: PASS
- Lint: PASS (0 errors, 0 warnings)
- Tests: 169 tests (all passing with --runInBand)
  - 28 new categorization tests
  - 141 existing tests

---

## Current Project State

### Prisma Schema (prisma/schema.prisma)
```
Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource, TransactionStatus, VatType, CategorizationSource
Models: Tenant, User, AuditLog, Transaction, Categorization
```

### Migrations Applied
1. `20251219225823_create_tenants`
2. `20251219233350_create_users`
3. `20251220000830_create_audit_logs` (with immutability rules)
4. `20251220XXXXXX_create_transactions`
5. `20251220012120_create_categorizations`

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
│   │   ├── entities/          # ITenant, IUser, IAuditLog, ITransaction, ICategorization, enums
│   │   ├── dto/               # Tenant, User, AuditLog, Transaction, Categorization DTOs
│   │   ├── repositories/      # TenantRepository, UserRepository, TransactionRepository, CategorizationRepository
│   │   └── services/          # AuditLogService
│   └── shared/
│       ├── constants/
│       ├── exceptions/        # Custom exceptions
│       ├── interfaces/
│       └── utils/             # Money, Date utilities
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── prisma.config.ts           # Prisma 7 config
├── tests/
│   ├── shared/
│   └── database/
│       ├── repositories/      # tenant, user, transaction, categorization specs
│       └── services/          # audit-log spec
└── test/
```

---

## Recent Decisions
| Date | Decision | Impact |
|------|----------|--------|
| 2025-12-20 | Prisma 7 adapter pattern | Pool + PrismaPg adapter in service |
| 2025-12-20 | Tests use real database | No mocks, DATABASE_URL required |
| 2025-12-20 | Fail fast philosophy | Errors logged fully, then re-thrown |
| 2025-12-20 | Repository pattern | CRUD in repositories, not services |
| 2025-12-20 | Soft delete pattern | isDeleted + deletedAt fields |
| 2025-12-20 | Run tests with --runInBand | Avoid parallel database conflicts |
| 2025-12-20 | Import enums from entity | DTOs import from entity.ts, not @prisma/client |
| 2025-12-20 | P2025 for connect errors | Handle missing relation records as NotFoundException |
| 2025-12-20 | ValidateIf typed callbacks | Type DTO callback parameters to satisfy @typescript-eslint |

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
pnpm test --runInBand    # All tests must pass (169 tests)
pnpm run test:e2e        # E2E tests must pass
```

---

## Current Blockers
- None - Ready for next task

---

## Session Notes
TASK-TRANS-002 completed with 169 tests passing.
Foundation Layer: 6/15 tasks complete (40%).
28 new categorization tests added.
All business validations (split transactions, VAT calculations) implemented.
Review workflow changes source to USER_OVERRIDE.
