import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../../../database/entities/transaction.entity';
import { CategorizationResponseDto } from './categorization-response.dto';
import { PaginationMetaDto } from '../../../shared/dto';

export class TransactionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({
    example: '2025-01-15',
    description: 'Transaction date (YYYY-MM-DD)',
  })
  date: string;

  @ApiProperty({ example: 'DEBIT WOOLWORTHS FOOD 0012345' })
  description: string;

  @ApiProperty({ example: 'WOOLWORTHS', nullable: true })
  payee_name: string | null;

  @ApiProperty({ example: 'REF123456', nullable: true })
  reference: string | null;

  @ApiProperty({
    example: -125000,
    description: 'Amount in cents (negative for debits, positive for credits)',
  })
  amount_cents: number;

  @ApiProperty({
    example: false,
    description: 'True if credit, false if debit',
  })
  is_credit: boolean;

  @ApiProperty({ enum: TransactionStatus, example: 'CATEGORIZED' })
  status: TransactionStatus;

  @ApiProperty({ example: false })
  is_reconciled: boolean;

  @ApiProperty({
    type: CategorizationResponseDto,
    required: false,
    description: 'Categorization details if categorized',
  })
  categorization?: CategorizationResponseDto;

  @ApiProperty({ example: '2025-01-15T08:00:00Z' })
  created_at: Date;
}

export class TransactionListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
