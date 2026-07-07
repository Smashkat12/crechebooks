/**
 * Orchestrator Schedule Service
 *
 * @module scheduler/orchestrator-schedule.service
 * @description Monthly cron producer for OrchestratorAgent MONTH_END workflows.
 *
 * Design mirrors SarsDeadlineScheduleService (see that file for the pattern):
 *   - Registered inside SchedulerModule's Redis-gated providers, so the
 *     @Cron only exists when Bull queues are available.
 *   - A plain daily @nestjs/schedule cron (not a Bull repeatable): the
 *     scheduling decision is uniform across tenants ("5th at 06:00 SAST").
 *   - Idempotency: per-tenant + per-month jobId, so an overlapping cron
 *     fire or multi-instance deploy cannot double-enqueue.
 *   - Rollout gate: enumerates ACTIVE tenants where
 *     `orchestratorMonthEndEnabled = true` — the default is FALSE, so no
 *     tenant runs the cron until an operator flips it.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  QUEUE_NAMES,
  OrchestratorWorkflowJobData,
  DEFAULT_JOB_OPTIONS,
} from './types/scheduler.types';
import { SubscriptionStatus } from '../database/entities/tenant.entity';
import { WorkflowRunRepository } from '../agents/orchestrator/workflow-run.repository';

@Injectable()
export class OrchestratorScheduleService {
  private readonly logger = new Logger(OrchestratorScheduleService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ORCHESTRATOR_WORKFLOW)
    private readonly workflowQueue: Queue<OrchestratorWorkflowJobData>,
    private readonly prisma: PrismaService,
    private readonly workflowRuns: WorkflowRunRepository,
  ) {}

  /**
   * 5th of every month, 06:00 Africa/Johannesburg — enqueue one MONTHLY_CLOSE
   * job per opted-in tenant. Recipients see any escalations by the start of
   * their workday.
   *
   * The 5th is deliberate: prior-month bank transactions are typically
   * settled by then, and PAYE/EMP201 for the prior month is due on the 7th
   * — so MONTH_END surfaces escalations 48h before the tax deadline.
   */
  @Cron('0 6 5 * *', {
    name: 'orchestrator-month-end-monthly',
    timeZone: 'Africa/Johannesburg',
  })
  async enqueueMonthlyMonthEnd(): Promise<void> {
    const optedInTenants = await this.prisma.tenant.findMany({
      where: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        orchestratorMonthEndEnabled: true,
      },
      select: { id: true, name: true },
    });

    if (optedInTenants.length === 0) {
      this.logger.log(
        'No tenants opted in to MONTH_END orchestrator cron (orchestratorMonthEndEnabled=true) — skipping',
      );
      return;
    }

    // Cover prior calendar month — SAST-anchored so a run at 06:00 SAST on
    // e.g. 2026-07-05 targets 2026-06.
    const now = new Date();
    const priorMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const periodMonth = `${priorMonth.getUTCFullYear()}-${String(priorMonth.getUTCMonth() + 1).padStart(2, '0')}`;

    this.logger.log(
      `Enqueueing MONTH_END for ${optedInTenants.length} tenant(s), period=${periodMonth}`,
    );

    let enqueued = 0;
    for (const tenant of optedInTenants) {
      try {
        const runId = uuidv4();

        // Pre-create the workflow_runs row here (not in the processor) so
        // a status endpoint hit BEFORE the Bull worker picks the job up
        // still returns RUNNING with the correct triggeredBy tag.
        await this.workflowRuns.create({
          id: runId,
          tenantId: tenant.id,
          workflowType: 'MONTHLY_CLOSE',
          triggeredBy: 'cron-month-end',
          input: { periodMonth },
        });

        const jobData: OrchestratorWorkflowJobData = {
          tenantId: tenant.id,
          triggeredBy: 'cron',
          scheduledAt: new Date(),
          workflowType: 'MONTHLY_CLOSE',
          parameters: { periodMonth },
          runId,
        };

        await this.workflowQueue.add(jobData, {
          ...DEFAULT_JOB_OPTIONS,
          // Per-tenant, per-month idempotency — Bull ignores adds with an
          // existing jobId, so a re-fire within the same month cannot
          // double-run the same MONTH_END.
          jobId: `${QUEUE_NAMES.ORCHESTRATOR_WORKFLOW}:${tenant.id}:${periodMonth}`,
        });
        enqueued++;
      } catch (err) {
        // Log and continue: a single tenant failure must not stop the rest
        this.logger.error(
          `Failed to enqueue MONTH_END for tenant ${tenant.id} (${tenant.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(`MONTH_END enqueued: ${enqueued}/${optedInTenants.length}`);
  }
}
