<task_spec id="TASK-SARS-002" version="1.0">

<metadata>
  <title>SARS Submission Entity</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>13</sequence>
  <implements>
    <requirement_ref>REQ-SARS-003</requirement_ref>
    <requirement_ref>REQ-SARS-009</requirement_ref>
    <requirement_ref>REQ-SARS-011</requirement_ref>
    <requirement_ref>REQ-SARS-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task creates the SarsSubmission entity which tracks all SARS tax returns
(VAT201, EMP201, IRP5) for the creche. The model stores calculated tax amounts,
submission status, SARS reference numbers, and the complete return data as JSONB.
A critical feature is the is_finalized flag which makes records immutable after
submission to SARS, ensuring audit compliance. This entity is the foundation for
the SARS return preparation and filing workflow.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#SarsSubmission</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed (Tenant entity exists)</check>
  <check>TASK-CORE-003 completed (User entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create SarsSubmission Prisma model
    - Create SubmissionType enum (VAT201, EMP201, IRP5)
    - Create SubmissionStatus enum (DRAFT, READY, SUBMITTED, ACKNOWLEDGED)
    - Create database migration for sars_submissions table
    - Create TypeScript interfaces for SarsSubmission
    - Create DTOs for SarsSubmission operations
    - Create SarsSubmission repository
    - Support for JSONB document_data storage
    - Support for is_finalized immutability flag
    - Support for VAT and payroll tax amount fields
  </in_scope>
  <out_of_scope>
    - VAT201 calculation logic (TASK-SARS-005)
    - EMP201 calculation logic (TASK-SARS-006)
    - IRP5 generation logic (TASK-SARS-007)
    - API endpoints
    - SARS eFiling integration
    - PDF generation for returns
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      enum SubmissionType {
        VAT201
        EMP201
        IRP5
      }

      enum SubmissionStatus {
        DRAFT
        READY
        SUBMITTED
        ACKNOWLEDGED
      }

      model SarsSubmission {
        id                   String           @id @default(uuid())
        tenantId             String
        submissionType       SubmissionType
        periodStart          DateTime         @db.Date
        periodEnd            DateTime         @db.Date
        deadline             DateTime         @db.Date
        outputVatCents       Int?
        inputVatCents        Int?
        netVatCents          Int?
        totalPayeCents       Int?
        totalUifCents        Int?
        totalSdlCents        Int?
        status               SubmissionStatus @default(DRAFT)
        submittedAt          DateTime?
        submittedBy          String?
        sarsReference        String?
        documentData         Json             @default("{}")
        notes                String?          @db.Text
        isFinalized          Boolean          @default(false)
        createdAt            DateTime         @default(now())
        updatedAt            DateTime         @updatedAt

        tenant               Tenant           @relation(fields: [tenantId], references: [id])
        submitter            User?            @relation(fields: [submittedBy], references: [id])

        @@unique([tenantId, submissionType, periodStart])
        @@index([tenantId, status])
        @@index([deadline])
        @@map("sars_submissions")
      }
    </signature>
    <signature file="src/database/entities/sars-submission.entity.ts">
      export enum SubmissionType {
        VAT201 = 'VAT201',
        EMP201 = 'EMP201',
        IRP5 = 'IRP5'
      }

      export enum SubmissionStatus {
        DRAFT = 'DRAFT',
        READY = 'READY',
        SUBMITTED = 'SUBMITTED',
        ACKNOWLEDGED = 'ACKNOWLEDGED'
      }

      export interface ISarsSubmission {
        id: string;
        tenantId: string;
        submissionType: SubmissionType;
        periodStart: Date;
        periodEnd: Date;
        deadline: Date;
        outputVatCents: number | null;
        inputVatCents: number | null;
        netVatCents: number | null;
        totalPayeCents: number | null;
        totalUifCents: number | null;
        totalSdlCents: number | null;
        status: SubmissionStatus;
        submittedAt: Date | null;
        submittedBy: string | null;
        sarsReference: string | null;
        documentData: Record<string, any>;
        notes: string | null;
        isFinalized: boolean;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/sars-submission.dto.ts">
      export class CreateSarsSubmissionDto {...}
      export class UpdateSarsSubmissionDto {...}
      export class SubmitSarsSubmissionDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - (tenantId, submissionType, periodStart) must be unique
    - VAT fields (outputVatCents, inputVatCents, netVatCents) only for VAT201
    - Payroll fields (totalPayeCents, totalUifCents, totalSdlCents) only for EMP201
    - documentData defaults to empty JSON object {}
    - isFinalized defaults to false
    - Once isFinalized is true, record becomes immutable (enforce in service layer)
    - submittedAt and submittedBy only set when status is SUBMITTED or ACKNOWLEDGED
    - sarsReference only set after SARS acknowledgment
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
    - Foreign key constraints work correctly
    - Unique constraint on (tenantId, submissionType, periodStart) works
    - JSONB storage and retrieval of documentData works
    - isFinalized flag prevents updates in service layer
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum SubmissionType { VAT201, EMP201, IRP5 }
    enum SubmissionStatus { DRAFT, READY, SUBMITTED, ACKNOWLEDGED }

  Add model SarsSubmission with all fields per technical spec
  Use @map("sars_submissions") for snake_case table name
  Use @unique on (tenantId, submissionType, periodStart)
  Create foreign keys to Tenant and User (submittedBy nullable)
  Create indexes on (tenantId, status) and deadline
  Use @db.Date for date fields
  Use @db.Text for notes field
  Use Json type for documentData with @default("{}")

Entity Interface (src/database/entities/sars-submission.entity.ts):
  export enum SubmissionType:
    VAT201 = 'VAT201'
    EMP201 = 'EMP201'
    IRP5 = 'IRP5'

  export enum SubmissionStatus:
    DRAFT = 'DRAFT'
    READY = 'READY'
    SUBMITTED = 'SUBMITTED'
    ACKNOWLEDGED = 'ACKNOWLEDGED'

  export interface ISarsSubmission:
    // All fields with proper types
    // documentData typed as Record<string, any>
    // All cents fields nullable
    // Date fields for periods and deadline

DTOs (src/database/dto/sars-submission.dto.ts):
  export class CreateSarsSubmissionDto:
    @IsUUID() tenantId: string
    @IsEnum(SubmissionType) submissionType: SubmissionType
    @IsDateString() periodStart: string
    @IsDateString() periodEnd: string
    @IsDateString() deadline: string
    @IsOptional() @IsInt() outputVatCents?: number
    @IsOptional() @IsInt() inputVatCents?: number
    @IsOptional() @IsInt() netVatCents?: number
    @IsOptional() @IsInt() totalPayeCents?: number
    @IsOptional() @IsInt() totalUifCents?: number
    @IsOptional() @IsInt() totalSdlCents?: number
    @IsOptional() @IsObject() documentData?: Record<string, any>
    @IsOptional() @IsString() notes?: string

  export class UpdateSarsSubmissionDto:
    // Partial update fields
    // Cannot update if isFinalized is true (enforced in service)

  export class SubmitSarsSubmissionDto:
    @IsUUID() submittedBy: string
    @IsOptional() @IsString() sarsReference?: string

Repository (src/database/repositories/sars-submission.repository.ts):
  @Injectable()
  export class SarsSubmissionRepository:
    constructor(private prisma: PrismaService)

    async create(dto: CreateSarsSubmissionDto): Promise<SarsSubmission>
    async findById(id: string): Promise<SarsSubmission | null>
    async findByTenantAndPeriod(
      tenantId: string,
      submissionType: SubmissionType,
      periodStart: Date
    ): Promise<SarsSubmission | null>
    async findByTenantId(tenantId: string, filters?: SarsFilters): Promise<SarsSubmission[]>
    async findUpcomingDeadlines(daysAhead: number): Promise<SarsSubmission[]>
    async update(id: string, dto: UpdateSarsSubmissionDto): Promise<SarsSubmission>
    async submit(id: string, dto: SubmitSarsSubmissionDto): Promise<SarsSubmission>
    async finalize(id: string): Promise<SarsSubmission>

Migration:
  npx prisma migrate dev --name create_sars_submissions
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/sars-submission.entity.ts">SarsSubmission interface and enums</file>
  <file path="src/database/dto/sars-submission.dto.ts">Create, Update, and Submit DTOs with validation</file>
  <file path="src/database/repositories/sars-submission.repository.ts">SarsSubmission repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_sars_submissions/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/sars-submission.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add SarsSubmission model and enums</file>
  <file path="src/database/entities/index.ts">Export SarsSubmission entities</file>
  <file path="src/database/dto/index.ts">Export SarsSubmission DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates sars_submissions table with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>SarsSubmission entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraint on (tenantId, submissionType, periodStart) works</criterion>
  <criterion>Foreign key constraints work correctly</criterion>
  <criterion>JSONB documentData field stores and retrieves complex objects</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>Deadline index improves query performance for upcoming submissions</criterion>
  <criterion>isFinalized flag prevents updates when true</criterion>
  <criterion>Status transitions work correctly (DRAFT -> READY -> SUBMITTED -> ACKNOWLEDGED)</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_sars_submissions</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "SarsSubmissionRepository"</command>
</test_commands>

</task_spec>
