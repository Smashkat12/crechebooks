<task_spec id="TASK-TRANS-033" version="1.0">

<metadata>
  <title>Categorization Endpoints</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>45</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-031</task_ref>
    <task_ref>TASK-AGENT-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the transaction categorization endpoints for the CrecheBooks system.
It creates endpoints for manual categorization correction (single transaction) and batch
AI categorization (multiple transactions). These endpoints integrate with the AI
categorization agent and pattern learning system.
</context>

<input_context_files>
  <file purpose="categorization_service">src/core/transaction/categorization.service.ts</file>
  <file purpose="agent_orchestrator">src/core/agent/agent-orchestrator.service.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#transactions/categorize</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-031 completed (Transaction controller base)</check>
  <check>TASK-TRANS-012 completed (Categorization service)</check>
  <check>TASK-AGENT-002 completed (AI categorization agent)</check>
</prerequisites>

<scope>
  <in_scope>
    - Add PUT /transactions/:id/categorize endpoint
    - Add POST /transactions/categorize/batch endpoint
    - Create categorization DTOs with split transaction support
    - Validate account codes against Chart of Accounts
    - Validate split amounts equal total
    - Support pattern creation from manual corrections
    - Add Swagger/OpenAPI annotations
    - Return 202 for batch jobs (async processing)
  </in_scope>
  <out_of_scope>
    - AI categorization logic (in TASK-AGENT-002)
    - Pattern matching (in service layer)
    - Chart of Accounts management (separate module)
    - Xero sync (handled in service)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/transaction/transaction.controller.ts">
      @Put(':id/categorize')
      @ApiOperation({ summary: 'Update transaction categorization (manual correction)' })
      @ApiResponse({ status: 200, type: UpdateCategorizationResponseDto })
      async updateCategorization(
        @Param('id') id: string,
        @Body() dto: UpdateCategorizationDto,
        @CurrentUser() user: User
      ): Promise&lt;UpdateCategorizationResponseDto&gt;;

      @Post('categorize/batch')
      @HttpCode(202)
      @ApiOperation({ summary: 'Trigger AI categorization for pending transactions' })
      @ApiResponse({ status: 202, type: BatchCategorizeResponseDto })
      async batchCategorize(
        @Body() dto: BatchCategorizeDto,
        @CurrentUser() user: User
      ): Promise&lt;BatchCategorizeResponseDto&gt;;
    </signature>
    <signature file="src/api/transaction/dto/update-categorization.dto.ts">
      export class SplitDto {
        @IsString()
        @ApiProperty({ example: '6100' })
        account_code: string;

        @IsNumber()
        @ApiProperty({ example: 500.00 })
        amount: number;

        @IsEnum(VatType)
        @ApiProperty({ enum: VatType, example: 'STANDARD' })
        vat_type: VatType;
      }

      export class UpdateCategorizationDto {
        @IsString()
        @ApiProperty({ example: '6100', description: 'Chart of Accounts code' })
        account_code: string;

        @IsOptional()
        @IsBoolean()
        @ApiProperty({ required: false, default: false })
        is_split?: boolean;

        @IsOptional()
        @IsArray()
        @ValidateNested({ each: true })
        @Type(() => SplitDto)
        @ApiProperty({ type: [SplitDto], required: false })
        splits?: SplitDto[];

        @IsOptional()
        @IsBoolean()
        @ApiProperty({ required: false, default: true })
        create_pattern?: boolean;
      }

      export class UpdateCategorizationResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty()
        data: {
          id: string;
          categorization: CategorizationResponseDto;
          pattern_created: boolean;
        };
      }
    </signature>
    <signature file="src/api/transaction/dto/batch-categorize.dto.ts">
      export class BatchCategorizeDto {
        @IsOptional()
        @IsArray()
        @IsUUID('4', { each: true })
        @ApiProperty({
          type: [String],
          required: false,
          description: 'Specific transaction IDs; if empty, all PENDING'
        })
        transaction_ids?: string[];

        @IsOptional()
        @IsBoolean()
        @ApiProperty({ required: false, default: false })
        force_recategorize?: boolean;
      }

      export class BatchCategorizeResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty()
        data: {
          job_id: string;
          transaction_count: number;
          estimated_seconds: number;
        };
      }
    </signature>
  </signatures>

  <constraints>
    - Account codes must exist in Chart of Accounts
    - Split amounts must sum to transaction total
    - Splits only allowed for expense transactions
    - VAT type must be valid for account code
    - Manual categorization must create USER_OVERRIDE source
    - Batch categorization returns 202 (not 200)
    - Must validate tenant_id from JWT
    - Pattern creation is opt-in (create_pattern flag)
    - All DTOs must have Swagger examples
  </constraints>

  <verification>
    - PUT /transactions/:id/categorize updates categorization
    - Validates account_code exists in CoA
    - Split validation works (amounts must equal total)
    - Pattern is created when create_pattern=true
    - POST /transactions/categorize/batch returns 202
    - Batch job is queued successfully
    - Empty transaction_ids processes all PENDING
    - force_recategorize flag works
    - Swagger documentation complete
  </verification>
</definition_of_done>

<pseudo_code>
TransactionController (src/api/transaction/transaction.controller.ts):
  @Put(':id/categorize')
  async updateCategorization(id: string, dto: UpdateCategorizationDto, user: User):
    # Validate account code exists
    accountExists = await coaService.exists(dto.account_code, user.tenantId)
    if (!accountExists):
      throw new BadRequestException('Invalid account code')

    # If split transaction, validate
    if (dto.is_split && dto.splits):
      # Get transaction to check total
      transaction = await transactionService.findOne(id, user.tenantId)

      # Validate split amounts equal total
      splitTotal = dto.splits.reduce((sum, split) => sum + split.amount, 0)
      if (Math.abs(splitTotal - transaction.amount.toNumber()) > 0.01):
        throw new BadRequestException('Split amounts must equal transaction total')

    # Update categorization
    result = await categorizationService.updateCategorization({
      transactionId: id,
      accountCode: dto.account_code,
      isSplit: dto.is_split,
      splits: dto.splits,
      createPattern: dto.create_pattern ?? true,
      userId: user.id,
      tenantId: user.tenantId
    })

    return {
      success: true,
      data: {
        id: result.id,
        categorization: {
          account_code: result.categorization.accountCode,
          account_name: result.categorization.accountName,
          source: 'USER_OVERRIDE',
          reviewed_at: new Date()
        },
        pattern_created: result.patternCreated
      }
    }

  @Post('categorize/batch')
  @HttpCode(202)
  async batchCategorize(dto: BatchCategorizeDto, user: User):
    # Determine which transactions to process
    transactionIds = dto.transaction_ids

    if (!transactionIds || transactionIds.length === 0):
      # Get all PENDING transactions for tenant
      pending = await transactionService.findPending(user.tenantId)
      transactionIds = pending.map(tx => tx.id)

    # Queue categorization job
    job = await categorizationService.queueBatchCategorization({
      transactionIds,
      forceRecategorize: dto.force_recategorize ?? false,
      tenantId: user.tenantId
    })

    # Estimate processing time (2 seconds per transaction)
    estimatedSeconds = transactionIds.length * 2

    return {
      success: true,
      data: {
        job_id: job.id,
        transaction_count: transactionIds.length,
        estimated_seconds: estimatedSeconds
      }
    }

Split Validation:
  function validateSplits(splits: SplitDto[], total: Decimal):
    # Sum all split amounts
    splitSum = splits.reduce((sum, split) =>
      sum.add(Money.fromCents(split.amount * 100)),
      new Decimal(0)
    )

    # Allow 1 cent rounding difference
    difference = splitSum.minus(total).abs()

    if (difference.greaterThan(0.01)):
      throw new BadRequestException(
        `Split amounts (${splitSum}) must equal transaction total (${total})`
      )
</pseudo_code>

<files_to_create>
  <file path="src/api/transaction/dto/update-categorization.dto.ts">Manual categorization DTOs</file>
  <file path="src/api/transaction/dto/batch-categorize.dto.ts">Batch categorization DTOs</file>
  <file path="src/api/transaction/dto/split.dto.ts">Split transaction DTO</file>
  <file path="tests/api/transaction/categorize.spec.ts">Categorization endpoint unit tests</file>
  <file path="tests/api/transaction/categorize.e2e-spec.ts">Categorization E2E tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/transaction/transaction.controller.ts">Add categorization endpoints</file>
</files_to_modify>

<validation_criteria>
  <criterion>PUT /:id/categorize updates categorization successfully</criterion>
  <criterion>Invalid account code returns 400</criterion>
  <criterion>Split validation works (must equal total)</criterion>
  <criterion>Pattern creation flag works</criterion>
  <criterion>POST /categorize/batch returns 202 with job_id</criterion>
  <criterion>Empty transaction_ids processes all PENDING</criterion>
  <criterion>force_recategorize flag works</criterion>
  <criterion>Swagger documentation complete with examples</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- categorize.spec</command>
  <command>npm run test:e2e -- categorize.e2e-spec</command>
  <command>curl -X PUT -H "Authorization: Bearer TOKEN" -d '{"account_code":"6100"}' http://localhost:3000/v1/transactions/UUID/categorize</command>
  <command>curl -X POST -H "Authorization: Bearer TOKEN" -d '{"transaction_ids":[]}' http://localhost:3000/v1/transactions/categorize/batch</command>
</test_commands>

</task_spec>
