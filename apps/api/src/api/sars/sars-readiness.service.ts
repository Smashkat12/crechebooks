/**
 * SARS Readiness Service
 *
 * Aggregates filing-readiness data for the next SARS deadline.
 * Read-only — queries only, no mutations, no audit-log writes.
 *
 * Deadline constants:
 *  EMP201  — 7th of month following reporting month (EMP201 §3)
 *  VAT201  — Category A: 25th of month following bi-monthly period (VAT201 §6)
 *             eFiling effectively extends to last business day of that month.
 *             Defaulted to Category A; TODO: read tenant vat_category from settings
 *             when that field is available.
 *  EMP501  — Interim May 31; annual Oct 31 (EMP501 §2)
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  SarsReadinessResponseDto,
  ReadinessBlockerDto,
  NextDeadlineDto,
} from './dto/readiness.dto';

type FilingType = 'EMP201' | 'VAT201' | 'EMP501' | 'PROVISIONAL_TAX';

interface DeadlineWindow {
  type: FilingType;
  period: string;
  dueDate: Date;
  reportingStart: Date;
  reportingEnd: Date;
}

@Injectable()
export class SarsReadinessService {
  private readonly logger = new Logger(SarsReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute readiness for the next SARS deadline window.
   *
   * @param tenantId  - tenant-scoped (MUST be on every query)
   * @param periodRef - optional YYYY-MM override; defaults to today
   */
  async getReadiness(
    tenantId: string,
    periodRef?: string,
  ): Promise<SarsReadinessResponseDto> {
    const ref = periodRef ? this.parseYearMonth(periodRef) : new Date();
    ref.setHours(0, 0, 0, 0);

    const window = this.nextDeadlineWindow(ref);
    this.logger.debug(
      `Readiness check: tenant=${tenantId} type=${window.type} due=${window.dueDate.toISOString()}`,
    );

    const daysRemaining = Math.ceil(
      (window.dueDate.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24),
    );

    const blockers: ReadinessBlockerDto[] = [];

    // ── Blocker 1: uncategorised transactions ──────────────────────────────
    // Transactions without any entry in categorizations table are uncategorised.
    // Scope to reporting window of the next deadline.
    const uncatCount = await this.countUncategorisedTransactions(
      tenantId,
      window.reportingStart,
      window.reportingEnd,
    );
    if (uncatCount > 0) {
      blockers.push({
        severity: 'critical',
        label: `${uncatCount} transaction${uncatCount === 1 ? '' : 's'} uncategorised`,
        description:
          'Transactions without a chart-of-accounts category will be excluded from your return. Categorise them before filing.',
        deepLinkUrl: '/transactions?status=uncategorised',
        count: uncatCount,
      });
    }

    // ── Blocker 2: unreconciled bank statement lines ───────────────────────
    // Count bank_statement_matches rows (within reporting window) that are not
    // MATCHED or ACCEPTED (i.e. IN_BANK_ONLY / IN_XERO_ONLY / DISCREPANCY).
    const unreconCount = await this.countUnreconciledLines(
      tenantId,
      window.reportingStart,
      window.reportingEnd,
    );
    if (unreconCount > 0) {
      blockers.push({
        severity: 'warning',
        label: `${unreconCount} bank line${unreconCount === 1 ? '' : 's'} unreconciled`,
        description:
          'Unmatched bank statement lines may indicate missing transactions. Reconcile before filing.',
        deepLinkUrl: '/banking/reconciliation',
        count: unreconCount,
      });
    }

    // ── Blocker 3 (EMP201 only): active staff without payslip ─────────────
    if (window.type === 'EMP201') {
      const missingPayslips = await this.countStaffMissingPayslips(
        tenantId,
        window.reportingStart,
        window.reportingEnd,
      );
      if (missingPayslips > 0) {
        blockers.push({
          severity: 'critical',
          label: `${missingPayslips} staff member${missingPayslips === 1 ? '' : 's'} missing payslip`,
          description:
            'Active employees without a payslip for this period cannot be included in EMP201. Import from SimplePay or generate payroll first.',
          deepLinkUrl: '/staff',
          count: missingPayslips,
        });
      }
    }

    // ── Blocker 4 (VAT201 only): standard-rated transactions with no VAT ──
    // A categorization row with vatType=STANDARD but vatAmountCents=0 or null
    // suggests output VAT was not captured (VAT201 §4 — output tax).
    if (window.type === 'VAT201') {
      const vatGaps = await this.countVatGaps(
        tenantId,
        window.reportingStart,
        window.reportingEnd,
      );
      if (vatGaps > 0) {
        blockers.push({
          severity: 'warning',
          label: `${vatGaps} VAT-rated transaction${vatGaps === 1 ? '' : 's'} with no VAT amount`,
          description:
            'Transactions categorised as standard-rated (15% VAT) but without a captured VAT amount may understate output tax. Review before filing.',
          deepLinkUrl: '/transactions?status=uncategorised',
          count: vatGaps,
        });
      }
    }

    // TODO: blocker — missing tax certificates (IRP5 / IT3a) for EMP501
    // TODO: blocker — undeclared income (transactions not linked to an invoice)

    const ready = !blockers.some((b) => b.severity === 'critical');

    const nextDeadline: NextDeadlineDto = {
      type: window.type,
      period: window.period,
      dueDate: this.formatDate(window.dueDate),
      daysRemaining,
    };

    return { nextDeadline, blockers, ready };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deadline window calculation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Return the soonest upcoming deadline window relative to `ref`.
   * Evaluates EMP201 and VAT201 (and EMP501 bi-annually) and picks the nearest.
   */
  private nextDeadlineWindow(ref: Date): DeadlineWindow {
    const candidates: DeadlineWindow[] = [
      this.emp201Window(ref),
      this.vat201Window(ref),
      this.emp501Window(ref),
    ];

    // Sort by due date ascending and return nearest
    candidates.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return candidates[0];
  }

  /**
   * EMP201: due 7th of month following reporting month.
   * If the 7th has already passed this month, next deadline is next month's 7th.
   * Reporting period = the calendar month before dueDate.
   */
  private emp201Window(ref: Date): DeadlineWindow {
    const y = ref.getFullYear();
    const m = ref.getMonth(); // 0-indexed

    // Candidate: 7th of current month (covers last month's payroll)
    let dueDate = new Date(y, m, 7);
    if (dueDate <= ref) {
      // Passed — move to next month
      dueDate = new Date(y, m + 1, 7);
    }

    // Reporting month = month before due date
    const repMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() - 1, 1);
    const period = this.formatYearMonth(repMonth);
    const reportingStart = new Date(
      repMonth.getFullYear(),
      repMonth.getMonth(),
      1,
    );
    const reportingEnd = new Date(
      repMonth.getFullYear(),
      repMonth.getMonth() + 1,
      0,
    );

    return { type: 'EMP201', period, dueDate, reportingStart, reportingEnd };
  }

  /**
   * VAT201 Category A: bi-monthly periods ending Feb/Apr/Jun/Aug/Oct/Dec.
   * Due 25th of the month following the two-month period end.
   * e.g. Mar+Apr period → due May 25.
   * TODO: if tenant has Category B/C settings, adjust period end months.
   */
  private vat201Window(ref: Date): DeadlineWindow {
    // Category A period-end months (0-indexed): Jan(0), Mar(2), May(4), Jul(6), Sep(8), Nov(10)
    // Actually periods are Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec
    // Period ends: Feb(1), Apr(3), Jun(5), Aug(7), Oct(9), Dec(11)
    // Due: 25th of Mar(2), May(4), Jul(6), Sep(8), Nov(10), Jan(0 of next year)

    const periodEndMonths = [1, 3, 5, 7, 9, 11]; // Feb, Apr, Jun, Aug, Oct, Dec

    // Find the next due date (25th of month after periodEndMonth)
    const y = ref.getFullYear();
    let dueDate: Date | null = null;
    let periodEndMonth = -1;

    for (const pem of periodEndMonths) {
      const candidate = new Date(y, pem + 1, 25); // 25th of month after period end
      if (candidate > ref) {
        dueDate = candidate;
        periodEndMonth = pem;
        break;
      }
    }

    // If none found this year, wrap to first period of next year (Jan 25 due → Nov-Dec period)
    if (!dueDate) {
      dueDate = new Date(y + 1, 0, 25); // Jan 25 of next year
      periodEndMonth = 11; // December
    }

    const periodEndYear =
      periodEndMonth === 11 && dueDate.getFullYear() === y + 1
        ? y
        : dueDate.getFullYear();
    const reportingEnd = new Date(periodEndYear, periodEndMonth + 1, 0); // last day of period-end month
    const reportingStart = new Date(periodEndYear, periodEndMonth - 1, 1); // first day, two months back

    const startStr = this.formatYearMonth(reportingStart);
    const endStr = this.formatYearMonth(reportingEnd);
    const period = `${startStr}/${endStr}`;

    return { type: 'VAT201', period, dueDate, reportingStart, reportingEnd };
  }

  /**
   * EMP501: bi-annual.
   *   Interim  — May 31 (covers Mar–Aug payroll)
   *   Annual   — Oct 31 (covers full tax year)
   * Returns whichever is next.
   */
  private emp501Window(ref: Date): DeadlineWindow {
    const y = ref.getFullYear();

    const interim = new Date(y, 4, 31); // May 31
    const annual = new Date(y, 9, 31); // Oct 31

    const dueDate =
      interim > ref ? interim : annual > ref ? annual : new Date(y + 1, 4, 31);

    // Period label: tax year
    const taxYearStart = dueDate.getMonth() <= 9 ? y - 1 : y; // before Oct = current tax year
    const period = `${taxYearStart}-03/${taxYearStart + 1}-02`;
    const reportingStart = new Date(taxYearStart, 2, 1); // Mar 1
    const reportingEnd = new Date(taxYearStart + 1, 1, 28); // Feb 28

    return { type: 'EMP501', period, dueDate, reportingStart, reportingEnd };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Blocker queries — all tenant-scoped
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Count transactions in the reporting window that have NO categorization row.
   * Reuses the existing transactions + categorizations relationship from the
   * Prisma schema (Transaction.categorizations[]).
   */
  private async countUncategorisedTransactions(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.transaction.count({
      where: {
        tenantId,
        isDeleted: false,
        date: { gte: from, lte: to },
        categorizations: { none: {} },
      },
    });
  }

  /**
   * Count BankStatementMatch rows in the reporting window that are not
   * matched/accepted.  Uses status values from the BankStatementMatchStatus
   * enum: anything other than MATCHED and ACCEPTED is a gap.
   * (Schema line 1553: status BankStatementMatchStatus)
   */
  private async countUnreconciledLines(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.bankStatementMatch.count({
      where: {
        tenantId,
        bankDate: { gte: from, lte: to },
        status: {
          // Only MATCHED and FEE_ADJUSTED_MATCH are considered resolved.
          // IN_BANK_ONLY, IN_XERO_ONLY, AMOUNT_MISMATCH, DATE_MISMATCH are gaps.
          notIn: ['MATCHED', 'FEE_ADJUSTED_MATCH'],
        },
      },
    });
  }

  /**
   * For EMP201: count active staff who have no payroll or simplepay payslip
   * import for the reporting month.
   *
   * Reuses: Staff model (isActive), Payroll model (payPeriodStart/End, status),
   * SimplePayPayslipImport model (payPeriodStart/End).
   */
  private async countStaffMissingPayslips(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    // Get all active staff IDs for the tenant
    const activeStaff = await this.prisma.staff.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (activeStaff.length === 0) return 0;

    // Staff who have at least one approved/paid Payroll record for the period
    const staffWithPayroll = await this.prisma.payroll.findMany({
      where: {
        tenantId,
        payPeriodStart: { lte: to },
        payPeriodEnd: { gte: from },
        status: { in: ['APPROVED', 'PAID'] as const },
      },
      select: { staffId: true },
    });

    // Staff who have at least one SimplePay payslip import for the period
    const staffWithSimplePay =
      await this.prisma.simplePayPayslipImport.findMany({
        where: {
          tenantId,
          payPeriodStart: { lte: to },
          payPeriodEnd: { gte: from },
        },
        select: { staffId: true },
      });

    const coveredIds = new Set([
      ...staffWithPayroll.map((r) => r.staffId),
      ...staffWithSimplePay.map((r) => r.staffId),
    ]);

    return activeStaff.filter((s) => !coveredIds.has(s.id)).length;
  }

  /**
   * For VAT201: count categorizations in the window where vatType=STANDARD
   * but vatAmountCents is null or 0 — i.e. VAT was not recorded (VAT201 §4).
   */
  private async countVatGaps(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    // Join through transaction to scope by date + tenantId
    return this.prisma.categorization.count({
      where: {
        vatType: 'STANDARD',
        vatAmountCents: { lte: 0 },
        transaction: {
          tenantId,
          isDeleted: false,
          date: { gte: from, lte: to },
        },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private formatYearMonth(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /** Format a local Date as YYYY-MM-DD without UTC conversion. */
  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private parseYearMonth(s: string): Date {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
}
