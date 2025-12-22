/**
 * Invoice Delivery Service DTOs
 * TASK-BILL-013: Invoice Delivery Service
 *
 * @module database/dto/invoice-delivery
 * @description DTOs for invoice delivery operations.
 */

import {
  IsUUID,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { DeliveryMethod, DeliveryStatus } from '../entities/invoice.entity';

/**
 * DTO for sending invoices
 */
export class SendInvoicesDto {
  @IsUUID()
  tenantId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  invoiceIds!: string[];

  @IsOptional()
  @IsEnum(DeliveryMethod)
  method?: DeliveryMethod;
}

/**
 * DTO for retrying failed deliveries
 */
export class RetryFailedDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAgeHours?: number;
}

/**
 * Result of sending invoices
 */
export interface DeliveryResult {
  sent: number;
  failed: number;
  failures: DeliveryFailure[];
}

/**
 * Individual delivery failure
 */
export interface DeliveryFailure {
  invoiceId: string;
  reason: string;
  channel?: 'EMAIL' | 'WHATSAPP';
  code: string;
}

/**
 * Individual delivery attempt record
 */
export interface DeliveryAttempt {
  invoiceId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  status: DeliveryStatus;
  attemptedAt: Date;
  error?: string;
}
