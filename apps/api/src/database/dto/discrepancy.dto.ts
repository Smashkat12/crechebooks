/**
 * Discrepancy DTOs
 * TASK-RECON-012: Discrepancy Service
 *
 * @module database/dto/discrepancy
 * @description Data Transfer Objects for discrepancy detection and classification
 */

export enum DiscrepancyType {
  IN_BANK_NOT_XERO = 'IN_BANK_NOT_XERO',
  IN_XERO_NOT_BANK = 'IN_XERO_NOT_BANK',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DATE_MISMATCH = 'DATE_MISMATCH',
}

export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Discrepancy {
  type: DiscrepancyType;
  transactionId?: string;
  xeroTransactionId?: string;
  description: string;
  amountCents: number;
  date?: Date;
  expectedAmountCents?: number;
  actualAmountCents?: number;
  severity: DiscrepancySeverity;
}

export interface DiscrepancyReport {
  reconciliationId: string;
  tenantId: string;
  totalDiscrepancyCents: number;
  discrepancyCount: number;
  discrepancies: Discrepancy[];
  summary: {
    inBankNotXero: number;
    inXeroNotBank: number;
    amountMismatches: number;
    dateMismatches: number;
  };
  generatedAt: Date;
}

export interface ResolutionSuggestion {
  action: string;
  description: string;
  automatable: boolean;
  estimatedImpactCents: number;
}

export interface DiscrepancyClassification {
  type: DiscrepancyType | null;
  severity: DiscrepancySeverity;
}
