/**
 * Webhook Controller
 * TASK-BILL-035: Delivery Status Webhook Handlers
 *
 * @description REST endpoints for email and WhatsApp delivery webhooks.
 * Verifies signatures before processing events.
 *
 * CRITICAL: Verify webhook signatures before processing.
 * CRITICAL: Return 200 quickly to prevent webhook retries.
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
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';
import { Public } from '../api/auth/decorators/public.decorator';
import type { EmailEvent, WhatsAppWebhookPayload } from './types/webhook.types';
import type { WebhookProcessingResult } from './types/webhook.types';
import { BusinessException } from '../shared/exceptions';

/**
 * Public webhook endpoints (no auth required, signature verified)
 */
@Controller('webhooks')
@ApiTags('Webhooks')
@Public()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Handle SendGrid email delivery webhooks
   * Events: delivered, open, click, bounce, spam_report, dropped
   *
   * @param req - Raw request for signature verification
   * @param body - Parsed webhook payload
   * @param signature - SendGrid signature header
   * @param timestamp - SendGrid timestamp header
   */
  @Post('email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle SendGrid email delivery webhooks' })
  @ApiHeader({ name: 'x-twilio-email-event-webhook-signature', required: true })
  @ApiHeader({ name: 'x-twilio-email-event-webhook-timestamp', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleEmailWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: EmailEvent[],
    @Headers('x-twilio-email-event-webhook-signature') signature: string,
    @Headers('x-twilio-email-event-webhook-timestamp') timestamp: string,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug(`Received email webhook with ${body.length} events`);

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

    this.logger.log(
      `Email webhook processed: ${result.processed} processed, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Handle WhatsApp delivery status webhooks (Meta/Facebook)
   * Statuses: sent, delivered, read, failed
   *
   * @param req - Raw request for signature verification
   * @param body - Parsed webhook payload
   * @param signature - Meta signature header
   */
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle WhatsApp delivery status webhooks' })
  @ApiHeader({ name: 'x-hub-signature-256', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async handleWhatsAppWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: WhatsAppWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug('Received WhatsApp webhook');

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
}
