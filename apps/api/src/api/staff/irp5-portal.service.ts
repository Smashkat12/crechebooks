/**
 * Irp5PortalService — Staff-portal IRP5 certificate aggregation
 *
 * Generates IRP5 data on-demand from SimplePayPayslipImport rows per
 * March–February tax year.  No persistence — Option A (on-demand).
 *
 * SARS IRP5 reference codes used:
 *   3615 — total remuneration (gross from payslip)
 *   3696 — PAYE deducted (payeCents)
 *   3810 — UIF employee contribution (uifEmployeeCents)
 *
 * Source codes 3601/3602/3606 (basic/overtime/bonus split) are NOT
 * broken out because SimplePayPayslipImport stores no column-level
 * earnings split — only grossSalaryCents.  The payslipData JSON blob
 * may hold line-item detail but the schema treats it as opaque.
 * Gap surfaced in report.
 *
 * Tax year convention: "2026" means March 1 2025 → February 28/29 2026
 * (SA SARS convention: named by the year in which February falls).
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  IRP5DocumentDto,
  IRP5ListResponseDto,
  IRP5Status,
} from './dto/staff-profile.dto';

/** Internal aggregate for one tax-year's payslip data for a staff member */
export interface Irp5YearAggregate {
  taxYear: number;
  taxYearPeriod: string;
  startDate: Date;
  endDate: Date;
  periodCount: number;
  totalGrossCents: number;
  totalPayeCents: number;
  totalUifEmployeeCents: number;
  totalUifEmployerCents: number;
  totalNetCents: number;
  isComplete: boolean; // false when endDate is still in the future
  staffId: string;
  tenantId: string;
}

@Injectable()
export class Irp5PortalService {
  private readonly logger = new Logger(Irp5PortalService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * List IRP5 certificates available for a staff member.
   *
   * Returns one entry per tax year where at least one payslip import exists.
   * Years with data but end date still in the future surface as 'pending'.
   */
  async listForStaff(
    tenantId: string,
    staffId: string,
  ): Promise<IRP5ListResponseDto> {
    this.logger.log(
      `Listing IRP5 tax years for staff ${staffId} tenant ${tenantId}`,
    );

    const aggregates = await this.aggregateByTaxYear(tenantId, staffId);

    const data: IRP5DocumentDto[] = aggregates.map((agg) =>
      this.aggregateToDto(agg),
    );

    const availableYears = aggregates.map((agg) => agg.taxYear);

    return {
      data,
      total: data.length,
      availableYears,
    };
  }

  /**
   * Get a single year's aggregate for a staff member.
   *
   * @param tenantId   - Must match staff's tenant (ownership check)
   * @param staffId    - Staff member
   * @param taxYear    - Numeric tax year (e.g. 2026 for Mar 2025 – Feb 2026)
   * @throws NotFoundException if no payslips exist for that year
   */
  async getYearAggregate(
    tenantId: string,
    staffId: string,
    taxYear: number,
  ): Promise<Irp5YearAggregate> {
    const { startDate, endDate } = this.taxYearDates(taxYear);

    const payslips = await this.prisma.simplePayPayslipImport.findMany({
      where: {
        tenantId,
        staffId,
        payPeriodStart: { gte: startDate },
        payPeriodEnd: { lte: endDate },
      },
    });

    if (payslips.length === 0) {
      throw new NotFoundException(
        `No payslip data found for tax year ${taxYear}`,
      );
    }

    const agg = this.sumPayslips(
      payslips,
      taxYear,
      startDate,
      endDate,
      staffId,
      tenantId,
    );

    return agg;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Aggregate payslips for all tax years that have data for a staff member */
  private async aggregateByTaxYear(
    tenantId: string,
    staffId: string,
  ): Promise<Irp5YearAggregate[]> {
    // Fetch all imported payslips for this staff member within this tenant.
    // No upper date bound — we return whatever years have data.
    const payslips = await this.prisma.simplePayPayslipImport.findMany({
      where: { tenantId, staffId },
      orderBy: { payPeriodStart: 'asc' },
    });

    if (payslips.length === 0) {
      return [];
    }

    // Group by tax year (March–February window)
    const byYear = new Map<number, typeof payslips>();

    for (const p of payslips) {
      const year = this.taxYearForDate(p.payPeriodStart);
      const group = byYear.get(year) ?? [];
      group.push(p);
      byYear.set(year, group);
    }

    // Build aggregates in descending year order
    const aggregates: Irp5YearAggregate[] = [];
    const sortedYears = [...byYear.keys()].sort((a, b) => b - a);

    for (const year of sortedYears) {
      const rows = byYear.get(year)!;
      const { startDate, endDate } = this.taxYearDates(year);
      aggregates.push(
        this.sumPayslips(rows, year, startDate, endDate, staffId, tenantId),
      );
    }

    return aggregates;
  }

  private sumPayslips(
    payslips: {
      grossSalaryCents: number;
      netSalaryCents: number;
      payeCents: number;
      uifEmployeeCents: number;
      uifEmployerCents: number;
    }[],
    taxYear: number,
    startDate: Date,
    endDate: Date,
    staffId: string,
    tenantId: string,
  ): Irp5YearAggregate {
    let totalGrossCents = 0;
    let totalPayeCents = 0;
    let totalUifEmployeeCents = 0;
    let totalUifEmployerCents = 0;
    let totalNetCents = 0;

    for (const p of payslips) {
      totalGrossCents += p.grossSalaryCents;
      totalPayeCents += p.payeCents;
      totalUifEmployeeCents += p.uifEmployeeCents;
      totalUifEmployerCents += p.uifEmployerCents;
      totalNetCents += p.netSalaryCents;
    }

    const now = new Date();
    const isComplete = endDate <= now;

    return {
      taxYear,
      taxYearPeriod: `${taxYear - 1}/${taxYear}`,
      startDate,
      endDate,
      periodCount: payslips.length,
      totalGrossCents,
      totalPayeCents,
      totalUifEmployeeCents,
      totalUifEmployerCents,
      totalNetCents,
      isComplete,
      staffId,
      tenantId,
    };
  }

  private aggregateToDto(agg: Irp5YearAggregate): IRP5DocumentDto {
    const status: IRP5Status = agg.isComplete
      ? IRP5Status.AVAILABLE
      : IRP5Status.PENDING;

    // availableDate: March 1 of the tax year (i.e. after tax year closes)
    const availableDate = new Date(agg.taxYear, 2, 1); // March 1

    return {
      id: `irp5-${agg.taxYear}`,
      taxYear: agg.taxYear,
      taxYearPeriod: agg.taxYearPeriod,
      status,
      availableDate,
      referenceNumber: agg.isComplete
        ? `IRP5/${agg.taxYearPeriod.replace('/', '-')}/${agg.staffId.slice(0, 8).toUpperCase()}`
        : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Tax year helpers
  // ---------------------------------------------------------------------------

  /**
   * Given a date, return which SA tax year it falls in.
   * Tax year is named by the February-end year.
   * Dates in March–December belong to the year starting in that March.
   * Dates in January–February belong to the year ending in that February.
   */
  taxYearForDate(date: Date): number {
    const month = date.getMonth(); // 0-indexed
    const year = date.getFullYear();
    // March (2) through December (11) → tax year ends in year+1
    // January (0) through February (1) → tax year ends in current year
    return month >= 2 ? year + 1 : year;
  }

  /**
   * Return the start/end Date objects for a given tax year number.
   * taxYear=2026 → 2025-03-01 to 2026-02-28/29
   */
  taxYearDates(taxYear: number): { startDate: Date; endDate: Date } {
    // Start: March 1 of (taxYear - 1)
    const startDate = new Date(taxYear - 1, 2, 1);
    // End: last day of February of taxYear (day 0 of March = last day of Feb)
    const endDate = new Date(taxYear, 2, 0);
    return { startDate, endDate };
  }
}
