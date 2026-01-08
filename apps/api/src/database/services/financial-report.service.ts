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
        accountCode: DEFAULT_ACCOUNTS.SAVINGS_ACCOUNT.code,
        accountName: DEFAULT_ACCOUNTS.SAVINGS_ACCOUNT.name,
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
        tx.categorizations?.[0]?.accountCode || DEFAULT_ACCOUNTS.SAVINGS_ACCOUNT.code;
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
        .text('CrecheBooks - Financial Report', { align: 'center' });

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
        .text('CrecheBooks - Financial Report', { align: 'center' });

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
    tenantName = 'CrecheBooks',
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
    tenantName = 'CrecheBooks',
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
