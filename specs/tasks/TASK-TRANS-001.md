<task_spec id="TASK-TRANS-001" version="2.0">

<metadata>
  <title>Transaction Entity and Migration</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>5</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<context>
This task creates the Transaction entity which represents bank transactions imported
from bank feeds, CSV, or PDF files. Transactions are the core data that flows through
the categorization, payment matching, and reconciliation systems. Each transaction
belongs to a tenant and may link to categorizations and payments.

This is a REPOSITORY task (CRUD data access), not a SERVICE task (business logic).
Follow the exact patterns established in TenantRepository and UserRepository.
</context>

<!-- ============================================ -->
<!-- CRITICAL IMPLEMENTATION CONTEXT              -->
<!-- ============================================ -->

<critical_context>
## Current Codebase State (2025-12-20)

### Completed Tasks
- TASK-CORE-001: Project setup, NestJS, Prisma 7
- TASK-CORE-002: Tenant entity, repository, tests
- TASK-CORE-003: User entity, repository, tests
- TASK-CORE-004: AuditLog entity, service (immutable table)

### Existing Prisma Schema (prisma/schema.prisma)
```prisma
// Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction
// Models: Tenant, User, AuditLog
// The Tenant model needs to be updated to add: transactions Transaction[]
```

### Migrations Applied
1. 20251219225823_create_tenants
2. 20251219233350_create_users
3. 20251220000830_create_audit_logs

### Key Patterns MUST Follow

**1. Prisma Schema Pattern**
- Use camelCase for field names
- Use @map("snake_case") for database columns
- Add @db.VarChar(n) for string length constraints
- Use @updatedAt for auto-updated timestamps
- Place enums BEFORE models in schema file
- Use @@map("table_name") at end of model

**2. Entity Interface Pattern** (src/database/entities/)
- Export enums with explicit string values: `PENDING = 'PENDING'`
- Export interface with I prefix: `export interface ITransaction`
- Use `string | null` for nullable fields, NOT `string?`
- Import pattern: `export * from './transaction.entity';` in index.ts

**3. DTO Pattern** (src/database/dto/)
- Use class-validator decorators (@IsString, @IsUUID, @IsEnum, etc.)
- Required fields use `!`: `tenantId!: string`
- Optional fields use `?`: `payeeName?: string`
- Use `PartialType(CreateTransactionDto)` for UpdateDto
- Import enums from entity file, NOT Prisma

**4. Repository Pattern** (src/database/repositories/)
- Inject PrismaService via constructor
- Use Logger: `private readonly logger = new Logger(TransactionRepository.name)`
- EVERY method wrapped in try/catch
- Log errors with full context: `this.logger.error(\`Failed to...\`, error.stack)`
- Throw specific exceptions: NotFoundException, ConflictException, DatabaseException
- ALWAYS filter by tenantId for multi-tenant isolation

**5. Test Pattern** (tests/database/repositories/)
- Import 'dotenv/config' FIRST
- Use REAL database, NO mocks
- Clean up data in beforeEach
- Import enums from entity file
- Test error cases with real constraint violations

**6. Module Updates**
- Add to providers AND exports in database.module.ts
- Add export in repositories/index.ts

### Critical Type Information for Prisma 7

**For JSON fields (if any):**
- In service/repository params: Use `Prisma.InputJsonValue`
- For null JSON values in create: Use `Prisma.DbNull`
- Never use `Record<string, unknown>` directly in Prisma create operations

**Import from @prisma/client:**
```typescript
import { Transaction, Prisma } from '@prisma/client';
```
</critical_context>

<!-- ============================================ -->
<!-- INPUT FILES                                  -->
<!-- ============================================ -->

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md</file>
  <file purpose="naming_conventions">specs/constitution.md</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="tenant_entity_pattern">src/database/entities/tenant.entity.ts</file>
  <file purpose="tenant_dto_pattern">src/database/dto/tenant.dto.ts</file>
  <file purpose="tenant_repository_pattern">src/database/repositories/tenant.repository.ts</file>
  <file purpose="user_repository_pattern">src/database/repositories/user.repository.ts</file>
  <file purpose="test_pattern">tests/database/repositories/tenant.repository.spec.ts</file>
  <file purpose="exception_classes">src/shared/exceptions/base.exception.ts</file>
  <file purpose="database_module">src/database/database.module.ts</file>
</input_context_files>

<prerequisites>
  <check>prisma/schema.prisma exists with Tenant and User models</check>
  <check>src/database/entities/tenant.entity.ts exists</check>
  <check>src/database/repositories/tenant.repository.ts exists</check>
  <check>tests/database/repositories/ directory exists</check>
  <check>DATABASE_URL environment variable is set</check>
  <check>pnpm install completed successfully</check>
</prerequisites>

<scope>
  <in_scope>
    - Add ImportSource and TransactionStatus enums to Prisma schema
    - Add Transaction model to Prisma schema
    - Update Tenant model with transactions relation
    - Create database migration for transactions table
    - Create TypeScript interface and enums in transaction.entity.ts
    - Create CreateTransactionDto, UpdateTransactionDto, TransactionFilterDto
    - Create TransactionRepository with multi-tenant isolation
    - Create comprehensive integration tests using real database
    - Update all index files and database module
  </in_scope>
  <out_of_scope>
    - Categorization entity (TASK-TRANS-002)
    - Payment entity (TASK-PAY-001)
    - Import logic (TASK-TRANS-011)
    - Categorization logic (TASK-TRANS-012)
    - API endpoints (later tasks)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- EXACT IMPLEMENTATION                         -->
<!-- ============================================ -->

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      // ADD after AuditAction enum (line ~42)
      enum ImportSource {
        BANK_FEED
        CSV_IMPORT
        PDF_IMPORT
        MANUAL
      }

      enum TransactionStatus {
        PENDING
        CATEGORIZED
        REVIEW_REQUIRED
        SYNCED
      }

      // ADD after AuditLog model (line ~115)
      model Transaction {
        id                  String            @id @default(uuid())
        tenantId            String            @map("tenant_id")
        xeroTransactionId   String?           @unique @map("xero_transaction_id")
        bankAccount         String            @map("bank_account") @db.VarChar(50)
        date                DateTime          @db.Date
        description         String
        payeeName           String?           @map("payee_name") @db.VarChar(200)
        reference           String?           @db.VarChar(100)
        amountCents         Int               @map("amount_cents")
        isCredit            Boolean           @map("is_credit")
        source              ImportSource
        importBatchId       String?           @map("import_batch_id")
        status              TransactionStatus @default(PENDING)
        isReconciled        Boolean           @default(false) @map("is_reconciled")
        reconciledAt        DateTime?         @map("reconciled_at")
        isDeleted           Boolean           @default(false) @map("is_deleted")
        deletedAt           DateTime?         @map("deleted_at")
        createdAt           DateTime          @default(now()) @map("created_at")
        updatedAt           DateTime          @updatedAt @map("updated_at")

        tenant              Tenant            @relation(fields: [tenantId], references: [id])

        @@index([tenantId, date])
        @@index([tenantId, status])
        @@index([tenantId, payeeName])
        @@index([tenantId, isReconciled])
        @@map("transactions")
      }

      // UPDATE Tenant model - add relation (after users User[]):
      transactions Transaction[]
    </signature>

    <signature file="src/database/entities/transaction.entity.ts">
      /**
       * Transaction Entity Types
       * TASK-TRANS-001: Transaction Entity and Migration
       */

      export enum ImportSource {
        BANK_FEED = 'BANK_FEED',
        CSV_IMPORT = 'CSV_IMPORT',
        PDF_IMPORT = 'PDF_IMPORT',
        MANUAL = 'MANUAL',
      }

      export enum TransactionStatus {
        PENDING = 'PENDING',
        CATEGORIZED = 'CATEGORIZED',
        REVIEW_REQUIRED = 'REVIEW_REQUIRED',
        SYNCED = 'SYNCED',
      }

      export interface ITransaction {
        id: string;
        tenantId: string;
        xeroTransactionId: string | null;
        bankAccount: string;
        date: Date;
        description: string;
        payeeName: string | null;
        reference: string | null;
        amountCents: number;
        isCredit: boolean;
        source: ImportSource;
        importBatchId: string | null;
        status: TransactionStatus;
        isReconciled: boolean;
        reconciledAt: Date | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>

    <signature file="src/database/dto/transaction.dto.ts">
      import {
        IsUUID,
        IsString,
        IsDate,
        IsInt,
        IsBoolean,
        IsEnum,
        IsOptional,
        MinLength,
        MaxLength,
        Min,
        Max,
      } from 'class-validator';
      import { Type } from 'class-transformer';
      import { PartialType } from '@nestjs/mapped-types';
      import { ImportSource, TransactionStatus } from '../entities/transaction.entity';

      export class CreateTransactionDto {
        @IsUUID()
        tenantId!: string;

        @IsOptional()
        @IsString()
        @MaxLength(50)
        xeroTransactionId?: string;

        @IsString()
        @MinLength(1)
        @MaxLength(50)
        bankAccount!: string;

        @Type(() => Date)
        @IsDate()
        date!: Date;

        @IsString()
        @MinLength(1)
        description!: string;

        @IsOptional()
        @IsString()
        @MaxLength(200)
        payeeName?: string;

        @IsOptional()
        @IsString()
        @MaxLength(100)
        reference?: string;

        @IsInt()
        amountCents!: number;

        @IsBoolean()
        isCredit!: boolean;

        @IsEnum(ImportSource)
        source!: ImportSource;

        @IsOptional()
        @IsUUID()
        importBatchId?: string;
      }

      export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {
        @IsOptional()
        @IsEnum(TransactionStatus)
        status?: TransactionStatus;

        @IsOptional()
        @IsBoolean()
        isReconciled?: boolean;

        @IsOptional()
        @Type(() => Date)
        @IsDate()
        reconciledAt?: Date;
      }

      export class TransactionFilterDto {
        @IsOptional()
        @IsEnum(TransactionStatus)
        status?: TransactionStatus;

        @IsOptional()
        @Type(() => Date)
        @IsDate()
        dateFrom?: Date;

        @IsOptional()
        @Type(() => Date)
        @IsDate()
        dateTo?: Date;

        @IsOptional()
        @IsBoolean()
        isReconciled?: boolean;

        @IsOptional()
        @IsString()
        search?: string;

        @IsOptional()
        @IsInt()
        @Min(1)
        page?: number = 1;

        @IsOptional()
        @IsInt()
        @Min(1)
        @Max(100)
        limit?: number = 20;
      }
    </signature>

    <signature file="src/database/repositories/transaction.repository.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { Transaction, Prisma } from '@prisma/client';
      import { PrismaService } from '../prisma/prisma.service';
      import { CreateTransactionDto, UpdateTransactionDto, TransactionFilterDto } from '../dto/transaction.dto';
      import { NotFoundException, ConflictException, DatabaseException } from '../../shared/exceptions';

      export interface PaginatedResult&lt;T&gt; {
        data: T[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }

      @Injectable()
      export class TransactionRepository {
        private readonly logger = new Logger(TransactionRepository.name);

        constructor(private readonly prisma: PrismaService) {}

        // ALL methods must filter by tenantId for multi-tenant isolation
        // ALL methods must check isDeleted: false (soft delete pattern)
        // ALL methods must have try/catch with proper error logging

        async create(dto: CreateTransactionDto): Promise&lt;Transaction&gt;
        async findById(tenantId: string, id: string): Promise&lt;Transaction | null&gt;
        async findByTenant(tenantId: string, filter: TransactionFilterDto): Promise&lt;PaginatedResult&lt;Transaction&gt;&gt;
        async findPending(tenantId: string): Promise&lt;Transaction[]&gt;
        async update(tenantId: string, id: string, dto: UpdateTransactionDto): Promise&lt;Transaction&gt;
        async softDelete(tenantId: string, id: string): Promise&lt;void&gt;
        async markReconciled(tenantId: string, id: string): Promise&lt;Transaction&gt;
      }
    </signature>
  </signatures>

  <constraints>
    - MUST use tenant_id for multi-tenant isolation
    - ALL repository queries MUST filter by tenantId
    - MUST store amounts in cents (integer) - NEVER decimals
    - MUST use soft delete (isDeleted flag) - NEVER hard delete transactions
    - MUST NOT use 'any' type anywhere
    - Migration MUST be reversible
    - MUST have indexes for common query patterns
    - Error handling: FAIL FAST with DatabaseException, NOT silent failures
    - ABSOLUTELY NO BACKWARDS COMPATIBILITY - errors must be thrown, not hidden
    - ABSOLUTELY NO MOCK DATA in tests - use real database
  </constraints>

  <verification>
    - npx prisma validate passes
    - npx prisma migrate dev --name create_transactions runs without error
    - pnpm run build compiles without errors
    - pnpm run lint passes with 0 warnings
    - pnpm run test passes all tests
    - Repository queries always include tenantId filter
    - Soft delete sets isDeleted=true and deletedAt timestamp
  </verification>
</definition_of_done>

<!-- ============================================ -->
<!-- FILES TO CREATE/MODIFY                       -->
<!-- ============================================ -->

<files_to_create>
  <file path="src/database/entities/transaction.entity.ts">
    Transaction interface, ImportSource enum, TransactionStatus enum
  </file>
  <file path="src/database/dto/transaction.dto.ts">
    CreateTransactionDto, UpdateTransactionDto, TransactionFilterDto
  </file>
  <file path="src/database/repositories/transaction.repository.ts">
    TransactionRepository with all CRUD operations + pagination + soft delete
  </file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_transactions/migration.sql">
    Auto-generated by Prisma
  </file>
  <file path="tests/database/repositories/transaction.repository.spec.ts">
    Comprehensive tests using REAL database
  </file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">
    Add ImportSource enum, TransactionStatus enum, Transaction model.
    Update Tenant model with transactions relation.
  </file>
  <file path="src/database/entities/index.ts">
    Add: export * from './transaction.entity';
  </file>
  <file path="src/database/dto/index.ts">
    Add: export * from './transaction.dto';
  </file>
  <file path="src/database/repositories/index.ts">
    Add: export * from './transaction.repository';
  </file>
  <file path="src/database/database.module.ts">
    Add TransactionRepository to providers and exports arrays
  </file>
</files_to_modify>

<!-- ============================================ -->
<!-- TEST REQUIREMENTS                            -->
<!-- ============================================ -->

<test_requirements>
## Test File: tests/database/repositories/transaction.repository.spec.ts

### Setup Pattern
```typescript
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CreateTransactionDto } from '../../../src/database/dto/transaction.dto';
import { ImportSource, TransactionStatus } from '../../../src/database/entities/transaction.entity';
import { NotFoundException } from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('TransactionRepository', () => {
  let repository: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, TransactionRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<TransactionRepository>(TransactionRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean in correct order: transactions -> users -> tenants
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@test.co.za`,
      },
    });
  });
});
```

### Required Test Cases
1. create() - Creates transaction with all fields
2. create() - Creates transaction with minimum required fields
3. create() - Throws NotFoundException for non-existent tenant
4. create() - Throws ConflictException for duplicate xeroTransactionId
5. findById() - Returns transaction if exists
6. findById() - Returns null if not found
7. findById() - Returns null for different tenant (isolation)
8. findByTenant() - Returns paginated results
9. findByTenant() - Filters by status
10. findByTenant() - Filters by date range
11. findByTenant() - Excludes soft-deleted transactions
12. findPending() - Returns only PENDING transactions
13. update() - Updates transaction fields
14. update() - Throws NotFoundException for non-existent transaction
15. update() - Throws NotFoundException for wrong tenant (isolation)
16. softDelete() - Sets isDeleted and deletedAt
17. softDelete() - Throws NotFoundException for non-existent transaction
18. markReconciled() - Sets isReconciled and reconciledAt

### Test Data (South African Context)
```typescript
const testTransactionData: CreateTransactionDto = {
  tenantId: '', // Set in beforeEach
  bankAccount: 'FNB Cheque',
  date: new Date('2024-01-15'),
  description: 'EFT PAYMENT: SMITH J - Monthly Fees',
  payeeName: 'SMITH J',
  reference: 'Jan2024',
  amountCents: 250000, // R2,500.00
  isCredit: true,
  source: ImportSource.BANK_FEED,
};
```
</test_requirements>

<!-- ============================================ -->
<!-- EXECUTION COMMANDS                           -->
<!-- ============================================ -->

<test_commands>
  <command>npx prisma validate</command>
  <command>npx prisma migrate dev --name create_transactions</command>
  <command>npx prisma generate</command>
  <command>pnpm run build</command>
  <command>pnpm run lint</command>
  <command>pnpm run test</command>
</test_commands>

<!-- ============================================ -->
<!-- VALIDATION CRITERIA                          -->
<!-- ============================================ -->

<validation_criteria>
  <criterion>Migration creates transactions table with all 18 columns</criterion>
  <criterion>All 5 indexes created for performance</criterion>
  <criterion>Foreign key to tenants table exists and enforced</criterion>
  <criterion>xeroTransactionId unique constraint exists</criterion>
  <criterion>Soft delete works (isDeleted + deletedAt)</criterion>
  <criterion>Repository ALWAYS filters by tenantId</criterion>
  <criterion>Repository ALWAYS excludes isDeleted: true</criterion>
  <criterion>Pagination works correctly with total count</criterion>
  <criterion>All 18+ tests pass</criterion>
  <criterion>Build completes with 0 errors</criterion>
  <criterion>Lint completes with 0 warnings</criterion>
</validation_criteria>

</task_spec>
