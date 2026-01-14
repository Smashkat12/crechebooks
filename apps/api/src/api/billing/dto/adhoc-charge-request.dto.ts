/**
 * Ad-hoc Charge Request DTOs (API Layer)
 * REQ-BILL-009/011/012: Manual charges on invoices
 * TASK-BILL-038: SA VAT Compliance Enhancement
 *
 * @module api/billing/dto/adhoc-charge-request
 * @description API request DTOs for ad-hoc charges (snake_case for frontend convention)
 */

import {
  IsString,
  IsInt,
  IsOptional,
  IsPositive,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * TASK-BILL-038: Ad-Hoc Charge types for VAT categorization
 */
export enum AdHocChargeType {
  MEALS = 'MEALS',
  TRANSPORT = 'TRANSPORT',
  LATE_PICKUP = 'LATE_PICKUP',
  EXTRA_MURAL = 'EXTRA_MURAL',
  DAMAGED_EQUIPMENT = 'DAMAGED_EQUIPMENT',
  OTHER = 'OTHER',
}

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
  @ApiPropertyOptional({
    description: 'Quantity (default 1)',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'quantity must be an integer' })
  @IsPositive({ message: 'quantity must be positive' })
  quantity?: number;

  /**
   * Optional Xero account code for mapping
   * @example "4100"
   */
  @ApiPropertyOptional({
    description: 'Optional Xero account code',
    example: '4100',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  account_code?: string;

  /**
   * TASK-BILL-038: Charge type for VAT categorization
   * Determines default VAT treatment based on SA VAT Act Section 12(h)
   * @example "LATE_PICKUP"
   * @default "OTHER"
   */
  @ApiPropertyOptional({
    description: 'Charge type for VAT categorization',
    enum: AdHocChargeType,
    example: 'LATE_PICKUP',
    default: 'OTHER',
  })
  @IsOptional()
  @IsEnum(AdHocChargeType, { message: 'charge_type must be a valid AdHocChargeType' })
  charge_type?: AdHocChargeType;

  /**
   * TASK-BILL-038: Override VAT exemption for this charge
   * When true, charge is VAT exempt (e.g., educational extra-mural activities)
   * When false or undefined, default VAT rules apply based on charge_type
   * @example true
   * @default false
   */
  @ApiPropertyOptional({
    description: 'Override VAT exemption (true = VAT exempt)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'is_vat_exempt must be a boolean' })
  is_vat_exempt?: boolean;
}
