/**
 * Arrears Service
 * TASK-PAY-013: Arrears Tracking and Reporting
 *
 * @module database/services/arrears
 * @description Provides comprehensive arrears reporting including aging analysis,
 * debtor tracking, payment history, and CSV export capabilities.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: Read-only reporting service - no audit log required.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Invoice, Parent, Child } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';
import { diffCalendarDays } from '../../shared/utils/date.util';
import {
  ArrearsFiltersDto,
  AgingBuckets,
  AgingBucketType,
  ArrearsReport,
  ArrearsReportSummary,
  ArrearsInvoice,
  DebtorSummary,
  ParentPaymentHistory,
  PaymentHistoryEntry,
} from '../dto/arrears.dto';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Type for invoice with parent and child relations
 */
type InvoiceWithRelations = Invoice & {
  parent: Parent;
  child: Child;
};

@Injectable()
export class ArrearsService {
  private readonly logger = new Logger(ArrearsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly parentRepo: ParentRepository,
  ) {}

  /**
   * Generate comprehensive arrears report with aging analysis
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param filters - Optional filters for date range, parent, and minimum amount
   * @returns Complete arrears report with summary, top debtors, and invoice details
   *
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for database errors
   */
  async getArrearsReport(
    tenantId: string,
    filters?: ArrearsFiltersDto,
  ): Promise<ArrearsReport> {
    this.logger.log(`Generating arrears report for tenant ${tenantId}`);

    try {
      // Build where clause for invoices query
      const where: Prisma.InvoiceWhereInput = {
        tenantId,
        isDeleted: false,
        status: {
          in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'],
        },
      };

      // Apply filters
      if (filters?.dateFrom || filters?.dateTo) {
        where.dueDate = {
          ...(filters.dateFrom && { gte: filters.dateFrom }),
          ...(filters.dateTo && { lte: filters.dateTo }),
        };
      }

      if (filters?.parentId) {
        where.parentId = filters.parentId;
      }

      // Fetch invoices with parent and child relations
      const invoicesRaw = await this.prisma.invoice.findMany({
        where,
        include: {
          parent: true,
          child: true,
        },
        orderBy: [{ dueDate: 'asc' }, { invoiceNumber: 'asc' }],
      });

      // Filter for outstanding balance > 0 and apply minAmountCents filter
      const invoices = invoicesRaw.filter((inv) => {
        const outstanding = inv.totalCents - inv.amountPaidCents;
        if (outstanding <= 0) return false;
        if (filters?.minAmountCents && outstanding < filters.minAmountCents) {
          return false;
        }
        return true;
      }) as InvoiceWithRelations[];

      // Calculate aging buckets
      const aging = this.calculateAging(invoices);

      // Get top debtors (limit to 10 by default)
      const topDebtors = await this.getTopDebtors(tenantId, 10);

      // Build arrears invoice list
      const arrearsInvoices: ArrearsInvoice[] = invoices.map((inv) => {
        const outstandingCents = inv.totalCents - inv.amountPaidCents;
        const daysOverdue = this.calculateDaysOverdue(inv.dueDate);
        const agingBucket = this.categorizeByAgingBucket(daysOverdue);

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          parentId: inv.parentId,
          parentName: `${inv.parent.firstName} ${inv.parent.lastName}`,
          childId: inv.childId,
          childName: `${inv.child.firstName} ${inv.child.lastName}`,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          totalCents: inv.totalCents,
          amountPaidCents: inv.amountPaidCents,
          outstandingCents,
          daysOverdue,
          agingBucket,
        };
      });

      // Calculate summary
      const summary: ArrearsReportSummary = {
        totalOutstandingCents: arrearsInvoices.reduce(
          (sum, inv) => sum + inv.outstandingCents,
          0,
        ),
        totalInvoices: arrearsInvoices.length,
        aging,
      };

      const report: ArrearsReport = {
        summary,
        topDebtors,
        invoices: arrearsInvoices,
        generatedAt: new Date(),
      };

      this.logger.log(
        `Arrears report generated: ${summary.totalInvoices} invoices, R${(summary.totalOutstandingCents / 100).toFixed(2)} outstanding`,
      );

      return report;
    } catch (error) {
      this.logger.error(
        `Failed to generate arrears report for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getArrearsReport',
        'Failed to generate arrears report',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate aging buckets from invoices
   *
   * STANDARDIZED aging categories (TASK-BILL-006):
   * - current: 1-30 days overdue (due but within grace period)
   * - 30: 31-60 days overdue
   * - 60: 61-90 days overdue
   * - 90+: >90 days overdue
   *
   * NOTE: Invoices not yet due (daysOverdue <= 0) are NOT in arrears
   * and should not be included in this calculation.
   *
   * @param invoices - Array of invoices with relations
   * @returns Aging buckets with amounts in cents
   */
  calculateAging(invoices: InvoiceWithRelations[]): AgingBuckets {
    let currentCents = new Decimal(0);
    let days30Cents = new Decimal(0);
    let days60Cents = new Decimal(0);
    let days90PlusCents = new Decimal(0);

    for (const invoice of invoices) {
      const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
      const outstanding = new Decimal(outstandingCents);
      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);

      // Skip invoices not yet due (not in arrears)
      if (daysOverdue <= 0) {
        continue;
      }

      if (daysOverdue <= 30) {
        // 1-30 days overdue: current bucket
        currentCents = currentCents.add(outstanding);
      } else if (daysOverdue <= 60) {
        // 31-60 days overdue: 30-day bucket
        days30Cents = days30Cents.add(outstanding);
      } else if (daysOverdue <= 90) {
        // 61-90 days overdue: 60-day bucket
        days60Cents = days60Cents.add(outstanding);
      } else {
        // >90 days overdue: 90+ bucket
        days90PlusCents = days90PlusCents.add(outstanding);
      }
    }

    return {
      currentCents: currentCents
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber(),
      days30Cents: days30Cents
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber(),
      days60Cents: days60Cents
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber(),
      days90PlusCents: days90PlusCents
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber(),
    };
  }

  /**
   * Get payment history for a specific parent
   *
   * @param parentId - Parent UUID
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @returns Complete payment history with statistics
   *
   * @throws NotFoundException if parent doesn't exist
   * @throws DatabaseException for database errors
   */
  async getParentHistory(
    parentId: string,
    tenantId: string,
  ): Promise<ParentPaymentHistory> {
    this.logger.log(`Getting payment history for parent ${parentId}`);

    try {
      // Verify parent exists
      const parent = await this.parentRepo.findById(parentId, tenantId);
      if (!parent) {
        throw new NotFoundException('Parent', parentId);
      }

      // Get all invoices for parent
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          parentId,
          isDeleted: false,
        },
        include: {
          payments: {
            orderBy: { paymentDate: 'asc' },
          },
        },
        orderBy: [{ issueDate: 'desc' }],
      });

      let totalInvoicedCents = new Decimal(0);
      let totalPaidCents = new Decimal(0);
      let totalOutstandingCents = new Decimal(0);
      let onTimePaymentCount = 0;
      let latePaymentCount = 0;
      const daysToPaymentList: number[] = [];

      const paymentHistory: PaymentHistoryEntry[] = [];

      for (const invoice of invoices) {
        totalInvoicedCents = totalInvoicedCents.add(invoice.totalCents);
        totalPaidCents = totalPaidCents.add(invoice.amountPaidCents);
        totalOutstandingCents = totalOutstandingCents.add(
          invoice.totalCents - invoice.amountPaidCents,
        );

        // Determine payment status and calculate days to payment
        let status: 'paid' | 'partial' | 'overdue';
        let paidDate: Date | null = null;
        let daysToPayment: number | null = null;

        if (invoice.amountPaidCents >= invoice.totalCents) {
          status = 'paid';
          // Use the latest payment date as the paid date
          if (invoice.payments.length > 0) {
            paidDate =
              invoice.payments[invoice.payments.length - 1].paymentDate;
            daysToPayment = this.calculateDaysBetween(
              invoice.dueDate,
              paidDate,
            );
            daysToPaymentList.push(daysToPayment);

            if (daysToPayment <= 0) {
              onTimePaymentCount++;
            } else {
              latePaymentCount++;
            }
          }
        } else if (invoice.amountPaidCents > 0) {
          status = 'partial';
        } else {
          status = 'overdue';
        }

        paymentHistory.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          paidDate,
          totalCents: invoice.totalCents,
          paidCents: invoice.amountPaidCents,
          daysToPayment,
          status,
        });
      }

      // Calculate average days to payment
      const averageDaysToPayment =
        daysToPaymentList.length > 0
          ? daysToPaymentList.reduce((sum, days) => sum + days, 0) /
            daysToPaymentList.length
          : 0;

      return {
        parentId: parent.id,
        parentName: `${parent.firstName} ${parent.lastName}`,
        totalInvoicedCents: totalInvoicedCents
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        totalPaidCents: totalPaidCents
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        totalOutstandingCents: totalOutstandingCents
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        onTimePaymentCount,
        latePaymentCount,
        averageDaysToPayment: Math.round(averageDaysToPayment),
        paymentHistory,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get payment history for parent ${parentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getParentHistory',
        'Failed to get payment history',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get top debtors sorted by outstanding amount
   *
   * Uses raw SQL for performance optimization when dealing with large datasets.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param limit - Maximum number of debtors to return (default: 10)
   * @returns Array of debtor summaries sorted by outstanding amount (descending)
   *
   * @throws DatabaseException for database errors
   */
  async getTopDebtors(
    tenantId: string,
    limit: number = 10,
  ): Promise<DebtorSummary[]> {
    this.logger.log(`Getting top ${limit} debtors for tenant ${tenantId}`);

    try {
      const results = await this.prisma.$queryRaw<
        Array<{
          id: string;
          parent_name: string;
          email: string | null;
          phone: string | null;
          total_outstanding_cents: bigint;
          oldest_invoice_date: Date;
          invoice_count: bigint;
          max_days_overdue: number;
        }>
      >`
        SELECT
          p.id,
          p.first_name || ' ' || p.last_name as parent_name,
          p.email,
          p.phone,
          SUM(i.total_cents - i.amount_paid_cents) as total_outstanding_cents,
          MIN(i.due_date) as oldest_invoice_date,
          COUNT(i.id) as invoice_count,
          MAX((CURRENT_DATE - i.due_date)::integer) as max_days_overdue
        FROM parents p
        INNER JOIN invoices i ON i.parent_id = p.id
        WHERE i.tenant_id = ${tenantId}
          AND i.is_deleted = false
          AND i.status IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
          AND (i.total_cents - i.amount_paid_cents) > 0
        GROUP BY p.id, p.first_name, p.last_name, p.email, p.phone
        ORDER BY total_outstanding_cents DESC
        LIMIT ${limit}
      `;

      return results.map((row) => ({
        parentId: row.id,
        parentName: row.parent_name,
        parentEmail: row.email,
        parentPhone: row.phone,
        totalOutstandingCents: Number(row.total_outstanding_cents),
        oldestInvoiceDate: row.oldest_invoice_date,
        invoiceCount: Number(row.invoice_count),
        maxDaysOverdue: Math.max(0, Math.floor(row.max_days_overdue)),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get top debtors for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getTopDebtors',
        'Failed to get top debtors',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Export arrears report to CSV format
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param filters - Optional filters for the report
   * @returns CSV string with proper escaping
   *
   * @throws DatabaseException for database errors
   */
  async exportArrearsCSV(
    tenantId: string,
    filters?: ArrearsFiltersDto,
  ): Promise<string> {
    this.logger.log(`Exporting arrears to CSV for tenant ${tenantId}`);

    try {
      const report = await this.getArrearsReport(tenantId, filters);

      // CSV Headers
      const headers = [
        'Invoice Number',
        'Parent Name',
        'Child Name',
        'Issue Date',
        'Due Date',
        'Total (ZAR)',
        'Paid (ZAR)',
        'Outstanding (ZAR)',
        'Days Overdue',
        'Aging Bucket',
      ];

      const rows: string[] = [headers.join(',')];

      // Add data rows
      for (const invoice of report.invoices) {
        const row = [
          this.escapeCsvValue(invoice.invoiceNumber),
          this.escapeCsvValue(invoice.parentName),
          this.escapeCsvValue(invoice.childName),
          invoice.issueDate.toISOString().split('T')[0],
          invoice.dueDate.toISOString().split('T')[0],
          (invoice.totalCents / 100).toFixed(2),
          (invoice.amountPaidCents / 100).toFixed(2),
          (invoice.outstandingCents / 100).toFixed(2),
          invoice.daysOverdue.toString(),
          invoice.agingBucket,
        ];
        rows.push(row.join(','));
      }

      return rows.join('\n');
    } catch (error) {
      this.logger.error(
        `Failed to export arrears CSV for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'exportArrearsCSV',
        'Failed to export arrears CSV',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate number of days overdue for an invoice (timezone-safe for @db.Date)
   *
   * @param dueDate - Invoice due date
   * @returns Days overdue (0 if not yet overdue, positive if overdue)
   */
  private calculateDaysOverdue(dueDate: Date): number {
    return Math.max(0, diffCalendarDays(dueDate, new Date()));
  }

  /**
   * Calculate days between two dates (timezone-safe for @db.Date)
   *
   * @param fromDate - Start date (e.g., due date)
   * @param toDate - End date (e.g., payment date)
   * @returns Days between dates (negative if toDate is before fromDate)
   */
  private calculateDaysBetween(fromDate: Date, toDate: Date): number {
    return diffCalendarDays(fromDate, toDate);
  }

  /**
   * Categorize invoice by aging bucket based on days overdue
   *
   * STANDARDIZED aging categories (TASK-BILL-006):
   * - current: 1-30 days overdue (due but within grace period)
   * - 30: 31-60 days overdue
   * - 60: 61-90 days overdue
   * - 90+: >90 days overdue
   *
   * NOTE: Invoices not yet due (daysOverdue <= 0) are still categorized
   * as 'current' for display purposes, but should not be in arrears.
   *
   * @param daysOverdue - Number of days overdue
   * @returns Aging bucket type
   */
  private categorizeByAgingBucket(daysOverdue: number): AgingBucketType {
    if (daysOverdue <= 30) {
      // 0-30 days: current bucket (includes not yet due for categorization)
      return 'current';
    } else if (daysOverdue <= 60) {
      // 31-60 days: 30-day bucket
      return '30';
    } else if (daysOverdue <= 90) {
      // 61-90 days: 60-day bucket
      return '60';
    } else {
      // >90 days: 90+ bucket
      return '90+';
    }
  }

  /**
   * Escape CSV value for proper formatting
   *
   * @param value - Value to escape
   * @returns Escaped CSV value
   */
  private escapeCsvValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }
}
