/**
 * Staff Created Event Handler
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Handles the staff.created event to automatically set up new employees
 * in SimplePay when SimplePay integration is enabled.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SimplePayRepository } from '../../../database/repositories/simplepay.repository';
import { SimplePayEmployeeSetupService } from '../simplepay-employee-setup.service';

/**
 * Staff created event payload
 */
export interface StaffCreatedEvent {
  tenantId: string;
  staffId: string;
  firstName: string;
  lastName: string;
  employmentType: string;
  position: string | null;
  createdBy: string;
}

@Injectable()
export class StaffCreatedHandler {
  private readonly logger = new Logger(StaffCreatedHandler.name);

  constructor(
    private readonly simplePayRepo: SimplePayRepository,
    private readonly setupService: SimplePayEmployeeSetupService,
  ) {}

  /**
   * Handle staff.created event
   * Automatically triggers SimplePay setup if connection is active
   */
  @OnEvent('staff.created', { async: true })
  async handleStaffCreated(event: StaffCreatedEvent): Promise<void> {
    this.logger.log(
      `Received staff.created event for ${event.firstName} ${event.lastName} (${event.staffId})`,
    );

    try {
      // Check if SimplePay connection exists and is active
      const connection = await this.simplePayRepo.findConnection(
        event.tenantId,
      );

      if (!connection) {
        this.logger.debug(
          `No SimplePay connection for tenant ${event.tenantId}, skipping auto-setup`,
        );
        return;
      }

      if (!connection.isActive) {
        this.logger.debug(
          `SimplePay connection inactive for tenant ${event.tenantId}, skipping auto-setup`,
        );
        return;
      }

      this.logger.log(
        `Auto-triggering SimplePay setup for staff ${event.staffId}`,
      );

      // Trigger comprehensive setup
      const result = await this.setupService.setupEmployeeComprehensive(
        event.tenantId,
        {
          staffId: event.staffId,
          triggeredBy: `auto:staff.created:${event.createdBy}`,
        },
      );

      if (result.success) {
        this.logger.log(
          `Successfully set up SimplePay employee for staff ${event.staffId}: ` +
            `simplePayId=${result.simplePayEmployeeId}, profile=${result.profileAssigned}`,
        );
      } else {
        this.logger.warn(
          `SimplePay setup partially completed for staff ${event.staffId}: ` +
            `${result.stepsCompleted}/${result.stepsCompleted + result.stepsFailed} steps completed, ` +
            `errors: ${result.errors.map((e) => e.message).join('; ')}`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to auto-setup SimplePay for staff ${event.staffId}: ${errorMessage}`,
      );
      // Don't throw - we don't want to break staff creation if SimplePay setup fails
    }
  }

  /**
   * Handle employee.setup.completed event for logging/notification
   */
  @OnEvent('employee.setup.completed', { async: true })
  handleSetupCompleted(event: {
    tenantId: string;
    staffId: string;
    simplePayEmployeeId: string | null;
    profileAssigned: string | null;
    setupLogId: string;
    triggeredBy: string;
  }): void {
    this.logger.log(
      `Employee setup completed: staffId=${event.staffId}, ` +
        `simplePayId=${event.simplePayEmployeeId}, profile=${event.profileAssigned}`,
    );

    // TODO: Could send notification to admin here
    // Could integrate with notification service
  }

  /**
   * Handle employee.setup.failed event for alerting
   */
  @OnEvent('employee.setup.failed', { async: true })
  handleSetupFailed(event: {
    tenantId: string;
    staffId: string;
    setupLogId: string;
    triggeredBy: string;
    errors: Array<{ step: string; code: string; message: string }>;
  }): void {
    this.logger.warn(
      `Employee setup failed: staffId=${event.staffId}, ` +
        `errors: ${event.errors.map((e) => `${e.step}: ${e.message}`).join('; ')}`,
    );

    // TODO: Could send alert to admin here
    // Could integrate with notification service
  }
}
