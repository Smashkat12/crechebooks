<task_spec id="TASK-TRANS-003" version="2.0">

<metadata>
  <title>Payee Pattern Entity</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>7</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
    <requirement_ref>REQ-TRANS-006</requirement_ref>
    <requirement_ref>REQ-TRANS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-001</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<critical_context>
## CURRENT CODEBASE STATE (as of commit 91ba845)

### Completed Tasks
1. TASK-CORE-001: Project setup, NestJS config, Prisma 7
2. TASK-CORE-002: Tenant entity with multi-tenant support
3. TASK-CORE-003: User entity with Auth0 integration
4. TASK-CORE-004: AuditLog entity (immutable)
5. TASK-TRANS-001: Transaction entity with import tracking
6. TASK-TRANS-002: Categorization entity with AI/user review workflow

### Current Prisma Schema State
```
Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource, TransactionStatus, VatType, CategorizationSource
Models: Tenant, User, AuditLog, Transaction, Categorization
```

### Existing File Structure
```
src/database/
├── prisma/
│   └── prisma.service.ts         # Prisma 7 adapter pattern
├── entities/
│   ├── index.ts                  # Exports all entities
│   ├── tenant.entity.ts          # ITenant
│   ├── user.entity.ts            # IUser, UserRole enum
│   ├── audit-log.entity.ts       # IAuditLog, AuditAction enum
│   ├── transaction.entity.ts     # ITransaction, ImportSource, TransactionStatus
│   └── categorization.entity.ts  # ICategorization, VatType, CategorizationSource
├── dto/
│   ├── index.ts                  # Exports all DTOs
│   ├── tenant.dto.ts
│   ├── user.dto.ts
│   ├── audit-log.dto.ts
│   ├── transaction.dto.ts
│   └── categorization.dto.ts
├── repositories/
│   ├── index.ts                  # Exports all repositories
│   ├── tenant.repository.ts
│   ├── user.repository.ts
│   ├── transaction.repository.ts
│   └── categorization.repository.ts
└── services/
    └── audit-log.service.ts

tests/database/repositories/
├── tenant.repository.spec.ts
├── user.repository.spec.ts
├── transaction.repository.spec.ts
└── categorization.repository.spec.ts

src/shared/exceptions/
├── index.ts                      # Exports base.exception
└── base.exception.ts             # NotFoundException, ConflictException, DatabaseException, BusinessException
```

### Test Verification
- All tests run with: `pnpm test --runInBand`
- Current test count: 169 tests passing
- Real PostgreSQL database required (no mocks)

### CRITICAL PATTERNS TO FOLLOW

1. **Entity Files** - Export enums and interface:
```typescript
export enum EnumName {
  VALUE_ONE = 'VALUE_ONE',
  VALUE_TWO = 'VALUE_TWO',
}

export interface IEntityName {
  id: string;
  optionalField: string | null;  // Use string | null, NOT string?
  requiredField: string;
  createdAt: Date;
  updatedAt: Date;
}
```

2. **DTO Files** - Import enums from entity, NOT @prisma/client:
```typescript
import { EnumName } from '../entities/entity-name.entity';

export class CreateDto {
  @IsString()
  requiredField!: string;  // Required uses !

  @IsOptional()
  @IsString()
  optionalField?: string;  // Optional uses ?
}
```

3. **Repository Files** - Always use Logger, try/catch, custom exceptions:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ModelName, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, DatabaseException, BusinessException } from '../../shared/exceptions';

@Injectable()
export class EntityRepository {
  private readonly logger = new Logger(EntityRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  // All methods wrapped in try/catch with proper error handling
}
```

4. **Test Files** - CRITICAL cleanup order (FK constraints):
```typescript
import 'dotenv/config';  // MUST BE FIRST LINE

beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.payeePattern.deleteMany({});      // NEW - add this
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
});
```

5. **Prisma Error Codes**:
- P2002: Unique constraint violation (ConflictException)
- P2003: Foreign key constraint violation (NotFoundException)
- P2025: Record not found for connect operation (NotFoundException)

6. **ValidateIf Typing** - Must type the callback parameter:
```typescript
@ValidateIf((o: CreatePayeePatternDto) => o.isRecurring === true)
@IsInt()
expectedAmountCents?: number;
```
</critical_context>

<context>
This task creates the PayeePattern entity which stores learned patterns for automatic
transaction categorization. The system learns from user decisions and recurring transactions
to improve categorization accuracy over time. Each pattern includes the payee name pattern,
aliases (stored as JSONB array), default account code, and confidence boost. This enables
the AI categorization service to make better predictions based on historical patterns.

PayeePattern is tenant-scoped - each tenant has their own set of patterns learned from
their transaction history. Patterns can be for recurring transactions (monthly fees from
same payee) or general patterns (any transaction matching a payee name).
</context>

<input_context_files>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="entity_pattern">src/database/entities/categorization.entity.ts</file>
  <file purpose="dto_pattern">src/database/dto/categorization.dto.ts</file>
  <file purpose="repository_pattern">src/database/repositories/categorization.repository.ts</file>
  <file purpose="test_pattern">tests/database/repositories/categorization.repository.spec.ts</file>
  <file purpose="exceptions">src/shared/exceptions/base.exception.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed - Transaction entity exists ✓</check>
  <check>TASK-TRANS-002 completed - Categorization entity exists ✓</check>
  <check>Prisma CLI available: npx prisma --version</check>
  <check>Database running with all migrations applied</check>
  <check>All 169 existing tests passing: pnpm test --runInBand</check>
</prerequisites>

<scope>
  <in_scope>
    - Add PayeePattern model to Prisma schema with tenant relation
    - Update Tenant model with payeePatterns relation
    - Create migration for payee_patterns table
    - Create payee-pattern.entity.ts with IPayeePattern interface
    - Create payee-pattern.dto.ts with Create, Update, Filter DTOs
    - Create payee-pattern.repository.ts with 7 methods
    - Create payee-pattern.repository.spec.ts with 15+ tests
    - Update all index.ts files
    - Update ALL existing test files with new cleanup order
  </in_scope>
  <out_of_scope>
    - Pattern learning algorithm (TASK-TRANS-013)
    - Pattern matching logic (TASK-TRANS-012)
    - AI confidence calculation (TASK-TRANS-012)
    - Pattern suggestion UI (TASK-TRANS-033)
  </out_of_scope>
</scope>

<prisma_schema_additions>
Add to prisma/schema.prisma AFTER Categorization model:

```prisma
model PayeePattern {
  id                      String   @id @default(uuid())
  tenantId                String   @map("tenant_id")
  payeePattern            String   @map("payee_pattern") @db.VarChar(200)
  payeeAliases            Json     @default("[]") @map("payee_aliases")
  defaultAccountCode      String   @map("default_account_code") @db.VarChar(20)
  defaultAccountName      String   @map("default_account_name") @db.VarChar(100)
  confidenceBoost         Decimal  @default(0) @map("confidence_boost") @db.Decimal(5, 2)
  matchCount              Int      @default(0) @map("match_count")
  isRecurring             Boolean  @default(false) @map("is_recurring")
  expectedAmountCents     Int?     @map("expected_amount_cents")
  amountVariancePercent   Decimal? @map("amount_variance_percent") @db.Decimal(5, 2)
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  tenant                  Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, payeePattern])
  @@index([tenantId])
  @@map("payee_patterns")
}
```

Update Tenant model - add this line inside the model:
```prisma
  payeePatterns        PayeePattern[]
```
</prisma_schema_additions>

<files_to_create>

1. **src/database/entities/payee-pattern.entity.ts**
```typescript
/**
 * Payee Pattern Entity Types
 * TASK-TRANS-003: Payee Pattern Entity
 */

export interface IPayeePattern {
  id: string;
  tenantId: string;
  payeePattern: string;
  payeeAliases: string[];
  defaultAccountCode: string;
  defaultAccountName: string;
  confidenceBoost: number;
  matchCount: number;
  isRecurring: boolean;
  expectedAmountCents: number | null;
  amountVariancePercent: number | null;
  createdAt: Date;
  updatedAt: Date;
}
```

2. **src/database/dto/payee-pattern.dto.ts**
```typescript
import {
  IsUUID,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreatePayeePatternDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MaxLength(200)
  payeePattern!: string;

  @IsArray()
  @IsString({ each: true })
  payeeAliases!: string[];

  @IsString()
  @MaxLength(20)
  defaultAccountCode!: string;

  @IsString()
  @MaxLength(100)
  defaultAccountName!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceBoost?: number;

  @IsBoolean()
  isRecurring!: boolean;

  @ValidateIf((o: CreatePayeePatternDto) => o.isRecurring === true)
  @IsInt()
  expectedAmountCents?: number;

  @ValidateIf((o: CreatePayeePatternDto) => o.isRecurring === true)
  @IsNumber()
  @Min(0)
  @Max(100)
  amountVariancePercent?: number;
}

export class UpdatePayeePatternDto extends PartialType(CreatePayeePatternDto) {}

export class PayeePatternFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  accountCode?: string;
}
```

3. **src/database/repositories/payee-pattern.repository.ts**
Required methods:
- `create(dto: CreatePayeePatternDto): Promise<PayeePattern>`
- `findById(id: string): Promise<PayeePattern | null>`
- `findByTenant(tenantId: string, filter: PayeePatternFilterDto): Promise<PayeePattern[]>`
- `findByPayeeName(tenantId: string, payeeName: string): Promise<PayeePattern | null>`
- `incrementMatchCount(id: string): Promise<PayeePattern>`
- `update(id: string, dto: UpdatePayeePatternDto): Promise<PayeePattern>`
- `delete(id: string): Promise<void>`

Business validations:
- Recurring patterns MUST have expectedAmountCents (throw BusinessException)
- All queries for tenant data MUST filter by tenantId
- Unique constraint on (tenantId, payeePattern) - handle P2002 as ConflictException
- Foreign key to tenant - handle P2003 as NotFoundException

4. **tests/database/repositories/payee-pattern.repository.spec.ts**
Required tests (15+ minimum):
- Initialization test
- Create with all fields
- Create with minimum required fields
- Create recurring pattern with expectedAmountCents
- Throw BusinessException when recurring without expectedAmountCents
- Throw ConflictException on duplicate pattern per tenant
- Throw NotFoundException for non-existent tenant
- Find by ID (exists)
- Find by ID (not found)
- Find by tenant with filter
- Find by payee name (exact match)
- Find by payee name (alias match)
- Increment match count (atomic)
- Update pattern
- Update throws NotFoundException for non-existent
- Delete pattern
- Delete throws NotFoundException for non-existent
</files_to_create>

<files_to_modify>
1. **prisma/schema.prisma** - Add PayeePattern model, update Tenant with relation
2. **src/database/entities/index.ts** - Add: `export * from './payee-pattern.entity';`
3. **src/database/dto/index.ts** - Add: `export * from './payee-pattern.dto';`
4. **src/database/repositories/index.ts** - Add: `export * from './payee-pattern.repository';`
5. **tests/database/repositories/tenant.repository.spec.ts** - Add payeePattern cleanup
6. **tests/database/repositories/user.repository.spec.ts** - Add payeePattern cleanup
7. **tests/database/repositories/transaction.repository.spec.ts** - Add payeePattern cleanup
8. **tests/database/repositories/categorization.repository.spec.ts** - Add payeePattern cleanup
</files_to_modify>

<test_cleanup_order>
CRITICAL: All test files MUST clean tables in this exact order (FK constraints):
```typescript
await prisma.payeePattern.deleteMany({});      // NEW - leaf table
await prisma.categorization.deleteMany({});
await prisma.transaction.deleteMany({});
await prisma.user.deleteMany({});
await prisma.tenant.deleteMany({});
```
</test_cleanup_order>

<execution_steps>
1. Read existing files: prisma/schema.prisma, categorization.entity.ts, categorization.dto.ts, categorization.repository.ts, categorization.repository.spec.ts
2. Update prisma/schema.prisma:
   - Add PayeePattern model after Categorization
   - Add payeePatterns relation to Tenant model
3. Run: `npx prisma migrate dev --name create_payee_patterns`
4. Run: `npx prisma generate`
5. Create src/database/entities/payee-pattern.entity.ts
6. Update src/database/entities/index.ts
7. Create src/database/dto/payee-pattern.dto.ts
8. Update src/database/dto/index.ts
9. Create src/database/repositories/payee-pattern.repository.ts
10. Update src/database/repositories/index.ts
11. Update ALL 4 existing test files with new cleanup order
12. Create tests/database/repositories/payee-pattern.repository.spec.ts
13. Run: `pnpm run build`
14. Run: `pnpm run lint`
15. Run: `pnpm test --runInBand` (all tests must pass)
</execution_steps>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model PayeePattern { ... all fields as specified ... }
      // Tenant model has: payeePatterns PayeePattern[]
    </signature>
    <signature file="src/database/entities/payee-pattern.entity.ts">
      export interface IPayeePattern { ... all fields with string | null pattern ... }
    </signature>
    <signature file="src/database/dto/payee-pattern.dto.ts">
      export class CreatePayeePatternDto { ... with class-validator decorators ... }
      export class UpdatePayeePatternDto extends PartialType(CreatePayeePatternDto) {}
      export class PayeePatternFilterDto { ... }
    </signature>
    <signature file="src/database/repositories/payee-pattern.repository.ts">
      @Injectable()
      export class PayeePatternRepository {
        private readonly logger = new Logger(PayeePatternRepository.name);
        constructor(private readonly prisma: PrismaService) {}
        async create(dto: CreatePayeePatternDto): Promise&lt;PayeePattern&gt;
        async findById(id: string): Promise&lt;PayeePattern | null&gt;
        async findByTenant(tenantId: string, filter: PayeePatternFilterDto): Promise&lt;PayeePattern[]&gt;
        async findByPayeeName(tenantId: string, payeeName: string): Promise&lt;PayeePattern | null&gt;
        async incrementMatchCount(id: string): Promise&lt;PayeePattern&gt;
        async update(id: string, dto: UpdatePayeePatternDto): Promise&lt;PayeePattern&gt;
        async delete(id: string): Promise&lt;void&gt;
      }
    </signature>
    <signature file="tests/database/repositories/payee-pattern.repository.spec.ts">
      import 'dotenv/config';  // FIRST LINE
      describe('PayeePatternRepository', () => {
        // 15+ test cases
      });
    </signature>
  </signatures>

  <constraints>
    - NO 'any' type anywhere
    - NO mock data in tests - use real PostgreSQL database
    - Import enums from entity files, NOT from @prisma/client
    - Use string | null pattern, NOT string? in interfaces
    - Required DTO fields use !, optional use ?
    - All repository methods wrapped in try/catch with Logger
    - Use custom exceptions from src/shared/exceptions
    - Migration MUST be reversible
    - Unique constraint on (tenantId, payeePattern)
    - Recurring patterns require expectedAmountCents
    - Match count increment must be atomic
    - All queries must filter by tenantId for multi-tenant isolation
  </constraints>

  <verification>
    - npx prisma migrate dev --name create_payee_patterns (success)
    - npx prisma generate (success)
    - pnpm run build (0 TypeScript errors)
    - pnpm run lint (0 errors, 0 warnings)
    - pnpm test --runInBand (ALL tests pass, including 169 existing + 15+ new)
  </verification>
</definition_of_done>

<validation_criteria>
  <criterion>Migration creates payee_patterns table with all 12 columns</criterion>
  <criterion>JSONB column for payee_aliases created</criterion>
  <criterion>Foreign key to tenants table exists</criterion>
  <criterion>Unique index created for (tenantId, payeePattern)</criterion>
  <criterion>Index created for (tenantId)</criterion>
  <criterion>Repository always filters by tenantId</criterion>
  <criterion>JSONB array operations work correctly</criterion>
  <criterion>Recurring pattern validation enforces expectedAmountCents</criterion>
  <criterion>Match count increment is atomic</criterion>
  <criterion>All existing tests still pass (169 tests)</criterion>
  <criterion>All new payee pattern tests pass (15+ tests)</criterion>
  <criterion>Build completes with zero errors</criterion>
  <criterion>Lint passes with zero errors/warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_payee_patterns</command>
  <command>npx prisma generate</command>
  <command>pnpm run build</command>
  <command>pnpm run lint</command>
  <command>pnpm test --runInBand</command>
</test_commands>

<common_pitfalls>
1. **Forgetting to update cleanup order in ALL test files** - Will cause FK constraint errors
2. **Using string? instead of string | null in interface** - Inconsistent with codebase pattern
3. **Not typing ValidateIf callback** - ESLint will fail
4. **Using P2003 for connect errors** - Use P2025 for Prisma connect operation failures
5. **Importing enums from @prisma/client** - Import from entity files instead
6. **Not using Logger** - All repositories must have private readonly logger
7. **Not wrapping methods in try/catch** - All async methods need error handling
8. **Missing atomic increment** - Use Prisma's { increment: 1 } for matchCount
9. **Missing unique constraint handling** - P2002 should throw ConflictException
10. **Running tests without --runInBand** - Parallel tests cause database conflicts
</common_pitfalls>

</task_spec>
