/**
 * Parent Account Service
 * TASK-STMT-002: Payment Allocation to Invoices Service (Logic Layer)
 *
 * @module database/services/parent-account
 * @description Service for managing parent account balances and transactions
 * for statement generation. Provides methods for calculating opening balances,
 * outstanding amounts, and transaction history.
 *
 * CRITICAL: All monetary values are in CENTS as integers. Uses Decimal.js for calculations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice, Payment } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { ParentRepository } from '../repositories/parent.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { CreditBalanceService } from './credit-balance.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Summary of a parent's account for statement generation
 */
export interface ParentAccountSummary {
  parentId: string;
  parentName: string;
  email: string | null;
  phone: string | null;
  totalOutstandingCents: number;
  creditBalanceCents: number;
  netBalanceCents: number; // positive = owes, negative = credit
  childCount: number;
  oldestOutstandingDate: Date | null;
}

/**
 * Transaction record for account statement
 */
export interface AccountTransaction {
  id: string;
  date: Date;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'ADJUSTMENT';
  referenceNumber: string;
  description: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

/**
 * Input for allocating a payment to invoices
 */
export interface AllocatePaymentInput {
  tenantId: string;
  transactionId: string;
  parentId: string;
  allocations: InvoiceAllocation[];
  userId: string;
}

/**
 * Single invoice allocation within a payment
 */
export interface InvoiceAllocation {
  invoiceId: string;
  amountCents: number;
}

/**
 * Suggested allocation for FIFO payment allocation
 */
export interface SuggestedAllocation {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: Date;
  outstandingCents: number;
  suggestedAmountCents: number;
}

@Injectable()
export class ParentAccountService {
  private readonly logger = new Logger(ParentAccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parentRepo: ParentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly creditBalanceService: CreditBalanceService,
  ) {}

  /**
   * Get parent account summary for statements
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param parentId - Parent ID to get summary for
   * @returns ParentAccountSummary with balance information
   * @throws NotFoundException if parent not found
   */
  async getAccountSummary(
    tenantId: string,
    parentId: string,
  ): Promise<ParentAccountSummary> {
    this.logger.debug(`Getting account summary for parent ${parentId}`);

    // 1. Get parent info
    const parent = await this.parentRepo.findById(parentId, tenantId);
    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    // 2. Get outstanding invoices
    const totalOutstandingCents = await this.getTotalOutstanding(
      tenantId,
      parentId,
    );

    // 3. Get credit balance
    const creditBalanceCents = await this.getCreditBalance(tenantId, parentId);

    // 4. Calculate net balance (positive = owes, negative = credit)
    const netBalanceCents = new Decimal(totalOutstandingCents)
      .minus(creditBalanceCents)
      .toNumber();

    // 5. Get oldest outstanding invoice date
    const oldestOutstandingDate = await this.getOldestOutstandingDate(
      tenantId,
      parentId,
    );

    // 6. Get child count using a separate query for accuracy
    const childCount = await this.prisma.child.count({
      where: { parentId, isActive: true },
    });

    return {
      parentId: parent.id,
      parentName: `${parent.firstName} ${parent.lastName}`,
      email: parent.email,
      phone: parent.phone,
      totalOutstandingCents,
      creditBalanceCents,
      netBalanceCents,
      childCount,
      oldestOutstandingDate,
    };
  }

  /**
   * Get total outstanding invoices for parent
   * Excludes PAID, VOID, and deleted invoices
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Total outstanding in cents
   */
  async getTotalOutstanding(
    tenantId: string,
    parentId: string,
  ): Promise<number> {
    this.logger.debug(`Calculating total outstanding for parent ${parentId}`);

    const result = await this.prisma.invoice.aggregate({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        status: {
          notIn: ['PAID', 'VOID'],
        },
      },
      _sum: {
        totalCents: true,
        amountPaidCents: true,
      },
    });

    const totalCents = new Decimal(result._sum.totalCents ?? 0);
    const paidCents = new Decimal(result._sum.amountPaidCents ?? 0);
    const outstanding = totalCents.minus(paidCents);

    // Ensure we don't return negative outstanding
    return Math.max(0, outstanding.toNumber());
  }

  /**
   * Get available credit balance for parent
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Credit balance in cents
   */
  async getCreditBalance(tenantId: string, parentId: string): Promise<number> {
    this.logger.debug(`Getting credit balance for parent ${parentId}`);
    return this.creditBalanceService.getAvailableCredit(tenantId, parentId);
  }

  /**
   * Get account transactions for a statement period
   * Returns all invoices, payments, and credit notes within the period
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param periodStart - Start of statement period
   * @param periodEnd - End of statement period
   * @returns Array of AccountTransaction sorted by date
   */
  async getTransactionsForPeriod(
    tenantId: string,
    parentId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<AccountTransaction[]> {
    this.logger.debug(
      `Getting transactions for parent ${parentId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    const transactions: AccountTransaction[] = [];

    // 1. Get invoices in period (including credit notes with negative amounts)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        issueDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { issueDate: 'asc' },
    });

    for (const invoice of invoices) {
      const isCreditNote = invoice.totalCents < 0;
      transactions.push({
        id: invoice.id,
        date: invoice.issueDate,
        type: isCreditNote ? 'CREDIT_NOTE' : 'INVOICE',
        referenceNumber: invoice.invoiceNumber,
        description: isCreditNote
          ? `Credit Note: ${invoice.notes ?? 'Credit issued'}`
          : `Invoice for billing period`,
        debitCents: isCreditNote ? 0 : invoice.totalCents,
        creditCents: isCreditNote ? Math.abs(invoice.totalCents) : 0,
        runningBalanceCents: 0, // Will be calculated after sorting
      });
    }

    // 2. Get payments in period
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        isReversed: false,
        paymentDate: {
          gte: periodStart,
          lte: periodEnd,
        },
        invoice: {
          parentId,
        },
      },
      include: {
        transaction: true,
        invoice: {
          select: {
            invoiceNumber: true,
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });

    for (const payment of payments) {
      transactions.push({
        id: payment.id,
        date: payment.paymentDate,
        type: 'PAYMENT',
        referenceNumber:
          payment.reference ?? payment.transaction?.reference ?? 'PAYMENT',
        description: `Payment received - Invoice ${payment.invoice?.invoiceNumber ?? 'Unknown'}`,
        debitCents: 0,
        creditCents: payment.amountCents,
        runningBalanceCents: 0,
      });
    }

    // 3. Sort by date
    transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // 4. Calculate running balance (starting from opening balance)
    const openingBalance = await this.calculateOpeningBalance(
      tenantId,
      parentId,
      periodStart,
    );

    let runningBalance = new Decimal(openingBalance);
    for (const tx of transactions) {
      runningBalance = runningBalance.plus(tx.debitCents).minus(tx.creditCents);
      tx.runningBalanceCents = runningBalance.toNumber();
    }

    return transactions;
  }

  /**
   * Calculate opening balance at a specific date
   * Sum of all outstanding invoices minus payments before the date
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param asOfDate - Date to calculate balance as of
   * @returns Opening balance in cents (positive = owes, negative = credit)
   */
  async calculateOpeningBalance(
    tenantId: string,
    parentId: string,
    asOfDate: Date,
  ): Promise<number> {
    this.logger.debug(
      `Calculating opening balance for parent ${parentId} as of ${asOfDate.toISOString()}`,
    );

    // 1. Sum all invoices issued before the date (excluding VOID and deleted)
    const invoiceResult = await this.prisma.invoice.aggregate({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        status: { not: 'VOID' },
        issueDate: { lt: asOfDate },
      },
      _sum: {
        totalCents: true,
      },
    });

    const totalInvoicedCents = new Decimal(invoiceResult._sum.totalCents ?? 0);

    // 2. Sum all payments made before the date (excluding reversed)
    const paymentResult = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        isReversed: false,
        paymentDate: { lt: asOfDate },
        invoice: {
          parentId,
        },
      },
      _sum: {
        amountCents: true,
      },
    });

    const totalPaidCents = new Decimal(paymentResult._sum.amountCents ?? 0);

    // 3. Sum available credit balances created before the date
    const creditResult = await this.prisma.creditBalance.aggregate({
      where: {
        tenantId,
        parentId,
        isApplied: false,
        createdAt: { lt: asOfDate },
      },
      _sum: {
        amountCents: true,
      },
    });

    const availableCreditCents = new Decimal(
      creditResult._sum.amountCents ?? 0,
    );

    // Opening balance = total invoiced - total paid - available credits
    const openingBalance = totalInvoicedCents
      .minus(totalPaidCents)
      .minus(availableCreditCents);

    return openingBalance.toNumber();
  }

  /**
   * Suggest FIFO allocation for a payment amount
   * Returns suggested allocations for outstanding invoices, oldest first
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param paymentAmountCents - Amount to allocate
   * @returns Array of suggested allocations
   */
  async suggestFifoAllocation(
    tenantId: string,
    parentId: string,
    paymentAmountCents: number,
  ): Promise<SuggestedAllocation[]> {
    this.logger.debug(
      `Suggesting FIFO allocation for parent ${parentId}, amount ${paymentAmountCents} cents`,
    );

    if (paymentAmountCents <= 0) {
      throw new BusinessException(
        'Payment amount must be positive',
        'INVALID_PAYMENT_AMOUNT',
        { paymentAmountCents },
      );
    }

    // 1. Get all outstanding invoices, oldest first (by due date)
    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        status: {
          notIn: ['PAID', 'VOID'],
        },
        totalCents: { gt: 0 }, // Exclude credit notes
      },
      orderBy: [
        { dueDate: 'asc' },
        { issueDate: 'asc' },
        { invoiceNumber: 'asc' },
      ],
    });

    const suggestions: SuggestedAllocation[] = [];
    let remainingAmount = new Decimal(paymentAmountCents);

    // 2. Allocate to invoices in FIFO order
    for (const invoice of outstandingInvoices) {
      if (remainingAmount.lte(0)) break;

      const outstandingCents = new Decimal(invoice.totalCents).minus(
        invoice.amountPaidCents,
      );

      if (outstandingCents.lte(0)) continue;

      const suggestedAmount = Decimal.min(remainingAmount, outstandingCents);

      suggestions.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        outstandingCents: outstandingCents.toNumber(),
        suggestedAmountCents: suggestedAmount.toNumber(),
      });

      remainingAmount = remainingAmount.minus(suggestedAmount);
    }

    return suggestions;
  }

  /**
   * Get all outstanding invoices for a parent
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Array of outstanding invoices
   */
  async getOutstandingInvoices(
    tenantId: string,
    parentId: string,
  ): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        status: {
          notIn: ['PAID', 'VOID'],
        },
        totalCents: { gt: 0 }, // Exclude credit notes
      },
      orderBy: [{ dueDate: 'asc' }, { invoiceNumber: 'asc' }],
    });
  }

  /**
   * Get payment allocations for an invoice
   *
   * @param invoiceId - Invoice ID
   * @returns Array of payments allocated to this invoice
   */
  async getAllocationsForInvoice(invoiceId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: {
        invoiceId,
        isReversed: false,
      },
      include: {
        transaction: true,
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  /**
   * Get the oldest outstanding invoice date for a parent
   * @private
   */
  private async getOldestOutstandingDate(
    tenantId: string,
    parentId: string,
  ): Promise<Date | null> {
    const oldestInvoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        parentId,
        isDeleted: false,
        status: {
          notIn: ['PAID', 'VOID'],
        },
        totalCents: { gt: 0 },
      },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true },
    });

    return oldestInvoice?.dueDate ?? null;
  }

  /**
   * Calculate the total balance for a parent (for statement closing balance)
   * This is the sum of all outstanding invoices minus credits
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param asOfDate - Date to calculate balance as of (end of period)
   * @returns Balance in cents (positive = owes, negative = credit)
   */
  async calculateClosingBalance(
    tenantId: string,
    parentId: string,
    asOfDate: Date,
  ): Promise<number> {
    // Closing balance at end of period = opening balance of next day
    const nextDay = new Date(asOfDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);

    return this.calculateOpeningBalance(tenantId, parentId, nextDay);
  }
}
