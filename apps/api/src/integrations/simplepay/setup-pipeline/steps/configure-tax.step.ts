/**
 * Configure Tax Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Configures tax information in SimplePay for the employee.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { SimplePayApiClient } from '../../simplepay-api.client';

/**
 * SimplePay tax info structure
 */
interface SimplePayTaxInfo {
  tax_number?: string;
  tax_status?: string; // 'A' = Normal, 'B' = Directive, 'C' = Seasonal
  director_indicator?: boolean;
  voluntary_over_deduction?: number;
  nature_of_person?: string; // 'A' = Individual, 'B' = Company, etc.
}

@Injectable()
export class ConfigureTaxStep implements IPipelineStep {
  readonly name = PipelineStep.CONFIGURE_TAX;
  readonly description = 'Configure tax information';

  private readonly logger = new Logger(ConfigureTaxStep.name);

  constructor(private readonly apiClient: SimplePayApiClient) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Configuring tax for staff ${context.staffId}`);

    if (!context.simplePayEmployeeId) {
      context.errors.push({
        step: this.name,
        code: 'NO_SIMPLEPAY_EMPLOYEE',
        message: 'SimplePay employee ID not available',
        details: {},
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    try {
      // Use provided tax settings or extract from staff data
      const taxSettings = context.taxSettings || {
        taxNumber: context.staff.taxNumber,
        taxStatus: 'RESIDENT',
        directorIndicator: false,
      };

      // Map to SimplePay tax info format
      const taxInfo: SimplePayTaxInfo = {};
      let hasUpdates = false;

      if (taxSettings.taxNumber) {
        taxInfo.tax_number = taxSettings.taxNumber;
        hasUpdates = true;
      }

      if (taxSettings.taxStatus) {
        taxInfo.tax_status = this.mapTaxStatus(taxSettings.taxStatus);
        hasUpdates = true;
      }

      if (taxSettings.directorIndicator !== undefined) {
        taxInfo.director_indicator = taxSettings.directorIndicator;
        hasUpdates = true;
      }

      // Default nature of person to individual
      taxInfo.nature_of_person = 'A';

      if (!hasUpdates) {
        // No tax info to configure
        const stepResult = context.stepResults.find(
          (s) => s.step === this.name,
        );
        if (stepResult) {
          stepResult.details = {
            message: 'No tax information provided, skipping configuration',
          };
        }
        context.warnings.push({
          step: this.name,
          code: 'NO_TAX_INFO',
          message: 'No tax information provided for employee',
          details: {},
          timestamp: new Date().toISOString(),
        });
        return true; // Not a failure, just nothing to do
      }

      // Initialize API client
      await this.apiClient.initializeForTenant(context.tenantId);

      // Update employee with tax info
      // Note: Tax info is typically part of the employee record in SimplePay
      await this.apiClient.patch(`/employees/${context.simplePayEmployeeId}`, {
        employee: taxInfo,
      });

      // Update context
      context.taxSettings = taxSettings;

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          taxNumber: taxSettings.taxNumber
            ? '***' + taxSettings.taxNumber.slice(-4)
            : null,
          taxStatus: taxSettings.taxStatus,
          directorIndicator: taxSettings.directorIndicator,
        };
        stepResult.canRollback = false; // Tax config can be updated but not easily rolled back
      }

      this.logger.log(
        `Successfully configured tax for staff ${context.staffId}`,
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to configure tax: ${errorMessage}`);

      context.errors.push({
        step: this.name,
        code: 'CONFIGURE_TAX_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  /**
   * Map our tax status to SimplePay format
   */
  private mapTaxStatus(status: string): string {
    const normalized = status.toUpperCase();
    switch (normalized) {
      case 'RESIDENT':
      case 'NORMAL':
        return 'A'; // Normal
      case 'DIRECTIVE':
        return 'B'; // Directive
      case 'SEASONAL':
        return 'C'; // Seasonal worker
      case 'NON_RESIDENT':
        return 'D'; // Non-resident
      default:
        return 'A'; // Default to normal
    }
  }

  shouldSkip(context: SetupPipelineContext): boolean {
    // Skip if no tax number and no tax settings provided
    return !context.staff.taxNumber && !context.taxSettings;
  }
}
