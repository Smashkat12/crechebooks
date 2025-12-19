<task_spec id="TASK-BILL-033" version="1.0">

<metadata>
  <title>Invoice Delivery Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>48</sequence>
  <implements>
    <requirement_ref>REQ-BILL-006</requirement_ref>
    <requirement_ref>REQ-BILL-007</requirement_ref>
    <requirement_ref>REQ-BILL-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-031</task_ref>
    <task_ref>TASK-BILL-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements the invoice delivery endpoint for the CrecheBooks system. It creates
the POST /invoices/send endpoint that triggers email and/or WhatsApp delivery of approved
invoices to parents. Integrates with email and WhatsApp MCP services and tracks delivery
status with failure handling.
</context>

<input_context_files>
  <file purpose="billing_service">src/core/billing/billing.service.ts</file>
  <file purpose="delivery_service">src/core/billing/delivery.service.ts</file>
  <file purpose="api_contracts">specs/technical/api-contracts.md#invoices/send</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-031 completed (Invoice controller base)</check>
  <check>TASK-BILL-013 completed (Delivery service)</check>
  <check>Email MCP service configured</check>
  <check>WhatsApp MCP service configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Add POST /invoices/send endpoint to InvoiceController
    - Create delivery request/response DTOs
    - Support delivery_method selection (EMAIL, WHATSAPP, BOTH)
    - Validate invoices are in DRAFT status
    - Track delivery failures with reasons
    - Update invoice and delivery status
    - Add Swagger/OpenAPI annotations
    - Return summary with sent/failed counts
  </in_scope>
  <out_of_scope>
    - Email sending logic (in MCP service)
    - WhatsApp sending logic (in MCP service)
    - PDF generation (in service layer)
    - Parent contact preference management
    - Delivery retry logic (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/billing/invoice.controller.ts">
      @Post('send')
      @ApiOperation({ summary: 'Send approved invoices to parents' })
      @ApiResponse({ status: 200, type: SendInvoicesResponseDto })
      @Roles(UserRole.OWNER, UserRole.ADMIN)
      @UseGuards(JwtAuthGuard, RolesGuard)
      async sendInvoices(
        @Body() dto: SendInvoicesDto,
        @CurrentUser() user: User
      ): Promise&lt;SendInvoicesResponseDto&gt;;
    </signature>
    <signature file="src/api/billing/dto/send-invoices.dto.ts">
      export class SendInvoicesDto {
        @IsArray()
        @IsUUID('4', { each: true })
        @ApiProperty({ type: [String] })
        invoice_ids: string[];

        @IsOptional()
        @IsEnum(DeliveryMethod)
        @ApiProperty({
          enum: DeliveryMethod,
          required: false,
          description: 'Defaults to parent preference'
        })
        delivery_method?: DeliveryMethod;
      }

      export class DeliveryFailureDto {
        @ApiProperty()
        invoice_id: string;

        @ApiProperty()
        invoice_number: string;

        @ApiProperty()
        reason: string;
      }

      export class SendInvoicesResponseDto {
        @ApiProperty()
        success: boolean;

        @ApiProperty()
        data: {
          sent: number;
          failed: number;
          failures: DeliveryFailureDto[];
        };
      }
    </signature>
  </signatures>

  <constraints>
    - Only OWNER and ADMIN roles can send invoices
    - Invoices must be in DRAFT status to send
    - Must validate all invoice_ids exist and belong to tenant
    - If delivery_method not specified, use parent preference
    - Must update invoice status to SENT on success
    - Must track delivery_status (SENT, FAILED, DELIVERED)
    - Failed deliveries must not block others
    - Must return detailed failure reasons
    - All DTOs must have Swagger documentation
  </constraints>

  <verification>
    - POST /invoices/send sends invoices successfully
    - Validates invoices are in DRAFT status
    - Validates invoices belong to tenant
    - delivery_method override works
    - Parent preference is used when method not specified
    - Updates invoice status to SENT
    - Tracks delivery_status correctly
    - Returns sent/failed counts
    - Returns failure details with reasons
    - Only OWNER/ADMIN can access (403 for others)
  </verification>
</definition_of_done>

<pseudo_code>
InvoiceController (src/api/billing/invoice.controller.ts):
  @Post('send')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  async sendInvoices(dto: SendInvoicesDto, user: User):
    # Validate all invoices exist and belong to tenant
    invoices = await billingService.findByIds(dto.invoice_ids, user.tenantId)

    if (invoices.length !== dto.invoice_ids.length):
      throw new BadRequestException('One or more invoices not found')

    # Validate all invoices are in DRAFT status
    nonDraftInvoices = invoices.filter(inv => inv.status !== 'DRAFT')
    if (nonDraftInvoices.length > 0):
      throw new BadRequestException(
        'All invoices must be in DRAFT status to send'
      )

    # Send invoices
    result = await deliveryService.sendInvoices({
      invoices,
      deliveryMethod: dto.delivery_method, # optional override
      tenantId: user.tenantId
    })

    # Format response
    return {
      success: true,
      data: {
        sent: result.successful.length,
        failed: result.failures.length,
        failures: result.failures.map(failure => ({
          invoice_id: failure.invoice.id,
          invoice_number: failure.invoice.invoiceNumber,
          reason: failure.reason
        }))
      }
    }

DeliveryService.sendInvoices (pseudo):
  async sendInvoices({ invoices, deliveryMethod, tenantId }):
    successful = []
    failures = []

    for (invoice of invoices):
      try:
        # Determine delivery method
        method = deliveryMethod || invoice.parent.preferredDeliveryMethod

        # Get parent contact info
        parent = invoice.parent

        # Generate PDF if not already generated
        pdfUrl = await pdfService.getInvoicePdf(invoice.id)

        # Send via appropriate channel(s)
        if (method === 'EMAIL' || method === 'BOTH'):
          await emailMcp.sendInvoice({
            to: parent.email,
            invoiceNumber: invoice.invoiceNumber,
            pdfUrl
          })

        if (method === 'WHATSAPP' || method === 'BOTH'):
          await whatsappMcp.sendInvoice({
            to: parent.phone,
            invoiceNumber: invoice.invoiceNumber,
            pdfUrl
          })

        # Update invoice status
        await invoiceRepo.update(invoice.id, {
          status: 'SENT',
          deliveryStatus: 'SENT',
          sentAt: new Date()
        })

        successful.push(invoice)

      catch (error):
        failures.push({
          invoice,
          reason: error.message
        })

    return { successful, failures }

Error Handling:
  # Common failure reasons
  - Invalid email address
  - Invalid phone number
  - Email service unavailable
  - WhatsApp service unavailable
  - PDF generation failed
  - Missing parent contact info
</pseudo_code>

<files_to_create>
  <file path="src/api/billing/dto/send-invoices.dto.ts">Invoice delivery DTOs</file>
  <file path="src/api/billing/dto/delivery-failure.dto.ts">Delivery failure DTO</file>
  <file path="tests/api/billing/send-invoices.spec.ts">Send endpoint unit tests</file>
  <file path="tests/api/billing/send-invoices.e2e-spec.ts">Send E2E tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/billing/invoice.controller.ts">Add send endpoint</file>
</files_to_modify>

<validation_criteria>
  <criterion>POST /invoices/send sends invoices successfully</criterion>
  <criterion>Validates DRAFT status requirement</criterion>
  <criterion>Validates tenant ownership</criterion>
  <criterion>delivery_method override works</criterion>
  <criterion>Parent preference used when not specified</criterion>
  <criterion>Updates invoice status to SENT</criterion>
  <criterion>Returns accurate sent/failed counts</criterion>
  <criterion>Returns detailed failure reasons</criterion>
  <criterion>Role guard enforces OWNER/ADMIN only</criterion>
  <criterion>All tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- send-invoices.spec</command>
  <command>npm run test:e2e -- send-invoices.e2e-spec</command>
  <command>curl -X POST -H "Authorization: Bearer TOKEN" -d '{"invoice_ids":["uuid1","uuid2"]}' http://localhost:3000/v1/invoices/send</command>
  <command>curl -X POST -H "Authorization: Bearer TOKEN" -d '{"invoice_ids":["uuid1"],"delivery_method":"EMAIL"}' http://localhost:3000/v1/invoices/send</command>
</test_commands>

</task_spec>
