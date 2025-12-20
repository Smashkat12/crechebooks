/**
 * Categorization Entity Types
 * TASK-TRANS-002: Categorization Entity and Types
 */

export enum VatType {
  STANDARD = 'STANDARD',
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}

export enum CategorizationSource {
  AI_AUTO = 'AI_AUTO',
  AI_SUGGESTED = 'AI_SUGGESTED',
  USER_OVERRIDE = 'USER_OVERRIDE',
  RULE_BASED = 'RULE_BASED',
}

export interface ICategorization {
  id: string;
  transactionId: string;
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  reasoning: string | null;
  source: CategorizationSource;
  isSplit: boolean;
  splitAmountCents: number | null;
  vatAmountCents: number | null;
  vatType: VatType;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
