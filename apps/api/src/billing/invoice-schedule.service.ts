/**
 * Invoice Schedule Service
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * FEAT-BILLING-AUTOSEND: Bootstrap cron registration on app start
 *
 * Manages invoice generation scheduling for tenants.
 * Features:
 * - Tenant-configurable schedule
 * - Default: 6AM on 1st of month (SAST) — cron '0 6 1 * *'
 * - Idempotent bootstrap: remove-then-schedule prevents stacked repeatables
 * - Manual trigger support
 * - Schedule cancellation
 *
 * Staging-safety contract: delivery suppression is enforced inside
 * InvoiceSchedulerProcessor (COMMS_DISABLED flag + APP_ENV guard). This
 * service only registers/removes Bull repeatable jobs; it does NOT send.
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bull';
import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import {
  QUEUE_NAMES,
  InvoiceGenerationJobData,
} from '../scheduler/types/scheduler.types';
import { BusinessException } from '../shared/exceptions';
import { SubscriptionStatus } from '../database/entities/tenant.entity';

/** Default cron: 6AM on 1st of month (0 6 1 * *) */
const DEFAULT_CRON = '0 6 1 * *';

/** Default timezone for South Africa */
const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

/** Schedule configuration for a tenant */
interface TenantScheduleConfig {
  tenantId: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

@Injectable()
export class InvoiceScheduleService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvoiceScheduleService.name);

  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Bootstrap hook: register the monthly invoice-generation cron for every
   * ACTIVE tenant once the application is ready.
   *
   * Cron schedule: '0 6 1 * *' = 06:00 SAST on the 1st of each month.
   *
   * Idempotency: removeRepeatableCronJob() is called before scheduleCronJob()
   * for each tenant. Bull's removeRepeatable() is a no-op when the repeatable
   * does not exist, so repeated cold-starts are safe.
   *
   * Staging-safety: this method only enqueues the *generation* job. Delivery
   * suppression is enforced inside InvoiceSchedulerProcessor via the
   * COMMS_DISABLED env flag and the APP_ENV guard — not here.
   */
  async onApplicationBootstrap(): Promise<void> {
    const activeTenants = await this.prisma.tenant.findMany({
      where: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
      select: { id: true, name: true },
    });

    if (activeTenants.length === 0) {
      this.logger.log(
        'onApplicationBootstrap: no ACTIVE tenants — skipping cron registration',
      );
      return;
    }

    this.logger.log(
      `onApplicationBootstrap: registering invoice cron for ${activeTenants.length} ACTIVE tenant(s)`,
    );

    for (const tenant of activeTenants) {
      try {
        // Remove-then-schedule ensures no stacked repeatables on restart
        await this.schedulerService.removeRepeatableCronJob(
          QUEUE_NAMES.INVOICE_GENERATION,
          DEFAULT_CRON,
        );
        await this.scheduleTenantInvoices(
          tenant.id,
          DEFAULT_CRON,
          DEFAULT_TIMEZONE,
        );
        this.logger.log(
          `Registered invoice cron for tenant ${tenant.id} (${tenant.name})`,
        );
      } catch (err) {
        // Log and continue — a single tenant failure must not block the rest
        this.logger.error(
          `Failed to register invoice cron for tenant ${tenant.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Schedule invoice generation for a tenant
   *
   * @param tenantId - Tenant ID
   * @param cronExpression - Optional custom cron (default: 0 6 1 * *)
   * @param timezone - Optional timezone (default: Africa/Johannesburg)
   */
  async scheduleTenantInvoices(
    tenantId: string,
    cronExpression: string = DEFAULT_CRON,
    timezone: string = DEFAULT_TIMEZONE,
  ): Promise<void> {
    // Validate tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      this.logger.error({
        error: { message: 'Tenant not found', name: 'NotFoundError' },
        file: 'invoice-schedule.service.ts',
        function: 'scheduleTenantInvoices',
        inputs: { tenantId },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `Tenant ${tenantId} not found`,
        'TENANT_NOT_FOUND',
      );
    }

    // Validate cron expression format
    if (!this.isValidCronExpression(cronExpression)) {
      throw new BusinessException(
        `Invalid cron expression: ${cronExpression}`,
        'INVALID_CRON_EXPRESSION',
      );
    }

    // Calculate next billing month (next month)
    const nextMonth = this.getNextBillingMonth();

    // Create job data
    const jobData: InvoiceGenerationJobData = {
      tenantId,
      triggeredBy: 'cron',
      scheduledAt: new Date(),
      billingMonth: nextMonth,
      dryRun: false,
    };

    // Schedule recurring cron job
    await this.schedulerService.scheduleCronJob(
      QUEUE_NAMES.INVOICE_GENERATION,
      jobData,
      cronExpression,
    );

    this.logger.log({
      message: 'Invoice generation scheduled',
      tenantId,
      tenantName: tenant.name,
      cronExpression,
      timezone,
      nextBillingMonth: nextMonth,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'InvoiceSchedule',
      entityId: tenantId,
      action: AuditAction.CREATE,
      afterValue: {
        cronExpression,
        timezone,
        enabled: true,
        scheduledAt: new Date().toISOString(),
      },
      changeSummary: `Invoice generation scheduled: ${cronExpression} (${timezone})`,
    });
  }

  /**
   * Cancel invoice generation schedule for a tenant
   *
   * @param tenantId - Tenant ID
   */
  async cancelSchedule(tenantId: string): Promise<void> {
    await this.schedulerService.removeRepeatableCronJob(
      QUEUE_NAMES.INVOICE_GENERATION,
      DEFAULT_CRON,
    );

    this.logger.log({
      message: 'Invoice schedule cancellation requested',
      tenantId,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'InvoiceSchedule',
      entityId: tenantId,
      action: AuditAction.UPDATE,
      afterValue: {
        enabled: false,
        cancelledAt: new Date().toISOString(),
      },
      changeSummary: 'Invoice generation schedule cancelled',
    });
  }

  /**
   * Update invoice generation schedule for a tenant
   *
   * @param tenantId - Tenant ID
   * @param cronExpression - New cron expression
   */
  async updateSchedule(
    tenantId: string,
    cronExpression: string,
  ): Promise<void> {
    // Cancel existing schedule first
    await this.cancelSchedule(tenantId);

    // Create new schedule
    await this.scheduleTenantInvoices(tenantId, cronExpression);

    this.logger.log({
      message: 'Invoice schedule updated',
      tenantId,
      cronExpression,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Trigger manual invoice generation
   *
   * @param tenantId - Tenant ID
   * @param billingMonth - Billing month (YYYY-MM format)
   * @param dryRun - If true, simulates without creating invoices
   * @returns The scheduled job
   */
  async triggerManualGeneration(
    tenantId: string,
    billingMonth: string,
    dryRun: boolean = false,
  ): Promise<Job<InvoiceGenerationJobData>> {
    // Validate billing month format
    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      throw new BusinessException(
        'Invalid billing month format. Expected YYYY-MM',
        'INVALID_BILLING_MONTH',
      );
    }

    // Validate tenant exists
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

    const jobData: InvoiceGenerationJobData = {
      tenantId,
      triggeredBy: 'manual',
      scheduledAt: new Date(),
      billingMonth,
      dryRun,
    };

    const job = await this.schedulerService.scheduleJob(
      QUEUE_NAMES.INVOICE_GENERATION,
      jobData,
    );

    this.logger.log({
      message: 'Manual invoice generation triggered',
      tenantId,
      billingMonth,
      dryRun,
      jobId: job.id,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'InvoiceGeneration',
      entityId: String(job.id),
      action: AuditAction.CREATE,
      afterValue: {
        billingMonth,
        triggeredBy: 'manual',
        dryRun,
        scheduledAt: new Date().toISOString(),
      },
      changeSummary: `Manual invoice generation triggered for ${billingMonth}${dryRun ? ' (dry run)' : ''}`,
    });

    return job;
  }

  /**
   * Get schedule configuration for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns Schedule configuration
   */
  async getScheduleConfig(
    tenantId: string,
  ): Promise<TenantScheduleConfig | null> {
    // For now, return default config
    // In a full implementation, this would query a TenantSettings table
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      return null;
    }

    return {
      tenantId,
      cronExpression: DEFAULT_CRON,
      timezone: DEFAULT_TIMEZONE,
      enabled: true,
    };
  }

  /**
   * Get the next billing month in YYYY-MM format
   */
  private getNextBillingMonth(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const year = nextMonth.getFullYear();
    const month = (nextMonth.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Validate cron expression format
   * Basic validation for 5-field cron expressions
   */
  private isValidCronExpression(cron: string): boolean {
    // Simple validation: 5 space-separated fields
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return false;
    }

    // Each part should be valid (*, number, range, or list)
    const fieldPattern = /^(\*|(\d+(-\d+)?(,\d+(-\d+)?)*)|(\*\/\d+))$/;
    return parts.every((part) => fieldPattern.test(part));
  }
}
