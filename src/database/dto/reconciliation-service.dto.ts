import {
  IsString,
  IsDateString,
  IsInt,
  IsUUID,
  MinLength,
} from 'class-validator';

export class ReconcileDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  bankAccount!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsInt()
  openingBalanceCents!: number;

  @IsInt()
  closingBalanceCents!: number;
}

export interface BalanceCalculation {
  openingBalanceCents: number;
  totalCreditsCents: number;
  totalDebitsCents: number;
  calculatedBalanceCents: number;
  transactionCount: number;
}

export interface ReconcileResult {
  id: string;
  status: 'IN_PROGRESS' | 'RECONCILED' | 'DISCREPANCY';
  openingBalanceCents: number;
  closingBalanceCents: number;
  calculatedBalanceCents: number;
  discrepancyCents: number;
  matchedCount: number;
  unmatchedCount: number;
}

export interface MatchResult {
  matchedCount: number;
  unmatchedCount: number;
  matchedTransactionIds: string[];
}
