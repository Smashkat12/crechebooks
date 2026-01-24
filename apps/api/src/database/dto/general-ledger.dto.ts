import { IsString, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetGeneralLedgerDto {
  @ApiProperty({ description: 'Start date for the ledger query (ISO format)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for the ledger query (ISO format)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Filter by specific account code' })
  @IsOptional()
  @IsString()
  accountCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by source type',
    enum: ['CATEGORIZATION', 'PAYROLL', 'MANUAL', 'INVOICE', 'PAYMENT'],
  })
  @IsOptional()
  @IsString()
  sourceType?: string;
}

export class GetAccountLedgerDto {
  @ApiProperty({ description: 'Account code to retrieve ledger for' })
  @IsString()
  accountCode: string;

  @ApiProperty({ description: 'Start date for the ledger query (ISO format)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for the ledger query (ISO format)' })
  @IsDateString()
  endDate: string;
}

export class GetTrialBalanceDto {
  @ApiProperty({ description: 'As-of date for trial balance (ISO format)' })
  @IsDateString()
  asOfDate: string;
}

export interface JournalEntryResponse {
  id: string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  sourceType: 'CATEGORIZATION' | 'PAYROLL' | 'MANUAL' | 'INVOICE' | 'PAYMENT';
  sourceId: string;
  reference?: string;
}

export interface AccountLedgerResponse {
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalanceCents: number;
  entries: JournalEntryResponse[];
  closingBalanceCents: number;
}

export interface TrialBalanceLineResponse {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalanceCents: number;
  creditBalanceCents: number;
}

export interface TrialBalanceResponse {
  asOfDate: string;
  lines: TrialBalanceLineResponse[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
}
