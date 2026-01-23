/**
 * Vat201Service - VAT201 Generation Service
 * TASK-SARS-014, TASK-SARS-002
 *
 * Generates South African VAT201 return documents.
 * Uses VatService for output and input VAT calculations.
 * Uses VatAdjustmentService for fields 7-13 (adjustment fields).
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { SubmissionType, SubmissionStatus, TaxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VatService } from './vat.service';
import { VatAdjustmentService } from './vat-adjustment.service';
import {
  Vat201Document,
  Vat201Fields,
  Vat201ValidationResult,
  GenerateVat201Dto,
} from '../dto/vat201.dto';
import { VatCalculationResult, VatFlaggedItem } from '../dto/vat.dto';
import { VatAdjustmentAggregation } from '../dto/vat-adjustment.dto';
import { VAT_CONSTANTS } from '../constants/vat.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class Vat201Service {
  private readonly logger = new Logger(Vat201Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vatService: VatService,
    private readonly vatAdjustmentService: VatAdjustmentService,
  ) {}

  /**
   * Generate a VAT201 return for a period
   *
   * @param dto - Generation parameters
   * @returns Created SarsSubmission record
   */
  async generateVat201(dto: GenerateVat201Dto) {
    const { tenantId, periodStart, periodEnd } = dto;

    this.logger.log(
      `Generating VAT201 for tenant ${tenantId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Step 1: Validate tenant and get details
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId! },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found`);
    }

    if (tenant.taxStatus !== TaxStatus.VAT_REGISTERED) {
      throw new ForbiddenException(
        `VAT201 generation requires VAT registration. Please register for VAT in Settings.`,
      );
    }

    if (!tenant.vatNumber) {
      throw new BadRequestException(
        `VAT number is required. Please add your VAT number in Settings.`,
      );
    }

    // Step 2: Calculate output VAT (sales)
    const outputVat = await this.vatService.calculateOutputVat(
      tenantId!,
      periodStart,
      periodEnd,
    );

    // Step 3: Calculate input VAT (purchases)
    const inputVat = await this.vatService.calculateInputVat(
      tenantId!,
      periodStart,
      periodEnd,
    );

    // Step 4: Get VAT adjustments for fields 7-13 (TASK-SARS-002)
    const adjustments = await this.vatAdjustmentService.getAdjustmentsForPeriod(
      {
        tenantId: tenantId!,
        periodStart,
        periodEnd,
      },
    );

    // Step 5: Get flagged items
    const flaggedItems = await this.vatService.getFlaggedItems(
      tenantId!,
      periodStart,
      periodEnd,
    );

    // Step 6: Populate VAT201 fields with adjustments
    const fields = this.populateFields(outputVat, inputVat, adjustments);

    // Step 7: Generate document structure
    const document = this.generateDocument(
      tenantId!,
      tenant.vatNumber,
      periodStart,
      periodEnd,
      fields,
      flaggedItems,
    );

    // Step 8: Validate document
    const validationResult = this.validateSubmission(document);
    if (!validationResult.isValid) {
      this.logger.warn(
        `VAT201 validation issues: ${validationResult.errors.join(', ')}`,
      );
    }
    if (validationResult.warnings.length > 0) {
      this.logger.warn(
        `VAT201 validation warnings: ${validationResult.warnings.join(', ')}`,
      );
    }

    // Step 9: Calculate deadline (last business day of month following period end)
    const deadline = this.calculateDeadline(periodEnd);

    // Step 10: Check for existing submission and upsert
    const existing = await this.prisma.sarsSubmission.findFirst({
      where: {
        tenantId: tenantId!,
        submissionType: SubmissionType.VAT201,
        periodStart,
      },
    });

    if (existing) {
      // If already submitted, return existing without modification
      if (existing.status === SubmissionStatus.SUBMITTED) {
        this.logger.log(`VAT201 already submitted: ${existing.id}`);
        return existing;
      }

      // Update existing DRAFT with fresh calculations
      const submission = await this.prisma.sarsSubmission.update({
        where: { id: existing.id },
        data: {
          periodEnd,
          deadline,
          outputVatCents: outputVat.vatAmountCents,
          inputVatCents: inputVat.vatAmountCents,
          netVatCents: document.netVatCents,
          documentData: JSON.parse(JSON.stringify(document)) as object,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`VAT201 updated: ${submission.id}`);
      return submission;
    }

    // Create new submission
    const submission = await this.prisma.sarsSubmission.create({
      data: {
        tenantId: tenantId!,
        submissionType: SubmissionType.VAT201,
        periodStart,
        periodEnd,
        deadline,
        outputVatCents: outputVat.vatAmountCents,
        inputVatCents: inputVat.vatAmountCents,
        netVatCents: document.netVatCents,
        status: SubmissionStatus.DRAFT,
        documentData: JSON.parse(JSON.stringify(document)) as object,
      },
    });

    this.logger.log(`VAT201 generated: ${submission.id}`);
    return submission;
  }

  /**
   * Populate VAT201 fields from calculation results and adjustments
   * TASK-SARS-002: Now includes real adjustment data for fields 7-13
   *
   * @param outputVat - Output VAT calculation result
   * @param inputVat - Input VAT calculation result
   * @param adjustments - Aggregated adjustments for fields 7-13
   * @returns Populated VAT201 fields
   */
  populateFields(
    outputVat: VatCalculationResult,
    inputVat: VatCalculationResult,
    adjustments: VatAdjustmentAggregation,
  ): Vat201Fields {
    // Base output and input VAT
    const field4TotalOutput = outputVat.vatAmountCents;
    const field5Input = inputVat.vatAmountCents;

    // TASK-SARS-002: Calculate adjusted totals
    // Output adjustments: Fields 7, 9, 12 increase output; Field 11 decreases output
    const outputAdjustments =
      adjustments.field7ChangeInUseOutputCents +
      adjustments.field9OtherOutputCents +
      adjustments.field12BadDebtsRecoveredCents -
      adjustments.field11BadDebtsWrittenOffCents;

    // Input adjustments: Fields 8, 10 reduce claimable input VAT
    const inputAdjustments =
      adjustments.field8ChangeInUseInputCents +
      adjustments.field10OtherInputCents;

    // Capital goods scheme: Can be positive (increase) or negative (decrease)
    const capitalGoodsAdjustment = adjustments.field13CapitalGoodsSchemeCents;

    // Calculate adjusted totals
    const adjustedOutputTotal =
      field4TotalOutput + outputAdjustments + capitalGoodsAdjustment;
    const adjustedInputDeductible = Math.max(0, field5Input - inputAdjustments);

    // Net VAT = Adjusted Output - Adjusted Deductible Input
    const netVat = adjustedOutputTotal - adjustedInputDeductible;

    return {
      // Fields 1-3: Output tax breakdown
      field1OutputStandardCents: outputVat.standardRatedCents,
      field2OutputZeroRatedCents: 0, // Zero-rated = 0 VAT
      field3OutputExemptCents: 0, // Exempt = 0 VAT

      // Field 4: Total output tax (before adjustments)
      field4TotalOutputCents: field4TotalOutput,

      // Fields 5-6: Input tax
      field5InputTaxCents: field5Input,
      field6DeductibleInputCents: adjustedInputDeductible,

      // Fields 7-13: TASK-SARS-002 - Real adjustment data
      field7AdjustmentsCents: adjustments.field7ChangeInUseOutputCents,
      field8ImportedServicesCents: adjustments.field8ChangeInUseInputCents,
      field9BadDebtsCents: adjustments.field9OtherOutputCents,
      field10ReverseAdjustmentsCents: adjustments.field10OtherInputCents,
      field11CreditTransferCents: adjustments.field11BadDebtsWrittenOffCents,
      field12VendorCents: adjustments.field12BadDebtsRecoveredCents,
      field13ProvisionalCents: adjustments.field13CapitalGoodsSchemeCents,

      // Fields 14-19: Totals
      field14TotalCents: adjustedOutputTotal,
      field15NetVatCents: netVat,
      field16PaymentsCents: 0, // Future: Track payments made
      field17InterestCents: 0, // Future: Calculate interest if late
      field18PenaltyCents: 0, // Future: Calculate penalties if applicable
      field19TotalDueCents: netVat,
    };
  }

  /**
   * Validate VAT201 submission
   */
  validateSubmission(document: Vat201Document): Vat201ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate VAT number format (10 digits)
    if (!VAT_CONSTANTS.VAT_NUMBER_REGEX.test(document.vatNumber)) {
      errors.push('Invalid VAT number format (must be 10 digits)');
    }

    // Validate period dates
    if (document.periodStart >= document.periodEnd) {
      errors.push('Invalid period: start date must be before end date');
    }

    // Check for flagged items
    if (document.flaggedItems.length > 0) {
      const errorCount = document.flaggedItems.filter(
        (f) => f.severity === 'ERROR',
      ).length;
      const warningCount = document.flaggedItems.length - errorCount;

      if (errorCount > 0) {
        warnings.push(`${errorCount} items have errors requiring resolution`);
      }
      if (warningCount > 0) {
        warnings.push(`${warningCount} items require review`);
      }
    }

    // Validate net VAT is reasonable
    const netVatRands = Math.abs(document.netVatCents) / 100;
    if (netVatRands > 1000000) {
      warnings.push('Net VAT amount exceeds R1,000,000 - please verify');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Generate document structure
   */
  generateDocument(
    tenantId: string,
    vatNumber: string,
    periodStart: Date,
    periodEnd: Date,
    fields: Vat201Fields,
    flaggedItems: VatFlaggedItem[],
  ): Vat201Document {
    const netVatCents = fields.field19TotalDueCents;

    return {
      submissionId: uuidv4(),
      tenantId: tenantId,
      vatNumber,
      periodStart,
      periodEnd,
      fields,
      netVatCents,
      isDueToSars: netVatCents > 0,
      isRefundDue: netVatCents < 0,
      flaggedItems,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate net VAT from fields
   */
  calculateNetVat(fields: Vat201Fields): number {
    // Simplified: Output VAT - Input VAT
    return fields.field4TotalOutputCents - fields.field5InputTaxCents;
  }

  /**
   * Calculate submission deadline
   * Last business day of month following period end
   */
  private calculateDeadline(periodEnd: Date): Date {
    // Move to next month
    const deadline = new Date(periodEnd);
    deadline.setMonth(deadline.getMonth() + 1);

    // Set to last day of that month
    deadline.setMonth(deadline.getMonth() + 1);
    deadline.setDate(0);

    // Adjust for weekends
    const dayOfWeek = deadline.getDay();
    if (dayOfWeek === 0) {
      deadline.setDate(deadline.getDate() - 2); // Sunday -> Friday
    } else if (dayOfWeek === 6) {
      deadline.setDate(deadline.getDate() - 1); // Saturday -> Friday
    }

    return deadline;
  }
}
