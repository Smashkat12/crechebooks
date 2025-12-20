<task_spec id="TASK-TRANS-002" version="2.0">

<metadata>
  <title>Categorization Entity and Types</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>6</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<critical_context>
TASK-TRANS-001 is COMPLETE. The Transaction entity exists with all relations.

Current prisma/schema.prisma state includes:
- Enums: TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource, TransactionStatus
- Models: Tenant, User, AuditLog, Transaction

You MUST add to schema.prisma:
- enum VatType { STANDARD, ZERO_RATED, EXEMPT, NO_VAT }
- enum CategorizationSource { AI_AUTO, AI_SUGGESTED, USER_OVERRIDE, RULE_BASED }
- model Categorization (full definition below)
- Add relation field to Transaction: categorizations Categorization[]
- Add relation field to User: reviewedCategorizations Categorization[]

FOLLOW EXACT PATTERNS from these files:
- src/database/entities/transaction.entity.ts (enum and interface patterns)
- src/database/dto/transaction.dto.ts (DTO patterns with class-validator)
- src/database/repositories/transaction.repository.ts (repository patterns)
- tests/database/repositories/transaction.repository.spec.ts (test patterns)
</critical_context>

<context>
This task creates the Categorization entity which stores AI-generated and user-reviewed
categorization decisions for transactions. Each categorization links to a transaction and
includes confidence scores, reasoning, VAT handling, and split transaction support.
Categorizations can be created automatically by AI, suggested to users, or manually
overridden. This is a critical component for the automated accounting workflow.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Categorization</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="entity_pattern">src/database/entities/transaction.entity.ts</file>
  <file purpose="dto_pattern">src/database/dto/transaction.dto.ts</file>
  <file purpose="repository_pattern">src/database/repositories/transaction.repository.ts</file>
  <file purpose="test_pattern">tests/database/repositories/transaction.repository.spec.ts</file>
  <file purpose="exceptions">src/shared/exceptions/base.exception.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed - Transaction entity exists in schema</check>
  <check>Prisma CLI available: npx prisma --version</check>
  <check>Database has transactions table: npx prisma db pull</check>
</prerequisites>

<scope>
  <in_scope>
    - Add VatType enum to Prisma schema
    - Add CategorizationSource enum to Prisma schema
    - Create Categorization model with transaction and user relations
    - Update Transaction model with categorizations relation
    - Update User model with reviewedCategorizations relation
    - Create migration for categorizations table
    - Create categorization.entity.ts with enums and ICategorization interface
    - Create categorization.dto.ts with Create, Update, Review, Filter DTOs
    - Create categorization.repository.ts with CRUD methods
    - Create categorization.repository.spec.ts with real database tests
    - Update index.ts files to export new modules
  </in_scope>
  <out_of_scope>
    - Categorization AI logic (TASK-TRANS-012)
    - Pattern learning (TASK-TRANS-013)
    - Xero account code integration (TASK-TRANS-014)
    - User review UI (TASK-TRANS-033)
  </out_of_scope>
</scope>

<exact_code_patterns>

PATTERN 1 - Entity file (src/database/entities/categorization.entity.ts):
```typescript
/**
 * Categorization Entity Types
 * TASK-TRANS-002: Categorization Entity and Types
 */

export enum VatType {
  STANDARD = 'STANDARD',
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}

export enum CategorizationSource {
  AI_AUTO = 'AI_AUTO',
  AI_SUGGESTED = 'AI_SUGGESTED',
  USER_OVERRIDE = 'USER_OVERRIDE',
  RULE_BASED = 'RULE_BASED',
}

export interface ICategorization {
  id: string;
  transactionId: string;
  accountCode: string;
  accountName: string;
  confidenceScore: number;  // Decimal in DB, number in TS
  reasoning: string | null;  // Use string | null, NOT string?
  source: CategorizationSource;
  isSplit: boolean;
  splitAmountCents: number | null;
  vatAmountCents: number | null;
  vatType: VatType;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

PATTERN 2 - DTO file (src/database/dto/categorization.dto.ts):
```typescript
import {
  IsUUID,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsDate,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { VatType, CategorizationSource } from '../entities/categorization.entity';

export class CreateCategorizationDto {
  @IsUUID()
  transactionId!: string;  // Required fields use !

  @IsString()
  @MaxLength(20)
  accountCode!: string;

  @IsString()
  @MaxLength(100)
  accountName!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceScore!: number;

  @IsOptional()
  @IsString()
  reasoning?: string;  // Optional fields use ?

  @IsEnum(CategorizationSource)
  source!: CategorizationSource;

  @IsBoolean()
  isSplit!: boolean;

  @ValidateIf(o => o.isSplit === true)
  @IsInt()
  splitAmountCents?: number;

  @ValidateIf(o => o.vatType === VatType.STANDARD)
  @IsInt()
  vatAmountCents?: number;

  @IsEnum(VatType)
  vatType!: VatType;
}

export class UpdateCategorizationDto extends PartialType(CreateCategorizationDto) {}

export class ReviewCategorizationDto {
  @IsUUID()
  reviewedBy!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string;

  @IsOptional()
  @IsEnum(VatType)
  vatType?: VatType;
}

export class CategorizationFilterDto {
  @IsOptional()
  @IsEnum(CategorizationSource)
  source?: CategorizationSource;

  @IsOptional()
  @IsEnum(VatType)
  vatType?: VatType;

  @IsOptional()
  @IsBoolean()
  needsReview?: boolean;

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
```

PATTERN 3 - Repository file (src/database/repositories/categorization.repository.ts):
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Categorization, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategorizationDto,
  UpdateCategorizationDto,
  ReviewCategorizationDto,
  CategorizationFilterDto,
} from '../dto/categorization.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';
import { CategorizationSource, VatType } from '../entities/categorization.entity';

@Injectable()
export class CategorizationRepository {
  private readonly logger = new Logger(CategorizationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategorizationDto): Promise<Categorization> {
    try {
      // Business validation
      this.validateSplitTransaction(dto);
      this.validateVatCalculation(dto);

      return await this.prisma.categorization.create({
        data: dto,
      });
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(
        `Failed to create categorization: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Transaction', dto.transactionId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create categorization',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ... other methods follow same pattern

  private validateSplitTransaction(dto: CreateCategorizationDto): void {
    if (dto.isSplit && dto.splitAmountCents === undefined) {
      throw new BusinessException(
        'SPLIT_AMOUNT_REQUIRED',
        'Split transactions require splitAmountCents',
      );
    }
  }

  private validateVatCalculation(dto: CreateCategorizationDto): void {
    if (dto.vatType === VatType.STANDARD && dto.vatAmountCents === undefined) {
      throw new BusinessException(
        'VAT_AMOUNT_REQUIRED',
        'STANDARD VAT type requires vatAmountCents',
      );
    }
  }
}
```

PATTERN 4 - Test file (tests/database/repositories/categorization.repository.spec.ts):
```typescript
import 'dotenv/config';  // MUST BE FIRST LINE
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CreateCategorizationDto } from '../../../src/database/dto/categorization.dto';
import { VatType, CategorizationSource } from '../../../src/database/entities/categorization.entity';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import { NotFoundException, BusinessException } from '../../../src/shared/exceptions';
import { Tenant, User, Transaction } from '@prisma/client';

describe('CategorizationRepository', () => {
  let repository: CategorizationRepository;
  let transactionRepository: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;
  let testTransaction: Transaction;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, CategorizationRepository, TransactionRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<CategorizationRepository>(CategorizationRepository);
    transactionRepository = module.get<TransactionRepository>(TransactionRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - categorizations first!
    await prisma.categorization.deleteMany({});
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

    // Create test user (for reviewer)
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        auth0Id: `auth0|test${Date.now()}`,
        email: `user${Date.now()}@test.co.za`,
        name: 'Test User',
        role: 'ADMIN',
      },
    });

    // Create test transaction
    testTransaction = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB Cheque',
        date: new Date('2024-01-15'),
        description: 'Test Transaction',
        amountCents: 100000,
        isCredit: true,
        source: 'BANK_FEED',
      },
    });
  });

  // Test cases follow...
});
```

</exact_code_patterns>

<prisma_schema_additions>
Add these to prisma/schema.prisma AFTER existing enums:

```prisma
enum VatType {
  STANDARD
  ZERO_RATED
  EXEMPT
  NO_VAT
}

enum CategorizationSource {
  AI_AUTO
  AI_SUGGESTED
  USER_OVERRIDE
  RULE_BASED
}
```

Add this model AFTER Transaction model:

```prisma
model Categorization {
  id                  String               @id @default(uuid())
  transactionId       String               @map("transaction_id")
  accountCode         String               @map("account_code") @db.VarChar(20)
  accountName         String               @map("account_name") @db.VarChar(100)
  confidenceScore     Decimal              @map("confidence_score") @db.Decimal(5, 2)
  reasoning           String?
  source              CategorizationSource
  isSplit             Boolean              @default(false) @map("is_split")
  splitAmountCents    Int?                 @map("split_amount_cents")
  vatAmountCents      Int?                 @map("vat_amount_cents")
  vatType             VatType              @default(STANDARD) @map("vat_type")
  reviewedBy          String?              @map("reviewed_by")
  reviewedAt          DateTime?            @map("reviewed_at")
  createdAt           DateTime             @default(now()) @map("created_at")
  updatedAt           DateTime             @updatedAt @map("updated_at")

  transaction         Transaction          @relation(fields: [transactionId], references: [id])
  reviewer            User?                @relation("ReviewedCategorizations", fields: [reviewedBy], references: [id])

  @@index([transactionId])
  @@index([accountCode])
  @@map("categorizations")
}
```

Update Transaction model - add this line inside the model:
```prisma
  categorizations     Categorization[]
```

Update User model - add this line inside the model:
```prisma
  reviewedCategorizations Categorization[] @relation("ReviewedCategorizations")
```
</prisma_schema_additions>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      enum VatType { STANDARD, ZERO_RATED, EXEMPT, NO_VAT }
      enum CategorizationSource { AI_AUTO, AI_SUGGESTED, USER_OVERRIDE, RULE_BASED }
      model Categorization { ... all fields as specified ... }
      // Transaction model has: categorizations Categorization[]
      // User model has: reviewedCategorizations Categorization[] @relation("ReviewedCategorizations")
    </signature>
    <signature file="src/database/entities/categorization.entity.ts">
      export enum VatType { STANDARD = 'STANDARD', ... }
      export enum CategorizationSource { AI_AUTO = 'AI_AUTO', ... }
      export interface ICategorization { id: string; ... all fields with string | null pattern ... }
    </signature>
    <signature file="src/database/dto/categorization.dto.ts">
      import { VatType, CategorizationSource } from '../entities/categorization.entity';
      export class CreateCategorizationDto { ... with class-validator decorators ... }
      export class UpdateCategorizationDto extends PartialType(CreateCategorizationDto) {}
      export class ReviewCategorizationDto { reviewedBy!: string; ... }
      export class CategorizationFilterDto { source?: CategorizationSource; ... }
    </signature>
    <signature file="src/database/repositories/categorization.repository.ts">
      @Injectable()
      export class CategorizationRepository {
        private readonly logger = new Logger(CategorizationRepository.name);
        constructor(private readonly prisma: PrismaService) {}
        async create(dto: CreateCategorizationDto): Promise<Categorization>
        async findById(id: string): Promise<Categorization | null>
        async findByTransaction(transactionId: string): Promise<Categorization[]>
        async findPendingReview(tenantId: string): Promise<Categorization[]>
        async review(id: string, dto: ReviewCategorizationDto): Promise<Categorization>
        async update(id: string, dto: UpdateCategorizationDto): Promise<Categorization>
        async delete(id: string): Promise<void>
        private validateSplitTransaction(dto: CreateCategorizationDto): void
        private validateVatCalculation(dto: CreateCategorizationDto): void
      }
    </signature>
    <signature file="src/database/entities/index.ts">
      export * from './categorization.entity';
    </signature>
    <signature file="src/database/dto/index.ts">
      export * from './categorization.dto';
    </signature>
    <signature file="tests/database/repositories/categorization.repository.spec.ts">
      import 'dotenv/config';  // FIRST LINE
      describe('CategorizationRepository', () => {
        // 15+ test cases for CRUD, validation, relations
      });
    </signature>
  </signatures>

  <constraints>
    - NO 'any' type anywhere
    - NO mock data in tests - use real PostgreSQL database
    - Import enums from entity files, NOT from @prisma/client
    - Use string | null pattern, NOT string? in interfaces
    - Required DTO fields use !, optional use ?
    - All repository methods wrapped in try/catch with proper error logging
    - Use custom exceptions from src/shared/exceptions
    - Migration MUST be reversible
    - Confidence score: 0-100 as Decimal(5,2)
    - Split validation: isSplit=true requires splitAmountCents
    - VAT validation: STANDARD vatType requires vatAmountCents
    - USER_OVERRIDE source requires reviewedBy and reviewedAt
  </constraints>

  <verification>
    - npx prisma migrate dev --name create_categorizations (success)
    - npx prisma generate (regenerate client after migration)
    - pnpm run build (no TypeScript errors)
    - pnpm run test -- --runInBand (all tests pass)
    - Migration reverts: npx prisma migrate reset (success)
  </verification>
</definition_of_done>

<files_to_create>
  <file path="src/database/entities/categorization.entity.ts">VatType enum, CategorizationSource enum, ICategorization interface</file>
  <file path="src/database/dto/categorization.dto.ts">CreateCategorizationDto, UpdateCategorizationDto, ReviewCategorizationDto, CategorizationFilterDto</file>
  <file path="src/database/repositories/categorization.repository.ts">CategorizationRepository with 7 methods + 2 validation helpers</file>
  <file path="tests/database/repositories/categorization.repository.spec.ts">15+ integration tests using real database</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add VatType enum, CategorizationSource enum, Categorization model; update Transaction and User relations</file>
  <file path="src/database/entities/index.ts">Add: export * from './categorization.entity';</file>
  <file path="src/database/dto/index.ts">Add: export * from './categorization.dto';</file>
  <file path="tests/database/repositories/tenant.repository.spec.ts">Update cleanup order: add categorizations.deleteMany first</file>
  <file path="tests/database/repositories/user.repository.spec.ts">Update cleanup order: add categorizations.deleteMany first</file>
  <file path="tests/database/repositories/transaction.repository.spec.ts">Update cleanup order: add categorizations.deleteMany first</file>
</files_to_modify>

<test_cleanup_order>
CRITICAL: Tests MUST clean tables in this order due to FK constraints:
1. await prisma.categorization.deleteMany({});
2. await prisma.transaction.deleteMany({});
3. await prisma.user.deleteMany({});
4. await prisma.tenant.deleteMany({});
</test_cleanup_order>

<execution_steps>
1. Read all input_context_files to understand patterns
2. Update prisma/schema.prisma with enums, model, and relation updates
3. Run: npx prisma migrate dev --name create_categorizations
4. Run: npx prisma generate (CRITICAL - regenerate client)
5. Create src/database/entities/categorization.entity.ts
6. Update src/database/entities/index.ts
7. Create src/database/dto/categorization.dto.ts
8. Update src/database/dto/index.ts
9. Create src/database/repositories/categorization.repository.ts
10. Update existing test files with new cleanup order
11. Create tests/database/repositories/categorization.repository.spec.ts
12. Run: pnpm run build (verify no errors)
13. Run: pnpm run test -- --runInBand (verify all pass)
</execution_steps>

<test_commands>
  <command>npx prisma migrate dev --name create_categorizations</command>
  <command>npx prisma generate</command>
  <command>pnpm run build</command>
  <command>pnpm run test -- --runInBand</command>
</test_commands>

<validation_criteria>
  <criterion>Migration creates categorizations table with all 14 columns</criterion>
  <criterion>VatType enum created with 4 values</criterion>
  <criterion>CategorizationSource enum created with 4 values</criterion>
  <criterion>FK constraint to transactions table exists</criterion>
  <criterion>FK constraint to users table exists (nullable for reviewer)</criterion>
  <criterion>Indexes created: transactionId, accountCode</criterion>
  <criterion>Split transaction validation throws BusinessException when invalid</criterion>
  <criterion>VAT calculation validation throws BusinessException when invalid</criterion>
  <criterion>Review workflow updates source to USER_OVERRIDE</criterion>
  <criterion>All existing tests still pass (tenant, user, transaction repos)</criterion>
  <criterion>All new categorization tests pass (15+ tests)</criterion>
  <criterion>Build completes with zero errors</criterion>
</validation_criteria>

</task_spec>
