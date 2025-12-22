/**
 * Payment Entity
 * Links bank transactions to invoices for automated payment matching.
 * Supports exact matches, partial payments, overpayments, and manual allocations.
 * Tracks match confidence scores and allows reversal of incorrect matches.
 */

export enum MatchType {
  EXACT = 'EXACT',
  PARTIAL = 'PARTIAL',
  MANUAL = 'MANUAL',
  OVERPAYMENT = 'OVERPAYMENT',
}

export enum MatchedBy {
  AI_AUTO = 'AI_AUTO',
  USER = 'USER',
}

export interface IPayment {
  id: string;
  tenantId: string;
  xeroPaymentId: string | null;
  transactionId: string | null;
  invoiceId: string;
  amountCents: number;
  paymentDate: Date;
  reference: string | null;
  matchType: MatchType;
  matchConfidence: number | null;
  matchedBy: MatchedBy;
  isReversed: boolean;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
