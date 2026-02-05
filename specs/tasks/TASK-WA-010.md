<task_spec id="TASK-WA-010" version="2.0">

<metadata>
  <title>WhatsApp Session-Based Interactive Features</title>
  <status>complete</status>
  <phase>26</phase>
  <layer>logic</layer>
  <sequence>270</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-SESSION-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-WA-007</task_ref>
    <task_ref status="ready">TASK-WA-009</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - List picker cannot be used in approved templates (session only)
  - No interactive menus for self-service
  - No statement period selection
  - No invoice selection from list
  - No help menu system

  **Existing Resources:**
  - TwilioContentService.sendListPicker (TASK-WA-007)
  - TwilioContentService.sendSessionQuickReply (TASK-WA-007)
  - ButtonResponseHandler (TASK-WA-009)

  **Gap:**
  - No list picker response handlers
  - No statement period selector
  - No invoice list generator
  - No help menu flow
  - No balance inquiry response

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/handlers/session-interactive.handler.ts`
  - `apps/api/src/integrations/whatsapp/types/session.types.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/handlers/button-response.handler.ts`
  - `apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts`
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Session Context
  List pickers and rich session messages can ONLY be sent during active 24-hour session:
  - Session starts when parent sends a message
  - Lasts 24 hours from last incoming message
  - No template approval needed for session messages
  - Max 3 quick reply buttons without approval
  - Max 10 list picker items

  ### 2. List Picker Types
  ```typescript
  // apps/api/src/integrations/whatsapp/types/session.types.ts

  export type ListPickerType =
    | 'statement_period'
    | 'invoice_list'
    | 'help_menu';

  export interface ListPickerItem {
    item: string;      // Max 24 chars
    id: string;        // Max 200 chars
    description?: string;  // Max 72 chars
  }

  export function parseListResponse(listId: string): {
    type: ListPickerType;
    value: string;
  } {
    const [type, ...rest] = listId.split('_');
    return {
      type: type as ListPickerType,
      value: rest.join('_'),
    };
  }
  ```

  ### 3. Session Interactive Handler
  ```typescript
  // apps/api/src/integrations/whatsapp/handlers/session-interactive.handler.ts

  @Injectable()
  export class SessionInteractiveHandler {
    private readonly logger = new Logger(SessionInteractiveHandler.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly contentService: TwilioContentService,
      private readonly statementService: StatementPdfService,
    ) {}

    /**
     * Send statement period selector (list picker)
     */
    async sendStatementPeriodSelector(
      to: string,
      tenantId: string,
    ): Promise<void> {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      const now = new Date();
      const currentMonth = now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
      const prevMonthStr = prevMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

      await this.contentService.sendListPicker(
        to,
        `Which statement would you like from ${tenant.tradingName}?`,
        'Select Period',
        [
          { item: 'Current Month', id: 'statement_current', description: currentMonth },
          { item: 'Previous Month', id: 'statement_prev', description: prevMonthStr },
          { item: 'Last 3 Months', id: 'statement_3mo', description: 'Summary' },
          { item: 'Year to Date', id: 'statement_ytd', description: 'Jan - now' },
          { item: 'Last Tax Year', id: 'statement_tax', description: 'Mar - Feb' },
        ],
      );
    }

    /**
     * Handle statement period selection
     */
    async handleStatementSelection(
      to: string,
      period: string,
      tenantId: string,
      parentId: string,
    ): Promise<void> {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      // Determine date range
      const { startDate, endDate } = this.calculateStatementPeriod(period);

      // Generate statement
      await this.contentService.sendSessionMessage(
        to,
        `Generating your ${this.periodToLabel(period)} statement from ${tenant.tradingName}. This may take a moment...`,
      );

      try {
        const statementUrl = await this.statementService.generateStatementPdf(
          tenantId,
          parentId,
          startDate,
          endDate,
        );

        // Send statement as document
        await this.contentService.sendSessionMessage(
          to,
          `Here is your requested statement from ${tenant.tradingName}.`,
          statementUrl,  // PDF attachment
        );
      } catch (error) {
        await this.contentService.sendSessionMessage(
          to,
          `Sorry, we couldn't generate your statement. Please contact ${tenant.tradingName} at ${tenant.phone} for assistance.`,
        );
      }
    }

    /**
     * Send invoice list for selection
     */
    async sendInvoiceList(
      to: string,
      tenantId: string,
      parentId: string,
    ): Promise<void> {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          parentId,
          status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        orderBy: { dueDate: 'desc' },
        take: 10,
      });

      if (invoices.length === 0) {
        await this.contentService.sendSessionMessage(
          to,
          `Good news! You have no unpaid invoices with ${tenant.tradingName}.`,
        );
        return;
      }

      const items = invoices.map(inv => ({
        item: inv.invoiceNumber,
        id: `invoice_${inv.id}`,
        description: `R${(inv.totalCents / 100).toFixed(2)} - ${inv.status}`,
      }));

      await this.contentService.sendListPicker(
        to,
        `You have ${invoices.length} unpaid invoice(s) with ${tenant.tradingName}. Select one to view details:`,
        'View Invoices',
        items,
      );
    }

    /**
     * Send help menu
     */
    async sendHelpMenu(
      to: string,
      tenantId: string,
    ): Promise<void> {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      await this.contentService.sendListPicker(
        to,
        `How can ${tenant.tradingName} help you today?`,
        'Select Topic',
        [
          { item: 'View My Balance', id: 'help_balance', description: 'Check outstanding amount' },
          { item: 'Payment Methods', id: 'help_payment', description: 'How to pay your fees' },
          { item: 'Request Statement', id: 'help_statement', description: 'Get account statement' },
          { item: 'Update Details', id: 'help_update', description: 'Change contact info' },
          { item: 'Speak to Someone', id: 'help_human', description: 'Request callback' },
        ],
      );
    }

    /**
     * Handle help menu selection
     */
    async handleHelpSelection(
      to: string,
      selection: string,
      tenantId: string,
      parentId: string,
    ): Promise<void> {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      switch (selection) {
        case 'balance':
          await this.sendBalanceInfo(to, tenantId, parentId, tenant);
          break;
        case 'payment':
          await this.sendPaymentMethods(to, tenant);
          break;
        case 'statement':
          await this.sendStatementPeriodSelector(to, tenantId);
          break;
        case 'update':
          await this.sendUpdateDetailsLink(to, tenant);
          break;
        case 'human':
          await this.requestHumanCallback(to, tenantId, parentId, tenant);
          break;
      }
    }

    /**
     * Send balance information
     */
    private async sendBalanceInfo(
      to: string,
      tenantId: string,
      parentId: string,
      tenant: Tenant,
    ): Promise<void> {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          parentId,
          status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
      });

      const totalOutstanding = invoices.reduce(
        (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
        0,
      );

      const formatted = (totalOutstanding / 100).toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
      });

      await this.contentService.sendSessionQuickReply(
        to,
        `Your current balance with ${tenant.tradingName} is R${formatted}.\n\n${invoices.length} unpaid invoice(s).\n\nWhat would you like to do?`,
        [
          { title: 'Pay Now', id: 'menu_pay' },
          { title: 'View Invoices', id: 'menu_invoices' },
          { title: 'Get Statement', id: 'menu_statement' },
        ],
      );
    }

    /**
     * Send payment methods info
     */
    private async sendPaymentMethods(
      to: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionMessage(
        to,
        `Payment Methods for ${tenant.tradingName}:\n\n` +
        `1. EFT Transfer:\n` +
        `   Bank: ${tenant.bankName}\n` +
        `   Account: ${tenant.bankAccountNumber}\n` +
        `   Branch: ${tenant.bankBranchCode}\n` +
        `   Reference: Your invoice number\n\n` +
        `2. Online Payment:\n` +
        `   Use the "Pay Now" button on any invoice\n\n` +
        `3. Cash/Card at Office:\n` +
        `   Visit us during office hours`,
      );
    }

    /**
     * Send portal update link
     */
    private async sendUpdateDetailsLink(
      to: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionMessage(
        to,
        `To update your contact details with ${tenant.tradingName}:\n\n` +
        `1. Log into your Parent Portal\n` +
        `2. Go to Profile > Contact Details\n` +
        `3. Update and save your information\n\n` +
        `Portal: https://app.crechebooks.co.za/portal`,
      );
    }

    /**
     * Request human callback
     */
    private async requestHumanCallback(
      to: string,
      tenantId: string,
      parentId: string,
      tenant: Tenant,
    ): Promise<void> {
      // TODO: Create callback request in database

      await this.contentService.sendSessionMessage(
        to,
        `We'll have someone from ${tenant.tradingName} call you back during office hours (08:00-17:00, Mon-Fri).\n\n` +
        `For urgent matters, please call us directly at ${tenant.phone}.`,
      );
    }

    private calculateStatementPeriod(period: string): { startDate: Date; endDate: Date } {
      const now = new Date();
      let startDate: Date;
      let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of current month

      switch (period) {
        case 'current':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'prev':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0);
          break;
        case '3mo':
          startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          break;
        case 'ytd':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'tax':
          // SA tax year: March to February
          const taxYearStart = now.getMonth() >= 2
            ? new Date(now.getFullYear(), 2, 1)
            : new Date(now.getFullYear() - 1, 2, 1);
          startDate = taxYearStart;
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      return { startDate, endDate };
    }

    private periodToLabel(period: string): string {
      const labels: Record<string, string> = {
        current: 'current month',
        prev: 'previous month',
        '3mo': 'last 3 months',
        ytd: 'year to date',
        tax: 'tax year',
      };
      return labels[period] || period;
    }
  }
  ```

  ### 4. Webhook Updates for List Responses
  ```typescript
  // In whatsapp-webhook.controller.ts

  if (body.ListId) {
    const { type, value } = parseListResponse(body.ListId);
    const parent = await this.findParentByPhone(from);

    switch (type) {
      case 'statement':
        await this.sessionHandler.handleStatementSelection(
          from, value, tenant.id, parent.id,
        );
        break;
      case 'invoice':
        await this.handleInvoiceSelection(from, value, tenant);
        break;
      case 'help':
        await this.sessionHandler.handleHelpSelection(
          from, value, tenant.id, parent.id,
        );
        break;
    }
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Statement period selector (list picker)
    - Invoice list display
    - Help menu with 5 options
    - Balance inquiry with quick actions
    - List picker response handling
    - Payment methods info
    - Human callback request
  </in_scope>
  <out_of_scope>
    - AI conversational responses
    - Automated statement generation (use existing service)
    - Admin notification system
    - Callback scheduling UI
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create session types
# Create apps/api/src/integrations/whatsapp/types/session.types.ts

# 2. Create session interactive handler
# Create apps/api/src/integrations/whatsapp/handlers/session-interactive.handler.ts

# 3. Update webhook controller
# Edit apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts

# 4. Update module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 5. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] Session types defined
  - [ ] Statement period selector with 5 options
  - [ ] Invoice list generator (max 10 items)
  - [ ] Help menu with 5 options
  - [ ] Balance inquiry with quick reply buttons
  - [ ] Payment methods information
  - [ ] Human callback request
  - [ ] List picker response handlers
  - [ ] All messages use tenant.tradingName
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
