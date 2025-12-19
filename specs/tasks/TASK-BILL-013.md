<task_spec id="TASK-BILL-013" version="1.0">

<metadata>
  <title>Invoice Delivery Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>22</sequence>
  <implements>
    <requirement_ref>REQ-BILL-006</requirement_ref>
    <requirement_ref>REQ-BILL-007</requirement_ref>
    <requirement_ref>REQ-BILL-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the InvoiceDeliveryService which handles multi-channel invoice
delivery to parents via Email (using Email MCP) and WhatsApp (using WhatsApp MCP).
The service tracks delivery status, handles delivery failures with retry logic,
and updates invoice status appropriately. Parents can receive invoices via their
preferred contact method (email, WhatsApp, or both), and the system tracks
delivery attempts, successes, and failures with detailed logging.
</context>

<input_context_files>
  <file purpose="requirements">specs/requirements/billing.md#REQ-BILL-006,REQ-BILL-007,REQ-BILL-008</file>
  <file purpose="data_model">specs/technical/data-models.md#Invoice</file>
  <file purpose="api_contract">specs/technical/api-contracts.md#BillingService</file>
  <file purpose="entity_reference">src/database/entities/invoice.entity.ts</file>
  <file purpose="parent_entity">src/database/entities/parent.entity.ts</file>
  <file purpose="repository_reference">src/database/repositories/invoice.repository.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-003 completed (Invoice entities exist)</check>
  <check>InvoiceRepository available</check>
  <check>ParentRepository available</check>
  <check>Email MCP server configured and accessible</check>
  <check>WhatsApp MCP server configured and accessible (optional)</check>
</prerequisites>

<scope>
  <in_scope>
    - Create InvoiceDeliveryService in src/core/billing/
    - Implement sendInvoices batch method
    - Implement sendEmail method using Email MCP
    - Implement sendWhatsApp method using WhatsApp MCP
    - Implement trackDelivery method for status updates
    - Implement retryFailed method with exponential backoff
    - Delivery status tracking (PENDING, SENT, DELIVERED, OPENED, FAILED)
    - Update invoice status from DRAFT to SENT on successful delivery
    - Handle delivery failures gracefully with logging
    - Unit tests for all methods
    - Integration tests with MCP mocks
  </in_scope>
  <out_of_scope>
    - Invoice PDF generation (separate task)
    - Invoice template rendering
    - Parent contact management
    - Email/WhatsApp template design
    - Delivery scheduling/queuing (future enhancement)
    - Read receipts for WhatsApp (track if MCP provides)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/billing/invoice-delivery.service.ts">
      import { Injectable, NotFoundException } from '@nestjs/common';
      import { InvoiceRepository } from '../../database/repositories/invoice.repository';
      import { ParentRepository } from '../../database/repositories/parent.repository';
      import { EmailService } from '../../integrations/email/email.service';
      import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
      import { DeliveryMethod, DeliveryStatus, InvoiceStatus } from '../../database/entities/invoice.entity';

      export interface DeliveryResult {
        sent: number;
        failed: number;
        failures: Array&lt;{
          invoiceId: string;
          reason: string;
          channel?: 'EMAIL' | 'WHATSAPP';
        }&gt;;
      }

      export interface DeliveryAttempt {
        invoiceId: string;
        channel: 'EMAIL' | 'WHATSAPP';
        status: DeliveryStatus;
        attemptedAt: Date;
        error?: string;
      }

      @Injectable()
      export class InvoiceDeliveryService {
        private readonly MAX_RETRIES = 3;
        private readonly RETRY_DELAY_MS = 5000;  // 5 seconds base delay

        constructor(
          private readonly invoiceRepo: InvoiceRepository,
          private readonly parentRepo: ParentRepository,
          private readonly emailService: EmailService,
          private readonly whatsAppService: WhatsAppService,
        ) {}

        /**
         * Send invoices to parents via their preferred method(s)
         * @param invoiceIds Array of invoice IDs to send
         * @param method Optional override for delivery method
         * @returns Summary of successful sends and failures
         */
        async sendInvoices(
          tenantId: string,
          invoiceIds: string[],
          method?: DeliveryMethod,
        ): Promise&lt;DeliveryResult&gt;;

        /**
         * Send invoice via email using Email MCP
         * @throws Error if email send fails after retries
         */
        async sendEmail(
          invoice: Invoice,
          parent: Parent,
        ): Promise&lt;DeliveryAttempt&gt;;

        /**
         * Send invoice via WhatsApp using WhatsApp MCP
         * @throws Error if WhatsApp send fails after retries
         */
        async sendWhatsApp(
          invoice: Invoice,
          parent: Parent,
        ): Promise&lt;DeliveryAttempt&gt;;

        /**
         * Track delivery status and update invoice
         */
        async trackDelivery(
          tenantId: string,
          invoiceId: string,
          attempt: DeliveryAttempt,
        ): Promise&lt;void&gt;;

        /**
         * Retry failed deliveries with exponential backoff
         * @param maxAge Maximum age in hours for failed invoices to retry
         */
        async retryFailed(
          tenantId: string,
          maxAge: number = 24,
        ): Promise&lt;DeliveryResult&gt;;
      }
    </signature>

    <signature file="src/integrations/email/email.service.ts">
      import { Injectable } from '@nestjs/common';

      export interface EmailAttachment {
        filename: string;
        content: Buffer | string;
        contentType: string;
      }

      @Injectable()
      export class EmailService {
        /**
         * Send email via Email MCP
         * Uses mcp__email__send MCP tool
         */
        async sendEmail(
          to: string,
          subject: string,
          body: string,
          attachments?: EmailAttachment[],
        ): Promise&lt;{ messageId: string; status: string }&gt;;
      }
    </signature>

    <signature file="src/integrations/whatsapp/whatsapp.service.ts">
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class WhatsAppService {
        /**
         * Send WhatsApp message via WhatsApp MCP
         * Uses mcp__whatsapp__send MCP tool
         */
        async sendMessage(
          to: string,
          message: string,
          mediaUrl?: string,
        ): Promise&lt;{ messageId: string; status: string }&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate invoice is in DRAFT status before sending
    - Must validate parent has valid contact information for chosen method
    - Must update invoice status to SENT only after successful delivery
    - Must update deliveryStatus and deliveredAt on success
    - Must log all delivery attempts with timestamps
    - Must handle MCP service unavailability gracefully
    - Must NOT mark as SENT if delivery fails
    - Must respect parent's preferred contact method if no override
    - Email subject format: "Invoice {invoiceNumber} - {TenantName}"
    - WhatsApp message should include invoice summary and payment details
    - Must NOT use 'any' type anywhere
    - Must sanitize email addresses and phone numbers
    - Retry logic should use exponential backoff (5s, 10s, 20s)
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass
    - sendInvoices processes batch correctly
    - sendEmail calls Email MCP with correct parameters
    - sendWhatsApp calls WhatsApp MCP with correct parameters
    - Invoice status updated to SENT on success
    - Invoice status remains DRAFT on failure
    - deliveryStatus tracked correctly (SENT, DELIVERED, FAILED)
    - retryFailed implements exponential backoff
    - Failures logged with detailed error messages
    - Both EMAIL and BOTH delivery methods work
  </verification>
</definition_of_done>

<pseudo_code>
InvoiceDeliveryService (src/core/billing/invoice-delivery.service.ts):

  async sendInvoices(tenantId, invoiceIds, method?):
    result = {
      sent: 0,
      failed: 0,
      failures: []
    }

    // Get tenant for email context
    tenant = await tenantRepo.findById(tenantId)

    // Process each invoice
    for (invoiceId in invoiceIds) {
      try {
        // Get invoice with parent relationship
        invoice = await invoiceRepo.findById(tenantId, invoiceId)
        if (!invoice) {
          result.failures.push({
            invoiceId: invoiceId,
            reason: 'Invoice not found'
          })
          result.failed++
          continue
        }

        // Validate invoice is in DRAFT status
        if (invoice.status !== InvoiceStatus.DRAFT) {
          result.failures.push({
            invoiceId: invoiceId,
            reason: `Invoice status is ${invoice.status}, expected DRAFT`
          })
          result.failed++
          continue
        }

        // Get parent
        parent = await parentRepo.findById(tenantId, invoice.parentId)
        if (!parent) {
          result.failures.push({
            invoiceId: invoiceId,
            reason: 'Parent not found'
          })
          result.failed++
          continue
        }

        // Determine delivery method
        deliveryMethod = method || parent.preferredContact || DeliveryMethod.EMAIL

        // Track delivery attempts
        attempts = []
        emailSuccess = false
        whatsAppSuccess = false

        // Send via email if required
        if (deliveryMethod === DeliveryMethod.EMAIL || deliveryMethod === DeliveryMethod.BOTH) {
          if (!parent.email) {
            result.failures.push({
              invoiceId: invoiceId,
              reason: 'Parent has no email address',
              channel: 'EMAIL'
            })
          } else {
            try {
              attempt = await this.sendEmail(invoice, parent)
              attempts.push(attempt)

              if (attempt.status === DeliveryStatus.SENT || attempt.status === DeliveryStatus.DELIVERED) {
                emailSuccess = true
              }
            } catch (error) {
              result.failures.push({
                invoiceId: invoiceId,
                reason: error.message,
                channel: 'EMAIL'
              })
            }
          }
        }

        // Send via WhatsApp if required
        if (deliveryMethod === DeliveryMethod.WHATSAPP || deliveryMethod === DeliveryMethod.BOTH) {
          if (!parent.phone) {
            result.failures.push({
              invoiceId: invoiceId,
              reason: 'Parent has no phone number',
              channel: 'WHATSAPP'
            })
          } else {
            try {
              attempt = await this.sendWhatsApp(invoice, parent)
              attempts.push(attempt)

              if (attempt.status === DeliveryStatus.SENT || attempt.status === DeliveryStatus.DELIVERED) {
                whatsAppSuccess = true
              }
            } catch (error) {
              result.failures.push({
                invoiceId: invoiceId,
                reason: error.message,
                channel: 'WHATSAPP'
              })
            }
          }
        }

        // Update invoice if any delivery succeeded
        overallSuccess = false
        if (deliveryMethod === DeliveryMethod.BOTH) {
          // Both channels must succeed for BOTH method
          overallSuccess = emailSuccess && whatsAppSuccess
        } else {
          overallSuccess = emailSuccess || whatsAppSuccess
        }

        if (overallSuccess) {
          // Update invoice to SENT
          await invoiceRepo.update(tenantId, invoiceId, {
            status: InvoiceStatus.SENT,
            deliveryMethod: deliveryMethod,
            deliveryStatus: DeliveryStatus.SENT,
            deliveredAt: new Date()
          })

          result.sent++
        } else {
          // Mark as failed
          await invoiceRepo.update(tenantId, invoiceId, {
            deliveryMethod: deliveryMethod,
            deliveryStatus: DeliveryStatus.FAILED
          })

          result.failed++
        }

        // Track all delivery attempts
        for (attempt in attempts) {
          await this.trackDelivery(tenantId, invoiceId, attempt)
        }

      } catch (error) {
        result.failures.push({
          invoiceId: invoiceId,
          reason: error.message
        })
        result.failed++
      }
    }

    return result

  async sendEmail(invoice, parent):
    // Build email subject
    subject = `Invoice ${invoice.invoiceNumber} - ${invoice.tenant.name}`

    // Build email body (plain text version)
    totalAmount = (invoice.totalCents / 100).toFixed(2)
    dueDate = invoice.dueDate.toISOString().split('T')[0]

    body = `
Dear ${parent.firstName} ${parent.lastName},

Please find attached invoice ${invoice.invoiceNumber} for ${invoice.child.firstName} ${invoice.child.lastName}.

Invoice Details:
- Invoice Number: ${invoice.invoiceNumber}
- Amount Due: R ${totalAmount}
- Due Date: ${dueDate}

Payment Details:
[Payment instructions from tenant settings]

If you have any questions, please contact us.

Thank you,
${invoice.tenant.name}
    `.trim()

    // TODO: Generate PDF attachment (future task)
    // For now, send without attachment

    try {
      result = await emailService.sendEmail(
        parent.email,
        subject,
        body,
        // attachments: [pdfAttachment]  // Future
      )

      return {
        invoiceId: invoice.id,
        channel: 'EMAIL',
        status: DeliveryStatus.SENT,
        attemptedAt: new Date()
      }
    } catch (error) {
      return {
        invoiceId: invoice.id,
        channel: 'EMAIL',
        status: DeliveryStatus.FAILED,
        attemptedAt: new Date(),
        error: error.message
      }
    }

  async sendWhatsApp(invoice, parent):
    // Build WhatsApp message
    totalAmount = (invoice.totalCents / 100).toFixed(2)
    dueDate = invoice.dueDate.toISOString().split('T')[0]

    message = `
📄 *Invoice ${invoice.invoiceNumber}*

Dear ${parent.firstName},

Invoice for ${invoice.child.firstName} ${invoice.child.lastName}

💰 Amount: *R ${totalAmount}*
📅 Due: ${dueDate}

[Payment details]

Questions? Contact ${invoice.tenant.name}
    `.trim()

    try {
      result = await whatsAppService.sendMessage(
        parent.phone,
        message
      )

      return {
        invoiceId: invoice.id,
        channel: 'WHATSAPP',
        status: DeliveryStatus.SENT,
        attemptedAt: new Date()
      }
    } catch (error) {
      return {
        invoiceId: invoice.id,
        channel: 'WHATSAPP',
        status: DeliveryStatus.FAILED,
        attemptedAt: new Date(),
        error: error.message
      }
    }

  async trackDelivery(tenantId, invoiceId, attempt):
    // Log delivery attempt to database or logging service
    logger.info('Invoice delivery attempt', {
      tenantId: tenantId,
      invoiceId: invoiceId,
      channel: attempt.channel,
      status: attempt.status,
      attemptedAt: attempt.attemptedAt,
      error: attempt.error
    })

    // Could store in DeliveryLog table for audit trail (future enhancement)

  async retryFailed(tenantId, maxAge):
    // Get failed invoices within age limit
    cutoffDate = new Date()
    cutoffDate.setHours(cutoffDate.getHours() - maxAge)

    failedInvoices = await invoiceRepo.findByDeliveryStatus(
      tenantId,
      DeliveryStatus.FAILED,
      cutoffDate
    )

    result = {
      sent: 0,
      failed: 0,
      failures: []
    }

    // Retry each failed invoice with exponential backoff
    for (index, invoice in failedInvoices) {
      // Calculate delay based on retry attempt (exponential backoff)
      retryCount = invoice.deliveryRetryCount || 0

      if (retryCount >= this.MAX_RETRIES) {
        // Max retries reached, skip
        continue
      }

      // Exponential backoff: 5s, 10s, 20s
      delay = this.RETRY_DELAY_MS * Math.pow(2, retryCount)
      await sleep(delay)

      // Attempt resend
      try {
        deliveryResult = await this.sendInvoices(
          tenantId,
          [invoice.id],
          invoice.deliveryMethod
        )

        if (deliveryResult.sent > 0) {
          result.sent++
        } else {
          result.failed++
          result.failures.push(...deliveryResult.failures)

          // Increment retry count
          await invoiceRepo.update(tenantId, invoice.id, {
            deliveryRetryCount: retryCount + 1
          })
        }
      } catch (error) {
        result.failed++
        result.failures.push({
          invoiceId: invoice.id,
          reason: error.message
        })
      }
    }

    return result

EmailService (src/integrations/email/email.service.ts):

  async sendEmail(to, subject, body, attachments?):
    // Validate email address
    if (!this.isValidEmail(to)) {
      throw new Error('Invalid email address')
    }

    // Call Email MCP tool
    result = await mcpClient.call('mcp__email__send', {
      to: to,
      subject: subject,
      body: body,
      attachments: attachments
    })

    return {
      messageId: result.message_id,
      status: result.status
    }

  private isValidEmail(email: string): boolean {
    regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
  }

WhatsAppService (src/integrations/whatsapp/whatsapp.service.ts):

  async sendMessage(to, message, mediaUrl?):
    // Sanitize phone number
    sanitizedPhone = this.sanitizePhoneNumber(to)

    // Call WhatsApp MCP tool
    result = await mcpClient.call('mcp__whatsapp__send', {
      to: sanitizedPhone,
      message: message,
      media_url: mediaUrl
    })

    return {
      messageId: result.message_id,
      status: result.status
    }

  private sanitizePhoneNumber(phone: string): string {
    // Remove non-digit characters
    digits = phone.replace(/\D/g, '')

    // Add country code if missing (assume South Africa +27)
    if (!digits.startsWith('27') && digits.length === 10) {
      digits = '27' + digits.substring(1)  // Remove leading 0, add 27
    }

    return digits
  }
</pseudo_code>

<files_to_create>
  <file path="src/core/billing/invoice-delivery.service.ts">InvoiceDeliveryService with all methods</file>
  <file path="src/integrations/email/email.service.ts">EmailService for Email MCP integration</file>
  <file path="src/integrations/email/email.module.ts">EmailModule for dependency injection</file>
  <file path="src/integrations/whatsapp/whatsapp.service.ts">WhatsAppService for WhatsApp MCP integration</file>
  <file path="src/integrations/whatsapp/whatsapp.module.ts">WhatsAppModule for dependency injection</file>
  <file path="tests/core/billing/invoice-delivery.service.spec.ts">Unit tests for invoice delivery</file>
  <file path="tests/integrations/email/email.service.spec.ts">Unit tests for email service</file>
  <file path="tests/integrations/whatsapp/whatsapp.service.spec.ts">Unit tests for WhatsApp service</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/billing/billing.module.ts">Import InvoiceDeliveryService, EmailModule, WhatsAppModule</file>
  <file path="src/database/entities/invoice.entity.ts">Add deliveryRetryCount field if not present</file>
  <file path="src/database/repositories/invoice.repository.ts">Add findByDeliveryStatus method</file>
  <file path="prisma/schema.prisma">Add deliveryRetryCount to Invoice model if not present</file>
</files_to_modify>

<validation_criteria>
  <criterion>InvoiceDeliveryService compiles without TypeScript errors</criterion>
  <criterion>sendInvoices validates invoice status is DRAFT</criterion>
  <criterion>sendInvoices respects parent's preferred contact method</criterion>
  <criterion>sendEmail calls Email MCP with correct parameters</criterion>
  <criterion>sendWhatsApp calls WhatsApp MCP with correct parameters</criterion>
  <criterion>Email addresses validated before sending</criterion>
  <criterion>Phone numbers sanitized (South African format)</criterion>
  <criterion>Invoice status updated to SENT on success</criterion>
  <criterion>Invoice status remains DRAFT on failure</criterion>
  <criterion>deliveryStatus tracked correctly</criterion>
  <criterion>deliveredAt timestamp set on success</criterion>
  <criterion>retryFailed implements exponential backoff</criterion>
  <criterion>retryFailed respects MAX_RETRIES limit</criterion>
  <criterion>BOTH delivery method requires both channels to succeed</criterion>
  <criterion>All delivery attempts logged</criterion>
  <criterion>All unit tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- invoice-delivery.service.spec.ts</command>
  <command>npm run test -- email.service.spec.ts</command>
  <command>npm run test -- whatsapp.service.spec.ts</command>
  <command>npm run test:cov -- invoice-delivery.service.spec.ts</command>
</test_commands>

</task_spec>
