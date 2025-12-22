// src/api/payment/dto/matching-result.dto.ts
import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for an auto-applied payment match.
 */
export class ApiMatchedPaymentDto {
  @ApiProperty({ example: 'payment-uuid' })
  id!: string;

  @ApiProperty({ example: 'transaction-uuid' })
  transaction_id!: string;

  @ApiProperty({ example: 'invoice-uuid' })
  invoice_id!: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number!: string;

  @ApiProperty({ example: 3450.0, description: 'Amount in Rand (decimal)' })
  amount!: number;

  @ApiProperty({ enum: ['EXACT', 'HIGH', 'MEDIUM', 'LOW'] })
  confidence_level!: string;

  @ApiProperty({ example: 95 })
  confidence_score!: number;

  @ApiProperty({
    type: [String],
    example: ['Exact reference match', 'Exact amount match'],
  })
  match_reasons!: string[];
}

/**
 * Suggested match candidate for review.
 */
export class ApiSuggestedMatchDto {
  @ApiProperty({ example: 'invoice-uuid' })
  invoice_id!: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number!: string;

  @ApiProperty({ example: 'John Smith' })
  parent_name!: string;

  @ApiProperty({ example: 65 })
  confidence_score!: number;

  @ApiProperty({
    type: [String],
    example: ['Amount within 5%', 'Strong name similarity'],
  })
  match_reasons!: string[];

  @ApiProperty({
    example: 3450.0,
    description: 'Invoice outstanding in Rand (decimal)',
  })
  outstanding_amount!: number;
}

/**
 * Transaction requiring manual review.
 */
export class ApiReviewRequiredDto {
  @ApiProperty({ example: 'transaction-uuid' })
  transaction_id!: string;

  @ApiProperty({
    example: 3500.0,
    description: 'Transaction amount in Rand (decimal)',
  })
  amount!: number;

  @ApiProperty({ description: 'Why this needs review' })
  reason!: string;

  @ApiProperty({ type: [ApiSuggestedMatchDto] })
  suggested_matches!: ApiSuggestedMatchDto[];
}

/**
 * Summary of matching batch operation.
 */
export class ApiMatchingSummaryDto {
  @ApiProperty({ example: 25, description: 'Total transactions processed' })
  processed!: number;

  @ApiProperty({
    example: 18,
    description: 'Matches auto-applied (confidence >= 80%)',
  })
  auto_applied!: number;

  @ApiProperty({ example: 5, description: 'Matches requiring manual review' })
  requires_review!: number;

  @ApiProperty({
    example: 2,
    description: 'Transactions with no matching invoice',
  })
  no_match!: number;
}

/**
 * Data portion of matching response.
 */
export class ApiMatchingResultDataDto {
  @ApiProperty({ type: ApiMatchingSummaryDto })
  summary!: ApiMatchingSummaryDto;

  @ApiProperty({ type: [ApiMatchedPaymentDto] })
  auto_matched!: ApiMatchedPaymentDto[];

  @ApiProperty({ type: [ApiReviewRequiredDto] })
  review_required!: ApiReviewRequiredDto[];
}

/**
 * Full response for payment matching endpoint.
 */
export class ApiMatchingResultResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiMatchingResultDataDto })
  data!: ApiMatchingResultDataDto;
}
