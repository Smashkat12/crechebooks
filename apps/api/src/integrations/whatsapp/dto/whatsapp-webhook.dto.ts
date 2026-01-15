/**
 * WhatsApp Webhook DTOs with Validation
 * TASK-INT-006: Input Validation Before DB Query
 *
 * DTOs for validating incoming WhatsApp Cloud API webhook payloads.
 * Implements strict validation to prevent injection attacks.
 */

import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
  IsNotEmpty,
  Matches,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsPhoneNumber } from '../validators/phone-number.validator';

/**
 * WhatsApp message types supported by the Cloud API
 */
export enum WhatsAppMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  VIDEO = 'video',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACTS = 'contacts',
  INTERACTIVE = 'interactive',
  BUTTON = 'button',
  REACTION = 'reaction',
  ORDER = 'order',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

/**
 * WhatsApp message status values
 */
export enum WhatsAppMessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

/**
 * Profile information for a WhatsApp contact
 */
export class WhatsAppProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(256)
  name?: string;
}

/**
 * Contact information from incoming webhook
 */
export class WhatsAppContactDto {
  @IsPhoneNumber({
    message: 'wa_id must be a valid phone number in E.164 or WhatsApp format',
  })
  wa_id: string;

  @ValidateNested()
  @Type(() => WhatsAppProfileDto)
  @IsOptional()
  profile?: WhatsAppProfileDto;
}

/**
 * Text message content
 */
export class WhatsAppTextMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096, {
    message: 'Text body cannot exceed 4096 characters',
  })
  body: string;
}

/**
 * Image message content
 */
export class WhatsAppImageDto {
  @IsString()
  @IsOptional()
  @MaxLength(1024)
  caption?: string;

  @IsString()
  @IsOptional()
  mime_type?: string;

  @IsString()
  @IsOptional()
  sha256?: string;

  @IsString()
  @IsOptional()
  id?: string;
}

/**
 * Document message content
 */
export class WhatsAppDocumentDto {
  @IsString()
  @IsOptional()
  @MaxLength(1024)
  caption?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  filename?: string;

  @IsString()
  @IsOptional()
  mime_type?: string;

  @IsString()
  @IsOptional()
  sha256?: string;

  @IsString()
  @IsOptional()
  id?: string;
}

/**
 * Location message content
 */
export class WhatsAppLocationDto {
  @IsOptional()
  latitude?: number;

  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  address?: string;
}

/**
 * Reaction message content
 */
export class WhatsAppReactionDto {
  @IsString()
  @IsNotEmpty()
  message_id: string;

  @IsString()
  @MaxLength(10)
  emoji: string;
}

/**
 * Interactive message reply content
 */
export class WhatsAppInteractiveDto {
  @IsOptional()
  type?: string;

  @IsOptional()
  button_reply?: {
    id: string;
    title: string;
  };

  @IsOptional()
  list_reply?: {
    id: string;
    title: string;
    description?: string;
  };
}

/**
 * Button reply content
 */
export class WhatsAppButtonDto {
  @IsString()
  @IsOptional()
  payload?: string;

  @IsString()
  @IsOptional()
  text?: string;
}

/**
 * Individual message in webhook payload
 */
export class WhatsAppMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @IsPhoneNumber({
    message: 'from must be a valid phone number in E.164 or WhatsApp format',
  })
  from: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,13}$/, {
    message: 'timestamp must be a valid Unix timestamp string',
  })
  timestamp: string;

  @IsEnum(WhatsAppMessageType, {
    message: `type must be one of: ${Object.values(WhatsAppMessageType).join(', ')}`,
  })
  type: WhatsAppMessageType;

  @ValidateNested()
  @Type(() => WhatsAppTextMessageDto)
  @IsOptional()
  text?: WhatsAppTextMessageDto;

  @ValidateNested()
  @Type(() => WhatsAppImageDto)
  @IsOptional()
  image?: WhatsAppImageDto;

  @ValidateNested()
  @Type(() => WhatsAppDocumentDto)
  @IsOptional()
  document?: WhatsAppDocumentDto;

  @ValidateNested()
  @Type(() => WhatsAppLocationDto)
  @IsOptional()
  location?: WhatsAppLocationDto;

  @ValidateNested()
  @Type(() => WhatsAppReactionDto)
  @IsOptional()
  reaction?: WhatsAppReactionDto;

  @ValidateNested()
  @Type(() => WhatsAppInteractiveDto)
  @IsOptional()
  interactive?: WhatsAppInteractiveDto;

  @ValidateNested()
  @Type(() => WhatsAppButtonDto)
  @IsOptional()
  button?: WhatsAppButtonDto;

  @IsOptional()
  context?: {
    from?: string;
    id?: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
  };

  @IsOptional()
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

/**
 * Error information in status updates
 */
export class WhatsAppStatusErrorDto {
  @IsOptional()
  code?: number;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1024)
  message?: string;

  @IsOptional()
  error_data?: {
    details: string;
  };
}

/**
 * Message delivery status
 */
export class WhatsAppStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  id: string;

  @IsEnum(WhatsAppMessageStatus, {
    message: `status must be one of: ${Object.values(WhatsAppMessageStatus).join(', ')}`,
  })
  status: WhatsAppMessageStatus;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,13}$/, {
    message: 'timestamp must be a valid Unix timestamp string',
  })
  timestamp: string;

  @IsPhoneNumber({
    message:
      'recipient_id must be a valid phone number in E.164 or WhatsApp format',
  })
  recipient_id: string;

  @ValidateNested({ each: true })
  @Type(() => WhatsAppStatusErrorDto)
  @IsOptional()
  @IsArray()
  errors?: WhatsAppStatusErrorDto[];

  @IsOptional()
  conversation?: {
    id: string;
    origin?: {
      type: string;
    };
    expiration_timestamp?: string;
  };

  @IsOptional()
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}

/**
 * Metadata about the receiving WhatsApp Business Account
 */
export class WhatsAppMetadataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  display_phone_number: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  phone_number_id: string;
}

/**
 * Value object containing the webhook data
 */
export class WhatsAppValueDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^whatsapp$/, {
    message: 'messaging_product must be "whatsapp"',
  })
  messaging_product: 'whatsapp';

  @ValidateNested()
  @Type(() => WhatsAppMetadataDto)
  metadata: WhatsAppMetadataDto;

  @ValidateNested({ each: true })
  @Type(() => WhatsAppContactDto)
  @IsOptional()
  @IsArray()
  contacts?: WhatsAppContactDto[];

  @ValidateNested({ each: true })
  @Type(() => WhatsAppMessageDto)
  @IsOptional()
  @IsArray()
  messages?: WhatsAppMessageDto[];

  @ValidateNested({ each: true })
  @Type(() => WhatsAppStatusDto)
  @IsOptional()
  @IsArray()
  statuses?: WhatsAppStatusDto[];
}

/**
 * Change object within an entry
 */
export class WhatsAppChangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  field: string;

  @ValidateNested()
  @Type(() => WhatsAppValueDto)
  value: WhatsAppValueDto;
}

/**
 * Entry object containing changes
 */
export class WhatsAppEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id: string;

  @ValidateNested({ each: true })
  @Type(() => WhatsAppChangeDto)
  @IsArray()
  @ArrayMinSize(1, {
    message: 'changes array must contain at least one change',
  })
  changes: WhatsAppChangeDto[];
}

/**
 * Root webhook payload DTO
 *
 * @example
 * const payload = plainToInstance(WhatsAppWebhookDto, webhookBody);
 * const errors = await validate(payload);
 */
export class WhatsAppWebhookDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^whatsapp_business_account$/, {
    message: 'object must be "whatsapp_business_account"',
  })
  object: 'whatsapp_business_account';

  @ValidateNested({ each: true })
  @Type(() => WhatsAppEntryDto)
  @IsArray()
  @ArrayMinSize(1, {
    message: 'entry array must contain at least one entry',
  })
  entry: WhatsAppEntryDto[];
}

/**
 * Webhook verification challenge DTO (GET request)
 */
export class WhatsAppWebhookVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^subscribe$/, {
    message: 'hub.mode must be "subscribe"',
  })
  'hub.mode': 'subscribe';

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  'hub.verify_token': string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  'hub.challenge': string;
}
