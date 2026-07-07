/**
 * Message Template DTOs
 * TASK-TMPL-001: Tenant-Editable Message Templates
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MessageTemplateChannel,
  MessageTemplateKey,
} from '@prisma/client';

export { MessageTemplateChannel, MessageTemplateKey };

/**
 * Response shape returned by the templates API.
 *
 * `id` is present when the row is a saved tenant override; it is `null` when
 * the resolver has fallen back to the coded default (`isDefault: true`,
 * `isCustom: false`). This lets the frontend show "default" vs "customized"
 * without a second round trip.
 */
export class MessageTemplateResponseDto {
  @ApiProperty({ description: 'DB row id when persisted; null for coded defaults', nullable: true })
  id!: string | null;

  @ApiProperty({ description: 'Tenant that owns the template' })
  tenantId!: string;

  @ApiProperty({ enum: MessageTemplateKey })
  key!: MessageTemplateKey;

  @ApiProperty({ enum: MessageTemplateChannel })
  channel!: MessageTemplateChannel;

  @ApiProperty({ nullable: true, description: 'Email subject; null for WhatsApp/SMS' })
  subject!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty({ description: 'True when this row is the coded default (not saved by the tenant)' })
  isDefault!: boolean;

  @ApiProperty({ description: 'Human-readable name shown in the settings UI' })
  label!: string;

  @ApiProperty({ description: 'Placeholder tokens the template supports', type: [String] })
  placeholders!: string[];

  @ApiProperty({ nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ nullable: true })
  updatedAt!: Date | null;
}

/**
 * PUT body — upsert a tenant's override for (key, channel).
 * `subject` is required for EMAIL, must be omitted for WhatsApp/SMS.
 */
export class UpsertMessageTemplateDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string | null;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  body!: string;
}

/**
 * Query params for the list endpoint.
 */
export class ListMessageTemplatesQueryDto {
  @ApiPropertyOptional({ enum: MessageTemplateChannel })
  @IsOptional()
  @IsEnum(MessageTemplateChannel)
  channel?: MessageTemplateChannel;
}
