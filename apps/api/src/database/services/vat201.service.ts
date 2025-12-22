/**
 * Vat201Service - VAT201 Generation Service
 * TASK-SARS-014
 *
 * Generates South African VAT201 return documents.
 * Uses VatService for output and input VAT calculations.
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { SubmissionType, SubmissionStatus, TaxStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VatService } from './vat.service';
import {
  Vat201Document,
  Vat201Fields,
  Vat201ValidationResult,
  GenerateVat201Dto,
} from '../dto/vat201.dto';
import { VatCalculationResult, VatFlaggedItem } from '../dto/vat.dto';
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
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error(`VAT201 generation failed: Tenant ${tenantId} not found`);
    }

    if (tenant.taxStatus !== TaxStatus.VAT_REGISTERED) {
      throw new Error(
        `VAT201 generation failed: Tenant ${tenantId} is not VAT registered`,
      );
    }

    if (!tenant.vatNumber) {
      throw new Error(
        `VAT201 generation failed: Tenant ${tenantId} has no VAT number`,
      );
    }

    // Step 2: Calculate output VAT (sales)
    const outputVat = await this.vatService.calculateOutputVat(
      tenantId,
      periodStart,
      periodEnd,
    );

    // Step 3: Calculate input VAT (purchases)
    const inputVat = await this.vatService.calculateInputVat(
      tenantId,
      periodStart,
      periodEnd,
    );

    // Step 4: Get flagged items
    const flaggedItems = await this.vatService.getFlaggedItems(
      tenantId,
      periodStart,
      periodEnd,
    );

    // Step 5: Populate VAT201 fields
    const fields = this.populateFields(outputVat, inputVat);

    // Step 6: Generate document structure
    const document = this.generateDocument(
      tenantId,
      tenant.vatNumber,
      periodStart,
      periodEnd,
      fields,
      flaggedItems,
    );

    // Step 7: Validate document
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

    // Step 8: Calculate deadline (last business day of month following period end)
    const deadline = this.calculateDeadline(periodEnd);

    // Step 9: Store submission as DRAFT
    const submission = await this.prisma.sarsSubmission.create({
      data: {
        tenantId,
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
   * Populate VAT201 fields from calculation results
   */
  populateFields(
    outputVat: VatCalculationResult,
    inputVat: VatCalculationResult,
  ): Vat201Fields {
    const field4TotalOutput = outputVat.vatAmountCents;
    const field5Input = inputVat.vatAmountCents;
    const netVat = field4TotalOutput - field5Input;

    return {
      field1OutputStandardCents: outputVat.standardRatedCents,
      field2OutputZeroRatedCents: 0, // Zero-rated = 0 VAT
      field3OutputExemptCents: 0, // Exempt = 0 VAT
      field4TotalOutputCents: field4TotalOutput,
      field5InputTaxCents: field5Input,
      field6DeductibleInputCents: field5Input,
      field7AdjustmentsCents: 0,
      field8ImportedServicesCents: 0,
      field9BadDebtsCents: 0,
      field10ReverseAdjustmentsCents: 0,
      field11CreditTransferCents: 0,
      field12VendorCents: 0,
      field13ProvisionalCents: 0,
      field14TotalCents: field4TotalOutput,
      field15NetVatCents: netVat,
      field16PaymentsCents: 0,
      field17InterestCents: 0,
      field18PenaltyCents: 0,
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
      tenantId,
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
