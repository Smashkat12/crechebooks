/**
 * Payee Pattern Entity Types
 * TASK-TRANS-003: Payee Pattern Entity
 */

export interface IPayeePattern {
  id: string;
  tenantId: string;
  payeePattern: string;
  payeeAliases: string[];
  defaultAccountCode: string;
  defaultAccountName: string;
  confidenceBoost: number;
  matchCount: number;
  isRecurring: boolean;
  expectedAmountCents: number | null;
  amountVariancePercent: number | null;
  createdAt: Date;
  updatedAt: Date;
}
