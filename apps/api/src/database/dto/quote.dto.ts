import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuoteLineDto {
  @ApiProperty({ description: 'Line item description' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Quantity', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ description: 'Unit price in cents' })
  @IsInt()
  @Min(0)
  unitPriceCents: number;

  @ApiPropertyOptional({
    description: 'VAT type',
    enum: ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT'],
    default: 'EXEMPT',
  })
  @IsOptional()
  @IsString()
  vatType?: string;

  @ApiPropertyOptional({ description: 'Fee structure ID for linking' })
  @IsOptional()
  @IsString()
  feeStructureId?: string;

  @ApiPropertyOptional({ description: 'Line type for invoice categorization' })
  @IsOptional()
  @IsString()
  lineType?: string;

  @ApiPropertyOptional({ description: 'Account ID for coding' })
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class CreateQuoteDto {
  @ApiProperty({ description: 'Recipient name' })
  @IsString()
  recipientName: string;

  @ApiProperty({ description: 'Recipient email' })
  @IsEmail()
  recipientEmail: string;

  @ApiPropertyOptional({ description: 'Recipient phone' })
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Existing parent ID if applicable' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Child name for enrollment quotes' })
  @IsOptional()
  @IsString()
  childName?: string;

  @ApiPropertyOptional({ description: 'Child date of birth' })
  @IsOptional()
  @IsDateString()
  childDob?: string;

  @ApiPropertyOptional({ description: 'Expected enrollment start date' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Quote validity in days', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @ApiPropertyOptional({ description: 'Notes, terms, and conditions' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Quote line items', type: [CreateQuoteLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteLineDto)
  lines: CreateQuoteLineDto[];
}

export class UpdateQuoteDto {
  @ApiPropertyOptional({ description: 'Recipient name' })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Recipient email' })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional({ description: 'Recipient phone' })
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Child name' })
  @IsOptional()
  @IsString()
  childName?: string;

  @ApiPropertyOptional({ description: 'Child date of birth' })
  @IsOptional()
  @IsDateString()
  childDob?: string;

  @ApiPropertyOptional({ description: 'Expected start date' })
  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @ApiPropertyOptional({ description: 'Quote validity in days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DeclineQuoteDto {
  @ApiPropertyOptional({ description: 'Reason for declining' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ConvertQuoteDto {
  @ApiPropertyOptional({
    description: 'Invoice due date',
    default: '14 days from now',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Additional notes for invoice' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export interface QuoteLineResponse {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  vatType: string;
  feeStructureId: string | null;
  lineType: string | null;
}

export interface QuoteResponse {
  id: string;
  quoteNumber: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string | null;
  parentId: string | null;
  childName: string | null;
  childDob: Date | null;
  expectedStartDate: Date | null;
  quoteDate: Date;
  expiryDate: Date;
  validityDays: number;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  status: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  convertedToInvoiceId: string | null;
  notes: string | null;
  lines: QuoteLineResponse[];
  createdAt: Date;
}

export interface QuoteSummaryResponse {
  totalQuotes: number;
  draftCount: number;
  sentCount: number;
  acceptedCount: number;
  declinedCount: number;
  expiredCount: number;
  convertedCount: number;
  totalValueCents: number;
  pendingValueCents: number;
  conversionRate: number;
}
