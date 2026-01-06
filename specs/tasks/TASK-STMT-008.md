# TASK-STMT-008: Scheduled Monthly Statement Generation

## Metadata
- **Task ID**: TASK-STMT-008
- **Phase**: 12 - Account Statements
- **Layer**: logic
- **Priority**: P2-HIGH
- **Dependencies**: TASK-STMT-003, TASK-STMT-007, TASK-INFRA-011
- **Estimated Effort**: 4 hours
- **Status**: ✅ COMPLETED

## Implementation Summary

### Files Created/Modified
1. `apps/api/src/scheduler/types/scheduler.types.ts` - Added STATEMENT_GENERATION queue and StatementGenerationJobData interface
2. `apps/api/src/scheduler/processors/statement-scheduler.processor.ts` - Statement generation processor with batch processing
3. `apps/api/src/scheduler/scheduler.module.ts` - Registered queue and processor
4. `apps/api/src/scheduler/scheduler.service.ts` - Added statement queue injection
5. `apps/api/src/api/billing/statement.controller.ts` - Added POST /statements/schedule endpoint
6. `apps/api/src/api/billing/dto/statement.dto.ts` - Added scheduling DTOs
7. `apps/api/src/api/billing/billing.module.ts` - Added SchedulerModule import

### Key Features Implemented
- Batch processing (10 parents at a time)
- Progress tracking via job.progress()
- Activity filtering (invoices/payments in period)
- Balance filtering (only parents with outstanding amounts)
- Auto-finalization support
- Auto-delivery support
- Detailed error logging
- Audit logging for batch operations
- Admin notification on completion
- Optional SchedulerService injection (graceful degradation without Redis)

## Objective
Create a scheduled job to automatically generate and send monthly statements to all parents at the end of each month.

## Business Context
Creches typically send statements:
- At the end of each month (showing all activity)
- Before payment due date (reminder with balance)
- On-demand when requested

Automated monthly statements reduce admin workload and ensure consistent communication.

## Technical Requirements

### 1. Statement Schedule Processor (`apps/api/src/scheduler/processors/statement-schedule.processor.ts`)

```typescript
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('statement-schedule')
export class StatementScheduleProcessor {
  constructor(
    private readonly statementGenerationService: StatementGenerationService,
    private readonly statementDeliveryService: StatementDeliveryService,
    private readonly tenantRepo: TenantRepository,
    private readonly logger: Logger,
  ) {}

  @Process('generate-monthly-statements')
  async handleMonthlyGeneration(job: Job<MonthlyStatementJobData>): Promise<void> {
    const { tenantId, month, year, autoSend, channel } = job.data;

    this.logger.log(
      `Starting monthly statement generation for tenant ${tenantId}, ${month}/${year}`
    );

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = endOfMonth(periodStart);

    // Generate statements for all parents with activity
    const result = await this.statementGenerationService.bulkGenerateStatements({
      tenantId,
      periodStart,
      periodEnd,
      userId: 'SYSTEM',
      onlyWithActivity: true,
      onlyWithBalance: true,
    });

    this.logger.log(
      `Generated ${result.generated} statements, skipped ${result.skipped}`
    );

    // Auto-send if enabled
    if (autoSend && result.generated > 0) {
      const deliveryResult = await this.statementDeliveryService.bulkDeliverStatements({
        tenantId,
        statementIds: result.statementIds,
        channel: channel || 'email',
        userId: 'SYSTEM',
      });

      this.logger.log(
        `Sent ${deliveryResult.successful} statements, ${deliveryResult.failed} failed`
      );
    }

    // Update job with results
    await job.progress(100);
    await job.update({
      ...job.data,
      result: {
        generated: result.generated,
        skipped: result.skipped,
        sent: autoSend ? result.generated : 0,
      },
    });
  }

  @Process('tenant-statement-schedule')
  async handleTenantSchedule(job: Job<TenantScheduleJobData>): Promise<void> {
    // Check each tenant's statement schedule settings
    const tenants = await this.tenantRepo.findAllWithStatementSchedule();

    for (const tenant of tenants) {
      if (this.shouldGenerateForTenant(tenant)) {
        await this.statementQueue.add('generate-monthly-statements', {
          tenantId: tenant.id,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          autoSend: tenant.settings.autoSendStatements,
          channel: tenant.settings.preferredChannel,
        });
      }
    }
  }

  private shouldGenerateForTenant(tenant: Tenant): boolean {
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Generate on the day specified in tenant settings (default: last day of month)
    const generateDay = tenant.settings?.statementGenerationDay || 'last';

    if (generateDay === 'last') {
      return dayOfMonth === getDaysInMonth(today);
    }

    return dayOfMonth === parseInt(generateDay, 10);
  }
}

interface MonthlyStatementJobData {
  tenantId: string;
  month: number;
  year: number;
  autoSend?: boolean;
  channel?: 'email' | 'sms' | 'whatsapp';
}
```

### 2. Statement Schedule Service (`apps/api/src/database/services/statement-schedule.service.ts`)

```typescript
@Injectable()
export class StatementScheduleService {
  constructor(
    @InjectQueue('statement-schedule')
    private readonly statementQueue: Queue,
    private readonly tenantRepo: TenantRepository,
  ) {}

  /**
   * Schedule monthly statement generation for a tenant
   */
  async scheduleMonthlyGeneration(
    tenantId: string,
    config: StatementScheduleConfig
  ): Promise<void> {
    // Remove existing schedule
    await this.removeSchedule(tenantId);

    // Add new scheduled job
    await this.statementQueue.add(
      'generate-monthly-statements',
      {
        tenantId,
        autoSend: config.autoSend,
        channel: config.channel,
      },
      {
        repeat: {
          cron: this.buildCronExpression(config.dayOfMonth),
          tz: 'Africa/Johannesburg',
        },
        jobId: `statement-schedule-${tenantId}`,
      }
    );
  }

  /**
   * Manually trigger statement generation for current month
   */
  async triggerManualGeneration(
    tenantId: string,
    month?: number,
    year?: number
  ): Promise<string> {
    const now = new Date();
    const job = await this.statementQueue.add(
      'generate-monthly-statements',
      {
        tenantId,
        month: month || now.getMonth() + 1,
        year: year || now.getFullYear(),
        autoSend: false,
      },
      {
        priority: 1, // High priority for manual triggers
      }
    );

    return job.id.toString();
  }

  /**
   * Get schedule status for a tenant
   */
  async getScheduleStatus(tenantId: string): Promise<ScheduleStatus> {
    const repeatableJobs = await this.statementQueue.getRepeatableJobs();
    const tenantJob = repeatableJobs.find(j => j.id === `statement-schedule-${tenantId}`);

    if (!tenantJob) {
      return { enabled: false };
    }

    return {
      enabled: true,
      nextRun: new Date(tenantJob.next),
      cron: tenantJob.cron,
    };
  }

  private buildCronExpression(dayOfMonth: number | 'last'): string {
    if (dayOfMonth === 'last') {
      // Run on the 28th (safe for all months) at 18:00 SAST
      return '0 18 28 * *';
    }
    // Run on specific day at 18:00 SAST
    return `0 18 ${dayOfMonth} * *`;
  }
}

interface StatementScheduleConfig {
  dayOfMonth: number | 'last';
  autoSend: boolean;
  channel: 'email' | 'sms' | 'whatsapp';
}
```

### 3. Settings Integration

Add statement schedule settings to tenant settings:

```typescript
// In tenant-settings.dto.ts
export class TenantSettingsDto {
  // ... existing settings ...

  @IsOptional()
  @ValidateNested()
  @Type(() => StatementScheduleSettingsDto)
  statementSchedule?: StatementScheduleSettingsDto;
}

export class StatementScheduleSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsIn(['last', 1, 5, 10, 15, 20, 25, 28])
  dayOfMonth?: number | 'last';

  @IsBoolean()
  autoSend: boolean;

  @IsEnum(['email', 'sms', 'whatsapp'])
  channel: 'email' | 'sms' | 'whatsapp';
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/scheduler/processors/statement-schedule.processor.ts` | CREATE | BullMQ processor |
| `apps/api/src/database/services/statement-schedule.service.ts` | CREATE | Schedule service |
| `apps/api/src/database/services/statement-schedule.service.spec.ts` | CREATE | Service tests |
| `apps/api/src/scheduler/scheduler.module.ts` | MODIFY | Register processor |
| `apps/api/src/api/settings/dto/tenant-settings.dto.ts` | MODIFY | Add schedule settings |

## Acceptance Criteria

- [ ] Monthly statement job runs on configured day
- [ ] Job generates statements for all parents with activity
- [ ] Auto-send works when enabled
- [ ] Manual trigger works
- [ ] Schedule can be configured per tenant
- [ ] Jobs run in correct timezone (SAST)
- [ ] Failed jobs retry appropriately
- [ ] Job progress and results tracked
- [ ] Settings UI integration
- [ ] Unit tests with >90% coverage

## Test Cases

1. Monthly job runs on last day of month
2. Monthly job runs on specific day (e.g., 25th)
3. Auto-send emails after generation
4. Manual trigger generates immediately
5. Skip parents with no activity
6. Handle tenant with no parents
7. Job failure and retry
8. Timezone handling (SAST)
9. Concurrent tenants processing
10. Large tenant (100+ parents)
