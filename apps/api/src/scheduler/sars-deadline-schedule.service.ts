/**
 * SARS Deadline Schedule Service
 * TASK-SARS-017: SARS Deadline Reminder System — producer
 *
 * SarsDeadlineProcessor has existed since TASK-SARS-017 as a complete
 * consumer (deadline computation, email dispatch, audit-log dedup), but
 * nothing ever enqueued SARS_DEADLINE jobs — deadline reminders never fired.
 * This service is that producer: a daily cron that enqueues one
 * deadline-check job per ACTIVE tenant. The processor then computes the
 * tenant's upcoming VAT201/EMP201/EMP501 deadlines and sends reminders on
 * the configured reminder days (30/14/7/3/1 by default).
 *
 * Design notes:
 * - Registered in SchedulerModule's Redis-gated providers, so the @Cron
 *   only exists when Bull queues are available (same gating as the rest
 *   of the queue infrastructure).
 * - A plain daily @nestjs/schedule cron (not a Bull repeatable): the
 *   check is inherently "all tenants, once a day", so there is no
 *   per-tenant cron customisation to persist — unlike invoice/statement
 *   generation which use per-tenant Bull repeatables.
 * - Idempotency: jobId is keyed per tenant per calendar day, so an
 *   overlapping cron fire (or multi-instance deploy) cannot double-enqueue.
 *   Duplicate sends are additionally prevented by
 *   SarsDeadlineService.shouldSendReminder's audit-log dedup.
 * - Recipients are the tenant admin email(s) only (never parents), so this
 *   is safe to run in any environment; the COMMS_DISABLED gate inside
 *   EmailService still applies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  QUEUE_NAMES,
  SarsDeadlineJobData,
  DEFAULT_JOB_OPTIONS,
} from './types/scheduler.types';
import { SubscriptionStatus } from '../database/entities/tenant.entity';

@Injectable()
export class SarsDeadlineScheduleService {
  private readonly logger = new Logger(SarsDeadlineScheduleService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SARS_DEADLINE)
    private readonly sarsQueue: Queue<SarsDeadlineJobData>,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Daily at 06:00 SAST: enqueue a SARS deadline-check job for every
   * ACTIVE tenant. Reminders (if due) reach admins early in the workday.
   */
  @Cron('0 6 * * *', {
    name: 'sars-deadline-daily-checks',
    timeZone: 'Africa/Johannesburg',
  })
  async enqueueDailyDeadlineChecks(): Promise<void> {
    const activeTenants = await this.prisma.tenant.findMany({
      where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      select: { id: true, name: true },
    });

    if (activeTenants.length === 0) {
      this.logger.log('No active tenants — skipping SARS deadline checks');
      return;
    }

    this.logger.log(
      `Enqueueing SARS deadline checks for ${activeTenants.length} active tenant(s)`,
    );

    const dateKey = new Date().toISOString().split('T')[0];
    let enqueued = 0;

    for (const tenant of activeTenants) {
      try {
        const jobData: SarsDeadlineJobData = {
          tenantId: tenant.id,
          triggeredBy: 'cron',
          scheduledAt: new Date(),
        };

        await this.sarsQueue.add(jobData, {
          ...DEFAULT_JOB_OPTIONS,
          // Per-tenant, per-day idempotency key: Bull ignores adds with an
          // existing jobId, so a re-fire on the same day cannot double-run.
          jobId: `${QUEUE_NAMES.SARS_DEADLINE}:${tenant.id}:${dateKey}`,
        });
        enqueued++;
      } catch (err) {
        // Log and continue — a single tenant failure must not block the rest
        this.logger.error(
          `Failed to enqueue SARS deadline check for tenant ${tenant.id} (${tenant.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `SARS deadline checks enqueued: ${enqueued}/${activeTenants.length}`,
    );
  }
}
