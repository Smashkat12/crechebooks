/**
 * SimplePay Service Period Service
 * TASK-SPAY-004: SimplePay Service Period Management
 *
 * Handles service period synchronization, termination processing,
 * and reinstatement operations with SimplePay API.
 *
 * South African UI-19 Termination Codes are mapped to SimplePay codes "1"-"9".
 */

import { Injectable, Logger } from '@nestjs/common';
import { TerminationCode } from '@prisma/client';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { ServicePeriodSyncRepository } from '../../database/repositories/service-period-sync.repository';
import { StaffRepository } from '../../database/repositories/staff.repository';
import {
  SimplePayServicePeriod,
  ServicePeriod,
  TerminationResult,
  ReinstatementResult,
  TERMINATION_CODE_MAP,
  SIMPLEPAY_CODE_MAP,
  UIF_ELIGIBILITY,
  parseSimplePayServicePeriod,
  terminationCodeToSimplePayCode,
  simplePayCodeToTerminationCode,
} from '../../database/entities/service-period.entity';
import {
  TerminateEmployeeDto,
  ReinstateEmployeeDto,
  ServicePeriodFilterDto,
  ServicePeriodResponseDto,
  mapServicePeriodToResponseDto,
} from '../../database/dto/service-period.dto';
import { NotFoundException, ConflictException } from '../../shared/exceptions';

/**
 * SimplePay API service period wrapper structure
 * SimplePay returns wrapped responses like [{ service_period: {...} }]
 */
interface ServicePeriodWrapper {
  service_period: SimplePayServicePeriod;
}

/**
 * SimplePay API termination request format
 */
interface SimplePayTerminationRequest {
  termination_date: string;
  termination_reason: string;
  last_working_day: string;
  final_pay?: boolean;
}

@Injectable()
export class SimplePayServicePeriodService {
  private readonly logger = new Logger(SimplePayServicePeriodService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly servicePeriodRepo: ServicePeriodSyncRepository,
    private readonly staffRepo: StaffRepository,
  ) {}

  /**
   * Format date for SimplePay API (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get all service periods for an employee from SimplePay
   */
  async getServicePeriods(
    tenantId: string,
    staffId: string,
  ): Promise<ServicePeriod[]> {
    this.logger.log(`Fetching service periods for staff ${staffId}`);

    await this.apiClient.initializeForTenant(tenantId);

    // Get SimplePay employee ID from mapping
    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('SimplePayEmployeeMapping', staffId);
    }

    try {
      // SimplePay returns wrapped responses: [{ service_period: {...} }, ...]
      const response = await this.apiClient.get<ServicePeriodWrapper[]>(
        `/employees/${mapping.simplePayEmployeeId}/service_periods`,
      );

      // Handle potential response formats
      const periods = Array.isArray(response)
        ? response.map((w) =>
            w.service_period
              ? parseSimplePayServicePeriod(w.service_period)
              : parseSimplePayServicePeriod(
                  w as unknown as SimplePayServicePeriod,
                ),
          )
        : [];

      this.logger.debug(
        `Found ${periods.length} service periods for employee ${mapping.simplePayEmployeeId}`,
      );

      return periods;
    } catch (error) {
      this.logger.error(
        `Failed to fetch service periods for staff ${staffId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Get the current (active) service period for an employee
   */
  async getCurrentServicePeriod(
    tenantId: string,
    staffId: string,
  ): Promise<ServicePeriod | null> {
    const periods = await this.getServicePeriods(tenantId, staffId);
    return periods.find((p) => p.isActive) || null;
  }

  /**
   * Terminate an employee in SimplePay
   * Maps our TerminationCode to SimplePay's string code ("1"-"9")
   */
  async terminateEmployee(
    tenantId: string,
    dto: TerminateEmployeeDto,
  ): Promise<TerminationResult> {
    this.logger.log(
      `Terminating employee ${dto.staffId} with code ${dto.terminationCode}`,
    );

    await this.apiClient.initializeForTenant(tenantId);

    // Validate staff exists
    const staff = await this.staffRepo.findById(dto.staffId, tenantId);
    if (!staff) {
      return {
        success: false,
        servicePeriodId: null,
        simplePayEmployeeId: '',
        terminationCode: dto.terminationCode,
        lastWorkingDay: dto.lastWorkingDay,
        endDate: dto.endDate,
        finalPayslipId: null,
        uifEligible: UIF_ELIGIBILITY[dto.terminationCode].eligible,
        uifWaitingPeriod: UIF_ELIGIBILITY[dto.terminationCode].waitingPeriod,
        error: `Staff ${dto.staffId} not found`,
      };
    }

    // Get SimplePay employee mapping
    const mapping = await this.simplePayRepo.findEmployeeMapping(dto.staffId);
    if (!mapping) {
      return {
        success: false,
        servicePeriodId: null,
        simplePayEmployeeId: '',
        terminationCode: dto.terminationCode,
        lastWorkingDay: dto.lastWorkingDay,
        endDate: dto.endDate,
        finalPayslipId: null,
        uifEligible: UIF_ELIGIBILITY[dto.terminationCode].eligible,
        uifWaitingPeriod: UIF_ELIGIBILITY[dto.terminationCode].waitingPeriod,
        error: `Staff ${dto.staffId} is not linked to SimplePay`,
      };
    }

    try {
      // Convert our termination code to SimplePay's code string
      const simplePayCode = terminationCodeToSimplePayCode(dto.terminationCode);

      // Build termination request for SimplePay API
      const terminationRequest: SimplePayTerminationRequest = {
        termination_date: this.formatDate(dto.endDate),
        termination_reason: simplePayCode || '1', // SimplePay expects the code as termination_reason
        last_working_day: this.formatDate(dto.lastWorkingDay),
        final_pay: dto.generateFinalPayslip !== false,
      };

      // Call SimplePay API to terminate employee
      // SimplePay may return the updated employee or service period
      await this.apiClient.patch<unknown>(
        `/employees/${mapping.simplePayEmployeeId}`,
        {
          employee: {
            termination_date: terminationRequest.termination_date,
          },
        },
      );

      this.logger.log(
        `Successfully terminated employee ${mapping.simplePayEmployeeId} in SimplePay`,
      );

      // Get the current service period to update locally
      let servicePeriodId: string | null = null;
      const finalPayslipId: string | null = null;

      // Check for existing active service period sync
      const activeSync = await this.servicePeriodRepo.findActiveByStaff(
        tenantId,
        dto.staffId,
      );

      if (activeSync) {
        // Update existing service period sync
        await this.servicePeriodRepo.markTerminated(
          activeSync.id,
          dto.terminationCode,
          dto.endDate,
          dto.lastWorkingDay,
          dto.terminationReason || null,
          null, // finalPayslipId will be set when payslip is generated
        );
        servicePeriodId = activeSync.id;
      } else {
        // Create new service period sync record for tracking
        const newSync = await this.servicePeriodRepo.create({
          tenantId,
          staffId: dto.staffId,
          simplePayEmployeeId: mapping.simplePayEmployeeId,
          simplePayPeriodId: `term_${Date.now()}`, // Generate unique ID for termination record
          startDate: staff.startDate,
          endDate: dto.endDate,
          terminationCode: dto.terminationCode,
          terminationReason: dto.terminationReason,
          lastWorkingDay: dto.lastWorkingDay,
          isActive: false,
        });
        servicePeriodId = newSync.id;
      }

      // Deactivate staff record with end date
      await this.staffRepo.deactivate(dto.staffId, tenantId, dto.endDate);

      const uifInfo = UIF_ELIGIBILITY[dto.terminationCode];

      return {
        success: true,
        servicePeriodId,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        terminationCode: dto.terminationCode,
        lastWorkingDay: dto.lastWorkingDay,
        endDate: dto.endDate,
        finalPayslipId,
        uifEligible: uifInfo.eligible,
        uifWaitingPeriod: uifInfo.waitingPeriod,
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to terminate employee ${dto.staffId}: ${errorMessage}`,
      );

      return {
        success: false,
        servicePeriodId: null,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        terminationCode: dto.terminationCode,
        lastWorkingDay: dto.lastWorkingDay,
        endDate: dto.endDate,
        finalPayslipId: null,
        uifEligible: UIF_ELIGIBILITY[dto.terminationCode].eligible,
        uifWaitingPeriod: UIF_ELIGIBILITY[dto.terminationCode].waitingPeriod,
        error: errorMessage,
      };
    }
  }

  /**
   * Reinstate a terminated employee in SimplePay
   * Creates a new service period starting from the effective date
   */
  async reinstateEmployee(
    tenantId: string,
    dto: ReinstateEmployeeDto,
  ): Promise<ReinstatementResult> {
    this.logger.log(`Reinstating employee ${dto.staffId}`);

    await this.apiClient.initializeForTenant(tenantId);

    // Validate staff exists
    const staff = await this.staffRepo.findById(dto.staffId, tenantId);
    if (!staff) {
      return {
        success: false,
        servicePeriodId: null,
        simplePayEmployeeId: '',
        newServicePeriodId: null,
        startDate: dto.effectiveDate,
        error: `Staff ${dto.staffId} not found`,
      };
    }

    // Get SimplePay employee mapping
    const mapping = await this.simplePayRepo.findEmployeeMapping(dto.staffId);
    if (!mapping) {
      return {
        success: false,
        servicePeriodId: null,
        simplePayEmployeeId: '',
        newServicePeriodId: null,
        startDate: dto.effectiveDate,
        error: `Staff ${dto.staffId} is not linked to SimplePay`,
      };
    }

    try {
      // Clear termination date in SimplePay to reinstate
      await this.apiClient.patch<unknown>(
        `/employees/${mapping.simplePayEmployeeId}`,
        {
          employee: {
            termination_date: null,
          },
        },
      );

      this.logger.log(
        `Successfully reinstated employee ${mapping.simplePayEmployeeId} in SimplePay`,
      );

      // Create new service period sync record
      const newSync = await this.servicePeriodRepo.create({
        tenantId,
        staffId: dto.staffId,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        simplePayPeriodId: `reinstate_${Date.now()}`,
        startDate: dto.effectiveDate,
        isActive: true,
      });

      // Update staff record start date if not preserving history
      if (dto.preserveHistory === false) {
        await this.staffRepo.update(dto.staffId, tenantId, {
          startDate: dto.effectiveDate,
        });
      }
      // Note: Reactivating staff isActive flag requires adding reactivate() to staffRepo

      return {
        success: true,
        servicePeriodId: newSync.id,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        newServicePeriodId: newSync.id,
        startDate: dto.effectiveDate,
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to reinstate employee ${dto.staffId}: ${errorMessage}`,
      );

      return {
        success: false,
        servicePeriodId: null,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        newServicePeriodId: null,
        startDate: dto.effectiveDate,
        error: errorMessage,
      };
    }
  }

  /**
   * Undo a termination (only if final pay has not been processed)
   */
  async undoTermination(
    tenantId: string,
    staffId: string,
    reason?: string,
  ): Promise<{
    success: boolean;
    message: string | null;
    error: string | null;
  }> {
    this.logger.log(`Undoing termination for staff ${staffId}`);

    // Find the active (terminated) service period
    const activeSync = await this.servicePeriodRepo.findActiveByStaff(
      tenantId,
      staffId,
    );

    // Also check for recently terminated periods
    const allSyncs = await this.servicePeriodRepo.findByStaff(
      tenantId,
      staffId,
    );
    const terminatedSync = allSyncs.find(
      (s) => !s.isActive && s.terminationCode !== null,
    );

    const syncToUndo = activeSync || terminatedSync;

    if (!syncToUndo) {
      return {
        success: false,
        message: null,
        error: 'No termination record found to undo',
      };
    }

    // Check if final payslip has been processed
    if (syncToUndo.finalPayslipId) {
      return {
        success: false,
        message: null,
        error:
          'Cannot undo termination - final payslip has already been processed',
      };
    }

    try {
      // Undo in repository (clears termination fields)
      await this.servicePeriodRepo.undoTermination(syncToUndo.id, tenantId);

      // Get SimplePay mapping and clear termination in SimplePay
      const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
      if (mapping) {
        await this.apiClient.initializeForTenant(tenantId);
        await this.apiClient.patch<unknown>(
          `/employees/${mapping.simplePayEmployeeId}`,
          {
            employee: {
              termination_date: null,
            },
          },
        );
      }

      // Note: Staff reactivation would require a reactivate method in staffRepo
      // For now, we only update the service period sync record

      this.logger.log(`Successfully undid termination for staff ${staffId}`);

      return {
        success: true,
        message: `Termination undone${reason ? `: ${reason}` : ''}`,
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to undo termination for staff ${staffId}: ${errorMessage}`,
      );

      return {
        success: false,
        message: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Sync service periods from SimplePay to local database
   */
  async syncServicePeriods(
    tenantId: string,
    staffId: string,
  ): Promise<{ synced: number; errors: string[] }> {
    this.logger.log(`Syncing service periods for staff ${staffId}`);

    const errors: string[] = [];
    let synced = 0;

    try {
      const periods = await this.getServicePeriods(tenantId, staffId);
      const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);

      if (!mapping) {
        return { synced: 0, errors: ['Staff not linked to SimplePay'] };
      }

      for (const period of periods) {
        try {
          await this.servicePeriodRepo.upsert({
            tenantId,
            staffId,
            simplePayEmployeeId: mapping.simplePayEmployeeId,
            simplePayPeriodId: period.id,
            startDate: period.startDate,
            endDate: period.endDate,
            terminationCode: period.terminationCode,
            terminationReason: period.terminationReason,
            lastWorkingDay: period.lastWorkingDay,
            isActive: period.isActive,
          });
          synced++;
        } catch (error) {
          errors.push(
            `Failed to sync period ${period.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      this.logger.log(
        `Synced ${synced} service periods for staff ${staffId}, ${errors.length} errors`,
      );
    } catch (error) {
      errors.push(
        `Failed to fetch service periods: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    return { synced, errors };
  }

  /**
   * Get service period syncs from local database
   */
  async getLocalServicePeriods(
    tenantId: string,
    filter?: ServicePeriodFilterDto,
  ): Promise<{ data: ServicePeriodResponseDto[]; total: number }> {
    const [syncs, total] = await Promise.all([
      this.servicePeriodRepo.findByTenant(tenantId, filter),
      this.servicePeriodRepo.countByTenant(tenantId, filter),
    ]);

    return {
      data: syncs.map(mapServicePeriodToResponseDto),
      total,
    };
  }

  /**
   * Get terminated employees in a date range for UI-19 reporting
   */
  async getTerminatedEmployeesForPeriod(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ServicePeriodResponseDto[]> {
    const syncs = await this.servicePeriodRepo.findTerminatedByPeriod(
      tenantId,
      startDate,
      endDate,
    );
    return syncs.map(mapServicePeriodToResponseDto);
  }

  /**
   * Get all termination codes with descriptions and UIF eligibility
   */
  getAllTerminationCodes(): Array<{
    code: TerminationCode;
    simplePayCode: string;
    description: string;
    uifEligible: boolean;
    uifWaitingPeriod: boolean;
    uifNotes: string;
  }> {
    return (Object.keys(TERMINATION_CODE_MAP) as TerminationCode[]).map(
      (code) => ({
        code,
        simplePayCode: TERMINATION_CODE_MAP[code],
        description: this.getTerminationCodeDescription(code),
        uifEligible: UIF_ELIGIBILITY[code].eligible,
        uifWaitingPeriod: UIF_ELIGIBILITY[code].waitingPeriod,
        uifNotes: UIF_ELIGIBILITY[code].notes,
      }),
    );
  }

  /**
   * Get human-readable description for termination code
   */
  private getTerminationCodeDescription(code: TerminationCode): string {
    const descriptions: Record<TerminationCode, string> = {
      RESIGNATION: 'Resignation - Employee voluntary termination',
      DISMISSAL_MISCONDUCT: 'Dismissal - Misconduct',
      DISMISSAL_INCAPACITY: 'Dismissal - Incapacity (illness/disability)',
      RETRENCHMENT: 'Retrenchment - Operational requirements',
      CONTRACT_EXPIRY: 'Contract Expiry - Fixed-term contract ended',
      RETIREMENT: 'Retirement',
      DEATH: 'Death of employee',
      ABSCONDED: 'Absconded - Employee abandoned position',
      TRANSFER: 'Transfer to another employer',
    };
    return descriptions[code];
  }
}
