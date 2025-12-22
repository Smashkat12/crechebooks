/**
 * VAT201 DTOs
 * TASK-SARS-032: VAT201 Endpoint
 *
 * API DTOs for VAT201 generation endpoint.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ApiGenerateVat201Dto {
  @ApiProperty({
    description: 'Start date of VAT period (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsDateString()
  period_start!: string;

  @ApiProperty({
    description: 'End date of VAT period (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsDateString()
  period_end!: string;
}

export class ApiVat201ReviewItemDto {
  @ApiProperty({ example: 'trans-uuid' })
  transaction_id!: string;

  @ApiProperty({ example: 'Missing VAT number on supplier invoice' })
  issue!: string;

  @ApiProperty({ example: 'WARNING', enum: ['ERROR', 'WARNING'] })
  severity!: string;
}

export class ApiVat201DataDto {
  @ApiProperty({ example: 'uuid-here' })
  id!: string;

  @ApiProperty({ example: 'VAT201' })
  submission_type!: string;

  @ApiProperty({ example: '2025-01', description: 'Period in YYYY-MM format' })
  period!: string;

  @ApiProperty({
    example: 'DRAFT',
    enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'],
  })
  status!: string;

  @ApiProperty({
    example: 23175.0,
    description: 'Output VAT from sales (Rands)',
  })
  output_vat!: number;

  @ApiProperty({
    example: 8450.0,
    description: 'Input VAT from purchases (Rands)',
  })
  input_vat!: number;

  @ApiProperty({
    example: 14725.0,
    description: 'Net VAT payable (output - input, Rands)',
  })
  net_vat!: number;

  @ApiProperty({
    example: true,
    description: 'True if net VAT is owed to SARS',
  })
  is_payable!: boolean;

  @ApiProperty({
    type: [ApiVat201ReviewItemDto],
    description: 'Items requiring review',
  })
  items_requiring_review!: ApiVat201ReviewItemDto[];

  @ApiProperty({
    example: '2025-02-25T00:00:00.000Z',
    description: 'Submission deadline',
  })
  deadline!: string;

  @ApiProperty({ example: '/sars/vat201/uuid/document' })
  document_url!: string;
}

export class ApiVat201ResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiVat201DataDto })
  data!: ApiVat201DataDto;
}
