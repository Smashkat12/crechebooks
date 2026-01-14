/**
 * SimplePay Employee Service
 * Syncs CrecheBooks staff to SimplePay employees
 *
 * TASK-STAFF-004: SimplePay Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayConnectionService } from './simplepay-connection.service';
import {
  SimplePayEmployee,
  SyncResult,
  SyncComparison,
  ISimplePayEmployeeMapping,
} from '../../database/entities/simplepay.entity';
import { SimplePaySyncStatus } from '@prisma/client';

interface SimplePayEmployeeInput {
  wave_id: number; // Required: Pay frequency ID from SimplePay
  first_name: string;
  last_name: string;
  birthdate: string; // Format: YYYY-MM-DD
  appointment_date: string; // Format: YYYY-MM-DD
  identification_type: string; // Required: 'rsa_id', 'passport', 'asylum_seeker', 'refugee', 'none'
  id_number?: string; // Required if identification_type is 'rsa_id' or 'refugee'
  other_number?: string; // Required if identification_type is 'passport' or 'asylum_seeker'
  passport_code?: string; // Required if identification_type is 'passport'
  payment_method: string; // Required: 'cash', 'cheque', 'eft_manual'
  tax_number?: string;
  email?: string;
  mobile?: string;
  termination_date?: string;
  number?: string; // Employee number
  job_title?: string;
  bank_account?: {
    bank_id: number;
    account_number: string;
    branch_code: string;
    account_type: string;
    holder_relationship: string;
  };
}

@Injectable()
export class SimplePayEmployeeService {
  private readonly logger = new Logger(SimplePayEmployeeService.name);

  constructor(
    private readonly simplePayRepo: SimplePayRepository,
    private readonly staffRepo: StaffRepository,
    private readonly apiClient: SimplePayApiClient,
    private readonly connectionService: SimplePayConnectionService,
  ) {}

  /**
   * Find an existing employee in SimplePay by ID number
   */
  async findExistingEmployeeByIdNumber(
    tenantId: string,
    idNumber: string,
  ): Promise<SimplePayEmployee | null> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    try {
      // Fetch all employees for the client
      interface EmployeeWrapper {
        employee: SimplePayEmployee;
      }
      const response = await this.apiClient.get<EmployeeWrapper[]>(
        `/clients/${clientId}/employees`,
      );
      const employees = response.map((w) => w.employee);

      // Find by ID number
      const found = employees.find((e) => e.id_number === idNumber);

      if (found) {
        this.logger.debug(
          `Found existing SimplePay employee ${found.id} with ID number ${idNumber}`,
        );
      }

      return found || null;
    } catch (error) {
      this.logger.warn(`Failed to search for existing employee: ${error}`);
      return null;
    }
  }

  /**
   * Sync single employee to SimplePay
   * Creates or updates based on mapping
   */
  async syncEmployee(
    tenantId: string,
    staffId: string,
  ): Promise<ISimplePayEmployeeMapping> {
    this.logger.log(`Syncing staff ${staffId} to SimplePay`);

    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    // Get staff member
    const staff = await this.staffRepo.findById(staffId);
    if (!staff || staff.tenantId !== tenantId) {
      throw new Error(`Staff ${staffId} not found`);
    }

    // Get wave_id (pay frequency)
    const waveId = await this.getDefaultWaveId(tenantId);
    this.logger.debug(`Using wave_id: ${waveId}`);

    // Map to SimplePay format
    const employeeData = this.mapToSimplePayFormat(staff, waveId);

    // Check existing mapping
    let existingMapping = await this.simplePayRepo.findEmployeeMapping(staffId);

    // If no mapping, check if employee already exists in SimplePay by ID number
    if (!existingMapping) {
      const existingEmployee = await this.findExistingEmployeeByIdNumber(
        tenantId,
        staff.idNumber,
      );

      if (existingEmployee) {
        // Create mapping for existing SimplePay employee
        this.logger.log(
          `Linking existing SimplePay employee ${existingEmployee.id} to staff ${staffId}`,
        );
        existingMapping = await this.simplePayRepo.upsertEmployeeMapping(
          tenantId,
          staffId,
          {
            simplePayEmployeeId: String(existingEmployee.id),
            syncStatus: SimplePaySyncStatus.SYNCED,
            lastSyncError: null,
          },
        );
        await this.connectionService.updateSyncStatus(tenantId, true);
        return existingMapping;
      }
    }

    try {
      let simplePayEmployeeId: string;

      if (existingMapping) {
        // Update existing employee - wrap in employee object
        await this.apiClient.patch<{ employee: SimplePayEmployee }>(
          `/employees/${existingMapping.simplePayEmployeeId}`,
          { employee: employeeData },
        );
        simplePayEmployeeId = existingMapping.simplePayEmployeeId;
        this.logger.log(`Updated SimplePay employee ${simplePayEmployeeId}`);
      } else {
        // Create new employee - wrap in employee object as per API docs
        // Response might be { employee: {...} } or just {...} directly
        const result = await this.apiClient.post<
          { employee: SimplePayEmployee } | SimplePayEmployee
        >(`/clients/${clientId}/employees`, { employee: employeeData });

        // Handle both response formats
        const employee = 'employee' in result ? result.employee : result;

        if (!employee || !employee.id) {
          this.logger.error(
            `Unexpected response format: ${JSON.stringify(result)}`,
          );
          throw new Error('SimplePay did not return employee ID');
        }

        simplePayEmployeeId = String(employee.id);
        this.logger.log(`Created SimplePay employee ${simplePayEmployeeId}`);
      }

      // Update mapping
      const mapping = await this.simplePayRepo.upsertEmployeeMapping(
        tenantId,
        staffId,
        {
          simplePayEmployeeId,
          syncStatus: SimplePaySyncStatus.SYNCED,
          lastSyncError: null,
        },
      );

      await this.connectionService.updateSyncStatus(tenantId, true);
      return mapping;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to sync staff ${staffId}: ${errorMessage}`);

      if (existingMapping) {
        await this.simplePayRepo.updateEmployeeMappingStatus(staffId, {
          syncStatus: SimplePaySyncStatus.SYNC_FAILED,
          lastSyncError: errorMessage,
        });
      }

      throw error;
    }
  }

  /**
   * Sync all employees for tenant
   */
  async syncAllEmployees(tenantId: string): Promise<SyncResult> {
    this.logger.log(`Syncing all employees for tenant ${tenantId}`);

    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    // Get all active staff
    const staffList = await this.staffRepo.findActiveByTenantId(tenantId);

    for (const staff of staffList) {
      try {
        await this.syncEmployee(tenantId, staff.id);
        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          staffId: staff.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    result.success = result.failed === 0;
    await this.connectionService.updateSyncStatus(
      tenantId,
      result.success,
      result.errors.length > 0
        ? `${result.failed} employees failed to sync`
        : undefined,
    );

    this.logger.log(
      `Sync complete: ${result.synced} synced, ${result.failed} failed`,
    );
    return result;
  }

  /**
   * Map CrecheBooks staff to SimplePay employee format
   */
  mapToSimplePayFormat(
    staff: {
      employeeNumber?: string | null;
      firstName: string;
      lastName: string;
      idNumber: string;
      taxNumber?: string | null;
      email?: string | null;
      phone?: string | null;
      dateOfBirth: Date;
      startDate: Date;
      endDate?: Date | null;
      employmentType: string;
      basicSalaryCents: number;
      paymentMethod?: string | null;
      bankName?: string | null;
      bankAccount?: string | null;
      bankBranchCode?: string | null;
    },
    waveId: number,
  ): SimplePayEmployeeInput {
    const input: SimplePayEmployeeInput = {
      wave_id: waveId,
      first_name: staff.firstName,
      last_name: staff.lastName,
      birthdate: this.formatDate(staff.dateOfBirth),
      appointment_date: this.formatDate(staff.startDate),
      identification_type: 'rsa_id', // South African ID
      id_number: staff.idNumber,
      payment_method: this.mapPaymentMethod(staff.paymentMethod),
      tax_number: staff.taxNumber ?? undefined,
      email: staff.email ?? undefined,
      mobile: staff.phone ?? undefined,
      number: staff.employeeNumber ?? undefined,
    };

    if (staff.endDate) {
      input.termination_date = this.formatDate(staff.endDate);
    }

    return input;
  }

  /**
   * Get the default wave ID for a client (first monthly wave)
   */
  async getDefaultWaveId(tenantId: string): Promise<number> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    try {
      // Fetch waves (pay frequencies) for the client
      interface WaveWrapper {
        wave: { id: number; name: string; frequency: string };
      }
      const response = await this.apiClient.get<WaveWrapper[]>(
        `/clients/${clientId}/waves`,
      );
      const waves = response.map((w) => w.wave);

      this.logger.debug(`Found ${waves.length} waves for client ${clientId}`);

      // Prefer monthly wave, or fall back to first available
      const monthlyWave = waves.find(
        (w) =>
          w.frequency?.toLowerCase() === 'monthly' ||
          w.name?.toLowerCase().includes('monthly'),
      );

      if (monthlyWave) {
        return monthlyWave.id;
      }

      if (waves.length > 0) {
        return waves[0].id;
      }

      throw new Error('No pay waves found for client');
    } catch (error) {
      this.logger.error(`Failed to get waves: ${error}`);
      throw new Error('Could not retrieve pay frequency waves from SimplePay');
    }
  }

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
   * Map payment method to SimplePay format
   */
  private mapPaymentMethod(method?: string | null): string {
    switch (method?.toUpperCase()) {
      case 'EFT':
      case 'ELECTRONIC':
      case 'ELECTRONIC_TRANSFER':
        return 'eft_manual';
      case 'CASH':
        return 'cash';
      case 'CHEQUE':
      case 'CHECK':
        return 'cheque';
      default:
        return 'cash'; // Default to cash (EFT requires bank details)
    }
  }

  /**
   * Get sync status for staff member
   */
  async getSyncStatus(staffId: string): Promise<SimplePaySyncStatus> {
    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    return mapping?.syncStatus ?? SimplePaySyncStatus.NOT_SYNCED;
  }

  /**
   * Fetch employee from SimplePay
   */
  async fetchEmployee(
    tenantId: string,
    simplePayEmployeeId: string,
  ): Promise<SimplePayEmployee> {
    await this.apiClient.initializeForTenant(tenantId);
    return this.apiClient.get<SimplePayEmployee>(
      `/employees/${simplePayEmployeeId}`,
    );
  }

  /**
   * Compare local vs SimplePay data
   */
  async compareEmployee(
    tenantId: string,
    staffId: string,
  ): Promise<SyncComparison> {
    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    const staff = await this.staffRepo.findById(staffId);
    if (!staff) {
      throw new Error('Staff not found');
    }

    const remoteEmployee = await this.fetchEmployee(
      tenantId,
      mapping.simplePayEmployeeId,
    );

    // Get wave_id for comparison (use remote employee's wave_id)
    const waveId = remoteEmployee.wave_id || 0;
    const localData = this.mapToSimplePayFormat(staff, waveId);
    const differences: SyncComparison['differences'] = [];

    // Compare fields
    const fieldsToCompare: Array<keyof SimplePayEmployeeInput> = [
      'first_name',
      'last_name',
      'id_number',
      'email',
      'payment_method',
    ];

    for (const field of fieldsToCompare) {
      if (localData[field] !== remoteEmployee[field]) {
        differences.push({
          field,
          localValue: localData[field],
          remoteValue: remoteEmployee[field],
        });
      }
    }

    // Update sync status if out of sync
    if (differences.length > 0) {
      await this.simplePayRepo.updateEmployeeMappingStatus(staffId, {
        syncStatus: SimplePaySyncStatus.OUT_OF_SYNC,
      });
    }

    return {
      staffId,
      simplePayEmployeeId: mapping.simplePayEmployeeId,
      isInSync: differences.length === 0,
      differences,
    };
  }

  private mapEmploymentType(type: string): string {
    switch (type.toUpperCase()) {
      case 'PERMANENT':
        return 'full_time';
      case 'CONTRACT':
        return 'temporary';
      case 'CASUAL':
        return 'casual';
      default:
        return 'full_time';
    }
  }
}
