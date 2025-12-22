import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * API DTO for individual invoice allocation within a payment request.
 * Uses snake_case for external API consumers.
 * Amount is in decimal format (e.g., 3450.00 for R3450.00).
 */
export class ApiAllocationDto {
  @ApiProperty({
    description: 'Invoice UUID to allocate payment to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  invoice_id!: string;

  @ApiProperty({
    description: 'Amount to allocate in Rand (decimal format, e.g., 3450.00)',
    example: 3450.0,
    minimum: 0.01,
  })
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

/**
 * API DTO for manual payment allocation request.
 * Allocates a bank transaction credit to one or more invoices.
 * Uses snake_case for external API consumers.
 */
export class ApiAllocatePaymentDto {
  @ApiProperty({
    description:
      'Transaction UUID to allocate from (must be a credit transaction)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  transaction_id!: string;

  @ApiProperty({
    type: [ApiAllocationDto],
    description: 'Array of invoice allocations with amounts in decimal format',
    minItems: 1,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApiAllocationDto)
  @ArrayMinSize(1, { message: 'At least one allocation is required' })
  allocations!: ApiAllocationDto[];
}
