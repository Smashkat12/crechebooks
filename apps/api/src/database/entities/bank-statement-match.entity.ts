/**
 * Bank Statement Match Entity Types
 * TASK-RECON-019: Bank Statement to Xero Reconciliation
 */

export enum BankStatementMatchStatus {
  MATCHED = 'MATCHED',
  IN_BANK_ONLY = 'IN_BANK_ONLY',
  IN_XERO_ONLY = 'IN_XERO_ONLY',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DATE_MISMATCH = 'DATE_MISMATCH',
}

export interface IBankStatementMatch {
  id: string;
  tenantId: string;
  reconciliationId: string;

  // Bank statement side
  bankDate: Date;
  bankDescription: string;
  bankAmountCents: number;
  bankIsCredit: boolean;

  // Xero/CrecheBooks side (nullable if no match)
  transactionId: string | null;
  xeroDate: Date | null;
  xeroDescription: string | null;
  xeroAmountCents: number | null;
  xeroIsCredit: boolean | null;

  // Match result
  status: BankStatementMatchStatus;
  matchConfidence: number | null;
  discrepancyReason: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// Parsed bank statement data
export interface ParsedBankStatement {
  statementPeriod: {
    start: Date;
    end: Date;
  };
  accountNumber: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  transactions: ParsedBankTransaction[];
}

export interface ParsedBankTransaction {
  date: Date;
  description: string;
  amountCents: number;
  isCredit: boolean;
  balanceCents?: number;
  /**
   * Bank charges/fees associated with this transaction (e.g., ADT cash deposit fee).
   * This fee appears on the same line as the transaction but may be deducted
   * separately (immediately, at month-end, or in a later period).
   */
  feeAmountCents?: number;
}

// Reconciliation summary
export interface BankStatementReconciliationResult {
  reconciliationId: string;
  statementPeriod: { start: Date; end: Date };
  openingBalanceCents: number;
  closingBalanceCents: number;
  calculatedBalanceCents: number;
  discrepancyCents: number;
  matchSummary: {
    matched: number;
    inBankOnly: number;
    inXeroOnly: number;
    amountMismatch: number;
    dateMismatch: number;
    total: number;
  };
  status: 'RECONCILED' | 'DISCREPANCY';
}

// Create DTO for repository
export interface CreateBankStatementMatchDto {
  tenantId: string;
  reconciliationId: string;
  bankDate: Date;
  bankDescription: string;
  bankAmountCents: number;
  bankIsCredit: boolean;
  transactionId: string | null;
  xeroDate: Date | null;
  xeroDescription: string | null;
  xeroAmountCents: number | null;
  xeroIsCredit: boolean | null;
  status: BankStatementMatchStatus;
  matchConfidence: number | null;
  discrepancyReason: string | null;
}
