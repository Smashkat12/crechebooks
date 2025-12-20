<task_spec id="TASK-BILL-002" version="2.0">

<metadata>
  <title>Fee Structure and Enrollment Entities</title>
  <status>complete</status>
  <layer>foundation</layer>
  <sequence>9</sequence>
  <implements>
    <requirement_ref>REQ-BILL-005</requirement_ref>
    <requirement_ref>REQ-BILL-009</requirement_ref>
    <requirement_ref>REQ-BILL-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<!-- ================================================================== -->
<!-- CRITICAL CONTEXT FOR AI AGENT                                      -->
<!-- You have NO prior context. Read this section completely.           -->
<!-- ================================================================== -->

<ai_agent_context>
  <project_state>
    <completed_tasks>8 of 62 (12.9%)</completed_tasks>
    <passing_tests>247</passing_tests>
    <last_commit>b2c5986 - feat(database): implement Parent and Child entities (TASK-BILL-001)</last_commit>
    <foundation_layer_progress>53.3% complete</foundation_layer_progress>
    <completed_task_list>
      - TASK-CORE-001: Project Setup
      - TASK-CORE-002: Tenant Entity
      - TASK-CORE-003: User Entity
      - TASK-CORE-004: Audit Log Entity
      - TASK-TRANS-001: Transaction Entity
      - TASK-TRANS-002: Categorization Entity
      - TASK-TRANS-003: PayeePattern Entity
      - TASK-BILL-001: Parent and Child Entities
    </completed_task_list>
  </project_state>

  <technology_stack>
    <runtime>Node.js 20+</runtime>
    <framework>NestJS 11</framework>
    <orm>Prisma 7 with PostgreSQL adapter (via prisma.config.ts)</orm>
    <package_manager>pnpm (NEVER use npm)</package_manager>
    <testing>Jest with --runInBand flag</testing>
    <validation>class-validator</validation>
  </technology_stack>

  <critical_patterns>
    <pattern name="Repository Pattern">
      - Use @Injectable() decorator
      - Inject PrismaService via constructor
      - Use private readonly logger = new Logger(ClassName.name)
      - Import custom exceptions from '../../shared/exceptions'
      - Import Prisma types from '@prisma/client'
    </pattern>

    <pattern name="Error Handling - FAIL FAST">
      - NEVER use empty catch blocks
      - NEVER silently swallow errors
      - ALWAYS log with this.logger.error() BEFORE throwing
      - ALWAYS throw typed exceptions (NotFoundException, ConflictException, DatabaseException)
      - Check P2002 for unique constraint violations -> throw ConflictException
      - Check P2003 for foreign key violations -> throw NotFoundException
      - Check P2025 for nested connect operations -> throw NotFoundException
      - Wrap unknown errors in DatabaseException
    </pattern>

    <pattern name="Multi-Tenant Isolation">
      - EVERY query MUST include tenantId in WHERE clause
      - Repository methods that query often take tenantId as first parameter
      - Indexes MUST include tenantId as first column
    </pattern>

    <pattern name="Prisma Schema Conventions">
      - Use @map("snake_case") for column names
      - Use @@map("table_name") for table names
      - Use @db.VarChar(N) for string length limits
      - Use @db.Decimal(precision, scale) for decimal values
      - Use @db.Date for date-only fields (no time component)
      - Use @default(uuid()) for primary keys
      - Use @default(now()) for createdAt
      - Use @updatedAt for updatedAt
      - Always add tenantId foreign key with relation
    </pattern>

    <pattern name="Test File Patterns">
      - Use real PostgreSQL database (NO mocks)
      - Run with --runInBand flag (prevents parallel DB conflicts)
      - Clean up in beforeEach in FK order (leaf tables first):
        1. child.deleteMany
        2. parent.deleteMany
        3. enrollment.deleteMany (when exists)
        4. feeStructure.deleteMany (when exists)
        5. payeePattern.deleteMany
        6. categorization.deleteMany
        7. transaction.deleteMany
        8. user.deleteMany
        9. tenant.deleteMany
      - Use South African context for realistic test data
    </pattern>
  </critical_patterns>

  <existing_schema_summary>
    <enums count="10">
      TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource,
      TransactionStatus, VatType, CategorizationSource, Gender, PreferredContact
    </enums>
    <models count="8">
      Tenant, User, AuditLog, Transaction, Categorization, PayeePattern, Parent, Child
    </models>
    <notes>
      - Child has cascade delete: onDelete: Cascade on parent relation
      - Parent has unique constraint: @@unique([tenantId, email])
      - Tenant has relations to all entities
    </notes>
  </existing_schema_summary>

  <file_locations>
    <source>
      - Entities: src/database/entities/*.entity.ts
      - DTOs: src/database/dto/*.dto.ts
      - Repositories: src/database/repositories/*.repository.ts
      - Prisma: src/database/prisma/prisma.service.ts
      - Exceptions: src/shared/exceptions/base.exception.ts
    </source>
    <tests>
      - Repository tests: tests/database/repositories/*.repository.spec.ts
    </tests>
    <exports>
      - Entity exports: src/database/entities/index.ts
      - DTO exports: src/database/dto/index.ts
    </exports>
  </file_locations>
</ai_agent_context>

<!-- ================================================================== -->
<!-- CONSTITUTION REQUIREMENTS (MUST FOLLOW)                            -->
<!-- ================================================================== -->

<constitution_requirements>
  <error_handling>
    - MANDATORY: Log then throw pattern (never silent failures)
    - MANDATORY: Use typed exceptions, not generic Error
    - MANDATORY: Prisma P2002/P2003/P2025 must map to proper exceptions
    - FORBIDDEN: Empty catch blocks
    - FORBIDDEN: Catching and returning null/undefined to hide errors
    - FORBIDDEN: Console.log (use Logger instead)
  </error_handling>

  <testing>
    - MANDATORY: Real database integration tests
    - MANDATORY: Test all CRUD operations
    - MANDATORY: Test FK constraint violations
    - MANDATORY: Test unique constraint violations
    - MANDATORY: Test cascade behaviors
    - FORBIDDEN: Mock databases or repositories
    - FORBIDDEN: Snapshot testing for data
  </testing>

  <code_style>
    - MANDATORY: Explicit return types on all methods
    - MANDATORY: JSDoc comments on public methods
    - MANDATORY: Use definite assignment assertion (!) for required DTO fields
    - FORBIDDEN: Using 'any' type
    - FORBIDDEN: Implicit any from untyped catches
  </code_style>
</constitution_requirements>

<!-- ================================================================== -->
<!-- TASK CONTEXT                                                        -->
<!-- ================================================================== -->

<context>
This task creates the FeeStructure and Enrollment entities which define the pricing
tiers and link children to their fee structures. Fee structures contain pricing
information, VAT settings, and sibling discounts. Enrollments track which children
are enrolled under which fee structure, including start/end dates, status, and
custom fee overrides.

Key Relationships:
- FeeStructure belongs to Tenant (many FeeStructures per Tenant)
- Enrollment belongs to Tenant, Child, and FeeStructure
- When a Child is deleted, their Enrollments should be deleted (cascade)
- When a FeeStructure is deleted, behavior TBD (may need RESTRICT if enrollments exist)
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#FeeStructure</file>
  <file purpose="schema_definition">specs/technical/data-models.md#Enrollment</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="repository_pattern">src/database/repositories/parent.repository.ts</file>
  <file purpose="dto_pattern">src/database/dto/parent.dto.ts</file>
  <file purpose="test_pattern">tests/database/repositories/parent.repository.spec.ts</file>
  <file purpose="exception_types">src/shared/exceptions/base.exception.ts</file>
</input_context_files>

<prerequisites>
  <check status="complete">TASK-BILL-001 completed (Parent and Child entities exist)</check>
  <check>Prisma CLI available (pnpm prisma)</check>
  <check>Database connection configured (DATABASE_URL in .env)</check>
  <check>247 existing tests pass</check>
</prerequisites>

<scope>
  <in_scope>
    - Create FeeType enum in Prisma schema
    - Create EnrollmentStatus enum in Prisma schema
    - Create FeeStructure model in Prisma schema
    - Create Enrollment model in Prisma schema
    - Update Tenant model with feeStructures and enrollments relations
    - Update Child model with enrollments relation
    - Run migration: pnpm prisma migrate dev
    - Create FeeStructure TypeScript entity interface
    - Create Enrollment TypeScript entity interface
    - Create FeeStructure DTOs (Create, Update, Filter)
    - Create Enrollment DTOs (Create, Update, Filter)
    - Create FeeStructureRepository with CRUD operations
    - Create EnrollmentRepository with CRUD operations
    - Write comprehensive integration tests for both repositories
    - Update entity and DTO index files
  </in_scope>
  <out_of_scope>
    - Invoice entity (TASK-BILL-003)
    - Business logic for fee calculation (TASK-BILL-012)
    - Business logic for enrollment management (TASK-BILL-011)
    - Pro-rata calculations (TASK-BILL-014)
    - API endpoints (TASK-BILL-031+)
  </out_of_scope>
</scope>

<!-- ================================================================== -->
<!-- DEFINITION OF DONE - EXACT SIGNATURES                              -->
<!-- ================================================================== -->

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma" action="ADD">
enum FeeType {
  FULL_DAY
  HALF_DAY
  HOURLY
  CUSTOM
}

enum EnrollmentStatus {
  ACTIVE
  PENDING
  WITHDRAWN
  GRADUATED
}

model FeeStructure {
  id                     String    @id @default(uuid())
  tenantId               String    @map("tenant_id")
  name                   String    @db.VarChar(100)
  description            String?
  feeType                FeeType   @map("fee_type")
  amountCents            Int       @map("amount_cents")
  vatInclusive           Boolean   @default(true) @map("vat_inclusive")
  siblingDiscountPercent Decimal?  @map("sibling_discount_percent") @db.Decimal(5, 2)
  effectiveFrom          DateTime  @map("effective_from") @db.Date
  effectiveTo            DateTime? @map("effective_to") @db.Date
  isActive               Boolean   @default(true) @map("is_active")
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")

  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  enrollments Enrollment[]

  @@index([tenantId, isActive])
  @@index([tenantId, effectiveFrom])
  @@map("fee_structures")
}

model Enrollment {
  id                     String           @id @default(uuid())
  tenantId               String           @map("tenant_id")
  childId                String           @map("child_id")
  feeStructureId         String           @map("fee_structure_id")
  startDate              DateTime         @map("start_date") @db.Date
  endDate                DateTime?        @map("end_date") @db.Date
  status                 EnrollmentStatus @default(ACTIVE)
  siblingDiscountApplied Boolean          @default(false) @map("sibling_discount_applied")
  customFeeOverrideCents Int?             @map("custom_fee_override_cents")
  notes                  String?
  createdAt              DateTime         @default(now()) @map("created_at")
  updatedAt              DateTime         @updatedAt @map("updated_at")

  tenant       Tenant       @relation(fields: [tenantId], references: [id])
  child        Child        @relation(fields: [childId], references: [id], onDelete: Cascade)
  feeStructure FeeStructure @relation(fields: [feeStructureId], references: [id])

  @@index([tenantId, childId, status])
  @@index([tenantId, status, startDate])
  @@map("enrollments")
}
    </signature>

    <signature file="prisma/schema.prisma" action="MODIFY model Tenant">
// ADD these relations to existing Tenant model:
feeStructures Enrollment[]
enrollments   Enrollment[]
    </signature>

    <signature file="prisma/schema.prisma" action="MODIFY model Child">
// ADD this relation to existing Child model:
enrollments Enrollment[]
    </signature>

    <signature file="src/database/entities/fee-structure.entity.ts">
export enum FeeType {
  FULL_DAY = 'FULL_DAY',
  HALF_DAY = 'HALF_DAY',
  HOURLY = 'HOURLY',
  CUSTOM = 'CUSTOM',
}

export interface IFeeStructure {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  feeType: FeeType;
  amountCents: number;
  vatInclusive: boolean;
  siblingDiscountPercent: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
    </signature>

    <signature file="src/database/entities/enrollment.entity.ts">
export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  WITHDRAWN = 'WITHDRAWN',
  GRADUATED = 'GRADUATED',
}

export interface IEnrollment {
  id: string;
  tenantId: string;
  childId: string;
  feeStructureId: string;
  startDate: Date;
  endDate: Date | null;
  status: EnrollmentStatus;
  siblingDiscountApplied: boolean;
  customFeeOverrideCents: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
    </signature>

    <signature file="src/database/dto/fee-structure.dto.ts">
import {
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsDate,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { FeeType } from '../entities/fee-structure.entity';

export class CreateFeeStructureDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(FeeType)
  feeType!: FeeType;

  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsOptional()
  @IsBoolean()
  vatInclusive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  siblingDiscountPercent?: number;

  @Type(() => Date)
  @IsDate()
  effectiveFrom!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}

export class UpdateFeeStructureDto extends PartialType(CreateFeeStructureDto) {}

export class FeeStructureFilterDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveDate?: Date;
}
    </signature>

    <signature file="src/database/dto/enrollment.dto.ts">
import {
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsDate,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { EnrollmentStatus } from '../entities/enrollment.entity';

export class CreateEnrollmentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  childId!: string;

  @IsUUID()
  feeStructureId!: string;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsBoolean()
  siblingDiscountApplied?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  customFeeOverrideCents?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEnrollmentDto extends PartialType(CreateEnrollmentDto) {}

export class EnrollmentFilterDto {
  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsUUID()
  feeStructureId?: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
    </signature>

    <signature file="src/database/repositories/fee-structure.repository.ts">
import { Injectable, Logger } from '@nestjs/common';
import { FeeStructure, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureDto,
  FeeStructureFilterDto,
} from '../dto/fee-structure.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class FeeStructureRepository {
  private readonly logger = new Logger(FeeStructureRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFeeStructureDto): Promise&lt;FeeStructure&gt; {...}
  async findById(id: string): Promise&lt;FeeStructure | null&gt; {...}
  async findByTenant(tenantId: string, filter: FeeStructureFilterDto): Promise&lt;FeeStructure[]&gt; {...}
  async findActiveByTenant(tenantId: string): Promise&lt;FeeStructure[]&gt; {...}
  async findEffectiveOnDate(tenantId: string, date: Date): Promise&lt;FeeStructure[]&gt; {...}
  async update(id: string, dto: UpdateFeeStructureDto): Promise&lt;FeeStructure&gt; {...}
  async delete(id: string): Promise&lt;void&gt; {...}
}
    </signature>

    <signature file="src/database/repositories/enrollment.repository.ts">
import { Injectable, Logger } from '@nestjs/common';
import { Enrollment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  EnrollmentFilterDto,
} from '../dto/enrollment.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class EnrollmentRepository {
  private readonly logger = new Logger(EnrollmentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEnrollmentDto): Promise&lt;Enrollment&gt; {...}
  async findById(id: string): Promise&lt;Enrollment | null&gt; {...}
  async findByTenant(tenantId: string, filter: EnrollmentFilterDto): Promise&lt;Enrollment[]&gt; {...}
  async findByChild(tenantId: string, childId: string): Promise&lt;Enrollment[]&gt; {...}
  async findActiveByChild(tenantId: string, childId: string): Promise&lt;Enrollment | null&gt; {...}
  async findByStatus(tenantId: string, status: EnrollmentStatus): Promise&lt;Enrollment[]&gt; {...}
  async update(id: string, dto: UpdateEnrollmentDto): Promise&lt;Enrollment&gt; {...}
  async delete(id: string): Promise&lt;void&gt; {...}
}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - siblingDiscountPercent: check constraint 0-100 range via validation
    - amountCents must be non-negative (validated in DTO)
    - Enrollment must have valid childId and feeStructureId foreign keys
    - Both entities must have tenantId foreign key
    - effectiveFrom, effectiveTo, startDate, endDate must be date only (@db.Date)
    - Enrollment.childId must cascade delete (when child deleted, enrollment deleted)
  </constraints>

  <verification>
    - pnpm prisma migrate dev runs without error
    - pnpm prisma migrate reset reverts and reapplies successfully
    - pnpm run build compiles without TypeScript errors
    - pnpm run lint passes with no errors
    - pnpm run test --runInBand passes all tests (existing + new)
    - New repository tests achieve high coverage
  </verification>
</definition_of_done>

<!-- ================================================================== -->
<!-- IMPLEMENTATION PSEUDO CODE                                          -->
<!-- ================================================================== -->

<pseudo_code>
STEP 1: Update Prisma Schema (prisma/schema.prisma)

  1.1 Add FeeType enum after PreferredContact enum:
      enum FeeType { FULL_DAY, HALF_DAY, HOURLY, CUSTOM }

  1.2 Add EnrollmentStatus enum after FeeType:
      enum EnrollmentStatus { ACTIVE, PENDING, WITHDRAWN, GRADUATED }

  1.3 Add FeeStructure model:
      - All fields per signature above
      - Relation to Tenant
      - Back-relation to Enrollment[]
      - Indexes on [tenantId, isActive] and [tenantId, effectiveFrom]
      - @@map("fee_structures")

  1.4 Add Enrollment model:
      - All fields per signature above
      - Relation to Tenant, Child (with onDelete: Cascade), FeeStructure
      - Indexes on [tenantId, childId, status] and [tenantId, status, startDate]
      - @@map("enrollments")

  1.5 Update Tenant model - add:
      feeStructures FeeStructure[]
      enrollments   Enrollment[]

  1.6 Update Child model - add:
      enrollments   Enrollment[]

STEP 2: Run Migration
  pnpm prisma migrate dev --name create_fee_structures_and_enrollments

STEP 3: Create Entity Interfaces

  3.1 Create src/database/entities/fee-structure.entity.ts:
      - Export FeeType enum
      - Export IFeeStructure interface

  3.2 Create src/database/entities/enrollment.entity.ts:
      - Export EnrollmentStatus enum
      - Export IEnrollment interface

  3.3 Update src/database/entities/index.ts:
      ADD: export * from './fee-structure.entity';
      ADD: export * from './enrollment.entity';

STEP 4: Create DTOs

  4.1 Create src/database/dto/fee-structure.dto.ts:
      - CreateFeeStructureDto with all validations
      - UpdateFeeStructureDto using PartialType
      - FeeStructureFilterDto for queries

  4.2 Create src/database/dto/enrollment.dto.ts:
      - CreateEnrollmentDto with all validations
      - UpdateEnrollmentDto using PartialType
      - EnrollmentFilterDto for queries

  4.3 Update src/database/dto/index.ts:
      ADD: export * from './fee-structure.dto';
      ADD: export * from './enrollment.dto';

STEP 5: Create Repositories

  5.1 Create src/database/repositories/fee-structure.repository.ts:
      FOLLOW EXACT PATTERN from parent.repository.ts:
      - Use @Injectable() decorator
      - Use private readonly logger = new Logger(...)
      - Constructor injects PrismaService
      - Each method: try { ... } catch (error) { log then throw }
      - Handle P2003 -> NotFoundException for tenant FK
      - Wrap unknown errors in DatabaseException

  5.2 Create src/database/repositories/enrollment.repository.ts:
      FOLLOW EXACT PATTERN from child.repository.ts:
      - Handle P2003 for tenant, child, feeStructure FKs
      - Handle P2025 for nested connect operations
      - Cascade delete tested in tests (when child deleted)

STEP 6: Create Tests

  6.1 Create tests/database/repositories/fee-structure.repository.spec.ts:
      FOLLOW EXACT PATTERN from parent.repository.spec.ts:
      - beforeEach cleanup in FK order (add enrollment, feeStructure to cleanup)
      - Test all CRUD operations
      - Test FK violations (non-existent tenant)
      - Test effective date filtering
      - Use South African test data

  6.2 Create tests/database/repositories/enrollment.repository.spec.ts:
      FOLLOW EXACT PATTERN from child.repository.spec.ts:
      - Test all CRUD operations
      - Test FK violations (non-existent child, feeStructure)
      - Test cascade delete when child is deleted
      - Test status filtering
      - Use South African test data

STEP 7: Verification
  pnpm run build
  pnpm run lint
  pnpm run test --runInBand
</pseudo_code>

<!-- ================================================================== -->
<!-- FILES TO CREATE                                                     -->
<!-- ================================================================== -->

<files_to_create>
  <file path="src/database/entities/fee-structure.entity.ts">FeeType enum and IFeeStructure interface</file>
  <file path="src/database/entities/enrollment.entity.ts">EnrollmentStatus enum and IEnrollment interface</file>
  <file path="src/database/dto/fee-structure.dto.ts">Create, Update, Filter DTOs with class-validator</file>
  <file path="src/database/dto/enrollment.dto.ts">Create, Update, Filter DTOs with class-validator</file>
  <file path="src/database/repositories/fee-structure.repository.ts">FeeStructure CRUD with proper error handling</file>
  <file path="src/database/repositories/enrollment.repository.ts">Enrollment CRUD with proper error handling</file>
  <file path="tests/database/repositories/fee-structure.repository.spec.ts">FeeStructure integration tests</file>
  <file path="tests/database/repositories/enrollment.repository.spec.ts">Enrollment integration tests</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_fee_structures_and_enrollments/migration.sql">Auto-generated by Prisma</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add FeeType/EnrollmentStatus enums, FeeStructure/Enrollment models, update Tenant/Child relations</file>
  <file path="src/database/entities/index.ts">Add exports for fee-structure.entity and enrollment.entity</file>
  <file path="src/database/dto/index.ts">Add exports for fee-structure.dto and enrollment.dto</file>
</files_to_modify>

<!-- ================================================================== -->
<!-- ERROR HANDLING REFERENCE                                            -->
<!-- ================================================================== -->

<error_handling_reference>
  <prisma_error_codes>
    <code id="P2002">Unique constraint violation - throw ConflictException</code>
    <code id="P2003">Foreign key constraint violation - throw NotFoundException for the missing entity</code>
    <code id="P2025">Record not found for nested connect - throw NotFoundException (e.g., feeStructureId doesn't exist)</code>
  </prisma_error_codes>

  <example_from_child_repository>
    // This is the EXACT pattern to follow for handling P2003 and P2025:
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        const field = error.meta?.field_name as string | undefined;
        if (field?.includes('child')) {
          throw new NotFoundException('Child', dto.childId);
        }
        if (field?.includes('fee_structure')) {
          throw new NotFoundException('FeeStructure', dto.feeStructureId);
        }
        throw new NotFoundException('Tenant', dto.tenantId);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('FeeStructure', dto.feeStructureId ?? 'unknown');
      }
    }
  </example_from_child_repository>
</error_handling_reference>

<!-- ================================================================== -->
<!-- TEST CLEANUP ORDER                                                  -->
<!-- ================================================================== -->

<test_cleanup_order>
  // CRITICAL: Clean in FK order - leaf tables first!
  // This order MUST be used in beforeEach of ALL test files after this task:
  await prisma.enrollment.deleteMany({});    // NEW - depends on child, feeStructure
  await prisma.feeStructure.deleteMany({});  // NEW - depends on tenant
  await prisma.child.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
</test_cleanup_order>

<!-- ================================================================== -->
<!-- VALIDATION CRITERIA                                                 -->
<!-- ================================================================== -->

<validation_criteria>
  <criterion>Migration creates fee_structures table with all columns per signature</criterion>
  <criterion>Migration creates enrollments table with all columns per signature</criterion>
  <criterion>Migration can be rolled back (pnpm prisma migrate reset works)</criterion>
  <criterion>FeeStructure entity matches IFeeStructure interface exactly</criterion>
  <criterion>Enrollment entity matches IEnrollment interface exactly</criterion>
  <criterion>No TypeScript compilation errors (pnpm run build)</criterion>
  <criterion>No ESLint errors (pnpm run lint)</criterion>
  <criterion>All 247+ existing tests still pass</criterion>
  <criterion>All new tests pass</criterion>
  <criterion>FeeType enum works correctly in Prisma and TypeScript</criterion>
  <criterion>EnrollmentStatus enum works correctly in Prisma and TypeScript</criterion>
  <criterion>Foreign key constraints enforced (test with invalid IDs)</criterion>
  <criterion>Cascade delete works: deleting Child deletes its Enrollments</criterion>
  <criterion>Date fields stored as date only (no time component)</criterion>
  <criterion>Decimal fields (siblingDiscountPercent) handle precision correctly</criterion>
  <criterion>Repository error handling matches constitution patterns (log then throw)</criterion>
</validation_criteria>

<!-- ================================================================== -->
<!-- TEST COMMANDS                                                       -->
<!-- ================================================================== -->

<test_commands>
  <command description="Generate Prisma client">pnpm prisma generate</command>
  <command description="Run migration">pnpm prisma migrate dev --name create_fee_structures_and_enrollments</command>
  <command description="Reset and reapply migrations">pnpm prisma migrate reset --force</command>
  <command description="Build TypeScript">pnpm run build</command>
  <command description="Lint code">pnpm run lint</command>
  <command description="Run all tests">pnpm run test --runInBand</command>
  <command description="Run FeeStructure tests only">pnpm run test --runInBand --testPathPattern="fee-structure"</command>
  <command description="Run Enrollment tests only">pnpm run test --runInBand --testPathPattern="enrollment"</command>
</test_commands>

<!-- ================================================================== -->
<!-- POST-COMPLETION CHECKLIST                                           -->
<!-- ================================================================== -->

<post_completion_checklist>
  <item>[ ] prisma/schema.prisma has FeeType and EnrollmentStatus enums</item>
  <item>[ ] prisma/schema.prisma has FeeStructure and Enrollment models</item>
  <item>[ ] Tenant model updated with feeStructures and enrollments relations</item>
  <item>[ ] Child model updated with enrollments relation</item>
  <item>[ ] Migration created and applied successfully</item>
  <item>[ ] fee-structure.entity.ts created with FeeType enum and IFeeStructure interface</item>
  <item>[ ] enrollment.entity.ts created with EnrollmentStatus enum and IEnrollment interface</item>
  <item>[ ] fee-structure.dto.ts created with all DTOs and validations</item>
  <item>[ ] enrollment.dto.ts created with all DTOs and validations</item>
  <item>[ ] fee-structure.repository.ts created with all CRUD methods</item>
  <item>[ ] enrollment.repository.ts created with all CRUD methods</item>
  <item>[ ] fee-structure.repository.spec.ts created with comprehensive tests</item>
  <item>[ ] enrollment.repository.spec.ts created with comprehensive tests</item>
  <item>[ ] entities/index.ts updated with new exports</item>
  <item>[ ] dto/index.ts updated with new exports</item>
  <item>[ ] pnpm run build passes</item>
  <item>[ ] pnpm run lint passes</item>
  <item>[ ] pnpm run test --runInBand passes (all 247+ existing tests + new tests)</item>
  <item>[ ] Update specs/tasks/_index.md: mark TASK-BILL-002 as complete</item>
  <item>[ ] Update specs/tasks/_traceability.md: mark FeeStructure and Enrollment as complete</item>
</post_completion_checklist>

</task_spec>
