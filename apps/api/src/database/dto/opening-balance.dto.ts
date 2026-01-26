import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOpeningBalanceImportDto {
  @ApiProperty({
    description: 'Opening balance date (start of financial year)',
  })
  @IsDateString()
  asOfDate: string;

  @ApiPropertyOptional({
    description: 'Source type (e.g., MANUAL, XERO, SAGE)',
  })
  @IsOptional()
  @IsString()
  sourceType?: string;
}

export class SetAccountBalanceDto {
  @ApiProperty({ description: 'Account ID from Chart of Accounts' })
  @IsString()
  accountId: string;

  @ApiPropertyOptional({
    description: 'Debit balance in cents (for debit-normal accounts)',
  })
  @IsOptional()
  @IsInt()
  debitCents?: number;

  @ApiPropertyOptional({
    description: 'Credit balance in cents (for credit-normal accounts)',
  })
  @IsOptional()
  @IsInt()
  creditCents?: number;

  @ApiPropertyOptional({ description: 'Optional notes about this balance' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkSetAccountBalancesDto {
  @ApiProperty({
    description: 'Array of account balances to set',
    type: [SetAccountBalanceDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetAccountBalanceDto)
  balances: SetAccountBalanceDto[];
}

export class VerifyImportDto {
  @ApiPropertyOptional({
    description:
      'Force verification even with small discrepancy (for rounding)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceBalance?: boolean;
}

export interface OpeningBalanceResponse {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitCents: number | null;
  creditCents: number | null;
  notes: string | null;
  isVerified: boolean;
}

export interface OpeningBalanceImportResponse {
  id: string;
  asOfDate: Date;
  status: string;
  sourceType: string | null;
  totalDebits: number;
  totalCredits: number;
  discrepancy: number;
  balanceCount: number;
  createdAt: Date;
}

export interface ImportSummaryResponse {
  import: OpeningBalanceImportResponse;
  balances: OpeningBalanceResponse[];
  accountCategories: {
    type: string;
    accounts: OpeningBalanceResponse[];
    totalDebits: number;
    totalCredits: number;
  }[];
}

export interface WizardStepResponse {
  step: number;
  title: string;
  description: string;
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    currentDebitCents: number | null;
    currentCreditCents: number | null;
  }>;
  isComplete: boolean;
}
