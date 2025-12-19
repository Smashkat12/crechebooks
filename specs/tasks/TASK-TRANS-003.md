<task_spec id="TASK-TRANS-003" version="1.0">

<metadata>
  <title>Payee Pattern Entity</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>7</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
    <requirement_ref>REQ-TRANS-006</requirement_ref>
    <requirement_ref>REQ-TRANS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task creates the PayeePattern entity which stores learned patterns for automatic
transaction categorization. The system learns from user decisions and recurring transactions
to improve categorization accuracy over time. Each pattern includes the payee name pattern,
aliases (stored as JSONB array), default account code, and confidence boost. This enables
the AI categorization service to make better predictions based on historical patterns.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#PayeePattern</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="tenant_entity">src/database/entities/tenant.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>TASK-CORE-002 completed (Tenant entity exists)</check>
  <check>Prisma CLI available</check>
  <check>Database has tenants and transactions tables</check>
</prerequisites>

<scope>
  <in_scope>
    - Create PayeePattern Prisma model with tenant relation
    - Create database migration for payee_patterns table
    - Support JSONB field for payee_aliases array
    - Create TypeScript interfaces for PayeePattern
    - Create DTOs for PayeePattern operations
    - Create PayeePattern repository
    - Support recurring transaction detection
    - Create indexes for pattern matching performance
  </in_scope>
  <out_of_scope>
    - Pattern learning algorithm (TASK-TRANS-013)
    - Pattern matching logic (TASK-TRANS-012)
    - AI confidence calculation (TASK-TRANS-012)
    - Pattern suggestion UI (TASK-TRANS-033)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model PayeePattern {
        id                      String   @id @default(uuid())
        tenantId                String   @map("tenant_id")
        payeePattern            String   @map("payee_pattern")
        payeeAliases            Json     @default("[]") @map("payee_aliases")
        defaultAccountCode      String   @map("default_account_code")
        confidenceBoost         Decimal  @default(0) @map("confidence_boost") @db.Decimal(5, 2)
        matchCount              Int      @default(0) @map("match_count")
        isRecurring             Boolean  @default(false) @map("is_recurring")
        expectedAmountCents     Int?     @map("expected_amount_cents")
        amountVariancePercent   Decimal? @map("amount_variance_percent") @db.Decimal(5, 2)
        createdAt               DateTime @default(now()) @map("created_at")
        updatedAt               DateTime @updatedAt @map("updated_at")

        tenant                  Tenant   @relation(fields: [tenantId], references: [id])

        @@index([tenantId, payeePattern])
        @@map("payee_patterns")
      }
    </signature>
    <signature file="src/database/entities/payee-pattern.entity.ts">
      export interface IPayeePattern {
        id: string;
        tenantId: string;
        payeePattern: string;
        payeeAliases: string[];
        defaultAccountCode: string;
        confidenceBoost: number;
        matchCount: number;
        isRecurring: boolean;
        expectedAmountCents: number | null;
        amountVariancePercent: number | null;
        createdAt: Date;
        updatedAt: Date;
      }

      export interface RecurringTransactionPattern {
        pattern: IPayeePattern;
        expectedAmount: number;
        variance: number;
      }
    </signature>
    <signature file="src/database/dto/payee-pattern.dto.ts">
      export class CreatePayeePatternDto {...}
      export class UpdatePayeePatternDto {...}
      export class PayeePatternFilterDto {...}
    </signature>
    <signature file="src/database/repositories/payee-pattern.repository.ts">
      export class PayeePatternRepository {
        async create(dto: CreatePayeePatternDto): Promise&lt;PayeePattern&gt;
        async findById(tenantId: string, id: string): Promise&lt;PayeePattern | null&gt;
        async findByTenant(tenantId: string, filter: PayeePatternFilterDto): Promise&lt;PayeePattern[]&gt;
        async findByPayeeName(tenantId: string, payeeName: string): Promise&lt;PayeePattern | null&gt;
        async incrementMatchCount(id: string): Promise&lt;PayeePattern&gt;
        async update(tenantId: string, id: string, dto: UpdatePayeePatternDto): Promise&lt;PayeePattern&gt;
        async delete(tenantId: string, id: string): Promise&lt;void&gt;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use tenant_id for multi-tenant isolation
    - All queries must filter by tenantId
    - payee_aliases must be valid JSON array
    - confidenceBoost must be 0-100 (stored as decimal 5,2)
    - amountVariancePercent must be 0-100 if set
    - Recurring patterns require expectedAmountCents
    - Must NOT use 'any' type anywhere
    - Migration must be reversible
    - Must have index for pattern matching queries
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - Migration reverts successfully
    - TypeScript compiles without errors
    - Repository queries always include tenantId filter
    - JSONB field correctly stores and retrieves arrays
    - Pattern matching queries are performant
    - Unit tests for repository pass
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add model PayeePattern:
    - All fields per technical spec
    - Relation to Tenant
    - payeeAliases as Json type (JSONB in PostgreSQL)
    - Indexes:
      - (tenantId, payeePattern) for pattern lookup

  Update Tenant model:
    Add: payeePatterns PayeePattern[]

Entity Interface (src/database/entities/payee-pattern.entity.ts):
  export interface IPayeePattern:
    // All fields with proper TypeScript types
    // payeeAliases typed as string[] (deserialized from JSONB)

  export interface RecurringTransactionPattern:
    pattern: IPayeePattern
    expectedAmount: number
    variance: number

  // Helper functions
  export function matchesPayeeName(pattern: IPayeePattern, payeeName: string): boolean
    // Check if payeeName matches pattern or any alias
    const normalized = payeeName.toLowerCase()
    if (pattern.payeePattern.toLowerCase().includes(normalized)) return true
    return pattern.payeeAliases.some(alias =>
      alias.toLowerCase().includes(normalized)
    )

  export function isAmountWithinVariance(
    pattern: IPayeePattern,
    amountCents: number
  ): boolean
    if (!pattern.isRecurring || !pattern.expectedAmountCents) return true
    const variance = pattern.amountVariancePercent || 0
    const expectedAmount = pattern.expectedAmountCents
    const maxVariance = expectedAmount * (variance / 100)
    return Math.abs(amountCents - expectedAmount) <= maxVariance

DTOs (src/database/dto/payee-pattern.dto.ts):
  export class CreatePayeePatternDto:
    @IsUUID() tenantId: string
    @IsString() payeePattern: string
    @IsArray() @IsString({ each: true }) payeeAliases: string[]
    @IsString() defaultAccountCode: string
    @IsOptional() @IsNumber() @Min(0) @Max(100) confidenceBoost?: number
    @IsBoolean() isRecurring: boolean
    @IsOptional() @IsInt() expectedAmountCents?: number
    @IsOptional() @IsNumber() @Min(0) @Max(100) amountVariancePercent?: number

  export class UpdatePayeePatternDto:
    @IsOptional() @IsString() payeePattern?: string
    @IsOptional() @IsArray() @IsString({ each: true }) payeeAliases?: string[]
    @IsOptional() @IsString() defaultAccountCode?: string
    @IsOptional() @IsNumber() @Min(0) @Max(100) confidenceBoost?: number
    @IsOptional() @IsBoolean() isRecurring?: boolean
    @IsOptional() @IsInt() expectedAmountCents?: number
    @IsOptional() @IsNumber() @Min(0) @Max(100) amountVariancePercent?: number

  export class PayeePatternFilterDto:
    @IsOptional() @IsString() search?: string
    @IsOptional() @IsBoolean() isRecurring?: boolean
    @IsOptional() @IsString() accountCode?: string

Repository (src/database/repositories/payee-pattern.repository.ts):
  @Injectable()
  export class PayeePatternRepository:
    constructor(private prisma: PrismaService)

    async findByPayeeName(tenantId: string, payeeName: string):
      // ALWAYS filter by tenantId first
      // Use JSONB query for aliases array search
      // Case-insensitive pattern matching
      const patterns = await this.prisma.payeePattern.findMany({
        where: {
          tenantId,
          OR: [
            { payeePattern: { contains: payeeName, mode: 'insensitive' } },
            { payeeAliases: { array_contains: [payeeName] } }
          ]
        }
      })

      // Return best match (highest matchCount)
      return patterns.sort((a, b) => b.matchCount - a.matchCount)[0] || null

    async incrementMatchCount(id: string):
      // Atomic increment for concurrent access
      return this.prisma.payeePattern.update({
        where: { id },
        data: { matchCount: { increment: 1 } }
      })

    async create(dto: CreatePayeePatternDto):
      // Validate recurring pattern requirements
      if (dto.isRecurring && !dto.expectedAmountCents)
        throw new Error("Recurring patterns require expectedAmountCents")

      return this.prisma.payeePattern.create({
        data: {
          ...dto,
          payeeAliases: dto.payeeAliases || []
        }
      })

    async findByTenant(tenantId: string, filter: PayeePatternFilterDto):
      const where = { tenantId }

      if (filter.search)
        where.OR = [
          { payeePattern: { contains: filter.search, mode: 'insensitive' } }
        ]

      if (filter.isRecurring !== undefined)
        where.isRecurring = filter.isRecurring

      if (filter.accountCode)
        where.defaultAccountCode = filter.accountCode

      return this.prisma.payeePattern.findMany({
        where,
        orderBy: { matchCount: 'desc' }
      })
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/payee-pattern.entity.ts">PayeePattern interface and helpers</file>
  <file path="src/database/dto/payee-pattern.dto.ts">Create, Update, and Filter DTOs</file>
  <file path="src/database/repositories/payee-pattern.repository.ts">PayeePattern repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_payee_patterns/migration.sql">Migration</file>
  <file path="tests/database/repositories/payee-pattern.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add PayeePattern model; update Tenant relation</file>
  <file path="src/database/entities/index.ts">Export PayeePattern</file>
  <file path="src/database/dto/index.ts">Export PayeePattern DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates payee_patterns table with all columns</criterion>
  <criterion>JSONB column for payee_aliases created</criterion>
  <criterion>Foreign key to tenants table exists</criterion>
  <criterion>Index created for (tenantId, payeePattern)</criterion>
  <criterion>Repository always filters by tenantId</criterion>
  <criterion>JSONB array operations work correctly</criterion>
  <criterion>Pattern matching logic finds correct patterns</criterion>
  <criterion>Recurring pattern validation enforces business rules</criterion>
  <criterion>Match count increment is atomic</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_payee_patterns</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "PayeePatternRepository"</command>
</test_commands>

</task_spec>
