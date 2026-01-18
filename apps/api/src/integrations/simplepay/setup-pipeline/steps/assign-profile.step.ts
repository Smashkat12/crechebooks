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
        // Uses hardcoded profile IDs since SimplePay SA API doesn't expose profiles
        const selection = this.profileSelector.selectProfileWithId(
          context.staff.position,
          context.staff.employmentType,
        );

        this.logger.debug(
          `Auto-selected profile: ${selection.profileName} (ID: ${selection.profileId}, confidence: ${selection.confidence})`,
        );

        if (selection.profileId) {
          profileId = selection.profileId;
          profileName = selection.profileName;
        } else {
          // Profile not found in hardcoded IDs - this means the template
          // needs to be created in SimplePay admin and the ID added to profile-selector.ts
          context.warnings.push({
            step: this.name,
            code: 'PROFILE_NOT_CONFIGURED',
            message: `Profile "${selection.profileName}" not configured. Please create this template in SimplePay admin and update profile-selector.ts with the ID.`,
            details: { suggestedProfile: selection.profileName },
            timestamp: new Date().toISOString(),
          });

          // Fall back to General Staff profile
          const fallbackId = this.profileSelector.getProfileId('General Staff');
          if (fallbackId) {
            profileId = fallbackId;
            profileName = 'General Staff';
            context.warnings.push({
              step: this.name,
              code: 'PROFILE_FALLBACK_TO_GENERAL',
              message: `Using "General Staff" profile as fallback`,
              details: {},
              timestamp: new Date().toISOString(),
            });
          } else {
            throw new Error(
              'No profiles configured. Please create templates in SimplePay admin ' +
                'and update SIMPLEPAY_PROFILE_IDS in profile-selector.ts',
            );
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
