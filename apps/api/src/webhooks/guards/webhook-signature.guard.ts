/**
 * Webhook Signature Guard
 * TASK-SEC-006: Remove Webhook Signature Bypass
 *
 * @description Reusable guard for webhook signature verification.
 * CRITICAL: NEVER skip verification - ALWAYS validate signatures.
 *
 * Usage:
 * @UseGuards(WebhookSignatureGuard)
 * @SetMetadata('webhookProvider', 'simplepay')
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

export type WebhookProvider = 'whatsapp' | 'xero' | 'simplepay' | 'mailgun';

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
    whatsapp: {
      secretEnvVar: 'WHATSAPP_APP_SECRET',
      signatureHeader: 'x-hub-signature-256',
      verifyFn: this.verifyWhatsAppSignature.bind(this),
    },
    xero: {
      secretEnvVar: 'XERO_WEBHOOK_SECRET',
      signatureHeader: 'x-xero-signature',
      verifyFn: this.verifyXeroSignature.bind(this),
    },
    simplepay: {
      secretEnvVar: 'SIMPLEPAY_WEBHOOK_SECRET',
      signatureHeader: 'x-simplepay-signature',
      verifyFn: this.verifySimplePaySignature.bind(this),
    },
    mailgun: {
      secretEnvVar: 'MAILGUN_WEBHOOK_SIGNING_KEY',
      signatureHeader: 'content-type', // Mailgun uses body-based signature, not header
      verifyFn: this.verifyMailgunSignature.bind(this),
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
   * Verify SimplePay webhook signature (HMAC SHA256 hex)
   * @see SimplePay uses HMAC-SHA256 with hex encoding (NOT base64 like Xero)
   */
  private verifySimplePaySignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return this.constantTimeCompare(signature, expectedSignature);
    } catch (error) {
      this.logger.error('Error verifying SimplePay signature', error);
      return false;
    }
  }

  /**
   * Verify Mailgun webhook signature (HMAC SHA256 hex)
   * Mailgun sends signature in the request body, not headers
   * @see https://documentation.mailgun.com/en/latest/user_manual.html#webhooks-1
   */
  private verifyMailgunSignature(
    payload: string,
    _signature: string, // Not used - Mailgun signature is in body
    secret: string,
  ): boolean {
    try {
      const body = JSON.parse(payload);
      const signatureData = body.signature;

      if (
        !signatureData?.timestamp ||
        !signatureData?.token ||
        !signatureData?.signature
      ) {
        this.logger.warn('Mailgun webhook missing signature data in body');
        return false;
      }

      // Mailgun signature = HMAC-SHA256(timestamp + token)
      const encodedToken = signatureData.timestamp + signatureData.token;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(encodedToken)
        .digest('hex');

      return this.constantTimeCompare(
        signatureData.signature,
        expectedSignature,
      );
    } catch (error) {
      this.logger.error('Error verifying Mailgun signature', error);
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
