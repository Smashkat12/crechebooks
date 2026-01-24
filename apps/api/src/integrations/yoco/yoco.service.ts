/**
 * Yoco Payment Gateway Service
 * TASK-ACCT-011: Online Payment Gateway Integration
 *
 * @module integrations/yoco
 * @description Integrates Yoco payment gateway for online card payments.
 * Handles payment link creation, checkout initiation, and webhook processing.
 *
 * CRITICAL: Never store full card numbers
 * CRITICAL: Always verify webhook signatures
 * CRITICAL: Never expose secret keys in responses
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import {
  PaymentLink,
  PaymentGatewayTransaction,
  PaymentLinkType,
  PaymentLinkStatus,
} from '@prisma/client';
import {
  YocoCheckoutRequest,
  YocoCheckoutResponse,
  YocoWebhookPayload,
  CreatePaymentLinkParams,
  PaymentLinkResponse,
  CheckoutInitiationResponse,
} from './yoco.types';
import * as crypto from 'crypto';

@Injectable()
export class YocoService {
  private readonly logger = new Logger(YocoService.name);
  private readonly apiUrl: string;
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly webhookSecret: string;
  private readonly appUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditLogService,
  ) {
    this.apiUrl = this.configService.get('YOCO_API_URL', 'https://payments.yoco.com/api');
    this.secretKey = this.configService.get('YOCO_SECRET_KEY', '');
    this.publicKey = this.configService.get('YOCO_PUBLIC_KEY', '');
    this.webhookSecret = this.configService.get('YOCO_WEBHOOK_SECRET', '');
    this.appUrl = this.configService.get('APP_URL', 'https://app.crechebooks.co.za');
  }

  /**
   * Generate a unique short code for payment links
   */
  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = 'pay_';
    for (let i = 0; i < 12; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /**
   * Create a payment link for a parent
   */
  async createPaymentLink(
    tenantId: string,
    userId: string,
    params: CreatePaymentLinkParams,
  ): Promise<PaymentLinkResponse> {
    const { parentId, amountCents, type, invoiceId, description, expiryDays = 7 } = params;

    // Verify parent exists
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    // Verify invoice if specified
    if (invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId, parentId },
      });

      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
    }

    const shortCode = this.generateShortCode();
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const paymentLink = await this.prisma.paymentLink.create({
      data: {
        tenantId,
        parentId,
        invoiceId,
        type: type as PaymentLinkType,
        amountCents,
        shortCode,
        description: description || `Payment for ${type.toLowerCase()}`,
        expiresAt,
        status: 'ACTIVE',
      },
      include: {
        parent: true,
        invoice: true,
      },
    });

    await this.auditService.logCreate({
      tenantId,
      userId,
      entityType: 'PaymentLink',
      entityId: paymentLink.id,
      afterValue: {
        shortCode,
        amountCents,
        type,
        parentId,
        invoiceId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      id: paymentLink.id,
      shortCode: paymentLink.shortCode,
      amountCents: paymentLink.amountCents,
      description: paymentLink.description,
      status: paymentLink.status,
      expiresAt: paymentLink.expiresAt,
      paymentUrl: `${this.appUrl}/pay/${paymentLink.shortCode}`,
    };
  }

  /**
   * Get payment link by short code
   */
  async getPaymentLinkByShortCode(shortCode: string): Promise<PaymentLink & {
    parent: { firstName: string; lastName: string; email: string };
    invoice: { invoiceNumber: string } | null;
  } | null> {
    return this.prisma.paymentLink.findUnique({
      where: { shortCode },
      include: {
        parent: {
          select: { firstName: true, lastName: true, email: true },
        },
        invoice: {
          select: { invoiceNumber: true },
        },
        tenant: {
          select: { name: true, email: true },
        },
      },
    }) as any;
  }

  /**
   * Initiate Yoco checkout for a payment link
   */
  async initiateCheckout(
    paymentLinkId: string,
  ): Promise<CheckoutInitiationResponse> {
    const paymentLink = await this.prisma.paymentLink.findUnique({
      where: { id: paymentLinkId },
      include: { tenant: true, parent: true },
    });

    if (!paymentLink) {
      throw new NotFoundException('Payment link not found');
    }

    if (paymentLink.status !== 'ACTIVE') {
      throw new BadRequestException(`Payment link is ${paymentLink.status.toLowerCase()}`);
    }

    if (paymentLink.expiresAt && paymentLink.expiresAt < new Date()) {
      await this.prisma.paymentLink.update({
        where: { id: paymentLinkId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Payment link has expired');
    }

    const checkoutRequest: YocoCheckoutRequest = {
      amount: paymentLink.amountCents,
      currency: 'ZAR',
      successUrl: `${this.appUrl}/payment/success?linkId=${paymentLink.shortCode}`,
      cancelUrl: `${this.appUrl}/payment/cancelled?linkId=${paymentLink.shortCode}`,
      failureUrl: `${this.appUrl}/payment/failed?linkId=${paymentLink.shortCode}`,
      metadata: {
        paymentLinkId: paymentLink.id,
        tenantId: paymentLink.tenantId,
        parentId: paymentLink.parentId,
        invoiceId: paymentLink.invoiceId || '',
        shortCode: paymentLink.shortCode,
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
        parentId: paymentLink.parentId,
        invoiceId: paymentLink.invoiceId,
        gateway: 'YOCO',
        gatewayId: response.id,
        gatewayCheckoutId: response.id,
        status: 'PENDING',
        amountCents: paymentLink.amountCents,
      },
    });

    return {
      checkoutUrl: response.redirectUrl,
      gatewayId: response.id,
    };
  }

  /**
   * Handle Yoco webhook
   */
  async handleWebhook(payload: YocoWebhookPayload, signature: string): Promise<void> {
    // Verify webhook signature
    if (!this.verifyWebhookSignature(payload, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const { type, payload: data } = payload;

    // Find the gateway transaction
    const gatewayTxn = await this.prisma.paymentGatewayTransaction.findFirst({
      where: { gatewayId: data.id },
      include: {
        paymentLink: {
          include: { parent: true, invoice: true },
        },
      },
    });

    if (!gatewayTxn) {
      this.logger.warn(`Gateway transaction not found for ${data.id}`);
      return;
    }

    // Prevent duplicate processing
    if (gatewayTxn.status !== 'PENDING') {
      this.logger.log(`Transaction ${data.id} already processed with status ${gatewayTxn.status}`);
      return;
    }

    if (type === 'payment.succeeded') {
      await this.handlePaymentSuccess(gatewayTxn, data);
    } else if (type === 'payment.failed') {
      await this.handlePaymentFailure(gatewayTxn, data);
    }
  }

  /**
   * Handle successful payment
   *
   * NOTE: The Payment model requires an invoiceId. If the payment link is not
   * linked to an invoice, we only update the gateway transaction status
   * (no Payment record is created since it requires an invoice).
   */
  private async handlePaymentSuccess(
    gatewayTxn: PaymentGatewayTransaction & { paymentLink: PaymentLink | null },
    data: YocoWebhookPayload['payload'],
  ): Promise<void> {
    if (!gatewayTxn.paymentLink) {
      this.logger.error(`Payment link not found for transaction ${gatewayTxn.id}`);
      return;
    }

    const { paymentLink } = gatewayTxn;

    let paymentId: string | null = null;

    // Only create Payment record if linked to an invoice (invoiceId is required)
    if (paymentLink.invoiceId) {
      const payment = await this.prisma.payment.create({
        data: {
          tenantId: paymentLink.tenantId,
          invoiceId: paymentLink.invoiceId,
          amountCents: data.amount,
          paymentDate: new Date(),
          reference: `YOCO-${gatewayTxn.gatewayId}`,
          matchType: 'EXACT',
          matchedBy: 'AI_AUTO',
        },
      });
      paymentId = payment.id;

      // Update invoice payment amount
      await this.allocatePaymentToInvoice(
        paymentLink.tenantId,
        payment.id,
        paymentLink.invoiceId,
        data.amount,
      );

      // Audit log for payment
      await this.auditService.logCreate({
        tenantId: paymentLink.tenantId,
        entityType: 'Payment',
        entityId: payment.id,
        afterValue: {
          amountCents: data.amount,
          source: 'YOCO',
          cardBrand: data.paymentMethodDetails?.card?.brand,
          invoiceId: paymentLink.invoiceId,
        },
      });

      this.logger.log(
        `Payment ${payment.id} created from Yoco ${gatewayTxn.gatewayId} for R${(data.amount / 100).toFixed(2)}`,
      );
    } else {
      // No invoice linked - just log the successful transaction
      this.logger.log(
        `Yoco payment ${gatewayTxn.gatewayId} succeeded for R${(data.amount / 100).toFixed(2)} (no invoice linked)`,
      );
    }

    // Update gateway transaction
    await this.prisma.paymentGatewayTransaction.update({
      where: { id: gatewayTxn.id },
      data: {
        status: 'SUCCESSFUL',
        cardBrand: data.paymentMethodDetails?.card?.brand,
        cardLastFour: data.paymentMethodDetails?.card?.last4,
        cardExpiryMonth: data.paymentMethodDetails?.card?.expiryMonth,
        cardExpiryYear: data.paymentMethodDetails?.card?.expiryYear,
        paymentId,
        metadata: data as any,
      },
    });

    // Update payment link
    await this.prisma.paymentLink.update({
      where: { id: paymentLink.id },
      data: {
        status: 'USED',
      },
    });
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailure(
    gatewayTxn: PaymentGatewayTransaction,
    data: YocoWebhookPayload['payload'],
  ): Promise<void> {
    await this.prisma.paymentGatewayTransaction.update({
      where: { id: gatewayTxn.id },
      data: {
        status: 'FAILED',
        metadata: data as any,
        errorMessage: data.status,
      },
    });

    this.logger.warn(`Payment failed for gateway ${gatewayTxn.gatewayId}: ${data.status}`);
  }

  /**
   * Allocate payment to invoice
   * Updates the invoice's amountPaidCents and status
   */
  private async allocatePaymentToInvoice(
    _tenantId: string,
    _paymentId: string,
    invoiceId: string,
    amountCents: number,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) return;

    // Calculate balance due as totalCents - amountPaidCents
    const balanceDue = invoice.totalCents - invoice.amountPaidCents;
    const allocationAmount = Math.min(amountCents, balanceDue);

    if (allocationAmount <= 0) return;

    // Update invoice payment and status
    const newAmountPaid = invoice.amountPaidCents + allocationAmount;
    const newBalance = invoice.totalCents - newAmountPaid;
    const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaidCents: newAmountPaid,
        status: newStatus,
      },
    });
  }

  /**
   * Call Yoco API
   */
  private async callYocoApi<T>(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secretKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Yoco API error: ${response.status} ${error}`);
      throw new BadRequestException(`Payment gateway error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(payload: unknown, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('Webhook secret not configured');
      return true; // Allow in development without secret
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature || ''),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }

  /**
   * Get payment links for a parent
   */
  async getPaymentLinksForParent(
    tenantId: string,
    parentId: string,
    options?: {
      status?: PaymentLinkStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ links: PaymentLink[]; total: number }> {
    const where = {
      tenantId,
      parentId,
      ...(options?.status && { status: options.status }),
    };

    const [links, total] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where,
        include: { invoice: true },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      this.prisma.paymentLink.count({ where }),
    ]);

    return { links, total };
  }

  /**
   * Cancel a payment link
   */
  async cancelPaymentLink(
    tenantId: string,
    userId: string,
    paymentLinkId: string,
  ): Promise<PaymentLink> {
    const link = await this.prisma.paymentLink.findFirst({
      where: { id: paymentLinkId, tenantId },
    });

    if (!link) {
      throw new NotFoundException('Payment link not found');
    }

    if (link.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot cancel payment link with status ${link.status}`);
    }

    const updated = await this.prisma.paymentLink.update({
      where: { id: paymentLinkId },
      data: { status: 'CANCELLED' },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'PaymentLink',
      entityId: paymentLinkId,
      beforeValue: { status: 'ACTIVE' },
      afterValue: { status: 'CANCELLED' },
    });

    return updated;
  }

  /**
   * Get gateway transactions for a tenant
   */
  async getGatewayTransactions(
    tenantId: string,
    options?: {
      status?: string;
      parentId?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ transactions: PaymentGatewayTransaction[]; total: number }> {
    const where = {
      tenantId,
      ...(options?.status && { status: options.status as any }),
      ...(options?.parentId && { parentId: options.parentId }),
      ...(options?.fromDate && { createdAt: { gte: options.fromDate } }),
      ...(options?.toDate && { createdAt: { lte: options.toDate } }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.paymentGatewayTransaction.findMany({
        where,
        include: { paymentLink: true },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
      }),
      this.prisma.paymentGatewayTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  /**
   * Expire old payment links (run by scheduler)
   */
  async expireOldPaymentLinks(tenantId?: string): Promise<number> {
    const where = {
      status: 'ACTIVE' as PaymentLinkStatus,
      expiresAt: { lt: new Date() },
      ...(tenantId && { tenantId }),
    };

    const result = await this.prisma.paymentLink.updateMany({
      where,
      data: { status: 'EXPIRED' },
    });

    return result.count;
  }
}
