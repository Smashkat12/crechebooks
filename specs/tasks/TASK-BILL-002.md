<task_spec id="TASK-BILL-002" version="1.0">

<metadata>
  <title>Fee Structure and Enrollment Entities</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>9</sequence>
  <implements>
    <requirement_ref>REQ-BILL-005</requirement_ref>
    <requirement_ref>REQ-BILL-009</requirement_ref>
    <requirement_ref>REQ-BILL-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the FeeStructure and Enrollment entities which define the pricing
tiers and link children to their fee structures. Fee structures contain pricing
information, VAT settings, and sibling discounts. Enrollments track which children
are enrolled under which fee structure, including start/end dates, status, and
custom fee overrides.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#FeeStructure</file>
  <file purpose="schema_definition">specs/technical/data-models.md#Enrollment</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-001 completed</check>
  <check>Parent and Child entities exist</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create FeeStructure Prisma model
    - Create Enrollment Prisma model
    - Create FeeType enum (FULL_DAY, HALF_DAY, HOURLY, CUSTOM)
    - Create EnrollmentStatus enum (ACTIVE, PENDING, WITHDRAWN, GRADUATED)
    - Create database migrations for fee_structures and enrollments tables
    - Create TypeScript interfaces for FeeStructure and Enrollment
    - Create DTOs for FeeStructure and Enrollment operations
    - Create FeeStructure and Enrollment repositories
  </in_scope>
  <out_of_scope>
    - Invoice entity (TASK-BILL-003)
    - Business logic for fee calculation
    - Business logic for enrollment management
    - Pro-rata calculations
    - API endpoints
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model FeeStructure {
        id                     String   @id @default(uuid())
        tenantId               String
        tenant                 Tenant   @relation(fields: [tenantId], references: [id])
        name                   String
        description            String?
        feeType                FeeType
        amountCents            Int
        vatInclusive           Boolean  @default(true)
        siblingDiscountPercent Decimal? @db.Decimal(5, 2)
        effectiveFrom          DateTime @db.Date
        effectiveTo            DateTime? @db.Date
        isActive               Boolean  @default(true)
        createdAt              DateTime @default(now())
        updatedAt              DateTime @updatedAt

        enrollments            Enrollment[]

        @@index([tenantId, isActive])
        @@index([tenantId, effectiveFrom])
        @@map("fee_structures")
      }

      model Enrollment {
        id                      String   @id @default(uuid())
        tenantId                String
        tenant                  Tenant   @relation(fields: [tenantId], references: [id])
        childId                 String
        child                   Child    @relation(fields: [childId], references: [id])
        feeStructureId          String
        feeStructure            FeeStructure @relation(fields: [feeStructureId], references: [id])
        startDate               DateTime @db.Date
        endDate                 DateTime? @db.Date
        status                  EnrollmentStatus @default(ACTIVE)
        siblingDiscountApplied  Boolean  @default(false)
        customFeeOverrideCents  Int?
        notes                   String?
        createdAt               DateTime @default(now())
        updatedAt               DateTime @updatedAt

        @@index([tenantId, childId, status])
        @@index([tenantId, status, startDate])
        @@map("enrollments")
      }

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
    </signature>
    <signature file="src/database/entities/fee-structure.entity.ts">
      export enum FeeType {
        FULL_DAY = 'FULL_DAY',
        HALF_DAY = 'HALF_DAY',
        HOURLY = 'HOURLY',
        CUSTOM = 'CUSTOM'
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
        GRADUATED = 'GRADUATED'
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
      export class CreateFeeStructureDto {...}
      export class UpdateFeeStructureDto {...}
    </signature>
    <signature file="src/database/dto/enrollment.dto.ts">
      export class CreateEnrollmentDto {...}
      export class UpdateEnrollmentDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - siblingDiscountPercent must be 0-100 range (check constraint)
    - amountCents must be non-negative
    - Enrollment must have valid childId and feeStructureId foreign keys
    - Both entities must have tenantId foreign key
    - effectiveFrom, effectiveTo, startDate, endDate must be date only (no time)
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum FeeType { FULL_DAY, HALF_DAY, HOURLY, CUSTOM }
    enum EnrollmentStatus { ACTIVE, PENDING, WITHDRAWN, GRADUATED }

  Add model FeeStructure with all fields per technical spec:
    - id, tenantId (FK to Tenant)
    - name, description, feeType (enum)
    - amountCents (Int), vatInclusive (Boolean default true)
    - siblingDiscountPercent (Decimal(5,2), nullable, check: 0-100)
    - effectiveFrom (@db.Date), effectiveTo (@db.Date, nullable)
    - isActive (Boolean default true)
    - createdAt, updatedAt
    - Relation: enrollments (Enrollment[])
    - Use @map("fee_structures") for snake_case table name
    - Index on [tenantId, isActive]
    - Index on [tenantId, effectiveFrom]

  Add model Enrollment with all fields per technical spec:
    - id, tenantId (FK to Tenant), childId (FK to Child)
    - feeStructureId (FK to FeeStructure)
    - startDate (@db.Date), endDate (@db.Date, nullable)
    - status (enum, default ACTIVE)
    - siblingDiscountApplied (Boolean default false)
    - customFeeOverrideCents (Int, nullable)
    - notes, createdAt, updatedAt
    - Use @map("enrollments") for snake_case table name
    - Index on [tenantId, childId, status]
    - Index on [tenantId, status, startDate]

  Update Tenant model:
    - Add relation: feeStructures (FeeStructure[])
    - Add relation: enrollments (Enrollment[])

  Update Child model:
    - Add relation: enrollments (Enrollment[])

FeeStructure Entity Interface (src/database/entities/fee-structure.entity.ts):
  export enum FeeType:
    FULL_DAY = 'FULL_DAY'
    HALF_DAY = 'HALF_DAY'
    HOURLY = 'HOURLY'
    CUSTOM = 'CUSTOM'

  export interface IFeeStructure:
    // All fields with proper types

Enrollment Entity Interface (src/database/entities/enrollment.entity.ts):
  export enum EnrollmentStatus:
    ACTIVE = 'ACTIVE'
    PENDING = 'PENDING'
    WITHDRAWN = 'WITHDRAWN'
    GRADUATED = 'GRADUATED'

  export interface IEnrollment:
    // All fields with proper types

FeeStructure DTOs (src/database/dto/fee-structure.dto.ts):
  export class CreateFeeStructureDto:
    @IsString() @MinLength(1) name: string
    @IsOptional() @IsString() description?: string
    @IsEnum(FeeType) feeType: FeeType
    @IsInt() @Min(0) amountCents: number
    @IsBoolean() vatInclusive: boolean
    @IsOptional() @IsNumber() @Min(0) @Max(100) siblingDiscountPercent?: number
    @IsDate() effectiveFrom: Date
    @IsOptional() @IsDate() effectiveTo?: Date

  export class UpdateFeeStructureDto:
    // All fields optional except tenantId validation

Enrollment DTOs (src/database/dto/enrollment.dto.ts):
  export class CreateEnrollmentDto:
    @IsUUID() childId: string
    @IsUUID() feeStructureId: string
    @IsDate() startDate: Date
    @IsOptional() @IsDate() endDate?: Date
    @IsEnum(EnrollmentStatus) status: EnrollmentStatus
    @IsBoolean() siblingDiscountApplied: boolean
    @IsOptional() @IsInt() @Min(0) customFeeOverrideCents?: number
    @IsOptional() @IsString() notes?: string

  export class UpdateEnrollmentDto:
    // All fields optional except tenantId validation

FeeStructure Repository (src/database/repositories/fee-structure.repository.ts):
  @Injectable()
  export class FeeStructureRepository:
    constructor(private prisma: PrismaService)

    async create(tenantId: string, dto: CreateFeeStructureDto): Promise<FeeStructure>
    async findById(tenantId: string, id: string): Promise<FeeStructure | null>
    async findActive(tenantId: string): Promise<FeeStructure[]>
    async findByEffectiveDate(tenantId: string, date: Date): Promise<FeeStructure[]>
    async update(tenantId: string, id: string, dto: UpdateFeeStructureDto): Promise<FeeStructure>
    async delete(tenantId: string, id: string): Promise<void>

Enrollment Repository (src/database/repositories/enrollment.repository.ts):
  @Injectable()
  export class EnrollmentRepository:
    constructor(private prisma: PrismaService)

    async create(tenantId: string, dto: CreateEnrollmentDto): Promise<Enrollment>
    async findById(tenantId: string, id: string): Promise<Enrollment | null>
    async findByChildId(tenantId: string, childId: string): Promise<Enrollment[]>
    async findActiveByChildId(tenantId: string, childId: string): Promise<Enrollment | null>
    async findByStatus(tenantId: string, status: EnrollmentStatus): Promise<Enrollment[]>
    async update(tenantId: string, id: string, dto: UpdateEnrollmentDto): Promise<Enrollment>
    async delete(tenantId: string, id: string): Promise<void>

Migration:
  npx prisma migrate dev --name create_fee_structures_and_enrollments
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/fee-structure.entity.ts">FeeStructure interface and FeeType enum</file>
  <file path="src/database/entities/enrollment.entity.ts">Enrollment interface and EnrollmentStatus enum</file>
  <file path="src/database/dto/fee-structure.dto.ts">Create and Update DTOs for FeeStructure with validation</file>
  <file path="src/database/dto/enrollment.dto.ts">Create and Update DTOs for Enrollment with validation</file>
  <file path="src/database/repositories/fee-structure.repository.ts">FeeStructure repository</file>
  <file path="src/database/repositories/enrollment.repository.ts">Enrollment repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_fee_structures_and_enrollments/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/fee-structure.repository.spec.ts">FeeStructure repository tests</file>
  <file path="tests/database/repositories/enrollment.repository.spec.ts">Enrollment repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add FeeStructure and Enrollment models with enums</file>
  <file path="src/database/entities/index.ts">Export FeeStructure and Enrollment entities</file>
  <file path="src/database/dto/index.ts">Export FeeStructure and Enrollment DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates fee_structures and enrollments tables with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>FeeStructure and Enrollment entities match technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>siblingDiscountPercent check constraint (0-100) works</criterion>
  <criterion>Foreign key constraints work (Enrollment to Child and FeeStructure, both to Tenant)</criterion>
  <criterion>FeeType and EnrollmentStatus enums work correctly</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>Date fields stored as date only (no time component)</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_fee_structures_and_enrollments</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "FeeStructureRepository"</command>
  <command>npm run test -- --grep "EnrollmentRepository"</command>
</test_commands>

</task_spec>
