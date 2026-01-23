/**
 * Emp201Service - EMP201 Generation Service
 * TASK-SARS-015
 *
 * Generates South African EMP201 employer monthly reconciliation returns.
 * Aggregates payroll data for all employees and calculates PAYE, UIF, and SDL.
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import {
  SubmissionType,
  SubmissionStatus,
  PayrollStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayeService } from './paye.service';
import { UifService } from './uif.service';
import {
  Emp201Document,
  Emp201Summary,
  Emp201EmployeeRecord,
  Emp201ValidationResult,
  GenerateEmp201Dto,
} from '../dto/emp201.dto';
import {
  EMP201_CONSTANTS,
  EMP201_VALIDATION,
} from '../constants/emp201.constants';
import {
  SarsPeriodException,
  SarsTenantNotFoundException,
  SarsNoPayrollException,
} from '../../api/sars/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class Emp201Service {
  private readonly logger = new Logger(Emp201Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payeService: PayeService,
    private readonly uifService: UifService,
  ) {}

  /**
   * Generate an EMP201 return for a month
   *
   * @param dto - Generation parameters
   * @returns Created SarsSubmission record
   */
  async generateEmp201(dto: GenerateEmp201Dto) {
    const { tenantId, periodMonth } = dto;

    this.logger.log(
      `Generating EMP201 for tenant ${tenantId} period ${periodMonth}`,
    );

    // Step 1: Validate period format
    if (!EMP201_CONSTANTS.PERIOD_FORMAT_REGEX.test(periodMonth)) {
      throw new SarsPeriodException(
        `Invalid period format "${periodMonth}" (expected YYYY-MM)`,
        periodMonth,
      );
    }

    // Step 2: Get tenant details
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId! },
    });

    if (!tenant) {
      throw new SarsTenantNotFoundException(tenantId!);
    }

    // Step 3: Parse period dates
    const [year, month] = periodMonth.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month

    // Step 4: Get approved payroll records for the month
    const payrolls = await this.prisma.payroll.findMany({
      where: {
        tenantId: tenantId!,
        status: PayrollStatus.APPROVED,
        payPeriodStart: {
          gte: periodStart,
        },
        payPeriodEnd: {
          lte: periodEnd,
        },
      },
      include: {
        staff: true,
      },
      orderBy: {
        staff: {
          lastName: 'asc',
        },
      },
    });

    if (payrolls.length === 0) {
      throw new SarsNoPayrollException(periodMonth);
    }

    // Step 5: Validate employee data and build employee records
    const validationIssues: string[] = [];
    const employees: Emp201EmployeeRecord[] = [];

    let totalGrossCents = 0;
    let totalPayeCents = 0;
    let totalUifEmployeeCents = 0;
    let totalUifEmployerCents = 0;

    for (const payroll of payrolls) {
      const staff = payroll.staff;

      // Validate ID number (must be 13 digits)
      if (!staff.idNumber || staff.idNumber.length !== 13) {
        validationIssues.push(
          `Employee ${staff.firstName} ${staff.lastName}: Invalid ID number (must be 13 digits)`,
        );
      }

      // Warn about missing tax number
      if (!staff.taxNumber) {
        validationIssues.push(
          `Employee ${staff.firstName} ${staff.lastName}: Missing tax number (warning)`,
        );
      }

      // Build employee record
      const employeeRecord: Emp201EmployeeRecord = {
        staffId: staff.id,
        employeeNumber: staff.employeeNumber,
        fullName: `${staff.firstName} ${staff.lastName}`,
        idNumber: staff.idNumber,
        taxNumber: staff.taxNumber,
        grossRemunerationCents: payroll.grossSalaryCents,
        payeCents: payroll.payeCents,
        uifEmployeeCents: payroll.uifEmployeeCents,
        uifEmployerCents: payroll.uifEmployerCents,
      };

      employees.push(employeeRecord);

      // Accumulate totals
      totalGrossCents += payroll.grossSalaryCents;
      totalPayeCents += payroll.payeCents;
      totalUifEmployeeCents += payroll.uifEmployeeCents;
      totalUifEmployerCents += payroll.uifEmployerCents;
    }

    // Step 6: Calculate SDL (1% of total gross payroll)
    const sdlResult = this.calculateSdl(totalGrossCents);
    const totalSdlCents = sdlResult.sdlCents;
    const sdlApplicable = sdlResult.sdlApplicable;

    // Step 7: Calculate total due
    const totalUifCents = totalUifEmployeeCents + totalUifEmployerCents;
    const totalDueCents = totalPayeCents + totalUifCents + totalSdlCents;

    // Step 8: Build summary
    const summary: Emp201Summary = {
      employeeCount: employees.length,
      totalGrossRemunerationCents: totalGrossCents,
      totalPayeCents,
      totalUifEmployeeCents,
      totalUifEmployerCents,
      totalUifCents,
      totalSdlCents,
      totalDueCents,
    };

    // Step 9: Generate document
    const document = this.generateDocument(
      tenantId!,
      tenant.registrationNumber,
      tenant.tradingName || tenant.name,
      periodMonth,
      periodStart,
      periodEnd,
      summary,
      employees,
      validationIssues,
      sdlApplicable,
    );

    // Step 10: Validate document
    const validationResult = this.validateSubmission(document);
    if (!validationResult.isValid) {
      this.logger.warn(
        `EMP201 validation errors: ${validationResult.errors.join(', ')}`,
      );
    }
    if (validationResult.warnings.length > 0) {
      this.logger.warn(
        `EMP201 validation warnings: ${validationResult.warnings.join(', ')}`,
      );
    }

    // Step 11: Calculate deadline (7th of following month, or next business day)
    const deadline = this.calculateDeadline(periodEnd);

    // Step 12: Check for existing submission and upsert
    const existing = await this.prisma.sarsSubmission.findFirst({
      where: {
        tenantId: tenantId!,
        submissionType: SubmissionType.EMP201,
        periodStart,
      },
    });

    if (existing) {
      // If already submitted, return existing without modification
      if (existing.status === SubmissionStatus.SUBMITTED) {
        this.logger.log(`EMP201 already submitted: ${existing.id}`);
        return existing;
      }

      // Update existing DRAFT with fresh calculations
      const submission = await this.prisma.sarsSubmission.update({
        where: { id: existing.id },
        data: {
          periodEnd,
          deadline,
          totalPayeCents: summary.totalPayeCents,
          totalUifCents: summary.totalUifCents,
          totalSdlCents: summary.totalSdlCents,
          documentData: JSON.parse(JSON.stringify(document)) as object,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`EMP201 updated: ${submission.id}`);
      return submission;
    }

    // Create new submission
    const submission = await this.prisma.sarsSubmission.create({
      data: {
        tenantId: tenantId!,
        submissionType: SubmissionType.EMP201,
        periodStart,
        periodEnd,
        deadline,
        totalPayeCents: summary.totalPayeCents,
        totalUifCents: summary.totalUifCents,
        totalSdlCents: summary.totalSdlCents,
        status: SubmissionStatus.DRAFT,
        documentData: JSON.parse(JSON.stringify(document)) as object,
      },
    });

    this.logger.log(`EMP201 generated: ${submission.id}`);
    return submission;
  }

  /**
   * Aggregate payroll data for a period
   * Returns summary totals without creating a submission
   *
   * @throws SarsPeriodException if period format is invalid
   */
  async aggregatePayroll(
    tenantId: string,
    periodMonth: string,
  ): Promise<Emp201Summary> {
    // Validate period format
    if (!EMP201_CONSTANTS.PERIOD_FORMAT_REGEX.test(periodMonth)) {
      throw new SarsPeriodException(
        `Invalid period format "${periodMonth}" (expected YYYY-MM)`,
        periodMonth,
      );
    }

    const [year, month] = periodMonth.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    const payrolls = await this.prisma.payroll.findMany({
      where: {
        tenantId: tenantId,
        status: PayrollStatus.APPROVED,
        payPeriodStart: {
          gte: periodStart,
        },
        payPeriodEnd: {
          lte: periodEnd,
        },
      },
    });

    let totalGrossCents = 0;
    let totalPayeCents = 0;
    let totalUifEmployeeCents = 0;
    let totalUifEmployerCents = 0;

    const uniqueStaffIds = new Set<string>();

    for (const payroll of payrolls) {
      uniqueStaffIds.add(payroll.staffId);
      totalGrossCents += payroll.grossSalaryCents;
      totalPayeCents += payroll.payeCents;
      totalUifEmployeeCents += payroll.uifEmployeeCents;
      totalUifEmployerCents += payroll.uifEmployerCents;
    }

    const { sdlCents } = this.calculateSdl(totalGrossCents);
    const totalUifCents = totalUifEmployeeCents + totalUifEmployerCents;

    return {
      employeeCount: uniqueStaffIds.size,
      totalGrossRemunerationCents: totalGrossCents,
      totalPayeCents,
      totalUifEmployeeCents,
      totalUifEmployerCents,
      totalUifCents,
      totalSdlCents: sdlCents,
      totalDueCents: totalPayeCents + totalUifCents + sdlCents,
    };
  }

  /**
   * Validate employee data
   * Returns list of validation issues
   */
  validateEmployeeData(employees: Emp201EmployeeRecord[]): string[] {
    const issues: string[] = [];

    for (const employee of employees) {
      // Check ID number format (13 digits)
      if (!employee.idNumber || employee.idNumber.length !== 13) {
        issues.push(
          `Employee ${employee.fullName}: Invalid ID number (must be 13 digits)`,
        );
      }

      // Check ID number is numeric
      if (employee.idNumber && !/^\d{13}$/.test(employee.idNumber)) {
        issues.push(
          `Employee ${employee.fullName}: ID number must contain only digits`,
        );
      }

      // Warn about missing tax number
      if (!employee.taxNumber) {
        issues.push(
          `Employee ${employee.fullName}: Missing tax number (warning)`,
        );
      }

      // Validate positive amounts
      if (employee.grossRemunerationCents < 0) {
        issues.push(
          `Employee ${employee.fullName}: Negative gross remuneration`,
        );
      }
    }

    return issues;
  }

  /**
   * Generate EMP201 document structure
   */
  generateDocument(
    tenantId: string,
    payeReference: string | null,
    tradingName: string,
    periodMonth: string,
    periodStart: Date,
    periodEnd: Date,
    summary: Emp201Summary,
    employees: Emp201EmployeeRecord[],
    validationIssues: string[],
    sdlApplicable: boolean,
  ): Emp201Document {
    return {
      submissionId: uuidv4(),
      tenantId: tenantId,
      payeReference,
      tradingName,
      periodMonth,
      periodStart,
      periodEnd,
      summary,
      employees,
      validationIssues,
      sdlApplicable,
      generatedAt: new Date(),
    };
  }

  /**
   * Validate EMP201 submission
   */
  validateSubmission(document: Emp201Document): Emp201ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for PAYE reference
    if (!document.payeReference) {
      warnings.push('No PAYE reference configured for tenant');
    }

    // Check employee count
    if (document.employees.length === 0) {
      errors.push('No employees in submission');
    }

    if (
      document.employees.length > EMP201_CONSTANTS.MAX_EMPLOYEES_PER_SUBMISSION
    ) {
      errors.push(
        `Too many employees (${document.employees.length} > ${EMP201_CONSTANTS.MAX_EMPLOYEES_PER_SUBMISSION})`,
      );
    }

    // Check for validation issues
    const errorIssues = document.validationIssues.filter(
      (issue) => !issue.includes('(warning)'),
    );
    if (errorIssues.length > 0) {
      warnings.push(
        `${errorIssues.length} employee data issues require attention`,
      );
    }

    // Validate totals reconcile
    const calculatedTotal =
      document.summary.totalPayeCents +
      document.summary.totalUifCents +
      document.summary.totalSdlCents;

    if (calculatedTotal !== document.summary.totalDueCents) {
      errors.push('Total due does not reconcile with component totals');
    }

    // Check for high average salary (potential error)
    const avgSalaryCents =
      document.summary.totalGrossRemunerationCents / document.employees.length;
    if (avgSalaryCents > EMP201_VALIDATION.HIGH_AVERAGE_SALARY_CENTS) {
      warnings.push(
        `High average salary (R${(avgSalaryCents / 100).toFixed(2)}) - please verify`,
      );
    }

    // Validate SDL calculation
    if (document.sdlApplicable) {
      const expectedSdl = new Decimal(
        document.summary.totalGrossRemunerationCents,
      )
        .mul(EMP201_CONSTANTS.SDL_RATE)
        .round()
        .toNumber();

      if (Math.abs(expectedSdl - document.summary.totalSdlCents) > 1) {
        errors.push('SDL calculation does not match expected amount');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate SDL (Skills Development Levy)
   * 1% of total gross payroll, exempt if annual payroll < R500,000
   */
  calculateSdl(totalGrossCents: number): {
    sdlCents: number;
    sdlApplicable: boolean;
  } {
    // Estimate annual payroll (monthly * 12)
    const estimatedAnnualPayrollCents = totalGrossCents * 12;

    // Check if exempt (below R500,000 annual threshold)
    if (
      estimatedAnnualPayrollCents <
      EMP201_CONSTANTS.SDL_EXEMPTION_THRESHOLD_CENTS
    ) {
      return { sdlCents: 0, sdlApplicable: false };
    }

    // Calculate SDL as 1% of monthly gross
    const sdlCents = new Decimal(totalGrossCents)
      .mul(EMP201_CONSTANTS.SDL_RATE)
      .round()
      .toNumber();

    return { sdlCents, sdlApplicable: true };
  }

  /**
   * Calculate submission deadline
   * EMP201 due by 7th of following month (or next business day)
   */
  private calculateDeadline(periodEnd: Date): Date {
    const deadline = new Date(periodEnd);
    deadline.setMonth(deadline.getMonth() + 1);
    deadline.setDate(7);

    // Adjust for weekends
    const dayOfWeek = deadline.getDay();
    if (dayOfWeek === 0) {
      deadline.setDate(deadline.getDate() + 1); // Sunday -> Monday
    } else if (dayOfWeek === 6) {
      deadline.setDate(deadline.getDate() + 2); // Saturday -> Monday
    }

    return deadline;
  }
}
