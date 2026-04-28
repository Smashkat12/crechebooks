/**
 * DTOs for the admin WhatsApp inbox endpoints.
 * Item #12 — Step 3.
 */

import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Shared pagination query
// ---------------------------------------------------------------------------

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

// ---------------------------------------------------------------------------
// GET /threads query
// ---------------------------------------------------------------------------

export class ListThreadsQueryDto extends PaginationQueryDto {}

// ---------------------------------------------------------------------------
// GET /threads/:parentId query
// ---------------------------------------------------------------------------

export class GetThreadQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'asc',
    description: 'Sort order — asc = oldest first, desc = newest first',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';
}

// ---------------------------------------------------------------------------
// POST /threads/:parentId/reply body
// ---------------------------------------------------------------------------

export class ReplyToThreadDto {
  @ApiProperty({ description: 'Text body of the reply' })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'ID of the inbound message being quoted',
  })
  @IsOptional()
  @IsUUID()
  replyToMessageId?: string;
}

// ---------------------------------------------------------------------------
// POST /threads/:parentId/send-template body
// ---------------------------------------------------------------------------

export class SendTemplateDto {
  @ApiProperty({ description: 'Twilio Content SID (HXXXXXXXXXXX)' })
  @IsString()
  contentSid: string;

  @ApiPropertyOptional({
    description: 'Template variable substitutions',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  templateParams?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// POST /messages/:id/link-parent body
// ---------------------------------------------------------------------------

export class LinkParentDto {
  @ApiProperty({ description: 'UUID of the parent to assign' })
  @IsUUID()
  parentId: string;
}

// ---------------------------------------------------------------------------
// GET /unknown query
// ---------------------------------------------------------------------------

export class ListUnknownQueryDto extends PaginationQueryDto {}
