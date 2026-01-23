/**
 * XeroPaymentService
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * Service for synchronizing payments between CrecheBooks and Xero.
 * Handles bi-directional payment sync (push to Xero, pull from Xero).
 *
 * CRITICAL: All monetary values are in cents (integers).
 * Conversion: cents / 100 = Rands
 * CRITICAL: All operations must filter by tenantId.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

import { PrismaService } from '../../database/prisma/prisma.service';
import { XeroRateLimiter } from './xero-rate-limiter.service';
import {
  PaymentSyncResponseDto,
  BulkPaymentSyncResponseDto,
  XeroPaymentApiResponse,
  centsToRands,
  randsToCents,
  PaymentSyncDirection,
} from './dto/xero-payment.dto';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

/**
 * Xero API Payment payload structure
 */
interface XeroPaymentPayload {
  Invoice: {
    InvoiceID: string;
  };
  Account: {
    AccountID: string;
  };
  Amount: number;
  Date: string;
  Reference?: string;
}

/**
 * Xero API Payments response structure
 */
interface XeroPaymentsResponse {
  Payments?: XeroPaymentApiResponse[];
}

@Injectable()
export class XeroPaymentService {
  private readonly logger = new Logger(XeroPaymentService.name);
  private readonly xeroApiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly rateLimiter: XeroRateLimiter,
  ) {
    this.xeroApiUrl =
      this.configService.get<string>('XERO_API_URL') ||
      'https://api.xero.com/api.xro/2.0';
  }

  /**
   * Sync a CrecheBooks payment to Xero.
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param paymentId - The CrecheBooks payment ID
   * @param xeroInvoiceId - The Xero invoice ID to apply payment to
   * @param xeroBankAccountId - Optional Xero bank account ID
   * @returns Payment sync response
   */
  async syncPaymentToXero(
    tenantId: string,
    paymentId: string,
    xeroInvoiceId: string,
    xeroBankAccountId?: string,
  ): Promise<PaymentSyncResponseDto> {
    this.logger.log(
      `Syncing payment ${paymentId} to Xero invoice ${xeroInvoiceId}`,
    );

    // Check for existing mapping
    const existingMapping = await this.prisma.xeroPaymentMapping.findUnique({
      where: {
        tenantId_paymentId: { tenantId, paymentId },
      },
    });

    if (existingMapping) {
      this.logger.log(
        `Payment ${paymentId} already synced to Xero: ${existingMapping.xeroPaymentId}`,
      );
      return {
        paymentId,
        xeroPaymentId: existingMapping.xeroPaymentId,
        xeroInvoiceId: existingMapping.xeroInvoiceId,
        amountCents: existingMapping.amountCents,
        syncDirection: existingMapping.syncDirection as PaymentSyncDirection,
        syncedAt: existingMapping.lastSyncedAt,
      };
    }

    // Get payment details
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId, deletedAt: null },
      include: {
        invoice: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment', paymentId);
    }

    // Get Xero credentials
    const { accessToken, xeroTenantId } =
      await this.getXeroCredentials(tenantId);

    // Get default bank account if not provided
    const bankAccountId =
      xeroBankAccountId ??
      (await this.getDefaultBankAccountId(accessToken, xeroTenantId));

    if (!bankAccountId) {
      throw new BusinessException(
        'No bank account specified and no default bank account found',
        'XERO_NO_BANK_ACCOUNT',
      );
    }

    // Create payment in Xero
    const xeroPayment = await this.createXeroPayment(
      accessToken,
      xeroTenantId,
      {
        invoiceId: xeroInvoiceId,
        bankAccountId,
        amountCents: payment.amountCents,
        date: payment.paymentDate,
        reference: payment.reference ?? undefined,
      },
    );

    // Create mapping record
    const now = new Date();
    const mapping = await this.prisma.xeroPaymentMapping.create({
      data: {
        tenantId,
        paymentId,
        xeroPaymentId: xeroPayment.PaymentID,
        xeroInvoiceId,
        amountCents: payment.amountCents,
        syncDirection: 'push',
        lastSyncedAt: now,
      },
    });

    // Update payment with Xero payment ID
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { xeroPaymentId: xeroPayment.PaymentID },
    });

    this.logger.log(
      `Synced payment ${paymentId} to Xero: ${xeroPayment.PaymentID}`,
    );

    return {
      paymentId,
      xeroPaymentId: xeroPayment.PaymentID,
      xeroInvoiceId,
      amountCents: payment.amountCents,
      syncDirection: 'push',
      syncedAt: mapping.lastSyncedAt,
    };
  }

  /**
   * Pull payments from Xero for a specific invoice.
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param xeroInvoiceId - The Xero invoice ID to pull payments for
   * @returns Bulk payment sync response
   */
  async pullPaymentsFromXero(
    tenantId: string,
    xeroInvoiceId: string,
  ): Promise<BulkPaymentSyncResponseDto> {
    this.logger.log(`Pulling payments from Xero for invoice ${xeroInvoiceId}`);

    const result: BulkPaymentSyncResponseDto = {
      synced: 0,
      failed: 0,
      skipped: 0,
      results: [],
      errors: [],
    };

    // Get Xero credentials
    const { accessToken, xeroTenantId } =
      await this.getXeroCredentials(tenantId);

    // Get invoice mapping to find local invoice
    const invoiceMapping = await this.prisma.xeroInvoiceMapping.findUnique({
      where: {
        tenantId_xeroInvoiceId: { tenantId, xeroInvoiceId },
      },
      include: {
        invoice: true,
      },
    });

    if (!invoiceMapping) {
      throw new BusinessException(
        'No local invoice found for this Xero invoice',
        'XERO_INVOICE_NOT_MAPPED',
        { xeroInvoiceId },
      );
    }

    // Fetch payments from Xero
    const xeroPayments = await this.fetchXeroPaymentsForInvoice(
      accessToken,
      xeroTenantId,
      xeroInvoiceId,
    );

    this.logger.log(`Found ${xeroPayments.length} payments in Xero`);

    for (const xeroPayment of xeroPayments) {
      try {
        // Check if payment already exists
        const existingMapping = await this.prisma.xeroPaymentMapping.findUnique(
          {
            where: {
              tenantId_xeroPaymentId: {
                tenantId,
                xeroPaymentId: xeroPayment.PaymentID,
              },
            },
          },
        );

        if (existingMapping) {
          result.skipped++;
          continue;
        }

        // Create local payment record
        const amountCents = randsToCents(xeroPayment.Amount);
        const now = new Date();

        const payment = await this.prisma.payment.create({
          data: {
            tenantId,
            invoiceId: invoiceMapping.invoiceId,
            xeroPaymentId: xeroPayment.PaymentID,
            amountCents,
            paymentDate: new Date(xeroPayment.Date),
            reference: xeroPayment.Reference,
            matchType: 'EXACT',
            matchedBy: 'AI_AUTO',
          },
        });

        // Create mapping record
        await this.prisma.xeroPaymentMapping.create({
          data: {
            tenantId,
            paymentId: payment.id,
            xeroPaymentId: xeroPayment.PaymentID,
            xeroInvoiceId,
            amountCents,
            syncDirection: 'pull',
            lastSyncedAt: now,
          },
        });

        result.results.push({
          paymentId: payment.id,
          xeroPaymentId: xeroPayment.PaymentID,
          xeroInvoiceId,
          amountCents,
          syncDirection: 'pull',
          syncedAt: now,
        });
        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          paymentId: xeroPayment.PaymentID,
          error: error instanceof Error ? error.message : String(error),
          code: error instanceof BusinessException ? error.code : 'SYNC_ERROR',
        });
      }
    }

    this.logger.log(
      `Payment pull complete: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Get payment mapping for a payment.
   *
   * @param tenantId - The CrecheBooks tenant ID
   * @param paymentId - The CrecheBooks payment ID
   * @returns Payment mapping or null
   */
  async getPaymentMapping(
    tenantId: string,
    paymentId: string,
  ): Promise<{
    id: string;
    xeroPaymentId: string;
    xeroInvoiceId: string;
    amountCents: number;
    syncDirection: string;
    lastSyncedAt: Date;
  } | null> {
    const mapping = await this.prisma.xeroPaymentMapping.findUnique({
      where: {
        tenantId_paymentId: { tenantId, paymentId },
      },
    });

    return mapping;
  }

  /**
   * Create a payment in Xero.
   */
  private async createXeroPayment(
    accessToken: string,
    xeroTenantId: string,
    paymentData: {
      invoiceId: string;
      bankAccountId: string;
      amountCents: number;
      date: Date;
      reference?: string;
    },
  ): Promise<XeroPaymentApiResponse> {
    this.logger.log(
      `Creating Xero payment for invoice ${paymentData.invoiceId}`,
    );

    // Acquire rate limit slot
    const slot = await this.rateLimiter.acquireSlot(xeroTenantId);
    if (!slot.allowed) {
      this.logger.warn('Rate limit exceeded, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const payload: XeroPaymentPayload = {
      Invoice: {
        InvoiceID: paymentData.invoiceId,
      },
      Account: {
        AccountID: paymentData.bankAccountId,
      },
      Amount: centsToRands(paymentData.amountCents),
      Date: paymentData.date.toISOString().split('T')[0],
      Reference: paymentData.reference,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.put<XeroPaymentsResponse>(
          `${this.xeroApiUrl}/Payments`,
          { Payments: [payload] },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Xero-Tenant-Id': xeroTenantId,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        ),
      );

      const payments = response.data.Payments ?? [];

      if (payments.length === 0) {
        throw new BusinessException(
          'No payment returned from Xero API',
          'XERO_PAYMENT_CREATE_EMPTY_RESPONSE',
        );
      }

      return payments[0];
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      if (error instanceof AxiosError) {
        this.logger.error(
          `Xero API error creating payment: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
        );

        // Handle validation errors
        if (error.response?.status === 400) {
          const validationErrors =
            error.response.data?.Elements?.[0]?.ValidationErrors;
          if (validationErrors && validationErrors.length > 0) {
            throw new BusinessException(
              validationErrors[0].Message,
              'XERO_PAYMENT_VALIDATION_ERROR',
              { validationErrors },
            );
          }
        }
      }

      throw new BusinessException(
        'Failed to create Xero payment',
        'XERO_PAYMENT_CREATE_FAILED',
        {
          invoiceId: paymentData.invoiceId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Fetch payments from Xero for a specific invoice.
   */
  private async fetchXeroPaymentsForInvoice(
    accessToken: string,
    xeroTenantId: string,
    xeroInvoiceId: string,
  ): Promise<XeroPaymentApiResponse[]> {
    // Acquire rate limit slot
    const slot = await this.rateLimiter.acquireSlot(xeroTenantId);
    if (!slot.allowed) {
      this.logger.warn('Rate limit exceeded, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<XeroPaymentsResponse>(
          `${this.xeroApiUrl}/Payments`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Xero-Tenant-Id': xeroTenantId,
              Accept: 'application/json',
            },
            params: {
              where: `Invoice.InvoiceID==Guid("${xeroInvoiceId}")`,
            },
          },
        ),
      );

      return response.data.Payments ?? [];
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Xero API error fetching payments: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
        );
      }
      throw new BusinessException(
        'Failed to fetch Xero payments',
        'XERO_PAYMENT_FETCH_FAILED',
        {
          xeroInvoiceId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Get default bank account ID from Xero.
   */
  private async getDefaultBankAccountId(
    accessToken: string,
    xeroTenantId: string,
  ): Promise<string | null> {
    // Acquire rate limit slot
    const slot = await this.rateLimiter.acquireSlot(xeroTenantId);
    if (!slot.allowed) {
      this.logger.warn('Rate limit exceeded, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<{
          Accounts?: Array<{ AccountID: string; Type: string }>;
        }>(`${this.xeroApiUrl}/Accounts`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Xero-Tenant-Id': xeroTenantId,
            Accept: 'application/json',
          },
          params: {
            where: 'Type=="BANK"',
          },
        }),
      );

      const accounts = response.data.Accounts ?? [];

      if (accounts.length > 0) {
        return accounts[0].AccountID;
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to fetch default bank account', error);
      return null;
    }
  }

  /**
   * Get Xero credentials for a tenant.
   */
  private async getXeroCredentials(
    tenantId: string,
  ): Promise<{ accessToken: string; xeroTenantId: string }> {
    const xeroToken = await this.prisma.xeroToken.findUnique({
      where: { tenantId: tenantId ?? undefined },
    });

    if (!xeroToken) {
      throw new BusinessException(
        'No Xero connection found for this tenant. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    const accessToken = await this.getAccessToken(tenantId);
    const xeroTenantId = xeroToken.xeroTenantId;

    return { accessToken, xeroTenantId };
  }

  /**
   * Get access token using TokenManager pattern.
   */
  private getAccessToken(tenantId: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TokenManager } = require('../../mcp/xero-mcp/auth/token-manager');
    const tokenManager = new TokenManager(this.prisma);
    return tokenManager.getAccessToken(tenantId);
  }
}
