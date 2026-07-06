/**
 * MailgunInboundController — signature verification unit tests
 *
 * Covers the fail-open bug fix: the controller must reject inbound webhooks
 * when no signing key is configured, except in test/development where a
 * loud warning is acceptable.
 */

import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { MailgunInboundController } from './mailgun-inbound.controller';
import { TransactionImportService } from '../../database/services/transaction-import.service';

describe('MailgunInboundController', () => {
  const buildController = (
    env: Record<string, string | undefined>,
  ): MailgunInboundController => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        return env[key] ?? defaultValue;
      }),
    };
    const importService = {
      importFromFile: jest.fn(),
    };

    return new MailgunInboundController(
      configService as any,
      importService as unknown as TransactionImportService,
    );
  };

  describe('verifySignature (via handleInbound)', () => {
    it('rejects the webhook when no signing key is configured and NODE_ENV=production', async () => {
      const controller = buildController({ NODE_ENV: 'production' });

      await expect(
        controller.handleInbound({ subject: 'FNB Statement: test' }, []),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects the webhook when no signing key is configured and NODE_ENV is unset (defaults closed)', async () => {
      const controller = buildController({});

      await expect(
        controller.handleInbound({ subject: 'FNB Statement: test' }, []),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('allows the webhook with only a warning when NODE_ENV=test', async () => {
      const controller = buildController({
        NODE_ENV: 'test',
        FNB_STATEMENT_PASSWORD: 'irrelevant',
      });

      const result = await controller.handleInbound(
        { subject: 'no fnb signal here' },
        [],
      );

      expect(result.status).toBe('ignored');
    });

    it('allows the webhook with only a warning when NODE_ENV=development', async () => {
      const controller = buildController({
        NODE_ENV: 'development',
        FNB_STATEMENT_PASSWORD: 'irrelevant',
      });

      const result = await controller.handleInbound(
        { subject: 'no fnb signal here' },
        [],
      );

      expect(result.status).toBe('ignored');
    });

    it('falls back to MAILGUN_WEBHOOK_SIGNING_KEY when MAILGUN_SIGNING_KEY is unset', async () => {
      const signingKey = 'shared-signing-key';
      const controller = buildController({
        NODE_ENV: 'production',
        MAILGUN_WEBHOOK_SIGNING_KEY: signingKey,
        FNB_STATEMENT_PASSWORD: 'irrelevant',
      });

      const timestamp = '1234567890';
      const token = 'abc123';
      const signature = createHmac('sha256', signingKey)
        .update(`${timestamp}${token}`)
        .digest('hex');

      const result = await controller.handleInbound(
        { subject: 'no fnb signal here', timestamp, token, signature },
        [],
      );

      expect(result.status).toBe('ignored');
    });

    it('rejects an invalid signature even when a signing key is configured', async () => {
      const controller = buildController({
        NODE_ENV: 'production',
        MAILGUN_SIGNING_KEY: 'correct-key',
        FNB_STATEMENT_PASSWORD: 'irrelevant',
      });

      await expect(
        controller.handleInbound(
          {
            subject: 'no fnb signal',
            timestamp: '123',
            token: 'abc',
            signature: 'wrong-signature',
          },
          [],
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid signature', async () => {
      const signingKey = 'correct-key';
      const controller = buildController({
        NODE_ENV: 'production',
        MAILGUN_SIGNING_KEY: signingKey,
        FNB_STATEMENT_PASSWORD: 'irrelevant',
      });

      const timestamp = '1234567890';
      const token = 'abc123';
      const signature = createHmac('sha256', signingKey)
        .update(`${timestamp}${token}`)
        .digest('hex');

      const result = await controller.handleInbound(
        { subject: 'no fnb signal here', timestamp, token, signature },
        [],
      );

      expect(result.status).toBe('ignored');
    });
  });
});
