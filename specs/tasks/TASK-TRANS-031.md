<task_spec id="TASK-TRANS-031" version="1.0">

<metadata>
  <title>Transaction Controller and DTOs</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>43</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-011</task_ref>
    <task_ref>TASK-TRANS-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Surface Layer transaction endpoints for the CrecheBooks system. It
implements the REST API controller for listing transactions with pagination, filtering,
and search capabilities. The controller exposes the TransactionService business logic
with proper DTOs, validation, and Swagger documentation.
</context>

<input_context_files>
  <file purpose="transaction_service">src/core/transaction/transaction.service.ts</file>
  <file purpose="transaction_entity">src/core/transaction/entities/transaction.entity.ts</file>
  <file purpose="categorization_entity">src/core/transaction/entities/categorization.entity.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#transaction_endpoints</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-011 completed (Transaction service)</check>
  <check>TASK-TRANS-012 completed (Categorization service)</check>
  <check>TASK-API-001 completed (Auth guards)</check>
</prerequisites>

<scope>
  <in_scope>
    - Create TransactionController with GET /transactions endpoint
    - Implement pagination, filtering, and search query parameters
    - Create response DTOs with categorization data
    - Create query/filter DTOs with validation
    - Add Swagger/OpenAPI annotations
    - Implement proper error handling and response formatting
    - Add tenant isolation using JWT tenant_id
  </in_scope>
  <out_of_scope>
    - Transaction import endpoint (TASK-TRANS-032)
    - Categorization endpoints (TASK-TRANS-033)
    - Business logic (already in services)
    - Xero sync (handled in services)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/transaction/transaction.controller.ts">
      @Controller('transactions')
      @ApiTags('Transactions')
      @UseGuards(JwtAuthGuard)
      export class TransactionController {
        @Get()
        @ApiOperation({ summary: 'List transactions with filtering and pagination' })
        @ApiResponse({ status: 200, type: TransactionListResponseDto })
        async listTransactions(
          @Query() query: ListTransactionsQueryDto,
          @CurrentUser() user: User
        ): Promise&lt;TransactionListResponseDto&gt;;
      }
    </signature>
    <signature file="src/api/transaction/dto/list-transactions.dto.ts">
      export class ListTransactionsQueryDto {
        @IsOptional()
        @IsInt()
        @Min(1)
        @Type(() => Number)
        @ApiProperty({ required: false, default: 1 })
        page?: number = 1;

        @IsOptional()
        @IsInt()
        @Min(1)
        @Max(100)
        @Type(() => Number)
        @ApiProperty({ required: false, default: 20 })
        limit?: number = 20;

        @IsOptional()
        @IsEnum(TransactionStatus)
        @ApiProperty({ enum: TransactionStatus, required: false })
        status?: TransactionStatus;

        @IsOptional()
        @IsISO8601()
        @ApiProperty({ required: false, example: '2025-01-01' })
        date_from?: string;

        @IsOptional()
        @IsISO8601()
        @ApiProperty({ required: false, example: '2025-01-31' })
        date_to?: string;

        @IsOptional()
        @IsBoolean()
        @Transform(({ value }) => value === 'true')
        @ApiProperty({ required: false })
        is_reconciled?: boolean;

        @IsOptional()
        @IsString()
        @MaxLength(200)
        @ApiProperty({ required: false, description: 'Search description/payee' })
        search?: string;
      }
    </signature>
    <signature file="src/api/transaction/dto/transaction-response.dto.ts">
      export class CategorizationResponseDto {
        @ApiProperty()
        account_code: string;

        @ApiProperty()
        account_name: string;

        @ApiProperty({ example: 92.5 })
        confidence_score: number;

        @ApiProperty({ enum: ['AI_AUTO', 'PATTERN_MATCH', 'USER_OVERRIDE'] })
        source: string;

        @ApiProperty({ required: false })
        reviewed_at?: Date;
      }

      export class TransactionResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ example: '2025-01-15' })
        date: string;

        @ApiProperty()
        description: string;

        @ApiProperty()
        payee_name: string;

        @ApiProperty()
        reference: string;

        @ApiProperty({ example: -1250.00 })
        amount: number;

        @ApiProperty()
        is_credit: boolean;

        @ApiProperty({ enum: TransactionStatus })
        status: TransactionStatus;

        @ApiProperty()
        is_reconciled: boolean;

        @ApiProperty({ type: CategorizationResponseDto, required: false })
        categorization?: CategorizationResponseDto;

        @ApiProperty()
        created_at: Date;
      }
    </signature>
    <signature file="src/api/transaction/dto/transaction-list-response.dto.ts">
      export class TransactionListResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty({ type: [TransactionResponseDto] })
        data: TransactionResponseDto[];

        @ApiProperty({ type: PaginationMetaDto })
        meta: PaginationMetaDto;
      }
    </signature>
  </signatures>

  <constraints>
    - All DTOs must use class-validator decorators
    - All endpoints must have Swagger/OpenAPI documentation
    - Pagination must default to page=1, limit=20, max=100
    - Dates must be in YYYY-MM-DD format
    - Amounts must be in decimal format (not cents)
    - Must filter by tenant_id from JWT
    - Search must be case-insensitive and partial match
    - Boolean query params must handle string 'true'/'false'
  </constraints>

  <verification>
    - GET /transactions returns paginated list with default params
    - Filtering by status works correctly
    - Date range filtering works (inclusive)
    - Search filters by description and payee_name
    - is_reconciled filter works
    - Pagination meta includes total, totalPages
    - Response includes categorization data when present
    - Only returns transactions for current tenant
    - Swagger UI shows all query parameters correctly
  </verification>
</definition_of_done>

<pseudo_code>
TransactionController (src/api/transaction/transaction.controller.ts):
  @Controller('transactions')
  @ApiTags('Transactions')
  @UseGuards(JwtAuthGuard)
  class TransactionController:
    constructor(private transactionService: TransactionService)

    @Get()
    @ApiOperation({ summary: 'List transactions with filtering and pagination' })
    async listTransactions(query: ListTransactionsQueryDto, user: User):
      # Extract tenant from JWT
      tenantId = user.tenantId

      # Build filter object
      filters = {
        status: query.status,
        dateFrom: query.date_from ? new Date(query.date_from) : undefined,
        dateTo: query.date_to ? new Date(query.date_to) : undefined,
        isReconciled: query.is_reconciled,
        search: query.search
      }

      # Call service with pagination
      result = await transactionService.findAll({
        tenantId,
        filters,
        page: query.page || 1,
        limit: query.limit || 20
      })

      # Transform to response DTO
      return {
        success: true,
        data: result.items.map(tx => ({
          id: tx.id,
          date: tx.date.toISOString().split('T')[0],
          description: tx.description,
          payee_name: tx.payeeName,
          reference: tx.reference,
          amount: tx.amount.toNumber(),
          is_credit: tx.isCredit,
          status: tx.status,
          is_reconciled: tx.isReconciled,
          categorization: tx.categorization ? {
            account_code: tx.categorization.accountCode,
            account_name: tx.categorization.accountName,
            confidence_score: tx.categorization.confidenceScore,
            source: tx.categorization.source,
            reviewed_at: tx.categorization.reviewedAt
          } : undefined,
          created_at: tx.createdAt
        })),
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit)
        }
      }

DTO Transformations:
  # Query DTO uses class-transformer to convert strings to numbers/booleans
  @Type(() => Number) for page, limit
  @Transform(({ value }) => value === 'true') for is_reconciled

  # Response DTO converts Decimal to number
  amount: transaction.amount.toNumber()

  # Dates converted to ISO 8601 date-only format
  date: transaction.date.toISOString().split('T')[0]
</pseudo_code>

<files_to_create>
  <file path="src/api/transaction/transaction.controller.ts">Transaction controller with list endpoint</file>
  <file path="src/api/transaction/transaction.module.ts">Transaction API module</file>
  <file path="src/api/transaction/dto/list-transactions.dto.ts">Query parameters DTO</file>
  <file path="src/api/transaction/dto/transaction-response.dto.ts">Transaction response DTO</file>
  <file path="src/api/transaction/dto/transaction-list-response.dto.ts">Paginated list response DTO</file>
  <file path="src/api/transaction/dto/categorization-response.dto.ts">Categorization data DTO</file>
  <file path="src/shared/dto/pagination-meta.dto.ts">Reusable pagination metadata DTO</file>
  <file path="tests/api/transaction/transaction.controller.spec.ts">Controller unit tests</file>
  <file path="tests/api/transaction/transaction.e2e-spec.ts">E2E tests for listing</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import TransactionApiModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>GET /transactions returns 200 with paginated data</criterion>
  <criterion>Default pagination works (page=1, limit=20)</criterion>
  <criterion>All filters work correctly (status, dates, reconciled, search)</criterion>
  <criterion>Search is case-insensitive and partial match</criterion>
  <criterion>Tenant isolation enforced (only own transactions)</criterion>
  <criterion>Categorization data included when present</criterion>
  <criterion>Meta includes correct total and totalPages</criterion>
  <criterion>Swagger documentation complete with examples</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- transaction.controller.spec</command>
  <command>npm run test:e2e -- transaction.e2e-spec</command>
  <command>curl -H "Authorization: Bearer TOKEN" http://localhost:3000/v1/transactions</command>
  <command>curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/v1/transactions?status=PENDING&amp;page=1&amp;limit=10"</command>
  <command>curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/v1/transactions?search=woolworths&amp;date_from=2025-01-01"</command>
</test_commands>

</task_spec>
