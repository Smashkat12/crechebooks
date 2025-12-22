/**
 * Generate Invoices DTOs
 * TASK-BILL-032: Invoice Generation Endpoint
 *
 * @module api/billing/dto/generate-invoices
 * @description Request and response DTOs for invoice generation endpoint.
 * Monetary values in responses are in Rands (decimal), not cents.
 */

import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';

/**
 * Request DTO for generating monthly invoices
 */
export class GenerateInvoicesDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'billing_month must be in YYYY-MM format (e.g., 2025-01)',
  })
  @ApiProperty({
    example: '2025-01',
    description: 'Billing month in YYYY-MM format',
  })
  billing_month!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ApiProperty({
    type: [String],
    required: false,
    description:
      'Specific child UUIDs. If empty, generates for all active enrollments.',
  })
  child_ids?: string[];
}

/**
 * Summary of a generated invoice
 */
export class GeneratedInvoiceSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  invoice_number!: string;

  @ApiProperty()
  child_id!: string;

  @ApiProperty()
  child_name!: string;

  @ApiProperty({ description: 'Total amount in Rands' })
  total!: number;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;

  @ApiProperty({ required: false })
  xero_invoice_id?: string;
}

/**
 * Error during invoice generation
 */
export class GenerationErrorDto {
  @ApiProperty()
  child_id!: string;

  @ApiProperty({ required: false })
  enrollment_id?: string;

  @ApiProperty()
  error!: string;

  @ApiProperty()
  code!: string;
}

/**
 * Response DTO for invoice generation
 */
export class GenerateInvoicesResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({
    type: 'object',
    properties: {
      invoices_created: { type: 'number' },
      total_amount: { type: 'number', description: 'Total amount in Rands' },
      invoices: {
        type: 'array',
        items: { $ref: '#/components/schemas/GeneratedInvoiceSummaryDto' },
      },
      errors: {
        type: 'array',
        items: { $ref: '#/components/schemas/GenerationErrorDto' },
      },
    },
  })
  data!: {
    invoices_created: number;
    total_amount: number;
    invoices: GeneratedInvoiceSummaryDto[];
    errors: GenerationErrorDto[];
  };
}
