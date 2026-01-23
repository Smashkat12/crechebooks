/**
 * XeroInvoiceService
 * TASK-XERO-009: Bidirectional Invoice Sync with Xero
 *
 * Service for syncing invoices between CrecheBooks and Xero.
 * Supports both push (CrecheBooks -> Xero) and pull (Xero -> CrecheBooks) operations.
 *
 * KEY FEATURES:
 * - Push invoices to Xero with automatic Contact creation/lookup
 * - Pull invoices from Xero and import matching ones
 * - Maintain sync mapping for tracking
 * - Rate limiting integration via XeroRateLimiter (TASK-XERO-008)
 *
 * CRITICAL: All monetary values are in cents (integers).
 * Uses banker's rounding (ROUND_HALF_EVEN) for currency conversions.
 *
 * KEY MAPPINGS:
 * - Invoice.totalCents / 100 = Xero Amount (Rands)
 * - Invoice.status -> Xero Status (DRAFT/AUTHORISED/PAID)
 * - Parent -> Xero Contact (via email lookup)
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import Decimal from 'decimal.js';
import { PrismaService } from '../../database/prisma/prisma.service';
import { XeroRateLimiter } from './xero-rate-limiter.service';
import {
  InvoiceSyncDirection,
  InvoiceSyncStatus,
  XeroInvoice,
  PushInvoiceResponseDto,
  PullInvoiceResponseDto,
  BulkPushResponseDto,
  PullInvoicesResponseDto,
  INVOICE_STATUS_MAP,
} from './dto/xero-invoice.dto';
import {
  XeroAuthenticationError,
  XeroValidationError,
  XeroRateLimitError,
  XeroServerError,
  XeroNotConnectedError,
  XeroMaxRetriesExceededError,
  isRetryableXeroError,
  extractRetryAfter,
} from './xero-journal.errors';

// Configure Decimal for banker's rounding (ROUND_HALF_EVEN)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

/**
 * Xero API Invoices response structure
 */
interface XeroInvoicesResponse {
  Invoices?: XeroInvoice[];
}

/**
 * Xero API Contacts response structure
 */
interface XeroContactsResponse {
  Contacts?: Array<{
    ContactID: string;
    Name: string;
    EmailAddress?: string;
    FirstName?: string;
    LastName?: string;
  }>;
}

@Injectable()
export class XeroInvoiceService {
  private readonly logger = new Logger(XeroInvoiceService.name);

  // Xero API base URL
  private readonly xeroApiBaseUrl = 'https://api.xero.com/api.xro/2.0';

  // Retry configuration
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly rateLimiter: XeroRateLimiter,
  ) {
    this.maxRetries = this.configService.get<number>('XERO_MAX_RETRIES', 3);
    this.baseDelayMs = this.configService.get<number>(
      'XERO_BASE_DELAY_MS',
      1000,
    );
    this.maxDelayMs = this.configService.get<number>(
      'XERO_MAX_DELAY_MS',
      30000,
    );
  }

  /**
   * Push a single invoice from CrecheBooks to Xero.
   *
   * @param tenantId - Internal tenant ID
   * @param invoiceId - CrecheBooks invoice ID to push
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero organization tenant ID
   * @param force - Force push even if already synced
   * @returns Push result with Xero invoice details
   */
  async pushInvoice(
    tenantId: string,
    invoiceId: string,
    accessToken: string,
    xeroTenantId: string,
    force = false,
  ): Promise<PushInvoiceResponseDto> {
    this.logger.log(
      `Pushing invoice ${invoiceId} to Xero for tenant ${tenantId}`,
    );

    // Check for existing mapping
    const existingMapping = await this.prisma.xeroInvoiceMapping.findUnique({
      where: { tenantId_invoiceId: { tenantId, invoiceId } },
    });

    if (existingMapping && !force) {
      this.logger.log(
        `Invoice ${invoiceId} already synced to Xero as ${existingMapping.xeroInvoiceId}`,
      );
      return {
        invoiceId,
        xeroInvoiceId: existingMapping.xeroInvoiceId,
        xeroInvoiceNumber: existingMapping.xeroInvoiceNumber ?? undefined,
        xeroStatus: 'AUTHORISED',
        syncDirection: InvoiceSyncDirection.PUSH,
        syncedAt: existingMapping.lastSyncedAt,
      };
    }

    // Fetch invoice with all related data
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        parent: true,
        child: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    if (invoice.tenantId !== tenantId) {
      throw new XeroValidationError('Invoice does not belong to this tenant');
    }

    // Find or create Xero contact for the parent
    const xeroContactId = await this.findOrCreateXeroContact(
      tenantId,
      accessToken,
      xeroTenantId,
      invoice.parent,
    );

    // Map invoice to Xero format
    const xeroInvoicePayload = this.mapToXeroInvoice(invoice, xeroContactId);

    // Push to Xero with retry logic
    const xeroInvoice = await this.executeWithRetry(async () => {
      const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
      if (!rateLimit.allowed) {
        throw new XeroRateLimitError(rateLimit.retryAfter);
      }

      return this.postInvoiceToXero(
        accessToken,
        xeroTenantId,
        xeroInvoicePayload,
      );
    }, tenantId);

    // Create or update mapping
    const now = new Date();
    const mapping = await this.prisma.xeroInvoiceMapping.upsert({
      where: { tenantId_invoiceId: { tenantId, invoiceId } },
      create: {
        tenantId,
        invoiceId,
        xeroInvoiceId: xeroInvoice.InvoiceID,
        xeroInvoiceNumber: xeroInvoice.InvoiceNumber,
        lastSyncedAt: now,
        syncDirection: 'PUSH',
        syncStatus: 'SYNCED',
      },
      update: {
        xeroInvoiceId: xeroInvoice.InvoiceID,
        xeroInvoiceNumber: xeroInvoice.InvoiceNumber,
        lastSyncedAt: now,
        syncStatus: 'SYNCED',
        syncErrorMessage: null,
      },
    });

    // Update invoice with Xero ID
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { xeroInvoiceId: xeroInvoice.InvoiceID },
    });

    this.logger.log(
      `Invoice ${invoiceId} pushed to Xero as ${xeroInvoice.InvoiceID}`,
    );

    return {
      invoiceId,
      xeroInvoiceId: xeroInvoice.InvoiceID,
      xeroInvoiceNumber: xeroInvoice.InvoiceNumber,
      xeroStatus: xeroInvoice.Status,
      syncDirection: InvoiceSyncDirection.PUSH,
      syncedAt: mapping.lastSyncedAt,
    };
  }

  /**
   * Push multiple invoices to Xero.
   *
   * @param tenantId - Internal tenant ID
   * @param invoiceIds - Array of invoice IDs (empty = all unsynced)
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero organization tenant ID
   * @param force - Force push even if already synced
   * @returns Bulk push result
   */
  async pushInvoices(
    tenantId: string,
    invoiceIds: string[] | undefined,
    accessToken: string,
    xeroTenantId: string,
    force = false,
  ): Promise<BulkPushResponseDto> {
    // Get invoices to push
    let ids = invoiceIds;
    if (!ids || ids.length === 0) {
      // Get all unsynced invoices
      const unsyncedInvoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          xeroInvoiceId: null,
          status: { notIn: ['DRAFT', 'VOID'] },
          isDeleted: false,
        },
        select: { id: true },
      });
      ids = unsyncedInvoices.map((inv) => inv.id);
    }

    if (ids.length === 0) {
      return {
        pushed: 0,
        failed: 0,
        skipped: 0,
        results: [],
        errors: [],
      };
    }

    const results: PushInvoiceResponseDto[] = [];
    const errors: Array<{ invoiceId: string; error: string; code: string }> =
      [];
    let skipped = 0;

    for (const invoiceId of ids) {
      try {
        // Check if already synced before pushing (to track skipped count)
        if (!force) {
          const existingMapping =
            await this.prisma.xeroInvoiceMapping.findUnique({
              where: { tenantId_invoiceId: { tenantId, invoiceId } },
            });
          if (existingMapping) {
            skipped++;
            continue;
          }
        }

        const result = await this.pushInvoice(
          tenantId,
          invoiceId,
          accessToken,
          xeroTenantId,
          force,
        );
        results.push(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Check if skipped due to existing sync
        if (err.message.includes('already synced') && !force) {
          skipped++;
          continue;
        }

        this.logger.warn(`Failed to push invoice ${invoiceId}: ${err.message}`);

        // Update mapping with error
        await this.prisma.xeroInvoiceMapping.upsert({
          where: { tenantId_invoiceId: { tenantId, invoiceId } },
          create: {
            tenantId,
            invoiceId,
            xeroInvoiceId: '',
            lastSyncedAt: new Date(),
            syncDirection: 'PUSH',
            syncStatus: 'FAILED',
            syncErrorMessage: err.message,
          },
          update: {
            syncStatus: 'FAILED',
            syncErrorMessage: err.message,
            lastSyncedAt: new Date(),
          },
        });

        errors.push({
          invoiceId,
          error: err.message,
          code: this.getErrorCode(error),
        });
      }
    }

    return {
      pushed: results.length,
      failed: errors.length,
      skipped,
      results,
      errors,
    };
  }

  /**
   * Pull invoices from Xero and import/update in CrecheBooks.
   *
   * @param tenantId - Internal tenant ID
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero organization tenant ID
   * @param since - Optional date to filter modified invoices
   * @returns Pull result with imported invoices
   */
  async pullInvoices(
    tenantId: string,
    accessToken: string,
    xeroTenantId: string,
    since?: string,
  ): Promise<PullInvoicesResponseDto> {
    this.logger.log(`Pulling invoices from Xero for tenant ${tenantId}`);

    // Check rate limit
    const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
    if (!rateLimit.allowed) {
      throw new XeroRateLimitError(rateLimit.retryAfter);
    }

    // Build request URL
    let url = `${this.xeroApiBaseUrl}/Invoices?where=Type=="ACCREC"`;
    if (since) {
      url += `&ModifiedAfter=${since}T00:00:00`;
    }

    // Fetch invoices from Xero
    const response = await firstValueFrom(
      this.httpService.get<XeroInvoicesResponse>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'xero-tenant-id': xeroTenantId,
          Accept: 'application/json',
        },
        timeout: 30000,
      }),
    ).catch((error) => {
      throw this.mapXeroError(error);
    });

    const xeroInvoices = response.data.Invoices ?? [];
    this.logger.log(`Found ${xeroInvoices.length} invoices in Xero`);

    const results: PullInvoiceResponseDto[] = [];
    const errors: Array<{
      xeroInvoiceId: string;
      error: string;
      code: string;
    }> = [];
    const imported = 0;
    let updated = 0;
    let skipped = 0;

    // Get all parents for this tenant (for matching)
    const parents = await this.prisma.parent.findMany({
      where: {
        tenantId: tenantId ?? undefined,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const parentsByEmail = new Map(
      parents.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]),
    );

    for (const xeroInvoice of xeroInvoices) {
      try {
        // Check if already mapped
        const existingMapping = await this.prisma.xeroInvoiceMapping.findUnique(
          {
            where: {
              tenantId_xeroInvoiceId: {
                tenantId,
                xeroInvoiceId: xeroInvoice.InvoiceID,
              },
            },
          },
        );

        // Map Xero invoice to response
        const pullResult = this.mapFromXeroInvoice(xeroInvoice);

        if (existingMapping) {
          // Update existing mapping
          pullResult.invoiceId = existingMapping.invoiceId;
          pullResult.imported = true;
          results.push(pullResult);
          updated++;
          continue;
        }

        // Try to match by contact email
        const contactEmail = xeroInvoice.Contact.EmailAddress?.toLowerCase();
        const matchedParent = contactEmail
          ? parentsByEmail.get(contactEmail)
          : undefined;

        if (!matchedParent) {
          // Cannot import - no matching parent
          pullResult.imported = false;
          pullResult.importReason = contactEmail
            ? `Contact email ${contactEmail} not found in CrecheBooks`
            : 'Contact has no email address';
          results.push(pullResult);
          skipped++;
          continue;
        }

        // Create mapping (but don't create invoice - that's a business decision)
        pullResult.imported = false;
        pullResult.importReason =
          'Invoice found in Xero but not created in CrecheBooks - manual import required';
        results.push(pullResult);
        skipped++;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Failed to process Xero invoice ${xeroInvoice.InvoiceID}: ${err.message}`,
        );
        errors.push({
          xeroInvoiceId: xeroInvoice.InvoiceID,
          error: err.message,
          code: this.getErrorCode(error),
        });
      }
    }

    return {
      totalFound: xeroInvoices.length,
      imported,
      updated,
      skipped,
      invoices: results,
      errors,
    };
  }

  /**
   * Map CrecheBooks invoice to Xero invoice format.
   *
   * @param invoice - CrecheBooks invoice with lines
   * @param xeroContactId - Xero contact ID for the parent
   * @returns Xero invoice payload
   */
  mapToXeroInvoice(
    invoice: {
      id: string;
      invoiceNumber: string;
      status: string;
      issueDate: Date;
      dueDate: Date;
      subtotalCents: number;
      vatCents: number;
      totalCents: number;
      notes: string | null;
      lines: Array<{
        description: string;
        quantity: any;
        unitPriceCents: number;
        discountCents: number;
        subtotalCents: number;
        vatCents: number;
        accountCode: string | null;
      }>;
    },
    xeroContactId: string,
  ): { Invoices: Array<Partial<XeroInvoice>> } {
    // Map status
    const xeroStatus =
      INVOICE_STATUS_MAP.toXero[
        invoice.status as keyof typeof INVOICE_STATUS_MAP.toXero
      ] ?? 'DRAFT';

    // Convert line items
    const lineItems = invoice.lines.map((line) => {
      const quantity = new Decimal(line.quantity?.toString() ?? '1').toNumber();
      const unitAmount = new Decimal(line.unitPriceCents).div(100).toNumber();
      const lineAmount = new Decimal(line.subtotalCents).div(100).toNumber();

      return {
        Description: line.description,
        Quantity: quantity,
        UnitAmount: unitAmount,
        AccountCode: line.accountCode ?? undefined,
        TaxType: line.vatCents > 0 ? 'OUTPUT' : 'NONE',
        LineAmount: lineAmount,
      };
    });

    return {
      Invoices: [
        {
          Type: 'ACCREC', // Accounts Receivable (sales invoice)
          Contact: {
            ContactID: xeroContactId,
          } as XeroInvoice['Contact'],
          InvoiceNumber: invoice.invoiceNumber,
          Date: this.formatDate(invoice.issueDate),
          DueDate: this.formatDate(invoice.dueDate),
          Status: xeroStatus as XeroInvoice['Status'],
          LineItems: lineItems,
          Reference: invoice.notes?.substring(0, 100) ?? undefined,
        },
      ],
    };
  }

  /**
   * Map Xero invoice to CrecheBooks pull response.
   *
   * @param xeroInvoice - Xero invoice object
   * @returns Pull response DTO
   */
  mapFromXeroInvoice(xeroInvoice: XeroInvoice): PullInvoiceResponseDto {
    // Convert amounts from Rands to cents
    const totalCents = Math.round(
      new Decimal(xeroInvoice.Total).mul(100).toNumber(),
    );
    const amountPaidCents = Math.round(
      new Decimal(xeroInvoice.AmountPaid).mul(100).toNumber(),
    );

    return {
      xeroInvoiceId: xeroInvoice.InvoiceID,
      xeroInvoiceNumber: xeroInvoice.InvoiceNumber,
      contactName: xeroInvoice.Contact.Name,
      contactEmail: xeroInvoice.Contact.EmailAddress,
      date: xeroInvoice.Date.split('T')[0],
      dueDate: xeroInvoice.DueDate.split('T')[0],
      totalCents,
      amountPaidCents,
      status: xeroInvoice.Status,
      imported: false,
    };
  }

  /**
   * Find or create a Xero contact for a CrecheBooks parent.
   *
   * @param tenantId - Internal tenant ID
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero organization tenant ID
   * @param parent - CrecheBooks parent entity
   * @returns Xero contact ID
   */
  private async findOrCreateXeroContact(
    tenantId: string,
    accessToken: string,
    xeroTenantId: string,
    parent: {
      id: string;
      xeroContactId: string | null;
      firstName: string;
      lastName: string;
      email: string | null;
    },
  ): Promise<string> {
    // If parent already has Xero contact ID, return it
    if (parent.xeroContactId) {
      return parent.xeroContactId;
    }

    // Try to find contact by email in Xero
    if (parent.email) {
      const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
      if (!rateLimit.allowed) {
        throw new XeroRateLimitError(rateLimit.retryAfter);
      }

      const searchUrl = `${this.xeroApiBaseUrl}/Contacts?where=EmailAddress=="${encodeURIComponent(parent.email)}"`;

      try {
        const response = await firstValueFrom(
          this.httpService.get<XeroContactsResponse>(searchUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'xero-tenant-id': xeroTenantId,
              Accept: 'application/json',
            },
            timeout: 30000,
          }),
        );

        if (response.data.Contacts && response.data.Contacts.length > 0) {
          const xeroContactId = response.data.Contacts[0].ContactID;

          // Update parent with Xero contact ID
          await this.prisma.parent.update({
            where: { id: parent.id },
            data: { xeroContactId },
          });

          return xeroContactId;
        }
      } catch (error) {
        this.logger.warn(`Failed to search Xero contacts: ${error}`);
        // Continue to create contact
      }
    }

    // Create new contact in Xero
    const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
    if (!rateLimit.allowed) {
      throw new XeroRateLimitError(rateLimit.retryAfter);
    }

    const contactPayload = {
      Contacts: [
        {
          Name: `${parent.firstName} ${parent.lastName}`,
          FirstName: parent.firstName,
          LastName: parent.lastName,
          EmailAddress: parent.email ?? undefined,
        },
      ],
    };

    const response = await firstValueFrom(
      this.httpService.post<XeroContactsResponse>(
        `${this.xeroApiBaseUrl}/Contacts`,
        contactPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'xero-tenant-id': xeroTenantId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000,
        },
      ),
    ).catch((error) => {
      throw this.mapXeroError(error);
    });

    const xeroContactId = response.data.Contacts?.[0]?.ContactID;
    if (!xeroContactId) {
      throw new XeroServerError('Failed to create contact in Xero');
    }

    // Update parent with Xero contact ID
    await this.prisma.parent.update({
      where: { id: parent.id },
      data: { xeroContactId },
    });

    this.logger.log(
      `Created Xero contact ${xeroContactId} for parent ${parent.id}`,
    );
    return xeroContactId;
  }

  /**
   * Post invoice to Xero API.
   *
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero tenant ID
   * @param payload - Xero invoice payload
   * @returns Created Xero invoice
   */
  private async postInvoiceToXero(
    accessToken: string,
    xeroTenantId: string,
    payload: { Invoices: Array<Partial<XeroInvoice>> },
  ): Promise<XeroInvoice> {
    const response = await firstValueFrom(
      this.httpService.post<XeroInvoicesResponse>(
        `${this.xeroApiBaseUrl}/Invoices`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'xero-tenant-id': xeroTenantId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000,
        },
      ),
    ).catch((error) => {
      throw this.mapXeroError(error);
    });

    const invoice = response.data.Invoices?.[0];
    if (!invoice) {
      throw new XeroServerError('No invoice returned from Xero API');
    }

    return invoice;
  }

  /**
   * Execute operation with retry logic.
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    tenantId: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!isRetryableXeroError(error) || attempt >= this.maxRetries) {
          throw this.mapXeroError(error);
        }

        const delay = this.calculateBackoffDelay(error, attempt);
        this.logger.warn(
          `Xero API call failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries + 1})`,
          { tenantId, error: lastError.message },
        );

        await this.sleep(delay);
      }
    }

    throw new XeroMaxRetriesExceededError(this.maxRetries + 1, lastError);
  }

  /**
   * Calculate backoff delay with exponential increase.
   */
  private calculateBackoffDelay(error: unknown, attempt: number): number {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      return Math.min(retryAfter * 1000, this.maxDelayMs);
    }

    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.maxDelayMs);
  }

  /**
   * Map errors to custom Xero error types.
   * If the error is already a known Xero error type, return it as-is.
   */
  private mapXeroError(error: unknown): Error {
    // Already a Xero error type - pass through
    if (
      error instanceof XeroAuthenticationError ||
      error instanceof XeroValidationError ||
      error instanceof XeroRateLimitError ||
      error instanceof XeroServerError ||
      error instanceof XeroNotConnectedError ||
      error instanceof XeroMaxRetriesExceededError
    ) {
      return error;
    }

    const axiosError = error as AxiosError<{ Message?: string }>;
    const status = axiosError?.response?.status;
    const data = axiosError?.response?.data;

    switch (status) {
      case 401:
      case 403:
        return new XeroAuthenticationError(
          'Xero authentication failed. Token may be expired.',
          data,
        );
      case 400:
        return new XeroValidationError(
          data?.Message ?? 'Invalid invoice data',
          undefined,
          data,
        );
      case 429: {
        const retryAfter = extractRetryAfter(error);
        return new XeroRateLimitError(retryAfter, data);
      }
      case 404:
        return new XeroNotConnectedError('Xero resource not found.');
      default:
        if (status && status >= 500) {
          return new XeroServerError(`Xero server error (${status})`, data);
        }
        return new XeroServerError(
          `Xero API error: ${axiosError?.message ?? 'Unknown error'}`,
          data,
        );
    }
  }

  /**
   * Get error code from error instance.
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof XeroAuthenticationError) return 'AUTH_ERROR';
    if (error instanceof XeroValidationError) return 'VALIDATION_ERROR';
    if (error instanceof XeroRateLimitError) return 'RATE_LIMIT';
    if (error instanceof XeroServerError) return 'SERVER_ERROR';
    if (error instanceof XeroNotConnectedError) return 'NOT_CONNECTED';
    if (error instanceof XeroMaxRetriesExceededError) return 'MAX_RETRIES';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Format date for Xero API (YYYY-MM-DD).
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Sleep for specified milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get sync mapping for an invoice.
   */
  async getInvoiceMapping(tenantId: string = '', invoiceId: string) {
    return this.prisma.xeroInvoiceMapping.findUnique({
      where: { tenantId_invoiceId: { tenantId, invoiceId } },
    });
  }

  /**
   * Get all sync mappings for a tenant.
   */
  async getInvoiceMappings(tenantId: string = '', status?: string) {
    return this.prisma.xeroInvoiceMapping.findMany({
      where: {
        tenantId,
        ...(status ? { syncStatus: status as any } : {}),
      },
      orderBy: { lastSyncedAt: 'desc' },
    });
  }
}
