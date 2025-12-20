/**
 * Invoice Generation Service
 * TASK-BILL-012: Invoice Generation Service
 *
 * @module database/services/invoice-generation
 * @description Generates monthly invoices for enrolled children.
 * Calculates fees, applies sibling discounts, adds VAT for registered tenants,
 * and syncs draft invoices to Xero.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice, InvoiceLine } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { EnrollmentService } from './enrollment.service';
import { AuditLogService } from './audit-log.service';
import { XeroSyncService } from './xero-sync.service';
import { InvoiceStatus } from '../entities/invoice.entity';
import { LineType } from '../entities/invoice-line.entity';
import {
  InvoiceGenerationResult,
  LineItemInput,
  EnrollmentWithRelations,
  XeroLineItem,
} from '../dto/invoice-generation.dto';
import {
  NotFoundException,
  ValidationException,
  ConflictException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class InvoiceGenerationService {
  private readonly logger = new Logger(InvoiceGenerationService.name);

  /** South African VAT rate: 15% */
  private readonly VAT_RATE = new Decimal('0.15');

  /** Default payment terms in days */
  private readonly DEFAULT_DUE_DAYS = 7;

  /** Default income account code for school fees */
  private readonly SCHOOL_FEES_ACCOUNT = '4000';

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly parentRepo: ParentRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly auditLogService: AuditLogService,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  /**
   * Generate monthly invoices for all active enrollments
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param billingMonth - Format: YYYY-MM
   * @param userId - User performing the generation
   * @param childIds - Optional array to generate for specific children only
   * @returns Generation summary with created invoices and errors
   *
   * @throws NotFoundException if tenant doesn't exist
   * @throws ValidationException if billingMonth format is invalid
   */
  async generateMonthlyInvoices(
    tenantId: string,
    billingMonth: string,
    userId: string,
    childIds?: string[],
  ): Promise<InvoiceGenerationResult> {
    this.logger.log(
      `Starting invoice generation for tenant ${tenantId}, month ${billingMonth}`,
    );

    // Validate billing month format
    const monthMatch = billingMonth.match(/^(\d{4})-(\d{2})$/);
    if (!monthMatch) {
      throw new ValidationException(
        'Invalid billing month format. Expected YYYY-MM',
        [
          {
            field: 'billingMonth',
            message: 'Format must be YYYY-MM (e.g., 2025-01)',
            value: billingMonth,
          },
        ],
      );
    }

    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);

    if (month < 1 || month > 12) {
      throw new ValidationException('Invalid month in billing period', [
        {
          field: 'billingMonth',
          message: 'Month must be between 01 and 12',
          value: billingMonth,
        },
      ]);
    }

    // Calculate billing period dates
    const billingPeriodStart = new Date(year, month - 1, 1);
    const billingPeriodEnd = new Date(year, month, 0); // Last day of month

    // Get tenant for VAT status
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }
    const isVatRegistered = tenant.taxStatus === 'VAT_REGISTERED';

    // Get active enrollments with relations
    const enrollments = await this.getActiveEnrollmentsWithRelations(tenantId);

    // Filter by childIds if provided
    const filteredEnrollments =
      childIds && childIds.length > 0
        ? enrollments.filter((e) => childIds.includes(e.childId))
        : enrollments;

    if (filteredEnrollments.length === 0) {
      this.logger.warn(
        `No active enrollments found for tenant ${tenantId}${childIds ? ` with specified childIds` : ''}`,
      );
      return {
        invoicesCreated: 0,
        totalAmountCents: 0,
        invoices: [],
        errors: [],
      };
    }

    const result: InvoiceGenerationResult = {
      invoicesCreated: 0,
      totalAmountCents: 0,
      invoices: [],
      errors: [],
    };

    // Group enrollments by parent for sibling discount calculation
    const enrollmentsByParent = new Map<string, EnrollmentWithRelations[]>();
    for (const enrollment of filteredEnrollments) {
      const parentId = enrollment.child.parentId;
      if (!enrollmentsByParent.has(parentId)) {
        enrollmentsByParent.set(parentId, []);
      }
      enrollmentsByParent.get(parentId)!.push(enrollment);
    }

    // Process each parent's enrollments
    for (const [parentId, parentEnrollments] of enrollmentsByParent) {
      // Get sibling discounts for this parent
      const siblingDiscounts =
        await this.enrollmentService.applySiblingDiscount(tenantId, parentId);

      // Create invoice for each child
      for (const enrollment of parentEnrollments) {
        try {
          // Check for existing invoice for this period
          const existingInvoice = await this.invoiceRepo.findByBillingPeriod(
            tenantId,
            enrollment.childId,
            billingPeriodStart,
            billingPeriodEnd,
          );

          if (existingInvoice) {
            result.errors.push({
              childId: enrollment.childId,
              enrollmentId: enrollment.id,
              error: `Invoice already exists for billing period ${billingMonth}`,
              code: 'DUPLICATE_INVOICE',
            });
            continue;
          }

          // Create invoice
          const invoice = await this.createInvoice(
            tenantId,
            enrollment,
            billingPeriodStart,
            billingPeriodEnd,
            userId,
          );

          // Build line items
          const lineItems: LineItemInput[] = [];

          // Get monthly fee (may have custom override)
          const monthlyFeeCents =
            enrollment.customFeeOverrideCents ??
            enrollment.feeStructure.amountCents;

          // NOTE: Pro-rata calculation is not implemented yet (TASK-BILL-014)
          // For now, we use full monthly fee only

          // Add monthly fee line
          lineItems.push({
            description: enrollment.feeStructure.name,
            quantity: new Decimal(1),
            unitPriceCents: monthlyFeeCents,
            discountCents: 0,
            lineType: LineType.MONTHLY_FEE,
            accountCode: this.SCHOOL_FEES_ACCOUNT,
          });

          // Apply sibling discount if applicable
          const discountPercentage =
            siblingDiscounts.get(enrollment.childId) ?? new Decimal(0);

          if (discountPercentage.greaterThan(0)) {
            // Calculate discount amount
            const discountAmount = new Decimal(monthlyFeeCents)
              .mul(discountPercentage)
              .div(100);
            const discountCents = discountAmount
              .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
              .toNumber();

            if (discountCents > 0) {
              // Add discount as negative line item
              lineItems.push({
                description: `Sibling Discount (${discountPercentage.toString()}%)`,
                quantity: new Decimal(1),
                unitPriceCents: -discountCents, // Negative for discount
                discountCents: 0,
                lineType: LineType.DISCOUNT,
                accountCode: this.SCHOOL_FEES_ACCOUNT,
              });
            }
          }

          // Add line items and calculate totals
          await this.addLineItems(invoice.id, lineItems, isVatRegistered);

          // Refresh invoice to get updated totals
          const updatedInvoice = await this.invoiceRepo.findById(invoice.id);
          if (!updatedInvoice) {
            throw new Error('Invoice not found after creation');
          }

          // Sync to Xero - errors are logged but don't fail invoice creation
          const xeroInvoiceId = await this.syncToXero(updatedInvoice);
          if (xeroInvoiceId) {
            await this.invoiceRepo.update(updatedInvoice.id, { xeroInvoiceId });
            updatedInvoice.xeroInvoiceId = xeroInvoiceId;
          }

          // Build child name
          const childName = `${enrollment.child.firstName} ${enrollment.child.lastName}`;

          // Add to result
          result.invoicesCreated++;
          result.totalAmountCents += updatedInvoice.totalCents;
          result.invoices.push({
            id: updatedInvoice.id,
            invoiceNumber: updatedInvoice.invoiceNumber,
            childId: enrollment.childId,
            childName,
            parentId: enrollment.child.parentId,
            totalCents: updatedInvoice.totalCents,
            status: updatedInvoice.status as InvoiceStatus,
            xeroInvoiceId: updatedInvoice.xeroInvoiceId,
          });

          this.logger.log(
            `Created invoice ${updatedInvoice.invoiceNumber} for child ${childName} (${enrollment.childId})`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorCode =
            error instanceof NotFoundException
              ? 'NOT_FOUND'
              : error instanceof ValidationException
                ? 'VALIDATION_ERROR'
                : error instanceof ConflictException
                  ? 'CONFLICT'
                  : 'GENERATION_ERROR';

          result.errors.push({
            childId: enrollment.childId,
            enrollmentId: enrollment.id,
            error: errorMessage,
            code: errorCode,
          });

          this.logger.error(
            `Failed to generate invoice for child ${enrollment.childId}: ${errorMessage}`,
          );
        }
      }
    }

    this.logger.log(
      `Invoice generation complete: ${result.invoicesCreated} created, ${result.errors.length} errors`,
    );

    // Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'InvoiceBatch',
      entityId: billingMonth,
      afterValue: {
        billingMonth,
        invoicesCreated: result.invoicesCreated,
        totalAmountCents: result.totalAmountCents,
        errorCount: result.errors.length,
      },
    });

    return result;
  }

  /**
   * Create a single invoice for an enrollment
   *
   * @param tenantId - Tenant ID
   * @param enrollment - Enrollment with relations
   * @param billingPeriodStart - Start of billing period
   * @param billingPeriodEnd - End of billing period
   * @param userId - User performing the action
   * @returns Created invoice
   */
  async createInvoice(
    tenantId: string,
    enrollment: EnrollmentWithRelations,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    userId: string,
  ): Promise<Invoice> {
    // Generate invoice number
    const year = billingPeriodStart.getFullYear();
    const invoiceNumber = await this.generateInvoiceNumber(tenantId, year);

    // Get tenant for due days setting
    const tenant = await this.tenantRepo.findById(tenantId);
    const dueDays = tenant?.invoiceDueDays ?? this.DEFAULT_DUE_DAYS;

    // Set dates (no time component)
    const issueDate = new Date();
    issueDate.setHours(0, 0, 0, 0);

    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Create invoice
    const invoice = await this.invoiceRepo.create({
      tenantId,
      invoiceNumber,
      parentId: enrollment.child.parentId,
      childId: enrollment.childId,
      billingPeriodStart,
      billingPeriodEnd,
      issueDate,
      dueDate,
      subtotalCents: 0, // Will be updated when adding lines
      vatCents: 0,
      totalCents: 0,
    });

    // Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      afterValue: {
        invoiceNumber,
        childId: enrollment.childId,
        billingPeriod: `${billingPeriodStart.toISOString().split('T')[0]} to ${billingPeriodEnd.toISOString().split('T')[0]}`,
      },
    });

    return invoice;
  }

  /**
   * Add line items to invoice and calculate totals
   *
   * @param invoiceId - Invoice ID
   * @param lineItems - Array of line items to add
   * @param isVatRegistered - Whether tenant is VAT registered
   * @returns Created invoice lines
   */
  async addLineItems(
    invoiceId: string,
    lineItems: LineItemInput[],
    isVatRegistered: boolean,
  ): Promise<InvoiceLine[]> {
    const createdLines: InvoiceLine[] = [];
    let subtotal = new Decimal(0);
    let totalVat = new Decimal(0);

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];

      // Calculate line subtotal (quantity * unitPrice)
      // Note: unitPriceCents can be negative for discounts
      const lineSubtotal = new Decimal(item.unitPriceCents).mul(item.quantity);

      // Calculate VAT only for positive amounts and non-discount lines
      let lineVatCents = 0;
      if (
        isVatRegistered &&
        item.lineType !== LineType.DISCOUNT &&
        item.unitPriceCents > 0
      ) {
        lineVatCents = this.calculateVAT(
          lineSubtotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        );
      }

      // Line total = subtotal + VAT
      const lineTotal = lineSubtotal.add(lineVatCents);

      // Create line
      const line = await this.invoiceLineRepo.create({
        invoiceId,
        description: item.description,
        quantity: item.quantity.toNumber(),
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        subtotalCents: lineSubtotal
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        vatCents: lineVatCents,
        totalCents: lineTotal
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        lineType: item.lineType,
        accountCode: item.accountCode,
        sortOrder: i,
      });

      createdLines.push(line);

      // Accumulate totals
      subtotal = subtotal.add(lineSubtotal);
      totalVat = totalVat.add(lineVatCents);
    }

    // Calculate invoice total
    const invoiceSubtotalCents = subtotal
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    const invoiceVatCents = totalVat
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    const invoiceTotalCents = invoiceSubtotalCents + invoiceVatCents;

    // Update invoice totals
    await this.invoiceRepo.update(invoiceId, {
      subtotalCents: invoiceSubtotalCents,
      vatCents: invoiceVatCents,
      totalCents: invoiceTotalCents,
    });

    return createdLines;
  }

  /**
   * Calculate VAT using Decimal.js with banker's rounding
   *
   * @param amountCents - Amount in cents (integer)
   * @returns VAT amount in cents (integer, banker's rounded)
   */
  calculateVAT(amountCents: number): number {
    const amount = new Decimal(amountCents);
    const vat = amount.mul(this.VAT_RATE);
    return vat.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /**
   * Generate next invoice number for tenant
   * Format: INV-{YYYY}-{sequential}
   * Example: INV-2025-001
   *
   * @param tenantId - Tenant ID
   * @param year - Year for invoice
   * @returns Generated invoice number
   */
  async generateInvoiceNumber(tenantId: string, year: number): Promise<string> {
    const lastInvoice = await this.invoiceRepo.findLastInvoiceForYear(
      tenantId,
      year,
    );

    let sequential = 1;

    if (lastInvoice) {
      // Extract sequential number from last invoice
      // Format: INV-2025-001
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length === 3) {
        const lastSequential = parseInt(parts[2], 10);
        if (!isNaN(lastSequential)) {
          sequential = lastSequential + 1;
        }
      }
    }

    // Format with leading zeros (001, 002, etc.)
    const sequentialPadded = sequential.toString().padStart(3, '0');
    return `INV-${year}-${sequentialPadded}`;
  }

  /**
   * Build Xero line items from invoice lines
   *
   * @param invoiceId - Invoice ID
   * @returns Array of Xero-formatted line items
   */
  async buildXeroLineItems(invoiceId: string): Promise<XeroLineItem[]> {
    const lines = await this.invoiceLineRepo.findByInvoice(invoiceId);

    return lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitAmount: line.unitPriceCents / 100, // Convert cents to currency
      accountCode: line.accountCode ?? this.SCHOOL_FEES_ACCOUNT,
      taxType: line.vatCents > 0 ? ('OUTPUT' as const) : ('NONE' as const),
    }));
  }

  /**
   * Sync invoice to Xero as DRAFT via MCP
   *
   * @param invoice - Invoice to sync (must have id and invoiceNumber)
   * @returns Xero invoice ID, or null if sync failed (logged but not thrown)
   *
   * CRITICAL: Errors are logged but DO NOT fail the invoice creation.
   * This follows the fail-fast principle for local operations while
   * gracefully handling external service failures.
   */
  async syncToXero(invoice: Invoice): Promise<string | null> {
    this.logger.log(`Syncing invoice ${invoice.invoiceNumber} to Xero`);

    try {
      // Get parent to find Xero contact ID
      const parent = await this.parentRepo.findById(invoice.parentId);

      if (!parent) {
        this.logger.warn(
          `Cannot sync invoice ${invoice.id} to Xero: Parent ${invoice.parentId} not found`,
        );
        return null;
      }

      if (!parent.xeroContactId) {
        this.logger.warn(
          `Cannot sync invoice ${invoice.id} to Xero: Parent ${invoice.parentId} has no Xero contact ID`,
        );
        return null;
      }

      // Build Xero line items
      const xeroLineItems = await this.buildXeroLineItems(invoice.id);

      if (xeroLineItems.length === 0) {
        this.logger.warn(
          `Cannot sync invoice ${invoice.id} to Xero: No line items found`,
        );
        return null;
      }

      // Create invoice draft in Xero via XeroSyncService
      const xeroInvoiceId = await this.xeroSyncService.createInvoiceDraft(
        invoice.tenantId,
        invoice.invoiceNumber,
        invoice.dueDate,
        parent.xeroContactId,
        xeroLineItems,
      );

      if (xeroInvoiceId) {
        this.logger.log(
          `Successfully synced invoice ${invoice.invoiceNumber} to Xero: ${xeroInvoiceId}`,
        );
      } else {
        this.logger.warn(
          `Xero sync returned null for invoice ${invoice.invoiceNumber}`,
        );
      }

      return xeroInvoiceId;
    } catch (error) {
      // Log error but DO NOT throw - invoice creation should succeed locally
      // even if Xero sync fails
      this.logger.error(
        `Failed to sync invoice ${invoice.id} to Xero: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Get active enrollments with child and feeStructure relations
   *
   * @param tenantId - Tenant ID
   * @returns Array of enrollments with relations
   */
  private async getActiveEnrollmentsWithRelations(
    tenantId: string,
  ): Promise<EnrollmentWithRelations[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        child: {
          select: {
            id: true,
            parentId: true,
            firstName: true,
            lastName: true,
          },
        },
        feeStructure: {
          select: {
            id: true,
            name: true,
            amountCents: true,
            vatInclusive: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }],
    });

    return enrollments as EnrollmentWithRelations[];
  }
}
