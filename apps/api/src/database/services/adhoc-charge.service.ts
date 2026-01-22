/**
 * Ad-hoc Charge Service
 * REQ-BILL-009/011/012: Manual charges on invoices
 *
 * @module database/services/adhoc-charge
 * @description Service for adding, removing, and listing ad-hoc charges on invoices.
 * Ad-hoc charges use LineType.EXTRA and can only be added to DRAFT invoices.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: Only DRAFT invoices can have charges added/removed.
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { VatService } from './vat.service';
import { LineType } from '../entities/invoice-line.entity';
import { InvoiceStatus } from '../entities/invoice.entity';
import {
  CreateAdhocChargeDto,
  AdhocChargeResponseDto,
  AdhocChargeListDto,
} from '../dto/adhoc-charge.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class AdhocChargeService {
  private readonly logger = new Logger(AdhocChargeService.name);

  /** Default account code for miscellaneous income */
  private readonly DEFAULT_EXTRA_ACCOUNT = '4100';

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly vatService: VatService,
  ) {}

  /**
   * Add an ad-hoc charge to a DRAFT invoice
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param invoiceId - Invoice ID to add charge to
   * @param dto - Ad-hoc charge details
   * @returns Created charge details with updated invoice totals
   *
   * @throws NotFoundException if invoice doesn't exist
   * @throws ValidationException if invoice is not in DRAFT status
   * @throws ForbiddenException if tenant IDs don't match
   */
  async addCharge(
    tenantId: string,
    invoiceId: string,
    dto: CreateAdhocChargeDto,
  ): Promise<AdhocChargeResponseDto> {
    this.logger.log(
      `Adding ad-hoc charge to invoice ${invoiceId} for tenant ${tenantId}`,
    );

    // Validate inputs
    if (!tenantId) {
      throw new ValidationException('Tenant ID is required', [
        {
          field: 'tenantId',
          message: 'Tenant ID must be provided',
          value: tenantId,
        },
      ]);
    }

    if (!invoiceId) {
      throw new ValidationException('Invoice ID is required', [
        {
          field: 'invoiceId',
          message: 'Invoice ID must be provided',
          value: invoiceId,
        },
      ]);
    }

    // Get invoice with tenant validation
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);

    if (!invoice) {
      this.logger.warn(
        `Invoice ${invoiceId} not found when adding ad-hoc charge`,
      );
      throw new NotFoundException('Invoice', invoiceId);
    }

    // Validate invoice status - only DRAFT invoices can be modified
    if (invoice.status !== (InvoiceStatus.DRAFT as string)) {
      this.logger.warn(
        `Attempted to add charge to non-DRAFT invoice ${invoiceId} with status ${invoice.status}`,
      );
      throw new ValidationException(
        'Only DRAFT invoices can have charges added',
        [
          {
            field: 'status',
            message: `Invoice must be in DRAFT status. Current status: ${invoice.status}`,
            value: invoice.status,
          },
        ],
      );
    }

    // Get tenant for VAT status
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { taxStatus: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    const isVatRegistered = tenant.taxStatus === 'VAT_REGISTERED';

    // Calculate amounts using Decimal.js
    const quantity = dto.quantity ?? 1;
    const unitPriceCents = dto.amountCents;

    // Calculate line subtotal
    const lineSubtotal = new Decimal(unitPriceCents).mul(quantity);
    const lineSubtotalCents = lineSubtotal
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();

    // Calculate VAT if tenant is VAT registered
    const lineVatCents = isVatRegistered
      ? this.vatService
          .calculateVatFromExclusive(new Decimal(lineSubtotalCents))
          .toNumber()
      : 0;

    // Calculate line total
    const lineTotalCents = lineSubtotalCents + lineVatCents;

    // Get current line count for sort order
    const existingLines = await this.invoiceLineRepo.findByInvoice(invoiceId);
    const sortOrder = existingLines.length;

    // Create invoice line
    const line = await this.invoiceLineRepo.create({
      invoiceId,
      description: dto.description,
      quantity,
      unitPriceCents,
      discountCents: 0,
      subtotalCents: lineSubtotalCents,
      vatCents: lineVatCents,
      totalCents: lineTotalCents,
      lineType: LineType.EXTRA,
      accountCode: dto.accountCode ?? this.DEFAULT_EXTRA_ACCOUNT,
      sortOrder,
    });

    this.logger.log(
      `Created ad-hoc charge line ${line.id}: ${dto.description} - R${(lineSubtotalCents / 100).toFixed(2)} + VAT R${(lineVatCents / 100).toFixed(2)}`,
    );

    // Recalculate invoice totals
    const updatedTotals = await this.recalculateInvoiceTotals(invoiceId);

    // Update invoice with new totals
    await this.invoiceRepo.update(invoiceId, tenantId, {
      subtotalCents: updatedTotals.subtotalCents,
      vatCents: updatedTotals.vatCents,
      totalCents: updatedTotals.totalCents,
    });

    this.logger.log(
      `Updated invoice ${invoiceId} totals - Subtotal: R${(updatedTotals.subtotalCents / 100).toFixed(2)}, VAT: R${(updatedTotals.vatCents / 100).toFixed(2)}, Total: R${(updatedTotals.totalCents / 100).toFixed(2)}`,
    );

    return {
      lineId: line.id,
      invoiceId,
      description: dto.description,
      amountCents: unitPriceCents,
      quantity,
      vatCents: lineVatCents,
      totalCents: lineTotalCents,
      invoiceSubtotalCents: updatedTotals.subtotalCents,
      invoiceVatCents: updatedTotals.vatCents,
      invoiceTotalCents: updatedTotals.totalCents,
    };
  }

  /**
   * Remove an ad-hoc charge from a DRAFT invoice
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param invoiceId - Invoice ID
   * @param lineId - Line ID of the ad-hoc charge to remove
   *
   * @throws NotFoundException if invoice or line doesn't exist
   * @throws ValidationException if invoice is not in DRAFT status or line is not an EXTRA type
   * @throws ForbiddenException if tenant IDs don't match
   */
  async removeCharge(
    tenantId: string,
    invoiceId: string,
    lineId: string,
  ): Promise<void> {
    this.logger.log(
      `Removing ad-hoc charge ${lineId} from invoice ${invoiceId} for tenant ${tenantId}`,
    );

    // Validate inputs
    if (!tenantId) {
      throw new ValidationException('Tenant ID is required', [
        {
          field: 'tenantId',
          message: 'Tenant ID must be provided',
          value: tenantId,
        },
      ]);
    }

    if (!invoiceId) {
      throw new ValidationException('Invoice ID is required', [
        {
          field: 'invoiceId',
          message: 'Invoice ID must be provided',
          value: invoiceId,
        },
      ]);
    }

    if (!lineId) {
      throw new ValidationException('Line ID is required', [
        {
          field: 'lineId',
          message: 'Line ID must be provided',
          value: lineId,
        },
      ]);
    }

    // Get invoice with tenant validation
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);

    if (!invoice) {
      this.logger.warn(
        `Invoice ${invoiceId} not found when removing ad-hoc charge`,
      );
      throw new NotFoundException('Invoice', invoiceId);
    }

    // Validate invoice status - only DRAFT invoices can be modified
    if (invoice.status !== (InvoiceStatus.DRAFT as string)) {
      this.logger.warn(
        `Attempted to remove charge from non-DRAFT invoice ${invoiceId} with status ${invoice.status}`,
      );
      throw new ValidationException(
        'Only DRAFT invoices can have charges removed',
        [
          {
            field: 'status',
            message: `Invoice must be in DRAFT status. Current status: ${invoice.status}`,
            value: invoice.status,
          },
        ],
      );
    }

    // Get the line to verify it exists and is an EXTRA type
    const line = await this.invoiceLineRepo.findById(lineId, invoiceId);

    if (!line) {
      this.logger.warn(
        `Invoice line ${lineId} not found when removing ad-hoc charge`,
      );
      throw new NotFoundException('InvoiceLine', lineId);
    }

    // Verify the line belongs to this invoice
    if (line.invoiceId !== invoiceId) {
      this.logger.error(
        `Line ${lineId} does not belong to invoice ${invoiceId}`,
      );
      throw new ValidationException('Line does not belong to this invoice', [
        {
          field: 'lineId',
          message: `Line ${lineId} belongs to invoice ${line.invoiceId}, not ${invoiceId}`,
          value: lineId,
        },
      ]);
    }

    // Verify the line is an ad-hoc charge (EXTRA type)
    if (line.lineType !== (LineType.EXTRA as string)) {
      this.logger.warn(
        `Attempted to remove non-EXTRA line ${lineId} with lineType ${line.lineType}`,
      );
      throw new ValidationException('Only ad-hoc charges can be removed', [
        {
          field: 'lineType',
          message: `Line must be of type EXTRA. Current type: ${line.lineType}`,
          value: line.lineType,
        },
      ]);
    }

    // Delete the line
    await this.invoiceLineRepo.delete(lineId, invoiceId);

    this.logger.log(
      `Deleted ad-hoc charge line ${lineId}: ${line.description}`,
    );

    // Recalculate invoice totals
    const updatedTotals = await this.recalculateInvoiceTotals(invoiceId);

    // Update invoice with new totals
    await this.invoiceRepo.update(invoiceId, tenantId, {
      subtotalCents: updatedTotals.subtotalCents,
      vatCents: updatedTotals.vatCents,
      totalCents: updatedTotals.totalCents,
    });

    this.logger.log(
      `Updated invoice ${invoiceId} totals after charge removal - Subtotal: R${(updatedTotals.subtotalCents / 100).toFixed(2)}, VAT: R${(updatedTotals.vatCents / 100).toFixed(2)}, Total: R${(updatedTotals.totalCents / 100).toFixed(2)}`,
    );
  }

  /**
   * Get all ad-hoc charges for an invoice
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param invoiceId - Invoice ID
   * @returns List of ad-hoc charges
   *
   * @throws NotFoundException if invoice doesn't exist
   * @throws ForbiddenException if tenant IDs don't match
   */
  async getCharges(
    tenantId: string,
    invoiceId: string,
  ): Promise<AdhocChargeListDto> {
    this.logger.log(
      `Getting ad-hoc charges for invoice ${invoiceId} for tenant ${tenantId}`,
    );

    // Validate inputs
    if (!tenantId) {
      throw new ValidationException('Tenant ID is required', [
        {
          field: 'tenantId',
          message: 'Tenant ID must be provided',
          value: tenantId,
        },
      ]);
    }

    if (!invoiceId) {
      throw new ValidationException('Invoice ID is required', [
        {
          field: 'invoiceId',
          message: 'Invoice ID must be provided',
          value: invoiceId,
        },
      ]);
    }

    // Get invoice with tenant validation
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);

    if (!invoice) {
      this.logger.warn(
        `Invoice ${invoiceId} not found when getting ad-hoc charges`,
      );
      throw new NotFoundException('Invoice', invoiceId);
    }

    // Get all lines for the invoice
    const allLines = await this.invoiceLineRepo.findByInvoice(invoiceId);

    // Filter for EXTRA type lines (ad-hoc charges)
    const extraLines = allLines.filter(
      (line) => line.lineType === (LineType.EXTRA as string),
    );

    // Calculate total amount (excluding VAT)
    const totalAmountCents = extraLines.reduce(
      (sum, line) => sum + line.subtotalCents,
      0,
    );

    // Map to response format
    const charges = extraLines.map((line) => ({
      lineId: line.id,
      description: line.description,
      quantity: Number(line.quantity),
      unitPriceCents: line.unitPriceCents,
      subtotalCents: line.subtotalCents,
      vatCents: line.vatCents,
      totalCents: line.totalCents,
      accountCode: line.accountCode,
    }));

    this.logger.log(
      `Found ${charges.length} ad-hoc charges for invoice ${invoiceId} totaling R${(totalAmountCents / 100).toFixed(2)}`,
    );

    return {
      invoiceId,
      charges,
      totalCharges: charges.length,
      totalAmountCents,
    };
  }

  /**
   * Recalculate invoice totals from all line items
   *
   * @param invoiceId - Invoice ID
   * @returns Calculated totals
   * @private
   */
  private async recalculateInvoiceTotals(invoiceId: string): Promise<{
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
  }> {
    const lines = await this.invoiceLineRepo.findByInvoice(invoiceId);

    let subtotal = new Decimal(0);
    let totalVat = new Decimal(0);

    for (const line of lines) {
      subtotal = subtotal.add(line.subtotalCents);
      totalVat = totalVat.add(line.vatCents);
    }

    const subtotalCents = subtotal
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    const vatCents = totalVat
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    const totalCents = subtotalCents + vatCents;

    return {
      subtotalCents,
      vatCents,
      totalCents,
    };
  }
}
