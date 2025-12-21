/**
 * Financial Report Service
 * TASK-RECON-013: Financial Report Service
 *
 * @module database/services/financial-report
 * @description Service for generating formal financial reports.
 * Generates Income Statements, Balance Sheets, and Trial Balances per SA accounting standards.
 * All amounts are in CENTS as integers. Uses Decimal.js for precise calculations.
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import {
  IncomeStatement,
  BalanceSheet,
  TrialBalance,
  AccountBreakdown,
  TrialBalanceAccount,
} from '../dto/financial-report.dto';
import {
  isIncomeAccount,
  isExpenseAccount,
  isAssetAccount,
  isLiabilityAccount,
  isEquityAccount,
  DEFAULT_ACCOUNTS,
} from '../constants/chart-of-accounts.constants';
import { BusinessException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

@Injectable()
export class FinancialReportService {
  private readonly logger = new Logger(FinancialReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
  ) {}

  /**
   * Generate Income Statement (Profit & Loss) for a period
   * Formula: Revenue - Expenses = Net Profit
   *
   * @param tenantId - Tenant ID for isolation
   * @param periodStart - Period start date
   * @param periodEnd - Period end date
   * @returns IncomeStatement with income, expenses, and net profit
   * @throws BusinessException if period dates are invalid
   */
  async generateIncomeStatement(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<IncomeStatement> {
    this.logger.log(
      `Generating Income Statement for tenant ${tenantId}, period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Validate period
    if (periodStart > periodEnd) {
      throw new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      );
    }

    // Get school fees income from paid invoices (filter by payment date range using payments)
    const paidInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        payments: {
          some: {
            paymentDate: { gte: periodStart, lte: periodEnd },
            isReversed: false,
          },
        },
      },
      include: {
        lines: true,
      },
    });

    // Calculate income from invoices (use amountPaidCents as income recognized)
    const incomeByAccount = new Map<string, Decimal>();
    for (const invoice of paidInvoices) {
      const accountCode = DEFAULT_ACCOUNTS.SCHOOL_FEES.code;
      const current = incomeByAccount.get(accountCode) || new Decimal(0);
      incomeByAccount.set(accountCode, current.plus(invoice.amountPaidCents));
    }

    // Get expense transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    // Calculate expenses by account code
    const expensesByAccount = new Map<string, Decimal>();
    for (const tx of transactions) {
      const accountCode =
        tx.categorizations?.[0]?.accountCode ||
        DEFAULT_ACCOUNTS.BANK_CHARGES.code;

      // Only include expense accounts (5xxx-8xxx)
      if (isExpenseAccount(accountCode) && !tx.isCredit) {
        const current = expensesByAccount.get(accountCode) || new Decimal(0);
        expensesByAccount.set(accountCode, current.plus(tx.amountCents));
      }
    }

    // Build income breakdown
    const incomeBreakdown: AccountBreakdown[] = Array.from(
      incomeByAccount.entries(),
    ).map(([code, amount]) => ({
      accountCode: code,
      accountName: DEFAULT_ACCOUNTS.SCHOOL_FEES.name,
      amountCents: amount.toNumber(),
      amountRands: amount.dividedBy(100).toDecimalPlaces(2).toNumber(),
    }));

    // Build expense breakdown
    const expenseBreakdown: AccountBreakdown[] = Array.from(
      expensesByAccount.entries(),
    ).map(([code, amount]) => ({
      accountCode: code,
      accountName: this.getAccountName(code),
      amountCents: amount.toNumber(),
      amountRands: amount.dividedBy(100).toDecimalPlaces(2).toNumber(),
    }));

    // Calculate totals
    const totalIncomeCents = Array.from(incomeByAccount.values()).reduce(
      (sum, val) => sum.plus(val),
      new Decimal(0),
    );

    const totalExpensesCents = Array.from(expensesByAccount.values()).reduce(
      (sum, val) => sum.plus(val),
      new Decimal(0),
    );

    const netProfitCents = totalIncomeCents.minus(totalExpensesCents);

    return {
      tenantId,
      period: { start: periodStart, end: periodEnd },
      income: {
        totalCents: totalIncomeCents.toNumber(),
        totalRands: totalIncomeCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        breakdown: incomeBreakdown,
      },
      expenses: {
        totalCents: totalExpensesCents.toNumber(),
        totalRands: totalExpensesCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        breakdown: expenseBreakdown,
      },
      netProfitCents: netProfitCents.toNumber(),
      netProfitRands: netProfitCents
        .dividedBy(100)
        .toDecimalPlaces(2)
        .toNumber(),
      generatedAt: new Date(),
    };
  }

  /**
   * Generate Balance Sheet as of a specific date
   * Formula: Assets = Liabilities + Equity
   *
   * @param tenantId - Tenant ID for isolation
   * @param asOfDate - Date for balance sheet snapshot
   * @returns BalanceSheet with assets, liabilities, equity, and balance check
   */
  async generateBalanceSheet(
    tenantId: string,
    asOfDate: Date,
  ): Promise<BalanceSheet> {
    this.logger.log(
      `Generating Balance Sheet for tenant ${tenantId} as of ${asOfDate.toISOString()}`,
    );

    // Calculate accounts receivable from outstanding invoices
    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueDate: { lte: asOfDate },
      },
    });

    const accountsReceivableCents = outstandingInvoices.reduce(
      (sum, inv) => sum.plus(inv.totalCents - inv.amountPaidCents),
      new Decimal(0),
    );

    // Get bank balance from transactions up to asOfDate
    const bankTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asOfDate },
        isDeleted: false,
      },
    });

    let bankBalanceCents = new Decimal(0);
    for (const tx of bankTransactions) {
      if (tx.isCredit) {
        bankBalanceCents = bankBalanceCents.plus(tx.amountCents);
      } else {
        bankBalanceCents = bankBalanceCents.minus(tx.amountCents);
      }
    }

    // Build asset accounts
    const currentAssets: AccountBreakdown[] = [
      {
        accountCode: DEFAULT_ACCOUNTS.BANK.code,
        accountName: DEFAULT_ACCOUNTS.BANK.name,
        amountCents: bankBalanceCents.toNumber(),
        amountRands: bankBalanceCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      },
      {
        accountCode: DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        amountCents: accountsReceivableCents.toNumber(),
        amountRands: accountsReceivableCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      },
    ];

    const nonCurrentAssets: AccountBreakdown[] = [];

    const totalAssetsCents = currentAssets
      .reduce((sum, acc) => sum.plus(acc.amountCents), new Decimal(0))
      .plus(
        nonCurrentAssets.reduce(
          (sum, acc) => sum.plus(acc.amountCents),
          new Decimal(0),
        ),
      );

    // For now, no liabilities or equity data (would come from other sources)
    const currentLiabilities: AccountBreakdown[] = [];
    const nonCurrentLiabilities: AccountBreakdown[] = [];
    const equityBreakdown: AccountBreakdown[] = [];

    const totalLiabilitiesCents = currentLiabilities
      .reduce((sum, acc) => sum.plus(acc.amountCents), new Decimal(0))
      .plus(
        nonCurrentLiabilities.reduce(
          (sum, acc) => sum.plus(acc.amountCents),
          new Decimal(0),
        ),
      );

    const totalEquityCents = equityBreakdown.reduce(
      (sum, acc) => sum.plus(acc.amountCents),
      new Decimal(0),
    );

    // Check if balanced: Assets = Liabilities + Equity (within 1 cent tolerance)
    const difference = totalAssetsCents
      .minus(totalLiabilitiesCents)
      .minus(totalEquityCents);
    const isBalanced = difference.abs().lte(1);

    return {
      tenantId,
      asOfDate,
      assets: {
        totalCents: totalAssetsCents.toNumber(),
        totalRands: totalAssetsCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        current: currentAssets,
        nonCurrent: nonCurrentAssets,
      },
      liabilities: {
        totalCents: totalLiabilitiesCents.toNumber(),
        totalRands: totalLiabilitiesCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        current: currentLiabilities,
        nonCurrent: nonCurrentLiabilities,
      },
      equity: {
        totalCents: totalEquityCents.toNumber(),
        totalRands: totalEquityCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        breakdown: equityBreakdown,
      },
      isBalanced,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate Trial Balance as of a specific date
   * Lists all accounts with debits and credits
   * Validates that Total Debits = Total Credits
   *
   * @param tenantId - Tenant ID for isolation
   * @param asOfDate - Date for trial balance snapshot
   * @returns TrialBalance with all accounts and balance check
   */
  async generateTrialBalance(
    tenantId: string,
    asOfDate: Date,
  ): Promise<TrialBalance> {
    this.logger.log(
      `Generating Trial Balance for tenant ${tenantId} as of ${asOfDate.toISOString()}`,
    );

    // Get all transactions up to asOfDate
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asOfDate },
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    // Group by account code
    const accountBalances = new Map<
      string,
      { debits: Decimal; credits: Decimal; name: string }
    >();

    for (const tx of transactions) {
      const accountCode =
        tx.categorizations?.[0]?.accountCode || DEFAULT_ACCOUNTS.BANK.code;
      const accountName = this.getAccountName(accountCode);

      if (!accountBalances.has(accountCode)) {
        accountBalances.set(accountCode, {
          debits: new Decimal(0),
          credits: new Decimal(0),
          name: accountName,
        });
      }

      const account = accountBalances.get(accountCode)!;
      if (tx.isCredit) {
        account.credits = account.credits.plus(tx.amountCents);
      } else {
        account.debits = account.debits.plus(tx.amountCents);
      }
    }

    // Add income from invoices (credits) - use payments to determine date
    const paidInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        payments: {
          some: {
            paymentDate: { lte: asOfDate },
            isReversed: false,
          },
        },
      },
    });

    const incomeAccountCode = DEFAULT_ACCOUNTS.SCHOOL_FEES.code;
    if (!accountBalances.has(incomeAccountCode)) {
      accountBalances.set(incomeAccountCode, {
        debits: new Decimal(0),
        credits: new Decimal(0),
        name: DEFAULT_ACCOUNTS.SCHOOL_FEES.name,
      });
    }

    const incomeAccount = accountBalances.get(incomeAccountCode)!;
    for (const invoice of paidInvoices) {
      incomeAccount.credits = incomeAccount.credits.plus(
        invoice.amountPaidCents,
      );
    }

    // Build trial balance accounts
    const accounts: TrialBalanceAccount[] = Array.from(
      accountBalances.entries(),
    ).map(([code, balance]) => ({
      accountCode: code,
      accountName: balance.name,
      debitCents: balance.debits.toNumber(),
      creditCents: balance.credits.toNumber(),
      debitRands: balance.debits.dividedBy(100).toDecimalPlaces(2).toNumber(),
      creditRands: balance.credits.dividedBy(100).toDecimalPlaces(2).toNumber(),
    }));

    // Calculate totals
    const totalDebitsCents = accounts.reduce(
      (sum, acc) => sum.plus(acc.debitCents),
      new Decimal(0),
    );

    const totalCreditsCents = accounts.reduce(
      (sum, acc) => sum.plus(acc.creditCents),
      new Decimal(0),
    );

    // Check if balanced (within 1 cent tolerance)
    const difference = totalDebitsCents.minus(totalCreditsCents);
    const isBalanced = difference.abs().lte(1);

    return {
      tenantId,
      asOfDate,
      accounts,
      totals: {
        debitsCents: totalDebitsCents.toNumber(),
        creditsCents: totalCreditsCents.toNumber(),
        debitsRands: totalDebitsCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        creditsRands: totalCreditsCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      },
      isBalanced,
      generatedAt: new Date(),
    };
  }

  /**
   * Export report to PDF format
   * @throws BusinessException NOT_IMPLEMENTED
   */
  exportPDF(
    report: IncomeStatement | BalanceSheet | TrialBalance,
  ): Promise<Buffer> {
    throw new BusinessException(
      'PDF export not yet implemented',
      'NOT_IMPLEMENTED',
      {
        reportType: 'tenantId' in report ? typeof report : 'unknown',
      },
    );
  }

  /**
   * Export report to Excel format
   * @throws BusinessException NOT_IMPLEMENTED
   */
  exportExcel(
    report: IncomeStatement | BalanceSheet | TrialBalance,
  ): Promise<Buffer> {
    throw new BusinessException(
      'Excel export not yet implemented',
      'NOT_IMPLEMENTED',
      {
        reportType: 'tenantId' in report ? typeof report : 'unknown',
      },
    );
  }

  /**
   * Get account name from account code
   * Uses DEFAULT_ACCOUNTS mapping or generates name from code
   */
  private getAccountName(code: string): string {
    const defaultAccount = Object.values(DEFAULT_ACCOUNTS).find(
      (acc) => acc.code === code,
    );
    if (defaultAccount) {
      return defaultAccount.name;
    }

    // Generate name based on account code range
    if (isIncomeAccount(code)) return `Income Account ${code}`;
    if (isExpenseAccount(code)) return `Expense Account ${code}`;
    if (isAssetAccount(code)) return `Asset Account ${code}`;
    if (isLiabilityAccount(code)) return `Liability Account ${code}`;
    if (isEquityAccount(code)) return `Equity Account ${code}`;

    return `Account ${code}`;
  }
}
