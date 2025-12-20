<task_spec id="TASK-BILL-001" version="2.0">

<metadata>
  <title>Parent and Child Entities</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>8</sequence>
  <implements>
    <requirement_ref>REQ-BILL-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Database State (prisma/schema.prisma)

  **Existing Enums (DO NOT RECREATE):**
  - TaxStatus, SubscriptionStatus, UserRole, AuditAction
  - ImportSource, TransactionStatus, VatType, CategorizationSource

  **Existing Models (6 total):**
  - Tenant (with users, transactions, payeePatterns relations)
  - User, AuditLog, Transaction, Categorization, PayeePattern

  **Applied Migrations:**
  1. 20251219225823_create_tenants
  2. 20251219233350_create_users
  3. 20251220000830_create_audit_logs
  4. 20251220XXXXXX_create_transactions
  5. 20251220012120_create_categorizations
  6. 20251220014604_create_payee_patterns

  **Test Count:** 200 tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Prisma 7 Pattern
  - DATABASE_URL is in `prisma.config.ts`, NOT in schema.prisma
  - Schema has NO url in datasource block
  - Run `npx prisma generate` after migration

  ### 3. Repository Pattern (src/database/repositories/*.repository.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { Parent, Prisma } from '@prisma/client';
  import { PrismaService } from '../prisma/prisma.service';
  import { CreateParentDto, UpdateParentDto } from '../dto/parent.dto';
  import {
    NotFoundException,
    ConflictException,
    DatabaseException,
  } from '../../shared/exceptions';

  @Injectable()
  export class ParentRepository {
    private readonly logger = new Logger(ParentRepository.name);
    constructor(private readonly prisma: PrismaService) {}

    // Every method has try/catch with:
    // 1. this.logger.error() with full context
    // 2. Re-throw custom exception (NEVER swallow errors)
  }
  ```

  ### 4. Test Pattern (tests/database/repositories/*.spec.ts)
  ```typescript
  import 'dotenv/config';  // FIRST LINE - Required!
  import { Test, TestingModule } from '@nestjs/testing';
  // Import enums from entity files, NOT @prisma/client
  import { Gender } from '../../../src/database/entities/child.entity';

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    // Add NEW tables FIRST in this list
    await prisma.child.deleteMany({});       // NEW - add first
    await prisma.parent.deleteMany({});      // NEW - add second
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});
  });
  ```

  ### 5. Entity Interface Pattern (src/database/entities/*.entity.ts)
  - Use `string | null` for nullable fields, NOT `string?`
  - Export enums BEFORE the interface
  - Enum values: `MALE = 'MALE'` (string value matches key)

  ### 6. DTO Pattern (src/database/dto/*.dto.ts)
  - Import enums from entity file: `import { Gender } from '../entities/child.entity';`
  - Use class-validator decorators
  - UpdateDto extends PartialType(CreateDto)

  ### 7. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag - prevents parallel DB conflicts
  ```
</critical_patterns>

<context>
This task creates Parent and Child entities for CrecheBooks billing.
- **Parent**: Billing contact who receives invoices, linked to Xero contacts
- **Child**: Enrolled student with medical info, linked to Parent
- Both have multi-tenant isolation (tenantId foreign key)
- Child has cascade relationship to Parent (delete parent = delete children)
</context>

<scope>
  <in_scope>
    - Add Gender enum (MALE, FEMALE, OTHER) to prisma/schema.prisma
    - Add PreferredContact enum (EMAIL, WHATSAPP, BOTH) to prisma/schema.prisma
    - Add Parent model to prisma/schema.prisma
    - Add Child model to prisma/schema.prisma
    - Update Tenant model with parents, children relations
    - Run migration: npx prisma migrate dev --name create_parents_and_children
    - Create src/database/entities/parent.entity.ts
    - Create src/database/entities/child.entity.ts
    - Create src/database/dto/parent.dto.ts
    - Create src/database/dto/child.dto.ts
    - Create src/database/repositories/parent.repository.ts
    - Create src/database/repositories/child.repository.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL 5 existing test files with new cleanup order
    - Create tests/database/repositories/parent.repository.spec.ts (15+ tests)
    - Create tests/database/repositories/child.repository.spec.ts (15+ tests)
  </in_scope>
  <out_of_scope>
    - FeeStructure, Enrollment entities (TASK-BILL-002)
    - Invoice entity (TASK-BILL-003)
    - Business logic services
    - API endpoints
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER PayeePattern model)

```prisma
enum Gender {
  MALE
  FEMALE
  OTHER
}

enum PreferredContact {
  EMAIL
  WHATSAPP
  BOTH
}

model Parent {
  id                String           @id @default(uuid())
  tenantId          String           @map("tenant_id")
  xeroContactId     String?          @unique @map("xero_contact_id")
  firstName         String           @map("first_name") @db.VarChar(100)
  lastName          String           @map("last_name") @db.VarChar(100)
  email             String?          @db.VarChar(255)
  phone             String?          @db.VarChar(20)
  whatsapp          String?          @db.VarChar(20)
  preferredContact  PreferredContact @default(EMAIL) @map("preferred_contact")
  idNumber          String?          @map("id_number") @db.VarChar(20)
  address           String?
  notes             String?
  isActive          Boolean          @default(true) @map("is_active")
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")

  tenant            Tenant           @relation(fields: [tenantId], references: [id])
  children          Child[]

  @@unique([tenantId, email])
  @@index([tenantId])
  @@index([tenantId, lastName, firstName])
  @@map("parents")
}

model Child {
  id               String    @id @default(uuid())
  tenantId         String    @map("tenant_id")
  parentId         String    @map("parent_id")
  firstName        String    @map("first_name") @db.VarChar(100)
  lastName         String    @map("last_name") @db.VarChar(100)
  dateOfBirth      DateTime  @map("date_of_birth") @db.Date
  gender           Gender?
  medicalNotes     String?   @map("medical_notes")
  emergencyContact String?   @map("emergency_contact") @db.VarChar(200)
  emergencyPhone   String?   @map("emergency_phone") @db.VarChar(20)
  isActive         Boolean   @default(true) @map("is_active")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  tenant           Tenant    @relation(fields: [tenantId], references: [id])
  parent           Parent    @relation(fields: [parentId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, parentId])
  @@index([tenantId, isActive])
  @@map("children")
}
```

## Update Tenant model - ADD these relations:
```prisma
model Tenant {
  // ... existing fields ...

  users                User[]
  transactions         Transaction[]
  payeePatterns        PayeePattern[]
  parents              Parent[]          // ADD THIS
  children             Child[]           // ADD THIS

  @@map("tenants")
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/parent.entity.ts
```typescript
/**
 * Parent Entity Types
 * TASK-BILL-001: Parent and Child Entities
 */

export enum PreferredContact {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export interface IParent {
  id: string;
  tenantId: string;
  xeroContactId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredContact: PreferredContact;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## src/database/entities/child.entity.ts
```typescript
/**
 * Child Entity Types
 * TASK-BILL-001: Parent and Child Entities
 */

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export interface IChild {
  id: string;
  tenantId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender | null;
  medicalNotes: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```
</entity_files>

<dto_files>
## src/database/dto/parent.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PreferredContact } from '../entities/parent.entity';

export class CreateParentDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string;

  @IsOptional()
  @IsEnum(PreferredContact)
  preferredContact?: PreferredContact;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  idNumber?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateParentDto extends PartialType(CreateParentDto) {}

export class ParentFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

## src/database/dto/child.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsDate,
  IsOptional,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { Gender } from '../entities/child.entity';

export class CreateChildDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  parentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @Type(() => Date)
  @IsDate()
  dateOfBirth!: Date;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string;
}

export class UpdateChildDto extends PartialType(CreateChildDto) {}

export class ChildFilterDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
```
</dto_files>

<repository_files>
## src/database/repositories/parent.repository.ts

Repository must have these methods:
1. `create(dto: CreateParentDto): Promise<Parent>`
2. `findById(id: string): Promise<Parent | null>`
3. `findByTenant(tenantId: string, filter: ParentFilterDto): Promise<Parent[]>`
4. `findByEmail(tenantId: string, email: string): Promise<Parent | null>`
5. `findByXeroContactId(xeroContactId: string): Promise<Parent | null>`
6. `update(id: string, dto: UpdateParentDto): Promise<Parent>`
7. `delete(id: string): Promise<void>` (hard delete - cascades to children)

Error handling:
- P2002 (unique constraint) → ConflictException
- P2003 (foreign key) → NotFoundException for tenant
- Not found → NotFoundException('Parent', id)

## src/database/repositories/child.repository.ts

Repository must have these methods:
1. `create(dto: CreateChildDto): Promise<Child>`
2. `findById(id: string): Promise<Child | null>`
3. `findByParent(tenantId: string, parentId: string): Promise<Child[]>`
4. `findByTenant(tenantId: string, filter: ChildFilterDto): Promise<Child[]>`
5. `update(id: string, dto: UpdateChildDto): Promise<Child>`
6. `delete(id: string): Promise<void>`
7. `getAgeInMonths(child: Child): number` - utility method

Error handling:
- P2003 (foreign key) → NotFoundException for tenant or parent
- Not found → NotFoundException('Child', id)
</repository_files>

<test_cleanup_update>
## UPDATE ALL 5 EXISTING TEST FILES

Add these TWO lines at the TOP of the beforeEach cleanup:

```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.child.deleteMany({});         // ADD THIS LINE
  await prisma.parent.deleteMany({});        // ADD THIS LINE
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
});
```

Files to update:
1. tests/database/repositories/tenant.repository.spec.ts
2. tests/database/repositories/user.repository.spec.ts
3. tests/database/repositories/transaction.repository.spec.ts
4. tests/database/repositories/categorization.repository.spec.ts
5. tests/database/repositories/payee-pattern.repository.spec.ts
</test_cleanup_update>

<index_updates>
## Update src/database/entities/index.ts
Add at end:
```typescript
export * from './parent.entity';
export * from './child.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './parent.dto';
export * from './child.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './parent.repository';
export * from './child.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/database/repositories/parent.repository.spec.ts (15+ tests)
Test scenarios:
- create: all fields, minimum fields, duplicate email per tenant, same email different tenant
- findById: exists, not found
- findByTenant: all, with search filter, with isActive filter
- findByEmail: found, not found, tenant isolation
- findByXeroContactId: found, not found
- update: valid, not found, duplicate email conflict
- delete: exists, not found, cascades to children

### tests/database/repositories/child.repository.spec.ts (15+ tests)
Test scenarios:
- create: all fields, minimum fields, invalid parentId, valid parent
- findById: exists, not found
- findByParent: returns children for parent, empty for parent with no children
- findByTenant: all, with parentId filter, with isActive filter, search filter
- update: valid, not found, change parent
- delete: exists, not found
- getAgeInMonths: correct calculation
- cascade: deleting parent deletes children

Use REAL test data (South African context):
```typescript
const testParent = {
  tenantId: '', // set in beforeEach
  firstName: 'Thabo',
  lastName: 'Mbeki',
  email: 'thabo@family.co.za',
  phone: '+27821234567',
  whatsapp: '+27821234567',
  preferredContact: PreferredContact.WHATSAPP,
  idNumber: '8501015800088',
  address: '45 Vilakazi Street, Soweto, Johannesburg',
};

const testChild = {
  tenantId: '',
  parentId: '',
  firstName: 'Lerato',
  lastName: 'Mbeki',
  dateOfBirth: new Date('2021-03-15'),
  gender: Gender.FEMALE,
  medicalNotes: 'Allergic to peanuts',
  emergencyContact: 'Grandmother - Nomvula Mbeki',
  emergencyPhone: '+27829876543',
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_parents_and_children

# 3. Generate client
npx prisma generate

# 4. Create entity files
# Create src/database/entities/parent.entity.ts
# Create src/database/entities/child.entity.ts

# 5. Create DTO files
# Create src/database/dto/parent.dto.ts
# Create src/database/dto/child.dto.ts

# 6. Create repository files
# Create src/database/repositories/parent.repository.ts
# Create src/database/repositories/child.repository.ts

# 7. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 8. Update existing test files (ALL 5)
# Add child.deleteMany and parent.deleteMany to cleanup

# 9. Create test files
# Create tests/database/repositories/parent.repository.spec.ts
# Create tests/database/repositories/child.repository.spec.ts

# 10. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 230+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - NO backwards compatibility hacks - fail fast with clear errors
    - NO swallowing errors - log with full context, then re-throw
    - All errors must clearly indicate WHAT failed and WHY
    - Must use UUID for primary keys
    - Must include tenantId FK on both Parent and Child
    - Parent email unique per tenant (not globally)
    - xeroContactId globally unique
    - Child.dateOfBirth stored as DATE only (no time)
    - Delete parent cascades to children
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 230+ tests passing (200 existing + 30+ new)
    - Migration applies and can be reverted
    - Parent CRUD operations work
    - Child CRUD operations work
    - Tenant isolation enforced on all queries
    - Cascade delete works (delete parent → children deleted)
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Import enums from `@prisma/client` in DTOs (import from entity file)
  - Use `string?` in interfaces (use `string | null`)
  - Run tests without `--runInBand` flag
  - Skip updating existing test cleanup order
  - Create mock/stub implementations
  - Use silent fallbacks or workarounds
  - Skip the npx prisma generate step
  - Forget to add new tables to ALL existing test cleanup
</anti_patterns>

</task_spec>
