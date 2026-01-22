/**
 * Broadcast Response DTOs
 * TASK-COMM-003: Communication API Controller
 *
 * Response DTOs for broadcast message operations.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BroadcastMessage } from '@prisma/client';
import {
  RecipientType,
  CommunicationChannel,
  BroadcastStatus,
  DeliveryStats,
} from '../../../communications/types/communication.types';

/**
 * Delivery statistics in response format
 */
export class DeliveryStatsDto {
  @ApiProperty({ description: 'Total number of recipients' })
  total: number;

  @ApiProperty({ description: 'Number of email messages sent' })
  email_sent: number;

  @ApiProperty({ description: 'Number of email messages delivered' })
  email_delivered: number;

  @ApiProperty({ description: 'Number of email messages opened' })
  email_opened: number;

  @ApiProperty({ description: 'Number of email messages failed' })
  email_failed: number;

  @ApiProperty({ description: 'Number of WhatsApp messages sent' })
  whatsapp_sent: number;

  @ApiProperty({ description: 'Number of WhatsApp messages delivered' })
  whatsapp_delivered: number;

  @ApiProperty({ description: 'Number of WhatsApp messages read' })
  whatsapp_read: number;

  @ApiProperty({ description: 'Number of WhatsApp messages failed' })
  whatsapp_failed: number;

  @ApiProperty({ description: 'Number of SMS messages sent' })
  sms_sent: number;

  @ApiProperty({ description: 'Number of SMS messages delivered' })
  sms_delivered: number;

  @ApiProperty({ description: 'Number of SMS messages failed' })
  sms_failed: number;

  constructor(stats: DeliveryStats) {
    this.total = stats.total;
    this.email_sent = stats.emailSent;
    this.email_delivered = stats.emailDelivered;
    this.email_opened = stats.emailOpened;
    this.email_failed = stats.emailFailed;
    this.whatsapp_sent = stats.whatsappSent;
    this.whatsapp_delivered = stats.whatsappDelivered;
    this.whatsapp_read = stats.whatsappRead;
    this.whatsapp_failed = stats.whatsappFailed;
    this.sms_sent = stats.smsSent;
    this.sms_delivered = stats.smsDelivered;
    this.sms_failed = stats.smsFailed;
  }
}

/**
 * Base broadcast response DTO
 */
export class BroadcastResponseDto {
  @ApiProperty({ description: 'Unique broadcast identifier' })
  id: string;

  @ApiPropertyOptional({ description: 'Email subject line' })
  subject?: string;

  @ApiProperty({ description: 'Message body (plain text)' })
  body: string;

  @ApiProperty({
    description: 'Type of recipient',
    enum: RecipientType,
  })
  recipient_type: RecipientType;

  @ApiProperty({
    description: 'Communication channel',
    enum: CommunicationChannel,
  })
  channel: CommunicationChannel;

  @ApiProperty({
    description: 'Broadcast status',
    enum: BroadcastStatus,
  })
  status: BroadcastStatus;

  @ApiProperty({ description: 'Total number of recipients' })
  total_recipients: number;

  @ApiProperty({ description: 'Number of messages sent' })
  sent_count: number;

  @ApiProperty({ description: 'Number of messages failed' })
  failed_count: number;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at: Date;

  @ApiPropertyOptional({ description: 'Timestamp when sending completed' })
  sent_at?: Date;

  @ApiPropertyOptional({ description: 'Scheduled send timestamp' })
  scheduled_at?: Date;

  constructor(broadcast: BroadcastMessage) {
    this.id = broadcast.id;
    this.subject = broadcast.subject ?? undefined;
    this.body = broadcast.body;
    this.recipient_type = broadcast.recipientType as RecipientType;
    this.channel = broadcast.channel as CommunicationChannel;
    this.status = broadcast.status as BroadcastStatus;
    this.total_recipients = broadcast.totalRecipients;
    this.sent_count = broadcast.sentCount;
    this.failed_count = broadcast.failedCount;
    this.created_at = broadcast.createdAt;
    this.sent_at = broadcast.sentAt ?? undefined;
    this.scheduled_at = broadcast.scheduledAt ?? undefined;
  }
}

/**
 * Broadcast list item DTO (for listing broadcasts)
 */
export class BroadcastListItemDto {
  @ApiProperty({ description: 'Unique broadcast identifier' })
  id: string;

  @ApiPropertyOptional({ description: 'Email subject line' })
  subject?: string;

  @ApiProperty({
    description: 'Type of recipient',
    enum: RecipientType,
  })
  recipient_type: RecipientType;

  @ApiProperty({
    description: 'Communication channel',
    enum: CommunicationChannel,
  })
  channel: CommunicationChannel;

  @ApiProperty({
    description: 'Broadcast status',
    enum: BroadcastStatus,
  })
  status: BroadcastStatus;

  @ApiProperty({ description: 'Total number of recipients' })
  total_recipients: number;

  @ApiProperty({ description: 'Number of messages sent' })
  sent_count: number;

  @ApiProperty({ description: 'Number of messages failed' })
  failed_count: number;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at: Date;

  @ApiPropertyOptional({ description: 'Timestamp when sending completed' })
  sent_at?: Date;

  constructor(broadcast: BroadcastMessage) {
    this.id = broadcast.id;
    this.subject = broadcast.subject ?? undefined;
    this.recipient_type = broadcast.recipientType as RecipientType;
    this.channel = broadcast.channel as CommunicationChannel;
    this.status = broadcast.status as BroadcastStatus;
    this.total_recipients = broadcast.totalRecipients;
    this.sent_count = broadcast.sentCount;
    this.failed_count = broadcast.failedCount;
    this.created_at = broadcast.createdAt;
    this.sent_at = broadcast.sentAt ?? undefined;
  }
}

/**
 * Detailed broadcast response with delivery stats
 */
export class BroadcastDetailDto extends BroadcastResponseDto {
  @ApiPropertyOptional({ description: 'HTML version of message body' })
  html_body?: string;

  @ApiPropertyOptional({
    description: 'Detailed delivery statistics',
    type: DeliveryStatsDto,
  })
  delivery_stats?: DeliveryStatsDto;

  constructor(broadcast: BroadcastMessage, stats?: DeliveryStats) {
    super(broadcast);
    this.html_body = broadcast.htmlBody ?? undefined;
    if (stats) {
      this.delivery_stats = new DeliveryStatsDto(stats);
    }
  }
}

/**
 * Response wrapper for single broadcast operations
 */
export class BroadcastSingleResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean;

  @ApiProperty({ description: 'Broadcast data', type: BroadcastResponseDto })
  data: BroadcastResponseDto;

  constructor(success: boolean, broadcast: BroadcastMessage) {
    this.success = success;
    this.data = new BroadcastResponseDto(broadcast);
  }
}

/**
 * Response wrapper for broadcast list operations
 */
export class BroadcastListResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean;

  @ApiProperty({
    description: 'List of broadcasts',
    type: [BroadcastListItemDto],
  })
  data: BroadcastListItemDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: 'object',
    properties: {
      page: { type: 'number' },
      limit: { type: 'number' },
      total: { type: 'number' },
      total_pages: { type: 'number' },
      has_next: { type: 'boolean' },
      has_prev: { type: 'boolean' },
    },
  })
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

/**
 * Simple message response DTO
 */
export class MessageResponseDto {
  @ApiProperty({ description: 'Response message' })
  message: string;
}
