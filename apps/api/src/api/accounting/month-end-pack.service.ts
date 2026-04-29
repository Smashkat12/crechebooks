/**
 * Month-End Export Pack Service
 *
 * Generates a ZIP archive containing 5 CSV files for bookkeeper month-end review:
 *   1. general-ledger.csv   — all journal entries for the period
 *   2. trial-balance.csv    — balances as of period end
 *   3. invoices.csv         — invoices issued in the period
 *   4. payments.csv         — payments received in the period
 *   5. xero-journal.csv     — Xero Manual Journal CSV format derived from GL
 *
 * On any per-CSV error a WARNING.txt entry is appended instead of aborting the
 * whole pack.  All queries are scoped to tenantId.  No CSV data is logged.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import * as archiver from 'archiver';
import { GeneralLedgerService } from '../../database/services/general-ledger.service';
import { formatFullName } from '../../common/utils';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class MonthEndPackService {
  private readonly logger = new Logger(MonthEndPackService.name);

  constructor(
    private readonly glService: GeneralLedgerService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Validate and parse a YYYY-MM period string.
   * Returns { startDate, endDate } for the calendar month, or throws on invalid/future input.
   */
  parsePeriod(period: string): { startDate: Date; endDate: Date } {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error(`Invalid period format "${period}". Expected YYYY-MM.`);
    }

    const [year, month] = period.split('-').map(Number);

    if (month < 1 || month > 12) {
      throw new Error(
        `Invalid month in period "${period}". Month must be 01–12.`,
      );
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    // Last day of month: day 0 of next month
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Reject future periods: startDate must not be in the future
    const now = new Date();
    const startOfCurrentMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    if (startDate > startOfCurrentMonth) {
      throw new Error(
        `Period "${period}" is in the future. Only past or current months are allowed.`,
      );
    }

    return { startDate, endDate };
  }

  /**
   * Build a ZIP stream containing the 5 CSV pack entries.
   * Returns a Readable that the controller can pipe to the HTTP response.
   */
  async buildPackStream(tenantId: string, period: string): Promise<Readable> {
    const { startDate, endDate } = this.parsePeriod(period);

    this.logger.log(
      `Building month-end pack: tenant=${tenantId}, period=${period}`,
    );

    const warnings: string[] = [];

    // --- Gather all CSV payloads concurrently ---
    const [glCsv, tbCsv, invoicesCsv, paymentsCsv] = await Promise.all([
      this.buildGeneralLedgerCsv(tenantId, startDate, endDate).catch((e) => {
        warnings.push(`general-ledger.csv: ${String(e)}`);
        return null;
      }),
      this.buildTrialBalanceCsv(tenantId, endDate).catch((e) => {
        warnings.push(`trial-balance.csv: ${String(e)}`);
        return null;
      }),
      this.buildInvoicesCsv(tenantId, startDate, endDate).catch((e) => {
        warnings.push(`invoices.csv: ${String(e)}`);
        return null;
      }),
      this.buildPaymentsCsv(tenantId, startDate, endDate).catch((e) => {
        warnings.push(`payments.csv: ${String(e)}`);
        return null;
      }),
    ]);

    // Xero journal depends on GL data (reuse already-fetched GL entries)
    let xeroJournalCsv: string | null = null;
    try {
      if (glCsv !== null) {
        const glEntries = await this.glService.getGeneralLedger({
          tenantId,
          startDate,
          endDate,
        });
        xeroJournalCsv = this.buildXeroJournalCsv(glEntries, period);
      } else {
        warnings.push(
          'xero-journal.csv: skipped because general-ledger.csv failed',
        );
      }
    } catch (e) {
      warnings.push(`xero-journal.csv: ${String(e)}`);
    }

    // --- Assemble ZIP ---
    const archive = archiver.default('zip', { zlib: { level: 9 } });

    if (glCsv !== null) archive.append(glCsv, { name: 'general-ledger.csv' });
    if (tbCsv !== null) archive.append(tbCsv, { name: 'trial-balance.csv' });
    if (invoicesCsv !== null)
      archive.append(invoicesCsv, { name: 'invoices.csv' });
    if (paymentsCsv !== null)
      archive.append(paymentsCsv, { name: 'payments.csv' });
    if (xeroJournalCsv !== null)
      archive.append(xeroJournalCsv, { name: 'xero-journal.csv' });

    if (warnings.length > 0) {
      const warningText = `Month-End Pack Warnings\nPeriod: ${period}\nGenerated: ${new Date().toISOString()}\n\n${warnings.join('\n')}`;
      archive.append(warningText, { name: 'WARNING.txt' });
      this.logger.warn(
        `Month-end pack for tenant=${tenantId} period=${period} has ${warnings.length} warning(s)`,
      );
    }

    archive.finalize().catch((e) => {
      this.logger.error(
        `Archive finalize error tenant=${tenantId} period=${period}: ${String(e)}`,
      );
    });

    return archive as unknown as Readable;
  }

  // ---------------------------------------------------------------------------
  // Private CSV builders
  // ---------------------------------------------------------------------------

  private async buildGeneralLedgerCsv(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const entries = await this.glService.getGeneralLedger({
      tenantId,
      startDate,
      endDate,
    });

    const header = [
      'Date',
      'Description',
      'Account Code',
      'Account Name',
      'Debit (ZAR)',
      'Credit (ZAR)',
      'Source Type',
      'Source ID',
      'Reference',
    ].join(',');

    const rows = entries.map((e) =>
      [
        this.csvDate(e.date),
        this.csvStr(e.description),
        this.csvStr(e.accountCode),
        this.csvStr(e.accountName),
        this.centsToRands(e.debitCents),
        this.centsToRands(e.creditCents),
        this.csvStr(e.sourceType),
        this.csvStr(e.sourceId),
        this.csvStr(e.reference ?? ''),
      ].join(','),
    );

    return [header, ...rows].join('\r\n');
  }

  private async buildTrialBalanceCsv(
    tenantId: string,
    endDate: Date,
  ): Promise<string> {
    const tb = await this.glService.getTrialBalance(tenantId, endDate);

    const header = [
      'Account Code',
      'Account Name',
      'Account Type',
      'Debit Balance (ZAR)',
      'Credit Balance (ZAR)',
    ].join(',');

    const rows = tb.lines.map((l) =>
      [
        this.csvStr(l.accountCode),
        this.csvStr(l.accountName),
        this.csvStr(l.accountType),
        this.centsToRands(l.debitBalanceCents),
        this.centsToRands(l.creditBalanceCents),
      ].join(','),
    );

    const totalsRow = [
      '',
      'TOTALS',
      '',
      this.centsToRands(tb.totalDebitsCents),
      this.centsToRands(tb.totalCreditsCents),
    ].join(',');

    return [header, ...rows, totalsRow].join('\r\n');
  }

  private async buildInvoicesCsv(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    // Fetch invoices issued in the period (not deleted)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isDeleted: false,
        issueDate: { gte: startDate, lte: endDate },
      },
      include: {
        parent: {
          select: { firstName: true, middleName: true, lastName: true },
        },
        child: {
          select: { firstName: true, middleName: true, lastName: true },
        },
      },
      orderBy: { issueDate: 'asc' },
    });

    const header = [
      'Invoice Number',
      'Issue Date',
      'Due Date',
      'Status',
      'Parent Name',
      'Child Name',
      'Subtotal (ZAR)',
      'VAT (ZAR)',
      'Total (ZAR)',
      'Amount Paid (ZAR)',
    ].join(',');

    const rows = invoices.map((inv) =>
      [
        this.csvStr(inv.invoiceNumber),
        this.csvDate(inv.issueDate),
        this.csvDate(inv.dueDate),
        this.csvStr(inv.status),
        this.csvStr(formatFullName(inv.parent)),
        this.csvStr(formatFullName(inv.child)),
        this.centsToRands(inv.subtotalCents),
        this.centsToRands(inv.vatCents),
        this.centsToRands(inv.totalCents),
        this.centsToRands(inv.amountPaidCents),
      ].join(','),
    );

    return [header, ...rows].join('\r\n');
  }

  private async buildPaymentsCsv(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    // Fetch non-deleted, non-reversed payments with paymentDate in period
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isReversed: false,
        paymentDate: { gte: startDate, lte: endDate },
      },
      include: {
        invoice: { select: { invoiceNumber: true } },
        transaction: { select: { description: true, reference: true } },
      },
      orderBy: { paymentDate: 'asc' },
    });

    const header = [
      'Payment Date',
      'Invoice Number',
      'Amount (ZAR)',
      'Match Type',
      'Matched By',
      'Reference',
      'Transaction Description',
    ].join(',');

    const rows = payments.map((p) =>
      [
        this.csvDate(p.paymentDate),
        this.csvStr(p.invoice.invoiceNumber),
        this.centsToRands(p.amountCents),
        this.csvStr(p.matchType),
        this.csvStr(p.matchedBy),
        this.csvStr(p.reference ?? ''),
        this.csvStr(p.transaction?.description ?? ''),
      ].join(','),
    );

    return [header, ...rows].join('\r\n');
  }

  /**
   * Build Xero Manual Journal CSV format from GL entries.
   * Format: *Narration,*Date,Description,*AccountCode,*TaxRate,*Amount,
   *         TrackingName1,TrackingOption1,TrackingName2,TrackingOption2
   *
   * Amounts: positive = debit line (from Xero's perspective positive = debit),
   * negative = credit line.
   */
  private buildXeroJournalCsv(
    entries: Awaited<ReturnType<GeneralLedgerService['getGeneralLedger']>>,
    period: string,
  ): string {
    const header = [
      '*Narration',
      '*Date',
      'Description',
      '*AccountCode',
      '*TaxRate',
      '*Amount',
      'TrackingName1',
      'TrackingOption1',
      'TrackingName2',
      'TrackingOption2',
    ].join(',');

    const narration = `Month-End Journal ${period}`;

    const rows = entries.map((e) => {
      // Xero: positive amount = debit, negative = credit
      const amount =
        e.debitCents > 0 ? e.debitCents / 100 : -(e.creditCents / 100);
      return [
        this.csvStr(narration),
        this.csvDate(e.date),
        this.csvStr(e.description),
        this.csvStr(e.accountCode),
        'NONE',
        amount.toFixed(2),
        '',
        '',
        '',
        '',
      ].join(',');
    });

    return [header, ...rows].join('\r\n');
  }

  // ---------------------------------------------------------------------------
  // CSV formatting helpers
  // ---------------------------------------------------------------------------

  /** Wrap a string value in RFC 4180 quotes, escaping internal quotes. */
  private csvStr(value: string): string {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  /** Format a Date as YYYY-MM-DD for CSV cells. */
  private csvDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** Convert integer cents to a decimal rand string with 2 dp. */
  private centsToRands(cents: number): string {
    return (cents / 100).toFixed(2);
  }
}
