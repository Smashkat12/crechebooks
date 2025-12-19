<task_spec id="TASK-TRANS-001" version="1.0">

<metadata>
  <title>Transaction Entity and Migration</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>5</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Transaction entity which represents bank transactions imported
from bank feeds, CSV, or PDF files. Transactions are the core data that flows through
the categorization, payment matching, and reconciliation systems. Each transaction
belongs to a tenant and may link to categorizations and payments.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Transaction</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="tenant_entity">src/database/entities/tenant.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed (Tenant entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database has tenants table</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Transaction Prisma model with tenant relation
    - Create database migration for transactions table
    - Create TypeScript interfaces for Transaction
    - Create DTOs for Transaction operations
    - Create Transaction repository
    - Create indexes for performance
  </in_scope>
  <out_of_scope>
    - Categorization entity (TASK-TRANS-002)
    - Payment entity (TASK-PAY-001)
    - Import logic (TASK-TRANS-011)
    - Categorization logic (TASK-TRANS-012)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model Transaction {
        id                  String   @id @default(uuid())
        tenantId            String   @map("tenant_id")
        xeroTransactionId   String?  @map("xero_transaction_id")
        bankAccount         String   @map("bank_account")
        date                DateTime @db.Date
        description         String
        payeeName           String?  @map("payee_name")
        reference           String?
        amountCents         Int      @map("amount_cents")
        isCredit            Boolean  @map("is_credit")
        source              ImportSource
        importBatchId       String?  @map("import_batch_id")
        status              TransactionStatus @default(PENDING)
        isReconciled        Boolean  @default(false) @map("is_reconciled")
        reconciledAt        DateTime? @map("reconciled_at")
        isDeleted           Boolean  @default(false) @map("is_deleted")
        deletedAt           DateTime? @map("deleted_at")
        createdAt           DateTime @default(now()) @map("created_at")
        updatedAt           DateTime @updatedAt @map("updated_at")

        tenant              Tenant   @relation(fields: [tenantId], references: [id])

        @@index([tenantId, date])
        @@index([tenantId, status])
        @@index([tenantId, payeeName])
        @@index([xeroTransactionId])
        @@index([tenantId, isReconciled])
        @@map("transactions")
      }

      enum ImportSource {
        BANK_FEED
        CSV_IMPORT
        PDF_IMPORT
        MANUAL
      }

      enum TransactionStatus {
        PENDING
        CATEGORIZED
        REVIEW_REQUIRED
        SYNCED
      }
    </signature>
    <signature file="src/database/entities/transaction.entity.ts">
      export interface ITransaction {
        id: string;
        tenantId: string;
        xeroTransactionId: string | null;
        bankAccount: string;
        date: Date;
        description: string;
        payeeName: string | null;
        reference: string | null;
        amountCents: number;
        isCredit: boolean;
        source: ImportSource;
        importBatchId: string | null;
        status: TransactionStatus;
        isReconciled: boolean;
        reconciledAt: Date | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }

      export enum ImportSource {...}
      export enum TransactionStatus {...}
    </signature>
    <signature file="src/database/dto/transaction.dto.ts">
      export class CreateTransactionDto {...}
      export class UpdateTransactionDto {...}
      export class TransactionFilterDto {...}
    </signature>
    <signature file="src/database/repositories/transaction.repository.ts">
      export class TransactionRepository {
        async create(dto: CreateTransactionDto): Promise&lt;Transaction&gt;
        async findById(tenantId: string, id: string): Promise&lt;Transaction | null&gt;
        async findByTenant(tenantId: string, filter: TransactionFilterDto): Promise&lt;PaginatedResult&lt;Transaction&gt;&gt;
        async findPending(tenantId: string): Promise&lt;Transaction[]&gt;
        async update(tenantId: string, id: string, dto: UpdateTransactionDto): Promise&lt;Transaction&gt;
        async softDelete(tenantId: string, id: string): Promise&lt;void&gt;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use tenant_id for multi-tenant isolation
    - All queries must filter by tenantId
    - Must store amounts in cents (integer)
    - Must use soft delete (never hard delete transactions)
    - Must NOT use 'any' type anywhere
    - Migration must be reversible
    - Must have indexes for common query patterns
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - Migration reverts successfully
    - TypeScript compiles without errors
    - Repository queries always include tenantId filter
    - Unit tests for repository pass
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum ImportSource { BANK_FEED, CSV_IMPORT, PDF_IMPORT, MANUAL }
    enum TransactionStatus { PENDING, CATEGORIZED, REVIEW_REQUIRED, SYNCED }

  Add model Transaction:
    - All fields per technical spec
    - Relation to Tenant
    - Indexes for performance:
      - (tenantId, date) for date range queries
      - (tenantId, status) for pending/review queries
      - (tenantId, payeeName) for pattern matching
      - (xeroTransactionId) for sync lookups
      - (tenantId, isReconciled) for reconciliation

  Update Tenant model:
    Add: transactions Transaction[]

Entity Interface (src/database/entities/transaction.entity.ts):
  export enum ImportSource:
    BANK_FEED = 'BANK_FEED'
    CSV_IMPORT = 'CSV_IMPORT'
    PDF_IMPORT = 'PDF_IMPORT'
    MANUAL = 'MANUAL'

  export enum TransactionStatus:
    PENDING = 'PENDING'
    CATEGORIZED = 'CATEGORIZED'
    REVIEW_REQUIRED = 'REVIEW_REQUIRED'
    SYNCED = 'SYNCED'

  export interface ITransaction:
    // All fields with proper TypeScript types

  // Computed helper
  export function getAmountAsDecimal(tx: ITransaction): Decimal
    return Money.fromCents(tx.amountCents)

DTOs (src/database/dto/transaction.dto.ts):
  export class CreateTransactionDto:
    @IsUUID() tenantId: string
    @IsString() bankAccount: string
    @IsDate() date: Date
    @IsString() description: string
    @IsOptional() @IsString() payeeName?: string
    @IsInt() amountCents: number
    @IsBoolean() isCredit: boolean
    @IsEnum(ImportSource) source: ImportSource

  export class TransactionFilterDto:
    @IsOptional() status?: TransactionStatus
    @IsOptional() @IsDate() dateFrom?: Date
    @IsOptional() @IsDate() dateTo?: Date
    @IsOptional() @IsBoolean() isReconciled?: boolean
    @IsOptional() @IsString() search?: string
    @IsInt() @Min(1) page: number = 1
    @IsInt() @Min(1) @Max(100) limit: number = 20

Repository (src/database/repositories/transaction.repository.ts):
  @Injectable()
  export class TransactionRepository:
    constructor(private prisma: PrismaService)

    async findByTenant(tenantId: string, filter: TransactionFilterDto):
      // ALWAYS filter by tenantId first
      const where = { tenantId, isDeleted: false }
      if (filter.status) where.status = filter.status
      if (filter.dateFrom) where.date = { gte: filter.dateFrom }
      // ... pagination logic

    async softDelete(tenantId: string, id: string):
      // Soft delete - never hard delete
      return this.prisma.transaction.update({
        where: { id, tenantId },
        data: { isDeleted: true, deletedAt: new Date() }
      })
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/transaction.entity.ts">Transaction interface and enums</file>
  <file path="src/database/dto/transaction.dto.ts">Create, Update, and Filter DTOs</file>
  <file path="src/database/repositories/transaction.repository.ts">Transaction repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_transactions/migration.sql">Migration</file>
  <file path="tests/database/repositories/transaction.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Transaction model and enums; update Tenant relation</file>
  <file path="src/database/entities/index.ts">Export Transaction</file>
  <file path="src/database/dto/index.ts">Export Transaction DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates transactions table with all columns</criterion>
  <criterion>All indexes created for performance</criterion>
  <criterion>Foreign key to tenants table exists</criterion>
  <criterion>Soft delete works correctly</criterion>
  <criterion>Repository always filters by tenantId</criterion>
  <criterion>Pagination works correctly</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_transactions</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "TransactionRepository"</command>
</test_commands>

</task_spec>
