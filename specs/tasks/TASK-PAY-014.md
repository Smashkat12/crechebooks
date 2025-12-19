<task_spec id="TASK-PAY-014" version="1.0">

<metadata>
  <title>Payment Reminder Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>27</sequence>
  <implements>
    <requirement_ref>REQ-PAY-009</requirement_ref>
    <requirement_ref>REQ-PAY-010</requirement_ref>
    <requirement_ref>REQ-PAY-011</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the ReminderService which handles automated and manual payment reminders
for overdue invoices. It uses template-based content with SMS-like friendly tone and
implements escalation rules (7 days friendly, 14 days firmer, 30 days final notice).
Supports multi-channel delivery via Email and WhatsApp MCP integrations. Tracks reminder
history to prevent duplicate sends and provides reporting on reminder effectiveness.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="arrears_service">src/core/payment/arrears.service.ts</file>
  <file purpose="external_integrations">specs/technical/external-integrations.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-013 completed (ArrearsService exists)</check>
  <check>TASK-BILL-003 completed (Invoice entity exists)</check>
  <check>Email MCP integration available</check>
  <check>WhatsApp MCP integration available</check>
  <check>Template engine available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create ReminderService
    - Implement sendReminders (manual and scheduled)
    - Implement generateReminderContent (template-based with tone escalation)
    - Implement scheduleReminder (for future sends)
    - Implement escalateOverdue (automatic escalation based on days)
    - Implement getReminderHistory (track sends per parent)
    - Create Reminder entity and repository
    - Create reminder templates (friendly, firm, final)
    - Support Email and WhatsApp delivery channels
    - Track delivery status and read receipts (where available)
  </in_scope>
  <out_of_scope>
    - Automated scheduler/cron jobs (infrastructure layer)
    - API endpoints (API layer tasks)
    - WhatsApp MCP implementation (external integration layer)
    - Email MCP implementation (external integration layer)
    - Payment portal links (UI layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/payment/reminder.service.ts">
      @Injectable()
      export class ReminderService {
        constructor(
          private prisma: PrismaService,
          private reminderRepository: ReminderRepository,
          private invoiceRepository: InvoiceRepository,
          private parentRepository: ParentRepository,
          private arrearsService: ArrearsService,
          private emailMcp: EmailMcpService,
          private whatsappMcp: WhatsAppMcpService,
          private templateEngine: TemplateEngineService,
          private logger: LoggerService
        ) {}

        async sendReminders(
          invoiceIds: string[],
          channel?: DeliveryChannel,
          tenantId: string
        ): Promise&lt;ReminderResult&gt;

        async generateReminderContent(
          invoice: Invoice,
          escalationLevel: EscalationLevel
        ): Promise&lt;ReminderContent&gt;

        async scheduleReminder(
          invoiceId: string,
          sendDate: Date,
          channel: DeliveryChannel,
          tenantId: string
        ): Promise&lt;Reminder&gt;

        async escalateOverdue(
          tenantId: string
        ): Promise&lt;EscalationResult&gt;

        async getReminderHistory(
          parentId: string,
          tenantId: string
        ): Promise&lt;ReminderHistoryEntry[]&gt;

        private determineEscalationLevel(
          daysOverdue: number
        ): EscalationLevel

        private sendViaEmail(
          parent: Parent,
          content: ReminderContent
        ): Promise&lt;DeliveryStatus&gt;

        private sendViaWhatsApp(
          parent: Parent,
          content: ReminderContent
        ): Promise&lt;DeliveryStatus&gt;

        private hasRecentReminder(
          invoiceId: string,
          daysSince: number
        ): Promise&lt;boolean&gt;
      }
    </signature>
    <signature file="src/database/entities/reminder.entity.ts">
      export enum EscalationLevel {
        FRIENDLY = 'FRIENDLY',      // 1-7 days overdue
        FIRM = 'FIRM',              // 8-14 days overdue
        FINAL = 'FINAL'             // 15+ days overdue
      }

      export enum DeliveryChannel {
        EMAIL = 'EMAIL',
        WHATSAPP = 'WHATSAPP',
        BOTH = 'BOTH'
      }

      export enum DeliveryStatus {
        PENDING = 'PENDING',
        SENT = 'SENT',
        DELIVERED = 'DELIVERED',
        READ = 'READ',
        FAILED = 'FAILED'
      }

      export interface IReminder {
        id: string;
        tenantId: string;
        invoiceId: string;
        parentId: string;
        escalationLevel: EscalationLevel;
        deliveryChannel: DeliveryChannel;
        deliveryStatus: DeliveryStatus;
        scheduledFor: Date | null;
        sentAt: Date | null;
        deliveredAt: Date | null;
        readAt: Date | null;
        content: string;
        failureReason: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/core/payment/dto/reminder.dto.ts">
      export interface ReminderContent {
        subject: string;
        body: string;
        tone: EscalationLevel;
        invoiceNumber: string;
        amount: number;
        daysOverdue: number;
      }

      export interface ReminderResult {
        sent: number;
        failed: number;
        skipped: number;
        failures: {
          invoiceId: string;
          reason: string;
        }[];
      }

      export interface EscalationResult {
        friendly: number;
        firm: number;
        final: number;
        totalSent: number;
      }

      export interface ReminderHistoryEntry {
        reminderId: string;
        invoiceNumber: string;
        sentAt: Date;
        escalationLevel: EscalationLevel;
        deliveryChannel: DeliveryChannel;
        deliveryStatus: DeliveryStatus;
        amount: number;
      }
    </signature>
  </signatures>

  <constraints>
    - Escalation levels: FRIENDLY (1-7 days), FIRM (8-14 days), FINAL (15+ days)
    - Must check for recent reminders before sending (minimum 3 days between)
    - Templates must use SMS-like friendly tone (South African context)
    - Email subject lines must be clear and non-aggressive
    - WhatsApp messages must comply with character limits
    - Must track delivery status where API supports it
    - Must handle failed deliveries gracefully (log and continue)
    - Must include invoice number, amount, and payment instructions
    - Must NOT send to parents with credit balance
    - Must respect parent communication preferences
  </constraints>

  <verification>
    - Service instantiates without errors
    - sendReminders sends via correct channel
    - generateReminderContent uses appropriate tone per escalation level
    - Escalation level determined correctly by days overdue
    - scheduleReminder creates future reminder
    - escalateOverdue processes all overdue invoices
    - getReminderHistory returns accurate history
    - Duplicate reminder prevention works (3-day minimum)
    - Email delivery via MCP works
    - WhatsApp delivery via MCP works
    - Unit tests pass
    - Integration tests with MCP services pass
  </verification>
</definition_of_done>

<pseudo_code>
ReminderService (src/core/payment/reminder.service.ts):
  @Injectable()
  export class ReminderService:
    constructor(
      private prisma: PrismaService,
      private reminderRepository: ReminderRepository,
      private invoiceRepository: InvoiceRepository,
      private parentRepository: ParentRepository,
      private arrearsService: ArrearsService,
      private emailMcp: EmailMcpService,
      private whatsappMcp: WhatsAppMcpService,
      private templateEngine: TemplateEngineService,
      private logger: LoggerService
    )

    async sendReminders(
      invoiceIds: string[],
      channel?: DeliveryChannel,
      tenantId: string
    ): Promise<ReminderResult>:
      result = {
        sent: 0,
        failed: 0,
        skipped: 0,
        failures: []
      }

      for invoiceId in invoiceIds:
        try:
          // 1. Get invoice
          invoice = await invoiceRepository.findById(invoiceId, tenantId)

          if !invoice:
            result.skipped++
            continue

          // 2. Check if already paid
          if invoice.status === InvoiceStatus.PAID:
            result.skipped++
            continue

          // 3. Check for recent reminder
          hasRecent = await hasRecentReminder(invoiceId, 3)
          if hasRecent:
            result.skipped++
            logger.info(`Skipping ${invoiceId} - recent reminder sent`)
            continue

          // 4. Calculate days overdue
          daysOverdue = arrearsService.calculateDaysOverdue(invoice)

          // 5. Determine escalation level
          escalationLevel = determineEscalationLevel(daysOverdue)

          // 6. Generate content
          content = await generateReminderContent(invoice, escalationLevel)

          // 7. Get parent
          parent = await parentRepository.findById(invoice.parentId, tenantId)

          // 8. Determine delivery channel
          deliveryChannel = channel || parent.preferredChannel || DeliveryChannel.EMAIL

          // 9. Send reminder
          deliveryStatus = null

          if deliveryChannel === DeliveryChannel.EMAIL || deliveryChannel === DeliveryChannel.BOTH:
            emailStatus = await sendViaEmail(parent, content)
            deliveryStatus = emailStatus

          if deliveryChannel === DeliveryChannel.WHATSAPP || deliveryChannel === DeliveryChannel.BOTH:
            whatsappStatus = await sendViaWhatsApp(parent, content)
            deliveryStatus = whatsappStatus

          // 10. Create reminder record
          await reminderRepository.create({
            tenantId: tenantId,
            invoiceId: invoiceId,
            parentId: parent.id,
            escalationLevel: escalationLevel,
            deliveryChannel: deliveryChannel,
            deliveryStatus: deliveryStatus,
            sentAt: new Date(),
            content: content.body
          })

          result.sent++

        catch error:
          result.failed++
          result.failures.push({
            invoiceId: invoiceId,
            reason: error.message
          })
          logger.error(`Failed to send reminder for ${invoiceId}`, error)

      return result

    async generateReminderContent(
      invoice: Invoice,
      escalationLevel: EscalationLevel
    ): Promise<ReminderContent>:
      outstanding = (invoice.totalCents - invoice.amountPaidCents) / 100
      daysOverdue = arrearsService.calculateDaysOverdue(invoice)

      // Select template based on escalation level
      template = null
      subject = null

      switch escalationLevel:
        case EscalationLevel.FRIENDLY:
          template = FRIENDLY_TEMPLATE
          subject = `Friendly reminder: Invoice ${invoice.invoiceNumber} payment`
          break
        case EscalationLevel.FIRM:
          template = FIRM_TEMPLATE
          subject = `Payment overdue: Invoice ${invoice.invoiceNumber}`
          break
        case EscalationLevel.FINAL:
          template = FINAL_TEMPLATE
          subject = `Final notice: Invoice ${invoice.invoiceNumber} - Action required`
          break

      // Render template
      body = templateEngine.render(template, {
        parentName: invoice.parent.name,
        childName: invoice.child.name,
        invoiceNumber: invoice.invoiceNumber,
        amount: outstanding,
        dueDate: invoice.dueDate,
        daysOverdue: daysOverdue,
        crecheName: invoice.tenant.name,
        crechePhone: invoice.tenant.phone,
        crecheEmail: invoice.tenant.email,
        bankingDetails: invoice.tenant.bankingDetails
      })

      return {
        subject: subject,
        body: body,
        tone: escalationLevel,
        invoiceNumber: invoice.invoiceNumber,
        amount: outstanding,
        daysOverdue: daysOverdue
      }

    async scheduleReminder(
      invoiceId: string,
      sendDate: Date,
      channel: DeliveryChannel,
      tenantId: string
    ): Promise<Reminder>:
      invoice = await invoiceRepository.findById(invoiceId, tenantId)

      if !invoice:
        throw new NotFoundException('Invoice not found')

      daysOverdue = arrearsService.calculateDaysOverdue(invoice)
      escalationLevel = determineEscalationLevel(daysOverdue)

      reminder = await reminderRepository.create({
        tenantId: tenantId,
        invoiceId: invoiceId,
        parentId: invoice.parentId,
        escalationLevel: escalationLevel,
        deliveryChannel: channel,
        deliveryStatus: DeliveryStatus.PENDING,
        scheduledFor: sendDate
      })

      logger.info(`Scheduled reminder for ${invoiceId} at ${sendDate}`)

      return reminder

    async escalateOverdue(tenantId: string): Promise<EscalationResult>:
      // 1. Get arrears report
      arrearsReport = await arrearsService.getArrearsReport(tenantId)

      result = {
        friendly: 0,
        firm: 0,
        final: 0,
        totalSent: 0
      }

      // 2. Process each overdue invoice
      for arrearsInvoice in arrearsReport.invoices:
        // Determine escalation level
        escalationLevel = determineEscalationLevel(arrearsInvoice.daysOverdue)

        // Check for recent reminder
        hasRecent = await hasRecentReminder(arrearsInvoice.invoiceId, 3)
        if hasRecent:
          continue

        // Send reminder
        try:
          await sendReminders([arrearsInvoice.invoiceId], null, tenantId)

          switch escalationLevel:
            case EscalationLevel.FRIENDLY:
              result.friendly++
              break
            case EscalationLevel.FIRM:
              result.firm++
              break
            case EscalationLevel.FINAL:
              result.final++
              break

          result.totalSent++

        catch error:
          logger.error(`Escalation failed for ${arrearsInvoice.invoiceId}`, error)

      return result

    async getReminderHistory(parentId: string, tenantId: string): Promise<ReminderHistoryEntry[]>:
      reminders = await reminderRepository.findByParentId(parentId, tenantId)

      return reminders.map(reminder => ({
        reminderId: reminder.id,
        invoiceNumber: reminder.invoice.invoiceNumber,
        sentAt: reminder.sentAt,
        escalationLevel: reminder.escalationLevel,
        deliveryChannel: reminder.deliveryChannel,
        deliveryStatus: reminder.deliveryStatus,
        amount: (reminder.invoice.totalCents - reminder.invoice.amountPaidCents) / 100
      }))

    private determineEscalationLevel(daysOverdue: number): EscalationLevel:
      if daysOverdue <= 7:
        return EscalationLevel.FRIENDLY
      else if daysOverdue <= 14:
        return EscalationLevel.FIRM
      else:
        return EscalationLevel.FINAL

    private async sendViaEmail(parent: Parent, content: ReminderContent): Promise<DeliveryStatus>:
      if !parent.email:
        throw new Error('Parent has no email address')

      try:
        await emailMcp.sendEmail({
          to: parent.email,
          subject: content.subject,
          body: content.body,
          isHtml: false
        })

        return DeliveryStatus.SENT

      catch error:
        logger.error(`Email send failed for ${parent.email}`, error)
        throw error

    private async sendViaWhatsApp(parent: Parent, content: ReminderContent): Promise<DeliveryStatus>:
      if !parent.phone:
        throw new Error('Parent has no phone number')

      try:
        await whatsappMcp.sendMessage({
          to: parent.phone,
          message: content.body
        })

        return DeliveryStatus.SENT

      catch error:
        logger.error(`WhatsApp send failed for ${parent.phone}`, error)
        throw error

    private async hasRecentReminder(invoiceId: string, daysSince: number): Promise<boolean>:
      cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysSince)

      recentReminder = await reminderRepository.findRecent(invoiceId, cutoffDate)

      return recentReminder !== null

Templates (src/core/payment/templates/reminder.templates.ts):
  export const FRIENDLY_TEMPLATE = `
    Hi {{parentName}},

    Just a friendly reminder that invoice {{invoiceNumber}} for {{childName}}'s fees is now {{daysOverdue}} days overdue.

    Amount due: R{{amount}}
    Original due date: {{dueDate}}

    We understand things can get busy! Please process the payment at your earliest convenience.

    Banking details:
    {{bankingDetails}}

    If you've already paid, please ignore this message. For any queries, contact us at {{crechePhone}} or {{crecheEmail}}.

    Thank you!
    {{crecheName}}
  `

  export const FIRM_TEMPLATE = `
    Hi {{parentName}},

    This is an important reminder regarding invoice {{invoiceNumber}} for {{childName}}.

    Amount overdue: R{{amount}}
    Days overdue: {{daysOverdue}}

    Please arrange payment urgently to avoid further action.

    Banking details:
    {{bankingDetails}}

    If you're experiencing difficulty, please contact us immediately to discuss payment arrangements.

    {{crecheName}}
    {{crechePhone}} | {{crecheEmail}}
  `

  export const FINAL_TEMPLATE = `
    FINAL NOTICE

    Dear {{parentName}},

    Invoice {{invoiceNumber}} for {{childName}} is seriously overdue.

    Amount outstanding: R{{amount}}
    Days overdue: {{daysOverdue}}

    IMMEDIATE PAYMENT IS REQUIRED.

    Failure to settle this account may result in:
    - Suspension of services
    - Legal action to recover debt

    Banking details:
    {{bankingDetails}}

    Contact us urgently if you need to discuss this: {{crechePhone}} or {{crecheEmail}}

    {{crecheName}}
  `

DTOs (src/core/payment/dto/reminder.dto.ts):
  export interface ReminderContent:
    subject: string
    body: string
    tone: EscalationLevel
    invoiceNumber: string
    amount: number
    daysOverdue: number

  export interface ReminderResult:
    sent: number
    failed: number
    skipped: number
    failures: {
      invoiceId: string
      reason: string
    }[]

  export interface EscalationResult:
    friendly: number
    firm: number
    final: number
    totalSent: number

  export interface ReminderHistoryEntry:
    reminderId: string
    invoiceNumber: string
    sentAt: Date
    escalationLevel: EscalationLevel
    deliveryChannel: DeliveryChannel
    deliveryStatus: DeliveryStatus
    amount: number
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/reminder.entity.ts">Reminder entity with enums</file>
  <file path="src/database/repositories/reminder.repository.ts">Reminder repository</file>
  <file path="src/core/payment/reminder.service.ts">ReminderService implementation</file>
  <file path="src/core/payment/dto/reminder.dto.ts">Reminder DTOs</file>
  <file path="src/core/payment/templates/reminder.templates.ts">Reminder content templates</file>
  <file path="tests/core/payment/reminder.service.spec.ts">Unit tests</file>
  <file path="tests/core/payment/reminder.integration.spec.ts">Integration tests with MCP</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_reminders/migration.sql">Reminder table migration</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Reminder model and enums</file>
  <file path="src/core/payment/index.ts">Export ReminderService</file>
  <file path="src/core/payment/payment.module.ts">Register ReminderService</file>
  <file path="src/database/entities/index.ts">Export Reminder entities</file>
</files_to_modify>

<validation_criteria>
  <criterion>Reminder entity created with all required fields</criterion>
  <criterion>Migration creates reminders table successfully</criterion>
  <criterion>Service compiles without TypeScript errors</criterion>
  <criterion>sendReminders sends via correct channel (Email/WhatsApp)</criterion>
  <criterion>generateReminderContent uses appropriate tone per escalation level</criterion>
  <criterion>Escalation levels: FRIENDLY (1-7 days), FIRM (8-14 days), FINAL (15+ days)</criterion>
  <criterion>Duplicate reminder prevention works (3-day minimum)</criterion>
  <criterion>scheduleReminder creates pending reminder for future</criterion>
  <criterion>escalateOverdue processes all overdue invoices</criterion>
  <criterion>getReminderHistory returns accurate history per parent</criterion>
  <criterion>Email MCP integration works</criterion>
  <criterion>WhatsApp MCP integration works</criterion>
  <criterion>Templates render correctly with variables</criterion>
  <criterion>Unit tests achieve >90% coverage</criterion>
  <criterion>Integration tests verify end-to-end delivery</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_reminders</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "ReminderService"</command>
  <command>npm run test:integration -- --grep "reminder"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>
