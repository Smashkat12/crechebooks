import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import {
  BalanceSheet,
  AssetSection,
  LiabilitySection,
  EquitySection,
  LineItem,
} from '../dto/balance-sheet.dto';
import {
  isAssetAccount,
  isLiabilityAccount,
  isEquityAccount,
  isCurrentAsset,
  isCurrentLiability,
} from '../constants/chart-of-accounts.constants';

// Configure Decimal.js with banker's rounding (ROUND_HALF_EVEN)
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

@Injectable()
export class BalanceSheetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a balance sheet for a given tenant as at a specific date
   * @param tenantId - The tenant identifier
   * @param asAtDate - The date for which to generate the balance sheet
   * @returns Complete balance sheet following IFRS for SMEs structure
   */
  async generate(tenantId: string, asAtDate: Date): Promise<BalanceSheet> {
    // Ensure asAtDate is end of day for proper comparison
    const endOfDay = new Date(asAtDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Calculate all sections in parallel for performance
    const [assets, liabilities, equity] = await Promise.all([
      this.calculateAssets(tenantId, endOfDay),
      this.calculateLiabilities(tenantId, endOfDay),
      this.calculateEquity(tenantId, endOfDay),
    ]);

    const totalAssetsCents = assets.totalCents;
    const totalLiabilitiesAndEquityCents =
      liabilities.totalCents + equity.totalCents;

    // Verify accounting equation: Assets = Liabilities + Equity
    const isBalanced = totalAssetsCents === totalLiabilitiesAndEquityCents;

    return {
      asAtDate: endOfDay,
      tenantId,
      assets,
      liabilities,
      equity,
      totalAssetsCents,
      totalLiabilitiesAndEquityCents,
      isBalanced,
      generatedAt: new Date(),
    };
  }

  /**
   * Export balance sheet to PDF format
   * @param balanceSheet - The balance sheet data to export
   * @param tenantName - Name of tenant for branding (white-labeling)
   * @returns PDF buffer
   */
  async exportToPdf(
    balanceSheet: BalanceSheet,
    tenantName = 'Balance Sheet',
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header - use tenant name for white-labeling
      doc.fontSize(20).text(tenantName, { align: 'center' });
      doc.fontSize(16).text('Balance Sheet', { align: 'center' });
      doc
        .fontSize(12)
        .text(`As at ${balanceSheet.asAtDate.toLocaleDateString('en-ZA')}`, {
          align: 'center',
        });
      doc.moveDown(2);

      // Assets Section
      doc.fontSize(14).text('ASSETS', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(12).text('Current Assets:', { underline: true });
      balanceSheet.assets.current.forEach((item) => {
        doc
          .fontSize(10)
          .text(`${item.account} - ${item.description}`, {
            continued: true,
            width: 350,
          })
          .text(`R ${this.formatCents(item.amountCents)}`, { align: 'right' });
      });
      doc
        .fontSize(11)
        .text('Total Current Assets', { continued: true, width: 350 })
        .text(`R ${this.formatCents(balanceSheet.assets.totalCurrentCents)}`, {
          align: 'right',
        });
      doc.moveDown(0.5);

      doc.fontSize(12).text('Non-Current Assets:', { underline: true });
      balanceSheet.assets.nonCurrent.forEach((item) => {
        doc
          .fontSize(10)
          .text(`${item.account} - ${item.description}`, {
            continued: true,
            width: 350,
          })
          .text(`R ${this.formatCents(item.amountCents)}`, { align: 'right' });
      });
      doc
        .fontSize(11)
        .text('Total Non-Current Assets', { continued: true, width: 350 })
        .text(
          `R ${this.formatCents(balanceSheet.assets.totalNonCurrentCents)}`,
          {
            align: 'right',
          },
        );
      doc.moveDown(0.5);

      doc
        .fontSize(12)
        .text('TOTAL ASSETS', { continued: true, width: 350, underline: true })
        .text(`R ${this.formatCents(balanceSheet.totalAssetsCents)}`, {
          align: 'right',
          underline: true,
        });
      doc.moveDown(2);

      // Liabilities Section
      doc.fontSize(14).text('LIABILITIES', { underline: true });
      doc.moveDown(0.5);

      doc.fontSize(12).text('Current Liabilities:', { underline: true });
      balanceSheet.liabilities.current.forEach((item) => {
        doc
          .fontSize(10)
          .text(`${item.account} - ${item.description}`, {
            continued: true,
            width: 350,
          })
          .text(`R ${this.formatCents(item.amountCents)}`, { align: 'right' });
      });
      doc
        .fontSize(11)
        .text('Total Current Liabilities', { continued: true, width: 350 })
        .text(
          `R ${this.formatCents(balanceSheet.liabilities.totalCurrentCents)}`,
          {
            align: 'right',
          },
        );
      doc.moveDown(0.5);

      doc.fontSize(12).text('Non-Current Liabilities:', { underline: true });
      balanceSheet.liabilities.nonCurrent.forEach((item) => {
        doc
          .fontSize(10)
          .text(`${item.account} - ${item.description}`, {
            continued: true,
            width: 350,
          })
          .text(`R ${this.formatCents(item.amountCents)}`, { align: 'right' });
      });
      doc
        .fontSize(11)
        .text('Total Non-Current Liabilities', { continued: true, width: 350 })
        .text(
          `R ${this.formatCents(balanceSheet.liabilities.totalNonCurrentCents)}`,
          { align: 'right' },
        );
      doc.moveDown(2);

      // Equity Section
      doc.fontSize(14).text('EQUITY', { underline: true });
      doc.moveDown(0.5);

      balanceSheet.equity.items.forEach((item) => {
        doc
          .fontSize(10)
          .text(`${item.account} - ${item.description}`, {
            continued: true,
            width: 350,
          })
          .text(`R ${this.formatCents(item.amountCents)}`, { align: 'right' });
      });
      doc
        .fontSize(11)
        .text('Retained Earnings', { continued: true, width: 350 })
        .text(
          `R ${this.formatCents(balanceSheet.equity.retainedEarningsCents)}`,
          {
            align: 'right',
          },
        );
      doc.moveDown(0.5);

      doc
        .fontSize(12)
        .text('TOTAL EQUITY', { continued: true, width: 350, underline: true })
        .text(`R ${this.formatCents(balanceSheet.equity.totalCents)}`, {
          align: 'right',
          underline: true,
        });
      doc.moveDown(2);

      // Total Liabilities and Equity
      doc
        .fontSize(12)
        .text('TOTAL LIABILITIES AND EQUITY', {
          continued: true,
          width: 350,
          underline: true,
        })
        .text(
          `R ${this.formatCents(balanceSheet.totalLiabilitiesAndEquityCents)}`,
          { align: 'right', underline: true },
        );

      // Balance check
      if (!balanceSheet.isBalanced) {
        doc.moveDown(2);
        doc
          .fontSize(10)
          .fillColor('red')
          .text('WARNING: Balance sheet does not balance!', {
            align: 'center',
          });
      }

      doc.end();
    });
  }

  /**
   * Export balance sheet to Excel format with formulas
   * @param balanceSheet - The balance sheet data to export
   * @param tenantName - Name of tenant for branding (white-labeling)
   * @returns Excel buffer
   */
  async exportToExcel(
    balanceSheet: BalanceSheet,
    tenantName = 'Balance Sheet',
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Balance Sheet');

    // Set column widths
    worksheet.columns = [
      { width: 15 }, // Account code
      { width: 40 }, // Description
      { width: 20 }, // Amount
    ];

    let currentRow = 1;

    // Header - use tenant name for white-labeling
    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = tenantName;
    worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 16 };
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = 'Balance Sheet';
    worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value =
      `As at ${balanceSheet.asAtDate.toLocaleDateString('en-ZA')}`;
    worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };
    currentRow += 2;

    // ASSETS
    worksheet.getCell(`A${currentRow}`).value = 'ASSETS';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    worksheet.getCell(`A${currentRow}`).value = 'Current Assets';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    const currentAssetsStartRow = currentRow;
    balanceSheet.assets.current.forEach((item) => {
      worksheet.getCell(`A${currentRow}`).value = item.account;
      worksheet.getCell(`B${currentRow}`).value = item.description;
      worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
        item.amountCents,
      ).toNumber();
      worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
      currentRow++;
    });

    worksheet.getCell(`B${currentRow}`).value = 'Total Current Assets';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = {
      formula: `SUM(C${currentAssetsStartRow}:C${currentRow - 1})`,
    };
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };
    currentRow += 2;

    worksheet.getCell(`A${currentRow}`).value = 'Non-Current Assets';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    const nonCurrentAssetsStartRow = currentRow;
    balanceSheet.assets.nonCurrent.forEach((item) => {
      worksheet.getCell(`A${currentRow}`).value = item.account;
      worksheet.getCell(`B${currentRow}`).value = item.description;
      worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
        item.amountCents,
      ).toNumber();
      worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
      currentRow++;
    });

    worksheet.getCell(`B${currentRow}`).value = 'Total Non-Current Assets';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = {
      formula: `SUM(C${nonCurrentAssetsStartRow}:C${currentRow - 1})`,
    };
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };
    currentRow += 2;

    const totalAssetsRow = currentRow;
    worksheet.getCell(`B${currentRow}`).value = 'TOTAL ASSETS';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
      balanceSheet.totalAssetsCents,
    ).toNumber();
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };
    currentRow += 2;

    // LIABILITIES
    worksheet.getCell(`A${currentRow}`).value = 'LIABILITIES';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    worksheet.getCell(`A${currentRow}`).value = 'Current Liabilities';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    const currentLiabilitiesStartRow = currentRow;
    balanceSheet.liabilities.current.forEach((item) => {
      worksheet.getCell(`A${currentRow}`).value = item.account;
      worksheet.getCell(`B${currentRow}`).value = item.description;
      worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
        item.amountCents,
      ).toNumber();
      worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
      currentRow++;
    });

    worksheet.getCell(`B${currentRow}`).value = 'Total Current Liabilities';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = {
      formula: `SUM(C${currentLiabilitiesStartRow}:C${currentRow - 1})`,
    };
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };
    currentRow += 2;

    worksheet.getCell(`A${currentRow}`).value = 'Non-Current Liabilities';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    const nonCurrentLiabilitiesStartRow = currentRow;
    balanceSheet.liabilities.nonCurrent.forEach((item) => {
      worksheet.getCell(`A${currentRow}`).value = item.account;
      worksheet.getCell(`B${currentRow}`).value = item.description;
      worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
        item.amountCents,
      ).toNumber();
      worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
      currentRow++;
    });

    worksheet.getCell(`B${currentRow}`).value = 'Total Non-Current Liabilities';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = {
      formula: `SUM(C${nonCurrentLiabilitiesStartRow}:C${currentRow - 1})`,
    };
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };
    currentRow += 2;

    // EQUITY
    worksheet.getCell(`A${currentRow}`).value = 'EQUITY';
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    currentRow++;

    balanceSheet.equity.items.forEach((item) => {
      worksheet.getCell(`A${currentRow}`).value = item.account;
      worksheet.getCell(`B${currentRow}`).value = item.description;
      worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
        item.amountCents,
      ).toNumber();
      worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
      currentRow++;
    });

    worksheet.getCell(`B${currentRow}`).value = 'Retained Earnings';
    worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
      balanceSheet.equity.retainedEarningsCents,
    ).toNumber();
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    currentRow++;

    worksheet.getCell(`B${currentRow}`).value = 'TOTAL EQUITY';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
      balanceSheet.equity.totalCents,
    ).toNumber();
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };
    currentRow += 2;

    // TOTAL LIABILITIES AND EQUITY
    worksheet.getCell(`B${currentRow}`).value = 'TOTAL LIABILITIES AND EQUITY';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = this.centsToDecimal(
      balanceSheet.totalLiabilitiesAndEquityCents,
    ).toNumber();
    worksheet.getCell(`C${currentRow}`).numFmt = 'R #,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true };

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Calculate asset section with current and non-current classification
   */
  private async calculateAssets(
    tenantId: string,
    asAtDate: Date,
  ): Promise<AssetSection> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asAtDate },
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    const assetBalances = new Map<
      string,
      { amountCents: number; name: string }
    >();

    // Aggregate asset balances
    for (const txn of transactions) {
      const categorization = txn.categorizations[0];
      if (!categorization) continue;

      const accountCode = categorization.accountCode;
      if (!isAssetAccount(accountCode)) continue;

      const existing = assetBalances.get(accountCode) || {
        amountCents: 0,
        name: categorization.accountName,
      };

      // Assets increase with debits (positive amounts), decrease with credits (negative amounts)
      const amount = txn.isCredit ? -txn.amountCents : txn.amountCents;
      existing.amountCents += amount;
      assetBalances.set(accountCode, existing);
    }

    const current: LineItem[] = [];
    const nonCurrent: LineItem[] = [];
    let totalCurrentCents = 0;
    let totalNonCurrentCents = 0;

    for (const [accountCode, balance] of assetBalances) {
      if (balance.amountCents === 0) continue;

      const lineItem: LineItem = {
        account: accountCode,
        description: balance.name,
        amountCents: balance.amountCents,
        amount: this.centsToDecimal(balance.amountCents),
      };

      if (isCurrentAsset(accountCode)) {
        current.push(lineItem);
        totalCurrentCents += balance.amountCents;
      } else {
        nonCurrent.push(lineItem);
        totalNonCurrentCents += balance.amountCents;
      }
    }

    return {
      current: current.sort((a, b) => a.account.localeCompare(b.account)),
      nonCurrent: nonCurrent.sort((a, b) => a.account.localeCompare(b.account)),
      totalCurrentCents,
      totalNonCurrentCents,
      totalCents: totalCurrentCents + totalNonCurrentCents,
    };
  }

  /**
   * Calculate liability section with current and non-current classification
   */
  private async calculateLiabilities(
    tenantId: string,
    asAtDate: Date,
  ): Promise<LiabilitySection> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asAtDate },
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    const liabilityBalances = new Map<
      string,
      { amountCents: number; name: string }
    >();

    // Aggregate liability balances
    for (const txn of transactions) {
      const categorization = txn.categorizations[0];
      if (!categorization) continue;

      const accountCode = categorization.accountCode;
      if (!isLiabilityAccount(accountCode)) continue;

      const existing = liabilityBalances.get(accountCode) || {
        amountCents: 0,
        name: categorization.accountName,
      };

      // Liabilities increase with credits (positive), decrease with debits (negative)
      const amount = txn.isCredit ? txn.amountCents : -txn.amountCents;
      existing.amountCents += amount;
      liabilityBalances.set(accountCode, existing);
    }

    const current: LineItem[] = [];
    const nonCurrent: LineItem[] = [];
    let totalCurrentCents = 0;
    let totalNonCurrentCents = 0;

    for (const [accountCode, balance] of liabilityBalances) {
      if (balance.amountCents === 0) continue;

      const lineItem: LineItem = {
        account: accountCode,
        description: balance.name,
        amountCents: balance.amountCents,
        amount: this.centsToDecimal(balance.amountCents),
      };

      if (isCurrentLiability(accountCode)) {
        current.push(lineItem);
        totalCurrentCents += balance.amountCents;
      } else {
        nonCurrent.push(lineItem);
        totalNonCurrentCents += balance.amountCents;
      }
    }

    return {
      current: current.sort((a, b) => a.account.localeCompare(b.account)),
      nonCurrent: nonCurrent.sort((a, b) => a.account.localeCompare(b.account)),
      totalCurrentCents,
      totalNonCurrentCents,
      totalCents: totalCurrentCents + totalNonCurrentCents,
    };
  }

  /**
   * Calculate equity section including retained earnings from profit/loss
   */
  private async calculateEquity(
    tenantId: string,
    asAtDate: Date,
  ): Promise<EquitySection> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asAtDate },
        isDeleted: false,
      },
      include: {
        categorizations: true,
      },
    });

    const equityBalances = new Map<
      string,
      { amountCents: number; name: string }
    >();
    let totalIncomeCents = 0;
    let totalExpensesCents = 0;

    // Aggregate equity balances and calculate retained earnings
    for (const txn of transactions) {
      const categorization = txn.categorizations[0];
      if (!categorization) continue;

      const accountCode = categorization.accountCode;
      const accountNum = parseInt(accountCode, 10);

      // Direct equity accounts
      if (isEquityAccount(accountCode)) {
        const existing = equityBalances.get(accountCode) || {
          amountCents: 0,
          name: categorization.accountName,
        };

        // Equity increases with credits, decreases with debits
        const amount = txn.isCredit ? txn.amountCents : -txn.amountCents;
        existing.amountCents += amount;
        equityBalances.set(accountCode, existing);
      }

      // Income (credits increase income)
      if (accountNum >= 4000 && accountNum <= 4999) {
        const amount = txn.isCredit ? txn.amountCents : -txn.amountCents;
        totalIncomeCents += amount;
      }

      // Expenses (debits increase expenses)
      if (accountNum >= 5000 && accountNum <= 8999) {
        const amount = txn.isCredit ? -txn.amountCents : txn.amountCents;
        totalExpensesCents += amount;
      }
    }

    const items: LineItem[] = [];
    let totalEquityCents = 0;

    for (const [accountCode, balance] of equityBalances) {
      if (balance.amountCents === 0) continue;

      items.push({
        account: accountCode,
        description: balance.name,
        amountCents: balance.amountCents,
        amount: this.centsToDecimal(balance.amountCents),
      });

      totalEquityCents += balance.amountCents;
    }

    // Calculate retained earnings (profit/loss)
    const retainedEarningsCents = totalIncomeCents - totalExpensesCents;
    totalEquityCents += retainedEarningsCents;

    return {
      items: items.sort((a, b) => a.account.localeCompare(b.account)),
      retainedEarningsCents,
      totalCents: totalEquityCents,
    };
  }

  /**
   * Convert cents to Decimal for calculations
   */
  private centsToDecimal(cents: number): Decimal {
    return new Decimal(cents).div(100);
  }

  /**
   * Format cents as currency string
   */
  private formatCents(cents: number): string {
    return this.centsToDecimal(cents).toFixed(2);
  }
}
