/**
 * Webhook Signature Guard
 * TASK-SEC-006: Remove Webhook Signature Bypass
 *
 * @description Reusable guard for webhook signature verification.
 * CRITICAL: NEVER skip verification - ALWAYS validate signatures.
 *
 * Usage:
 * @UseGuards(WebhookSignatureGuard)
 * @SetMetadata('webhookProvider', 'sendgrid')
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';

export const WEBHOOK_PROVIDER_KEY = 'webhookProvider';

export type WebhookProvider = 'sendgrid' | 'whatsapp' | 'stripe' | 'xero';

interface WebhookProviderConfig {
  secretEnvVar: string;
  signatureHeader: string;
  timestampHeader?: string;
  verifyFn: (
    payload: string,
    signature: string,
    secret: string,
    timestamp?: string,
  ) => boolean;
}

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  private readonly providerConfigs: Record<
    WebhookProvider,
    WebhookProviderConfig
  > = {
    sendgrid: {
      secretEnvVar: 'SENDGRID_WEBHOOK_KEY',
      signatureHeader: 'x-twilio-email-event-webhook-signature',
      timestampHeader: 'x-twilio-email-event-webhook-timestamp',
      verifyFn: this.verifySendgridSignature.bind(this),
    },
    whatsapp: {
      secretEnvVar: 'WHATSAPP_APP_SECRET',
      signatureHeader: 'x-hub-signature-256',
      verifyFn: this.verifyWhatsAppSignature.bind(this),
    },
    stripe: {
      secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
      signatureHeader: 'stripe-signature',
      verifyFn: this.verifyStripeSignature.bind(this),
    },
    xero: {
      secretEnvVar: 'XERO_WEBHOOK_SECRET',
      signatureHeader: 'x-xero-signature',
      verifyFn: this.verifyXeroSignature.bind(this),
    },
  };

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const provider = this.reflector.get<WebhookProvider>(
      WEBHOOK_PROVIDER_KEY,
      context.getHandler(),
    );

    if (!provider) {
      this.logger.error(
        'WebhookSignatureGuard used without specifying provider. ' +
          'Add @SetMetadata("webhookProvider", "provider_name") to the handler.',
      );
      throw new UnauthorizedException('Webhook provider not configured');
    }

    const config = this.providerConfigs[provider];
    if (!config) {
      this.logger.error(`Unknown webhook provider: ${provider}`);
      throw new UnauthorizedException(`Unknown webhook provider: ${provider}`);
    }

    const request = context.switchToHttp().getRequest<Request>();
    const secret = this.configService.get<string>(config.secretEnvVar);

    // SECURITY: FAIL FAST - Never process webhooks without verification
    if (!secret) {
      this.logger.error(
        `SECURITY: ${config.secretEnvVar} not configured. ` +
          'Webhook signature verification is REQUIRED in ALL environments. ' +
          `Configure the webhook secret or disable ${provider} webhooks.`,
      );
      throw new UnauthorizedException(
        `Webhook verification failed: ${config.secretEnvVar} not configured`,
      );
    }

    const signature = request.headers[config.signatureHeader] as string;
    if (!signature) {
      this.logger.warn(
        `Missing ${provider} webhook signature header: ${config.signatureHeader}`,
      );
      throw new UnauthorizedException('Missing webhook signature');
    }

    // Get raw body for signature verification
    const rawBody =
      (request as any).rawBody?.toString() || JSON.stringify(request.body);

    const timestamp = config.timestampHeader
      ? (request.headers[config.timestampHeader] as string)
      : undefined;

    const isValid = config.verifyFn(rawBody, signature, secret, timestamp);

    if (!isValid) {
      this.logger.warn(
        `${provider} webhook signature verification failed. ` +
          'Potential unauthorized webhook attempt.',
        {
          provider,
          signaturePresent: !!signature,
          timestampPresent: !!timestamp,
          payloadSize: rawBody.length,
        },
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug(`${provider} webhook signature verified successfully`);
    return true;
  }

  /**
   * Verify SendGrid webhook signature (HMAC SHA256 with timestamp)
   */
  private verifySendgridSignature(
    payload: string,
    signature: string,
    secret: string,
    timestamp?: string,
  ): boolean {
    if (!timestamp) {
      return false;
    }

    try {
      const payloadToSign = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadToSign)
        .digest('base64');

      return this.constantTimeCompare(signature, expectedSignature);
    } catch (error) {
      this.logger.error('Error verifying SendGrid signature', error);
      return false;
    }
  }

  /**
   * Verify WhatsApp/Meta webhook signature (HMAC SHA256 with sha256= prefix)
   */
  private verifyWhatsAppSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const expectedSignature =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(payload).digest('hex');

      return this.constantTimeCompare(signature, expectedSignature);
    } catch (error) {
      this.logger.error('Error verifying WhatsApp signature', error);
      return false;
    }
  }

  /**
   * Verify Stripe webhook signature
   * @see https://stripe.com/docs/webhooks/signatures
   */
  private verifyStripeSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      // Stripe signature format: t=timestamp,v1=signature,...
      const parts = signature.split(',');
      const timestampPart = parts.find((p) => p.startsWith('t='));
      const signaturePart = parts.find((p) => p.startsWith('v1='));

      if (!timestampPart || !signaturePart) {
        return false;
      }

      const timestamp = timestampPart.substring(2);
      const sig = signaturePart.substring(3);

      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      return this.constantTimeCompare(sig, expectedSignature);
    } catch (error) {
      this.logger.error('Error verifying Stripe signature', error);
      return false;
    }
  }

  /**
   * Verify Xero webhook signature (HMAC SHA256 base64)
   * @see https://developer.xero.com/documentation/guides/webhooks/overview
   */
  private verifyXeroSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');

      return this.constantTimeCompare(signature, expectedSignature);
    } catch (error) {
      this.logger.error('Error verifying Xero signature', error);
      return false;
    }
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      // Different lengths
      return false;
    }
  }
}
