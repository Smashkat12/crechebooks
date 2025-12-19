<task_spec id="TASK-CORE-002" version="1.0">

<metadata>
  <title>Tenant Entity and Migration</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>2</sequence>
  <implements>
    <requirement_ref>NFR-SCAL-001</requirement_ref>
    <requirement_ref>NFR-SEC-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task creates the Tenant entity which is the foundation for multi-tenancy in
CrecheBooks. Every other entity in the system will have a tenant_id foreign key.
The tenant represents a single creche organization with their business details,
Xero connection, and configuration.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Tenant</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-001 completed</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Tenant Prisma model
    - Create database migration for tenants table
    - Create TypeScript interfaces for Tenant
    - Create DTOs for Tenant operations
    - Create Tenant repository
    - Set up row-level security policy
  </in_scope>
  <out_of_scope>
    - User entity (TASK-CORE-003)
    - Business logic for tenant management
    - API endpoints
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model Tenant {
        id                   String   @id @default(uuid())
        name                 String
        tradingName          String?
        registrationNumber   String?
        vatNumber            String?
        taxStatus            TaxStatus @default(NOT_REGISTERED)
        addressLine1         String
        addressLine2         String?
        city                 String
        province             String
        postalCode           String
        phone                String
        email                String   @unique
        xeroTenantId         String?  @unique
        subscriptionStatus   SubscriptionStatus @default(TRIAL)
        invoiceDayOfMonth    Int      @default(1)
        invoiceDueDays       Int      @default(7)
        createdAt            DateTime @default(now())
        updatedAt            DateTime @updatedAt

        @@map("tenants")
      }

      enum TaxStatus {
        VAT_REGISTERED
        NOT_REGISTERED
      }

      enum SubscriptionStatus {
        TRIAL
        ACTIVE
        SUSPENDED
        CANCELLED
      }
    </signature>
    <signature file="src/database/entities/tenant.entity.ts">
      export interface ITenant {
        id: string;
        name: string;
        tradingName: string | null;
        registrationNumber: string | null;
        vatNumber: string | null;
        taxStatus: TaxStatus;
        addressLine1: string;
        addressLine2: string | null;
        city: string;
        province: string;
        postalCode: string;
        phone: string;
        email: string;
        xeroTenantId: string | null;
        subscriptionStatus: SubscriptionStatus;
        invoiceDayOfMonth: number;
        invoiceDueDays: number;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/tenant.dto.ts">
      export class CreateTenantDto {...}
      export class UpdateTenantDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - Email must be unique
    - xeroTenantId must be unique when not null
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
    enum TaxStatus { VAT_REGISTERED, NOT_REGISTERED }
    enum SubscriptionStatus { TRIAL, ACTIVE, SUSPENDED, CANCELLED }

  Add model Tenant with all fields per technical spec
  Use @map("tenants") for snake_case table name
  Use @unique on email and xeroTenantId

Entity Interface (src/database/entities/tenant.entity.ts):
  export enum TaxStatus:
    VAT_REGISTERED = 'VAT_REGISTERED'
    NOT_REGISTERED = 'NOT_REGISTERED'

  export enum SubscriptionStatus:
    TRIAL = 'TRIAL'
    ACTIVE = 'ACTIVE'
    SUSPENDED = 'SUSPENDED'
    CANCELLED = 'CANCELLED'

  export interface ITenant:
    // All fields with proper types

DTOs (src/database/dto/tenant.dto.ts):
  export class CreateTenantDto:
    @IsString() @MinLength(1) name: string
    @IsOptional() @IsString() tradingName?: string
    @IsEmail() email: string
    // ... all required fields with validation

Repository (src/database/repositories/tenant.repository.ts):
  @Injectable()
  export class TenantRepository:
    constructor(private prisma: PrismaService)

    async create(dto: CreateTenantDto): Promise<Tenant>
    async findById(id: string): Promise<Tenant | null>
    async findByEmail(email: string): Promise<Tenant | null>
    async findByXeroTenantId(xeroId: string): Promise<Tenant | null>
    async update(id: string, dto: UpdateTenantDto): Promise<Tenant>

Migration:
  npx prisma migrate dev --name create_tenants
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/tenant.entity.ts">Tenant interface and enums</file>
  <file path="src/database/dto/tenant.dto.ts">Create and Update DTOs with validation</file>
  <file path="src/database/repositories/tenant.repository.ts">Tenant repository</file>
  <file path="src/database/entities/index.ts">Entity exports</file>
  <file path="src/database/dto/index.ts">DTO exports</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_tenants/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/tenant.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Tenant model and enums</file>
  <file path="src/app.module.ts">Import PrismaModule if not already</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates tenants table with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>Tenant entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraints on email and xeroTenantId work</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_tenants</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "TenantRepository"</command>
</test_commands>

</task_spec>
