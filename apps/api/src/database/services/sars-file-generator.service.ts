/**
 * SARS File Generator Service
 * TASK-SARS-035: Replace Mock eFiling with File Generation
 *
 * Generates EMP201 and EMP501 CSV files for SARS submission.
 * Uses SimplePay as the source of truth for payroll data.
 *
 * CSV files use CRLF line endings as required by SARS.
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SimplePayTaxService } from '../../integrations/simplepay/simplepay-tax.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  Emp201CsvData,
  Emp501CsvData,
  Emp501EmployeeRecord,
  SarsFileResult,
} from '../dto/sars-file.dto';

/** CRLF line ending for SARS CSV files */
const CRLF = '\r\n';

@Injectable()
export class SarsFileGeneratorService {
  private readonly logger = new Logger(SarsFileGeneratorService.name);

  constructor(
    private readonly simplePayTaxService: SimplePayTaxService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate EMP201 CSV file for a specific period
   *
   * @param tenantId - Tenant ID
   * @param taxYear - Tax year (e.g., 2025)
   * @param taxPeriod - Tax period (1-12 for monthly)
   * @returns CSV file content with CRLF line endings
   */
  async generateEmp201Csv(
    tenantId: string,
    taxYear: number,
    taxPeriod: number,
  ): Promise<SarsFileResult> {
    this.logger.log(
      `Generating EMP201 CSV for tenant ${tenantId}, year ${taxYear}, period ${taxPeriod}`,
    );

    // Validate inputs
    if (taxPeriod < 1 || taxPeriod > 12) {
      throw new BadRequestException('Tax period must be between 1 and 12');
    }

    // Get tenant info for PAYE reference
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new BadRequestException(`Tenant ${tenantId} not found`);
    }

    const payeReference = tenant.registrationNumber || 'UNKNOWN';

    // Calculate period date (first day of the month)
    const periodDate = new Date(taxYear, taxPeriod - 1, 1);

    // Fetch EMP201 data from SimplePay
    const emp201Data = await this.simplePayTaxService.fetchEmp201(
      tenantId,
      periodDate,
    );

    // Build CSV data structure
    const csvData: Emp201CsvData = {
      taxYear,
      taxPeriod,
      payeReference,
      paymentFrequency: 'MONTHLY',
      statusCode: 0,
      payeAmount: emp201Data.total_paye,
      uifAmount: emp201Data.total_uif_employer + emp201Data.total_uif_employee,
      sdlAmount: emp201Data.total_sdl,
      etiAmount: emp201Data.total_eti,
      totalAmount:
        emp201Data.total_paye +
        emp201Data.total_uif_employer +
        emp201Data.total_uif_employee +
        emp201Data.total_sdl -
        emp201Data.total_eti,
      employeeCount: emp201Data.employees_count,
    };

    // Generate CSV content with CRLF line endings
    const content = this.formatEmp201Csv(csvData);

    // Generate filename
    const filename = `EMP201_${payeReference}_${taxYear}_${String(taxPeriod).padStart(2, '0')}.csv`;

    this.logger.log(
      `EMP201 CSV generated: ${filename}, ${emp201Data.employees_count} employees`,
    );

    return {
      content,
      filename,
      contentType: 'text/csv',
    };
  }

  /**
   * Generate EMP501 CSV file for annual reconciliation
   *
   * @param tenantId - Tenant ID
   * @param taxYearStart - Tax year start date (YYYY-MM-DD)
   * @param taxYearEnd - Tax year end date (YYYY-MM-DD)
   * @returns CSV file content with CRLF line endings
   */
  async generateEmp501Csv(
    tenantId: string,
    taxYearStart: string,
    taxYearEnd: string,
  ): Promise<SarsFileResult> {
    this.logger.log(
      `Generating EMP501 CSV for tenant ${tenantId}, period ${taxYearStart} to ${taxYearEnd}`,
    );

    // Get tenant info for PAYE reference
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new BadRequestException(`Tenant ${tenantId} not found`);
    }

    const payeReference = tenant.registrationNumber || 'UNKNOWN';

    // Parse tax year to determine year
    const startDate = new Date(taxYearStart);
    const taxYear = startDate.getFullYear();

    // Fetch IRP5 certificates for all staff
    const staffList = await this.prisma.staff.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      include: {
        simplePayMapping: true,
      },
    });

    const employees: Emp501EmployeeRecord[] = [];
    let totalGross = 0;
    let totalPaye = 0;
    let totalUifEmployee = 0;
    let totalUifEmployer = 0;

    for (const staff of staffList) {
      if (!staff.simplePayMapping) {
        this.logger.warn(
          `Staff ${staff.id} (${staff.firstName} ${staff.lastName}) not synced to SimplePay, skipping`,
        );
        continue;
      }

      try {
        // Fetch IRP5 data for this employee
        const irp5Records =
          await this.simplePayTaxService.fetchIrp5Certificates(
            tenantId,
            staff.id,
            taxYear,
          );

        // Get the record for this tax year
        const irp5 = irp5Records.find((r) => r.tax_year === taxYear);

        if (irp5) {
          // Calculate UIF from payroll records for this period
          const payrollRecords = await this.prisma.payroll.findMany({
            where: {
              staffId: staff.id,
              payPeriodStart: { gte: startDate },
              payPeriodEnd: { lte: new Date(taxYearEnd) },
            },
          });

          const uifEmployee =
            payrollRecords.reduce((sum, p) => sum + p.uifEmployeeCents, 0) /
            100;
          const uifEmployer =
            payrollRecords.reduce((sum, p) => sum + p.uifEmployerCents, 0) /
            100;

          employees.push({
            idNumber: staff.idNumber || '',
            surname: staff.lastName,
            firstName: staff.firstName,
            grossRemuneration: irp5.gross_remuneration,
            paye: irp5.paye_deducted,
            uifEmployee,
            uifEmployer,
          });

          totalGross += irp5.gross_remuneration;
          totalPaye += irp5.paye_deducted;
          totalUifEmployee += uifEmployee;
          totalUifEmployer += uifEmployer;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch IRP5 for staff ${staff.id}: ${error.message}`,
        );
      }
    }

    // Build CSV data structure
    const csvData: Emp501CsvData = {
      taxYearStart,
      taxYearEnd,
      payeReference,
      employees,
      summary: {
        totalGross,
        totalPaye,
        totalUifEmployee,
        totalUifEmployer,
      },
    };

    // Generate CSV content with CRLF line endings
    const content = this.formatEmp501Csv(csvData);

    // Generate filename
    const filename = `EMP501_${payeReference}_${taxYear}.csv`;

    this.logger.log(
      `EMP501 CSV generated: ${filename}, ${employees.length} employees`,
    );

    return {
      content,
      filename,
      contentType: 'text/csv',
    };
  }

  /**
   * Format EMP201 data as SARS CSV
   * Uses CRLF line endings as required by SARS
   */
  private formatEmp201Csv(data: Emp201CsvData): string {
    const lines: string[] = [
      // Header line
      `EMP201,${data.taxYear},${data.taxPeriod},${data.payeReference},${data.paymentFrequency},${data.statusCode}`,
      // Data lines
      `PAYE_PAID,${data.payeAmount.toFixed(2)}`,
      `UIF_PAID,${data.uifAmount.toFixed(2)}`,
      `SDL_PAID,${data.sdlAmount.toFixed(2)}`,
      `ETI_CLAIMED,${data.etiAmount.toFixed(2)}`,
      `TOTAL_PAID,${data.totalAmount.toFixed(2)}`,
      `EMPLOYEE_COUNT,${data.employeeCount}`,
    ];

    // Join with CRLF and ensure file ends with CRLF
    return lines.join(CRLF) + CRLF;
  }

  /**
   * Format EMP501 data as SARS CSV
   * Uses CRLF line endings as required by SARS
   */
  private formatEmp501Csv(data: Emp501CsvData): string {
    const lines: string[] = [
      // Header line
      `EMP501,${data.taxYearStart},${data.taxYearEnd},${data.payeReference}`,
    ];

    // Employee records
    for (const emp of data.employees) {
      lines.push(
        `EMPLOYEE,${emp.idNumber},${emp.surname},${emp.firstName},${emp.grossRemuneration.toFixed(2)},${emp.paye.toFixed(2)},${emp.uifEmployee.toFixed(2)},${emp.uifEmployer.toFixed(2)}`,
      );
    }

    // Summary lines
    lines.push(`SUMMARY,TOTAL_GROSS,${data.summary.totalGross.toFixed(2)}`);
    lines.push(`SUMMARY,TOTAL_PAYE,${data.summary.totalPaye.toFixed(2)}`);
    lines.push(
      `SUMMARY,TOTAL_UIF_EMPLOYEE,${data.summary.totalUifEmployee.toFixed(2)}`,
    );
    lines.push(
      `SUMMARY,TOTAL_UIF_EMPLOYER,${data.summary.totalUifEmployer.toFixed(2)}`,
    );

    // Join with CRLF and ensure file ends with CRLF
    return lines.join(CRLF) + CRLF;
  }
}
