<task_spec id="TASK-PAY-032" version="1.0">

<metadata>
  <title>Payment Matching Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>51</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
    <requirement_ref>REQ-PAY-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-031</task_ref>
    <task_ref>TASK-AGENT-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the payment matching endpoint that triggers AI-powered automatic payment
matching. It processes unallocated credit transactions and matches them to outstanding invoices
using the Claude Code payment matcher agent. The endpoint handles both automatic matching for
high-confidence matches and flags lower-confidence matches for human review. Results include
detailed match information with confidence scores and reasons.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#payment_endpoints</file>
  <file purpose="service_interface">src/core/payment/payment.service.ts</file>
  <file purpose="agent_service">src/core/agent/agent.service.ts</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-031 completed (Payment controller)</check>
  <check>TASK-AGENT-003 completed (Agent coordination service)</check>
  <check>TASK-PAY-012 completed (PaymentMatchingService)</check>
  <check>Claude Code agent configured</check>
</prerequisites>

<scope>
  <in_scope>
    - POST /payments/match endpoint
    - MatchPaymentsDto with optional transaction filtering
    - MatchingResultDto with auto-matched and review-required sections
    - Swagger/OpenAPI annotations
    - Async processing with immediate response
    - Detailed match metadata (confidence, type, reason)
    - Review queue for low-confidence matches
  </in_scope>
  <out_of_scope>
    - Manual payment allocation (TASK-PAY-031)
    - Arrears reporting (TASK-PAY-033)
    - Xero synchronization (handled in service layer)
    - Match pattern learning (handled in service layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/payment/payment.controller.ts">
      @Controller('payments')
      @ApiTags('Payments')
      @UseGuards(JwtAuthGuard)
      export class PaymentController {
        @Post('match')
        @ApiOperation({ summary: 'Trigger AI payment matching for unallocated transactions' })
        @ApiResponse({ status: 200, type: MatchingResultDto })
        async matchPayments(
          @Body() dto: MatchPaymentsDto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;MatchingResultDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/payment/dto/match-payments.dto.ts">
      export class MatchPaymentsDto {
        @ApiPropertyOptional({ type: [String] })
        @IsOptional()
        @IsArray()
        @IsUUID(4, { each: true })
        transaction_ids?: string[];
      }
    </signature>

    <signature file="src/api/payment/dto/matching-result.dto.ts">
      export class MatchedPaymentDto {
        @ApiProperty()
        transaction_id: string;

        @ApiProperty()
        invoice_id: string;

        @ApiProperty({ enum: ['EXACT', 'REFERENCE', 'AMOUNT', 'NAME', 'FUZZY'] })
        match_type: string;

        @ApiProperty({ example: 100 })
        confidence: number;

        @ApiProperty()
        auto_applied: boolean;
      }

      export class SuggestedMatchDto {
        @ApiProperty()
        invoice_id: string;

        @ApiProperty()
        invoice_number: string;

        @ApiProperty()
        confidence: number;

        @ApiProperty()
        match_reason: string;
      }

      export class ReviewRequiredDto {
        @ApiProperty()
        transaction_id: string;

        @ApiProperty({ type: [SuggestedMatchDto] })
        suggested_matches: SuggestedMatchDto[];
      }

      export class MatchingResultDto {
        @ApiProperty()
        auto_matched: number;

        @ApiProperty()
        requires_review: number;

        @ApiProperty()
        no_match: number;

        @ApiProperty({ type: [MatchedPaymentDto] })
        matches: MatchedPaymentDto[];

        @ApiProperty({ type: [ReviewRequiredDto] })
        review_required: ReviewRequiredDto[];
      }
    </signature>
  </signatures>

  <constraints>
    - Must process all unallocated transactions if transaction_ids not provided
    - Must validate all transaction_ids are valid UUIDs
    - Must apply matches automatically if confidence >= 80%
    - Must flag for review if confidence < 80%
    - Must return immediately (async processing in background acceptable)
    - Must include confidence scores for all matches
    - Must provide match reasons for suggested matches
    - Must use Swagger/OpenAPI annotations
    - Must return 200 OK on success
    - Must return 400 Bad Request for validation errors
  </constraints>

  <verification>
    - POST /payments/match without body processes all unallocated transactions
    - POST /payments/match with transaction_ids processes only specified transactions
    - POST /payments/match with invalid UUID returns 400
    - POST /payments/match without auth token returns 401
    - High confidence matches (>=80%) appear in auto_matched count
    - Low confidence matches (<80%) appear in review_required array
    - Response includes correct counts and detailed match information
    - Swagger UI displays endpoint correctly with request/response schemas
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
PaymentController (src/api/payment/payment.controller.ts):
  @Post('match')
  @ApiOperation({ summary: 'Trigger AI payment matching' })
  @ApiResponse({ status: 200, type: MatchingResultDto })
  async matchPayments(dto: MatchPaymentsDto, user: JwtPayload):
    try:
      result = await paymentService.matchPayments(
        dto.transaction_ids,
        user.tenant_id
      )

      return {
        success: true,
        data: {
          auto_matched: result.autoMatched.length,
          requires_review: result.requiresReview.length,
          no_match: result.noMatch.length,
          matches: result.autoMatched.map(m => ({
            transaction_id: m.transaction_id,
            invoice_id: m.invoice_id,
            match_type: m.match_type,
            confidence: m.confidence,
            auto_applied: true
          })),
          review_required: result.requiresReview.map(r => ({
            transaction_id: r.transaction_id,
            suggested_matches: r.suggestions.map(s => ({
              invoice_id: s.invoice_id,
              invoice_number: s.invoice_number,
              confidence: s.confidence,
              match_reason: s.reason
            }))
          }))
        }
      }
    catch error:
      if error instanceof ValidationException:
        throw new BadRequestException(error.message)
      throw error

MatchPaymentsDto (src/api/payment/dto/match-payments.dto.ts):
  export class MatchPaymentsDto:
    @ApiPropertyOptional({
      type: [String],
      description: 'Specific transaction IDs to match; if empty, all unallocated',
      example: ['uuid-1', 'uuid-2']
    })
    @IsOptional()
    @IsArray()
    @IsUUID(4, { each: true })
    transaction_ids?: string[]

MatchingResultDto (src/api/payment/dto/matching-result.dto.ts):
  export class MatchedPaymentDto:
    @ApiProperty()
    transaction_id: string

    @ApiProperty()
    invoice_id: string

    @ApiProperty({
      enum: ['EXACT', 'REFERENCE', 'AMOUNT', 'NAME', 'FUZZY'],
      description: 'Type of match found'
    })
    match_type: string

    @ApiProperty({
      example: 100,
      description: 'Confidence score 0-100'
    })
    confidence: number

    @ApiProperty()
    auto_applied: boolean

  export class SuggestedMatchDto:
    @ApiProperty()
    invoice_id: string

    @ApiProperty()
    invoice_number: string

    @ApiProperty({ example: 75 })
    confidence: number

    @ApiProperty({
      example: 'Amount matches; payer name partial match',
      description: 'Human-readable match explanation'
    })
    match_reason: string

  export class ReviewRequiredDto:
    @ApiProperty()
    transaction_id: string

    @ApiProperty({ type: [SuggestedMatchDto] })
    suggested_matches: SuggestedMatchDto[]

  export class MatchingResultDto:
    @ApiProperty({
      example: 12,
      description: 'Number of automatically matched payments'
    })
    auto_matched: number

    @ApiProperty({
      example: 3,
      description: 'Number of payments requiring manual review'
    })
    requires_review: number

    @ApiProperty({
      example: 1,
      description: 'Number of payments with no matches found'
    })
    no_match: number

    @ApiProperty({ type: [MatchedPaymentDto] })
    matches: MatchedPaymentDto[]

    @ApiProperty({ type: [ReviewRequiredDto] })
    review_required: ReviewRequiredDto[]
</pseudo_code>

<files_to_create>
  <file path="src/api/payment/dto/match-payments.dto.ts">DTO for payment matching request</file>
  <file path="src/api/payment/dto/matching-result.dto.ts">DTO for payment matching response</file>
  <file path="tests/api/payment/payment-matching.controller.spec.ts">Matching endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/payment/payment.controller.ts">Add matchPayments method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Endpoint compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>POST /payments/match returns 200 with correct structure</criterion>
  <criterion>Auto-matched payments have confidence >= 80%</criterion>
  <criterion>Review-required payments have confidence < 80%</criterion>
  <criterion>Match reasons are human-readable</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test payment-matching.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X POST http://localhost:3000/payments/match -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{}'</command>
  <command>curl -X POST http://localhost:3000/payments/match -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"transaction_ids":["uuid-1","uuid-2"]}'</command>
</test_commands>

</task_spec>
