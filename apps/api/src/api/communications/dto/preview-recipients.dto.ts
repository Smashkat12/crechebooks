/**
 * Preview Recipients DTOs
 * TASK-COMM-003: Communication API Controller
 *
 * DTOs for previewing recipients before sending a broadcast.
 */

import {
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RecipientType,
  CommunicationChannel,
} from '../../../communications/types/communication.types';
import { RecipientFilterDto } from './send-broadcast.dto';

/**
 * DTO for previewing recipients based on filter criteria
 */
export class PreviewRecipientsDto {
  @ApiProperty({
    description: 'Type of recipient to target',
    enum: RecipientType,
    example: RecipientType.PARENT,
  })
  @IsEnum(RecipientType)
  recipient_type: RecipientType;

  @ApiPropertyOptional({
    description: 'Filter criteria for recipient selection',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientFilterDto)
  filter?: RecipientFilterDto;

  @ApiPropertyOptional({
    description: 'Communication channel (affects opt-in filtering)',
    enum: CommunicationChannel,
  })
  @IsOptional()
  @IsEnum(CommunicationChannel)
  channel?: CommunicationChannel;
}

/**
 * A single recipient in the preview
 */
export class RecipientPreviewItemDto {
  @ApiProperty({ description: 'Recipient unique identifier' })
  id: string;

  @ApiProperty({ description: 'Recipient display name' })
  name: string;

  @ApiPropertyOptional({ description: 'Email address (if available)' })
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number (if available)' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Preferred contact method' })
  preferred_contact?: string;
}

/**
 * Response DTO for recipient preview
 */
export class RecipientPreviewResponseDto {
  @ApiProperty({ description: 'Total number of matching recipients' })
  total: number;

  @ApiProperty({
    description: 'Preview of matching recipients (first 20)',
    type: [RecipientPreviewItemDto],
  })
  recipients: RecipientPreviewItemDto[];

  @ApiProperty({ description: 'Whether there are more recipients than shown' })
  has_more: boolean;
}
