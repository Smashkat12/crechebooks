/**
 * SimplePay Webhook Controller
 * TASK-SPAY-009: SimplePay Webhook Handler
 *
 * @description REST endpoint for handling SimplePay webhooks.
 * Verifies signatures before processing events.
 *
 * CRITICAL: Verify webhook signatures before processing.
 * CRITICAL: Return 200 quickly to prevent webhook retries.
 * CRITICAL: Check for duplicates to ensure idempotent processing.
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../api/auth/decorators/public.decorator';
import { SimplePayWebhookService } from './simplepay-webhook.service';
import type {
  SimplePayWebhookPayload,
  WebhookProcessingResult,
} from './dto/simplepay-webhook.dto';

/**
 * SimplePay Webhook Controller
 * Public endpoint (no auth required, signature verified)
 */
@Controller('webhooks/simplepay')
@ApiTags('Webhooks')
@Public()
export class SimplePayWebhookController {
  private readonly logger = new Logger(SimplePayWebhookController.name);

  constructor(private readonly webhookService: SimplePayWebhookService) {}

  /**
   * Handle SimplePay webhook events
   *
   * Events supported:
   * - payrun.completed: Pay run has been finalized
   * - payslip.created: A new payslip has been created
   * - employee.updated: Employee data has been updated
   * - employee.terminated: Employee has been terminated
   *
   * Processing flow:
   * 1. Verify signature (HMAC-SHA256)
   * 2. Check idempotency (delivery_id)
   * 3. Log webhook to database
   * 4. Resolve tenant from client_id
   * 5. Return 200 immediately (async processing)
   * 6. Process event-specific logic asynchronously
   *
   * @param req - Raw request for signature verification
   * @param payload - Parsed webhook payload
   * @param signature - x-simplepay-signature header (HMAC-SHA256)
   * @returns Acknowledgment response
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle SimplePay webhook events',
    description:
      'Receives and processes webhook events from SimplePay. ' +
      'Events include payrun.completed, payslip.created, employee.updated, and employee.terminated. ' +
      'Requires valid HMAC-SHA256 signature.',
  })
  @ApiHeader({
    name: 'x-simplepay-signature',
    description: 'HMAC-SHA256 signature of the request body',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook received and queued for processing',
    schema: {
      type: 'object',
      properties: {
        received: { type: 'boolean', example: true },
        webhookLogId: {
          type: 'string',
          example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing signature',
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-simplepay-signature') signature: string,
    @Body() payload: SimplePayWebhookPayload,
  ): Promise<WebhookProcessingResult> {
    this.logger.debug(
      `Received SimplePay webhook: ${payload.event} (delivery_id: ${payload.delivery_id})`,
    );

    // Get raw body for signature verification
    const rawBody = req.rawBody?.toString() || JSON.stringify(payload);

    // 1. Verify signature FIRST
    if (!this.webhookService.verifySignature(rawBody, signature)) {
      this.logger.warn(
        `Invalid SimplePay webhook signature for delivery_id: ${payload.delivery_id}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Check idempotency
    if (await this.webhookService.isAlreadyProcessed(payload.delivery_id)) {
      this.logger.debug(
        `Duplicate SimplePay webhook: delivery_id=${payload.delivery_id}`,
      );
      return {
        received: true,
        processed: true,
      };
    }

    // 3. Resolve tenant from SimplePay client_id
    const tenantId = await this.webhookService.resolveTenantId(
      payload.client_id,
    );

    // 4. Log webhook (this acts as our idempotency record)
    const webhookLog = await this.webhookService.logWebhook(
      payload,
      tenantId ?? undefined,
    );

    // 5. Return 200 immediately (don't block the webhook response)
    // Process asynchronously to prevent SimplePay retries
    setImmediate(async () => {
      try {
        await this.webhookService.processWebhook(
          webhookLog.id,
          payload,
          tenantId,
        );
      } catch (error) {
        // Error is already logged in processWebhook
        this.logger.error(
          `Async webhook processing failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    });

    this.logger.log(
      `SimplePay webhook acknowledged: ${payload.event} (delivery_id: ${payload.delivery_id}, tenant: ${tenantId || 'unknown'})`,
    );

    return {
      received: true,
      webhookLogId: webhookLog.id,
    };
  }
}
