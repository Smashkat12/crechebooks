<task_spec id="TASK-RECON-031" version="1.0">

<metadata>
  <title>Reconciliation Controller</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>56</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-002</requirement_ref>
    <requirement_ref>REQ-RECON-003</requirement_ref>
    <requirement_ref>REQ-RECON-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-011</task_ref>
    <task_ref>TASK-RECON-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the bank reconciliation controller and DTOs. It provides the REST API
endpoint for performing bank reconciliation by comparing transaction records with bank
statement balances. The endpoint identifies matched transactions, flags discrepancies, and
marks items as reconciled. It handles both successful reconciliations and discrepancies that
require investigation.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#reconciliation_endpoints</file>
  <file purpose="service_interface">src/core/reconciliation/reconciliation.service.ts</file>
  <file purpose="entities">src/core/reconciliation/entities/reconciliation.entity.ts</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-RECON-011 completed (ReconciliationService)</check>
  <check>TASK-RECON-012 completed (DiscrepancyAnalyzer)</check>
  <check>TASK-CORE-002 completed (Reconciliation entity)</check>
  <check>Transaction data exists in database</check>
</prerequisites>

<scope>
  <in_scope>
    - Reconciliation controller with POST /reconciliation endpoint
    - ReconcileDto with validation decorators
    - ReconciliationResponseDto for structured responses
    - Discrepancy reporting with detailed types
    - Matched/unmatched transaction counts
    - Swagger/OpenAPI annotations
    - Request validation using class-validator
    - Error handling for reconciliation failures
  </in_scope>
  <out_of_scope>
    - Reconciliation logic (handled in ReconciliationService)
    - Financial reports (TASK-RECON-032)
    - Transaction import (handled in transaction module)
    - Xero synchronization (handled in service layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/reconciliation/reconciliation.controller.ts">
      @Controller('reconciliation')
      @ApiTags('Reconciliation')
      @UseGuards(JwtAuthGuard)
      export class ReconciliationController {
        constructor(private readonly reconciliationService: ReconciliationService) {}

        @Post()
        @ApiOperation({ summary: 'Run bank reconciliation for period' })
        @ApiResponse({ status: 201, type: ReconciliationResponseDto })
        @ApiResponse({ status: 200, description: 'Reconciled with discrepancies', type: ReconciliationResponseDto })
        async reconcile(
          @Body() dto: ReconcileDto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;ReconciliationResponseDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/reconciliation/dto/reconcile.dto.ts">
      export class ReconcileDto {
        @ApiProperty()
        @IsString()
        @MaxLength(100)
        bank_account: string;

        @ApiProperty({ example: '2025-01-01' })
        @IsDateString()
        period_start: string;

        @ApiProperty({ example: '2025-01-31' })
        @IsDateString()
        period_end: string;

        @ApiProperty({ example: 50000.00 })
        @IsNumber()
        @Transform(({ value }) => parseFloat(value))
        opening_balance: number;

        @ApiProperty({ example: 62500.00 })
        @IsNumber()
        @Transform(({ value }) => parseFloat(value))
        closing_balance: number;
      }
    </signature>

    <signature file="src/api/reconciliation/dto/reconciliation-response.dto.ts">
      export class DiscrepancyDto {
        @ApiProperty({ enum: ['IN_XERO_NOT_BANK', 'IN_BANK_NOT_XERO', 'AMOUNT_MISMATCH'] })
        type: string;

        @ApiProperty()
        transaction_id: string;

        @ApiProperty()
        amount: number;

        @ApiProperty()
        description: string;
      }

      export class ReconciliationResponseDto {
        @ApiProperty()
        id: string;

        @ApiProperty({ enum: ['RECONCILED', 'DISCREPANCY'] })
        status: string;

        @ApiProperty()
        opening_balance: number;

        @ApiProperty()
        closing_balance: number;

        @ApiProperty()
        calculated_balance: number;

        @ApiProperty()
        discrepancy: number;

        @ApiProperty()
        matched_count: number;

        @ApiProperty()
        unmatched_count: number;

        @ApiProperty({ type: [DiscrepancyDto], required: false })
        discrepancies?: DiscrepancyDto[];
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate period_end is after period_start
    - Must validate bank_account identifier is provided
    - Must validate opening and closing balances are numbers
    - Must calculate: calculated_balance = opening + credits - debits
    - Must calculate: discrepancy = calculated_balance - closing_balance
    - Status RECONCILED if discrepancy = 0
    - Status DISCREPANCY if discrepancy != 0
    - Must return discrepancies array if status = DISCREPANCY
    - Must mark matched transactions as is_reconciled = true
    - Must return amounts in Rand (not cents)
    - Must use Swagger/OpenAPI annotations
    - Must return 201 Created if reconciled
    - Must return 200 OK if discrepancies found
    - Must return 400 Bad Request for validation errors
  </constraints>

  <verification>
    - POST /reconciliation with valid payload returns 201 or 200
    - POST /reconciliation with invalid dates returns 400
    - POST /reconciliation with end before start returns 400
    - POST /reconciliation without auth token returns 401
    - Reconciled status (201) when discrepancy = 0
    - Discrepancy status (200) when discrepancy != 0
    - Discrepancies array populated when status = DISCREPANCY
    - Matched transactions marked as is_reconciled = true
    - Amounts formatted correctly in Rand
    - Swagger UI displays endpoint correctly
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
ReconciliationController (src/api/reconciliation/reconciliation.controller.ts):
  @Controller('reconciliation')
  @ApiTags('Reconciliation')
  @UseGuards(JwtAuthGuard)
  export class ReconciliationController:
    constructor(reconciliationService: ReconciliationService)

    @Post()
    @ApiOperation({ summary: 'Run bank reconciliation' })
    @ApiResponse({ status: 201, description: 'Reconciled successfully' })
    @ApiResponse({ status: 200, description: 'Reconciled with discrepancies' })
    async reconcile(dto: ReconcileDto, user: JwtPayload):
      try:
        result = await reconciliationService.reconcile(
          {
            bank_account: dto.bank_account,
            period_start: new Date(dto.period_start),
            period_end: new Date(dto.period_end),
            opening_balance_cents: Money.toCents(new Decimal(dto.opening_balance)),
            closing_balance_cents: Money.toCents(new Decimal(dto.closing_balance))
          },
          user.tenant_id
        )

        response = {
          id: result.id,
          status: result.status,
          opening_balance: Money.fromCents(result.opening_balance_cents).toNumber(),
          closing_balance: Money.fromCents(result.closing_balance_cents).toNumber(),
          calculated_balance: Money.fromCents(result.calculated_balance_cents).toNumber(),
          discrepancy: Money.fromCents(result.discrepancy_cents).toNumber(),
          matched_count: result.matched_count,
          unmatched_count: result.unmatched_count
        }

        if result.status === 'DISCREPANCY':
          response.discrepancies = result.discrepancies.map(d => ({
            type: d.type,
            transaction_id: d.transaction_id,
            amount: Money.fromCents(d.amount_cents).toNumber(),
            description: d.description
          }))
          return { success: true, data: response } // 200

        return { success: true, data: response } // 201
      catch error:
        if error instanceof ValidationException:
          throw new BadRequestException(error.message)
        throw error

ReconcileDto (src/api/reconciliation/dto/reconcile.dto.ts):
  export class ReconcileDto:
    @ApiProperty({
      example: 'Standard Bank - Current',
      description: 'Bank account identifier'
    })
    @IsString()
    @MaxLength(100)
    bank_account: string

    @ApiProperty({ example: '2025-01-01' })
    @IsDateString()
    period_start: string

    @ApiProperty({ example: '2025-01-31' })
    @IsDateString()
    period_end: string

    @ApiProperty({
      example: 50000.00,
      description: 'Opening balance from bank statement'
    })
    @IsNumber()
    @Transform(({ value }) => parseFloat(value))
    opening_balance: number

    @ApiProperty({
      example: 62500.00,
      description: 'Closing balance from bank statement'
    })
    @IsNumber()
    @Transform(({ value }) => parseFloat(value))
    closing_balance: number

ReconciliationResponseDto (src/api/reconciliation/dto/reconciliation-response.dto.ts):
  export class DiscrepancyDto:
    @ApiProperty({
      enum: ['IN_XERO_NOT_BANK', 'IN_BANK_NOT_XERO', 'AMOUNT_MISMATCH'],
      description: 'Type of discrepancy found'
    })
    type: string

    @ApiProperty()
    transaction_id: string

    @ApiProperty({ example: -250.00 })
    amount: number

    @ApiProperty({ example: 'Manual entry - needs verification' })
    description: string

  export class ReconciliationResponseDto:
    @ApiProperty()
    id: string

    @ApiProperty({ enum: ['RECONCILED', 'DISCREPANCY'] })
    status: string

    @ApiProperty()
    opening_balance: number

    @ApiProperty()
    closing_balance: number

    @ApiProperty({ description: 'Calculated from transactions' })
    calculated_balance: number

    @ApiProperty({ description: 'Difference between calculated and closing' })
    discrepancy: number

    @ApiProperty()
    matched_count: number

    @ApiProperty()
    unmatched_count: number

    @ApiPropertyOptional({
      type: [DiscrepancyDto],
      description: 'Present if status is DISCREPANCY'
    })
    discrepancies?: DiscrepancyDto[]

ReconciliationModule (src/api/reconciliation/reconciliation.module.ts):
  @Module({
    imports: [
      CoreReconciliationModule,
      AuthModule
    ],
    controllers: [ReconciliationController],
    providers: []
  })
  export class ReconciliationApiModule {}
</pseudo_code>

<files_to_create>
  <file path="src/api/reconciliation/reconciliation.controller.ts">Reconciliation controller with POST endpoint</file>
  <file path="src/api/reconciliation/dto/reconcile.dto.ts">DTO for reconciliation request</file>
  <file path="src/api/reconciliation/dto/reconciliation-response.dto.ts">DTO for reconciliation response</file>
  <file path="src/api/reconciliation/reconciliation.module.ts">Reconciliation API module</file>
  <file path="tests/api/reconciliation/reconciliation.controller.spec.ts">Controller unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import ReconciliationApiModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>Controller compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>POST /reconciliation returns correct status codes</criterion>
  <criterion>Discrepancy calculation accurate</criterion>
  <criterion>Matched transactions marked correctly</criterion>
  <criterion>Discrepancies array populated when needed</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test reconciliation.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X POST http://localhost:3000/reconciliation -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"bank_account":"Standard Bank","period_start":"2025-01-01","period_end":"2025-01-31","opening_balance":50000.00,"closing_balance":62500.00}'</command>
</test_commands>

</task_spec>
