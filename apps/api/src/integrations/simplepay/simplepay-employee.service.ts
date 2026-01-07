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
  first_name: string;
  last_name: string;
  identification_number?: string;
  tax_number?: string;
  email?: string;
  mobile?: string;
  birthdate?: string;
  appointment_date: string;
  termination_date?: string;
  employment_type: string;
  basic_salary: number;
  bank_name?: string;
  bank_account?: string;
  branch_code?: string;
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

    // Map to SimplePay format
    const employeeData = this.mapToSimplePayFormat(staff);

    // Check existing mapping
    const existingMapping =
      await this.simplePayRepo.findEmployeeMapping(staffId);

    try {
      let simplePayEmployeeId: string;

      if (existingMapping) {
        // Update existing employee
        await this.apiClient.patch<SimplePayEmployee>(
          `/employees/${existingMapping.simplePayEmployeeId}`,
          employeeData,
        );
        simplePayEmployeeId = existingMapping.simplePayEmployeeId;
        this.logger.log(`Updated SimplePay employee ${simplePayEmployeeId}`);
      } else {
        // Create new employee
        const result = await this.apiClient.post<SimplePayEmployee>(
          `/clients/${clientId}/employees`,
          employeeData,
        );
        simplePayEmployeeId = result.id;
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
  mapToSimplePayFormat(staff: {
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
    bankName?: string | null;
    bankAccount?: string | null;
    bankBranchCode?: string | null;
  }): SimplePayEmployeeInput {
    return {
      first_name: staff.firstName,
      last_name: staff.lastName,
      identification_number: staff.idNumber,
      tax_number: staff.taxNumber ?? undefined,
      email: staff.email ?? undefined,
      mobile: staff.phone ?? undefined,
      birthdate: staff.dateOfBirth.toISOString().split('T')[0],
      appointment_date: staff.startDate.toISOString().split('T')[0],
      termination_date: staff.endDate?.toISOString().split('T')[0],
      employment_type: this.mapEmploymentType(staff.employmentType),
      basic_salary: staff.basicSalaryCents / 100, // Convert cents to rands
      bank_name: staff.bankName ?? undefined,
      bank_account: staff.bankAccount ?? undefined,
      branch_code: staff.bankBranchCode ?? undefined,
    };
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

    const localData = this.mapToSimplePayFormat(staff);
    const differences: SyncComparison['differences'] = [];

    // Compare fields
    const fieldsToCompare: Array<keyof SimplePayEmployeeInput> = [
      'first_name',
      'last_name',
      'identification_number',
      'email',
      'basic_salary',
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
