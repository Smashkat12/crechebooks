/**
 * Reconciliation Entity
 * Tracks bank reconciliation processes for the creche. Stores opening and closing
 * balances, calculated balances from transactions, and identifies discrepancies.
 * Each reconciliation is tied to a specific bank account and period. The status
 * helps accountants track which periods have been verified and which need attention.
 */

export enum ReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  RECONCILED = 'RECONCILED',
  DISCREPANCY = 'DISCREPANCY',
}

export interface IReconciliation {
  id: string;
  tenantId: string;
  bankAccount: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents: number;
  closingBalanceCents: number;
  calculatedBalanceCents: number;
  discrepancyCents: number;
  status: ReconciliationStatus;
  reconciledBy: string | null;
  reconciledAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
