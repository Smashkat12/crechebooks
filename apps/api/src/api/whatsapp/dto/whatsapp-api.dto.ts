/**
 * WhatsApp API DTOs
 * TASK-WA-004: WhatsApp Opt-In UI Components
 *
 * Request/Response DTOs for WhatsApp API endpoints.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
} from 'class-validator';

/**
 * Message status enum - matches backend types
 */
export enum WhatsAppMessageStatusDto {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

/**
 * Context type enum - what the message relates to
 */
export enum WhatsAppContextTypeDto {
  INVOICE = 'INVOICE',
  REMINDER = 'REMINDER',
  STATEMENT = 'STATEMENT',
  WELCOME = 'WELCOME',
  ARREARS = 'ARREARS',
}

/**
 * Request DTO for opting a parent into WhatsApp notifications
 */
export class WhatsAppOptInDto {
  @ApiProperty({
    description: 'Parent UUID to opt-in',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  parentId!: string;
}

/**
 * Request DTO for opting a parent out of WhatsApp notifications
 */
export class WhatsAppOptOutDto {
  @ApiProperty({
    description: 'Parent UUID to opt-out',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  parentId!: string;
}

/**
 * Response DTO for a WhatsApp message
 */
export class WhatsAppMessageDto {
  @ApiProperty({
    description: 'Message UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Message status',
    enum: WhatsAppMessageStatusDto,
    example: WhatsAppMessageStatusDto.DELIVERED,
  })
  status!: WhatsAppMessageStatusDto;

  @ApiProperty({
    description: 'Message context type',
    enum: WhatsAppContextTypeDto,
    example: WhatsAppContextTypeDto.INVOICE,
  })
  contextType!: WhatsAppContextTypeDto;

  @ApiPropertyOptional({
    description: 'Context ID (e.g., invoice ID)',
    example: 'inv-123',
  })
  contextId?: string;

  @ApiProperty({
    description: 'Template name used',
    example: 'invoice_notification',
  })
  templateName!: string;

  @ApiProperty({
    description: 'Recipient phone number (E.164 format)',
    example: '+27821234567',
  })
  recipientPhone!: string;

  @ApiProperty({
    description: 'Message creation timestamp',
    example: '2025-12-22T10:00:00Z',
  })
  createdAt!: string;

  @ApiPropertyOptional({
    description: 'Sent timestamp',
    example: '2025-12-22T10:00:01Z',
  })
  sentAt?: string;

  @ApiPropertyOptional({
    description: 'Delivered timestamp',
    example: '2025-12-22T10:00:02Z',
  })
  deliveredAt?: string;

  @ApiPropertyOptional({
    description: 'Read timestamp',
    example: '2025-12-22T10:05:00Z',
  })
  readAt?: string;

  @ApiPropertyOptional({
    description: 'Error code if failed',
    example: '131047',
  })
  errorCode?: string;

  @ApiPropertyOptional({
    description: 'Error message if failed',
    example: 'Template not found',
  })
  errorMessage?: string;
}

/**
 * Response DTO for WhatsApp opt-in status
 */
export class WhatsAppStatusDto {
  @ApiProperty({
    description: 'Whether parent has opted in to WhatsApp notifications',
    example: true,
  })
  optedIn!: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when parent opted in (POPIA compliance)',
    example: '2025-12-22T10:00:00Z',
  })
  optedInAt?: string;

  @ApiPropertyOptional({
    description: 'Phone number that will receive WhatsApp messages',
    example: '+27821234567',
  })
  whatsappPhone?: string;
}

/**
 * Query DTO for message history with pagination
 */
export class WhatsAppHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of messages to return',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: WhatsAppMessageStatusDto,
    example: WhatsAppMessageStatusDto.SENT,
  })
  @IsOptional()
  @IsEnum(WhatsAppMessageStatusDto)
  status?: WhatsAppMessageStatusDto;
}

/**
 * Success response wrapper
 */
export class WhatsAppSuccessResponseDto {
  @ApiProperty({
    description: 'Whether the operation was successful',
    example: true,
  })
  success!: boolean;
}

/**
 * Response for message history list
 */
export class WhatsAppHistoryResponseDto {
  @ApiProperty({
    description: 'Whether the operation was successful',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'List of WhatsApp messages',
    type: [WhatsAppMessageDto],
  })
  messages!: WhatsAppMessageDto[];

  @ApiProperty({
    description: 'Total count of messages',
    example: 25,
  })
  total!: number;
}
