import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchType, MatchedBy } from '@prisma/client';

/**
 * Response DTO for a single payment in allocation response.
 * Uses snake_case for external API consumers.
 * Amounts are in decimal format.
 */
export class PaymentDto {
  @ApiProperty({
    description: 'Payment UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Invoice UUID the payment was allocated to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  invoice_id!: string;

  @ApiPropertyOptional({
    description: 'Transaction UUID the payment was allocated from',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  transaction_id!: string | null;

  @ApiProperty({
    description: 'Payment amount in Rand (decimal format)',
    example: 3450.0,
  })
  amount!: number;

  @ApiProperty({
    description: 'Payment date',
    example: '2025-12-22T10:00:00Z',
  })
  payment_date!: string;

  @ApiPropertyOptional({
    description: 'Payment reference',
    example: 'REF123456',
  })
  reference!: string | null;

  @ApiProperty({
    description: 'Type of payment match',
    enum: MatchType,
    example: MatchType.MANUAL,
  })
  match_type!: MatchType;

  @ApiProperty({
    description: 'How the payment was matched',
    enum: MatchedBy,
    example: MatchedBy.USER,
  })
  matched_by!: MatchedBy;

  @ApiPropertyOptional({
    description: 'Match confidence score (0-100) for AI matches',
    example: 95.5,
  })
  match_confidence!: number | null;

  @ApiProperty({
    description: 'Whether the payment has been reversed',
    example: false,
  })
  is_reversed!: boolean;

  @ApiProperty({
    description: 'Payment creation timestamp',
    example: '2025-12-22T10:00:00Z',
  })
  created_at!: string;
}

/**
 * Data portion of allocation response.
 */
export class AllocationResponseData {
  @ApiProperty({
    type: [PaymentDto],
    description: 'Array of payments created by the allocation',
  })
  payments!: PaymentDto[];

  @ApiProperty({
    description:
      'Remaining unallocated amount from the transaction in Rand (decimal)',
    example: 0.0,
  })
  unallocated_amount!: number;

  @ApiProperty({
    description: 'Invoice IDs that were updated',
    type: [String],
    example: ['inv-001', 'inv-002'],
  })
  invoices_updated!: string[];
}

/**
 * Full response DTO for payment allocation endpoint.
 */
export class AllocatePaymentResponseDto {
  @ApiProperty({
    description: 'Whether the operation was successful',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    type: AllocationResponseData,
    description: 'Allocation result data',
  })
  data!: AllocationResponseData;
}

/**
 * Response DTO for a single payment in list response.
 * Extends PaymentDto with additional related entity info.
 */
export class PaymentListItemDto extends PaymentDto {
  @ApiPropertyOptional({
    description: 'Invoice number for display',
    example: 'INV-2025-0001',
  })
  invoice_number?: string;

  @ApiPropertyOptional({
    description: 'Parent name associated with the invoice',
    example: 'John Smith',
  })
  parent_name?: string;

  @ApiPropertyOptional({
    description: 'Child name associated with the invoice',
    example: 'Emma Smith',
  })
  child_name?: string;
}

/**
 * Pagination metadata for list responses.
 */
export class PaginationMeta {
  @ApiProperty({ description: 'Current page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of items', example: 45 })
  total!: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages!: number;
}

/**
 * Full response DTO for payment list endpoint.
 */
export class PaymentListResponseDto {
  @ApiProperty({
    description: 'Whether the operation was successful',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    type: [PaymentListItemDto],
    description: 'Array of payments',
  })
  data!: PaymentListItemDto[];

  @ApiProperty({
    type: PaginationMeta,
    description: 'Pagination metadata',
  })
  meta!: PaginationMeta;
}
