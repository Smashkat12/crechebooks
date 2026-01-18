import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { DashboardMetricsResponseDto } from './dto/dashboard-metrics.dto';
import { DashboardTrendsResponseDto } from './dto/dashboard-trends.dto';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(
    tenantId: string,
    period?: string,
    year?: number,
  ): Promise<DashboardMetricsResponseDto> {
    this.logger.debug(
      `Getting dashboard metrics for tenant ${tenantId}, period: ${period || 'current_month'}, year: ${year || 'auto'}`,
    );

    let startOfPeriod: Date;
    let endOfPeriod: Date;
    let referenceDate: Date;

    if (year) {
      // Year filter provided - show full SA tax year data (March - February)
      // Tax year 2025 = 1 March 2025 to 28 Feb 2026
      startOfPeriod = new Date(Date.UTC(year, 2, 1, 0, 0, 0, 0)); // March 1
      endOfPeriod = new Date(Date.UTC(year + 1, 1, 28, 23, 59, 59, 999)); // Feb 28 of next year
      referenceDate = new Date(Date.UTC(year + 1, 1, 28)); // Use Feb 28 as reference
    } else {
      // No year filter - use latest transaction's month
      const latestTransaction = await this.prisma.transaction.findFirst({
        where: { tenantId, isDeleted: false },
        orderBy: { date: 'desc' },
        select: { date: true },
      });

      // Use the latest transaction's month, or current month if no transactions
      referenceDate = latestTransaction?.date || new Date();
      // Use UTC dates to avoid timezone issues
      const refYear = referenceDate.getUTCFullYear();
      const month = referenceDate.getUTCMonth();
      startOfPeriod = new Date(Date.UTC(refYear, month, 1, 0, 0, 0, 0));
      endOfPeriod = new Date(Date.UTC(refYear, month + 1, 0, 23, 59, 59, 999));
    }

    // For backward compatibility, also support these as aliases
    const startOfMonth = startOfPeriod;
    const endOfMonth = endOfPeriod;

    this.logger.debug(
      `Using date range: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()} (based on latest transaction)`,
    );

    // Current date for arrears calculations (what's overdue NOW)
    const now = new Date();

    // Get income from bank transactions (credits)
    const incomeTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCredit: true,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        amountCents: true,
        status: true,
      },
    });

    const totalIncome = incomeTransactions.reduce(
      (sum, txn) => sum + txn.amountCents,
      0,
    );

    // Get invoice metrics for outstanding/invoiced amounts
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isDeleted: false,
        issueDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        totalCents: true,
        amountPaidCents: true,
        status: true,
        dueDate: true,
      },
    });

    const totalInvoiced = invoices.reduce(
      (sum, inv) => sum + inv.totalCents,
      0,
    );
    const totalCollected = invoices.reduce(
      (sum, inv) => sum + inv.amountPaidCents,
      0,
    );
    const outstanding = totalInvoiced - totalCollected;

    // Get overdue invoices for arrears
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isDeleted: false,
        status: {
          in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'],
        },
        dueDate: {
          lt: now,
        },
      },
      select: {
        totalCents: true,
        amountPaidCents: true,
        dueDate: true,
        parentId: true,
      },
    });

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let overdueBy30 = 0;
    let overdueBy60 = 0;
    let overdueBy90 = 0;
    const uniqueParentsInArrears = new Set<string>();

    for (const inv of overdueInvoices) {
      const arrears = inv.totalCents - inv.amountPaidCents;
      if (arrears > 0) {
        uniqueParentsInArrears.add(inv.parentId);
        if (inv.dueDate <= ninetyDaysAgo) {
          overdueBy90 += arrears;
        } else if (inv.dueDate <= sixtyDaysAgo) {
          overdueBy60 += arrears;
        } else if (inv.dueDate <= thirtyDaysAgo) {
          overdueBy30 += arrears;
        }
      }
    }

    const totalArrears = overdueBy30 + overdueBy60 + overdueBy90;

    // Get expense metrics from transactions
    const expenses = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCredit: false,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        amountCents: true,
        status: true,
      },
    });

    const totalExpenses = expenses.reduce(
      (sum, exp) => sum + Math.abs(exp.amountCents),
      0,
    );
    const categorizedExpenses = expenses
      .filter((e) => e.status === 'CATEGORIZED')
      .reduce((sum, exp) => sum + Math.abs(exp.amountCents), 0);
    const uncategorizedExpenses = totalExpenses - categorizedExpenses;

    // Get enrollment metrics
    const enrollments = await this.prisma.enrollment.count({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
    });

    const inactiveEnrollments = await this.prisma.enrollment.count({
      where: {
        tenantId,
        status: {
          in: ['WITHDRAWN', 'GRADUATED', 'PENDING'],
        },
      },
    });

    // Get payment metrics
    const matchedPayments = await this.prisma.payment.count({
      where: {
        tenantId,
        transactionId: { not: null },
        isReversed: false,
      },
    });

    const unmatchedPayments = await this.prisma.payment.count({
      where: {
        tenantId,
        transactionId: null,
        isReversed: false,
      },
    });

    // Format the actual period being shown (e.g., "2025-10")
    const actualPeriod = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;

    // Convert all monetary values from cents to rands for frontend display
    return {
      period: period || actualPeriod,
      revenue: {
        total: totalIncome / 100, // Bank income (credits) in rands
        invoiced: totalInvoiced / 100,
        collected: totalCollected / 100,
        outstanding: outstanding / 100,
      },
      expenses: {
        total: totalExpenses / 100,
        categorized: categorizedExpenses / 100,
        uncategorized: uncategorizedExpenses / 100,
      },
      arrears: {
        total: totalArrears / 100,
        count: uniqueParentsInArrears.size,
        overdueBy30: overdueBy30 / 100,
        overdueBy60: overdueBy60 / 100,
        overdueBy90: overdueBy90 / 100,
      },
      enrollment: {
        total: enrollments + inactiveEnrollments,
        active: enrollments,
        inactive: inactiveEnrollments,
      },
      payments: {
        matched: matchedPayments,
        unmatched: unmatchedPayments,
        pending: 0, // No pending status in schema
      },
    };
  }

  /**
   * Get available data periods for the tenant.
   * Returns the date range of available transaction data.
   */
  async getAvailablePeriods(tenantId: string): Promise<{
    hasData: boolean;
    firstTransactionDate: string | null;
    lastTransactionDate: string | null;
    availableFinancialYears: {
      year: number;
      label: string;
      startDate: string;
      endDate: string;
    }[];
  }> {
    // Get first and last transaction dates
    const [firstTxn, lastTxn] = await Promise.all([
      this.prisma.transaction.findFirst({
        where: { tenantId, isDeleted: false },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
      this.prisma.transaction.findFirst({
        where: { tenantId, isDeleted: false },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    if (!firstTxn || !lastTxn) {
      return {
        hasData: false,
        firstTransactionDate: null,
        lastTransactionDate: null,
        availableFinancialYears: [],
      };
    }

    const firstDate = firstTxn.date;
    const lastDate = lastTxn.date;

    // Calculate available tax years (SA tax year: 1 March - 28/29 February)
    // Tax year "2025" means 1 March 2025 to 28 Feb 2026 (TY 2025/26)
    const getTaxYear = (date: Date): number => {
      const month = date.getUTCMonth();
      const year = date.getUTCFullYear();
      // If before March (month 0=Jan, 1=Feb), it belongs to previous tax year
      return month < 2 ? year - 1 : year;
    };

    const firstTY = getTaxYear(firstDate);
    const lastTY = getTaxYear(lastDate);

    const availableFinancialYears: {
      year: number;
      label: string;
      startDate: string;
      endDate: string;
    }[] = [];

    for (let ty = firstTY; ty <= lastTY; ty++) {
      availableFinancialYears.push({
        year: ty,
        label: `TY ${ty}/${(ty + 1).toString().slice(-2)}`,
        startDate: `${ty}-03-01`,
        endDate: `${ty + 1}-02-28`, // Feb 28 (simplified, handles leap years in query)
      });
    }

    return {
      hasData: true,
      firstTransactionDate: firstDate.toISOString().slice(0, 10),
      lastTransactionDate: lastDate.toISOString().slice(0, 10),
      availableFinancialYears: availableFinancialYears.reverse(), // Most recent first
    };
  }

  async getTrends(
    tenantId: string,
    period?: string,
    year?: number,
  ): Promise<DashboardTrendsResponseDto> {
    this.logger.debug(
      `Getting dashboard trends for tenant ${tenantId}, period: ${period || 'last_6_months'}, year: ${year || 'auto'}`,
    );

    let refYear: number;
    let refMonth: number;
    let monthsToShow: number;

    if (year) {
      // Year filter - show all 12 months of the SA tax year (March - February)
      // Tax year 2025 = March 2025 to February 2026
      refYear = year + 1; // End year (Feb of next year)
      refMonth = 1; // February (0-indexed)
      monthsToShow = 12;
      this.logger.debug(
        `Trends for tax year ${year}/${year + 1} (Mar ${year} - Feb ${year + 1})`,
      );
    } else {
      // No year filter - use latest transaction's month as reference
      const latestTransaction = await this.prisma.transaction.findFirst({
        where: { tenantId, isDeleted: false },
        orderBy: { date: 'desc' },
        select: { date: true },
      });

      const referenceDate = latestTransaction?.date || new Date();
      refYear = referenceDate.getUTCFullYear();
      refMonth = referenceDate.getUTCMonth();
      monthsToShow = 6;
      this.logger.debug(
        `Trends reference date: ${referenceDate.toISOString()} (latest transaction)`,
      );
    }

    const data: DashboardTrendsResponseDto['data'] = [];

    for (let i = 0; i < monthsToShow; i++) {
      // Use UTC dates to avoid timezone issues
      // Calculate start month: refMonth - (monthsToShow - 1) + i
      const monthOffset = refMonth - (monthsToShow - 1) + i;
      const monthStart = new Date(
        Date.UTC(refYear, monthOffset, 1, 0, 0, 0, 0),
      );
      const monthEnd = new Date(
        Date.UTC(refYear, monthOffset + 1, 0, 23, 59, 59, 999),
      );

      // Get income from bank transactions (credits) for this month
      const incomeTotal = await this.prisma.transaction.aggregate({
        where: {
          tenantId,
          isDeleted: false,
          isCredit: true,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: {
          amountCents: true,
        },
      });

      // Get expenses for this month
      const expenseTotal = await this.prisma.transaction.aggregate({
        where: {
          tenantId,
          isDeleted: false,
          isCredit: false,
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: {
          amountCents: true,
        },
      });

      // Get arrears for this month end
      const arrearsTotal = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          isDeleted: false,
          status: {
            in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'],
          },
          dueDate: {
            lt: monthEnd,
          },
        },
        _sum: {
          totalCents: true,
          amountPaidCents: true,
        },
      });

      // Convert cents to rands for frontend display
      const incomeCents = incomeTotal._sum.amountCents || 0;
      const expensesCents = Math.abs(expenseTotal._sum.amountCents || 0);
      const arrearsCents =
        (arrearsTotal._sum.totalCents || 0) -
        (arrearsTotal._sum.amountPaidCents || 0);

      data.push({
        date: monthStart.toISOString().slice(0, 7), // YYYY-MM format
        revenue: incomeCents / 100, // Bank income in rands
        expenses: expensesCents / 100,
        profit: (incomeCents - expensesCents) / 100,
        arrears: Math.max(0, arrearsCents) / 100,
      });
    }

    return {
      period: period || 'last_6_months',
      interval: 'monthly',
      data,
    };
  }
}
