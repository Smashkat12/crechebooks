/**
 * ReviewAttachmentDto — request body for POST /payment-attachments/:id/review
 *
 * Admin action: approve or reject a proof-of-payment attachment.
 */

import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentAttachmentStatus } from '@prisma/client';

const REVIEW_STATUSES = [
  PaymentAttachmentStatus.APPROVED,
  PaymentAttachmentStatus.REJECTED,
] as const;

type ReviewableStatus = (typeof REVIEW_STATUSES)[number];

export class ReviewAttachmentDto {
  @ApiProperty({
    description: 'Review decision',
    enum: REVIEW_STATUSES,
  })
  @IsEnum(REVIEW_STATUSES, {
    message: 'status must be APPROVED or REJECTED',
  })
  status: ReviewableStatus;

  @ApiPropertyOptional({
    description: 'Optional review note visible to admin (max 500 chars)',
    example: 'Amount matches outstanding balance.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
