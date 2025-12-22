/**
 * Irp5Service - IRP5 Certificate Generation Service
 * TASK-SARS-016
 *
 * Generates South African IRP5 employee tax certificates.
 * Aggregates year-to-date payroll data for the tax year.
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PayrollStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayeService } from './paye.service';
import {
  Irp5Certificate,
  Irp5Fields,
  Irp5YtdTotals,
  Irp5ValidationResult,
  GenerateIrp5Dto,
  Irp5EmployeeDetails,
  Irp5EmployerDetails,
  Irp5TaxPeriod,
} from '../dto/irp5.dto';
import { IRP5_CONSTANTS, TAX_YEAR_CONFIG } from '../constants/irp5.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class Irp5Service {
  private readonly logger = new Logger(Irp5Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payeService: PayeService,
  ) {}

  /**
   * Generate an IRP5 certificate for an employee
   *
   * @param dto - Generation parameters
   * @returns IRP5 certificate
   */
  async generateIrp5(dto: GenerateIrp5Dto): Promise<Irp5Certificate> {
    const { staffId, taxYear } = dto;

    this.logger.log(`Generating IRP5 for staff ${staffId} tax year ${taxYear}`);

    // Step 1: Validate tax year format
    if (!IRP5_CONSTANTS.TAX_YEAR_FORMAT_REGEX.test(taxYear)) {
      throw new Error(
        `IRP5 generation failed: Invalid tax year format "${taxYear}" (expected YYYY)`,
      );
    }

    // Step 2: Get staff record with tenant
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: { tenant: true },
    });

    if (!staff) {
      throw new Error(`IRP5 generation failed: Staff ${staffId} not found`);
    }

    // Step 3: Get tax year date range
    const { startDate, endDate } = this.getTaxYearDates(taxYear);

    // Step 4: Get all paid payroll records for tax year
    const payrolls = await this.prisma.payroll.findMany({
      where: {
        staffId,
        status: PayrollStatus.PAID,
        payPeriodStart: {
          gte: startDate,
        },
        payPeriodEnd: {
          lte: endDate,
        },
      },
      orderBy: {
        payPeriodStart: 'asc',
      },
    });

    if (payrolls.length === 0) {
      throw new Error(
        `IRP5 generation failed: No paid payroll records for tax year ${taxYear}`,
      );
    }

    // Step 5: Calculate year-to-date totals
    const ytdTotals = this.calculateYtd(payrolls);

    // Step 6: Build employee details
    const employeeDetails: Irp5EmployeeDetails = {
      employeeNumber: staff.employeeNumber,
      firstName: staff.firstName,
      lastName: staff.lastName,
      idNumber: staff.idNumber,
      taxNumber: staff.taxNumber,
      dateOfBirth: staff.dateOfBirth,
    };

    // Step 7: Build employer details
    const employerDetails: Irp5EmployerDetails = {
      name: staff.tenant.tradingName || staff.tenant.name,
      payeReference: staff.tenant.registrationNumber,
      registrationNumber: staff.tenant.registrationNumber,
    };

    // Step 8: Build tax period
    const taxPeriod: Irp5TaxPeriod = {
      startDate,
      endDate,
      periodsWorked: ytdTotals.periodCount,
    };

    // Step 9: Populate IRP5 fields
    const fields = this.populateFields(ytdTotals);

    // Step 10: Build certificate
    const certificate: Irp5Certificate = {
      certificateId: `${staff.tenantId}-${staff.id}-${taxYear}`,
      tenantId: staff.tenantId,
      staffId: staff.id,
      taxYear,
      employeeDetails,
      employerDetails,
      taxPeriod,
      fields,
      totalRemunerationCents: ytdTotals.totalGrossCents,
      totalPayeCents: ytdTotals.totalPayeCents,
      totalUifCents: ytdTotals.totalUifCents,
      generatedAt: new Date(),
    };

    // Step 11: Validate certificate
    const validationResult = this.validateForSubmission(certificate);
    if (!validationResult.isValid) {
      this.logger.warn(
        `IRP5 validation errors: ${validationResult.errors.join(', ')}`,
      );
    }
    if (validationResult.warnings.length > 0) {
      this.logger.warn(
        `IRP5 validation warnings: ${validationResult.warnings.join(', ')}`,
      );
    }

    this.logger.log(`IRP5 generated: ${certificate.certificateId}`);
    return certificate;
  }

  /**
   * Calculate year-to-date totals from payroll records
   */
  calculateYtd(
    payrolls: {
      basicSalaryCents: number;
      overtimeCents: number;
      bonusCents: number;
      otherEarningsCents: number;
      grossSalaryCents: number;
      payeCents: number;
      uifEmployeeCents: number;
      medicalAidCreditCents: number;
    }[],
  ): Irp5YtdTotals {
    let totalBasicCents = 0;
    let totalOvertimeCents = 0;
    let totalBonusCents = 0;
    let totalOtherEarningsCents = 0;
    let totalGrossCents = 0;
    let totalPayeCents = 0;
    let totalUifCents = 0;
    let totalMedicalCreditsCents = 0;

    for (const payroll of payrolls) {
      totalBasicCents += payroll.basicSalaryCents;
      totalOvertimeCents += payroll.overtimeCents;
      totalBonusCents += payroll.bonusCents;
      totalOtherEarningsCents += payroll.otherEarningsCents;
      totalGrossCents += payroll.grossSalaryCents;
      totalPayeCents += payroll.payeCents;
      totalUifCents += payroll.uifEmployeeCents;
      totalMedicalCreditsCents += payroll.medicalAidCreditCents;
    }

    return {
      totalBasicCents,
      totalOvertimeCents,
      totalBonusCents,
      totalOtherEarningsCents,
      totalGrossCents,
      totalPayeCents,
      totalUifCents,
      totalMedicalCreditsCents,
      periodCount: payrolls.length,
    };
  }

  /**
   * Populate IRP5 code fields from YTD totals
   */
  populateFields(ytdTotals: Irp5YtdTotals): Irp5Fields {
    return {
      code3601Cents: ytdTotals.totalBasicCents,
      code3602Cents: ytdTotals.totalOvertimeCents,
      code3605Cents: ytdTotals.totalOtherEarningsCents, // Other earnings as allowances
      code3606Cents: ytdTotals.totalBonusCents,
      code3615Cents: ytdTotals.totalGrossCents, // Total remuneration
      code3696Cents: ytdTotals.totalPayeCents, // PAYE deducted
      code3701Cents: 0, // Pension (not tracked in current schema)
      code3702Cents: 0, // Retirement annuity (not tracked)
      code3713Cents: 0, // Medical aid contributions (not tracked)
      code3714Cents: ytdTotals.totalMedicalCreditsCents, // Medical credits
      code3810Cents: ytdTotals.totalUifCents, // UIF employee
    };
  }

  /**
   * Validate IRP5 certificate for submission
   */
  validateForSubmission(certificate: Irp5Certificate): Irp5ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate employee tax number
    if (!certificate.employeeDetails.taxNumber) {
      errors.push('Employee tax number is required for IRP5 submission');
    }

    // Validate ID number format (13 digits)
    if (
      !IRP5_CONSTANTS.SA_ID_NUMBER_REGEX.test(
        certificate.employeeDetails.idNumber,
      )
    ) {
      errors.push('Valid SA ID number (13 digits) is required');
    }

    // Validate employer PAYE reference
    if (!certificate.employerDetails.payeReference) {
      errors.push('Employer PAYE reference is required');
    }

    // Validate remuneration is positive
    if (certificate.totalRemunerationCents <= 0) {
      warnings.push('Total remuneration is zero or negative');
    }

    // Validate field consistency: 3615 should equal sum of income codes
    const calculatedTotal =
      certificate.fields.code3601Cents +
      certificate.fields.code3602Cents +
      certificate.fields.code3605Cents +
      certificate.fields.code3606Cents;

    if (calculatedTotal !== certificate.fields.code3615Cents) {
      errors.push(
        `Code 3615 (R${(certificate.fields.code3615Cents / 100).toFixed(2)}) does not match sum of income codes (R${(calculatedTotal / 100).toFixed(2)})`,
      );
    }

    // Validate periods worked
    if (certificate.taxPeriod.periodsWorked > 12) {
      warnings.push(
        `More than 12 pay periods (${certificate.taxPeriod.periodsWorked}) - verify data`,
      );
    }

    // Check for high PAYE rate
    if (certificate.totalRemunerationCents > 0) {
      const payeRate =
        certificate.totalPayeCents / certificate.totalRemunerationCents;
      if (payeRate > 0.45) {
        warnings.push('PAYE rate exceeds 45% - verify calculations');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get tax year date range
   * SA tax year: March 1 (year-1) to February 28/29 (year)
   *
   * @param taxYear - Tax year (e.g., "2025" means Mar 2024 - Feb 2025)
   */
  getTaxYearDates(taxYear: string): { startDate: Date; endDate: Date } {
    const year = parseInt(taxYear, 10);

    // Tax year 2025 = March 1, 2024 to February 28/29, 2025
    const startDate = new Date(
      year - 1,
      TAX_YEAR_CONFIG.START_MONTH,
      TAX_YEAR_CONFIG.START_DAY,
    );

    // Get last day of February
    // Setting date to 0 of next month gives last day of previous month
    const endDate = new Date(year, TAX_YEAR_CONFIG.END_MONTH + 1, 0);

    return { startDate, endDate };
  }

  /**
   * Check if a year is a leap year
   */
  isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /**
   * Generate IRP5 certificates for all employees in a tax year
   * Returns array of certificates
   */
  async generateBulkIrp5(
    tenantId: string,
    taxYear: string,
  ): Promise<Irp5Certificate[]> {
    this.logger.log(
      `Generating bulk IRP5 for tenant ${tenantId} tax year ${taxYear}`,
    );

    // Get all staff with paid payrolls in the tax year
    const { startDate, endDate } = this.getTaxYearDates(taxYear);

    const staffWithPayrolls = await this.prisma.staff.findMany({
      where: {
        tenantId,
        payrolls: {
          some: {
            status: PayrollStatus.PAID,
            payPeriodStart: { gte: startDate },
            payPeriodEnd: { lte: endDate },
          },
        },
      },
    });

    const certificates: Irp5Certificate[] = [];
    const errors: string[] = [];

    for (const staff of staffWithPayrolls) {
      try {
        const certificate = await this.generateIrp5({
          staffId: staff.id,
          taxYear,
        });
        certificates.push(certificate);
      } catch (error) {
        errors.push(
          `Staff ${staff.firstName} ${staff.lastName}: ${(error as Error).message}`,
        );
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Bulk IRP5 errors: ${errors.join('; ')}`);
    }

    this.logger.log(`Generated ${certificates.length} IRP5 certificates`);
    return certificates;
  }
}
