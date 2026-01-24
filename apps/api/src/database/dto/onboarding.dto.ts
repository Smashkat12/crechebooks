import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Onboarding DTOs
 * TASK-ACCT-014: Tenant Onboarding Wizard
 */

export enum OnboardingStepId {
  LOGO = 'logo',
  ADDRESS = 'address',
  BANK_DETAILS = 'bankDetails',
  VAT_CONFIG = 'vatConfig',
  FEE_STRUCTURE = 'feeStructure',
  ENROL_CHILD = 'enrollChild',
  FIRST_INVOICE = 'firstInvoice',
  BANK_CONNECT = 'bankConnect',
}

export class UpdateOnboardingStepDto {
  @ApiProperty({
    description: 'Step ID to update',
    enum: OnboardingStepId,
    example: 'address',
  })
  @IsString()
  @IsEnum(OnboardingStepId)
  stepId: OnboardingStepId;

  @ApiProperty({
    description: 'Action to take',
    enum: ['complete', 'skip'],
  })
  @IsString()
  @IsEnum(['complete', 'skip'] as const)
  action: 'complete' | 'skip';
}

export class SetActiveStepDto {
  @ApiPropertyOptional({
    description: 'Current active step ID',
    enum: OnboardingStepId,
  })
  @IsOptional()
  @IsString()
  @IsEnum(OnboardingStepId)
  stepId?: OnboardingStepId;
}

export interface OnboardingStepInfo {
  id: OnboardingStepId;
  title: string;
  description: string;
  isComplete: boolean;
  isSkipped: boolean;
  isSkippable: boolean;
  helpText?: string;
}

export interface OnboardingProgressResponse {
  id: string;
  tenantId: string;

  // Individual step status
  logoUploaded: boolean;
  addressSet: boolean;
  bankDetailsSet: boolean;
  vatConfigured: boolean;
  feeStructureCreated: boolean;
  childEnrolled: boolean;
  firstInvoiceSent: boolean;
  bankConnected: boolean;

  // Metadata
  skippedSteps: string[];
  lastActiveStep: string | null;
  completedAt: Date | null;

  // Computed fields
  completedCount: number;
  totalSteps: number;
  progressPercent: number;
  isComplete: boolean;

  // Step details
  steps: OnboardingStepInfo[];
}

export interface OnboardingDashboardCta {
  showOnboarding: boolean;
  progressPercent: number;
  nextStep: OnboardingStepInfo | null;
  message: string;
}
