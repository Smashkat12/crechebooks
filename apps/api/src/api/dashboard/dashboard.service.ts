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

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get invoice metrics
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

    return {
      period: period || 'current_month',
      revenue: {
        total: totalCollected,
        invoiced: totalInvoiced,
        collected: totalCollected,
        outstanding,
      },
      expenses: {
        total: totalExpenses,
        categorized: categorizedExpenses,
        uncategorized: uncategorizedExpenses,
      },
      arrears: {
        total: totalArrears,
        count: uniqueParentsInArrears.size,
        overdueBy30,
        overdueBy60,
        overdueBy90,
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

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const data: DashboardTrendsResponseDto['data'] = [];

    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - 4 + i, 0);

      // Get revenue for this month
      const invoiceTotal = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          isDeleted: false,
          issueDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: {
          amountPaidCents: true,
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

      const revenue = invoiceTotal._sum.amountPaidCents || 0;
      const expenses = Math.abs(expenseTotal._sum.amountCents || 0);
      const arrears =
        (arrearsTotal._sum.totalCents || 0) -
        (arrearsTotal._sum.amountPaidCents || 0);

      data.push({
        date: monthStart.toISOString().slice(0, 7), // YYYY-MM format
        revenue,
        expenses,
        profit: revenue - expenses,
        arrears: Math.max(0, arrears),
      });
    }

    return {
      period: period || 'last_6_months',
      interval: 'monthly',
      data,
    };
  }
}
