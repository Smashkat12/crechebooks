/**
 * LinkPaymentDto — request body for POST /payment-attachments/:id/link-payment
 *
 * Links an APPROVED attachment to a Payment record.
 * The service verifies the Payment belongs to the same tenant.
 */

import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LinkPaymentDto {
  @ApiProperty({
    description: 'Payment ID (UUID) to link this attachment to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  paymentId: string;
}
