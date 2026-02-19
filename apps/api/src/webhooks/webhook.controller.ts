/**
 * Webhook Controller
 * TASK-BILL-035: Delivery Status Webhook Handlers
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 *
 * @description REST endpoints for email and WhatsApp delivery webhooks.
 * Verifies signatures before processing events.
 * Uses idempotency checking to prevent duplicate processing of retried webhooks.
 *
 * CRITICAL: Verify webhook signatures before processing.
 * CRITICAL: Return 200 quickly to prevent webhook retries.
 * CRITICAL: Check for duplicates to ensure idempotent processing.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';
import { Public } from '../api/auth/decorators/public.decorator';
import type {
  EmailEvent,
  WhatsAppWebhookPayload,
  MailgunWebhookEvent,
} from './types/webhook.types';
import type { WebhookProcessingResult } from './types/webhook.types';
import { BusinessException } from '../shared/exceptions';
import {
  Idempotent,
  IdempotentRequest,
} from '../common/decorators/idempotent.decorator';
import { IdempotencyGuard } from '../common/guards/idempotency.guard';
import { IdempotencyService } from '../common/services/idempotency.service';
import { OnboardingConversationHandler } from '../integrations/whatsapp/handlers/onboarding-conversation.handler';
import { ParentMenuHandler } from '../integrations/whatsapp/handlers/parent-menu.handler';
import { PrismaService } from '../database/prisma/prisma.service';

/**
 * Public webhook endpoints (no auth required, signature verified)
 */
@Controller('webhooks')
@ApiTags('Webhooks')
@Public()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly idempotencyService: IdempotencyService,
    private readonly onboardingHandler: OnboardingConversationHandler,
    private readonly parentMenuHandler: ParentMenuHandler,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Handle SendGrid email delivery webhooks
   * Events: delivered, open, click, bounce, spam_report, dropped
   *
   * IDEMPOTENCY: Uses sg_message_id + event type as idempotency key.
   * SendGrid may retry webhooks for up to 72 hours, so TTL is set accordingly.
   *
   * @param req - Raw request for signature verification and idempotency
   * @param body - Parsed webhook payload
   * @param signature - SendGrid signature header
   * @param timestamp - SendGrid timestamp header
   */
  @Post('email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyGuard)
  @Idempotent({
    keyExtractor: (req) => {
      // Extract unique key from first event in batch
      // Format: sendgrid:{sg_message_id}:{event}:{timestamp}
      const events = req.body as EmailEvent[];
      if (!events || events.length === 0) return null;
      const firstEvent = events[0];
      if (!firstEvent.sg_message_id) return null;
      return IdempotencyService.generateKey(
        'sendgrid',
        firstEvent.sg_message_id,
        `${firstEvent.event}:${firstEvent.timestamp}`,
      );
    },
    ttl: 259200, // 72 hours for SendGrid retry window
    keyPrefix: 'webhook:',
    cacheResult: true,
  })
  @ApiOperation({ summary: 'Handle SendGrid email delivery webhooks' })
  @ApiHeader({ name: 'x-twilio-email-event-webhook-signature', required: true })
  @ApiHeader({ name: 'x-twilio-email-event-webhook-timestamp', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleEmailWebhook(
    @Req() req: RawBodyRequest<Request> & IdempotentRequest,
    @Body() body: EmailEvent[],
    @Headers('x-twilio-email-event-webhook-signature') signature: string,
    @Headers('x-twilio-email-event-webhook-timestamp') timestamp: string,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug(`Received email webhook with ${body.length} events`);

    // Check for duplicate request (already processed)
    if (req.isDuplicate) {
      this.logger.log(
        `Duplicate email webhook detected: ${req.idempotencyKey}`,
      );
      // Return cached result or default duplicate response
      if (req.idempotencyResult) {
        return req.idempotencyResult as WebhookProcessingResult;
      }
      return {
        processed: 0,
        skipped: body.length,
        errors: [],
      };
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody?.toString() || JSON.stringify(body);

    // Verify signature
    if (
      !this.webhookService.verifyEmailSignature(rawBody, signature, timestamp)
    ) {
      this.logger.warn('Invalid email webhook signature');
      throw new BusinessException(
        'Invalid webhook signature',
        'INVALID_SIGNATURE',
      );
    }

    // Process events
    const result = await this.webhookService.processEmailEvent(body);

    // Store result for future duplicate requests
    if (req.idempotencyKey) {
      await this.idempotencyService.markProcessed(
        req.idempotencyKey,
        result,
        259200, // 72 hours
        { provider: 'sendgrid', eventsCount: body.length },
      );
    }

    this.logger.log(
      `Email webhook processed: ${result.processed} processed, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Handle Mailgun email delivery webhooks
   * Events: accepted, delivered, failed, opened, clicked, unsubscribed, complained
   *
   * IDEMPOTENCY: Uses event ID + event type as idempotency key.
   * Mailgun may retry webhooks for up to 8 hours.
   *
   * @param req - Raw request for signature verification and idempotency
   * @param body - Parsed webhook payload (includes signature in body)
   */
  @Post('mailgun')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyGuard)
  @Idempotent({
    keyExtractor: (req) => {
      // Extract unique key from Mailgun event
      // Format: mailgun:{event_id}:{event_type}:{timestamp}
      const payload = req.body as MailgunWebhookEvent;
      const eventData = payload?.['event-data'];
      if (!eventData?.id) return null;
      return IdempotencyService.generateKey(
        'mailgun',
        eventData.id,
        `${eventData.event}:${eventData.timestamp}`,
      );
    },
    ttl: 28800, // 8 hours for Mailgun retry window
    keyPrefix: 'webhook:',
    cacheResult: true,
  })
  @ApiOperation({ summary: 'Handle Mailgun email delivery webhooks' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleMailgunWebhook(
    @Req() req: RawBodyRequest<Request> & IdempotentRequest,
    @Body() body: MailgunWebhookEvent,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug(
      `Received Mailgun webhook: ${body?.['event-data']?.event}`,
    );

    // Check for duplicate request (already processed)
    if (req.isDuplicate) {
      this.logger.log(
        `Duplicate Mailgun webhook detected: ${req.idempotencyKey}`,
      );
      // Return cached result or default duplicate response
      if (req.idempotencyResult) {
        return req.idempotencyResult as WebhookProcessingResult;
      }
      return {
        processed: 0,
        skipped: 1,
        errors: [],
      };
    }

    // Verify signature (Mailgun includes signature in body)
    if (!this.webhookService.verifyMailgunSignature(body)) {
      this.logger.warn('Invalid Mailgun webhook signature');
      throw new BusinessException(
        'Invalid webhook signature',
        'INVALID_SIGNATURE',
      );
    }

    // Process event
    const result = await this.webhookService.processMailgunEvent(body);

    // Store result for future duplicate requests
    if (req.idempotencyKey) {
      await this.idempotencyService.markProcessed(
        req.idempotencyKey,
        result,
        28800, // 8 hours
        { provider: 'mailgun', eventType: body?.['event-data']?.event },
      );
    }

    this.logger.log(
      `Mailgun webhook processed: ${result.processed} processed, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Handle WhatsApp delivery status webhooks (Meta/Facebook)
   * Statuses: sent, delivered, read, failed
   *
   * IDEMPOTENCY: Uses entry ID + message ID as idempotency key.
   * Meta/WhatsApp may retry webhooks for up to 24 hours.
   *
   * @param req - Raw request for signature verification and idempotency
   * @param body - Parsed webhook payload
   * @param signature - Meta signature header
   */
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyGuard)
  @Idempotent({
    keyExtractor: (req) => {
      // Extract unique key from WhatsApp payload
      // Format: whatsapp:{entry_id}:{message_id}:{status}
      const payload = req.body as WhatsAppWebhookPayload;
      if (!payload?.entry?.length) return null;
      const entry = payload.entry[0];
      const change = entry.changes?.[0];
      const status = change?.value?.statuses?.[0];
      if (!status?.id) return null;
      return IdempotencyService.generateKey(
        'whatsapp',
        `${entry.id}:${status.id}`,
        status.status,
      );
    },
    ttl: 86400, // 24 hours for Meta/WhatsApp retry window
    keyPrefix: 'webhook:',
    cacheResult: true,
  })
  @ApiOperation({ summary: 'Handle WhatsApp delivery status webhooks' })
  @ApiHeader({ name: 'x-hub-signature-256', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWhatsAppWebhook(
    @Req() req: RawBodyRequest<Request> & IdempotentRequest,
    @Body() body: WhatsAppWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug('Received WhatsApp webhook');

    // Check for duplicate request (already processed)
    if (req.isDuplicate) {
      this.logger.log(
        `Duplicate WhatsApp webhook detected: ${req.idempotencyKey}`,
      );
      // Return cached result or default duplicate response
      if (req.idempotencyResult) {
        return req.idempotencyResult as WebhookProcessingResult;
      }
      return {
        processed: 0,
        skipped: 0,
        errors: [],
      };
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody?.toString() || JSON.stringify(body);

    // Verify signature
    if (!this.webhookService.verifyWhatsAppSignature(rawBody, signature)) {
      this.logger.warn('Invalid WhatsApp webhook signature');
      throw new BusinessException(
        'Invalid webhook signature',
        'INVALID_SIGNATURE',
      );
    }

    // Process events
    const result = await this.webhookService.processWhatsAppEvent(body);

    // Store result for future duplicate requests
    if (req.idempotencyKey) {
      await this.idempotencyService.markProcessed(
        req.idempotencyKey,
        result,
        86400, // 24 hours
        { provider: 'whatsapp', entriesCount: body.entry?.length || 0 },
      );
    }

    this.logger.log(
      `WhatsApp webhook processed: ${result.processed} processed, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Handle WhatsApp webhook verification (Meta/Facebook)
   * Called during webhook subscription setup
   *
   * @param mode - hub.mode query param (should be 'subscribe')
   * @param token - hub.verify_token query param
   * @param challenge - hub.challenge query param
   * @returns challenge string if valid
   */
  @Get('whatsapp')
  @ApiOperation({ summary: 'WhatsApp webhook verification endpoint' })
  @ApiResponse({ status: 200, description: 'Verification successful' })
  @ApiResponse({ status: 403, description: 'Verification failed' })
  handleWhatsAppVerification(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    this.logger.log(`WhatsApp webhook verification: mode=${mode}`);

    return this.webhookService.verifyWhatsAppSubscription(
      mode,
      token,
      challenge,
    );
  }

  /**
   * Handle Twilio WhatsApp/SMS status callbacks
   * Statuses: queued, sent, delivered, read, failed, undelivered
   *
   * @param req - Express request
   * @param body - Twilio status callback parameters
   * @param signature - X-Twilio-Signature header
   */
  @Post('twilio/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio WhatsApp/SMS status callbacks' })
  @ApiHeader({ name: 'x-twilio-signature', required: false })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleTwilioStatusCallback(
    @Req() req: Request,
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') signature: string,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug(
      `Received Twilio status callback: ${body.MessageStatus} for ${body.MessageSid}`,
    );

    // Build the full URL for signature verification
    const protocol =
      req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Verify signature (skip in development if not configured)
    if (
      process.env.NODE_ENV === 'production' &&
      !this.webhookService.verifyTwilioSignature(url, body, signature)
    ) {
      this.logger.warn('Invalid Twilio webhook signature');
      throw new BusinessException(
        'Invalid webhook signature',
        'INVALID_SIGNATURE',
      );
    }

    // Process the status callback
    const result = await this.webhookService.processTwilioStatusCallback(body);

    this.logger.log(
      `Twilio status callback processed: ${result.processed} processed, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Handle Twilio incoming WhatsApp messages
   * TASK-WA-012: Conversational onboarding via WhatsApp
   *
   * Twilio sends incoming messages as form data with fields:
   * - From: whatsapp:+27XXXXXXXXX
   * - Body: message text
   * - NumMedia: number of media attachments
   * - MediaUrl0, MediaContentType0: first media attachment
   * - MessageSid: unique message ID
   *
   * Returns empty TwiML response as Twilio expects.
   *
   * @param req - Express request for signature verification
   * @param body - Twilio incoming message parameters
   * @param signature - X-Twilio-Signature header
   */
  @Post('twilio/incoming')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio incoming WhatsApp messages' })
  @ApiHeader({ name: 'x-twilio-signature', required: false })
  @ApiResponse({
    status: 200,
    description: 'Message processed, TwiML response',
  })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleTwilioIncoming(
    @Req() req: Request,
    @Body() body: Record<string, string>,
    @Headers('x-twilio-signature') signature: string,
  ): Promise<string> {
    const from = body.From || '';
    const messageBody = body.Body || '';
    const buttonPayload = body.ButtonPayload || '';
    const listId = body.ListId || '';
    const numMedia = parseInt(body.NumMedia || '0', 10);
    const mediaUrl = numMedia > 0 ? body.MediaUrl0 : undefined;
    const mediaContentType = numMedia > 0 ? body.MediaContentType0 : undefined;
    const messageSid = body.MessageSid || '';

    // Extract waId: strip "whatsapp:" prefix
    const waId = from.replace('whatsapp:', '').replace('+', '');

    this.logger.debug(
      `Twilio incoming: ${messageSid} from ${waId}, body="${messageBody.substring(0, 50)}"`,
    );

    // Build the full URL for signature verification
    const protocol =
      req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Verify signature (skip in development if not configured)
    if (
      process.env.NODE_ENV === 'production' &&
      !this.webhookService.verifyTwilioSignature(url, body, signature)
    ) {
      this.logger.warn('Invalid Twilio incoming webhook signature');
      throw new BusinessException(
        'Invalid webhook signature',
        'INVALID_SIGNATURE',
      );
    }

    // Determine tenantId: look up from existing onboarding session or find first active tenant
    let tenantId: string | null = null;

    // First, try to find an existing session for this waId
    const existingSession =
      await this.prisma.whatsAppOnboardingSession.findFirst({
        where: { waId },
        orderBy: { updatedAt: 'desc' },
        select: { tenantId: true },
      });

    if (existingSession) {
      tenantId = existingSession.tenantId;
    } else {
      // Look up parent by whatsapp or phone number
      const parent = await this.prisma.parent.findFirst({
        where: {
          OR: [
            { whatsapp: waId },
            { phone: waId },
            { whatsapp: `+${waId}` },
            { phone: `+${waId}` },
          ],
        },
        select: { tenantId: true },
      });

      if (parent) {
        tenantId = parent.tenantId;
      } else {
        // Fallback: use first tenant (for new registrations)
        const firstTenant = await this.prisma.tenant.findFirst({
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        tenantId = firstTenant?.id || null;
      }
    }

    if (!tenantId) {
      this.logger.warn(`No tenant found for incoming message from ${waId}`);
      return '<Response></Response>';
    }

    try {
      // For interactive responses, prefer ButtonPayload/ListId over Body
      // Twilio sends button ID in ButtonPayload, not in Body
      const effectiveBody = buttonPayload || listId || messageBody;

      // Check if onboarding handler should handle this message
      const shouldHandle = await this.onboardingHandler.shouldHandle(
        waId,
        tenantId,
        effectiveBody,
      );

      if (shouldHandle) {
        await this.onboardingHandler.handleMessage(
          waId,
          tenantId,
          effectiveBody,
          mediaUrl,
          mediaContentType,
        );
      } else {
        // Route to parent self-service menu
        await this.parentMenuHandler.handleIncomingMessage(
          waId,
          tenantId,
          messageBody,
          buttonPayload || undefined,
          listId || undefined,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error handling incoming message: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    // Always return empty TwiML response
    return '<Response></Response>';
  }
}
