/**
 * Webhook Module
 * TASK-BILL-035: Delivery Status Webhook Handlers
 * TASK-SEC-006: Webhook Signature Verification Guard
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 *
 * @description NestJS module for webhook handling.
 * Registers webhook controller, service, signature guard, and idempotency guard.
 *
 * SECURITY: All webhook endpoints MUST verify signatures.
 * The WebhookSignatureGuard ensures fail-fast behavior if secrets are not configured.
 *
 * RELIABILITY: Webhook endpoints use idempotency to prevent duplicate processing.
 * The IdempotencyGuard checks Redis for duplicate request keys.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { IdempotencyService } from '../common/services/idempotency.service';
import { IdempotencyGuard } from '../common/guards/idempotency.guard';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { YocoModule } from '../integrations/yoco/yoco.module';

@Module({
  imports: [ConfigModule, WhatsAppModule, YocoModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WebhookSignatureGuard,
    PrismaService,
    AuditLogService,
    IdempotencyService,
    IdempotencyGuard,
  ],
  exports: [
    WebhookService,
    WebhookSignatureGuard,
    IdempotencyService,
    IdempotencyGuard,
  ],
})
export class WebhookModule {}
