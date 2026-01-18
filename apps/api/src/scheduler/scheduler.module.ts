import { Module, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { SarsDeadlineProcessor } from './processors/sars-deadline.processor';
import { InvoiceSchedulerProcessor } from './processors/invoice-scheduler.processor';
import { PaymentReminderProcessor } from './processors/payment-reminder.processor';
import { StatementSchedulerProcessor } from './processors/statement-scheduler.processor';
import { QUEUE_NAMES } from './types/scheduler.types';
import { SarsSchedulerModule } from '../sars/sars.module';
import { DatabaseModule } from '../database/database.module';
import { ReminderTemplateService } from '../billing/reminder-template.service';

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
        useFactory: async (configService: ConfigService) => {
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

@Module({
  imports: [SarsSchedulerModule, DatabaseModule, ...bullImports],
  providers: [...schedulerProviders, ReminderTemplateService],
  exports: [...(isRedisConfigured() ? [SchedulerService, BullModule] : [])],
})
export class SchedulerModule {}
