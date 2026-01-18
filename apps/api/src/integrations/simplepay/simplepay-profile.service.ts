/**
 * SimplePay Profile Service
 * TASK-SPAY-006: SimplePay Profile (Calculation Template) Mapping Management
 *
 * Manages profile (calculation template) assignments, updates, and removals
 * for employees. Profiles define which earnings and deductions apply to
 * each employee.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { ProfileMappingSyncRepository } from '../../database/repositories/profile-mapping-sync.repository';
import { StaffRepository } from '../../database/repositories/staff.repository';
import {
  SimplePayProfileMapping,
  ProfileMappingWrapper,
  ProfileWrapper,
  ProfileAssignmentResult,
  BulkProfileAssignmentResult,
  ProfileUpdateResult,
  ProfileRemovalResult,
  AvailableProfile,
  StaffProfileSummary,
  getSuggestedProfilesForRole,
  CRECHE_PROFILES,
} from '../../database/entities/profile-mapping.entity';
import {
  AssignProfileDto,
  BulkAssignProfileDto,
  UpdateProfileMappingDto,
  CalculationSettingDto,
  toSimplePayCalculationSettings,
  ProfileMappingFilterDto,
  SuggestedProfileDto,
} from '../../database/dto/profile.dto';
import { ProfileMappingSync } from '@prisma/client';

@Injectable()
export class SimplePayProfileService {
  private readonly logger = new Logger(SimplePayProfileService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly profileMappingRepo: ProfileMappingSyncRepository,
    private readonly staffRepo: StaffRepository,
  ) {}

  /**
   * Get all available profiles for a tenant
   *
   * Note: SimplePay SA API does not have a direct /profiles endpoint.
   * Profiles (calculation templates) are managed through SimplePay's admin UI.
   * This method returns an empty list and profiles must be configured manually
   * in SimplePay before they can be assigned to employees.
   */
  async getAvailableProfiles(tenantId: string): Promise<AvailableProfile[]> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    try {
      // SimplePay SA API does not have a /profiles endpoint
      // Profiles must be created and managed via SimplePay admin UI
      // We attempt the call but gracefully handle 404
      const response = await this.apiClient.get<ProfileWrapper[]>(
        `/clients/${clientId}/profiles`,
      );

      const profiles = response.map((w) => w.profile);

      return profiles.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        calculationCount: p.calculation_items?.length || 0,
        isDefault: p.is_default,
      }));
    } catch (error) {
      // SimplePay SA doesn't expose profiles via API (404)
      // Return empty array - profiles must be managed in SimplePay admin UI
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        this.logger.warn(
          `SimplePay profiles endpoint not available for client ${clientId}. ` +
            `Profiles must be created and managed in SimplePay admin UI.`,
        );
        return [];
      }
      this.logger.error(`Failed to get available profiles: ${error}`);
      throw error;
    }
  }

  /**
   * Get profile mappings for an employee from SimplePay
   */
  async getEmployeeProfileMappings(
    tenantId: string,
    staffId: string,
  ): Promise<SimplePayProfileMapping[]> {
    await this.apiClient.initializeForTenant(tenantId);

    // Get employee mapping to get SimplePay employee ID
    const employeeMapping =
      await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!employeeMapping) {
      throw new Error(`Staff ${staffId} is not linked to SimplePay`);
    }

    try {
      // SimplePay returns wrapped: [{ profile_mapping: {...} }, ...]
      const response = await this.apiClient.get<ProfileMappingWrapper[]>(
        `/employees/${employeeMapping.simplePayEmployeeId}/profile_mappings`,
      );

      return response.map((w) => w.profile_mapping);
    } catch (error) {
      this.logger.error(
        `Failed to get profile mappings for employee ${employeeMapping.simplePayEmployeeId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Assign a profile to an employee
   */
  async assignProfile(
    tenantId: string,
    dto: AssignProfileDto,
  ): Promise<ProfileAssignmentResult> {
    await this.apiClient.initializeForTenant(tenantId);

    const result: ProfileAssignmentResult = {
      success: false,
      staffId: dto.staffId,
      simplePayMappingId: null,
      profileId: dto.profileId,
      profileName: '',
      error: null,
    };

    try {
      // Get employee mapping
      const employeeMapping = await this.simplePayRepo.findEmployeeMapping(
        dto.staffId,
      );
      if (!employeeMapping) {
        result.error = `Staff ${dto.staffId} is not linked to SimplePay`;
        return result;
      }

      // Prepare request body
      const requestBody: Record<string, unknown> = {
        profile_mapping: {
          profile_id: dto.profileId,
        },
      };

      // Add calculation settings if provided
      if (dto.calculationSettings && dto.calculationSettings.length > 0) {
        (
          requestBody.profile_mapping as Record<string, unknown>
        ).calculation_settings = toSimplePayCalculationSettings(
          dto.calculationSettings,
        );
      }

      // POST to create profile mapping
      // Response: { profile_mapping: {...} }
      const response = await this.apiClient.post<ProfileMappingWrapper>(
        `/employees/${employeeMapping.simplePayEmployeeId}/profile_mappings`,
        requestBody,
      );

      const mapping = response.profile_mapping;
      result.success = true;
      result.simplePayMappingId = mapping.id;
      result.profileName = mapping.profile_name;

      // Store locally for tracking
      await this.profileMappingRepo.upsert({
        tenantId,
        staffId: dto.staffId,
        simplePayMappingId: mapping.id,
        simplePayProfileId: mapping.profile_id,
        profileName: mapping.profile_name,
        calculationSettings: JSON.parse(
          JSON.stringify(mapping.calculation_settings || []),
        ),
      });

      this.logger.log(
        `Assigned profile ${dto.profileId} to staff ${dto.staffId}, mapping ID: ${mapping.id}`,
      );
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to assign profile ${dto.profileId} to staff ${dto.staffId}: ${result.error}`,
      );
    }

    return result;
  }

  /**
   * Update calculation settings for a profile mapping
   */
  async updateProfileMapping(
    tenantId: string,
    staffId: string,
    dto: UpdateProfileMappingDto,
  ): Promise<ProfileUpdateResult> {
    await this.apiClient.initializeForTenant(tenantId);

    const result: ProfileUpdateResult = {
      success: false,
      staffId,
      simplePayMappingId: dto.mappingId,
      updatedSettings: [],
      error: null,
    };

    try {
      // Verify employee is linked
      const employeeMapping =
        await this.simplePayRepo.findEmployeeMapping(staffId);
      if (!employeeMapping) {
        result.error = `Staff ${staffId} is not linked to SimplePay`;
        return result;
      }

      // Prepare request body
      const requestBody = {
        profile_mapping: {
          calculation_settings: toSimplePayCalculationSettings(
            dto.calculationSettings,
          ),
        },
      };

      // PATCH to update profile mapping
      const response = await this.apiClient.patch<ProfileMappingWrapper>(
        `/profile_mappings/${dto.mappingId}`,
        requestBody,
      );

      const mapping = response.profile_mapping;
      result.success = true;
      result.updatedSettings = (mapping.calculation_settings || []).map(
        (s) => ({
          calculationId: s.calculation_id,
          calculationCode: s.calculation_code,
          calculationName: s.calculation_name,
          isEnabled: s.is_enabled,
          amountCents: s.amount_cents,
          percentage: s.percentage,
          formula: s.formula,
        }),
      );

      // Update local record
      await this.profileMappingRepo.upsert({
        tenantId,
        staffId,
        simplePayMappingId: mapping.id,
        simplePayProfileId: mapping.profile_id,
        profileName: mapping.profile_name,
        calculationSettings: JSON.parse(
          JSON.stringify(mapping.calculation_settings || []),
        ),
      });

      this.logger.log(
        `Updated profile mapping ${dto.mappingId} for staff ${staffId}`,
      );
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to update profile mapping ${dto.mappingId}: ${result.error}`,
      );
    }

    return result;
  }

  /**
   * Remove a profile mapping from an employee
   */
  async removeProfileMapping(
    tenantId: string,
    staffId: string,
    mappingId: number,
  ): Promise<ProfileRemovalResult> {
    await this.apiClient.initializeForTenant(tenantId);

    const result: ProfileRemovalResult = {
      success: false,
      staffId,
      simplePayMappingId: mappingId,
      error: null,
    };

    try {
      // Verify employee is linked
      const employeeMapping =
        await this.simplePayRepo.findEmployeeMapping(staffId);
      if (!employeeMapping) {
        result.error = `Staff ${staffId} is not linked to SimplePay`;
        return result;
      }

      // DELETE the profile mapping
      await this.apiClient.delete(`/profile_mappings/${mappingId}`);

      result.success = true;

      // Remove local record
      try {
        await this.profileMappingRepo.deleteBySimplePayMappingId(
          tenantId,
          staffId,
          mappingId,
        );
      } catch {
        // Ignore if not found locally
        this.logger.debug(
          `Local mapping ${mappingId} not found, skipping delete`,
        );
      }

      this.logger.log(
        `Removed profile mapping ${mappingId} from staff ${staffId}`,
      );
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to remove profile mapping ${mappingId}: ${result.error}`,
      );
    }

    return result;
  }

  /**
   * Bulk assign a profile to multiple employees
   * Handles partial failures gracefully
   */
  async bulkAssignProfile(
    tenantId: string,
    dto: BulkAssignProfileDto,
  ): Promise<BulkProfileAssignmentResult> {
    const result: BulkProfileAssignmentResult = {
      totalRequested: dto.staffIds.length,
      successful: 0,
      failed: 0,
      results: [],
    };

    for (const staffId of dto.staffIds) {
      const assignResult = await this.assignProfile(tenantId, {
        staffId,
        profileId: dto.profileId,
        calculationSettings: dto.calculationSettings,
      });

      result.results.push(assignResult);

      if (assignResult.success) {
        result.successful++;
      } else {
        result.failed++;
      }
    }

    this.logger.log(
      `Bulk profile assignment: ${result.successful}/${result.totalRequested} successful`,
    );

    return result;
  }

  /**
   * Get suggested profiles for a staff member based on their role
   */
  async getSuggestedProfileForRole(
    tenantId: string,
    staffId: string,
  ): Promise<SuggestedProfileDto[]> {
    // Get staff details
    const staff = await this.staffRepo.findById(staffId, tenantId);
    if (!staff) {
      throw new Error(`Staff ${staffId} not found`);
    }

    const role = staff.position || 'admin';
    const suggestedTypes = getSuggestedProfilesForRole(role);

    // Get available profiles
    const availableProfiles = await this.getAvailableProfiles(tenantId);

    const suggestions: SuggestedProfileDto[] = [];

    for (const profileType of suggestedTypes) {
      const profileName = CRECHE_PROFILES[profileType];

      // Find matching profiles (case-insensitive partial match)
      const matches = availableProfiles.filter(
        (p) =>
          p.name.toLowerCase().includes(profileName.toLowerCase()) ||
          profileName.toLowerCase().includes(p.name.toLowerCase()),
      );

      for (const match of matches) {
        suggestions.push({
          profileId: match.id,
          profileName: match.name,
          matchReason: `Matches role "${role}" suggesting "${profileName}"`,
          confidence: profileType === suggestedTypes[0] ? 0.9 : 0.7,
        });
      }
    }

    // If no specific matches, suggest default profile
    if (suggestions.length === 0) {
      const defaultProfile = availableProfiles.find((p) => p.isDefault);
      if (defaultProfile) {
        suggestions.push({
          profileId: defaultProfile.id,
          profileName: defaultProfile.name,
          matchReason: 'Default profile (no specific role match)',
          confidence: 0.5,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get local sync records for a tenant
   */
  async getLocalSyncRecords(
    tenantId: string,
    filter?: ProfileMappingFilterDto,
  ): Promise<ProfileMappingSync[]> {
    return this.profileMappingRepo.findByTenant(tenantId, filter);
  }

  /**
   * Get all staff with a specific profile assigned
   */
  async getStaffByProfile(
    tenantId: string,
    profileId: number,
  ): Promise<StaffProfileSummary[]> {
    const staffIds = await this.profileMappingRepo.getStaffIdsByProfile(
      tenantId,
      profileId,
    );

    const summaries: StaffProfileSummary[] = [];

    for (const staffId of staffIds) {
      const staff = await this.staffRepo.findById(staffId, tenantId);
      if (!staff) continue;

      const employeeMapping =
        await this.simplePayRepo.findEmployeeMapping(staffId);
      if (!employeeMapping) continue;

      const mappings = await this.profileMappingRepo.findByStaff(
        tenantId,
        staffId,
      );

      summaries.push({
        staffId,
        staffName: `${staff.firstName} ${staff.lastName}`,
        simplePayEmployeeId: employeeMapping.simplePayEmployeeId,
        profiles: mappings.map((m) => {
          const rawSettings = m.calculationSettings;
          const settings = Array.isArray(rawSettings)
            ? (rawSettings as Array<{ is_enabled?: boolean }>)
            : [];
          const enabledCount = settings.filter((s) => s.is_enabled).length;
          const totalCount = settings.length;

          return {
            mappingId: m.simplePayMappingId,
            profileId: m.simplePayProfileId,
            profileName: m.profileName,
            enabledCalculations: enabledCount,
            totalCalculations: totalCount,
          };
        }),
      });
    }

    return summaries;
  }

  /**
   * Sync profile mappings from SimplePay to local database
   */
  async syncProfileMappings(
    tenantId: string,
    staffId: string,
  ): Promise<{ synced: number; removed: number }> {
    const remoteMappings = await this.getEmployeeProfileMappings(
      tenantId,
      staffId,
    );

    // Get existing local mappings
    const localMappings = await this.profileMappingRepo.findByStaff(
      tenantId,
      staffId,
    );

    let synced = 0;
    let removed = 0;

    // Upsert remote mappings to local
    for (const remote of remoteMappings) {
      await this.profileMappingRepo.upsert({
        tenantId,
        staffId,
        simplePayMappingId: remote.id,
        simplePayProfileId: remote.profile_id,
        profileName: remote.profile_name,
        calculationSettings: JSON.parse(
          JSON.stringify(remote.calculation_settings || []),
        ),
      });
      synced++;
    }

    // Remove local mappings that no longer exist remotely
    const remoteMappingIds = new Set(remoteMappings.map((m) => m.id));
    for (const local of localMappings) {
      if (!remoteMappingIds.has(local.simplePayMappingId)) {
        await this.profileMappingRepo.delete(local.id, tenantId);
        removed++;
      }
    }

    this.logger.log(
      `Profile sync for staff ${staffId}: ${synced} synced, ${removed} removed`,
    );

    return { synced, removed };
  }

  /**
   * Toggle a specific calculation within a profile mapping
   */
  async toggleCalculation(
    tenantId: string,
    staffId: string,
    mappingId: number,
    calculationId: number,
    enabled: boolean,
  ): Promise<ProfileUpdateResult> {
    // Get current mapping
    const localMapping = await this.profileMappingRepo.findBySimplePayMappingId(
      tenantId,
      staffId,
      mappingId,
    );

    if (!localMapping) {
      return {
        success: false,
        staffId,
        simplePayMappingId: mappingId,
        updatedSettings: [],
        error: `Mapping ${mappingId} not found`,
      };
    }

    // Get current settings
    const rawSettings = localMapping.calculationSettings;
    if (!Array.isArray(rawSettings)) {
      return {
        success: false,
        staffId,
        simplePayMappingId: mappingId,
        updatedSettings: [],
        error: 'Invalid calculation settings format',
      };
    }
    const currentSettings = rawSettings as Array<{
      calculation_id: number;
      is_enabled: boolean;
      amount_cents: number | null;
      percentage: number | null;
      formula: string | null;
    }>;

    // Update the specific calculation
    const updatedSettings: CalculationSettingDto[] = currentSettings.map(
      (s) => ({
        calculationId: s.calculation_id,
        isEnabled: s.calculation_id === calculationId ? enabled : s.is_enabled,
        amountCents: s.amount_cents,
        percentage: s.percentage,
        formula: s.formula,
      }),
    );

    return this.updateProfileMapping(tenantId, staffId, {
      mappingId,
      calculationSettings: updatedSettings,
    });
  }
}
