/**
 * Stub.africa Webhook Controller
 * TASK-STUB-PARITY: Receives async results from Stub bank feed pulls.
 *
 * POST /webhooks/stub — public endpoint, verified via HMAC signature.
 * When Stub finishes processing a bank feed pull, it POSTs the results here.
 * This controller maps the incoming transactions to CrecheBooks records.
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '../../api/auth/decorators/public.decorator';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ImportSource } from '../../database/entities/transaction.entity';

interface StubWebhookPayload {
  event: string;
  uid: string;
  data: {
    transactions?: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      type: 'income' | 'expense';
      category?: string;
      reference?: string;
    }>;
  };
  timestamp: string;
}

@Controller('webhooks/stub')
export class StubWebhookController {
  private readonly logger = new Logger(StubWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>(
      'STUB_WEBHOOK_SECRET',
      '',
    );
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: StubWebhookPayload,
    @Headers('x-stub-signature') signature?: string,
  ): Promise<{ received: boolean; processed: number }> {
    this.logger.log(
      `Received Stub webhook: event=${payload.event}, uid=${payload.uid}`,
    );

    // Verify HMAC signature if webhook secret is configured
    if (this.webhookSecret) {
      if (!signature) {
        throw new BadRequestException('Missing x-stub-signature header');
      }

      const expectedSignature = createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    // Find tenant by Stub business UID
    const connections = await this.prisma.$queryRaw<
      Array<{ tenant_id: string }>
    >`
      SELECT tenant_id FROM stub_connections
      WHERE stub_business_uid = ${payload.uid} AND is_active = true
      LIMIT 1
    `;

    if (connections.length === 0) {
      this.logger.warn(
        `No active tenant found for Stub UID ${payload.uid}, ignoring webhook`,
      );
      return { received: true, processed: 0 };
    }

    const tenantId = connections[0].tenant_id;
    let processed = 0;

    if (
      payload.event === 'bank_feed.complete' &&
      payload.data.transactions?.length
    ) {
      for (const tx of payload.data.transactions) {
        try {
          const stubRef = `stub-${tx.id}`;

          // Check if transaction already exists (idempotent via reference)
          const existing = await this.prisma.transaction.findFirst({
            where: {
              tenantId,
              reference: stubRef,
            },
          });

          if (existing) {
            this.logger.debug(
              `Stub transaction ${tx.id} already imported, skipping`,
            );
            continue;
          }

          // Convert Stub amount (Rands) to cents
          const amountCents = Math.round(tx.amount * 100);

          await this.prisma.transaction.create({
            data: {
              tenantId,
              date: new Date(tx.date),
              description: tx.description,
              amountCents: Math.abs(amountCents),
              isCredit: tx.type === 'income',
              reference: stubRef,
              bankAccount: 'Stub Bank Feed',
              source: ImportSource.BANK_FEED,
              status: 'PENDING',
            },
          });

          processed++;
        } catch (err) {
          this.logger.error(
            `Failed to import Stub transaction ${tx.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      this.logger.log(
        `Processed ${processed} bank feed transactions from Stub for tenant ${tenantId}`,
      );
    }

    return { received: true, processed };
  }
}
