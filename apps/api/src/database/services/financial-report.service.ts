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
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
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
  isCurrentAsset,
  isCurrentLiability,
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

    // Build account name lookup from xero_accounts (tenant-specific Xero chart)
    const xeroAccounts = await this.prisma.xeroAccount.findMany({
      where: { tenantId },
    });
    const accountNameMap = new Map<string, string>();
    for (const xa of xeroAccounts) {
      accountNameMap.set(xa.accountCode, xa.name);
    }

    // Get all non-deleted transactions for the period
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
      },
    });

    // Separate income and expenses using xero_account_code
    const incomeByAccount = new Map<string, Decimal>();
    const expensesByAccount = new Map<string, Decimal>();

    for (const tx of transactions) {
      const accountCode = tx.xeroAccountCode || '9999';

      if (tx.isCredit) {
        // Credit transactions are income (or equity injections)
        if (isIncomeAccount(accountCode) || isEquityAccount(accountCode)) {
          const current = incomeByAccount.get(accountCode) || new Decimal(0);
          incomeByAccount.set(accountCode, current.plus(tx.amountCents));
        } else {
          // Credit to an expense account = refund/reversal, reduce expenses
          const current = expensesByAccount.get(accountCode) || new Decimal(0);
          expensesByAccount.set(accountCode, current.minus(tx.amountCents));
        }
      } else {
        // Debit transactions
        if (isExpenseAccount(accountCode)) {
          const current = expensesByAccount.get(accountCode) || new Decimal(0);
          expensesByAccount.set(accountCode, current.plus(tx.amountCents));
        } else if (isIncomeAccount(accountCode)) {
          // Debit to income account = reversal/refund, reduce income
          const current = incomeByAccount.get(accountCode) || new Decimal(0);
          incomeByAccount.set(accountCode, current.minus(tx.amountCents));
        }
      }
    }

    // Remove accounts with zero or negative net balances
    for (const [code, amount] of expensesByAccount) {
      if (amount.lte(0)) expensesByAccount.delete(code);
    }
    for (const [code, amount] of incomeByAccount) {
      if (amount.lte(0)) incomeByAccount.delete(code);
    }

    // Build income breakdown
    const incomeBreakdown: AccountBreakdown[] = Array.from(
      incomeByAccount.entries(),
    )
      .map(([code, amount]) => ({
        accountCode: code,
        accountName:
          accountNameMap.get(code) || this.getAccountName(code),
        amountCents: amount.toNumber(),
        amountRands: amount.dividedBy(100).toDecimalPlaces(2).toNumber(),
      }))
      .sort((a, b) => b.amountCents - a.amountCents);

    // Build expense breakdown
    const expenseBreakdown: AccountBreakdown[] = Array.from(
      expensesByAccount.entries(),
    )
      .map(([code, amount]) => ({
        accountCode: code,
        accountName:
          accountNameMap.get(code) || this.getAccountName(code),
        amountCents: amount.toNumber(),
        amountRands: amount.dividedBy(100).toDecimalPlaces(2).toNumber(),
      }))
      .sort((a, b) => b.amountCents - a.amountCents);

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

    // Build account name lookup from xero_accounts
    const xeroAccounts = await this.prisma.xeroAccount.findMany({
      where: { tenantId },
    });
    const accountNameMap = new Map<string, string>();
    for (const xa of xeroAccounts) {
      accountNameMap.set(xa.accountCode, xa.name);
    }

    // Get all non-deleted transactions up to asOfDate
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asOfDate },
        isDeleted: false,
      },
    });

    // Calculate bank balance (all transactions flow through the bank account)
    let bankBalanceCents = new Decimal(0);
    // Track balances for non-bank asset, liability, and equity accounts
    const accountBalances = new Map<string, Decimal>();
    // Track accumulated income and expenses for retained earnings
    let totalIncomeCents = new Decimal(0);
    let totalExpensesCents = new Decimal(0);

    for (const tx of transactions) {
      const accountCode = tx.xeroAccountCode || '9999';

      // Every transaction affects the bank balance
      if (tx.isCredit) {
        bankBalanceCents = bankBalanceCents.plus(tx.amountCents);
      } else {
        bankBalanceCents = bankBalanceCents.minus(tx.amountCents);
      }

      // Track income and expenses for retained earnings calculation
      if (isIncomeAccount(accountCode) || isEquityAccount(accountCode)) {
        if (tx.isCredit) {
          totalIncomeCents = totalIncomeCents.plus(tx.amountCents);
        } else {
          totalIncomeCents = totalIncomeCents.minus(tx.amountCents);
        }
      } else if (isExpenseAccount(accountCode)) {
        if (tx.isCredit) {
          // Refund reduces expenses
          totalExpensesCents = totalExpensesCents.minus(tx.amountCents);
        } else {
          totalExpensesCents = totalExpensesCents.plus(tx.amountCents);
        }
      } else if (isAssetAccount(accountCode) && accountCode !== '1035') {
        // Non-bank asset account — debit increases, credit decreases
        const current = accountBalances.get(accountCode) || new Decimal(0);
        if (tx.isCredit) {
          accountBalances.set(accountCode, current.minus(tx.amountCents));
        } else {
          accountBalances.set(accountCode, current.plus(tx.amountCents));
        }
      } else if (isLiabilityAccount(accountCode)) {
        // Liability account — credit increases, debit decreases
        const current = accountBalances.get(accountCode) || new Decimal(0);
        if (tx.isCredit) {
          accountBalances.set(accountCode, current.plus(tx.amountCents));
        } else {
          accountBalances.set(accountCode, current.minus(tx.amountCents));
        }
      }
    }

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

    // Build current assets
    const currentAssets: AccountBreakdown[] = [];

    // Bank account
    if (!bankBalanceCents.isZero()) {
      currentAssets.push({
        accountCode: DEFAULT_ACCOUNTS.SAVINGS_ACCOUNT.code,
        accountName:
          accountNameMap.get(DEFAULT_ACCOUNTS.SAVINGS_ACCOUNT.code) ||
          DEFAULT_ACCOUNTS.SAVINGS_ACCOUNT.name,
        amountCents: bankBalanceCents.toNumber(),
        amountRands: bankBalanceCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      });
    }

    // Accounts receivable
    if (!accountsReceivableCents.isZero()) {
      currentAssets.push({
        accountCode: DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName:
          accountNameMap.get(DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.code) ||
          DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        amountCents: accountsReceivableCents.toNumber(),
        amountRands: accountsReceivableCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      });
    }

    // Other asset accounts from transactions
    const nonCurrentAssets: AccountBreakdown[] = [];
    for (const [code, balance] of accountBalances) {
      if (!isAssetAccount(code) || balance.isZero()) continue;
      const item: AccountBreakdown = {
        accountCode: code,
        accountName: accountNameMap.get(code) || this.getAccountName(code),
        amountCents: balance.toNumber(),
        amountRands: balance.dividedBy(100).toDecimalPlaces(2).toNumber(),
      };
      if (isCurrentAsset(code)) {
        currentAssets.push(item);
      } else {
        nonCurrentAssets.push(item);
      }
    }

    // Sort by account code
    currentAssets.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    nonCurrentAssets.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    // Build liabilities from transaction-based accounts
    const currentLiabilities: AccountBreakdown[] = [];
    const nonCurrentLiabilities: AccountBreakdown[] = [];
    for (const [code, balance] of accountBalances) {
      if (!isLiabilityAccount(code) || balance.isZero()) continue;
      const item: AccountBreakdown = {
        accountCode: code,
        accountName: accountNameMap.get(code) || this.getAccountName(code),
        amountCents: balance.toNumber(),
        amountRands: balance.dividedBy(100).toDecimalPlaces(2).toNumber(),
      };
      if (isCurrentLiability(code)) {
        currentLiabilities.push(item);
      } else {
        nonCurrentLiabilities.push(item);
      }
    }
    currentLiabilities.sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode),
    );
    nonCurrentLiabilities.sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode),
    );

    // Build equity — retained earnings = cumulative net profit (income - expenses)
    const retainedEarningsCents = totalIncomeCents.minus(totalExpensesCents);
    const equityBreakdown: AccountBreakdown[] = [];

    // Add any direct equity transactions
    for (const [code, balance] of accountBalances) {
      if (!isEquityAccount(code) || balance.isZero()) continue;
      equityBreakdown.push({
        accountCode: code,
        accountName: accountNameMap.get(code) || this.getAccountName(code),
        amountCents: balance.toNumber(),
        amountRands: balance.dividedBy(100).toDecimalPlaces(2).toNumber(),
      });
    }

    // Add retained earnings
    if (!retainedEarningsCents.isZero()) {
      equityBreakdown.push({
        accountCode: DEFAULT_ACCOUNTS.RETAINED_EARNINGS.code,
        accountName:
          accountNameMap.get(DEFAULT_ACCOUNTS.RETAINED_EARNINGS.code) ||
          DEFAULT_ACCOUNTS.RETAINED_EARNINGS.name,
        amountCents: retainedEarningsCents.toNumber(),
        amountRands: retainedEarningsCents
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      });
    }
    equityBreakdown.sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode),
    );

    // Calculate totals
    const totalAssetsCents = currentAssets
      .reduce((sum, acc) => sum.plus(acc.amountCents), new Decimal(0))
      .plus(
        nonCurrentAssets.reduce(
          (sum, acc) => sum.plus(acc.amountCents),
          new Decimal(0),
        ),
      );

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

    // Build account name lookup from xero_accounts
    const xeroAccounts = await this.prisma.xeroAccount.findMany({
      where: { tenantId },
    });
    const accountNameMap = new Map<string, string>();
    for (const xa of xeroAccounts) {
      accountNameMap.set(xa.accountCode, xa.name);
    }

    // Get all transactions up to asOfDate using xero_account_code
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asOfDate },
        isDeleted: false,
      },
    });

    // Group by xero_account_code
    const accountBalances = new Map<
      string,
      { debits: Decimal; credits: Decimal; name: string }
    >();

    for (const tx of transactions) {
      const accountCode = tx.xeroAccountCode || '9999';
      const accountName =
        accountNameMap.get(accountCode) || this.getAccountName(accountCode);

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

    // Build trial balance accounts sorted by code
    const accounts: TrialBalanceAccount[] = Array.from(
      accountBalances.entries(),
    )
      .map(([code, balance]) => ({
        accountCode: code,
        accountName: balance.name,
        debitCents: balance.debits.toNumber(),
        creditCents: balance.credits.toNumber(),
        debitRands: balance.debits
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
        creditRands: balance.credits
          .dividedBy(100)
          .toDecimalPlaces(2)
          .toNumber(),
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

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
   * Export Income Statement to PDF format
   * TASK-RECON-017: Income Statement PDF export
   *
   * @param report - Income Statement data
   * @param tenantName - Name of tenant for branding
   * @returns PDF buffer
   */
  async exportIncomeStatementPDF(
    report: IncomeStatement,
    tenantName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Helper for currency formatting (ZAR)
      const formatAmount = (cents: number): string => {
        const rands = cents / 100;
        return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      // Format date as DD/MM/YYYY (South African format)
      const formatDate = (date: Date): string => {
        return date.toLocaleDateString('en-ZA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      };

      // Header
      doc.fontSize(20).text(tenantName, { align: 'center' });
      doc
        .fontSize(16)
        .text('Income Statement (Profit & Loss)', { align: 'center' });
      doc
        .fontSize(12)
        .text(
          `Period: ${formatDate(report.period.start)} - ${formatDate(report.period.end)}`,
          { align: 'center' },
        );
      doc.moveDown(2);

      // INCOME Section
      doc.fontSize(14).fillColor('black').text('INCOME', { underline: true });
      doc.moveDown(0.5);

      if (report.income.breakdown.length === 0) {
        doc
          .fontSize(10)
          .fillColor('gray')
          .text('  No income recorded for this period');
        doc.fillColor('black');
      } else {
        for (const item of report.income.breakdown) {
          doc
            .fontSize(10)
            .fillColor('black')
            .text(`  ${item.accountCode} - ${item.accountName}`, {
              continued: true,
              width: 350,
            })
            .text(formatAmount(item.amountCents), { align: 'right' });
        }
      }

      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .fillColor('#008000')
        .text('  Total Income', { continued: true, width: 350 })
        .text(formatAmount(report.income.totalCents), { align: 'right' });
      doc.fillColor('black').moveDown(1.5);

      // EXPENSES Section
      doc.fontSize(14).text('EXPENSES', { underline: true });
      doc.moveDown(0.5);

      if (report.expenses.breakdown.length === 0) {
        doc
          .fontSize(10)
          .fillColor('gray')
          .text('  No expenses recorded for this period');
        doc.fillColor('black');
      } else {
        for (const item of report.expenses.breakdown) {
          doc
            .fontSize(10)
            .fillColor('black')
            .text(`  ${item.accountCode} - ${item.accountName}`, {
              continued: true,
              width: 350,
            })
            .text(formatAmount(item.amountCents), { align: 'right' });
        }
      }

      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .fillColor('#CC0000')
        .text('  Total Expenses', { continued: true, width: 350 })
        .text(formatAmount(report.expenses.totalCents), { align: 'right' });
      doc.fillColor('black').moveDown(2);

      // NET PROFIT/LOSS
      const netProfitLabel =
        report.netProfitCents >= 0 ? 'NET PROFIT' : 'NET LOSS';
      const netProfitColor = report.netProfitCents >= 0 ? '#008000' : '#CC0000';

      doc
        .fontSize(16)
        .fillColor(netProfitColor)
        .text(netProfitLabel, { continued: true, width: 350 })
        .text(formatAmount(Math.abs(report.netProfitCents)), {
          align: 'right',
        });

      doc.fillColor('black').moveDown(3);

      // Footer
      doc
        .fontSize(8)
        .fillColor('gray')
        .text(`Generated: ${report.generatedAt.toLocaleString('en-ZA')}`, {
          align: 'center',
        })
        .text(`${tenantName} - Financial Report`, { align: 'center' });

      doc.end();
    });
  }

  /**
   * Export Income Statement to Excel format
   * TASK-RECON-017: Income Statement Excel export
   *
   * @param report - Income Statement data
   * @param tenantName - Name of tenant for branding
   * @returns Excel buffer
   */
  async exportIncomeStatementExcel(
    report: IncomeStatement,
    tenantName: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CrecheBooks';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Income Statement');

    // Set column widths
    sheet.columns = [
      { key: 'code', width: 15 },
      { key: 'name', width: 45 },
      { key: 'amount', width: 20 },
    ];

    // Format date as DD/MM/YYYY
    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    };

    let rowNum = 1;

    // Header rows
    sheet.mergeCells(`A${rowNum}:C${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = tenantName;
    sheet.getCell(`A${rowNum}`).font = { size: 16, bold: true };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum++;

    sheet.mergeCells(`A${rowNum}:C${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = 'Income Statement (Profit & Loss)';
    sheet.getCell(`A${rowNum}`).font = { size: 14, bold: true };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum++;

    sheet.mergeCells(`A${rowNum}:C${rowNum}`);
    sheet.getCell(`A${rowNum}`).value =
      `Period: ${formatDate(report.period.start)} - ${formatDate(report.period.end)}`;
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum += 2;

    // Column headers
    sheet.getCell(`A${rowNum}`).value = 'Account Code';
    sheet.getCell(`B${rowNum}`).value = 'Account Name';
    sheet.getCell(`C${rowNum}`).value = 'Amount (ZAR)';
    sheet.getRow(rowNum).font = { bold: true };
    sheet.getRow(rowNum).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    rowNum++;

    // INCOME Section
    sheet.getCell(`A${rowNum}`).value = 'INCOME';
    sheet.getCell(`A${rowNum}`).font = { bold: true, underline: true };
    rowNum++;

    const incomeStartRow = rowNum;
    for (const item of report.income.breakdown) {
      sheet.getCell(`A${rowNum}`).value = item.accountCode;
      sheet.getCell(`B${rowNum}`).value = item.accountName;
      sheet.getCell(`C${rowNum}`).value = item.amountCents / 100;
      sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
      rowNum++;
    }
    const incomeEndRow = rowNum > incomeStartRow ? rowNum - 1 : incomeStartRow;

    // Total Income with formula
    sheet.getCell(`B${rowNum}`).value = 'Total Income';
    sheet.getCell(`B${rowNum}`).font = { bold: true };
    if (report.income.breakdown.length > 0) {
      sheet.getCell(`C${rowNum}`).value = {
        formula: `SUM(C${incomeStartRow}:C${incomeEndRow})`,
      };
    } else {
      sheet.getCell(`C${rowNum}`).value = 0;
    }
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    sheet.getCell(`C${rowNum}`).font = {
      bold: true,
      color: { argb: 'FF008000' },
    };
    const totalIncomeRow = rowNum;
    rowNum += 2;

    // EXPENSES Section
    sheet.getCell(`A${rowNum}`).value = 'EXPENSES';
    sheet.getCell(`A${rowNum}`).font = { bold: true, underline: true };
    rowNum++;

    const expenseStartRow = rowNum;
    for (const item of report.expenses.breakdown) {
      sheet.getCell(`A${rowNum}`).value = item.accountCode;
      sheet.getCell(`B${rowNum}`).value = item.accountName;
      sheet.getCell(`C${rowNum}`).value = item.amountCents / 100;
      sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
      rowNum++;
    }
    const expenseEndRow =
      rowNum > expenseStartRow ? rowNum - 1 : expenseStartRow;

    // Total Expenses with formula
    sheet.getCell(`B${rowNum}`).value = 'Total Expenses';
    sheet.getCell(`B${rowNum}`).font = { bold: true };
    if (report.expenses.breakdown.length > 0) {
      sheet.getCell(`C${rowNum}`).value = {
        formula: `SUM(C${expenseStartRow}:C${expenseEndRow})`,
      };
    } else {
      sheet.getCell(`C${rowNum}`).value = 0;
    }
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    sheet.getCell(`C${rowNum}`).font = {
      bold: true,
      color: { argb: 'FFCC0000' },
    };
    const totalExpenseRow = rowNum;
    rowNum += 2;

    // Net Profit/Loss with formula
    const netProfitLabel =
      report.netProfitCents >= 0 ? 'NET PROFIT' : 'NET LOSS';
    sheet.getCell(`B${rowNum}`).value = netProfitLabel;
    sheet.getCell(`B${rowNum}`).font = { bold: true, size: 12 };
    sheet.getCell(`C${rowNum}`).value = {
      formula: `C${totalIncomeRow}-C${totalExpenseRow}`,
    };
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    sheet.getCell(`C${rowNum}`).font = {
      bold: true,
      size: 12,
      color: { argb: report.netProfitCents >= 0 ? 'FF008000' : 'FFCC0000' },
    };
    rowNum += 2;

    // Generated timestamp
    sheet.mergeCells(`A${rowNum}:C${rowNum}`);
    sheet.getCell(`A${rowNum}`).value =
      `Generated: ${report.generatedAt.toLocaleString('en-ZA')}`;
    sheet.getCell(`A${rowNum}`).font = { size: 8, color: { argb: 'FF808080' } };

    // Return as buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Export Trial Balance to PDF format
   * TASK-RECON-018: Trial Balance PDF export
   *
   * @param report - Trial Balance data
   * @param tenantName - Name of tenant for branding
   * @returns PDF buffer
   */
  async exportTrialBalancePDF(
    report: TrialBalance,
    tenantName: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Helper for currency formatting (ZAR)
      const formatAmount = (cents: number): string => {
        const rands = cents / 100;
        return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      // Format date as DD/MM/YYYY
      const formatDate = (date: Date): string => {
        return date.toLocaleDateString('en-ZA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      };

      // Header
      doc.fontSize(20).text(tenantName, { align: 'center' });
      doc.fontSize(16).text('Trial Balance', { align: 'center' });
      doc
        .fontSize(12)
        .text(`As at ${formatDate(report.asOfDate)}`, { align: 'center' });
      doc.moveDown(2);

      // Column headers
      const startX = 50;
      const colWidths = { code: 80, name: 200, debit: 100, credit: 100 };

      doc.fontSize(10).fillColor('black');
      doc.text('Account', startX, doc.y, { underline: true });
      doc.text('Description', startX + colWidths.code, doc.y - 14);
      doc.text('Debit', startX + colWidths.code + colWidths.name, doc.y - 14, {
        width: colWidths.debit,
        align: 'right',
      });
      doc.text(
        'Credit',
        startX + colWidths.code + colWidths.name + colWidths.debit,
        doc.y - 14,
        { width: colWidths.credit, align: 'right' },
      );
      doc.moveDown(1);

      // Accounts
      if (report.accounts.length === 0) {
        doc.fontSize(10).fillColor('gray').text('No transactions recorded');
        doc.fillColor('black');
      } else {
        for (const account of report.accounts) {
          const y = doc.y;
          doc.fontSize(9).fillColor('black');
          doc.text(account.accountCode, startX, y);
          doc.text(account.accountName, startX + colWidths.code, y, {
            width: colWidths.name - 10,
          });
          doc.text(
            account.debitCents > 0 ? formatAmount(account.debitCents) : '-',
            startX + colWidths.code + colWidths.name,
            y,
            { width: colWidths.debit, align: 'right' },
          );
          doc.text(
            account.creditCents > 0 ? formatAmount(account.creditCents) : '-',
            startX + colWidths.code + colWidths.name + colWidths.debit,
            y,
            { width: colWidths.credit, align: 'right' },
          );
          doc.moveDown(0.5);
        }
      }

      doc.moveDown(1);

      // Draw line
      doc
        .moveTo(startX, doc.y)
        .lineTo(
          startX +
            colWidths.code +
            colWidths.name +
            colWidths.debit +
            colWidths.credit,
          doc.y,
        )
        .stroke();
      doc.moveDown(0.5);

      // Totals
      const totalY = doc.y;
      doc.fontSize(11).fillColor('black');
      doc.text('TOTALS', startX, totalY, {
        width: colWidths.code + colWidths.name,
      });
      doc.text(
        formatAmount(report.totals.debitsCents),
        startX + colWidths.code + colWidths.name,
        totalY,
        { width: colWidths.debit, align: 'right' },
      );
      doc.text(
        formatAmount(report.totals.creditsCents),
        startX + colWidths.code + colWidths.name + colWidths.debit,
        totalY,
        { width: colWidths.credit, align: 'right' },
      );
      doc.moveDown(2);

      // Balance check
      if (!report.isBalanced) {
        doc
          .fontSize(10)
          .fillColor('#CC0000')
          .text(
            'WARNING: Trial balance does not balance! Debits do not equal credits.',
            {
              align: 'center',
            },
          );
      } else {
        doc
          .fontSize(10)
          .fillColor('#008000')
          .text('Trial balance is balanced (Debits = Credits)', {
            align: 'center',
          });
      }

      doc.fillColor('black').moveDown(2);

      // Footer
      doc
        .fontSize(8)
        .fillColor('gray')
        .text(`Generated: ${report.generatedAt.toLocaleString('en-ZA')}`, {
          align: 'center',
        })
        .text(`${tenantName} - Financial Report`, { align: 'center' });

      doc.end();
    });
  }

  /**
   * Export Trial Balance to Excel format
   * TASK-RECON-018: Trial Balance Excel export
   *
   * @param report - Trial Balance data
   * @param tenantName - Name of tenant for branding
   * @returns Excel buffer
   */
  async exportTrialBalanceExcel(
    report: TrialBalance,
    tenantName: string,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CrecheBooks';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Trial Balance');

    // Set column widths
    sheet.columns = [
      { key: 'code', width: 15 },
      { key: 'name', width: 45 },
      { key: 'debit', width: 18 },
      { key: 'credit', width: 18 },
    ];

    // Format date as DD/MM/YYYY
    const formatDate = (date: Date): string => {
      return date.toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    };

    let rowNum = 1;

    // Header rows
    sheet.mergeCells(`A${rowNum}:D${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = tenantName;
    sheet.getCell(`A${rowNum}`).font = { size: 16, bold: true };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum++;

    sheet.mergeCells(`A${rowNum}:D${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = 'Trial Balance';
    sheet.getCell(`A${rowNum}`).font = { size: 14, bold: true };
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum++;

    sheet.mergeCells(`A${rowNum}:D${rowNum}`);
    sheet.getCell(`A${rowNum}`).value = `As at ${formatDate(report.asOfDate)}`;
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum += 2;

    // Column headers
    sheet.getCell(`A${rowNum}`).value = 'Account Code';
    sheet.getCell(`B${rowNum}`).value = 'Account Name';
    sheet.getCell(`C${rowNum}`).value = 'Debit (ZAR)';
    sheet.getCell(`D${rowNum}`).value = 'Credit (ZAR)';
    sheet.getRow(rowNum).font = { bold: true };
    sheet.getRow(rowNum).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    rowNum++;

    // Account rows
    const dataStartRow = rowNum;
    for (const account of report.accounts) {
      sheet.getCell(`A${rowNum}`).value = account.accountCode;
      sheet.getCell(`B${rowNum}`).value = account.accountName;
      sheet.getCell(`C${rowNum}`).value =
        account.debitCents > 0 ? account.debitCents / 100 : null;
      sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
      sheet.getCell(`D${rowNum}`).value =
        account.creditCents > 0 ? account.creditCents / 100 : null;
      sheet.getCell(`D${rowNum}`).numFmt = 'R #,##0.00';
      rowNum++;
    }
    const dataEndRow = rowNum > dataStartRow ? rowNum - 1 : dataStartRow;

    // Totals row with formulas
    sheet.getCell(`B${rowNum}`).value = 'TOTALS';
    sheet.getCell(`B${rowNum}`).font = { bold: true };
    if (report.accounts.length > 0) {
      sheet.getCell(`C${rowNum}`).value = {
        formula: `SUM(C${dataStartRow}:C${dataEndRow})`,
      };
      sheet.getCell(`D${rowNum}`).value = {
        formula: `SUM(D${dataStartRow}:D${dataEndRow})`,
      };
    } else {
      sheet.getCell(`C${rowNum}`).value = 0;
      sheet.getCell(`D${rowNum}`).value = 0;
    }
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    sheet.getCell(`D${rowNum}`).numFmt = 'R #,##0.00';
    sheet.getCell(`C${rowNum}`).font = { bold: true };
    sheet.getCell(`D${rowNum}`).font = { bold: true };
    sheet.getRow(rowNum).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF0C0' },
    };
    rowNum += 2;

    // Balance status
    sheet.mergeCells(`A${rowNum}:D${rowNum}`);
    if (report.isBalanced) {
      sheet.getCell(`A${rowNum}`).value =
        'Trial balance is balanced (Debits = Credits)';
      sheet.getCell(`A${rowNum}`).font = { color: { argb: 'FF008000' } };
    } else {
      sheet.getCell(`A${rowNum}`).value =
        'WARNING: Trial balance does not balance! Debits do not equal credits.';
      sheet.getCell(`A${rowNum}`).font = {
        color: { argb: 'FFCC0000' },
        bold: true,
      };
    }
    sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };
    rowNum += 2;

    // Generated timestamp
    sheet.mergeCells(`A${rowNum}:D${rowNum}`);
    sheet.getCell(`A${rowNum}`).value =
      `Generated: ${report.generatedAt.toLocaleString('en-ZA')}`;
    sheet.getCell(`A${rowNum}`).font = { size: 8, color: { argb: 'FF808080' } };

    // Return as buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // Legacy methods - delegates to specific export methods
  /**
   * @deprecated Use exportIncomeStatementPDF or exportTrialBalancePDF instead
   */
  async exportPDF(
    report: IncomeStatement | TrialBalance,
    tenantName = 'Financial Report',
  ): Promise<Buffer> {
    if ('netProfitCents' in report) {
      return this.exportIncomeStatementPDF(report, tenantName);
    }
    if ('accounts' in report && 'totals' in report) {
      return this.exportTrialBalancePDF(report, tenantName);
    }
    throw new Error('Unsupported report type for PDF export');
  }

  /**
   * @deprecated Use exportIncomeStatementExcel or exportTrialBalanceExcel instead
   */
  async exportExcel(
    report: IncomeStatement | TrialBalance,
    tenantName = 'Financial Report',
  ): Promise<Buffer> {
    if ('netProfitCents' in report) {
      return this.exportIncomeStatementExcel(report, tenantName);
    }
    if ('accounts' in report && 'totals' in report) {
      return this.exportTrialBalanceExcel(report, tenantName);
    }
    throw new Error('Unsupported report type for Excel export');
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
