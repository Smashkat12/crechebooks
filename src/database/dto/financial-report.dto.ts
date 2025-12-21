/**
 * Financial Report DTOs
 * TASK-RECON-013: Financial Report Service
 *
 * @module database/dto/financial-report
 * @description DTOs for financial reports (Income Statement, Balance Sheet, Trial Balance)
 * All amounts are in CENTS internally, with RANDS for display (divided by 100)
 */

export enum ReportFormat {
  JSON = 'JSON',
  PDF = 'PDF',
  EXCEL = 'EXCEL',
}

export interface AccountBreakdown {
  accountCode: string;
  accountName: string;
  amountCents: number; // Internal - cents
  amountRands: number; // Display - rands (amountCents / 100)
}

export interface IncomeStatement {
  tenantId: string;
  period: { start: Date; end: Date };
  income: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  expenses: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  netProfitCents: number;
  netProfitRands: number;
  generatedAt: Date;
}

export interface BalanceSheet {
  tenantId: string;
  asOfDate: Date;
  assets: {
    totalCents: number;
    totalRands: number;
    current: AccountBreakdown[];
    nonCurrent: AccountBreakdown[];
  };
  liabilities: {
    totalCents: number;
    totalRands: number;
    current: AccountBreakdown[];
    nonCurrent: AccountBreakdown[];
  };
  equity: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  isBalanced: boolean; // Assets = Liabilities + Equity
  generatedAt: Date;
}

export interface TrialBalanceAccount {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  debitRands: number;
  creditRands: number;
}

export interface TrialBalance {
  tenantId: string;
  asOfDate: Date;
  accounts: TrialBalanceAccount[];
  totals: {
    debitsCents: number;
    creditsCents: number;
    debitsRands: number;
    creditsRands: number;
  };
  isBalanced: boolean; // Debits = Credits
  generatedAt: Date;
}
