/**
 * TASK-QUOTE-002: Quote Public Acceptance Portal
 * DTOs for public quote actions (accept/decline)
 *
 * @module api/public/quotes/dto
 */

import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for accepting a quote via public link
 */
export class AcceptQuoteDto {
  @ApiProperty({ description: 'Name of person accepting the quote' })
  @IsString()
  @MaxLength(200)
  confirmedBy: string;

  @ApiPropertyOptional({ description: 'Email for confirmation receipt' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

/**
 * DTO for declining a quote via public link
 */
export class DeclineQuoteDto {
  @ApiPropertyOptional({ description: 'Reason for declining', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Public-facing quote response (excludes sensitive tenant/internal data)
 */
export interface PublicQuoteResponse {
  quoteNumber: string;
  recipientName: string;
  childName: string | null;
  expectedStartDate: Date | null;
  quoteDate: Date;
  expiryDate: Date;
  validityDays: number;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  status: string;
  isExpired: boolean;
  canAccept: boolean;
  canDecline: boolean;
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  tenant: {
    name: string;
    phone: string | null;
    email: string;
  };
}

/**
 * Response for successful quote acceptance
 */
export interface AcceptQuoteResponse {
  success: boolean;
  message: string;
  nextStep: string;
}

/**
 * Response for successful quote decline
 */
export interface DeclineQuoteResponse {
  success: boolean;
  message: string;
}
