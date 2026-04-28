import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SarsDeadlineProcessor } from './processors/sars-deadline.processor';
import { InvoiceSchedulerProcessor } from './processors/invoice-scheduler.processor';
import { PaymentReminderProcessor } from './processors/payment-reminder.processor';
import { StatementSchedulerProcessor } from './processors/statement-scheduler.processor';
import { XeroSyncRecoveryProcessor } from './processors/xero-sync-recovery.processor';
import { ArrearsReminderJob } from '../jobs/arrears-reminder.job';
import { StaffInvitationCleanupJob } from '../jobs/staff-invitation-cleanup.job';
import { PaymentAttachmentJanitorJob } from '../jobs/payment-attachment-janitor.job';
import { StaffModule } from '../api/staff/staff.module';
import { StorageModule } from '../integrations/storage/storage.module';
import { InvoiceScheduleService } from '../billing/invoice-schedule.service';
import { PaymentReminderService } from '../billing/payment-reminder.service';
import { QUEUE_NAMES } from './types/scheduler.types';
import { SarsSchedulerModule } from '../sars/sars.module';
import { DatabaseModule } from '../database/database.module';
import { CircuitBreakerModule } from '../integrations/circuit-breaker';
import { EmailModule } from '../integrations/email/email.module';

const logger = new Logger('SchedulerModule');

// Check if Redis is configured before registering Bull modules
const isRedisConfigured = (): boolean => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

// Conditionally create Bull imports
const bullImports = isRedisConfigured()
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const redisHost = configService.get<string>('REDIS_HOST');
          const redisPort = configService.get<number>('REDIS_PORT');
          const redisPassword = configService.get<string>('REDIS_PASSWORD');

          logger.log(`Connecting to Redis at ${redisHost}:${redisPort}`);

          return {
            redis: {
              host: redisHost,
              port: redisPort,
              password: redisPassword,
              retryStrategy: (times: number) => {
                if (times > 3) {
                  logger.error(
                    `Failed to connect to Redis after ${times} attempts`,
                  );
                  return null; // Stop retrying
                }
                return Math.min(times * 1000, 3000);
              },
            },
            defaultJobOptions: {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 1000,
              },
              removeOnComplete: 100,
              removeOnFail: false,
            },
          };
        },
        inject: [ConfigService],
      }),
      BullModule.registerQueue(
        {
          name: QUEUE_NAMES.INVOICE_GENERATION,
        },
        {
          name: QUEUE_NAMES.PAYMENT_REMINDER,
        },
        {
          name: QUEUE_NAMES.SARS_DEADLINE,
        },
        {
          name: QUEUE_NAMES.BANK_SYNC,
        },
        {
          name: QUEUE_NAMES.STATEMENT_GENERATION,
        },
      ),
    ]
  : [];

// Log Redis status at module load time
if (!isRedisConfigured()) {
  logger.warn(
    'Redis not configured (REDIS_HOST/REDIS_PORT missing). Scheduler queues disabled. Set REDIS_HOST and REDIS_PORT to enable.',
  );
}

// Conditionally create providers - only register scheduler services when Redis is available
const schedulerProviders = isRedisConfigured()
  ? [
      SchedulerService,
      SarsDeadlineProcessor,
      InvoiceSchedulerProcessor,
      PaymentReminderProcessor,
      StatementSchedulerProcessor,
    ]
  : [];

// TASK-REL-101: XeroSyncRecoveryProcessor uses @nestjs/schedule, not Bull
// TASK-FEAT-102: ArrearsReminderJob uses @nestjs/schedule for daily reminders
// TASK-STAFF-INVITE-001: StaffInvitationCleanupJob — daily 03:00 SAST invite expiry
// PaymentAttachmentJanitorJob — daily 03:00 SAST orphan PENDING attachment purge (60d)
// Always register them as they use NestJS cron scheduling
const cronProviders = [
  XeroSyncRecoveryProcessor,
  ArrearsReminderJob,
  StaffInvitationCleanupJob,
  PaymentAttachmentJanitorJob,
];

// TASK-BILL-016 / TASK-PAY-015: tenant-customisable scheduling services.
// Dissolved from BillingSchedulerModule (which was never wired into the app graph)
// to avoid a redundant module shell. DatabaseModule (already imported above) provides
// PrismaService + AuditLogService; SchedulerService is in schedulerProviders.
// These are not yet called by any controller; they are preserved for future wiring.
// Guard behind isRedisConfigured() because both services inject SchedulerService,
// which is only provided when Bull queues are available.
const billingSchedulingProviders = isRedisConfigured()
  ? [InvoiceScheduleService, PaymentReminderService]
  : [];

@Module({
  imports: [
    SarsSchedulerModule,
    DatabaseModule,
    CircuitBreakerModule,
    EmailModule, // TASK-BILL-013: Email service for arrears reminders
    StaffModule, // TASK-STAFF-INVITE-001: Provides StaffInvitationService for cleanup job
    StorageModule, // PaymentAttachmentJanitorJob: provides StorageService for S3 deletes
    ScheduleModule.forRoot(), // TASK-REL-101: Enable cron scheduling
    ...bullImports,
  ],
  providers: [
    ...schedulerProviders,
    ...cronProviders,
    ...billingSchedulingProviders,
  ],
  exports: [
    ...(isRedisConfigured()
      ? [
          SchedulerService,
          BullModule,
          InvoiceScheduleService, // TASK-BILL-016: Available for future controller wiring
          PaymentReminderService, // TASK-PAY-015: Available for future controller wiring
        ]
      : []),
    XeroSyncRecoveryProcessor, // TASK-REL-101: Export for manual triggering
    ArrearsReminderJob, // TASK-FEAT-102: Export for manual triggering
    StaffInvitationCleanupJob, // TASK-STAFF-INVITE-001: Export for manual triggering
    PaymentAttachmentJanitorJob, // Export for manual triggering if needed
  ],
})
export class SchedulerModule {}
