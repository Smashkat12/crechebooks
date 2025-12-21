/**
 * South African Chart of Accounts structure
 * Based on IFRS for SMEs
 *
 * @module database/constants/chart-of-accounts
 * @description Standard Chart of Accounts ranges and helpers for South African accounting
 */

export const ACCOUNT_RANGES = {
  ASSETS: { start: 1000, end: 1999 },
  CURRENT_ASSETS: { start: 1000, end: 1499 },
  NON_CURRENT_ASSETS: { start: 1500, end: 1999 },
  LIABILITIES: { start: 2000, end: 2999 },
  CURRENT_LIABILITIES: { start: 2000, end: 2499 },
  NON_CURRENT_LIABILITIES: { start: 2500, end: 2999 },
  EQUITY: { start: 3000, end: 3999 },
  INCOME: { start: 4000, end: 4999 },
  EXPENSES: { start: 5000, end: 8999 },
};

export const DEFAULT_ACCOUNTS = {
  BANK: { code: '1100', name: 'Bank Account' },
  ACCOUNTS_RECEIVABLE: { code: '1200', name: 'Accounts Receivable' },
  PREPAID_EXPENSES: { code: '1300', name: 'Prepaid Expenses' },
  EQUIPMENT: { code: '1500', name: 'Equipment' },
  ACCOUNTS_PAYABLE: { code: '2100', name: 'Accounts Payable' },
  VAT_PAYABLE: { code: '2200', name: 'VAT Payable' },
  RETAINED_EARNINGS: { code: '3100', name: 'Retained Earnings' },
  SCHOOL_FEES: { code: '4000', name: 'School Fees Income' },
  OTHER_INCOME: { code: '4100', name: 'Other Income' },
  SALARIES: { code: '5000', name: 'Salaries and Wages' },
  RENT: { code: '5100', name: 'Rent Expense' },
  UTILITIES: { code: '5200', name: 'Utilities' },
  SUPPLIES: { code: '5300', name: 'Educational Supplies' },
  BANK_CHARGES: { code: '8100', name: 'Bank Charges' },
};

export function isIncomeAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.INCOME.start && num <= ACCOUNT_RANGES.INCOME.end;
}

export function isExpenseAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.EXPENSES.start && num <= ACCOUNT_RANGES.EXPENSES.end
  );
}

export function isAssetAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.ASSETS.start && num <= ACCOUNT_RANGES.ASSETS.end;
}

export function isLiabilityAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.LIABILITIES.start &&
    num <= ACCOUNT_RANGES.LIABILITIES.end
  );
}

export function isEquityAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.EQUITY.start && num <= ACCOUNT_RANGES.EQUITY.end;
}

export function isCurrentAsset(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.CURRENT_ASSETS.start &&
    num <= ACCOUNT_RANGES.CURRENT_ASSETS.end
  );
}

export function isNonCurrentAsset(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.NON_CURRENT_ASSETS.start &&
    num <= ACCOUNT_RANGES.NON_CURRENT_ASSETS.end
  );
}

export function isCurrentLiability(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.CURRENT_LIABILITIES.start &&
    num <= ACCOUNT_RANGES.CURRENT_LIABILITIES.end
  );
}

export function isNonCurrentLiability(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.NON_CURRENT_LIABILITIES.start &&
    num <= ACCOUNT_RANGES.NON_CURRENT_LIABILITIES.end
  );
}
