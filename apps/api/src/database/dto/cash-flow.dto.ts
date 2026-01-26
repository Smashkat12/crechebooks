import { IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetCashFlowStatementDto {
  @ApiProperty({
    description: 'Start date for the cash flow period',
    example: '2026-01-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date for the cash flow period',
    example: '2026-01-31',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Include comparative period (prior year)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeComparative?: boolean;
}

export interface CashFlowAdjustment {
  name: string;
  amountCents: number;
  description?: string;
}

export interface OperatingActivitiesResponse {
  netIncomeCents: number;
  adjustments: {
    depreciation: number;
    receivablesChange: number;
    payablesChange: number;
    prepaidExpensesChange: number;
    accruedExpensesChange: number;
    otherAdjustments: number;
  };
  adjustmentDetails: CashFlowAdjustment[];
  totalAdjustmentsCents: number;
  netCashFromOperatingCents: number;
}

export interface InvestingActivitiesResponse {
  assetPurchasesCents: number;
  assetSalesCents: number;
  equipmentPurchasesCents: number;
  investmentPurchasesCents: number;
  investmentSalesCents: number;
  netCashFromInvestingCents: number;
}

export interface FinancingActivitiesResponse {
  loanProceedsCents: number;
  loanRepaymentsCents: number;
  ownerContributionsCents: number;
  ownerDrawingsCents: number;
  netCashFromFinancingCents: number;
}

export interface CashFlowSummaryResponse {
  netCashChangeCents: number;
  openingCashBalanceCents: number;
  closingCashBalanceCents: number;
  cashReconciles: boolean;
}

export interface CashFlowStatementResponse {
  period: {
    startDate: string;
    endDate: string;
  };
  operatingActivities: OperatingActivitiesResponse;
  investingActivities: InvestingActivitiesResponse;
  financingActivities: FinancingActivitiesResponse;
  summary: CashFlowSummaryResponse;
  comparative?: {
    period: { startDate: string; endDate: string };
    operatingActivities: OperatingActivitiesResponse;
    investingActivities: InvestingActivitiesResponse;
    financingActivities: FinancingActivitiesResponse;
    summary: CashFlowSummaryResponse;
  };
}

export interface CashFlowTrendResponse {
  periods: Array<{
    period: string;
    operatingCents: number;
    investingCents: number;
    financingCents: number;
    netChangeCents: number;
    closingBalanceCents: number;
  }>;
}
