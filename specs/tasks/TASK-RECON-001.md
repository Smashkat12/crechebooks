<task_spec id="TASK-RECON-001" version="1.0">

<metadata>
  <title>Reconciliation Entity</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>14</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task creates the Reconciliation entity which tracks bank reconciliation
processes for the creche. The model stores opening and closing balances,
calculated balances from transactions, and identifies discrepancies. Each
reconciliation is tied to a specific bank account and period. The reconciliation
status helps accountants track which periods have been verified and which need
attention due to discrepancies.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Reconciliation</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>TASK-CORE-003 completed (User entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Reconciliation Prisma model
    - Create ReconciliationStatus enum (IN_PROGRESS, RECONCILED, DISCREPANCY)
    - Create database migration for reconciliations table
    - Create TypeScript interfaces for Reconciliation
    - Create DTOs for Reconciliation operations
    - Create Reconciliation repository
    - Support for balance tracking (opening, closing, calculated, discrepancy)
    - Support for reconciled_by and reconciled_at tracking
  </in_scope>
  <out_of_scope>
    - Reconciliation logic and automation (TASK-RECON-002)
    - Transaction matching during reconciliation (TASK-RECON-003)
    - Discrepancy analysis (TASK-RECON-004)
    - API endpoints
    - Reconciliation reports
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      enum ReconciliationStatus {
        IN_PROGRESS
        RECONCILED
        DISCREPANCY
      }

      model Reconciliation {
        id                     String               @id @default(uuid())
        tenantId               String
        bankAccount            String
        periodStart            DateTime             @db.Date
        periodEnd              DateTime             @db.Date
        openingBalanceCents    Int
        closingBalanceCents    Int
        calculatedBalanceCents Int
        discrepancyCents       Int                  @default(0)
        status                 ReconciliationStatus @default(IN_PROGRESS)
        reconciledBy           String?
        reconciledAt           DateTime?
        notes                  String?              @db.Text
        createdAt              DateTime             @default(now())
        updatedAt              DateTime             @updatedAt

        tenant                 Tenant               @relation(fields: [tenantId], references: [id])
        reconciler             User?                @relation(fields: [reconciledBy], references: [id])

        @@unique([tenantId, bankAccount, periodStart])
        @@map("reconciliations")
      }
    </signature>
    <signature file="src/database/entities/reconciliation.entity.ts">
      export enum ReconciliationStatus {
        IN_PROGRESS = 'IN_PROGRESS',
        RECONCILED = 'RECONCILED',
        DISCREPANCY = 'DISCREPANCY'
      }

      export interface IReconciliation {
        id: string;
        tenantId: string;
        bankAccount: string;
        periodStart: Date;
        periodEnd: Date;
        openingBalanceCents: number;
        closingBalanceCents: number;
        calculatedBalanceCents: number;
        discrepancyCents: number;
        status: ReconciliationStatus;
        reconciledBy: string | null;
        reconciledAt: Date | null;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/reconciliation.dto.ts">
      export class CreateReconciliationDto {...}
      export class UpdateReconciliationDto {...}
      export class CompleteReconciliationDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - (tenantId, bankAccount, periodStart) must be unique
    - All balance fields stored as cents (integers)
    - discrepancyCents = closingBalanceCents - calculatedBalanceCents
    - discrepancyCents defaults to 0
    - reconciledBy and reconciledAt only set when status is RECONCILED
    - status defaults to IN_PROGRESS
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
    - Foreign key constraints work correctly
    - Unique constraint on (tenantId, bankAccount, periodStart) works
    - Discrepancy calculation is correct
    - Repository CRUD operations work correctly
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enum:
    enum ReconciliationStatus { IN_PROGRESS, RECONCILED, DISCREPANCY }

  Add model Reconciliation with all fields per technical spec
  Use @map("reconciliations") for snake_case table name
  Use @unique on (tenantId, bankAccount, periodStart)
  Create foreign keys to Tenant and User (reconciledBy nullable)
  Use @db.Date for date fields
  Use @db.Text for notes field

Entity Interface (src/database/entities/reconciliation.entity.ts):
  export enum ReconciliationStatus:
    IN_PROGRESS = 'IN_PROGRESS'
    RECONCILED = 'RECONCILED'
    DISCREPANCY = 'DISCREPANCY'

  export interface IReconciliation:
    // All fields with proper types
    // All balance fields are integers (cents)
    // reconciledBy and reconciledAt are nullable

DTOs (src/database/dto/reconciliation.dto.ts):
  export class CreateReconciliationDto:
    @IsUUID() tenantId: string
    @IsString() @MinLength(1) bankAccount: string
    @IsDateString() periodStart: string
    @IsDateString() periodEnd: string
    @IsInt() openingBalanceCents: number
    @IsInt() closingBalanceCents: number
    @IsInt() calculatedBalanceCents: number
    @IsOptional() @IsString() notes?: string

  export class UpdateReconciliationDto:
    @IsOptional() @IsInt() openingBalanceCents?: number
    @IsOptional() @IsInt() closingBalanceCents?: number
    @IsOptional() @IsInt() calculatedBalanceCents?: number
    @IsOptional() @IsString() notes?: string

  export class CompleteReconciliationDto:
    @IsUUID() reconciledBy: string
    @IsEnum(ReconciliationStatus) status: ReconciliationStatus

Repository (src/database/repositories/reconciliation.repository.ts):
  @Injectable()
  export class ReconciliationRepository:
    constructor(private prisma: PrismaService)

    async create(dto: CreateReconciliationDto): Promise<Reconciliation>
    async findById(id: string): Promise<Reconciliation | null>
    async findByTenantAndAccount(
      tenantId: string,
      bankAccount: string,
      periodStart: Date
    ): Promise<Reconciliation | null>
    async findByTenantId(tenantId: string, filters?: ReconciliationFilters): Promise<Reconciliation[]>
    async findByBankAccount(tenantId: string, bankAccount: string): Promise<Reconciliation[]>
    async update(id: string, dto: UpdateReconciliationDto): Promise<Reconciliation>
    async complete(id: string, dto: CompleteReconciliationDto): Promise<Reconciliation>
    async calculateDiscrepancy(id: string): Promise<Reconciliation>

Migration:
  npx prisma migrate dev --name create_reconciliations
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/reconciliation.entity.ts">Reconciliation interface and enums</file>
  <file path="src/database/dto/reconciliation.dto.ts">Create, Update, and Complete DTOs with validation</file>
  <file path="src/database/repositories/reconciliation.repository.ts">Reconciliation repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_reconciliations/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/reconciliation.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Reconciliation model and enum</file>
  <file path="src/database/entities/index.ts">Export Reconciliation entities</file>
  <file path="src/database/dto/index.ts">Export Reconciliation DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates reconciliations table with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>Reconciliation entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraint on (tenantId, bankAccount, periodStart) works</criterion>
  <criterion>Foreign key constraints work correctly</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>Discrepancy calculation (closing - calculated) works correctly</criterion>
  <criterion>Status transitions work correctly (IN_PROGRESS -> RECONCILED/DISCREPANCY)</criterion>
  <criterion>reconciledBy and reconciledAt only set when status is RECONCILED</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_reconciliations</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "ReconciliationRepository"</command>
</test_commands>

</task_spec>
