<task_spec id="TASK-PAY-001" version="2.0">

<metadata>
  <title>Payment Entity and Types</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>11</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
    <requirement_ref>REQ-PAY-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-TRANS-001</task_ref>
    <task_ref status="complete">TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL INSTRUCTIONS FOR AI AGENT -->
<!-- ============================================ -->

<critical_instructions>
  <rule priority="1">NO BACKWARDS COMPATIBILITY - fail fast for debugging</rule>
  <rule priority="2">NO WORKAROUNDS OR FALLBACKS - if something fails, ERROR OUT with robust logging</rule>
  <rule priority="3">NO MOCK DATA IN TESTS - use real PostgreSQL database for integration tests</rule>
  <rule priority="4">LOG THEN THROW - always log errors with full context before throwing</rule>
  <rule priority="5">Tests must FAIL if project is broken - never pass falsely</rule>
  <rule priority="6">Follow constitution.md error_handling rules exactly</rule>
</critical_instructions>

<!-- ============================================ -->
<!-- CURRENT PROJECT STATE (as of 2025-12-20) -->
<!-- ============================================ -->

<project_state>
  <completed_tasks>
    <task id="TASK-CORE-001">Project Setup and Base Configuration</task>
    <task id="TASK-CORE-002">Tenant Entity and Migration</task>
    <task id="TASK-CORE-003">User Entity and Authentication Types</task>
    <task id="TASK-CORE-004">Audit Log Entity and Trail System</task>
    <task id="TASK-TRANS-001">Transaction Entity and Migration</task>
    <task id="TASK-TRANS-002">Categorization Entity and Types</task>
    <task id="TASK-TRANS-003">Payee Pattern Entity</task>
    <task id="TASK-BILL-001">Parent and Child Entities</task>
    <task id="TASK-BILL-002">Fee Structure and Enrollment Entities</task>
    <task id="TASK-BILL-003">Invoice and Invoice Line Entities</task>
  </completed_tasks>

  <current_test_count>378 passing tests</current_test_count>
  <test_command>npx jest --runInBand</test_command>

  <existing_enums_in_schema>
    TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource,
    TransactionStatus, VatType, CategorizationSource, Gender, PreferredContact,
    FeeType, EnrollmentStatus, InvoiceStatus, DeliveryMethod, DeliveryStatus, LineType
  </existing_enums_in_schema>

  <existing_models_in_schema>
    Tenant, User, AuditLog, Transaction, Categorization, PayeePattern,
    FeeStructure, Enrollment, Parent, Child, Invoice, InvoiceLine
  </existing_models_in_schema>
</project_state>

<!-- ============================================ -->
<!-- LESSONS LEARNED FROM PREVIOUS TASKS -->
<!-- ============================================ -->

<lessons_learned>
  <lesson id="1" severity="critical">
    <title>Test Cleanup Order - FK Dependencies</title>
    <problem>Foreign key constraint violations during test cleanup</problem>
    <solution>Delete in FK order - leaf tables first. The EXACT order is:
      1. Payment (new - has FK to Transaction, Invoice)
      2. InvoiceLine
      3. Invoice
      4. Enrollment
      5. FeeStructure
      6. Child
      7. Parent
      8. PayeePattern
      9. Categorization
      10. Transaction
      11. User
      12. Tenant
    </solution>
    <code_pattern>
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
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
});
    </code_pattern>
  </lesson>

  <lesson id="2" severity="critical">
    <title>Date-Only Fields (@db.Date) Comparison</title>
    <problem>Test failed comparing timestamps on date-only fields</problem>
    <solution>Date-only fields strip time to 00:00:00 UTC. Compare year/month/day, not milliseconds.</solution>
    <code_pattern>
// WRONG - fails on @db.Date fields:
expect(Math.abs(now.getTime() - dateField.getTime())).toBeLessThan(5000);

// CORRECT - compare date components:
expect(dateField.getFullYear()).toBe(now.getFullYear());
expect(dateField.getMonth()).toBe(now.getMonth());
expect(dateField.getDate()).toBe(now.getDate());
    </code_pattern>
  </lesson>

  <lesson id="3" severity="critical">
    <title>Prisma Client Regeneration</title>
    <problem>Build failed with "Module '@prisma/client' has no exported member 'Payment'"</problem>
    <solution>After schema changes, MUST run: pnpm prisma generate</solution>
  </lesson>

  <lesson id="4" severity="high">
    <title>Test Race Conditions</title>
    <problem>Tests failed intermittently due to shared database state</problem>
    <solution>Always run tests with --runInBand flag: npx jest --runInBand</solution>
  </lesson>

  <lesson id="5" severity="high">
    <title>Error Handling Pattern</title>
    <problem>Constitution requires log-then-throw pattern</problem>
    <solution>Always log with context before throwing. Use existing exception classes.</solution>
    <code_pattern>
// From constitution.md error_handling:
try {
  // operation
} catch (error) {
  this.logger.error(
    `Failed to [operation]: ${JSON.stringify(dto)}`,
    error instanceof Error ? error.stack : String(error),
  );

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      throw new NotFoundException('Entity', id);
    }
  }
  throw new DatabaseException('operation', 'Failed to...', error instanceof Error ? error : undefined);
}
    </code_pattern>
  </lesson>

  <lesson id="6" severity="medium">
    <title>Decimal Fields in Prisma</title>
    <problem>Prisma returns Decimal as Prisma.Decimal, not number</problem>
    <solution>Use @db.Decimal(precision, scale) and handle conversion in TypeScript interface as number</solution>
  </lesson>

  <lesson id="7" severity="high">
    <title>Nullable FK Relations</title>
    <problem>Payment.transactionId can be null (for manual payments not from bank feed)</problem>
    <solution>Use optional relation syntax in Prisma: transaction Transaction? @relation(...)</solution>
  </lesson>
</lessons_learned>

<context>
This task creates the Payment entity which links bank transactions to invoices,
enabling automated payment matching and allocation. The Payment model supports
exact matches, partial payments, overpayments, and manual allocations. It tracks
match confidence scores and allows reversal of incorrect matches. This is a
critical entity for the automated payment matching workflow and Xero synchronization.

South African context:
- Currency: ZAR (stored as cents)
- All amounts stored as integers (cents) per constitution.md
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Payment</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>TASK-BILL-003 completed (Invoice entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Payment Prisma model
    - Create MatchType enum (EXACT, PARTIAL, MANUAL, OVERPAYMENT)
    - Create MatchedBy enum (AI_AUTO, USER)
    - Create database migration for payments table
    - Create TypeScript interfaces for Payment
    - Create DTOs for Payment operations
    - Create Payment repository
    - Support for payment reversal tracking
  </in_scope>
  <out_of_scope>
    - Payment matching logic (TASK-PAY-002)
    - Arrears calculation (TASK-PAY-003)
    - API endpoints
    - Xero payment sync service
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      enum MatchType {
        EXACT
        PARTIAL
        MANUAL
        OVERPAYMENT
      }

      enum MatchedBy {
        AI_AUTO
        USER
      }

      model Payment {
        id                   String   @id @default(uuid())
        tenantId             String
        xeroPaymentId        String?  @unique
        transactionId        String?
        invoiceId            String
        amountCents          Int
        paymentDate          DateTime @db.Date
        reference            String?
        matchType            MatchType
        matchConfidence      Decimal?  @db.Decimal(5, 2)
        matchedBy            MatchedBy
        isReversed           Boolean  @default(false)
        reversedAt           DateTime?
        reversalReason       String?  @db.Text
        createdAt            DateTime @default(now())
        updatedAt            DateTime @updatedAt

        tenant               Tenant   @relation(fields: [tenantId], references: [id])
        transaction          Transaction? @relation(fields: [transactionId], references: [id])
        invoice              Invoice  @relation(fields: [invoiceId], references: [id])

        @@index([tenantId, transactionId])
        @@index([tenantId, invoiceId])
        @@index([xeroPaymentId])
        @@map("payments")
      }
    </signature>
    <signature file="src/database/entities/payment.entity.ts">
      export enum MatchType {
        EXACT = 'EXACT',
        PARTIAL = 'PARTIAL',
        MANUAL = 'MANUAL',
        OVERPAYMENT = 'OVERPAYMENT'
      }

      export enum MatchedBy {
        AI_AUTO = 'AI_AUTO',
        USER = 'USER'
      }

      export interface IPayment {
        id: string;
        tenantId: string;
        xeroPaymentId: string | null;
        transactionId: string | null;
        invoiceId: string;
        amountCents: number;
        paymentDate: Date;
        reference: string | null;
        matchType: MatchType;
        matchConfidence: number | null;
        matchedBy: MatchedBy;
        isReversed: boolean;
        reversedAt: Date | null;
        reversalReason: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/payment.dto.ts">
      export class CreatePaymentDto {...}
      export class UpdatePaymentDto {...}
      export class ReversePaymentDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - xeroPaymentId must be unique when not null
    - amountCents must be positive integer
    - matchConfidence must be 0-100 or null
    - transactionId can be null (for manual payments not from bank feed)
    - invoiceId must always be present (not null)
    - isReversed defaults to false
    - reversedAt and reversalReason only set when isReversed is true
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
    - Foreign key constraints to Transaction and Invoice work
    - Payment reversal fields update correctly
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum MatchType { EXACT, PARTIAL, MANUAL, OVERPAYMENT }
    enum MatchedBy { AI_AUTO, USER }

  Add model Payment with all fields per technical spec
  Use @map("payments") for snake_case table name
  Use @unique on xeroPaymentId
  Create foreign key to Tenant, Transaction (nullable), Invoice (not null)
  Create indexes on (tenantId, transactionId), (tenantId, invoiceId), xeroPaymentId
  Use @db.Date for paymentDate field
  Use @db.Decimal(5,2) for matchConfidence
  Use @db.Text for reversalReason

Entity Interface (src/database/entities/payment.entity.ts):
  export enum MatchType:
    EXACT = 'EXACT'
    PARTIAL = 'PARTIAL'
    MANUAL = 'MANUAL'
    OVERPAYMENT = 'OVERPAYMENT'

  export enum MatchedBy:
    AI_AUTO = 'AI_AUTO'
    USER = 'USER'

  export interface IPayment:
    // All fields with proper types
    // Note: transactionId is nullable for manual payments
    // matchConfidence is nullable

DTOs (src/database/dto/payment.dto.ts):
  export class CreatePaymentDto:
    @IsUUID() tenantId: string
    @IsOptional() @IsString() xeroPaymentId?: string
    @IsOptional() @IsUUID() transactionId?: string
    @IsUUID() invoiceId: string
    @IsInt() @Min(1) amountCents: number
    @IsDateString() paymentDate: string
    @IsOptional() @IsString() reference?: string
    @IsEnum(MatchType) matchType: MatchType
    @IsOptional() @IsNumber() @Min(0) @Max(100) matchConfidence?: number
    @IsEnum(MatchedBy) matchedBy: MatchedBy

  export class ReversePaymentDto:
    @IsString() @MinLength(1) reversalReason: string

Repository (src/database/repositories/payment.repository.ts):
  @Injectable()
  export class PaymentRepository:
    constructor(private prisma: PrismaService)

    async create(dto: CreatePaymentDto): Promise<Payment>
    async findById(id: string): Promise<Payment | null>
    async findByTransactionId(transactionId: string): Promise<Payment[]>
    async findByInvoiceId(invoiceId: string): Promise<Payment[]>
    async findByXeroPaymentId(xeroId: string): Promise<Payment | null>
    async findByTenantId(tenantId: string, filters?: PaymentFilters): Promise<Payment[]>
    async reverse(id: string, dto: ReversePaymentDto): Promise<Payment>
    async update(id: string, dto: UpdatePaymentDto): Promise<Payment>

Migration:
  npx prisma migrate dev --name create_payments
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/payment.entity.ts">Payment interface and enums</file>
  <file path="src/database/dto/payment.dto.ts">Create, Update, and Reverse DTOs with validation</file>
  <file path="src/database/repositories/payment.repository.ts">Payment repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_payments/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/payment.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Payment model and enums</file>
  <file path="src/database/entities/index.ts">Export Payment entities</file>
  <file path="src/database/dto/index.ts">Export Payment DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates payments table with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>Payment entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Foreign key constraints work correctly</criterion>
  <criterion>xeroPaymentId unique constraint works</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>Payment reversal updates isReversed, reversedAt, and reversalReason</criterion>
  <criterion>Indexes improve query performance for common lookups</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_payments</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "PaymentRepository"</command>
</test_commands>

</task_spec>
