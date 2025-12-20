# Decision Log

## Purpose
Immutable record of architectural and design decisions. Prevents re-litigating settled debates.

---

## DEC-001: AI Orchestration Layer
**Date**: 2025-12-19
**Status**: Final
**Decision**: Use Claude Code CLI as AI orchestration layer instead of direct Claude API

**Rationale**:
- 60-80% cost savings through subscription pricing
- Built-in tools eliminate custom implementation
- Native MCP support for Xero integration
- AskUserQuestion tool provides human-in-the-loop capability

---

## DEC-002: Backend Framework
**Date**: 2025-12-19
**Status**: Final
**Decision**: Use NestJS with TypeScript

**Rationale**:
- TypeScript provides type safety critical for financial calculations
- NestJS module system aligns with domain-driven design
- Built-in dependency injection simplifies testing

---

## DEC-003: Database and ORM
**Date**: 2025-12-19
**Status**: Final
**Decision**: PostgreSQL with Prisma ORM

**Rationale**:
- PostgreSQL: Proven for financial systems, ACID compliance, row-level security
- Prisma: Best-in-class TypeScript integration, auto-generated types

---

## DEC-004: Financial Calculation Precision
**Date**: 2025-12-19
**Status**: Final
**Decision**: Use Decimal.js with banker's rounding, store amounts as integer cents

**Implementation**:
```typescript
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });
// 2.005 rounds to 2.00 (down to even)
// 2.015 rounds to 2.02 (up to even)
```

---

## DEC-005: Multi-Tenant Architecture
**Date**: 2025-12-19
**Status**: Final
**Decision**: Single database with row-level security and tenant_id column

**Rationale**:
- Simpler deployment and maintenance
- PostgreSQL RLS is robust and well-tested

---

## DEC-006: Agent Autonomy Levels
**Date**: 2025-12-19
**Status**: Final
**Decision**: Variable autonomy per function (L2-L4)

| Function | Level | Reasoning |
|----------|-------|-----------|
| Transaction categorization (high confidence) | L4 | Reversible, auditable |
| Transaction categorization (low confidence) | L2 | Needs human judgment |
| SARS calculations | L2 | Regulatory risk |

---

## DEC-007: South African Localization
**Date**: 2025-12-19
**Status**: Final
**Decision**: Build SA-specific features as first-class citizens

- Currency: ZAR only
- Timezone: Africa/Johannesburg (SAST, UTC+2)
- VAT Rate: 15%
- Compliance: POPIA, 5-year retention

---

## DEC-008: Xero Integration Approach
**Date**: 2025-12-19
**Status**: Final
**Decision**: Xero as source of truth via MCP server

---

## DEC-009: Task Decomposition Strategy
**Date**: 2025-12-19
**Status**: Final
**Decision**: Inside-Out, Bottom-Up layer slicing

1. Foundation Layer (entities, types, migrations)
2. Logic Layer (services, business rules)
3. Agent Layer (Claude Code agents)
4. Surface Layer (controllers, APIs)
5. Integration Layer (E2E tests)

---

## DEC-010: Prisma 7 Configuration Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use prisma.config.ts for datasource URL (Prisma 7 breaking change)

**Context**: Prisma 7 introduced breaking changes from v6

**Implementation**:
```typescript
// prisma.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
```

**Schema** (NO URL in datasource):
```prisma
datasource db {
  provider = "postgresql"
}
```

**Consequences**:
- All prisma commands work with prisma.config.ts
- DATABASE_URL must be set in .env
- Old pattern (url in schema.prisma) will NOT work

---

## DEC-011: Package Manager
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use pnpm (not npm or yarn)

**Rationale**:
- Faster installs
- Strict dependency management
- Disk space efficient

**Consequences**:
- All commands use `pnpm run` not `npm run`
- Lock file is `pnpm-lock.yaml`

---

## DEC-012: Test Philosophy
**Date**: 2025-12-20
**Status**: Final
**Decision**: NO mock data in tests - use real database and real data

**Context**: User requirement for fail-fast debugging

**Rules**:
- Integration tests MUST use real PostgreSQL database
- Test data MUST represent real South African creche scenarios
- Tests that pass when code is broken are BUGS
- If something fails, error must clearly indicate WHY

**Consequences**:
- Requires DATABASE_URL for running tests
- Tests are slower but more reliable
- No false confidence from mocked successes

---

## DEC-013: Error Handling Philosophy
**Date**: 2025-12-20
**Status**: Final
**Decision**: Fail fast with robust error logging - NO workarounds or fallbacks

**Rules**:
- NEVER swallow errors - always log and re-throw
- Log errors with FULL context (input data, operation name, stack trace)
- Use custom exception classes (AppException, ValidationException, etc.)
- If something doesn't work, it should ERROR OUT immediately
- NO backwards compatibility hacks

**Implementation**:
```typescript
try {
  // operation
} catch (error) {
  this.logger.error(`Failed to create tenant: ${JSON.stringify(dto)}`, error instanceof Error ? error.stack : error);
  throw new DatabaseException('create', 'Failed to create tenant', error);
}
```

---

## DEC-014: Naming Conventions for Database
**Date**: 2025-12-20
**Status**: Final
**Decision**: snake_case for tables and columns, PascalCase in TypeScript

**Implementation**:
```prisma
model Tenant {
  tradingName String? @map("trading_name")
  @@map("tenants")
}
```

---

## DEC-015: Prisma 7 Adapter Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use Pool + PrismaPg adapter for database connections in Prisma 7

**Context**: Prisma 7 requires explicit adapter configuration for database connections

**Implementation**:
```typescript
// src/database/prisma/prisma.service.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

constructor() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  super({ adapter });
  this.pool = pool;
}
```

**Consequences**:
- Must close pool in onModuleDestroy
- DATABASE_URL validation happens in constructor (fail-fast)

---

## DEC-016: Global PrismaModule
**Date**: 2025-12-20
**Status**: Final
**Decision**: PrismaModule is @Global() so PrismaService is available everywhere

**Rationale**:
- All repositories need database access
- Avoids importing PrismaModule in every feature module
- Single source of truth for database connection

---

---

## DEC-017: Repository Pattern for CRUD
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use Repository pattern for database CRUD, Service pattern for business logic

**Context**: TASK-CORE-003 required UserRepository

**Implementation**:
- `TenantRepository` and `UserRepository` in `src/database/repositories/`
- Repositories handle CRUD operations with error handling
- Services (future) will handle business logic that spans entities

**Consequences**:
- Clear separation of concerns
- Repositories are injected via NestJS DI
- DatabaseModule exports all repositories

---

## DEC-018: Test Cleanup Order
**Date**: 2025-12-20
**Status**: Final
**Decision**: In tests, delete child records before parent records

**Context**: Foreign key constraints require proper cleanup order

**Implementation**:
```typescript
beforeEach(async () => {
  await prisma.user.deleteMany({});   // Child first
  await prisma.tenant.deleteMany({}); // Parent second
});
```

---

## DEC-019: Soft Delete Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use soft delete with isDeleted and deletedAt fields

**Context**: TASK-TRANS-001 required transaction deletion

**Implementation**:
```prisma
model Transaction {
  isDeleted   Boolean   @default(false) @map("is_deleted")
  deletedAt   DateTime? @map("deleted_at")
}
```

**Repository Pattern**:
```typescript
async softDelete(tenantId: string, id: string): Promise<void> {
  await this.prisma.transaction.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() }
  });
}

// All queries exclude soft-deleted records
where: { tenantId, isDeleted: false }
```

**Consequences**:
- Records never truly deleted (audit trail)
- All queries must filter isDeleted: false
- Unique constraints may need compound key with isDeleted

---

## DEC-020: Import Enums from Entity Files
**Date**: 2025-12-20
**Status**: Final
**Decision**: DTOs must import enums from entity files, NOT from @prisma/client

**Context**: TASK-TRANS-001 required consistent enum usage

**Implementation**:
```typescript
// src/database/dto/transaction.dto.ts
import { ImportSource, TransactionStatus } from '../entities/transaction.entity';

// NOT:
// import { ImportSource } from '@prisma/client';  // WRONG
```

**Rationale**:
- Entity file is the canonical source
- Maintains separation from Prisma internals
- Makes code more testable

---

## DEC-021: Interface Nullable Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: In TypeScript interfaces, use `string | null` not `string?`

**Context**: TASK-TRANS-001 interface definition

**Implementation**:
```typescript
// CORRECT
export interface ITransaction {
  payeeName: string | null;
  reference: string | null;
}

// WRONG
export interface ITransaction {
  payeeName?: string;  // This means optional, not nullable
}
```

**Rationale**:
- `string | null` explicitly models database nullable columns
- `string?` means the property may not exist, which is different
- Matches Prisma's generated types

---

## DEC-022: Run Tests with --runInBand
**Date**: 2025-12-20
**Status**: Final
**Decision**: Run integration tests with --runInBand to avoid parallel conflicts

**Context**: TASK-TRANS-001 tests failed when run in parallel

**Implementation**:
```bash
pnpm run test -- --runInBand
```

**Rationale**:
- Multiple test files share the same database
- Parallel runs cause cleanup conflicts
- --runInBand ensures sequential execution

---

---

## DEC-023: JSONB for PayeeAliases Storage
**Date**: 2025-12-20
**Status**: Final
**Decision**: Store payee aliases as JSONB array in PostgreSQL

**Context**: TASK-TRANS-003 required flexible alias storage for payee matching

**Implementation**:
```prisma
model PayeePattern {
  payeeAliases Json @default("[]") @map("payee_aliases")
}
```

**Rationale**:
- Flexible array storage without separate table
- PostgreSQL JSONB supports efficient querying
- Easy to add/remove aliases without migrations

---

## DEC-024: Atomic Match Count Increment
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use Prisma's atomic increment for matchCount

**Implementation**:
```typescript
await this.prisma.payeePattern.update({
  where: { id },
  data: { matchCount: { increment: 1 } },
});
```

**Rationale**:
- Thread-safe increment without race conditions
- Single database operation
- Prisma handles the SQL translation

---

## DEC-025: Case-Insensitive Payee Matching
**Date**: 2025-12-20
**Status**: Final
**Decision**: Match payee patterns and aliases case-insensitively

**Implementation**:
```typescript
// Pattern matching
payeePattern: { equals: payeeName, mode: 'insensitive' }

// Alias matching
aliases.some(alias => alias.toLowerCase() === payeeNameLower)
```

**Rationale**:
- Bank feeds have inconsistent casing
- "SMITH J" should match "Smith J" and "smith j"
- Improves pattern recognition accuracy

---

## DEC-026: Recurring Pattern Validation
**Date**: 2025-12-20
**Status**: Final
**Decision**: Enforce expectedAmountCents for recurring patterns

**Implementation**:
```typescript
if (dto.isRecurring && dto.expectedAmountCents === undefined) {
  throw new BusinessException(
    'Recurring patterns require expectedAmountCents',
    'EXPECTED_AMOUNT_REQUIRED',
  );
}
```

**Rationale**:
- Recurring patterns need expected amount for variance detection
- Early validation prevents invalid data in database
- Clear error message for debugging

---

## Change Log

| Date | Decision | Author |
|------|----------|--------|
| 2025-12-19 | DEC-001 through DEC-009 documented | AI Agent |
| 2025-12-20 | DEC-010 through DEC-014 added (TASK-CORE-001 learnings) | AI Agent |
| 2025-12-20 | DEC-015, DEC-016 added (TASK-CORE-002 learnings) | AI Agent |
| 2025-12-20 | DEC-017, DEC-018 added (TASK-CORE-003 learnings) | AI Agent |
| 2025-12-20 | DEC-019 through DEC-022 added (TASK-TRANS-001 learnings) | AI Agent |
| 2025-12-20 | DEC-023 through DEC-026 added (TASK-TRANS-003 learnings) | AI Agent |
