/**
 * Send Invoices DTOs
 * TASK-BILL-033: Invoice Delivery Endpoint
 *
 * @module api/billing/dto/send-invoices
 * @description API-layer DTOs for sending invoices to parents.
 * Uses snake_case for API, converts to camelCase for service layer.
 *
 * CRITICAL: NO MOCK DATA - fail fast with detailed error logging.
 */

import {
  IsArray,
  IsOptional,
  IsEnum,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod } from '../../../database/entities/invoice.entity';

/**
 * API-layer DTO for sending invoices (snake_case)
 */
export class ApiSendInvoicesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ApiProperty({
    type: [String],
    description: 'Invoice UUIDs to send',
    example: ['uuid-1', 'uuid-2'],
  })
  invoice_ids!: string[];

  @IsOptional()
  @IsEnum(DeliveryMethod)
  @ApiProperty({
    enum: DeliveryMethod,
    required: false,
    description: 'Override delivery method. Defaults to parent preference.',
    example: DeliveryMethod.EMAIL,
  })
  delivery_method?: DeliveryMethod;
}

/**
 * Individual delivery failure response
 */
export class DeliveryFailureResponseDto {
  @ApiProperty({ description: 'Invoice UUID that failed' })
  invoice_id!: string;

  @ApiProperty({ description: 'Invoice number', required: false })
  invoice_number?: string;

  @ApiProperty({ description: 'Failure reason' })
  reason!: string;

  @ApiProperty({ description: 'Error code for programmatic handling' })
  code!: string;
}

/**
 * Response DTO for send invoices endpoint
 */
export class SendInvoicesResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success!: boolean;

  @ApiProperty({
    description: 'Delivery results summary',
    type: 'object',
    properties: {
      sent: { type: 'number', description: 'Number of invoices sent' },
      failed: { type: 'number', description: 'Number of failed deliveries' },
      failures: {
        type: 'array',
        items: { $ref: '#/components/schemas/DeliveryFailureResponseDto' },
        description: 'Details of failed deliveries',
      },
    },
  })
  data!: {
    sent: number;
    failed: number;
    failures: DeliveryFailureResponseDto[];
  };
}
