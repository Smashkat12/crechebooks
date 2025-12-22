// Reconciliation types

export interface IReconciliation {
  id: string;
  tenantId: string;
  bankAccountId: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: number;
  closingBalance: number;
  statementBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  status: ReconciliationStatus;
  reconciledAt?: Date;
  reconciledBy?: string;
  items: IReconciliationItem[];
}

export interface IReconciliationItem {
  id: string;
  reconciliationId: string;
  transactionId: string;
  xeroTransactionId?: string;
  date: Date;
  description: string;
  amount: number;
  matched: boolean;
  discrepancy?: number;
  notes?: string;
}

export enum ReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_REVIEW = 'PENDING_REVIEW',
  COMPLETED = 'COMPLETED',
  DISCREPANCY = 'DISCREPANCY',
}

export interface IFinancialReport {
  type: ReportType;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  data: IReportData;
}

export interface IReportData {
  summary: IReportSummary;
  sections: IReportSection[];
}

export interface IReportSummary {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  vatCollected: number;
  vatPaid: number;
  netVat: number;
}

export interface IReportSection {
  name: string;
  items: IReportLineItem[];
  total: number;
}

export interface IReportLineItem {
  accountCode: string;
  accountName: string;
  amount: number;
  vatAmount?: number;
}

export enum ReportType {
  INCOME_STATEMENT = 'INCOME_STATEMENT',
  BALANCE_SHEET = 'BALANCE_SHEET',
  CASH_FLOW = 'CASH_FLOW',
  VAT_REPORT = 'VAT_REPORT',
  AGED_RECEIVABLES = 'AGED_RECEIVABLES',
  AGED_PAYABLES = 'AGED_PAYABLES',
}
