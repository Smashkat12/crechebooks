/**
 * Ad-hoc Charge Request DTOs (API Layer)
 * REQ-BILL-009/011/012: Manual charges on invoices
 *
 * @module api/billing/dto/adhoc-charge-request
 * @description API request DTOs for ad-hoc charges (snake_case for frontend convention)
 */

import {
  IsString,
  IsInt,
  IsOptional,
  IsPositive,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * API request DTO for adding an ad-hoc charge to an invoice
 * Uses snake_case for frontend convention
 */
export class AddAdhocChargeRequestDto {
  /**
   * Description of the ad-hoc charge
   * @example "Late pickup fee - December 15th"
   */
  @ApiProperty({
    description: 'Description of the ad-hoc charge',
    example: 'Late pickup fee - December 15th',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @MinLength(1, { message: 'Description must be at least 1 character' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description!: string;

  /**
   * Amount in cents (positive integer)
   * @example 5000 (R50.00)
   */
  @ApiProperty({
    description: 'Amount in cents (must be positive)',
    example: 5000,
    type: 'integer',
  })
  @IsInt({ message: 'amount_cents must be an integer' })
  @IsPositive({ message: 'amount_cents must be positive' })
  amount_cents!: number;

  /**
   * Quantity (default 1)
   * @example 2
   */
  @ApiProperty({
    description: 'Quantity (default 1)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'quantity must be an integer' })
  @IsPositive({ message: 'quantity must be positive' })
  quantity?: number;

  /**
   * Optional Xero account code for mapping
   * @example "4100"
   */
  @ApiProperty({
    description: 'Optional Xero account code',
    example: '4100',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  account_code?: string;
}
