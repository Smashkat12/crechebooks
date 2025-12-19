<task_spec id="TASK-PAY-031" version="1.0">

<metadata>
  <title>Payment Controller and DTOs</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>50</sequence>
  <implements>
    <requirement_ref>REQ-PAY-005</requirement_ref>
    <requirement_ref>REQ-PAY-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-011</task_ref>
    <task_ref>TASK-PAY-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the Payment Controller and associated DTOs for manual payment allocation.
It provides the REST API endpoint for manually allocating payments to invoices when automatic
matching fails or requires human review. The controller uses PaymentService for business logic
and returns standardized API responses with proper validation and error handling.
</context>

<input_context_files>
  <file purpose="api_specification">specs/technical/api-contracts.md#payment_endpoints</file>
  <file purpose="service_interface">src/core/payment/payment.service.ts</file>
  <file purpose="entities">src/core/payment/entities/*.entity.ts</file>
  <file purpose="response_format">specs/technical/api-contracts.md#standard_response_format</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-011 completed (PaymentService)</check>
  <check>TASK-PAY-012 completed (PaymentMatchingService)</check>
  <check>TASK-CORE-002 completed (Payment entity)</check>
  <check>NestJS application running</check>
</prerequisites>

<scope>
  <in_scope>
    - Payment controller with POST /payments endpoint
    - CreatePaymentDto with validation decorators
    - AllocationDto for nested payment allocations
    - PaymentResponseDto for structured responses
    - Swagger/OpenAPI annotations
    - Request validation using class-validator
    - Error handling and standardized responses
    - Tenant context injection from JWT
  </in_scope>
  <out_of_scope>
    - Payment matching logic (TASK-PAY-032)
    - Arrears reporting (TASK-PAY-033)
    - Xero synchronization (handled in service layer)
    - Email notifications (handled in service layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/payment/payment.controller.ts">
      @Controller('payments')
      @ApiTags('Payments')
      @UseGuards(JwtAuthGuard)
      export class PaymentController {
        constructor(private readonly paymentService: PaymentService) {}

        @Post()
        @ApiOperation({ summary: 'Manually allocate payment to invoices' })
        @ApiResponse({ status: 201, type: PaymentResponseDto })
        async allocatePayment(
          @Body() dto: CreatePaymentDto,
          @CurrentUser() user: JwtPayload,
        ): Promise&lt;ApiResponse&lt;PaymentResponseDto&gt;&gt;
      }
    </signature>

    <signature file="src/api/payment/dto/create-payment.dto.ts">
      export class AllocationDto {
        @ApiProperty()
        @IsUUID()
        invoice_id: string;

        @ApiProperty({ example: 3450.00 })
        @IsNumber()
        @Min(0.01)
        @Transform(({ value }) => parseFloat(value))
        amount: number;
      }

      export class CreatePaymentDto {
        @ApiProperty()
        @IsUUID()
        transaction_id: string;

        @ApiProperty({ type: [AllocationDto] })
        @IsArray()
        @ValidateNested({ each: true })
        @Type(() => AllocationDto)
        @ArrayMinSize(1)
        allocations: AllocationDto[];
      }
    </signature>

    <signature file="src/api/payment/dto/payment-response.dto.ts">
      export class PaymentItemDto {
        @ApiProperty()
        id: string;

        @ApiProperty()
        invoice_id: string;

        @ApiProperty()
        amount: number;

        @ApiProperty()
        invoice_status: string;
      }

      export class PaymentResponseDto {
        @ApiProperty({ type: [PaymentItemDto] })
        payments: PaymentItemDto[];

        @ApiProperty()
        unallocated_amount: number;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate transaction_id is valid UUID
    - Must validate allocations array has at least 1 item
    - Must validate all amounts are positive numbers
    - Must validate invoice_id in each allocation is valid UUID
    - Allocations validation (sum <= transaction amount) handled in service layer
    - Must use class-validator decorators for all validations
    - Must include Swagger/OpenAPI annotations for all DTOs and endpoints
    - Must extract tenant_id from JWT (no manual header)
    - Must return 201 Created on success
    - Must return 400 Bad Request for validation errors
    - Must return 404 Not Found if transaction doesn't exist
  </constraints>

  <verification>
    - POST /payments with valid payload returns 201
    - POST /payments with invalid UUID returns 400
    - POST /payments with empty allocations array returns 400
    - POST /payments with negative amount returns 400
    - POST /payments without auth token returns 401
    - POST /payments with non-existent transaction returns 404
    - Swagger UI displays endpoint correctly with request/response schemas
    - npm run lint passes
    - npm run test passes (controller unit tests)
  </verification>
</definition_of_done>

<pseudo_code>
PaymentController (src/api/payment/payment.controller.ts):
  @Controller('payments')
  @ApiTags('Payments')
  @UseGuards(JwtAuthGuard)
  export class PaymentController:
    constructor(paymentService: PaymentService)

    @Post()
    @ApiOperation({ summary: 'Manually allocate payment to invoices' })
    @ApiResponse({ status: 201, type: PaymentResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid allocation' })
    @ApiResponse({ status: 404, description: 'Transaction not found' })
    async allocatePayment(dto: CreatePaymentDto, user: JwtPayload):
      try:
        payments = await paymentService.allocatePayment(
          dto.transaction_id,
          dto.allocations,
          user.tenant_id,
          user.user_id
        )

        response = {
          payments: payments.map(p => ({
            id: p.id,
            invoice_id: p.invoice_id,
            amount: Money.fromCents(p.amount_cents).toNumber(),
            invoice_status: p.invoice.status
          })),
          unallocated_amount: calculateUnallocated(payments)
        }

        return {
          success: true,
          data: response
        }
      catch error:
        if error instanceof NotFoundException:
          throw new NotFoundException(error.message)
        if error instanceof ValidationException:
          throw new BadRequestException(error.message)
        throw error

CreatePaymentDto (src/api/payment/dto/create-payment.dto.ts):
  export class AllocationDto:
    @ApiProperty({ example: 'uuid-of-invoice' })
    @IsUUID()
    invoice_id: string

    @ApiProperty({ example: 3450.00, description: 'Amount to allocate in Rand' })
    @IsNumber()
    @Min(0.01)
    @Transform(({ value }) => parseFloat(value))
    amount: number

  export class CreatePaymentDto:
    @ApiProperty({ example: 'uuid-of-transaction' })
    @IsUUID()
    transaction_id: string

    @ApiProperty({
      type: [AllocationDto],
      description: 'Array of invoice allocations',
      example: [{ invoice_id: 'uuid', amount: 3450.00 }]
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AllocationDto)
    @ArrayMinSize(1)
    allocations: AllocationDto[]

PaymentResponseDto (src/api/payment/dto/payment-response.dto.ts):
  export class PaymentItemDto:
    @ApiProperty()
    id: string

    @ApiProperty()
    invoice_id: string

    @ApiProperty({ example: 3450.00 })
    amount: number

    @ApiProperty({ enum: InvoiceStatus })
    invoice_status: string

  export class PaymentResponseDto:
    @ApiProperty({ type: [PaymentItemDto] })
    payments: PaymentItemDto[]

    @ApiProperty({ example: 0.00 })
    unallocated_amount: number

PaymentModule (src/api/payment/payment.module.ts):
  @Module({
    imports: [
      CorePaymentModule,
      AuthModule
    ],
    controllers: [PaymentController],
    providers: []
  })
  export class PaymentApiModule {}
</pseudo_code>

<files_to_create>
  <file path="src/api/payment/payment.controller.ts">Payment controller with POST endpoint</file>
  <file path="src/api/payment/dto/create-payment.dto.ts">DTO for payment allocation request</file>
  <file path="src/api/payment/dto/payment-response.dto.ts">DTO for payment allocation response</file>
  <file path="src/api/payment/payment.module.ts">Payment API module</file>
  <file path="tests/api/payment/payment.controller.spec.ts">Controller unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">Import PaymentApiModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>Controller compiles without TypeScript errors</criterion>
  <criterion>All DTOs have complete class-validator decorators</criterion>
  <criterion>All endpoints have Swagger annotations</criterion>
  <criterion>POST /payments returns 201 with correct response structure</criterion>
  <criterion>Validation errors return 400 with details</criterion>
  <criterion>Missing auth token returns 401</criterion>
  <criterion>Unit tests achieve >80% coverage</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test payment.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -X POST http://localhost:3000/payments -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"transaction_id":"uuid","allocations":[{"invoice_id":"uuid","amount":3450.00}]}'</command>
</test_commands>

</task_spec>
