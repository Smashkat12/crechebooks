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
  ): Promise<DashboardMetricsResponseDto> {
    this.logger.debug(
      `Getting dashboard metrics for tenant ${tenantId}, period: ${period || 'current_month'}`,
    );

    // Find the most recent transaction date to determine which month to show
    const latestTransaction = await this.prisma.transaction.findFirst({
      where: { tenantId, isDeleted: false },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    // Use the latest transaction's month, or current month if no transactions
    const referenceDate = latestTransaction?.date || new Date();
    // Use UTC dates to avoid timezone issues
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();
    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

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

  async getTrends(
    tenantId: string,
    period?: string,
  ): Promise<DashboardTrendsResponseDto> {
    this.logger.debug(
      `Getting dashboard trends for tenant ${tenantId}, period: ${period || 'last_6_months'}`,
    );

    // Find the most recent transaction date to determine the reference point
    const latestTransaction = await this.prisma.transaction.findFirst({
      where: { tenantId, isDeleted: false },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    // Use the latest transaction's month as reference, or current date if no transactions
    const referenceDate = latestTransaction?.date || new Date();
    const refYear = referenceDate.getUTCFullYear();
    const refMonth = referenceDate.getUTCMonth();
    this.logger.debug(
      `Trends reference date: ${referenceDate.toISOString()} (latest transaction)`,
    );

    const data: DashboardTrendsResponseDto['data'] = [];

    for (let i = 0; i < 6; i++) {
      // Use UTC dates to avoid timezone issues
      const monthStart = new Date(
        Date.UTC(refYear, refMonth - 5 + i, 1, 0, 0, 0, 0),
      );
      const monthEnd = new Date(
        Date.UTC(refYear, refMonth - 4 + i, 0, 23, 59, 59, 999),
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
