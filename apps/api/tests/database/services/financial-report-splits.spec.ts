/**
 * Regression test for split-categorisation handling in financial reports.
 *
 * Bug: financial-report.service used to read tx.xeroAccountCode directly,
 * which is correct for normal categorisations but NULL for splits (a single
 * transaction crossing multiple accounts has no single account code). Splits
 * therefore fell into the '9999 uncategorised' bucket and didn't appear on
 * the income statement / GL / trial balance broken down per account.
 *
 * Fix: resolveAccountContributions reads the categorizations table and
 * expands each split into one entry per split line. The income/expense
 * classification logic then runs per-line.
 */
import { FinancialReportService } from '../../../src/database/services/financial-report.service';

interface FakePrisma {
  xeroAccount: { findMany: jest.Mock };
  transaction: { findMany: jest.Mock };
  categorization: { findMany: jest.Mock };
  invoice: { findMany: jest.Mock };
}

function buildFakePrisma(opts: {
  transactions: Array<{
    id: string;
    tenantId: string;
    date: Date;
    isCredit: boolean;
    amountCents: number;
    xeroAccountCode: string | null;
  }>;
  splits: Array<{
    transactionId: string;
    accountCode: string;
    splitAmountCents: number;
  }>;
}): FakePrisma {
  return {
    xeroAccount: { findMany: jest.fn().mockResolvedValue([]) },
    transaction: { findMany: jest.fn().mockResolvedValue(opts.transactions) },
    categorization: {
      findMany: jest.fn().mockResolvedValue(
        opts.splits.map((s) => ({ ...s, isSplit: true })),
      ),
    },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('FinancialReportService - splits in income statement', () => {
  const TENANT = 'tenant-1';
  const PERIOD_START = new Date('2026-03-01');
  const PERIOD_END = new Date('2026-03-31');

  it('attributes a split debit transaction across each split-line account', async () => {
    // One R1,000 debit (Pick n Pay) split as: R600 Food (5400) + R400
    // Cleaning Supplies (5600). Both are expense accounts; the income
    // statement should show R600 in 5400 and R400 in 5600.
    const fake = buildFakePrisma({
      transactions: [
        {
          id: 'tx-1',
          tenantId: TENANT,
          date: new Date('2026-03-15'),
          isCredit: false,
          amountCents: 100000,
          xeroAccountCode: null, // splits leave this NULL
        },
      ],
      splits: [
        { transactionId: 'tx-1', accountCode: '5400', splitAmountCents: 60000 },
        { transactionId: 'tx-1', accountCode: '5600', splitAmountCents: 40000 },
      ],
    });

    const svc = new FinancialReportService(
      fake as unknown as ConstructorParameters<typeof FinancialReportService>[0],
      {} as unknown as ConstructorParameters<typeof FinancialReportService>[1],
    );

    const report = await svc.generateIncomeStatement(
      TENANT,
      PERIOD_START,
      PERIOD_END,
    );

    expect(report.expenses.totalCents).toBe(100000);
    const codes = report.expenses.breakdown.map((b) => b.accountCode);
    expect(codes).toEqual(expect.arrayContaining(['5400', '5600']));
    const food = report.expenses.breakdown.find((b) => b.accountCode === '5400');
    const cleaning = report.expenses.breakdown.find((b) => b.accountCode === '5600');
    expect(food?.amountCents).toBe(60000);
    expect(cleaning?.amountCents).toBe(40000);
  });

  it('falls back to xero_account_code for non-split transactions (no regression)', async () => {
    // No splits in the categorizations table → behave exactly like before.
    const fake = buildFakePrisma({
      transactions: [
        {
          id: 'tx-2',
          tenantId: TENANT,
          date: new Date('2026-03-20'),
          isCredit: false,
          amountCents: 50000,
          xeroAccountCode: '5400',
        },
      ],
      splits: [],
    });

    const svc = new FinancialReportService(
      fake as unknown as ConstructorParameters<typeof FinancialReportService>[0],
      {} as unknown as ConstructorParameters<typeof FinancialReportService>[1],
    );

    const report = await svc.generateIncomeStatement(
      TENANT,
      PERIOD_START,
      PERIOD_END,
    );

    expect(report.expenses.totalCents).toBe(50000);
    expect(report.expenses.breakdown).toHaveLength(1);
    expect(report.expenses.breakdown[0].accountCode).toBe('5400');
  });

  it('handles a split credit (income) the same way', async () => {
    // R3,000 credit categorised as half tuition fees (4110) + half late
    // fees (4120). Both are income accounts; should show on the income
    // statement under each.
    const fake = buildFakePrisma({
      transactions: [
        {
          id: 'tx-3',
          tenantId: TENANT,
          date: new Date('2026-03-10'),
          isCredit: true,
          amountCents: 300000,
          xeroAccountCode: null,
        },
      ],
      splits: [
        { transactionId: 'tx-3', accountCode: '4110', splitAmountCents: 150000 },
        { transactionId: 'tx-3', accountCode: '4120', splitAmountCents: 150000 },
      ],
    });

    const svc = new FinancialReportService(
      fake as unknown as ConstructorParameters<typeof FinancialReportService>[0],
      {} as unknown as ConstructorParameters<typeof FinancialReportService>[1],
    );

    const report = await svc.generateIncomeStatement(
      TENANT,
      PERIOD_START,
      PERIOD_END,
    );

    expect(report.income.totalCents).toBe(300000);
    const codes = report.income.breakdown.map((b) => b.accountCode);
    expect(codes).toEqual(expect.arrayContaining(['4110', '4120']));
  });
});
