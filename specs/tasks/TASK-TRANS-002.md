<task_spec id="TASK-TRANS-002" version="1.0">

<metadata>
  <title>Categorization Entity and Types</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>6</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Categorization entity which stores AI-generated and user-reviewed
categorization decisions for transactions. Each categorization links to a transaction and
includes confidence scores, reasoning, VAT handling, and split transaction support.
Categorizations can be created automatically by AI, suggested to users, or manually
overridden. This is a critical component for the automated accounting workflow.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Categorization</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database has transactions table</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Categorization Prisma model with transaction relation
    - Create VatType enum (STANDARD, ZERO_RATED, EXEMPT, NO_VAT)
    - Create CategorizationSource enum (AI_AUTO, AI_SUGGESTED, USER_OVERRIDE, RULE_BASED)
    - Create database migration for categorizations table
    - Create TypeScript interfaces for Categorization
    - Create DTOs for Categorization operations
    - Create Categorization repository
    - Support split transactions with split_amount_cents field
    - Create indexes for performance
  </in_scope>
  <out_of_scope>
    - Categorization AI logic (TASK-TRANS-012)
    - Pattern learning (TASK-TRANS-013)
    - Xero account code integration (TASK-TRANS-014)
    - User review UI (TASK-TRANS-033)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model Categorization {
        id                  String   @id @default(uuid())
        transactionId       String   @map("transaction_id")
        accountCode         String   @map("account_code")
        accountName         String   @map("account_name")
        confidenceScore     Decimal  @map("confidence_score") @db.Decimal(5, 2)
        reasoning           String?
        source              CategorizationSource
        isSplit             Boolean  @default(false) @map("is_split")
        splitAmountCents    Int?     @map("split_amount_cents")
        vatAmountCents      Int?     @map("vat_amount_cents")
        vatType             VatType  @default(STANDARD) @map("vat_type")
        reviewedBy          String?  @map("reviewed_by")
        reviewedAt          DateTime? @map("reviewed_at")
        createdAt           DateTime @default(now()) @map("created_at")
        updatedAt           DateTime @updatedAt @map("updated_at")

        transaction         Transaction @relation(fields: [transactionId], references: [id])
        reviewer            User?       @relation(fields: [reviewedBy], references: [id])

        @@index([transactionId])
        @@index([accountCode])
        @@map("categorizations")
      }

      enum VatType {
        STANDARD
        ZERO_RATED
        EXEMPT
        NO_VAT
      }

      enum CategorizationSource {
        AI_AUTO
        AI_SUGGESTED
        USER_OVERRIDE
        RULE_BASED
      }
    </signature>
    <signature file="src/database/entities/categorization.entity.ts">
      export interface ICategorization {
        id: string;
        transactionId: string;
        accountCode: string;
        accountName: string;
        confidenceScore: number;
        reasoning: string | null;
        source: CategorizationSource;
        isSplit: boolean;
        splitAmountCents: number | null;
        vatAmountCents: number | null;
        vatType: VatType;
        reviewedBy: string | null;
        reviewedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }

      export enum VatType {...}
      export enum CategorizationSource {...}
    </signature>
    <signature file="src/database/dto/categorization.dto.ts">
      export class CreateCategorizationDto {...}
      export class UpdateCategorizationDto {...}
      export class ReviewCategorizationDto {...}
      export class CategorizationFilterDto {...}
    </signature>
    <signature file="src/database/repositories/categorization.repository.ts">
      export class CategorizationRepository {
        async create(dto: CreateCategorizationDto): Promise&lt;Categorization&gt;
        async findByTransaction(transactionId: string): Promise&lt;Categorization[]&gt;
        async findPendingReview(tenantId: string): Promise&lt;Categorization[]&gt;
        async review(id: string, dto: ReviewCategorizationDto): Promise&lt;Categorization&gt;
        async update(id: string, dto: UpdateCategorizationDto): Promise&lt;Categorization&gt;
        async delete(id: string): Promise&lt;void&gt;
      }
    </signature>
  </signatures>

  <constraints>
    - Must relate to Transaction entity via transactionId
    - Must relate to User entity for reviewer tracking
    - Confidence score must be 0-100 (stored as decimal 5,2)
    - Split transactions: isSplit=true requires splitAmountCents
    - VAT calculations: vatAmountCents required for STANDARD vatType
    - Must NOT use 'any' type anywhere
    - Migration must be reversible
    - Must have indexes for transaction and account code lookups
    - Review workflow: only USER_OVERRIDE source can have reviewedBy/reviewedAt
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - Migration reverts successfully
    - TypeScript compiles without errors
    - Repository queries work with transaction relation
    - Split transaction logic validates correctly
    - VAT type validations enforce business rules
    - Unit tests for repository pass
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum VatType { STANDARD, ZERO_RATED, EXEMPT, NO_VAT }
    enum CategorizationSource { AI_AUTO, AI_SUGGESTED, USER_OVERRIDE, RULE_BASED }

  Add model Categorization:
    - All fields per technical spec
    - Relation to Transaction
    - Relation to User (for reviewer)
    - Indexes:
      - (transactionId) for lookup by transaction
      - (accountCode) for analytics

  Update Transaction model:
    Add: categorizations Categorization[]

  Update User model:
    Add: categorizations Categorization[] @relation("ReviewedCategorizations")

Entity Interface (src/database/entities/categorization.entity.ts):
  export enum VatType:
    STANDARD = 'STANDARD'
    ZERO_RATED = 'ZERO_RATED'
    EXEMPT = 'EXEMPT'
    NO_VAT = 'NO_VAT'

  export enum CategorizationSource:
    AI_AUTO = 'AI_AUTO'
    AI_SUGGESTED = 'AI_SUGGESTED'
    USER_OVERRIDE = 'USER_OVERRIDE'
    RULE_BASED = 'RULE_BASED'

  export interface ICategorization:
    // All fields with proper TypeScript types

  // Helper functions
  export function requiresVatCalculation(vatType: VatType): boolean
    return vatType === VatType.STANDARD

  export function isAiGenerated(source: CategorizationSource): boolean
    return source === CategorizationSource.AI_AUTO ||
           source === CategorizationSource.AI_SUGGESTED

DTOs (src/database/dto/categorization.dto.ts):
  export class CreateCategorizationDto:
    @IsUUID() transactionId: string
    @IsString() accountCode: string
    @IsString() accountName: string
    @IsNumber() @Min(0) @Max(100) confidenceScore: number
    @IsOptional() @IsString() reasoning?: string
    @IsEnum(CategorizationSource) source: CategorizationSource
    @IsBoolean() isSplit: boolean
    @IsOptional() @IsInt() splitAmountCents?: number
    @IsOptional() @IsInt() vatAmountCents?: number
    @IsEnum(VatType) vatType: VatType

  export class ReviewCategorizationDto:
    @IsUUID() reviewedBy: string
    @IsOptional() @IsString() accountCode?: string
    @IsOptional() @IsEnum(VatType) vatType?: VatType

  export class CategorizationFilterDto:
    @IsOptional() @IsEnum(CategorizationSource) source?: CategorizationSource
    @IsOptional() @IsEnum(VatType) vatType?: VatType
    @IsOptional() @IsBoolean() needsReview?: boolean

Repository (src/database/repositories/categorization.repository.ts):
  @Injectable()
  export class CategorizationRepository:
    constructor(private prisma: PrismaService)

    async findByTransaction(transactionId: string):
      // Returns all categorizations for a transaction
      // Supports split transactions (multiple categorizations)
      return this.prisma.categorization.findMany({
        where: { transactionId },
        include: { transaction: true, reviewer: true }
      })

    async findPendingReview(tenantId: string):
      // Find AI_SUGGESTED categorizations that need review
      return this.prisma.categorization.findMany({
        where: {
          source: CategorizationSource.AI_SUGGESTED,
          reviewedAt: null,
          transaction: { tenantId }
        },
        include: { transaction: true }
      })

    async review(id: string, dto: ReviewCategorizationDto):
      // Mark categorization as reviewed
      return this.prisma.categorization.update({
        where: { id },
        data: {
          source: CategorizationSource.USER_OVERRIDE,
          reviewedBy: dto.reviewedBy,
          reviewedAt: new Date(),
          ...(dto.accountCode && { accountCode: dto.accountCode }),
          ...(dto.vatType && { vatType: dto.vatType })
        }
      })

    // Validation logic
    private validateSplitTransaction(dto: CreateCategorizationDto):
      if (dto.isSplit && !dto.splitAmountCents)
        throw new Error("Split transactions require splitAmountCents")

    private validateVatCalculation(dto: CreateCategorizationDto):
      if (dto.vatType === VatType.STANDARD && !dto.vatAmountCents)
        throw new Error("STANDARD VAT type requires vatAmountCents")
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/categorization.entity.ts">Categorization interface and enums</file>
  <file path="src/database/dto/categorization.dto.ts">Create, Update, Review, and Filter DTOs</file>
  <file path="src/database/repositories/categorization.repository.ts">Categorization repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_categorizations/migration.sql">Migration</file>
  <file path="tests/database/repositories/categorization.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Categorization model and enums; update Transaction and User relations</file>
  <file path="src/database/entities/index.ts">Export Categorization</file>
  <file path="src/database/dto/index.ts">Export Categorization DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates categorizations table with all columns</criterion>
  <criterion>VatType and CategorizationSource enums created</criterion>
  <criterion>Foreign keys to transactions and users tables exist</criterion>
  <criterion>Indexes created for transactionId and accountCode</criterion>
  <criterion>Split transaction validation works correctly</criterion>
  <criterion>VAT calculation validation enforces business rules</criterion>
  <criterion>Review workflow correctly updates source and timestamps</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_categorizations</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "CategorizationRepository"</command>
</test_commands>

</task_spec>
