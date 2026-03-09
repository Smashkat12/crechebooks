<task_spec id="TASK-WA-020" version="2.0">

<metadata>
  <title>WhatsApp Payment Deep-Linking with Yoco</title>
  <status>pending</status>
  <phase>30</phase>
  <layer>logic</layer>
  <sequence>722</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WA-OPS-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-WA-009</task_ref>
    <task_ref status="complete">TASK-PAY-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - "Pay Now" button on invoice templates opens a hardcoded URL
  - Payment link is static: `https://app.elleelephant.co.za/pay/{invoiceId}` (TODO in button handler)
  - No dynamic Yoco checkout link generation from WhatsApp context
  - No payment confirmation back to WhatsApp after Yoco webhook
  - No deep-link that pre-fills amount and reference

  **Existing Resources:**
  - YocoPaymentService — existing Yoco checkout integration
  - ButtonResponseHandler.handlePayNow() (TASK-WA-009) — sends payment link
  - Payment Matching Service (TASK-PAY-011) — allocates payments to invoices
  - cb_payment_confirmation_v4 template — sends after payment
  - Yoco webhook handler — processes payment callbacks

  **Gap:**
  - No Yoco checkout link generator for WhatsApp context
  - No WhatsApp-specific payment flow (generate link → send → confirm)
  - No tracking of WhatsApp-initiated payments
  - No auto-send payment confirmation template after Yoco webhook

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/services/whatsapp-payment.service.ts`
  - `apps/api/src/integrations/whatsapp/services/whatsapp-payment.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/handlers/button-response.handler.ts` — use dynamic payment link
  - `apps/api/src/payments/yoco/yoco-webhook.handler.ts` — trigger WhatsApp confirmation
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register service
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. WhatsApp Payment Service
  ```typescript
  // apps/api/src/integrations/whatsapp/services/whatsapp-payment.service.ts

  @Injectable()
  export class WhatsAppPaymentService {
    private readonly logger = new Logger(WhatsAppPaymentService.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly yocoService: YocoPaymentService,
      private readonly whatsappService: TwilioWhatsAppService,
    ) {}

    /**
     * Generate a Yoco checkout link for a specific invoice
     * Called when parent taps "Pay Now" on a WhatsApp invoice
     */
    async generatePaymentLink(
      invoiceId: string,
      tenantId: string,
    ): Promise<{ checkoutUrl: string; checkoutId: string }> {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { parent: true, tenant: true },
      });

      if (!invoice) throw new NotFoundException('Invoice not found');

      const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
      if (outstandingCents <= 0) throw new BadRequestException('Invoice already paid');

      // Create Yoco checkout
      const checkout = await this.yocoService.createCheckout({
        amountInCents: outstandingCents,
        currency: 'ZAR',
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          tenantId,
          parentId: invoice.parentId,
          channel: 'whatsapp',  // Track WhatsApp-initiated payments
        },
        successUrl: `${this.configService.get('APP_URL')}/pay/success?ref=${invoice.invoiceNumber}`,
        cancelUrl: `${this.configService.get('APP_URL')}/pay/cancel?ref=${invoice.invoiceNumber}`,
      });

      return {
        checkoutUrl: checkout.redirectUrl,
        checkoutId: checkout.id,
      };
    }

    /**
     * Send payment confirmation via WhatsApp after Yoco webhook
     */
    async sendPaymentConfirmation(
      invoiceId: string,
      amountCents: number,
      paymentDate: Date,
    ): Promise<void> {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId },
        include: { parent: true, tenant: true },
      });

      if (!invoice?.parent?.phone || !invoice.parent.whatsappOptIn) return;

      await this.whatsappService.sendRichPaymentConfirmation({
        to: invoice.parent.phone,
        tenantId: invoice.tenantId,
        parentFirstName: invoice.parent.firstName,
        amountFormatted: (amountCents / 100).toLocaleString('en-ZA', {
          minimumFractionDigits: 2,
        }),
        paymentDate: paymentDate.toLocaleDateString('en-ZA', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        invoiceNumber: invoice.invoiceNumber,
        tenantName: invoice.tenant.tradingName,
      });
    }
  }
  ```

  ### 2. Button Handler Update
  ```typescript
  // In button-response.handler.ts handlePayNow():

  // BEFORE (hardcoded):
  // const paymentUrl = `https://app.elleelephant.co.za/pay/${invoiceId}`;

  // AFTER (dynamic Yoco link):
  const { checkoutUrl } = await this.paymentService.generatePaymentLink(
    invoiceId,
    tenantId,
  );

  await this.contentService.sendSessionMessage(
    to,
    `Here's your secure payment link for invoice ${invoiceNumber}:\n\n${checkoutUrl}\n\n` +
    `Amount: R${amountFormatted}\n\n` +
    `This link is valid for 30 minutes. You'll receive a confirmation once payment is processed.`,
  );
  ```

  ### 3. Yoco Webhook Integration
  ```typescript
  // In yoco-webhook.handler.ts — after successful payment processing:

  // Check if this was a WhatsApp-initiated payment
  if (checkout.metadata?.channel === 'whatsapp') {
    await this.whatsappPaymentService.sendPaymentConfirmation(
      checkout.metadata.invoiceId,
      checkout.amountInCents,
      new Date(),
    );
  }
  ```

  ### 4. Payment Tracking
  Track WhatsApp-initiated payments separately for reporting:
  - Add `channel` field to payment metadata
  - Filter by `channel: 'whatsapp'` in reports
  - Show WhatsApp payment volume in admin dashboard
</critical_patterns>

<scope>
  <in_scope>
    - WhatsAppPaymentService with Yoco checkout link generation
    - Dynamic payment link in "Pay Now" button handler
    - Auto-send payment confirmation after Yoco webhook
    - WhatsApp channel tracking in payment metadata
    - Outstanding amount calculation for partial payments
    - Unit tests for payment link generation
    - Unit tests for confirmation sending
  </in_scope>
  <out_of_scope>
    - Yoco inline payment (requires web view, not WhatsApp native)
    - Payment plan creation via WhatsApp (separate feature)
    - Refund processing via WhatsApp
    - Multiple payment methods (Yoco only for now)
    - Payment reminder automation (already in TASK-PAY-014)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create payment service
# Create apps/api/src/integrations/whatsapp/services/whatsapp-payment.service.ts

# 2. Update button handler
# Edit apps/api/src/integrations/whatsapp/handlers/button-response.handler.ts

# 3. Update Yoco webhook
# Edit apps/api/src/payments/yoco/yoco-webhook.handler.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] WhatsAppPaymentService with generatePaymentLink()
  - [ ] Dynamic Yoco checkout URL replaces hardcoded link
  - [ ] Outstanding amount calculated correctly (partial payments)
  - [ ] Payment metadata includes channel: 'whatsapp'
  - [ ] Auto-send cb_payment_confirmation_v4 after Yoco webhook
  - [ ] WhatsApp opt-in check before sending confirmation
  - [ ] Button handler uses dynamic link
  - [ ] Yoco webhook triggers WhatsApp confirmation
  - [ ] Unit tests for link generation
  - [ ] Unit tests for confirmation flow
  - [ ] TODO removed from button-response.handler.ts
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
