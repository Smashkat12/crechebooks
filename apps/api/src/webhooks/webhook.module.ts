/**
 * Webhook Module
 * TASK-BILL-035: Delivery Status Webhook Handlers
 *
 * @description NestJS module for webhook handling.
 * Registers webhook controller and service.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';

@Module({
  imports: [ConfigModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    PrismaService,
    AuditLogService,
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
