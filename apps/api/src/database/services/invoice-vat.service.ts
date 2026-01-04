/**
 * Invoice VAT Service
 * TASK-BILL-018: VAT Calculation for VAT-Registered Creches
 *
 * @module database/services/invoice-vat
 * @description Handles VAT calculations for invoices, including:
 * - Determining if tenant is VAT registered and invoice date is after registration
 * - Calculating VAT at SA standard rate (15%)
 * - Tracking cumulative turnover for R1M threshold monitoring
 * - Providing threshold alerts (approaching, imminent, exceeded)
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 * CRITICAL: VAT only applies to invoices issued AFTER vatRegistrationDate.
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { TenantRepository } from '../repositories/tenant.repository';
import { AuditLogService } from './audit-log.service';
import { TaxStatus, VatThresholdAlertLevel } from '../entities/tenant.entity';
import { ValidationException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * VAT calculation result for an invoice
 */
export interface InvoiceVatCalculationResult {
  /** Invoice subtotal before VAT (cents) */
  subtotal: Decimal;
  /** VAT rate applied (15 for 15%, 0 if not registered) */
  vatRate: number;
  /** VAT amount (cents) */
  vatAmount: Decimal;
  /** Total including VAT (cents) */
  total: Decimal;
  /** Whether tenant is VAT registered */
  isVatRegistered: boolean;
  /** Whether VAT was applied (registered AND after registration date) */
  vatApplied: boolean;
}

/**
 * VAT threshold check result
 */
export interface VatThresholdResult {
  /** Current cumulative turnover (cents) */
  currentTurnoverCents: bigint;
  /** VAT registration threshold (cents) - R1,000,000 */
  thresholdCents: bigint;
  /** Percentage progress toward threshold (0-100+) */
  percentToThreshold: number;
  /** Alert level based on proximity to threshold */
  alertLevel: VatThresholdAlertLevel;
  /** Human-readable message */
  message: string;
}

/** SA VAT rate: 15% */
const VAT_RATE = 15;
const VAT_RATE_DECIMAL = new Decimal('0.15');

/** VAT registration threshold: R1,000,000 = 100,000,000 cents */
const VAT_THRESHOLD_CENTS = BigInt(100_000_000);

/** Alert thresholds in cents */
const APPROACHING_THRESHOLD_CENTS = BigInt(80_000_000); // R800,000
const IMMINENT_THRESHOLD_CENTS = BigInt(95_000_000); // R950,000

@Injectable()
export class InvoiceVatService {
  private readonly logger = new Logger(InvoiceVatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRepo: TenantRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Calculate VAT for an invoice based on tenant registration status
   *
   * @param tenantId - Tenant ID
   * @param subtotalCents - Invoice subtotal in cents
   * @param invoiceDate - Date of the invoice
   * @returns VAT calculation result
   *
   * @throws Error if tenant not found
   *
   * @example
   * const result = await invoiceVatService.calculateInvoiceVat(
   *   'tenant-123',
   *   new Decimal(100000), // R1000.00
   *   new Date('2025-01-15')
   * );
   * // result.vatAmount = 15000 (R150.00) if VAT registered
   */
  async calculateInvoiceVat(
    tenantId: string,
    subtotalCents: Decimal,
    invoiceDate: Date,
  ): Promise<InvoiceVatCalculationResult> {
    this.logger.debug(
      `Calculating VAT for tenant ${tenantId}, subtotal ${subtotalCents.toString()} cents, date ${invoiceDate.toISOString()}`,
    );

    // Get tenant VAT status
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const isVatRegistered = tenant.taxStatus === TaxStatus.VAT_REGISTERED;

    // Check if invoice date is after registration date
    let vatApplied = false;
    if (isVatRegistered && tenant.vatRegistrationDate) {
      const registrationDate = new Date(tenant.vatRegistrationDate);
      registrationDate.setHours(0, 0, 0, 0);
      const invDate = new Date(invoiceDate);
      invDate.setHours(0, 0, 0, 0);
      vatApplied = invDate >= registrationDate;
    } else if (isVatRegistered && !tenant.vatRegistrationDate) {
      // If registered but no date set, assume VAT applies (legacy)
      vatApplied = true;
    }

    // Calculate VAT if applicable
    let vatAmount = new Decimal(0);
    let vatRate = 0;

    if (vatApplied) {
      vatAmount = subtotalCents
        .mul(VAT_RATE_DECIMAL)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
      vatRate = VAT_RATE;
    }

    const total = subtotalCents.add(vatAmount);

    this.logger.debug(
      `VAT calculation: registered=${isVatRegistered}, applied=${vatApplied}, ` +
        `subtotal=${subtotalCents.toString()}, vat=${vatAmount.toString()}, total=${total.toString()}`,
    );

    return {
      subtotal: subtotalCents,
      vatRate,
      vatAmount,
      total,
      isVatRegistered,
      vatApplied,
    };
  }

  /**
   * Check if tenant is approaching VAT registration threshold
   *
   * @param tenantId - Tenant ID
   * @returns Threshold status with alert level
   *
   * Alert levels:
   * - NONE: Below R800,000
   * - APPROACHING: R800,000 - R949,999
   * - IMMINENT: R950,000 - R999,999
   * - EXCEEDED: R1,000,000+
   */
  async checkVatThreshold(tenantId: string): Promise<VatThresholdResult> {
    this.logger.debug(`Checking VAT threshold for tenant ${tenantId}`);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const currentTurnover = tenant.cumulativeTurnoverCents ?? BigInt(0);
    const percentToThreshold = Number(
      (currentTurnover * BigInt(100)) / VAT_THRESHOLD_CENTS,
    );

    let alertLevel: VatThresholdAlertLevel;
    let message: string;

    if (currentTurnover >= VAT_THRESHOLD_CENTS) {
      alertLevel = VatThresholdAlertLevel.EXCEEDED;
      message =
        'CRITICAL: Annual turnover has exceeded R1,000,000. VAT registration is mandatory.';
    } else if (currentTurnover >= IMMINENT_THRESHOLD_CENTS) {
      alertLevel = VatThresholdAlertLevel.IMMINENT;
      const remaining = VAT_THRESHOLD_CENTS - currentTurnover;
      const remainingRand = Number(remaining) / 100;
      message = `WARNING: Only R${remainingRand.toLocaleString()} away from VAT registration threshold. Consider registering now.`;
    } else if (currentTurnover >= APPROACHING_THRESHOLD_CENTS) {
      alertLevel = VatThresholdAlertLevel.APPROACHING;
      const remaining = VAT_THRESHOLD_CENTS - currentTurnover;
      const remainingRand = Number(remaining) / 100;
      message = `NOTICE: R${remainingRand.toLocaleString()} remaining until VAT registration threshold.`;
    } else {
      alertLevel = VatThresholdAlertLevel.NONE;
      const remaining = VAT_THRESHOLD_CENTS - currentTurnover;
      const remainingRand = Number(remaining) / 100;
      message = `Turnover is R${remainingRand.toLocaleString()} below VAT registration threshold.`;
    }

    this.logger.debug(
      `Threshold check: turnover=${currentTurnover.toString()}, percent=${percentToThreshold}%, level=${alertLevel}`,
    );

    return {
      currentTurnoverCents: currentTurnover,
      thresholdCents: VAT_THRESHOLD_CENTS,
      percentToThreshold,
      alertLevel,
      message,
    };
  }

  /**
   * Register tenant for VAT
   *
   * @param tenantId - Tenant ID
   * @param vatNumber - 10-digit VAT number
   * @param registrationDate - Date VAT registration becomes effective
   * @param userId - User performing the action
   *
   * @throws ValidationException if VAT number format is invalid
   */
  async registerForVat(
    tenantId: string,
    vatNumber: string,
    registrationDate: Date,
    userId?: string,
  ): Promise<void> {
    this.logger.log(
      `Registering tenant ${tenantId} for VAT with number ${vatNumber}`,
    );

    // Validate VAT number format (10 digits)
    const vatNumberClean = vatNumber.replace(/\D/g, '');
    if (vatNumberClean.length !== 10) {
      throw new ValidationException('Invalid VAT number format', [
        {
          field: 'vatNumber',
          message: 'VAT number must be 10 digits',
          value: vatNumber,
        },
      ]);
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const beforeValue = {
      taxStatus: tenant.taxStatus,
      vatNumber: tenant.vatNumber,
      vatRegistrationDate: tenant.vatRegistrationDate,
    };

    // Update tenant VAT registration
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: vatNumberClean,
        vatRegistrationDate: registrationDate,
      },
    });

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId: userId ?? 'SYSTEM',
      entityType: 'Tenant',
      entityId: tenantId,
      beforeValue,
      afterValue: {
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: vatNumberClean,
        vatRegistrationDate: registrationDate,
      },
      changeSummary: 'VAT registration activated',
    });

    this.logger.log(
      `Tenant ${tenantId} registered for VAT. Registration date: ${registrationDate.toISOString()}`,
    );
  }

  /**
   * Update cumulative turnover for a tenant
   * Called when invoices are finalized to track threshold
   *
   * @param tenantId - Tenant ID
   * @param amountCents - Amount to add to turnover (cents)
   * @returns Updated threshold status
   */
  async updateTurnover(
    tenantId: string,
    amountCents: number,
  ): Promise<VatThresholdResult> {
    this.logger.debug(
      `Updating turnover for tenant ${tenantId} by ${amountCents} cents`,
    );

    // Atomic increment of cumulative turnover
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        cumulativeTurnoverCents: {
          increment: BigInt(amountCents),
        },
      },
    });

    // Return updated threshold status
    return this.checkVatThreshold(tenantId);
  }

  /**
   * Reset cumulative turnover (typically at financial year end)
   *
   * @param tenantId - Tenant ID
   * @param userId - User performing the action
   */
  async resetTurnover(tenantId: string, userId?: string): Promise<void> {
    this.logger.log(`Resetting turnover for tenant ${tenantId}`);

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const previousTurnover = tenant.cumulativeTurnoverCents;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        cumulativeTurnoverCents: BigInt(0),
      },
    });

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId: userId ?? 'SYSTEM',
      entityType: 'Tenant',
      entityId: tenantId,
      beforeValue: { cumulativeTurnoverCents: previousTurnover?.toString() },
      afterValue: { cumulativeTurnoverCents: '0' },
      changeSummary: 'Annual turnover reset for new financial year',
    });
  }

  /**
   * Calculate VAT from an exclusive amount
   * VAT = amount * 0.15
   *
   * @param exclusiveAmountCents - Amount excluding VAT (cents)
   * @returns VAT amount in cents
   */
  calculateVatFromExclusive(exclusiveAmountCents: number): number {
    const amount = new Decimal(exclusiveAmountCents);
    const vat = amount.mul(VAT_RATE_DECIMAL);
    return vat.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /**
   * Extract VAT from an inclusive amount
   * VAT = amount - (amount / 1.15)
   *
   * @param inclusiveAmountCents - Amount including VAT (cents)
   * @returns VAT amount in cents
   */
  extractVatFromInclusive(inclusiveAmountCents: number): number {
    const amount = new Decimal(inclusiveAmountCents);
    const exclusive = amount.div(new Decimal('1.15'));
    const vat = amount.minus(exclusive);
    return vat.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /**
   * Get the current SA VAT rate
   */
  getVatRate(): number {
    return VAT_RATE;
  }

  /**
   * Get VAT registration threshold in Rand
   */
  getVatThresholdRand(): number {
    return Number(VAT_THRESHOLD_CENTS) / 100;
  }
}
