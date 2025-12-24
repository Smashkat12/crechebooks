import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { SarsDeadlineProcessor } from './processors/sars-deadline.processor';
import { InvoiceSchedulerProcessor } from './processors/invoice-scheduler.processor';
import { PaymentReminderProcessor } from './processors/payment-reminder.processor';
import { QUEUE_NAMES } from './types/scheduler.types';
import { SarsSchedulerModule } from '../sars/sars.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    SarsSchedulerModule,
    DatabaseModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST');
        const redisPort = configService.get<number>('REDIS_PORT');
        const redisPassword = configService.get<string>('REDIS_PASSWORD');

        if (!redisHost || !redisPort) {
          throw new Error(
            'Redis configuration missing: REDIS_HOST and REDIS_PORT must be set in environment variables',
          );
        }

        return {
          redis: {
            host: redisHost,
            port: redisPort,
            password: redisPassword,
            retryStrategy: (times: number) => {
              if (times > 3) {
                throw new Error(
                  `Failed to connect to Redis after ${times} attempts. Check REDIS_HOST=${redisHost} and REDIS_PORT=${redisPort}`,
                );
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
    ),
  ],
  providers: [
    SchedulerService,
    SarsDeadlineProcessor,
    InvoiceSchedulerProcessor,
    PaymentReminderProcessor,
  ],
  exports: [SchedulerService, BullModule],
})
export class SchedulerModule {}
