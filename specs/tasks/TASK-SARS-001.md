<task_spec id="TASK-SARS-001" version="1.0">

<metadata>
  <title>Staff and Payroll Entities</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>12</sequence>
  <implements>
    <requirement_ref>REQ-SARS-006</requirement_ref>
    <requirement_ref>REQ-SARS-007</requirement_ref>
    <requirement_ref>REQ-SARS-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Staff and Payroll entities which form the foundation for
employee management and payroll processing. The Staff model stores employee
information, banking details, and tax numbers required for SARS compliance.
The Payroll model tracks monthly pay records including basic salary, overtime,
bonuses, PAYE, UIF deductions, and medical aid credits. These entities are
critical for EMP201 and IRP5 SARS submission generation.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Staff</file>
  <file purpose="schema_definition">specs/technical/data-models.md#Payroll</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed (Tenant entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Staff Prisma model with employee information
    - Create EmploymentType enum (PERMANENT, CONTRACT, CASUAL)
    - Create PayFrequency enum (MONTHLY, WEEKLY, DAILY, HOURLY)
    - Create Payroll Prisma model with pay records
    - Create PayrollStatus enum (DRAFT, APPROVED, PAID)
    - Create database migrations for staff and payrolls tables
    - Create TypeScript interfaces for Staff and Payroll
    - Create DTOs for Staff and Payroll operations
    - Create Staff and Payroll repositories
    - Support for banking details, tax numbers, medical aid members
  </in_scope>
  <out_of_scope>
    - PAYE calculation logic (TASK-SARS-003)
    - UIF calculation logic (TASK-SARS-004)
    - IRP5 certificate generation (TASK-SARS-007)
    - API endpoints
    - Payroll approval workflows
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      enum EmploymentType {
        PERMANENT
        CONTRACT
        CASUAL
      }

      enum PayFrequency {
        MONTHLY
        WEEKLY
        DAILY
        HOURLY
      }

      enum PayrollStatus {
        DRAFT
        APPROVED
        PAID
      }

      model Staff {
        id                   String         @id @default(uuid())
        tenantId             String
        employeeNumber       String?
        firstName            String
        lastName             String
        idNumber             String
        taxNumber            String?
        email                String?
        phone                String?
        dateOfBirth          DateTime       @db.Date
        startDate            DateTime       @db.Date
        endDate              DateTime?      @db.Date
        employmentType       EmploymentType
        payFrequency         PayFrequency   @default(MONTHLY)
        basicSalaryCents     Int
        bankName             String?
        bankAccount          String?
        bankBranchCode       String?
        medicalAidMembers    Int            @default(0)
        isActive             Boolean        @default(true)
        createdAt            DateTime       @default(now())
        updatedAt            DateTime       @updatedAt

        tenant               Tenant         @relation(fields: [tenantId], references: [id])
        payrolls             Payroll[]

        @@unique([tenantId, idNumber])
        @@index([tenantId, isActive])
        @@map("staff")
      }

      model Payroll {
        id                     String        @id @default(uuid())
        tenantId               String
        staffId                String
        payPeriodStart         DateTime      @db.Date
        payPeriodEnd           DateTime      @db.Date
        basicSalaryCents       Int
        overtimeCents          Int           @default(0)
        bonusCents             Int           @default(0)
        otherEarningsCents     Int           @default(0)
        grossSalaryCents       Int
        payeCents              Int
        uifEmployeeCents       Int
        uifEmployerCents       Int
        otherDeductionsCents   Int           @default(0)
        netSalaryCents         Int
        medicalAidCreditCents  Int           @default(0)
        status                 PayrollStatus @default(DRAFT)
        paymentDate            DateTime?     @db.Date
        createdAt              DateTime      @default(now())
        updatedAt              DateTime      @updatedAt

        tenant                 Tenant        @relation(fields: [tenantId], references: [id])
        staff                  Staff         @relation(fields: [staffId], references: [id])

        @@unique([tenantId, staffId, payPeriodStart])
        @@index([tenantId, status])
        @@map("payrolls")
      }
    </signature>
    <signature file="src/database/entities/staff.entity.ts">
      export enum EmploymentType {
        PERMANENT = 'PERMANENT',
        CONTRACT = 'CONTRACT',
        CASUAL = 'CASUAL'
      }

      export enum PayFrequency {
        MONTHLY = 'MONTHLY',
        WEEKLY = 'WEEKLY',
        DAILY = 'DAILY',
        HOURLY = 'HOURLY'
      }

      export interface IStaff {
        id: string;
        tenantId: string;
        employeeNumber: string | null;
        firstName: string;
        lastName: string;
        idNumber: string;
        taxNumber: string | null;
        email: string | null;
        phone: string | null;
        dateOfBirth: Date;
        startDate: Date;
        endDate: Date | null;
        employmentType: EmploymentType;
        payFrequency: PayFrequency;
        basicSalaryCents: number;
        bankName: string | null;
        bankAccount: string | null;
        bankBranchCode: string | null;
        medicalAidMembers: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/entities/payroll.entity.ts">
      export enum PayrollStatus {
        DRAFT = 'DRAFT',
        APPROVED = 'APPROVED',
        PAID = 'PAID'
      }

      export interface IPayroll {
        id: string;
        tenantId: string;
        staffId: string;
        payPeriodStart: Date;
        payPeriodEnd: Date;
        basicSalaryCents: number;
        overtimeCents: number;
        bonusCents: number;
        otherEarningsCents: number;
        grossSalaryCents: number;
        payeCents: number;
        uifEmployeeCents: number;
        uifEmployerCents: number;
        otherDeductionsCents: number;
        netSalaryCents: number;
        medicalAidCreditCents: number;
        status: PayrollStatus;
        paymentDate: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/staff.dto.ts">
      export class CreateStaffDto {...}
      export class UpdateStaffDto {...}
    </signature>
    <signature file="src/database/dto/payroll.dto.ts">
      export class CreatePayrollDto {...}
      export class UpdatePayrollDto {...}
      export class ApprovePayrollDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary keys (not auto-increment)
    - Must include all fields from technical spec data models
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - Staff.idNumber must be unique per tenant
    - Payroll (tenantId, staffId, payPeriodStart) must be unique
    - All monetary values stored as cents (integers)
    - medicalAidMembers must be non-negative
    - grossSalaryCents = basicSalaryCents + overtimeCents + bonusCents + otherEarningsCents
    - netSalaryCents = grossSalaryCents - payeCents - uifEmployeeCents - otherDeductionsCents
    - paymentDate only set when status is PAID
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
    - Foreign key constraints work correctly
    - Unique constraints on Staff.idNumber and Payroll composite key work
    - Payroll calculates gross and net correctly
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum EmploymentType { PERMANENT, CONTRACT, CASUAL }
    enum PayFrequency { MONTHLY, WEEKLY, DAILY, HOURLY }
    enum PayrollStatus { DRAFT, APPROVED, PAID }

  Add model Staff with all fields per technical spec
  Use @map("staff") for snake_case table name
  Use @unique on (tenantId, idNumber)
  Create foreign key to Tenant
  Create one-to-many relation to Payroll
  Create indexes on (tenantId, isActive)
  Use @db.Date for date fields

  Add model Payroll with all fields per technical spec
  Use @map("payrolls") for snake_case table name
  Use @unique on (tenantId, staffId, payPeriodStart)
  Create foreign keys to Tenant and Staff
  Create indexes on (tenantId, status)
  Use @db.Date for date fields

Entity Interfaces (src/database/entities/):
  staff.entity.ts:
    export enum EmploymentType { ... }
    export enum PayFrequency { ... }
    export interface IStaff { ... }

  payroll.entity.ts:
    export enum PayrollStatus { ... }
    export interface IPayroll { ... }

DTOs (src/database/dto/):
  staff.dto.ts:
    export class CreateStaffDto:
      @IsUUID() tenantId: string
      @IsOptional() @IsString() employeeNumber?: string
      @IsString() @MinLength(1) firstName: string
      @IsString() @MinLength(1) lastName: string
      @IsString() @Length(13) idNumber: string
      @IsOptional() @IsString() taxNumber?: string
      @IsOptional() @IsEmail() email?: string
      @IsOptional() @IsString() phone?: string
      @IsDateString() dateOfBirth: string
      @IsDateString() startDate: string
      @IsOptional() @IsDateString() endDate?: string
      @IsEnum(EmploymentType) employmentType: EmploymentType
      @IsEnum(PayFrequency) payFrequency: PayFrequency
      @IsInt() @Min(0) basicSalaryCents: number
      @IsOptional() @IsString() bankName?: string
      @IsOptional() @IsString() bankAccount?: string
      @IsOptional() @IsString() bankBranchCode?: string
      @IsInt() @Min(0) medicalAidMembers: number

  payroll.dto.ts:
    export class CreatePayrollDto:
      @IsUUID() tenantId: string
      @IsUUID() staffId: string
      @IsDateString() payPeriodStart: string
      @IsDateString() payPeriodEnd: string
      @IsInt() @Min(0) basicSalaryCents: number
      @IsInt() @Min(0) overtimeCents: number
      @IsInt() @Min(0) bonusCents: number
      @IsInt() @Min(0) otherEarningsCents: number
      @IsInt() @Min(0) grossSalaryCents: number
      @IsInt() @Min(0) payeCents: number
      @IsInt() @Min(0) uifEmployeeCents: number
      @IsInt() @Min(0) uifEmployerCents: number
      @IsInt() @Min(0) otherDeductionsCents: number
      @IsInt() @Min(0) netSalaryCents: number
      @IsInt() @Min(0) medicalAidCreditCents: number

Repositories:
  StaffRepository (src/database/repositories/staff.repository.ts):
    @Injectable()
    export class StaffRepository:
      constructor(private prisma: PrismaService)

      async create(dto: CreateStaffDto): Promise<Staff>
      async findById(id: string): Promise<Staff | null>
      async findByIdNumber(tenantId: string, idNumber: string): Promise<Staff | null>
      async findByTenantId(tenantId: string, filters?: StaffFilters): Promise<Staff[]>
      async update(id: string, dto: UpdateStaffDto): Promise<Staff>
      async deactivate(id: string, endDate: Date): Promise<Staff>

  PayrollRepository (src/database/repositories/payroll.repository.ts):
    @Injectable()
    export class PayrollRepository:
      constructor(private prisma: PrismaService)

      async create(dto: CreatePayrollDto): Promise<Payroll>
      async findById(id: string): Promise<Payroll | null>
      async findByStaffId(staffId: string, filters?: PayrollFilters): Promise<Payroll[]>
      async findByPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise<Payroll[]>
      async update(id: string, dto: UpdatePayrollDto): Promise<Payroll>
      async approve(id: string): Promise<Payroll>
      async markAsPaid(id: string, paymentDate: Date): Promise<Payroll>

Migration:
  npx prisma migrate dev --name create_staff_and_payroll
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/staff.entity.ts">Staff interface and enums</file>
  <file path="src/database/entities/payroll.entity.ts">Payroll interface and enums</file>
  <file path="src/database/dto/staff.dto.ts">Create and Update DTOs with validation</file>
  <file path="src/database/dto/payroll.dto.ts">Create, Update, and Approve DTOs with validation</file>
  <file path="src/database/repositories/staff.repository.ts">Staff repository</file>
  <file path="src/database/repositories/payroll.repository.ts">Payroll repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_staff_and_payroll/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/staff.repository.spec.ts">Staff repository tests</file>
  <file path="tests/database/repositories/payroll.repository.spec.ts">Payroll repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Staff and Payroll models with enums</file>
  <file path="src/database/entities/index.ts">Export Staff and Payroll entities</file>
  <file path="src/database/dto/index.ts">Export Staff and Payroll DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates staff and payrolls tables with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>Staff and Payroll entities match technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraint on Staff (tenantId, idNumber) works</criterion>
  <criterion>Unique constraint on Payroll (tenantId, staffId, payPeriodStart) works</criterion>
  <criterion>Foreign key constraints work correctly</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>Indexes improve query performance for common lookups</criterion>
  <criterion>Payroll status transitions work (DRAFT -> APPROVED -> PAID)</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_staff_and_payroll</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "StaffRepository"</command>
  <command>npm run test -- --grep "PayrollRepository"</command>
</test_commands>

</task_spec>
