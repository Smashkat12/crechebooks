/**
 * Statement Schedule Service
 * TASK-STMT-008: Scheduled Monthly Statement Generation — producer
 *
 * StatementSchedulerProcessor (apps/api/src/scheduler/processors/statement-scheduler.processor.ts)
 * has existed since TASK-STMT-008 but had no producer — no cron ever enqueued
 * a STATEMENT_GENERATION job, so monthly statements never auto-generated.
 * This service is that producer, following the identical per-tenant Bull
 * repeatable pattern already fixed in InvoiceScheduleService (see that file's
 * header comment for the full multi-tenant cron-collision rationale this
 * mirrors) — every repeatable is keyed by a per-tenant jobId
 * (`statement-generation:<tenantId>`), registered via a directly-injected
 * Bull queue.
 *
 * OPT-IN SAFETY (deliberate): auto-generating (and optionally
 * finalizing/delivering) statements must not surprise tenants who never
 * asked for it, and delivery can reach real parents. Two independent gates:
 *
 *   1. Per-tenant enablement — isStatementScheduleEnabled() below. There is
 *      currently NO tenant-level column for this (checked: Tenant model has
 *      no generic "settings" JSON and no dedicated config table for this
 *      feature — cf. ReminderConfig for the equivalent arrears-reminder
 *      pattern). Until schema-guardian adds one (recommendation: a boolean
 *      column, e.g. `Tenant.statementScheduleEnabled @default(false)`, or a
 *      small `StatementScheduleConfig` model mirroring ReminderConfig),
 *      isStatementScheduleEnabled() always returns false — bootstrap
 *      enrolls ZERO tenants. This keeps the producer fully wired and ready,
 *      while guaranteeing no tenant is auto-enrolled until product/schema
 *      sign-off lands. See billing-engineer mental model for tracking.
 *
 *   2. autoFinalize/autoDeliver default to false in the scheduled job data —
 *      even once a tenant is opted in, the cron only generates DRAFT
 *      statements by default. Finalizing/delivering requires an explicit
 *      opt-in via scheduleTenantStatements() parameters (future wiring).
 *
 * This service only registers/removes Bull repeatable jobs; it does NOT
 * generate or send statements. That happens in StatementSchedulerProcessor.
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import {
  QUEUE_NAMES,
  StatementGenerationJobData,
  DEFAULT_JOB_OPTIONS,
} from '../scheduler/types/scheduler.types';
import { BusinessException } from '../shared/exceptions';
import { SubscriptionStatus } from '../database/entities/tenant.entity';

/** Default cron: 07:00 SAST on the 1st of month — one hour after invoice generation */
const DEFAULT_CRON = '0 7 1 * *';

/** Default timezone for South Africa */
const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

@Injectable()
export class StatementScheduleService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StatementScheduleService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.STATEMENT_GENERATION)
    private readonly statementQueue: Queue<StatementGenerationJobData>,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Deterministic per-tenant Bull repeatable jobId (see InvoiceScheduleService
   * for the multi-tenant cron-collision rationale this mirrors).
   */
  private getRepeatableJobId(tenantId: string): string {
    return `${QUEUE_NAMES.STATEMENT_GENERATION}:${tenantId}`;
  }

  /**
   * Per-tenant opt-in gate — see OPT-IN SAFETY note in file header. Always
   * false until schema-guardian adds a tenant-level enablement column;
   * intentionally NOT reading an unrelated JSON field as a workaround.
   */
  private isStatementScheduleEnabled(_tenantId: string): boolean {
    return false;
  }

  /**
   * Bootstrap hook: register the monthly statement-generation cron for every
   * ACTIVE tenant that has opted in, once the application is ready.
   *
   * Idempotency: this tenant's repeatable is removed (by jobId) before being
   * re-scheduled. Bull's removeRepeatable() is a no-op when the repeatable
   * does not exist, so repeated cold-starts are safe.
   */
  async onApplicationBootstrap(): Promise<void> {
    const activeTenants = await this.prisma.tenant.findMany({
      where: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
      select: { id: true, name: true },
    });

    const optedInTenants = activeTenants.filter((tenant) =>
      this.isStatementScheduleEnabled(tenant.id),
    );

    if (optedInTenants.length === 0) {
      this.logger.log(
        'onApplicationBootstrap: no tenants opted into statement scheduling — skipping cron registration',
      );
      return;
    }

    this.logger.log(
      `onApplicationBootstrap: registering statement cron for ${optedInTenants.length} opted-in tenant(s)`,
    );

    for (const tenant of optedInTenants) {
      try {
        // Remove-then-schedule ensures no stacked repeatables on restart.
        // Scoped to this tenant's jobId only — does NOT remove other
        // tenants' repeatables.
        await this.statementQueue.removeRepeatable({
          cron: DEFAULT_CRON,
          jobId: this.getRepeatableJobId(tenant.id),
        });
        await this.scheduleTenantStatements(tenant.id);
        this.logger.log(
          `Registered statement cron for tenant ${tenant.id} (${tenant.name})`,
        );
      } catch (err) {
        // Log and continue — a single tenant failure must not block the rest
        this.logger.error(
          `Failed to register statement cron for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Schedule monthly statement generation for a tenant.
   *
   * autoFinalize/autoDeliver default to false — the cron only generates
   * DRAFT statements unless the caller explicitly opts in (see OPT-IN SAFETY
   * note in file header).
   *
   * @param tenantId - Tenant ID
   * @param cronExpression - Optional custom cron (default: 0 7 1 * *)
   * @param options - autoFinalize/autoDeliver overrides (both default false)
   */
  async scheduleTenantStatements(
    tenantId: string,
    cronExpression: string = DEFAULT_CRON,
    options: { autoFinalize?: boolean; autoDeliver?: boolean } = {},
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      this.logger.error({
        error: { message: 'Tenant not found', name: 'NotFoundError' },
        file: 'statement-schedule.service.ts',
        function: 'scheduleTenantStatements',
        inputs: { tenantId },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `Tenant ${tenantId} not found`,
        'TENANT_NOT_FOUND',
      );
    }

    if (!this.isValidCronExpression(cronExpression)) {
      throw new BusinessException(
        `Invalid cron expression: ${cronExpression}`,
        'INVALID_CRON_EXPRESSION',
      );
    }

    const autoFinalize = options.autoFinalize ?? false;
    const autoDeliver = autoFinalize ? (options.autoDeliver ?? false) : false;
    const statementMonth = this.getCurrentBillingMonth();

    const jobData: StatementGenerationJobData = {
      tenantId,
      triggeredBy: 'cron',
      scheduledAt: new Date(),
      statementMonth,
      onlyWithActivity: true,
      autoFinalize,
      autoDeliver,
      dryRun: false,
    };

    const jobId = this.getRepeatableJobId(tenantId);
    await this.statementQueue.add(jobData, {
      ...DEFAULT_JOB_OPTIONS,
      jobId,
      repeat: { cron: cronExpression },
    });

    this.logger.log({
      message: 'Statement generation scheduled',
      tenantId,
      tenantName: tenant.name,
      cronExpression,
      timezone: DEFAULT_TIMEZONE,
      jobId,
      autoFinalize,
      autoDeliver,
      timestamp: new Date().toISOString(),
    });

    await this.auditLogService.logAction({
      tenantId,
      entityType: 'StatementSchedule',
      entityId: tenantId,
      action: AuditAction.CREATE,
      afterValue: {
        cronExpression,
        timezone: DEFAULT_TIMEZONE,
        enabled: true,
        autoFinalize,
        autoDeliver,
        scheduledAt: new Date().toISOString(),
      },
      changeSummary: `Statement generation scheduled: ${cronExpression} (${DEFAULT_TIMEZONE})`,
    });
  }

  /**
   * Cancel statement generation schedule for a tenant.
   *
   * Looks up the tenant's actual persisted repeatable (by jobId) via
   * getRepeatableJobs() and removes it by its Bull-assigned key — this
   * avoids the cancel-with-wrong-cron bug found in the InvoiceScheduleService
   * equivalent (removeRepeatable() requires the exact cron the job was
   * created with; blindly assuming DEFAULT_CRON silently no-ops for any
   * tenant scheduled with a custom cron).
   *
   * @param tenantId - Tenant ID
   */
  async cancelSchedule(tenantId: string): Promise<void> {
    const jobId = this.getRepeatableJobId(tenantId);
    const repeatableJobs = await this.statementQueue.getRepeatableJobs();
    const existing = repeatableJobs.find((job) => job.id === jobId);

    if (existing) {
      await this.statementQueue.removeRepeatableByKey(existing.key);
    } else {
      // Best-effort fallback so a repeatable predating this lookup still
      // gets cleaned up if it happens to use DEFAULT_CRON.
      await this.statementQueue.removeRepeatable({
        cron: DEFAULT_CRON,
        jobId,
      });
    }

    this.logger.log({
      message: 'Statement schedule cancellation requested',
      tenantId,
      timestamp: new Date().toISOString(),
    });

    await this.auditLogService.logAction({
      tenantId,
      entityType: 'StatementSchedule',
      entityId: tenantId,
      action: AuditAction.UPDATE,
      afterValue: {
        enabled: false,
        cancelledAt: new Date().toISOString(),
      },
      changeSummary: 'Statement generation schedule cancelled',
    });
  }

  /**
   * Update statement generation schedule for a tenant (cancel then reschedule).
   *
   * @param tenantId - Tenant ID
   * @param cronExpression - New cron expression
   */
  async updateSchedule(
    tenantId: string,
    cronExpression: string,
    options: { autoFinalize?: boolean; autoDeliver?: boolean } = {},
  ): Promise<void> {
    await this.cancelSchedule(tenantId);
    await this.scheduleTenantStatements(tenantId, cronExpression, options);

    this.logger.log({
      message: 'Statement schedule updated',
      tenantId,
      cronExpression,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Trigger manual statement generation for a specific month.
   *
   * @param tenantId - Tenant ID
   * @param statementMonth - Statement month (YYYY-MM format)
   * @param options - Generation options (defaults mirror the safe cron defaults)
   */
  async triggerManualGeneration(
    tenantId: string,
    statementMonth: string,
    options: {
      parentIds?: string[];
      onlyWithActivity?: boolean;
      onlyWithBalance?: boolean;
      dryRun?: boolean;
      autoFinalize?: boolean;
      autoDeliver?: boolean;
    } = {},
  ): Promise<Job<StatementGenerationJobData>> {
    if (!/^\d{4}-\d{2}$/.test(statementMonth)) {
      throw new BusinessException(
        'Invalid statement month format. Expected YYYY-MM',
        'INVALID_STATEMENT_MONTH',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new BusinessException(
        `Tenant ${tenantId} not found`,
        'TENANT_NOT_FOUND',
      );
    }

    const autoFinalize = options.autoFinalize ?? false;
    const autoDeliver = autoFinalize ? (options.autoDeliver ?? false) : false;

    const jobData: StatementGenerationJobData = {
      tenantId,
      triggeredBy: 'manual',
      scheduledAt: new Date(),
      statementMonth,
      parentIds: options.parentIds,
      onlyWithActivity: options.onlyWithActivity,
      onlyWithBalance: options.onlyWithBalance,
      dryRun: options.dryRun ?? false,
      autoFinalize,
      autoDeliver,
    };

    const job = await this.statementQueue.add(jobData, DEFAULT_JOB_OPTIONS);

    this.logger.log({
      message: 'Manual statement generation triggered',
      tenantId,
      statementMonth,
      jobId: job.id,
      autoFinalize,
      autoDeliver,
      timestamp: new Date().toISOString(),
    });

    await this.auditLogService.logAction({
      tenantId,
      entityType: 'StatementGeneration',
      entityId: String(job.id),
      action: AuditAction.CREATE,
      afterValue: {
        statementMonth,
        triggeredBy: 'manual',
        dryRun: jobData.dryRun,
        autoFinalize,
        autoDeliver,
        scheduledAt: new Date().toISOString(),
      },
      changeSummary: `Manual statement generation triggered for ${statementMonth}${jobData.dryRun ? ' (dry run)' : ''}`,
    });

    return job;
  }

  /**
   * Get the current billing month in YYYY-MM format (statements are
   * generated for the month just closed, unlike invoices which bill ahead).
   */
  private getCurrentBillingMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Validate cron expression format (basic 5-field validation).
   */
  private isValidCronExpression(cron: string): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }
    const fieldPattern = /^(\*|(\d+(-\d+)?(,\d+(-\d+)?)*)|(\*\/\d+))$/;
    return parts.every((part) => fieldPattern.test(part));
  }
}
