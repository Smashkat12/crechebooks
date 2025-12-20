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

## DEC-027: Cascade Delete for Enrollments
**Date**: 2025-12-20
**Status**: Final
**Decision**: Enrollment cascades from Child, not from FeeStructure

**Implementation**:
```prisma
model Enrollment {
  child Child @relation(fields: [childId], references: [id], onDelete: Cascade)
  feeStructure FeeStructure @relation(fields: [feeStructureId], references: [id])
}
```

**Rationale**:
- Deleting a child should remove all their enrollments
- Deleting a fee structure should NOT delete enrollments (use deactivate instead)
- Matches real-world business logic

---

## DEC-028: Soft Delete vs Deactivate for FeeStructure
**Date**: 2025-12-20
**Status**: Final
**Decision**: FeeStructure uses deactivate() pattern with isActive flag

**Implementation**:
```typescript
async deactivate(id: string): Promise<FeeStructure> {
  return await this.prisma.feeStructure.update({
    where: { id },
    data: { isActive: false },
  });
}
```

**Rationale**:
- Cannot hard delete if enrollments exist (FK constraint)
- isActive flag preserves historical data
- Active fee structures filtered in queries

---

## DEC-029: Date-Only Fields for Billing
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use @db.Date for billing-related dates

**Implementation**:
```prisma
model FeeStructure {
  effectiveFrom DateTime @map("effective_from") @db.Date
  effectiveTo   DateTime? @map("effective_to") @db.Date
}

model Enrollment {
  startDate DateTime @map("start_date") @db.Date
  endDate   DateTime? @map("end_date") @db.Date
}
```

**Test Pattern**:
```typescript
// WRONG - timestamp comparison fails on date-only fields
expect(Math.abs(now.getTime() - endDate.getTime())).toBeLessThan(5000);

// CORRECT - compare date components
expect(endDate.getFullYear()).toBe(now.getFullYear());
expect(endDate.getMonth()).toBe(now.getMonth());
expect(endDate.getDate()).toBe(now.getDate());
```

**Rationale**:
- Billing periods don't need time precision
- PostgreSQL DATE type is more efficient
- Avoids timezone confusion

---

## DEC-030: Sibling Discount Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Store discount percentage on FeeStructure, applied flag on Enrollment

**Implementation**:
```prisma
model FeeStructure {
  siblingDiscountPercent Decimal? @map("sibling_discount_percent") @db.Decimal(5, 2)
}

model Enrollment {
  siblingDiscountApplied Boolean @default(false) @map("sibling_discount_applied")
}
```

**Rationale**:
- Fee structure defines available discount rate
- Enrollment tracks whether discount was applied
- Allows future audit of discount decisions

---

## DEC-031: Test Cleanup Order Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Delete tables in FK dependency order (leaf tables first)

**Implementation**:
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

**Rationale**:
- Foreign key constraints require child deletion before parent
- Must update ALL existing test files when adding new tables
- Order must be maintained across all test files

---

## DEC-032: Enrollment Withdraw Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Dedicated withdraw() method sets status and end date atomically

**Implementation**:
```typescript
async withdraw(id: string): Promise<Enrollment> {
  return await this.prisma.enrollment.update({
    where: { id },
    data: {
      status: 'WITHDRAWN',
      endDate: new Date(),
    },
  });
}
```

**Rationale**:
- Common operation needs dedicated method
- Ensures status and endDate stay in sync
- Clear audit trail of withdrawal date

---

## DEC-033: Invoice Cascade Delete Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: InvoiceLine cascades from Invoice (onDelete: Cascade)

**Implementation**:
```prisma
model InvoiceLine {
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
}
```

**Rationale**:
- Deleting an invoice should remove all its lines atomically
- Lines have no meaning without their parent invoice
- Matches business logic expectations

---

## DEC-034: Invoice Soft Delete Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Invoice uses isDeleted flag for soft delete

**Implementation**:
```prisma
model Invoice {
  isDeleted Boolean @default(false) @map("is_deleted")
}
```

**Rationale**:
- Invoices are financial records that may need audit trail
- Soft delete preserves historical data
- Can be restored if needed

---

## DEC-035: Invoice Payment Tracking Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: recordPayment method auto-updates invoice status based on payment amount

**Implementation**:
```typescript
async recordPayment(id: string, amountCents: number): Promise<Invoice> {
  const newAmountPaid = existing.amountPaidCents + amountCents;
  let newStatus: InvoiceStatus = existing.status as InvoiceStatus;

  if (newAmountPaid >= existing.totalCents) {
    newStatus = InvoiceStatus.PAID;
  } else if (newAmountPaid > 0) {
    newStatus = InvoiceStatus.PARTIALLY_PAID;
  }
  // ...
}
```

**Rationale**:
- Automatic status updates prevent inconsistent states
- Single method handles all payment scenarios
- Clear audit trail of payment progression

---

## DEC-036: Invoice Composite Unique Constraint
**Date**: 2025-12-20
**Status**: Final
**Decision**: Invoice number is unique per tenant using composite unique constraint

**Implementation**:
```prisma
model Invoice {
  @@unique([tenantId, invoiceNumber])
}
```

**Query Pattern**:
```typescript
findUnique({ where: { tenantId_invoiceNumber: { tenantId, invoiceNumber } } })
```

**Rationale**:
- Each tenant can use their own numbering scheme
- Prevents duplicate invoice numbers within a tenant
- Allows reuse of invoice numbers across tenants

---

## DEC-037: InvoiceLine Sort Order Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: InvoiceLine uses sortOrder for display ordering with dedicated reorder method

**Implementation**:
```prisma
model InvoiceLine {
  sortOrder Int @default(0) @map("sort_order")
  @@index([invoiceId, sortOrder])
}
```

**Repository Method**:
```typescript
async reorderLines(lineOrders: Array<{ id: string; sortOrder: number }>): Promise<void> {
  await this.prisma.$transaction(
    lineOrders.map(({ id, sortOrder }) =>
      this.prisma.invoiceLine.update({ where: { id }, data: { sortOrder } })
    )
  );
}
```

**Rationale**:
- Lines need consistent display ordering
- Index improves query performance
- Transaction ensures atomic reorder operation

---

## DEC-038: Payroll Status Workflow
**Date**: 2025-12-20
**Status**: Final
**Decision**: Payroll status follows DRAFT → APPROVED → PAID workflow

**Implementation**:
```typescript
// PayrollStatus enum
enum PayrollStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

// Transition methods
async approve(id: string): Promise<Payroll> {
  // Only DRAFT can be approved
  if (existing.status !== PayrollStatus.DRAFT) {
    throw new BusinessException('Can only approve DRAFT payroll', 'INVALID_STATUS_TRANSITION');
  }
}

async markAsPaid(id: string): Promise<Payroll> {
  // Only APPROVED can be marked as paid
  if (existing.status !== PayrollStatus.APPROVED) {
    throw new BusinessException('Can only mark APPROVED payroll as paid', 'INVALID_STATUS_TRANSITION');
  }
}
```

**Rationale**:
- Enforces proper payroll processing workflow
- Prevents accidental payments without approval
- Clear audit trail of status changes

---

## DEC-039: Immutable PAID Payroll
**Date**: 2025-12-20
**Status**: Final
**Decision**: PAID payrolls cannot be updated or deleted

**Implementation**:
```typescript
async update(id: string, dto: UpdatePayrollDto): Promise<Payroll> {
  if (existing.status === PayrollStatus.PAID) {
    throw new BusinessException('Cannot update PAID payroll', 'PAYROLL_PAID');
  }
}

async delete(id: string): Promise<void> {
  if (existing.status === PayrollStatus.PAID) {
    throw new BusinessException('Cannot delete PAID payroll', 'PAYROLL_PAID');
  }
}
```

**Rationale**:
- Preserves historical payroll records for auditing
- Prevents accidental modification of completed payrolls
- SARS compliance requires accurate payroll history

---

## DEC-040: Staff Cascade Prevention
**Date**: 2025-12-20
**Status**: Final
**Decision**: Cannot delete staff with payroll records

**Implementation**:
```typescript
async delete(tenantId: string, id: string): Promise<void> {
  const payrollCount = await this.prisma.payroll.count({
    where: { staffId: id },
  });
  if (payrollCount > 0) {
    throw new BusinessException(
      'Cannot delete staff with payroll records',
      'STAFF_HAS_PAYROLL',
      { payrollCount }
    );
  }
}
```

**Rationale**:
- Payroll records are legal documents for SARS
- Staff must be deactivated instead of deleted
- Preserves referential integrity

---

## DEC-041: Prisma Enum in Repository
**Date**: 2025-12-20
**Status**: Final
**Decision**: Use Prisma-generated enum in repository, custom enum in DTOs

**Context**: ESLint `@typescript-eslint/no-unsafe-enum-comparison` error when comparing Prisma types with custom enums

**Implementation**:
```typescript
// In repository - import from @prisma/client
import { Payroll, Prisma, PayrollStatus } from '@prisma/client';

// In DTO - use custom enum for validation
import { PayrollStatus } from '../entities/payroll.entity';
```

**Rationale**:
- Prisma generates its own enum types at runtime
- Comparing Prisma's type with custom enum triggers ESLint error
- Repository works with Prisma types directly
- DTOs work with custom enums for class-validator

---

## DEC-042: Updated Test Cleanup Order
**Date**: 2025-12-20
**Status**: Final
**Decision**: Test cleanup must include payroll and staff in proper FK order

**Implementation**:
```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.payroll.deleteMany({});  // NEW: payroll before staff
  await prisma.staff.deleteMany({});     // NEW: staff before payment
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

**Rationale**:
- Payroll references Staff (FK constraint)
- All test files must use same cleanup order
- Must update ALL existing tests when adding new tables

---

## DEC-043: Xero MCP Server Architecture
**Date**: 2025-12-20
**Status**: Final
**Decision**: Implement Xero integration as standalone MCP server with stdio transport

**Context**: TASK-MCP-001 required Xero API integration

**Implementation**:
```
src/mcp/xero-mcp/
├── auth/
│   ├── encryption.ts      # AES-256 encryption for tokens
│   └── token-manager.ts   # OAuth2 token management
├── tools/                 # 8 MCP tools
├── types/                 # TypeScript interfaces
├── utils/                 # Rate limiter, error handler, logger
├── config.ts              # Environment configuration
└── server.ts              # MCP server with stdio transport
```

**Rationale**:
- Standalone server allows independent deployment
- Stdio transport enables integration with Claude Code
- Clear separation from NestJS application

---

## DEC-044: AES-256 Token Encryption
**Date**: 2025-12-20
**Status**: Final
**Decision**: Encrypt OAuth2 tokens at rest using AES-256 via crypto-js

**Implementation**:
```typescript
import CryptoJS from 'crypto-js';

encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, this.key).toString();
}

decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, this.key);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

**Rationale**:
- SEC-07 compliance: Tokens never stored in plain text
- crypto-js provides mature AES implementation
- Key stored in environment variable (TOKEN_ENCRYPTION_KEY)

---

## DEC-045: Token Auto-Refresh Pattern
**Date**: 2025-12-20
**Status**: Final
**Decision**: Refresh tokens 5 minutes before expiry with mutex lock

**Implementation**:
```typescript
private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;
private readonly refreshLocks: Map<string, Promise<string>> = new Map();

async getAccessToken(tenantId: string): Promise<string> {
  if (Date.now() >= tokens.expiresAt - this.REFRESH_BUFFER_MS) {
    return this.refreshAccessToken(tenantId);
  }
  return tokens.accessToken;
}

async refreshAccessToken(tenantId: string): Promise<string> {
  const existingRefresh = this.refreshLocks.get(tenantId);
  if (existingRefresh) return existingRefresh;
  // ...
}
```

**Rationale**:
- 5-minute buffer prevents token expiry during API calls
- Mutex lock prevents concurrent refresh requests for same tenant
- Promise reuse ensures only one refresh per tenant in flight

---

## DEC-046: Sliding Window Rate Limiting
**Date**: 2025-12-20
**Status**: Final
**Decision**: Implement sliding window rate limiter (60 requests/minute)

**Implementation**:
```typescript
class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => t > now - this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      throw new RateLimitError(this.maxRequests, this.windowMs);
    }
    this.timestamps.push(now);
  }
}
```

**Rationale**:
- Xero API has rate limits (60 requests/minute)
- Sliding window is more accurate than fixed window
- Fail-fast approach throws error when limit exceeded

---

## DEC-047: MCP Tool Input Validation
**Date**: 2025-12-20
**Status**: Final
**Decision**: Validate all tool inputs at runtime, fail fast on invalid data

**Implementation**:
```typescript
private async handleToolCall(name: string, args: Record<string, unknown>) {
  const tenantId = args.tenantId as string;
  if (!tenantId) {
    throw new XeroMCPError('tenantId is required', 'MISSING_TENANT_ID', 400);
  }
  // ...
}
```

**Rationale**:
- MCP tools receive untyped arguments
- Fail-fast validation prevents silent failures
- Clear error messages aid debugging

---

## DEC-048: XeroToken Model Design
**Date**: 2025-12-20
**Status**: Final
**Decision**: Store encrypted tokens in dedicated XeroToken model with tenant relation

**Implementation**:
```prisma
model XeroToken {
  id                String   @id @default(uuid())
  tenantId          String   @unique @map("tenant_id")
  xeroTenantId      String   @map("xero_tenant_id")
  encryptedTokens   String   @map("encrypted_tokens") @db.Text
  tokenExpiresAt    DateTime @map("token_expires_at")
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
}
```

**Rationale**:
- One-to-one relationship with Tenant (each tenant has one Xero connection)
- encryptedTokens stores AES-256 encrypted JSON (never plain text)
- tokenExpiresAt enables proactive refresh scheduling
- Text column type for unlimited encrypted data length

---

## DEC-049: MCP Error Hierarchy
**Date**: 2025-12-20
**Status**: Final
**Decision**: Create typed error hierarchy for MCP-specific errors

**Implementation**:
```typescript
export class XeroMCPError extends Error {
  constructor(message: string, public code: string, public statusCode: number) {}
}

export class TokenExpiredError extends XeroMCPError {}
export class TokenNotFoundError extends XeroMCPError {}
export class RateLimitError extends XeroMCPError {}
export class XeroAPIError extends XeroMCPError {}
export class EncryptionError extends XeroMCPError {}
```

**Rationale**:
- Typed errors enable specific error handling
- Error codes allow programmatic error handling by callers
- Status codes map to HTTP semantics for consistency

---

## DEC-050: Prisma 7 Adapter in MCP Server
**Date**: 2025-12-20
**Status**: Final
**Decision**: MCP server creates its own PrismaClient with Pool + PrismaPg adapter

**Implementation**:
```typescript
constructor() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  this.pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(this.pool);
  this.prisma = new PrismaClient({ adapter });
}
```

**Rationale**:
- Prisma 7 requires adapter for database connections
- MCP server runs standalone (not in NestJS context)
- Fail-fast on missing DATABASE_URL

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
| 2025-12-20 | DEC-027 through DEC-032 added (TASK-BILL-002 learnings) | AI Agent |
| 2025-12-20 | DEC-033 through DEC-037 added (TASK-BILL-003 learnings) | AI Agent |
| 2025-12-20 | DEC-038 through DEC-042 added (TASK-SARS-001 learnings) | AI Agent |
| 2025-12-20 | DEC-043 through DEC-050 added (TASK-MCP-001 learnings) | AI Agent |
