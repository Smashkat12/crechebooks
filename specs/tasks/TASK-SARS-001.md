<task_spec id="TASK-SARS-001" version="2.0">

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

<!-- ================================================================== -->
<!-- AI AGENT IMPLEMENTATION CONTEXT                                    -->
<!-- ================================================================== -->

<ai_agent_context>
  <project_state>
    <description>Current state of the crechebooks project as of TASK-PAY-001 completion</description>
    <tests_passing>417</tests_passing>
    <test_suites>14</test_suites>
    <test_command>npm test -- --runInBand</test_command>
    <test_warning>ALWAYS run with --runInBand. Tests fail in parallel due to shared database</test_warning>
  </project_state>

  <existing_entities>
    <!-- These entities already exist in prisma/schema.prisma -->
    <entity name="Tenant" table="tenants">Primary multi-tenant entity</entity>
    <entity name="User" table="users">Authenticated users with roles</entity>
    <entity name="AuditLog" table="audit_logs">Immutable audit trail</entity>
    <entity name="Transaction" table="transactions">Bank transactions</entity>
    <entity name="Categorization" table="categorizations">Transaction categorizations</entity>
    <entity name="PayeePattern" table="payee_patterns">Learned payee patterns</entity>
    <entity name="Parent" table="parents">Parent contacts</entity>
    <entity name="Child" table="children">Children enrolled at creche</entity>
    <entity name="FeeStructure" table="fee_structures">Fee plans</entity>
    <entity name="Enrollment" table="enrollments">Child-FeeStructure linkage</entity>
    <entity name="Invoice" table="invoices">Parent invoices</entity>
    <entity name="InvoiceLine" table="invoice_lines">Invoice line items</entity>
    <entity name="Payment" table="payments">Payment matching records</entity>
  </existing_entities>

  <existing_enums>
    <!-- These enums exist in prisma/schema.prisma - DO NOT recreate -->
    <enum>TaxStatus</enum>
    <enum>SubscriptionStatus</enum>
    <enum>UserRole</enum>
    <enum>AuditAction</enum>
    <enum>ImportSource</enum>
    <enum>TransactionStatus</enum>
    <enum>VatType</enum>
    <enum>CategorizationSource</enum>
    <enum>Gender</enum>
    <enum>PreferredContact</enum>
    <enum>FeeType</enum>
    <enum>EnrollmentStatus</enum>
    <enum>InvoiceStatus</enum>
    <enum>DeliveryMethod</enum>
    <enum>DeliveryStatus</enum>
    <enum>LineType</enum>
    <enum>MatchType</enum>
    <enum>MatchedBy</enum>
  </existing_enums>

  <implementation_principles>
    <principle id="P1">NO WORKAROUNDS - Fail fast with robust error logging. If something is wrong, throw an exception</principle>
    <principle id="P2">NO MOCK DATA IN TESTS - All tests use real PostgreSQL database with real data</principle>
    <principle id="P3">NO BACKWARDS COMPATIBILITY - Clean implementation only, no legacy support hacks</principle>
    <principle id="P4">LOG-THEN-THROW PATTERN - Always log error with context BEFORE throwing exception</principle>
    <principle id="P5">TENANT ISOLATION - All queries must include tenantId, enforced at repository level</principle>
  </implementation_principles>

  <critical_test_cleanup_order>
    <description>
      Tests MUST clean tables in this EXACT order (leaf tables first, respecting FK constraints).
      Payment was added after Invoice, so it must be deleted FIRST.
    </description>
    <order>
      <step>1. await prisma.payment.deleteMany({});</step>
      <step>2. await prisma.invoiceLine.deleteMany({});</step>
      <step>3. await prisma.invoice.deleteMany({});</step>
      <step>4. await prisma.enrollment.deleteMany({});</step>
      <step>5. await prisma.feeStructure.deleteMany({});</step>
      <step>6. await prisma.child.deleteMany({});</step>
      <step>7. await prisma.parent.deleteMany({});</step>
      <step>8. await prisma.payeePattern.deleteMany({});</step>
      <step>9. await prisma.categorization.deleteMany({});</step>
      <step>10. await prisma.transaction.deleteMany({});</step>
      <step>11. await prisma.user.deleteMany({});</step>
      <step>12. await prisma.tenant.deleteMany({});</step>
    </order>
    <for_this_task>
      <!-- After implementing Staff and Payroll, the order becomes: -->
      <new_order>
        <step>1. await prisma.payroll.deleteMany({});</step>
        <step>2. await prisma.staff.deleteMany({});</step>
        <step>3. await prisma.payment.deleteMany({});</step>
        <step>4. (rest unchanged)</step>
      </new_order>
    </for_this_task>
  </critical_test_cleanup_order>
</ai_agent_context>

<!-- ================================================================== -->
<!-- CODING PATTERNS (from existing codebase)                           -->
<!-- ================================================================== -->

<coding_patterns>
  <pattern name="repository_structure">
    <description>Standard NestJS repository pattern used throughout the project</description>
    <example>
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Staff, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto, UpdateStaffDto, StaffFilterDto } from '../dto/staff.dto';
import { NotFoundException, ConflictException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class StaffRepository {
  private readonly logger = new Logger(StaffRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDto): Promise&lt;Staff&gt; {
    try {
      return await this.prisma.staff.create({
        data: {
          tenantId: dto.tenantId,
          // ... map all fields from DTO
        },
      });
    } catch (error) {
      // LOG FIRST - then throw
      this.logger.error(
        `Failed to create staff: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Handle specific Prisma errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') { // Unique constraint violation
          throw new ConflictException('Staff with this idNumber already exists', { idNumber: dto.idNumber });
        }
        if (error.code === 'P2003') { // Foreign key constraint
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException('create', 'Failed to create staff', error instanceof Error ? error : undefined);
    }
  }
}
```
    </example>
  </pattern>

  <pattern name="dto_validation">
    <description>Use class-validator decorators for validation</description>
    <example>
```typescript
import {
  IsString, IsUUID, IsOptional, IsEmail, IsEnum,
  IsInt, Min, IsDateString, Length, MinLength, IsBoolean,
} from 'class-validator';
import { EmploymentType, PayFrequency } from '../entities/staff.entity';

export class CreateStaffDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  employeeNumber?: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @Length(13, 13) // South African ID number is exactly 13 digits
  idNumber!: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsDateString()
  dateOfBirth!: string | Date;

  @IsDateString()
  startDate!: string | Date;

  @IsOptional()
  @IsDateString()
  endDate?: string | Date;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @IsInt()
  @Min(0)
  basicSalaryCents!: number;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  bankBranchCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  medicalAidMembers?: number;
}
```
    </example>
  </pattern>

  <pattern name="entity_interface">
    <description>TypeScript interfaces mirroring Prisma models</description>
    <example>
```typescript
export enum EmploymentType {
  PERMANENT = 'PERMANENT',
  CONTRACT = 'CONTRACT',
  CASUAL = 'CASUAL',
}

export enum PayFrequency {
  MONTHLY = 'MONTHLY',
  WEEKLY = 'WEEKLY',
  DAILY = 'DAILY',
  HOURLY = 'HOURLY',
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
```
    </example>
  </pattern>

  <pattern name="test_structure">
    <description>Real database tests with proper setup/cleanup</description>
    <example>
```typescript
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { CreateStaffDto } from '../../../src/database/dto/staff.dto';
import { EmploymentType, PayFrequency } from '../../../src/database/entities/staff.entity';
import { NotFoundException, ConflictException } from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('StaffRepository', () =&gt; {
  let repository: StaffRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  // Real test data - South African employee
  const testStaffData: CreateStaffDto = {
    tenantId: '', // Set in beforeEach
    firstName: 'Thabo',
    lastName: 'Modise',
    idNumber: '8501015800084', // Valid SA ID format
    taxNumber: '1234567890',
    email: 'thabo@littlestars.co.za',
    phone: '+27821234567',
    dateOfBirth: new Date('1985-01-01'),
    startDate: new Date('2024-01-15'),
    employmentType: EmploymentType.PERMANENT,
    payFrequency: PayFrequency.MONTHLY,
    basicSalaryCents: 1500000, // R15,000.00
    bankName: 'First National Bank',
    bankAccount: '62123456789',
    bankBranchCode: '250655',
    medicalAidMembers: 3,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, StaffRepository],
    }).compile();

    prisma = module.get&lt;PrismaService&gt;(PrismaService);
    repository = module.get&lt;StaffRepository&gt;(StaffRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.payroll.deleteMany({});  // NEW - Payroll before Staff
    await prisma.staff.deleteMany({});     // NEW - Staff before Payment
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

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    testStaffData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  // ... more tests
});
```
    </example>
  </pattern>
</coding_patterns>

<!-- ================================================================== -->
<!-- EXISTING FILE LOCATIONS                                            -->
<!-- ================================================================== -->

<existing_files>
  <file path="prisma/schema.prisma">Prisma schema - ADD Staff and Payroll models here</file>
  <file path="src/database/prisma/prisma.service.ts">Prisma service for DB access</file>
  <file path="src/database/entities/index.ts">Export all entities - ADD staff and payroll exports</file>
  <file path="src/database/dto/index.ts">Export all DTOs - ADD staff and payroll exports</file>
  <file path="src/shared/exceptions/index.ts">Custom exceptions: NotFoundException, ConflictException, DatabaseException</file>
</existing_files>

<!-- ================================================================== -->
<!-- REQUIRED SCHEMA CHANGES                                            -->
<!-- ================================================================== -->

<required_schema_changes>
  <change location="prisma/schema.prisma" section="Tenant model">
    Add relation fields to Tenant model:
    ```
    staff         Staff[]
    payrolls      Payroll[]
    ```
  </change>

  <change location="prisma/schema.prisma" section="After Payment model">
    Add new enums AFTER existing enums:
    ```prisma
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
    ```
  </change>

  <change location="prisma/schema.prisma" section="After Payment model">
    Add Staff and Payroll models
  </change>
</required_schema_changes>

<!-- ================================================================== -->
<!-- INPUT CONTEXT FILES                                                -->
<!-- ================================================================== -->

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Staff</file>
  <file purpose="schema_definition">specs/technical/data-models.md#Payroll</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="repository_pattern">src/database/repositories/payment.repository.ts</file>
  <file purpose="dto_pattern">src/database/dto/payment.dto.ts</file>
  <file purpose="entity_pattern">src/database/entities/payment.entity.ts</file>
  <file purpose="test_pattern">tests/database/repositories/payment.repository.spec.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed (Tenant entity exists)</check>
  <check>TASK-PAY-001 completed (Payment entity exists, 417 tests passing)</check>
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
    - Update ALL existing test files with new cleanup order (payroll, staff before payment)
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
        tenantId             String         @map("tenant_id")
        employeeNumber       String?        @map("employee_number") @db.VarChar(50)
        firstName            String         @map("first_name") @db.VarChar(100)
        lastName             String         @map("last_name") @db.VarChar(100)
        idNumber             String         @map("id_number") @db.VarChar(13)
        taxNumber            String?        @map("tax_number") @db.VarChar(20)
        email                String?        @db.VarChar(255)
        phone                String?        @db.VarChar(20)
        dateOfBirth          DateTime       @map("date_of_birth") @db.Date
        startDate            DateTime       @map("start_date") @db.Date
        endDate              DateTime?      @map("end_date") @db.Date
        employmentType       EmploymentType @map("employment_type")
        payFrequency         PayFrequency   @default(MONTHLY) @map("pay_frequency")
        basicSalaryCents     Int            @map("basic_salary_cents")
        bankName             String?        @map("bank_name") @db.VarChar(100)
        bankAccount          String?        @map("bank_account") @db.VarChar(20)
        bankBranchCode       String?        @map("bank_branch_code") @db.VarChar(10)
        medicalAidMembers    Int            @default(0) @map("medical_aid_members")
        isActive             Boolean        @default(true) @map("is_active")
        createdAt            DateTime       @default(now()) @map("created_at")
        updatedAt            DateTime       @updatedAt @map("updated_at")

        tenant               Tenant         @relation(fields: [tenantId], references: [id])
        payrolls             Payroll[]

        @@unique([tenantId, idNumber])
        @@index([tenantId, isActive])
        @@map("staff")
      }

      model Payroll {
        id                     String        @id @default(uuid())
        tenantId               String        @map("tenant_id")
        staffId                String        @map("staff_id")
        payPeriodStart         DateTime      @map("pay_period_start") @db.Date
        payPeriodEnd           DateTime      @map("pay_period_end") @db.Date
        basicSalaryCents       Int           @map("basic_salary_cents")
        overtimeCents          Int           @default(0) @map("overtime_cents")
        bonusCents             Int           @default(0) @map("bonus_cents")
        otherEarningsCents     Int           @default(0) @map("other_earnings_cents")
        grossSalaryCents       Int           @map("gross_salary_cents")
        payeCents              Int           @map("paye_cents")
        uifEmployeeCents       Int           @map("uif_employee_cents")
        uifEmployerCents       Int           @map("uif_employer_cents")
        otherDeductionsCents   Int           @default(0) @map("other_deductions_cents")
        netSalaryCents         Int           @map("net_salary_cents")
        medicalAidCreditCents  Int           @default(0) @map("medical_aid_credit_cents")
        status                 PayrollStatus @default(DRAFT)
        paymentDate            DateTime?     @map("payment_date") @db.Date
        createdAt              DateTime      @default(now()) @map("created_at")
        updatedAt              DateTime      @updatedAt @map("updated_at")

        tenant                 Tenant        @relation(fields: [tenantId], references: [id])
        staff                  Staff         @relation(fields: [staffId], references: [id])

        @@unique([tenantId, staffId, payPeriodStart])
        @@index([tenantId, status])
        @@index([tenantId, payPeriodStart])
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
      export class StaffFilterDto {...}
    </signature>
    <signature file="src/database/dto/payroll.dto.ts">
      export class CreatePayrollDto {...}
      export class UpdatePayrollDto {...}
      export class PayrollFilterDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary keys (not auto-increment)
    - Must include all fields from technical spec data models
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution (snake_case for DB columns via @map)
    - Migration must be reversible (include down migration)
    - Staff.idNumber must be unique per tenant
    - Payroll (tenantId, staffId, payPeriodStart) must be unique
    - All monetary values stored as cents (integers)
    - medicalAidMembers must be non-negative
    - grossSalaryCents = basicSalaryCents + overtimeCents + bonusCents + otherEarningsCents
    - netSalaryCents = grossSalaryCents - payeCents - uifEmployeeCents - otherDeductionsCents
    - paymentDate only set when status is PAID
    - All existing test files (14 suites) must be updated with new cleanup order
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors (npm run build)
    - All tests pass with: npm test -- --runInBand
    - Total test count increases from 417 to ~490+ (new Staff and Payroll tests)
    - Foreign key constraints work correctly
    - Unique constraints on Staff.idNumber and Payroll composite key work
    - Payroll calculates gross and net correctly
  </verification>
</definition_of_done>

<pseudo_code>
## Step 1: Update Prisma Schema (prisma/schema.prisma)

### 1.1 Add enums AFTER existing enums (after MatchedBy):
```prisma
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
```

### 1.2 Add relation fields to Tenant model (after existing relations):
```prisma
staff         Staff[]
payrolls      Payroll[]
```

### 1.3 Add Staff model AFTER Payment model:
- Use @map for snake_case column names
- Use @db.VarChar for string length limits
- Use @db.Date for date-only fields
- Create foreign key to Tenant
- Create one-to-many relation to Payroll
- Create @@unique on (tenantId, idNumber)
- Create @@index on (tenantId, isActive)

### 1.4 Add Payroll model AFTER Staff model:
- Use @map for snake_case column names
- Create foreign keys to Tenant and Staff
- Create @@unique on (tenantId, staffId, payPeriodStart)
- Create @@index on (tenantId, status)
- Create @@index on (tenantId, payPeriodStart)

## Step 2: Generate Migration
```bash
npx prisma migrate dev --name create_staff_and_payroll
```

## Step 3: Create Entity Interfaces

### 3.1 Create src/database/entities/staff.entity.ts:
- Export EmploymentType enum
- Export PayFrequency enum
- Export IStaff interface

### 3.2 Create src/database/entities/payroll.entity.ts:
- Export PayrollStatus enum
- Export IPayroll interface

### 3.3 Update src/database/entities/index.ts:
```typescript
export * from './staff.entity';
export * from './payroll.entity';
```

## Step 4: Create DTOs

### 4.1 Create src/database/dto/staff.dto.ts:
- CreateStaffDto with full validation
- UpdateStaffDto (Partial, optional fields)
- StaffFilterDto for query filters

### 4.2 Create src/database/dto/payroll.dto.ts:
- CreatePayrollDto with full validation
- UpdatePayrollDto (Partial, optional fields)
- PayrollFilterDto for query filters

### 4.3 Update src/database/dto/index.ts:
```typescript
export * from './staff.dto';
export * from './payroll.dto';
```

## Step 5: Create Repositories

### 5.1 Create src/database/repositories/staff.repository.ts:
Methods:
- create(dto: CreateStaffDto): Promise&lt;Staff&gt;
- findById(id: string): Promise&lt;Staff | null&gt;
- findByIdNumber(tenantId: string, idNumber: string): Promise&lt;Staff | null&gt;
- findByTenantId(tenantId: string, filter?: StaffFilterDto): Promise&lt;Staff[]&gt;
- findActiveByTenantId(tenantId: string): Promise&lt;Staff[]&gt;
- update(id: string, dto: UpdateStaffDto): Promise&lt;Staff&gt;
- deactivate(id: string, endDate?: Date): Promise&lt;Staff&gt;
- delete(id: string): Promise&lt;void&gt;

### 5.2 Create src/database/repositories/payroll.repository.ts:
Methods:
- create(dto: CreatePayrollDto): Promise&lt;Payroll&gt;
- findById(id: string): Promise&lt;Payroll | null&gt;
- findByStaffId(staffId: string, filter?: PayrollFilterDto): Promise&lt;Payroll[]&gt;
- findByTenantId(tenantId: string, filter?: PayrollFilterDto): Promise&lt;Payroll[]&gt;
- findByPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise&lt;Payroll[]&gt;
- update(id: string, dto: UpdatePayrollDto): Promise&lt;Payroll&gt;
- approve(id: string): Promise&lt;Payroll&gt;
- markAsPaid(id: string, paymentDate: Date): Promise&lt;Payroll&gt;
- delete(id: string): Promise&lt;void&gt;

## Step 6: Update ALL Existing Test Files

### 6.1 Files to update (14 test suites):
1. tests/database/repositories/tenant.repository.spec.ts
2. tests/database/repositories/user.repository.spec.ts
3. tests/database/repositories/transaction.repository.spec.ts
4. tests/database/repositories/categorization.repository.spec.ts
5. tests/database/repositories/payee-pattern.repository.spec.ts
6. tests/database/repositories/parent.repository.spec.ts
7. tests/database/repositories/child.repository.spec.ts
8. tests/database/repositories/fee-structure.repository.spec.ts
9. tests/database/repositories/enrollment.repository.spec.ts
10. tests/database/repositories/invoice.repository.spec.ts
11. tests/database/repositories/invoice-line.repository.spec.ts
12. tests/database/repositories/payment.repository.spec.ts
13. tests/database/services/audit-log.service.spec.ts
14. tests/shared/utils/decimal.util.spec.ts

### 6.2 Add these lines at the START of beforeEach cleanup in ALL files:
```typescript
await prisma.payroll.deleteMany({});
await prisma.staff.deleteMany({});
```

## Step 7: Create Test Files

### 7.1 Create tests/database/repositories/staff.repository.spec.ts:
~40 tests covering:
- Initialization
- create (all fields, minimal fields, duplicate idNumber, non-existent tenant)
- findById (exists, not exists)
- findByIdNumber (exists, not exists)
- findByTenantId (with filters: isActive, employmentType, search)
- findActiveByTenantId
- update (fields, non-existent, duplicate idNumber)
- deactivate (sets endDate and isActive=false)
- delete (exists, not exists, cascade to payrolls prevented)
- tenant isolation

### 7.2 Create tests/database/repositories/payroll.repository.spec.ts:
~40 tests covering:
- Initialization
- create (all fields, non-existent staff/tenant, duplicate period)
- findById (exists, not exists)
- findByStaffId (with filters: status, period)
- findByTenantId (with filters: status, period)
- findByPeriod
- update (fields, non-existent)
- approve (DRAFT -> APPROVED, already approved)
- markAsPaid (APPROVED -> PAID with date, wrong status)
- delete (exists, not exists)
- gross/net salary calculation validation
- tenant isolation
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/staff.entity.ts">Staff interface and EmploymentType, PayFrequency enums</file>
  <file path="src/database/entities/payroll.entity.ts">Payroll interface and PayrollStatus enum</file>
  <file path="src/database/dto/staff.dto.ts">CreateStaffDto, UpdateStaffDto, StaffFilterDto with validation</file>
  <file path="src/database/dto/payroll.dto.ts">CreatePayrollDto, UpdatePayrollDto, PayrollFilterDto with validation</file>
  <file path="src/database/repositories/staff.repository.ts">Staff repository with full CRUD</file>
  <file path="src/database/repositories/payroll.repository.ts">Payroll repository with full CRUD and status transitions</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_staff_and_payroll/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/staff.repository.spec.ts">~40 Staff repository tests</file>
  <file path="tests/database/repositories/payroll.repository.spec.ts">~40 Payroll repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add EmploymentType, PayFrequency, PayrollStatus enums; Staff and Payroll models; Tenant relations</file>
  <file path="src/database/entities/index.ts">Export staff and payroll entities</file>
  <file path="src/database/dto/index.ts">Export staff and payroll DTOs</file>
  <file path="tests/database/repositories/tenant.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/user.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/transaction.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/categorization.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/payee-pattern.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/parent.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/child.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/fee-structure.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/enrollment.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/invoice.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/invoice-line.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/repositories/payment.repository.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup</file>
  <file path="tests/database/services/audit-log.service.spec.ts">Add payroll.deleteMany and staff.deleteMany to cleanup if needed</file>
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
  <criterion>ALL 14 existing test suites still pass with updated cleanup order</criterion>
  <criterion>Total test count ~490+ (417 existing + ~80 new)</criterion>
</validation_criteria>

<test_commands>
  <command description="Generate migration">npx prisma migrate dev --name create_staff_and_payroll</command>
  <command description="Reset and reapply all migrations">npx prisma migrate reset --force</command>
  <command description="Build TypeScript">npm run build</command>
  <command description="Run ALL tests (MUST use --runInBand)">npm test -- --runInBand</command>
  <command description="Run Staff tests only">npm test -- staff.repository.spec.ts --runInBand</command>
  <command description="Run Payroll tests only">npm test -- payroll.repository.spec.ts --runInBand</command>
</test_commands>

<lessons_learned>
  <lesson id="L1">
    <title>FK Constraint Cleanup Order</title>
    <description>When adding new entities that have FK relationships, ALL existing test files must be updated to delete the new tables FIRST in the beforeEach cleanup. Failing to do this causes P2003 foreign key constraint violations.</description>
    <action>Always add new table deleteMany calls at the START of the cleanup sequence</action>
  </lesson>
  <lesson id="L2">
    <title>Sequential Test Execution</title>
    <description>Jest runs tests in parallel by default, but all repository tests share the same database. This causes race conditions and test failures.</description>
    <action>ALWAYS run tests with --runInBand flag: npm test -- --runInBand</action>
  </lesson>
  <lesson id="L3">
    <title>Log-Then-Throw Pattern</title>
    <description>Every exception must be logged with full context BEFORE being thrown. This ensures error visibility in production.</description>
    <action>Use this.logger.error() before throwing any exception in repositories</action>
  </lesson>
  <lesson id="L4">
    <title>Real Data Tests Only</title>
    <description>No mocking of database operations. All tests use real PostgreSQL database with real data creation and cleanup.</description>
    <action>Create actual records in beforeEach, never use jest.mock() for Prisma</action>
  </lesson>
  <lesson id="L5">
    <title>South African Context</title>
    <description>Test data should use realistic South African values (phone numbers starting with +27, ZAR amounts in cents, valid ID number formats).</description>
    <action>Use realistic SA test data for authenticity and to catch edge cases</action>
  </lesson>
</lessons_learned>

</task_spec>
