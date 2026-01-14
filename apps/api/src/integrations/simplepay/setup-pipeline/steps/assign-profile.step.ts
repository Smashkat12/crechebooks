/**
 * Assign Profile Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Assigns the appropriate SimplePay profile based on staff role.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { ProfileSelector } from '../profile-selector';
import { SimplePayProfileService } from '../../simplepay-profile.service';

@Injectable()
export class AssignProfileStep implements IPipelineStep {
  readonly name = PipelineStep.ASSIGN_PROFILE;
  readonly description = 'Assign appropriate profile based on role';

  private readonly logger = new Logger(AssignProfileStep.name);

  constructor(
    private readonly profileSelector: ProfileSelector,
    private readonly profileService: SimplePayProfileService,
  ) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Assigning profile for staff ${context.staffId}`);

    try {
      // Check if profile ID was provided in request
      let profileId = context.profileId;
      let profileName: string | null = null;

      if (!profileId) {
        // Auto-select profile based on role and employment type
        const selection = this.profileSelector.selectProfile(
          context.staff.position,
          context.staff.employmentType,
        );

        this.logger.debug(
          `Auto-selected profile: ${selection.profileName} (confidence: ${selection.confidence})`,
        );

        // Get available profiles from SimplePay
        const availableProfiles =
          await this.profileService.getAvailableProfiles(context.tenantId);

        // Find matching profile by name
        const matchedProfile = availableProfiles.find(
          (p) =>
            p.name
              .toLowerCase()
              .includes(selection.profileName.toLowerCase()) ||
            selection.profileName.toLowerCase().includes(p.name.toLowerCase()),
        );

        if (matchedProfile) {
          profileId = matchedProfile.id;
          profileName = matchedProfile.name;
        } else {
          // Use default profile
          const defaultProfile = availableProfiles.find((p) => p.isDefault);
          if (defaultProfile) {
            profileId = defaultProfile.id;
            profileName = defaultProfile.name;
            context.warnings.push({
              step: this.name,
              code: 'PROFILE_FALLBACK_TO_DEFAULT',
              message: `No matching profile found for "${selection.profileName}", using default`,
              details: { suggestedProfile: selection.profileName },
              timestamp: new Date().toISOString(),
            });
          } else if (availableProfiles.length > 0) {
            // Use first available profile
            profileId = availableProfiles[0].id;
            profileName = availableProfiles[0].name;
            context.warnings.push({
              step: this.name,
              code: 'PROFILE_FALLBACK_TO_FIRST',
              message: `No default profile found, using first available`,
              details: {},
              timestamp: new Date().toISOString(),
            });
          } else {
            throw new Error('No profiles available in SimplePay');
          }
        }
      }

      if (!profileId) {
        throw new Error('Could not determine profile to assign');
      }

      // Assign profile to employee
      const result = await this.profileService.assignProfile(context.tenantId, {
        staffId: context.staffId,
        profileId,
      });

      if (!result.success) {
        throw new Error(result.error || 'Profile assignment failed');
      }

      // Update context
      context.profileId = profileId;
      context.profileName = result.profileName || profileName;

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          profileId,
          profileName: result.profileName,
          mappingId: result.simplePayMappingId,
        };
        stepResult.rollbackData = {
          mappingId: result.simplePayMappingId,
        };
        stepResult.canRollback = true;
      }

      this.logger.log(
        `Successfully assigned profile ${result.profileName} to staff ${context.staffId}`,
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to assign profile: ${errorMessage}`);

      context.errors.push({
        step: this.name,
        code: 'ASSIGN_PROFILE_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  async rollback(context: SetupPipelineContext): Promise<boolean> {
    const stepResult = context.stepResults.find((s) => s.step === this.name);

    if (!stepResult?.rollbackData?.mappingId) {
      return true; // Nothing to rollback
    }

    try {
      const mappingId = stepResult.rollbackData.mappingId as number;
      await this.profileService.removeProfileMapping(
        context.tenantId,
        context.staffId,
        mappingId,
      );
      this.logger.log(`Rolled back profile mapping ${mappingId}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to rollback profile: ${error}`);
      return false;
    }
  }

  shouldSkip(context: SetupPipelineContext): boolean {
    // Don't skip - we always need to assign a profile
    return false;
  }
}
