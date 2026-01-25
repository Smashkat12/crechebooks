<task_spec id="TASK-ACCT-011" version="2.0">

<metadata>
  <title>Online Payment Gateway Integration (Yoco)</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>logic</layer>
  <sequence>411</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-ACCT-PAY-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-PAY-001</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has no built-in online payment capability. Parents can only pay via EFT.
  Stub has built-in payment processing (3-4.5% + R2 for SA cards).
  This significantly impacts payment collection speed and arrears reduction.

  **Existing Resources:**
  - Payment model - Records payments
  - Invoice model - Tracks amounts owed
  - PaymentAllocationService - Allocates payments to invoices

  **Gap:**
  - No payment gateway integration
  - No payment link generation
  - No webhook handling for payment confirmation
  - No card payment option for parents

  **Files to Create:**
  - apps/api/src/integrations/yoco/yoco.service.ts
  - apps/api/src/integrations/yoco/yoco.types.ts
  - apps/api/src/integrations/yoco/yoco.controller.ts
  - apps/api/src/integrations/yoco/yoco.module.ts
  - packages/database/prisma/migrations/xxx_add_payment_links/migration.sql

  **Files to Modify:**
  - packages/database/prisma/schema.prisma (ADD PaymentLink, PaymentGatewayTransaction)
  - apps/api/src/app.module.ts (import YocoModule)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Prisma Models
  ```prisma
  // packages/database/prisma/schema.prisma

  enum PaymentLinkType {
    INVOICE          // Pay specific invoice
    OUTSTANDING      // Pay total outstanding balance
    CUSTOM           // Custom amount
    REGISTRATION     // Registration fee
    DEPOSIT          // Security deposit
  }

  enum PaymentLinkStatus {
    ACTIVE
    PAID
    EXPIRED
    CANCELLED
  }

  enum PaymentGatewayProvider {
    YOCO
    PAYFAST
    OZOW
  }

  model PaymentLink {
    id              String              @id @default(cuid())
    tenantId        String
    parentId        String
    invoiceId       String?             // For INVOICE type
    type            PaymentLinkType
    amountCents     Int
    description     String

    // Link details
    shortCode       String              @unique // e.g., "pay_abc123"
    expiresAt       DateTime?

    // Status
    status          PaymentLinkStatus   @default(ACTIVE)
    paidAt          DateTime?
    paymentId       String?             // Links to Payment record when paid

    // Metadata
    createdAt       DateTime            @default(now())
    createdById     String

    tenant          Tenant              @relation(fields: [tenantId], references: [id])
    parent          Parent              @relation(fields: [parentId], references: [id])
    invoice         Invoice?            @relation(fields: [invoiceId], references: [id])
    payment         Payment?            @relation(fields: [paymentId], references: [id])
    createdBy       User                @relation(fields: [createdById], references: [id])
    gatewayTxns     PaymentGatewayTransaction[]

    @@index([tenantId, status])
    @@index([shortCode])
    @@index([parentId])
  }

  model PaymentGatewayTransaction {
    id                  String                  @id @default(cuid())
    tenantId            String
    paymentLinkId       String
    provider            PaymentGatewayProvider

    // Gateway reference
    gatewayId           String                  // Yoco checkout ID
    gatewayStatus       String                  // Yoco status

    // Amount details
    amountCents         Int
    feeCents            Int?                    // Gateway fee
    netAmountCents      Int?                    // Amount after fee

    // Card details (masked)
    cardBrand           String?                 // VISA, MASTERCARD
    cardLastFour        String?                 // "4242"

    // Timestamps
    initiatedAt         DateTime                @default(now())
    completedAt         DateTime?

    // Raw response
    rawResponse         Json?

    tenant              Tenant                  @relation(fields: [tenantId], references: [id])
    paymentLink         PaymentLink             @relation(fields: [paymentLinkId], references: [id])

    @@index([gatewayId])
    @@index([tenantId, paymentLinkId])
  }
  ```

  ### 3. Yoco Service Implementation
  ```typescript
  // apps/api/src/integrations/yoco/yoco.service.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { PrismaService } from '../../database/prisma.service';
  import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
  import { AuditLogService } from '../../database/services/audit-log.service';

  interface YocoCheckoutRequest {
    amount: number; // In cents
    currency: string;
    successUrl: string;
    cancelUrl: string;
    failureUrl: string;
    metadata?: Record<string, string>;
  }

  interface YocoCheckoutResponse {
    id: string;
    redirectUrl: string;
    status: string;
  }

  interface YocoWebhookPayload {
    id: string;
    type: 'payment.succeeded' | 'payment.failed';
    payload: {
      id: string;
      status: string;
      amount: number;
      currency: string;
      metadata?: Record<string, string>;
      paymentMethodDetails?: {
        card?: {
          brand: string;
          last4: string;
        };
      };
    };
  }

  @Injectable()
  export class YocoService {
    private readonly logger = new Logger(YocoService.name);
    private readonly apiUrl: string;
    private readonly secretKey: string;
    private readonly publicKey: string;

    constructor(
      private readonly configService: ConfigService,
      private readonly prisma: PrismaService,
      private readonly paymentAllocationService: PaymentAllocationService,
      private readonly auditService: AuditLogService,
    ) {
      this.apiUrl = this.configService.get('YOCO_API_URL', 'https://payments.yoco.com/api');
      this.secretKey = this.configService.get('YOCO_SECRET_KEY', '');
      this.publicKey = this.configService.get('YOCO_PUBLIC_KEY', '');
    }

    async createPaymentLink(
      tenantId: string,
      parentId: string,
      amountCents: number,
      type: PaymentLinkType,
      userId: string,
      invoiceId?: string,
      description?: string,
    ): Promise<PaymentLink> {
      const shortCode = this.generateShortCode();

      const paymentLink = await this.prisma.paymentLink.create({
        data: {
          tenantId,
          parentId,
          invoiceId,
          type,
          amountCents,
          description: description || `Payment for ${type}`,
          shortCode,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          createdById: userId,
        },
        include: {
          parent: true,
          invoice: true,
        },
      });

      await this.auditService.log({
        tenantId,
        userId,
        action: 'PAYMENT_LINK_CREATED',
        resourceType: 'PaymentLink',
        resourceId: paymentLink.id,
        metadata: { amountCents, type },
      });

      return paymentLink;
    }

    async initiateCheckout(paymentLinkId: string): Promise<{ checkoutUrl: string }> {
      const paymentLink = await this.prisma.paymentLink.findUnique({
        where: { id: paymentLinkId },
        include: { tenant: true, parent: true },
      });

      if (!paymentLink) {
        throw new NotFoundException('Payment link not found');
      }

      if (paymentLink.status !== 'ACTIVE') {
        throw new BadRequestException(`Payment link is ${paymentLink.status}`);
      }

      if (paymentLink.expiresAt && paymentLink.expiresAt < new Date()) {
        await this.prisma.paymentLink.update({
          where: { id: paymentLinkId },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException('Payment link has expired');
      }

      const baseUrl = this.configService.get('APP_URL');

      const checkoutRequest: YocoCheckoutRequest = {
        amount: paymentLink.amountCents,
        currency: 'ZAR',
        successUrl: `${baseUrl}/payment/success?linkId=${paymentLink.shortCode}`,
        cancelUrl: `${baseUrl}/payment/cancelled?linkId=${paymentLink.shortCode}`,
        failureUrl: `${baseUrl}/payment/failed?linkId=${paymentLink.shortCode}`,
        metadata: {
          paymentLinkId: paymentLink.id,
          tenantId: paymentLink.tenantId,
          parentId: paymentLink.parentId,
          invoiceId: paymentLink.invoiceId || '',
        },
      };

      const response = await this.callYocoApi<YocoCheckoutResponse>(
        'POST',
        '/checkouts',
        checkoutRequest,
      );

      // Record the gateway transaction
      await this.prisma.paymentGatewayTransaction.create({
        data: {
          tenantId: paymentLink.tenantId,
          paymentLinkId: paymentLink.id,
          provider: 'YOCO',
          gatewayId: response.id,
          gatewayStatus: response.status,
          amountCents: paymentLink.amountCents,
        },
      });

      return { checkoutUrl: response.redirectUrl };
    }

    async handleWebhook(payload: YocoWebhookPayload, signature: string): Promise<void> {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }

      const { id, type, payload: data } = payload;

      // Find the gateway transaction
      const gatewayTxn = await this.prisma.paymentGatewayTransaction.findFirst({
        where: { gatewayId: data.id },
        include: { paymentLink: { include: { parent: true, invoice: true } } },
      });

      if (!gatewayTxn) {
        this.logger.warn(`Gateway transaction not found for ${data.id}`);
        return;
      }

      if (type === 'payment.succeeded') {
        await this.handlePaymentSuccess(gatewayTxn, data);
      } else if (type === 'payment.failed') {
        await this.handlePaymentFailure(gatewayTxn, data);
      }
    }

    private async handlePaymentSuccess(
      gatewayTxn: PaymentGatewayTransaction & { paymentLink: PaymentLink },
      data: YocoWebhookPayload['payload'],
    ): Promise<void> {
      const { paymentLink } = gatewayTxn;

      // Create Payment record
      const payment = await this.prisma.payment.create({
        data: {
          tenantId: paymentLink.tenantId,
          parentId: paymentLink.parentId,
          amountCents: data.amount,
          paymentDate: new Date(),
          paymentMethod: 'CARD',
          reference: gatewayTxn.gatewayId,
          source: 'YOCO',
        },
      });

      // Update gateway transaction
      await this.prisma.paymentGatewayTransaction.update({
        where: { id: gatewayTxn.id },
        data: {
          gatewayStatus: data.status,
          completedAt: new Date(),
          cardBrand: data.paymentMethodDetails?.card?.brand,
          cardLastFour: data.paymentMethodDetails?.card?.last4,
          rawResponse: data as any,
        },
      });

      // Update payment link
      await this.prisma.paymentLink.update({
        where: { id: paymentLink.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentId: payment.id,
        },
      });

      // Auto-allocate if linked to invoice
      if (paymentLink.invoiceId) {
        await this.paymentAllocationService.allocatePayment(
          paymentLink.tenantId,
          payment.id,
          paymentLink.invoiceId,
        );
      }

      // Audit log
      await this.auditService.log({
        tenantId: paymentLink.tenantId,
        action: 'ONLINE_PAYMENT_RECEIVED',
        resourceType: 'Payment',
        resourceId: payment.id,
        metadata: {
          amount: data.amount,
          cardBrand: data.paymentMethodDetails?.card?.brand,
          gatewayId: gatewayTxn.gatewayId,
        },
      });

      this.logger.log(`Payment ${payment.id} created from Yoco ${gatewayTxn.gatewayId}`);
    }

    private async handlePaymentFailure(
      gatewayTxn: PaymentGatewayTransaction,
      data: YocoWebhookPayload['payload'],
    ): Promise<void> {
      await this.prisma.paymentGatewayTransaction.update({
        where: { id: gatewayTxn.id },
        data: {
          gatewayStatus: data.status,
          completedAt: new Date(),
          rawResponse: data as any,
        },
      });

      this.logger.warn(`Payment failed for gateway ${gatewayTxn.gatewayId}: ${data.status}`);
    }

    private async callYocoApi<T>(method: string, endpoint: string, body?: any): Promise<T> {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secretKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yoco API error: ${response.status} ${error}`);
      }

      return response.json();
    }

    private verifyWebhookSignature(payload: any, signature: string): boolean {
      const crypto = require('crypto');
      const webhookSecret = this.configService.get('YOCO_WEBHOOK_SECRET');

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    }

    private generateShortCode(): string {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let code = 'pay_';
      for (let i = 0; i < 12; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    }

    async getPaymentLinkByShortCode(shortCode: string): Promise<PaymentLink | null> {
      return this.prisma.paymentLink.findUnique({
        where: { shortCode },
        include: { parent: true, invoice: true, tenant: true },
      });
    }
  }
  ```

  ### 4. Webhook Controller
  ```typescript
  // apps/api/src/integrations/yoco/yoco.controller.ts
  @Controller('webhooks/yoco')
  export class YocoWebhookController {
    constructor(private readonly yocoService: YocoService) {}

    @Post()
    @HttpCode(200)
    async handleWebhook(
      @Body() payload: YocoWebhookPayload,
      @Headers('x-yoco-signature') signature: string,
    ): Promise<{ received: boolean }> {
      await this.yocoService.handleWebhook(payload, signature);
      return { received: true };
    }
  }
  ```
</critical_patterns>

<context>
This task integrates Yoco payment gateway to enable online card payments from parents.
Yoco is the leading SA payment provider with competitive rates.

**Business Impact:**
- Reduce payment friction (no more EFT only)
- Faster payment collection
- Reduced arrears (easier to pay = more payments)
- Modern parent experience

**Payment Flow:**
1. Staff creates payment link (for invoice or custom amount)
2. Link sent to parent via email/WhatsApp
3. Parent clicks link → Yoco checkout page
4. Payment processed → Webhook received
5. Payment recorded and allocated automatically

**Fee Structure (typical Yoco rates):**
- SA Cards: ~2.6-2.95% + R0.80 per transaction
- International: ~3.5% + R0.80 per transaction
</context>

<scope>
  <in_scope>
    - PaymentLink and PaymentGatewayTransaction models
    - Database migrations
    - YocoService with checkout and webhook handling
    - Payment link generation
    - Webhook signature verification
    - Auto-allocation to invoices
    - Audit logging
  </in_scope>
  <out_of_scope>
    - Frontend payment UI (TASK-ACCT-051)
    - Payment link sharing via email/WhatsApp (use existing services)
    - Refund processing (future enhancement)
    - Recurring payments/subscriptions
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate migration
cd packages/database && pnpm prisma migrate dev --name add_payment_links

# 2. Build must pass
cd apps/api && pnpm run build

# 3. Run unit tests
pnpm test -- --testPathPattern="yoco" --runInBand

# 4. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] PaymentLink model added to Prisma schema
  - [ ] PaymentGatewayTransaction model added
  - [ ] Migration created and applied
  - [ ] YocoService with createPaymentLink, initiateCheckout
  - [ ] Webhook handler with signature verification
  - [ ] Auto-allocation on payment success
  - [ ] Audit logging for payment events
  - [ ] Unit tests for service methods (90%+ coverage)
  - [ ] Integration tests with mocked Yoco API
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** store full card numbers (use tokenization)
  - **NEVER** skip webhook signature verification
  - **NEVER** expose secret keys in responses
  - **NEVER** process duplicate webhook events
  - **NEVER** create payments without audit trail
</anti_patterns>

</task_spec>
