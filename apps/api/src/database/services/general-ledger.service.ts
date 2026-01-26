import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface JournalEntry {
  id: string;
  date: Date;
  description: string;
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  sourceType: 'CATEGORIZATION' | 'PAYROLL' | 'MANUAL' | 'INVOICE' | 'PAYMENT';
  sourceId: string;
  reference?: string;
}

export interface AccountLedger {
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalanceCents: number;
  entries: JournalEntry[];
  closingBalanceCents: number;
}

export interface GeneralLedgerQuery {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  accountCode?: string;
  accountType?: string;
  sourceType?: string;
}

export interface TrialBalanceLine {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalanceCents: number;
  creditBalanceCents: number;
}

export interface TrialBalance {
  asOfDate: Date;
  lines: TrialBalanceLine[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
}

@Injectable()
export class GeneralLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all journal entries across sources for a date range
   */
  async getGeneralLedger(query: GeneralLedgerQuery): Promise<JournalEntry[]> {
    const { tenantId, startDate, endDate, accountCode, sourceType } = query;

    // Combine entries from all journal sources in parallel
    const [categorizationJournals, payrollJournals] = await Promise.all([
      this.getCategorizationJournals(tenantId, startDate, endDate, accountCode),
      this.getPayrollJournals(tenantId, startDate, endDate, accountCode),
    ]);

    let allEntries = [...categorizationJournals, ...payrollJournals];

    // Filter by source type if specified
    if (sourceType) {
      allEntries = allEntries.filter((e) => e.sourceType === sourceType);
    }

    // Sort by date, then by id for consistency
    allEntries.sort((a, b) => {
      const dateCompare = a.date.getTime() - b.date.getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.id.localeCompare(b.id);
    });

    return allEntries;
  }

  /**
   * Get ledger for a specific account with opening and closing balances
   */
  async getAccountLedger(
    tenantId: string,
    accountCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AccountLedger> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: accountCode },
    });

    if (!account) {
      throw new NotFoundException(`Account ${accountCode} not found`);
    }

    // Get opening balance (sum of all entries before startDate)
    const openingBalanceCents = await this.calculateBalanceAsOf(
      tenantId,
      accountCode,
      startDate,
    );

    // Get entries for the period
    const entries = await this.getGeneralLedger({
      tenantId,
      startDate,
      endDate,
      accountCode,
    });

    // Calculate closing balance based on account normal balance direction
    // Debit-normal accounts: Assets, Expenses (increase with debits)
    // Credit-normal accounts: Liabilities, Equity, Revenue (increase with credits)
    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);
    const periodNet = entries.reduce((sum, e) => {
      if (isDebitNormal) {
        return sum + (e.debitCents - e.creditCents);
      } else {
        return sum + (e.creditCents - e.debitCents);
      }
    }, 0);
    const closingBalanceCents = openingBalanceCents + periodNet;

    return {
      accountCode,
      accountName: account.name,
      accountType: account.type,
      openingBalanceCents,
      entries,
      closingBalanceCents,
    };
  }

  /**
   * Generate trial balance as of a specific date
   */
  async getTrialBalance(
    tenantId: string,
    asOfDate: Date,
  ): Promise<TrialBalance> {
    const accounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: 'asc' },
    });

    const lines = await Promise.all(
      accounts.map(async (account) => {
        const balance = await this.calculateBalanceAsOf(
          tenantId,
          account.code,
          new Date(asOfDate.getTime() + 24 * 60 * 60 * 1000), // End of day
        );

        // Debit-normal accounts: Assets, Expenses
        // Credit-normal accounts: Liabilities, Equity, Revenue
        const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);

        let debitBalanceCents = 0;
        let creditBalanceCents = 0;

        if (isDebitNormal) {
          if (balance >= 0) {
            debitBalanceCents = balance;
          } else {
            creditBalanceCents = Math.abs(balance);
          }
        } else {
          if (balance >= 0) {
            creditBalanceCents = balance;
          } else {
            debitBalanceCents = Math.abs(balance);
          }
        }

        return {
          accountCode: account.code,
          accountName: account.name,
          accountType: account.type,
          debitBalanceCents,
          creditBalanceCents,
        };
      }),
    );

    // Filter out zero balances
    const nonZeroLines = lines.filter(
      (l) => l.debitBalanceCents !== 0 || l.creditBalanceCents !== 0,
    );

    const totalDebitsCents = nonZeroLines.reduce(
      (sum, l) => sum + l.debitBalanceCents,
      0,
    );
    const totalCreditsCents = nonZeroLines.reduce(
      (sum, l) => sum + l.creditBalanceCents,
      0,
    );

    return {
      asOfDate,
      lines: nonZeroLines,
      totalDebitsCents,
      totalCreditsCents,
      isBalanced: totalDebitsCents === totalCreditsCents,
    };
  }

  /**
   * Get categorization journal entries as general ledger format
   * CategorizationJournal moves amounts from suspense (fromAccountCode) to expense (toAccountCode)
   */
  private async getCategorizationJournals(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    accountCode?: string,
  ): Promise<JournalEntry[]> {
    const journals = await this.prisma.categorizationJournal.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        ...(accountCode && {
          OR: [
            { fromAccountCode: accountCode },
            { toAccountCode: accountCode },
          ],
        }),
      },
      include: {
        transaction: true,
      },
    });

    const entries: JournalEntry[] = [];

    for (const journal of journals) {
      // Get account names from ChartOfAccount
      const [fromAccount, toAccount] = await Promise.all([
        this.prisma.chartOfAccount.findFirst({
          where: { tenantId, code: journal.fromAccountCode },
        }),
        this.prisma.chartOfAccount.findFirst({
          where: { tenantId, code: journal.toAccountCode },
        }),
      ]);

      // CategorizationJournal represents moving money:
      // If isCredit is true: Credit from suspense, Debit to expense (income categorization)
      // If isCredit is false: Debit to expense, Credit from suspense (expense categorization)
      const description = journal.transaction?.description || journal.narration;
      const reference =
        journal.transaction?.reference || journal.journalNumber || undefined;

      if (journal.isCredit) {
        // Credit entry (from suspense - decreasing asset)
        entries.push({
          id: `${journal.id}-CR`,
          date: journal.createdAt,
          description,
          accountCode: journal.fromAccountCode,
          accountName: fromAccount?.name || journal.fromAccountCode,
          debitCents: 0,
          creditCents: journal.amountCents,
          sourceType: 'CATEGORIZATION',
          sourceId: journal.transactionId,
          reference,
        });

        // Debit entry (to expense/revenue account)
        entries.push({
          id: `${journal.id}-DR`,
          date: journal.createdAt,
          description,
          accountCode: journal.toAccountCode,
          accountName: toAccount?.name || journal.toAccountCode,
          debitCents: journal.amountCents,
          creditCents: 0,
          sourceType: 'CATEGORIZATION',
          sourceId: journal.transactionId,
          reference,
        });
      } else {
        // Debit entry (from suspense - for expenses)
        entries.push({
          id: `${journal.id}-DR`,
          date: journal.createdAt,
          description,
          accountCode: journal.toAccountCode,
          accountName: toAccount?.name || journal.toAccountCode,
          debitCents: journal.amountCents,
          creditCents: 0,
          sourceType: 'CATEGORIZATION',
          sourceId: journal.transactionId,
          reference,
        });

        // Credit entry (to expense account)
        entries.push({
          id: `${journal.id}-CR`,
          date: journal.createdAt,
          description,
          accountCode: journal.fromAccountCode,
          accountName: fromAccount?.name || journal.fromAccountCode,
          debitCents: 0,
          creditCents: journal.amountCents,
          sourceType: 'CATEGORIZATION',
          sourceId: journal.transactionId,
          reference,
        });
      }
    }

    return entries;
  }

  /**
   * Get payroll journal entries as general ledger format
   */
  private async getPayrollJournals(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    accountCode?: string,
  ): Promise<JournalEntry[]> {
    const journals = await this.prisma.payrollJournal.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        journalLines: true,
        payroll: true,
      },
    });

    const entries: JournalEntry[] = [];

    for (const journal of journals) {
      for (const line of journal.journalLines) {
        // Filter by account code if specified
        if (accountCode && line.xeroAccountCode !== accountCode) continue;

        // Get account name from ChartOfAccount
        const account = await this.prisma.chartOfAccount.findFirst({
          where: { tenantId, code: line.xeroAccountCode },
        });

        const payPeriod = journal.payroll
          ? `${journal.payPeriodStart.toISOString().split('T')[0]} - ${journal.payPeriodEnd.toISOString().split('T')[0]}`
          : journal.narration;

        entries.push({
          id: line.id,
          date: journal.createdAt,
          description: `Payroll - ${line.description}`,
          accountCode: line.xeroAccountCode,
          accountName: account?.name || line.xeroAccountCode,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          sourceType: 'PAYROLL',
          sourceId: journal.payrollId,
          reference: payPeriod,
        });
      }
    }

    return entries;
  }

  /**
   * Calculate net balance for an account as of a specific date
   */
  private async calculateBalanceAsOf(
    tenantId: string,
    accountCode: string,
    asOfDate: Date,
  ): Promise<number> {
    // Get account to determine normal balance direction
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: accountCode },
    });

    if (!account) {
      return 0;
    }

    // Sum all entries before the date
    const entries = await this.getGeneralLedger({
      tenantId,
      startDate: new Date('1970-01-01'),
      endDate: new Date(asOfDate.getTime() - 1), // Day before
      accountCode,
    });

    // Calculate based on normal balance direction
    const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.type);

    return entries.reduce((sum, e) => {
      if (isDebitNormal) {
        return sum + (e.debitCents - e.creditCents);
      } else {
        return sum + (e.creditCents - e.debitCents);
      }
    }, 0);
  }

  /**
   * Get summary of general ledger activity for dashboard
   */
  async getLedgerSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalTransactions: number;
    totalDebitsCents: number;
    totalCreditsCents: number;
    bySourceType: { sourceType: string; count: number; totalCents: number }[];
  }> {
    const entries = await this.getGeneralLedger({
      tenantId,
      startDate,
      endDate,
    });

    const totalDebitsCents = entries.reduce((sum, e) => sum + e.debitCents, 0);
    const totalCreditsCents = entries.reduce(
      (sum, e) => sum + e.creditCents,
      0,
    );

    // Group by source type
    const bySourceMap = new Map<
      string,
      { count: number; totalCents: number }
    >();
    for (const entry of entries) {
      const existing = bySourceMap.get(entry.sourceType) || {
        count: 0,
        totalCents: 0,
      };
      existing.count += 1;
      existing.totalCents += entry.debitCents + entry.creditCents;
      bySourceMap.set(entry.sourceType, existing);
    }

    const bySourceType = Array.from(bySourceMap.entries()).map(
      ([sourceType, data]) => ({
        sourceType,
        count: data.count,
        totalCents: data.totalCents,
      }),
    );

    return {
      totalTransactions: entries.length,
      totalDebitsCents,
      totalCreditsCents,
      bySourceType,
    };
  }
}
