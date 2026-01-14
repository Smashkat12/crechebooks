/**
 * SimplePay Integration Module
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 * TASK-SPAY-001: SimplePay Leave Management
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 * TASK-SPAY-004: SimplePay Service Period Management
 * TASK-SPAY-006: SimplePay Profile Mapping Management
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DatabaseModule), // Use forwardRef to break circular dependency with DatabaseModule
    SharedModule,
    EventEmitterModule.forRoot(),
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
  ],
})
export class SimplePayModule {}
