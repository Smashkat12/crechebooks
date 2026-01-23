/**
 * VatAdjustmentService - VAT201 Adjustment Fields (7-13) Service
 * TASK-SARS-002
 *
 * Manages VAT adjustments for South African VAT201 returns.
 * Supports fields 7-13 of the VAT201 form:
 * - Field 7: Change in use adjustments (Output)
 * - Field 8: Change in use adjustments (Input)
 * - Field 9: Other adjustments to output tax
 * - Field 10: Other adjustments to input tax
 * - Field 11: Bad debts written off
 * - Field 12: Bad debts recovered
 * - Field 13: Capital goods scheme adjustments
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { VatAdjustmentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateVatAdjustmentDto,
  VoidVatAdjustmentDto,
  VatAdjustmentAggregation,
  GetAdjustmentsForPeriodDto,
  VatAdjustmentValidation,
  VAT_ADJUSTMENT_FIELD_MAP,
} from '../dto/vat-adjustment.dto';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Validation constants for VAT adjustments
 */
const VAT_ADJUSTMENT_CONSTANTS = {
  /** Maximum adjustment amount (R10 million in cents) */
  MAX_ADJUSTMENT_CENTS: 1_000_000_000,
  /** Minimum adjustment amount (R1 in cents) */
  MIN_ADJUSTMENT_CENTS: 100,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Maximum reference length */
  MAX_REFERENCE_LENGTH: 100,
};

@Injectable()
export class VatAdjustmentService {
  private readonly logger = new Logger(VatAdjustmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new VAT adjustment entry
   *
   * @param dto - Adjustment creation parameters
   * @returns Created VatAdjustment record
   * @throws BadRequestException if validation fails
   */
  async createAdjustment(dto: CreateVatAdjustmentDto) {
    this.logger.log(
      `Creating VAT adjustment: tenant=${dto.tenantId}, type=${dto.adjustmentType}, amount=${dto.amountCents}`,
    );

    // Validate the adjustment
    const validation = this.validateAdjustment(dto);
    if (!validation.isValid) {
      throw new BadRequestException(
        `VAT adjustment validation failed: ${validation.errors.join(', ')}`,
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      this.logger.warn(
        `VAT adjustment warnings: ${validation.warnings.join(', ')}`,
      );
    }

    // Create the adjustment
    const adjustment = await this.prisma.vatAdjustment.create({
      data: {
        tenantId: dto.tenantId!,
        adjustmentType: dto.adjustmentType,
        amountCents: dto.amountCents,
        adjustmentDate: dto.adjustmentDate,
        description: dto.description,
        reference: dto.reference,
        invoiceId: dto.invoiceId,
        transactionId: dto.transactionId,
        notes: dto.notes,
        createdBy: dto.createdBy,
      },
    });

    this.logger.log(`VAT adjustment created: ${adjustment.id}`);
    return adjustment;
  }

  /**
   * Void an existing VAT adjustment
   *
   * @param dto - Void parameters
   * @returns Updated VatAdjustment record
   * @throws NotFoundException if adjustment not found
   * @throws BadRequestException if already voided
   */
  async voidAdjustment(dto: VoidVatAdjustmentDto) {
    this.logger.log(
      `Voiding VAT adjustment: id=${dto.adjustmentId}, tenant=${dto.tenantId}`,
    );

    // Find the adjustment
    const adjustment = await this.prisma.vatAdjustment.findFirst({
      where: {
        id: dto.adjustmentId,
        tenantId: dto.tenantId!,
      },
    });

    if (!adjustment) {
      throw new NotFoundException(
        `VAT adjustment not found: ${dto.adjustmentId}`,
      );
    }

    if (adjustment.isVoided) {
      throw new BadRequestException(
        `VAT adjustment already voided: ${dto.adjustmentId}`,
      );
    }

    // Void the adjustment
    const updated = await this.prisma.vatAdjustment.update({
      where: { id: dto.adjustmentId },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedBy: dto.voidedBy,
        voidReason: dto.voidReason,
      },
    });

    this.logger.log(`VAT adjustment voided: ${dto.adjustmentId}`);
    return updated;
  }

  /**
   * Get aggregated adjustments for a VAT period
   * Sums adjustments by type for VAT201 fields 7-13
   *
   * @param dto - Period query parameters
   * @returns Aggregated adjustment totals mapped to VAT201 fields
   */
  async getAdjustmentsForPeriod(
    dto: GetAdjustmentsForPeriodDto,
  ): Promise<VatAdjustmentAggregation> {
    const { tenantId, periodStart, periodEnd } = dto;

    this.logger.log(
      `Getting VAT adjustments for tenant ${tenantId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Validate period
    if (periodStart > periodEnd) {
      throw new BadRequestException(
        'Period start date must be before or equal to period end date',
      );
    }

    // Get all non-voided adjustments for the period
    const adjustments = await this.prisma.vatAdjustment.findMany({
      where: {
        tenantId: tenantId!,
        adjustmentDate: {
          gte: periodStart,
          lte: periodEnd,
        },
        isVoided: false,
      },
    });

    // Initialize aggregation with zeros
    const aggregation: VatAdjustmentAggregation = {
      field7ChangeInUseOutputCents: 0,
      field8ChangeInUseInputCents: 0,
      field9OtherOutputCents: 0,
      field10OtherInputCents: 0,
      field11BadDebtsWrittenOffCents: 0,
      field12BadDebtsRecoveredCents: 0,
      field13CapitalGoodsSchemeCents: 0,
      adjustmentCount: adjustments.length,
    };

    // Sum by type using Decimal.js for precision
    const sums: Record<VatAdjustmentType, Decimal> = {
      CHANGE_IN_USE_OUTPUT: new Decimal(0),
      CHANGE_IN_USE_INPUT: new Decimal(0),
      OTHER_OUTPUT: new Decimal(0),
      OTHER_INPUT: new Decimal(0),
      BAD_DEBTS_WRITTEN_OFF: new Decimal(0),
      BAD_DEBTS_RECOVERED: new Decimal(0),
      CAPITAL_GOODS_SCHEME: new Decimal(0),
    };

    for (const adjustment of adjustments) {
      sums[adjustment.adjustmentType] = sums[adjustment.adjustmentType].plus(
        adjustment.amountCents,
      );
    }

    // Map to VAT201 fields
    aggregation.field7ChangeInUseOutputCents =
      sums.CHANGE_IN_USE_OUTPUT.round().toNumber();
    aggregation.field8ChangeInUseInputCents =
      sums.CHANGE_IN_USE_INPUT.round().toNumber();
    aggregation.field9OtherOutputCents = sums.OTHER_OUTPUT.round().toNumber();
    aggregation.field10OtherInputCents = sums.OTHER_INPUT.round().toNumber();
    aggregation.field11BadDebtsWrittenOffCents =
      sums.BAD_DEBTS_WRITTEN_OFF.round().toNumber();
    aggregation.field12BadDebtsRecoveredCents =
      sums.BAD_DEBTS_RECOVERED.round().toNumber();
    aggregation.field13CapitalGoodsSchemeCents =
      sums.CAPITAL_GOODS_SCHEME.round().toNumber();

    this.logger.log(
      `VAT adjustments aggregated: ${aggregation.adjustmentCount} adjustments found`,
    );

    return aggregation;
  }

  /**
   * Get individual adjustments for a period (for audit/review)
   *
   * @param dto - Period query parameters
   * @returns Array of VatAdjustment records
   */
  async listAdjustmentsForPeriod(dto: GetAdjustmentsForPeriodDto) {
    const { tenantId, periodStart, periodEnd } = dto;

    return this.prisma.vatAdjustment.findMany({
      where: {
        tenantId: tenantId!,
        adjustmentDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: [{ adjustmentDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get adjustment by ID
   *
   * @param id - Adjustment ID
   * @param tenantId - Tenant ID for isolation
   * @returns VatAdjustment or null
   */
  async getAdjustmentById(id: string, tenantId: string) {
    return this.prisma.vatAdjustment.findFirst({
      where: {
        id,
        tenantId: tenantId,
      },
    });
  }

  /**
   * Validate a VAT adjustment before creation
   *
   * @param dto - Adjustment to validate
   * @returns Validation result with errors and warnings
   */
  validateAdjustment(dto: CreateVatAdjustmentDto): VatAdjustmentValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validations
    if (!dto.tenantId!) {
      errors.push('Tenant ID is required');
    }

    if (!dto.adjustmentType) {
      errors.push('Adjustment type is required');
    }

    if (!dto.createdBy) {
      errors.push('Created by user ID is required');
    }

    // Amount validation
    if (dto.amountCents === undefined || dto.amountCents === null) {
      errors.push('Amount is required');
    } else if (dto.amountCents < 0) {
      errors.push(
        'Amount must be positive (sign determined by adjustment type)',
      );
    } else if (
      dto.amountCents < VAT_ADJUSTMENT_CONSTANTS.MIN_ADJUSTMENT_CENTS
    ) {
      errors.push(
        `Amount must be at least ${VAT_ADJUSTMENT_CONSTANTS.MIN_ADJUSTMENT_CENTS / 100} Rands`,
      );
    } else if (
      dto.amountCents > VAT_ADJUSTMENT_CONSTANTS.MAX_ADJUSTMENT_CENTS
    ) {
      errors.push(
        `Amount exceeds maximum of ${VAT_ADJUSTMENT_CONSTANTS.MAX_ADJUSTMENT_CENTS / 100} Rands`,
      );
    }

    // Date validation
    if (!dto.adjustmentDate) {
      errors.push('Adjustment date is required');
    } else {
      const adjustmentDate = new Date(dto.adjustmentDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (adjustmentDate > today) {
        errors.push('Adjustment date cannot be in the future');
      }
    }

    // Description validation
    if (!dto.description || dto.description.trim().length === 0) {
      errors.push('Description is required');
    } else if (
      dto.description.length > VAT_ADJUSTMENT_CONSTANTS.MAX_DESCRIPTION_LENGTH
    ) {
      errors.push(
        `Description exceeds maximum length of ${VAT_ADJUSTMENT_CONSTANTS.MAX_DESCRIPTION_LENGTH} characters`,
      );
    }

    // Reference validation (optional but if provided, must be valid)
    if (
      dto.reference &&
      dto.reference.length > VAT_ADJUSTMENT_CONSTANTS.MAX_REFERENCE_LENGTH
    ) {
      errors.push(
        `Reference exceeds maximum length of ${VAT_ADJUSTMENT_CONSTANTS.MAX_REFERENCE_LENGTH} characters`,
      );
    }

    // Business rule warnings
    if (dto.adjustmentType === 'BAD_DEBTS_WRITTEN_OFF' && !dto.invoiceId) {
      warnings.push(
        'Bad debts written off should reference an invoice for audit trail',
      );
    }

    if (dto.adjustmentType === 'BAD_DEBTS_RECOVERED' && !dto.invoiceId) {
      warnings.push(
        'Bad debts recovered should reference an invoice for audit trail',
      );
    }

    // Large amount warning
    const largeAmountThreshold = 100_000_00; // R100,000 in cents
    if (dto.amountCents > largeAmountThreshold) {
      warnings.push(
        `Large adjustment amount (${dto.amountCents / 100} Rands) - please verify`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate net VAT adjustment effect for VAT201
   * Positive = increases VAT payable, Negative = decreases VAT payable
   *
   * @param aggregation - Aggregated adjustments
   * @returns Net adjustment in cents
   */
  calculateNetAdjustmentEffect(aggregation: VatAdjustmentAggregation): number {
    // Output adjustments affect VAT payable directly
    // Field 7, 9, 12: INCREASE output VAT (more to pay)
    // Field 11: DECREASE output VAT (less to pay)
    const outputEffect =
      aggregation.field7ChangeInUseOutputCents +
      aggregation.field9OtherOutputCents +
      aggregation.field12BadDebtsRecoveredCents -
      aggregation.field11BadDebtsWrittenOffCents;

    // Input adjustments reduce claimable input VAT
    // Field 8, 10: REDUCE input VAT claim (more net VAT to pay)
    const inputEffect =
      aggregation.field8ChangeInUseInputCents +
      aggregation.field10OtherInputCents;

    // Capital goods scheme can be either direction
    const capitalGoodsEffect = aggregation.field13CapitalGoodsSchemeCents;

    return outputEffect + inputEffect + capitalGoodsEffect;
  }

  /**
   * Get the VAT201 field number for an adjustment type
   *
   * @param adjustmentType - The adjustment type
   * @returns Field number (7-13)
   */
  getFieldNumber(adjustmentType: VatAdjustmentType): number {
    return VAT_ADJUSTMENT_FIELD_MAP[adjustmentType];
  }
}
