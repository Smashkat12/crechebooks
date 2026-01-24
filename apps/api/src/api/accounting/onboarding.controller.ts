/**
 * Onboarding Controller
 * TASK-ACCT-014: Tenant Onboarding Wizard API
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { OnboardingService } from '../../database/services/onboarding.service';
import {
  OnboardingStepId,
  OnboardingProgressResponse,
  OnboardingDashboardCta,
} from '../../database/dto/onboarding.dto';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('progress')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get onboarding progress' })
  @ApiResponse({ status: 200, description: 'Onboarding progress' })
  async getProgress(
    @CurrentUser() user: IUser,
  ): Promise<OnboardingProgressResponse> {
    const tenantId = getTenantId(user);
    this.logger.log(`Get onboarding progress: tenant=${tenantId}`);
    return this.onboardingService.getProgress(tenantId);
  }

  @Get('dashboard-cta')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get dashboard CTA for onboarding' })
  @ApiResponse({ status: 200, description: 'Dashboard CTA info' })
  async getDashboardCta(
    @CurrentUser() user: IUser,
  ): Promise<OnboardingDashboardCta> {
    const tenantId = getTenantId(user);
    return this.onboardingService.getDashboardCta(tenantId);
  }

  @Patch('progress')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update onboarding step' })
  @ApiResponse({ status: 200, description: 'Step updated' })
  async updateStep(
    @CurrentUser() user: IUser,
    @Body() body: { stepId: string; action: 'complete' | 'skip' },
  ): Promise<OnboardingProgressResponse> {
    const tenantId = getTenantId(user);
    const userId = user.id;

    this.logger.log(
      `Update onboarding step: tenant=${tenantId}, step=${body.stepId}, action=${body.action}`,
    );

    if (body.action === 'complete') {
      return this.onboardingService.markStepComplete(
        tenantId,
        body.stepId as OnboardingStepId,
        userId,
      );
    } else {
      return this.onboardingService.skipStep(
        tenantId,
        body.stepId as OnboardingStepId,
        userId,
      );
    }
  }

  @Post('auto-detect')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Auto-detect completed steps from existing data' })
  @ApiResponse({ status: 200, description: 'Progress auto-detected' })
  async autoDetect(
    @CurrentUser() user: IUser,
  ): Promise<OnboardingProgressResponse> {
    const tenantId = getTenantId(user);
    this.logger.log(`Auto-detect onboarding progress: tenant=${tenantId}`);
    return this.onboardingService.autoDetectProgress(tenantId);
  }

  @Post('reset')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Reset onboarding progress' })
  @ApiResponse({ status: 200, description: 'Progress reset' })
  async reset(@CurrentUser() user: IUser): Promise<{ success: boolean }> {
    const tenantId = getTenantId(user);
    const userId = user.id;
    this.logger.log(`Reset onboarding progress: tenant=${tenantId}`);
    await this.onboardingService.resetProgress(tenantId, userId);
    return { success: true };
  }
}
