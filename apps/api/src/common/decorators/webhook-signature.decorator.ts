/**
 * Webhook Signature Decorator
 * TASK-SEC-102: Webhook Signature Validation
 *
 * @description Custom decorator for specifying webhook provider on controller methods.
 * Used in conjunction with WebhookSignatureGuard for unified signature verification.
 *
 * Usage:
 * @UseGuards(WebhookSignatureGuard)
 * @WebhookSignature('simplepay')
 * async handleWebhook() { ... }
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Supported webhook providers
 */
export type WebhookProvider =
  | 'sendgrid'
  | 'whatsapp'
  | 'stripe'
  | 'xero'
  | 'simplepay';

/**
 * Metadata key for webhook provider
 * @internal Used by WebhookSignatureGuard to determine which verification method to use
 */
export const WEBHOOK_SIGNATURE_KEY = 'webhookProvider';

/**
 * Decorator to specify the webhook provider for signature verification
 *
 * @param provider - The webhook provider (sendgrid, whatsapp, stripe, xero, simplepay)
 * @returns MethodDecorator that sets the webhook provider metadata
 *
 * @example
 * // On a controller method
 * @Post()
 * @UseGuards(WebhookSignatureGuard)
 * @WebhookSignature('simplepay')
 * async handleSimplePayWebhook(@Body() payload: any) {
 *   // Signature has been verified by the guard
 * }
 *
 * @example
 * // On a class (applies to all methods)
 * @Controller('webhooks/stripe')
 * @UseGuards(WebhookSignatureGuard)
 * @WebhookSignature('stripe')
 * export class StripeWebhookController {
 *   // All methods use Stripe signature verification
 * }
 */
export const WebhookSignature = (provider: WebhookProvider) =>
  SetMetadata(WEBHOOK_SIGNATURE_KEY, provider);
