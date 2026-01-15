/**
 * SimplePay Integration Module
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 * TASK-SPAY-001: SimplePay Leave Management
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 * TASK-SPAY-004: SimplePay Service Period Management
 * TASK-SPAY-006: SimplePay Profile Mapping Management
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 * TASK-STAFF-003 / TASK-STAFF-010: SimplePay Sync Retry Queue
 */

import { Module, forwardRef, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '../../database/database.module';
import { SharedModule } from '../../shared/shared.module';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayConnectionService } from './simplepay-connection.service';
import { SimplePayEmployeeService } from './simplepay-employee.service';
import { SimplePayPayslipService } from './simplepay-payslip.service';
import { SimplePayTaxService } from './simplepay-tax.service';
import { SimplePayLeaveService } from './simplepay-leave.service';
import { SimplePayPayRunService } from './simplepay-payrun.service';
import { SimplePayCalculationsService } from './simplepay-calculations.service';
import { SimplePayServicePeriodService } from './simplepay-service-period.service';
import { SimplePayReportsService } from './simplepay-reports.service';
import { SimplePayProfileService } from './simplepay-profile.service';
import { SimplePayBulkService } from './simplepay-bulk.service';
import { SimplePayEmployeeSetupService } from './simplepay-employee-setup.service';
import { PayRunSyncRepository } from '../../database/repositories/payrun-sync.repository';
import { CalculationCacheRepository } from '../../database/repositories/calculation-cache.repository';
import { PayrollAdjustmentRepository } from '../../database/repositories/payroll-adjustment.repository';
import { ServicePeriodSyncRepository } from '../../database/repositories/service-period-sync.repository';
import { ReportRequestRepository } from '../../database/repositories/report-request.repository';
import { ProfileMappingSyncRepository } from '../../database/repositories/profile-mapping-sync.repository';
import { BulkOperationLogRepository } from '../../database/repositories/bulk-operation-log.repository';
import { EmployeeSetupLogRepository } from '../../database/repositories/employee-setup-log.repository';
// Setup Pipeline
import { SetupPipeline } from './setup-pipeline/setup-pipeline';
import { ProfileSelector } from './setup-pipeline/profile-selector';
import { LeaveCalculator } from './setup-pipeline/leave-calculator';
import { CreateEmployeeStep } from './setup-pipeline/steps/create-employee.step';
import { AssignProfileStep } from './setup-pipeline/steps/assign-profile.step';
import { SetupLeaveStep } from './setup-pipeline/steps/setup-leave.step';
import { ConfigureTaxStep } from './setup-pipeline/steps/configure-tax.step';
import { AddCalculationsStep } from './setup-pipeline/steps/add-calculations.step';
import { VerifySetupStep } from './setup-pipeline/steps/verify-setup.step';
import { SendNotificationStep } from './setup-pipeline/steps/send-notification.step';
// Event Handlers
import { StaffCreatedHandler } from './handlers/staff-created.handler';
// Sync Queue (TASK-STAFF-003 / TASK-STAFF-010)
import {
  SimplePaySyncProcessor,
  SIMPLEPAY_SYNC_QUEUE,
} from './simplepay-sync.processor';
import { SimplePaySyncService } from './simplepay-sync.service';

const logger = new Logger('SimplePayModule');

// Check if Redis is configured before registering Bull modules
const isRedisConfigured = (): boolean => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

// Conditionally create Bull imports for SimplePay sync queue
const bullImports = isRedisConfigured()
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
          const redisHost = configService.get<string>('REDIS_HOST');
          const redisPort = configService.get<number>('REDIS_PORT');
          const redisPassword = configService.get<string>('REDIS_PASSWORD');

          logger.log(
            `SimplePay sync queue connecting to Redis at ${redisHost}:${redisPort}`,
          );

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
          };
        },
        inject: [ConfigService],
      }),
      BullModule.registerQueue({
        name: SIMPLEPAY_SYNC_QUEUE,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000, // 2s -> 4s -> 8s -> 16s -> 32s
          },
          removeOnComplete: 100,
          removeOnFail: false,
        },
      }),
    ]
  : [];

// Log Redis status at module load time
if (!isRedisConfigured()) {
  logger.warn(
    'Redis not configured (REDIS_HOST/REDIS_PORT missing). SimplePay sync queue disabled. Set REDIS_HOST and REDIS_PORT to enable.',
  );
}

// Conditionally add sync queue providers
const syncQueueProviders = isRedisConfigured()
  ? [SimplePaySyncProcessor, SimplePaySyncService]
  : [];

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DatabaseModule), // Use forwardRef to break circular dependency with DatabaseModule
    SharedModule,
    EventEmitterModule.forRoot(),
    ...bullImports,
  ],
  providers: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,
    SimplePayPayRunService,
    SimplePayCalculationsService,
    SimplePayServicePeriodService,
    SimplePayReportsService,
    SimplePayProfileService,
    SimplePayBulkService,
    SimplePayEmployeeSetupService,
    PayRunSyncRepository,
    CalculationCacheRepository,
    PayrollAdjustmentRepository,
    ServicePeriodSyncRepository,
    ReportRequestRepository,
    ProfileMappingSyncRepository,
    BulkOperationLogRepository,
    EmployeeSetupLogRepository,
    // Setup Pipeline
    SetupPipeline,
    ProfileSelector,
    LeaveCalculator,
    CreateEmployeeStep,
    AssignProfileStep,
    SetupLeaveStep,
    ConfigureTaxStep,
    AddCalculationsStep,
    VerifySetupStep,
    SendNotificationStep,
    // Event Handlers
    StaffCreatedHandler,
    // Sync Queue Providers (conditional)
    ...syncQueueProviders,
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,
    SimplePayPayRunService,
    SimplePayCalculationsService,
    SimplePayServicePeriodService,
    SimplePayReportsService,
    SimplePayProfileService,
    SimplePayBulkService,
    SimplePayEmployeeSetupService,
    PayRunSyncRepository,
    CalculationCacheRepository,
    PayrollAdjustmentRepository,
    ServicePeriodSyncRepository,
    ReportRequestRepository,
    ProfileMappingSyncRepository,
    BulkOperationLogRepository,
    EmployeeSetupLogRepository,
    // Setup Pipeline
    SetupPipeline,
    ProfileSelector,
    LeaveCalculator,
    // Sync Queue Service (conditional)
    ...(isRedisConfigured() ? [SimplePaySyncService] : []),
  ],
})
export class SimplePayModule {}
