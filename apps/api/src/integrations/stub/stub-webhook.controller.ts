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
    @Body() rawPayload: Record<string, unknown>,
    @Headers('x-stub-signature') signature?: string,
  ): Promise<{ received: boolean; processed: number }> {
    // Stub envelope (verified from prod logs):
    //   { date, timestamp, signature, status, received, response }
    //   received = { webhook, uid, type, appid, direction }   ← echoes our request
    //   response = { error, transactions, hardrefreshing }     ← actual payload
    // `hardrefreshing: true` signals Stub is fetching fresh data from FNB and
    // will deliver the result in a follow-up webhook — no transactions in this
    // envelope yet, just acknowledgement that the pull is in flight.
    const received = (rawPayload.received as Record<string, unknown>) ?? {};
    const response = (rawPayload.response as Record<string, unknown>) ?? {};
    const uid = (received.uid as string) ?? '';
    const event = (received.type as string) ?? 'unknown';
    const direction = (received.direction as string) ?? '';
    const transactionsRaw = response.transactions;
    const error = response.error;
    const hardrefreshing = response.hardrefreshing === true;

    const payload: StubWebhookPayload = {
      event,
      uid,
      data: {
        transactions: Array.isArray(transactionsRaw)
          ? (transactionsRaw as StubWebhookPayload['data']['transactions'])
          : [],
      },
      timestamp: (rawPayload.timestamp as string) ?? new Date().toISOString(),
    };

    this.logger.log(
      `Stub webhook: type=${event} direction=${direction} uid=${uid} ` +
        `status=${JSON.stringify(rawPayload.status)} ` +
        `txCount=${payload.data.transactions?.length ?? 0} ` +
        `hardrefreshing=${hardrefreshing} ` +
        `error=${error === null || error === undefined ? 'null' : JSON.stringify(error)}`,
    );

    // If Stub reports it's still fetching, this envelope has nothing for us
    // to import — wait for the follow-up webhook.
    if (hardrefreshing && (payload.data.transactions?.length ?? 0) === 0) {
      return { received: true, processed: 0 };
    }

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

          // Idempotency: same Stub transaction already imported.
          const existingStub = await this.prisma.transaction.findFirst({
            where: { tenantId, reference: stubRef },
          });

          if (existingStub) {
            this.logger.debug(
              `Stub transaction ${tx.id} already imported, skipping`,
            );
            continue;
          }

          // Convert Stub amount (Rands) to cents.
          const amountCents = Math.abs(Math.round(tx.amount * 100));
          const isCredit = tx.type === 'income';
          const txDate = new Date(tx.date);

          // Cross-source dedup: a row with the same date + amount + isCredit
          // for this tenant/account is almost certainly the same FNB
          // transaction we already pulled via Xero. Skip rather than double-import.
          const dayStart = new Date(txDate);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayEnd = new Date(txDate);
          dayEnd.setUTCHours(23, 59, 59, 999);

          const existingFromOtherSource =
            await this.prisma.transaction.findFirst({
              where: {
                tenantId,
                bankAccount: 'Business Account',
                amountCents,
                isCredit,
                date: { gte: dayStart, lte: dayEnd },
                source: ImportSource.BANK_FEED,
              },
            });

          if (existingFromOtherSource) {
            this.logger.debug(
              `Stub transaction ${tx.id} matches existing tx ${existingFromOtherSource.id} (same day + amount + direction), skipping`,
            );
            continue;
          }

          await this.prisma.transaction.create({
            data: {
              tenantId,
              date: txDate,
              description: tx.description,
              amountCents,
              isCredit,
              reference: stubRef,
              bankAccount: 'Business Account',
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
