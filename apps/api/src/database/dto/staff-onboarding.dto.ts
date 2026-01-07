/**
 * Staff Onboarding DTOs
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Data Transfer Objects for staff onboarding operations including:
 * - Document management (upload, verify, reject)
 * - Onboarding workflow (initiate, update, complete)
 * - Checklist item management
 */

import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsBoolean,
  IsInt,
  Min,
  IsUUID,
  IsUrl,
  MaxLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  StaffDocument,
  StaffOnboarding,
  OnboardingChecklistItem,
} from '@prisma/client';
import {
  DocumentType,
  DocumentStatus,
  OnboardingStatus,
  ChecklistItemStatus,
} from '../entities/staff-onboarding.entity';

// ============================================
// Staff Document DTOs
// ============================================

/**
 * DTO for creating a new staff document
 */
export class CreateStaffDocumentDto {
  @IsUUID()
  staffId!: string;

  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsUrl()
  @MaxLength(500)
  fileUrl!: string;

  @IsInt()
  @Min(0)
  fileSize!: number;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating an existing staff document
 */
export class UpdateStaffDocumentDto {
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date;
}

/**
 * DTO for verifying a document
 */
export class VerifyDocumentDto {
  @IsUUID()
  verifiedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for rejecting a document
 */
export class RejectDocumentDto {
  @IsString()
  @MaxLength(500)
  rejectionReason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for filtering staff documents
 */
export class StaffDocumentFilterDto {
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsBoolean()
  expired?: boolean;
}

// ============================================
// Staff Onboarding DTOs
// ============================================

/**
 * DTO for initiating staff onboarding
 */
export class InitiateOnboardingDto {
  @IsUUID()
  staffId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  useDefaultChecklist?: boolean;
}

/**
 * DTO for updating onboarding status
 */
export class UpdateOnboardingStatusDto {
  @IsEnum(OnboardingStatus)
  status!: OnboardingStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Valid onboarding steps
 */
export type OnboardingStep =
  | 'PERSONAL_INFO'
  | 'EMPLOYMENT'
  | 'TAX_INFO'
  | 'BANKING'
  | 'DOCUMENTS'
  | 'CHECKLIST'
  | 'COMPLETE';

/**
 * DTO for updating an onboarding step with form data
 */
export class UpdateStepDto {
  @IsString()
  step!: OnboardingStep;

  @IsOptional()
  data?: Record<string, unknown>;
}

/**
 * DTO for completing onboarding
 */
export class CompleteOnboardingDto {
  @IsUUID()
  completedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  generateWelcomePack?: boolean;

  @IsOptional()
  @IsBoolean()
  sendWelcomePack?: boolean;
}

/**
 * DTO for filtering onboardings
 */
export class OnboardingFilterDto {
  @IsOptional()
  @IsEnum(OnboardingStatus)
  status?: OnboardingStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startedAfter?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startedBefore?: Date;

  @IsOptional()
  @IsBoolean()
  pendingDocuments?: boolean;
}

// ============================================
// Checklist Item DTOs
// ============================================

/**
 * DTO for creating a checklist item
 */
export class CreateChecklistItemDto {
  @IsString()
  @MaxLength(100)
  itemKey!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MaxLength(50)
  category!: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * DTO for updating a checklist item
 */
export class UpdateChecklistItemDto extends PartialType(
  CreateChecklistItemDto,
) {
  @IsOptional()
  @IsEnum(ChecklistItemStatus)
  status?: ChecklistItemStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for completing a checklist item
 */
export class CompleteChecklistItemDto {
  @IsUUID()
  completedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for bulk checklist item creation
 */
export class BulkCreateChecklistItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChecklistItemDto)
  items!: CreateChecklistItemDto[];
}

// ============================================
// Response DTOs
// ============================================

/**
 * Progress information for an onboarding
 */
export interface OnboardingProgress {
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  completedRequiredItems: number;
  percentComplete: number;
  requiredPercentComplete: number;
  byCategory: Record<
    string,
    {
      total: number;
      completed: number;
      percentComplete: number;
    }
  >;
}

/**
 * Full onboarding response with related data
 */
export interface OnboardingProgressResponse {
  onboarding: StaffOnboarding;
  checklistItems: OnboardingChecklistItem[];
  documents: StaffDocument[];
  progress: OnboardingProgress;
}

/**
 * Dashboard statistics for onboarding management
 */
export interface OnboardingDashboardResponse {
  totalStaff: number;
  notStarted: number;
  inProgress: number;
  documentsPending: number;
  verificationPending: number;
  completed: number;
  cancelled: number;
  averageCompletionDays: number | null;
  recentOnboardings: Array<
    StaffOnboarding & {
      staffName: string;
      progress: number;
      staff: { firstName: string; lastName: string };
    }
  >;
  pendingDocuments: Array<{
    documentId: string;
    staffId: string;
    staffName: string;
    documentType: string;
    uploadedAt: Date;
  }>;
}

/**
 * Welcome pack generation options
 */
export interface WelcomePackOptions {
  includePolicies?: boolean;
  includeOrgChart?: boolean;
  includeEmergencyContacts?: boolean;
  includeFirstDaySchedule?: boolean;
  customMessage?: string;
}

/**
 * Welcome pack generation result
 */
export interface WelcomePackResult {
  pdfUrl: string;
  generatedAt: Date;
  sentAt?: Date;
  sentTo?: string;
}

/**
 * Document expiry warning
 */
export interface DocumentExpiryWarning {
  documentId: string;
  staffId: string;
  staffName: string;
  documentType: DocumentType;
  expiryDate: Date;
  daysUntilExpiry: number;
}

// ============================================
// Generated Documents DTOs (Auto-Generated Employment Docs)
// ============================================

/**
 * Types of auto-generated documents
 */
export enum GeneratedDocumentType {
  EMPLOYMENT_CONTRACT = 'EMPLOYMENT_CONTRACT',
  POPIA_CONSENT = 'POPIA_CONSENT',
  WELCOME_PACK = 'WELCOME_PACK',
}

/**
 * Generated document response
 */
export interface GeneratedDocumentResponse {
  id: string;
  onboardingId: string;
  documentType: GeneratedDocumentType;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  generatedAt: Date;
  signedAt: Date | null;
  signedByName: string | null;
  acknowledged: boolean;
}

/**
 * DTO for signing/acknowledging a generated document
 */
export class SignDocumentDto {
  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsString()
  @MaxLength(200)
  signedByName!: string;

  @IsOptional()
  @IsString()
  signedByIp?: string;
}

/**
 * DTO for generating a document
 */
export class GenerateDocumentDto {
  @IsEnum(GeneratedDocumentType)
  documentType!: GeneratedDocumentType;
}

/**
 * Response for document generation
 */
export interface DocumentGenerationResult {
  success: boolean;
  document: GeneratedDocumentResponse;
  message: string;
}

/**
 * Response for listing generated documents
 */
export interface GeneratedDocumentsListResponse {
  documents: GeneratedDocumentResponse[];
  allDocumentsGenerated: boolean;
  allDocumentsSigned: boolean;
  pendingSignatures: GeneratedDocumentType[];
}
