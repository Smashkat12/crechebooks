/**
 * Profile Mapping DTOs
 * TASK-SPAY-006: SimplePay Profile (Calculation Template) Mapping Management
 *
 * DTOs for profile assignment, update, removal, and bulk operations.
 */

import {
  IsString,
  IsOptional,
  IsInt,
  IsUUID,
  IsArray,
  IsBoolean,
  IsObject,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

// ============================================
// Request DTOs
// ============================================

/**
 * Assign Profile to Employee DTO
 */
export class AssignProfileDto {
  @ApiProperty({ description: 'Staff ID to assign profile to' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'SimplePay profile ID to assign' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  profileId: number;

  @ApiPropertyOptional({
    description: 'Initial calculation settings overrides',
  })
  @IsOptional()
  @IsArray()
  calculationSettings?: CalculationSettingDto[];
}

/**
 * Calculation Setting DTO for overriding profile defaults
 */
export class CalculationSettingDto {
  @ApiProperty({ description: 'Calculation ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  calculationId: number;

  @ApiProperty({ description: 'Whether calculation is enabled' })
  @IsBoolean()
  isEnabled: boolean;

  @ApiPropertyOptional({ description: 'Fixed amount in cents' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  amountCents?: number | null;

  @ApiPropertyOptional({ description: 'Percentage value' })
  @IsOptional()
  @Type(() => Number)
  percentage?: number | null;

  @ApiPropertyOptional({ description: 'Formula for calculation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  formula?: string | null;
}

/**
 * Update Profile Mapping DTO
 */
export class UpdateProfileMappingDto {
  @ApiProperty({ description: 'SimplePay mapping ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  mappingId: number;

  @ApiProperty({
    description: 'Updated calculation settings',
    type: [CalculationSettingDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculationSettingDto)
  calculationSettings: CalculationSettingDto[];
}

/**
 * Bulk Assign Profile DTO
 */
export class BulkAssignProfileDto {
  @ApiProperty({ description: 'Profile ID to assign to all staff' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  profileId: number;

  @ApiProperty({ description: 'Staff IDs to assign profile to' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  staffIds: string[];

  @ApiPropertyOptional({
    description: 'Optional calculation settings for all staff',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalculationSettingDto)
  calculationSettings?: CalculationSettingDto[];
}

/**
 * Remove Profile Mapping DTO
 */
export class RemoveProfileMappingDto {
  @ApiProperty({ description: 'Staff ID' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'SimplePay mapping ID to remove' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  mappingId: number;
}

/**
 * Create Profile Mapping Sync DTO (local database)
 */
export class CreateProfileMappingSyncDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Staff ID' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'SimplePay mapping ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  simplePayMappingId: number;

  @ApiProperty({ description: 'SimplePay profile ID' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  simplePayProfileId: number;

  @ApiProperty({ description: 'Profile name' })
  @IsString()
  @MaxLength(100)
  profileName: string;

  @ApiProperty({ description: 'Calculation settings JSON' })
  @IsObject()
  calculationSettings: Prisma.InputJsonValue;
}

/**
 * Update Profile Mapping Sync DTO (local database)
 */
export class UpdateProfileMappingSyncDto {
  @ApiPropertyOptional({ description: 'SimplePay profile ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  simplePayProfileId?: number;

  @ApiPropertyOptional({ description: 'Profile name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  profileName?: string;

  @ApiPropertyOptional({ description: 'Calculation settings JSON' })
  @IsOptional()
  @IsObject()
  calculationSettings?: Prisma.InputJsonValue;
}

/**
 * Profile Mapping Filter DTO
 */
export class ProfileMappingFilterDto {
  @ApiPropertyOptional({ description: 'Filter by staff ID' })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({ description: 'Filter by profile ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  profileId?: number;

  @ApiPropertyOptional({
    description: 'Filter by profile name (partial match)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  profileName?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

// ============================================
// Response DTOs
// ============================================

/**
 * Profile Response DTO (available profiles list)
 */
export class ProfileResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  calculationCount: number;

  @ApiProperty()
  isDefault: boolean;
}

/**
 * Calculation Setting Response DTO
 */
export class CalculationSettingResponseDto {
  @ApiProperty()
  calculationId: number;

  @ApiProperty()
  calculationCode: string;

  @ApiProperty()
  calculationName: string;

  @ApiProperty()
  isEnabled: boolean;

  @ApiPropertyOptional()
  amountCents: number | null;

  @ApiPropertyOptional()
  percentage: number | null;

  @ApiPropertyOptional()
  formula: string | null;
}

/**
 * Profile Mapping Response DTO
 */
export class ProfileMappingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayMappingId: number;

  @ApiProperty()
  simplePayProfileId: number;

  @ApiProperty()
  profileName: string;

  @ApiProperty({ type: [CalculationSettingResponseDto] })
  calculationSettings: CalculationSettingResponseDto[];

  @ApiProperty()
  enabledCalculations: number;

  @ApiProperty()
  totalCalculations: number;

  @ApiProperty()
  syncedAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * Profile Mapping List Response DTO
 */
export class ProfileMappingListResponseDto {
  @ApiProperty({ type: [ProfileMappingResponseDto] })
  data: ProfileMappingResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

/**
 * Profile Assignment Result DTO
 */
export class ProfileAssignmentResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  staffId: string;

  @ApiPropertyOptional()
  simplePayMappingId: number | null;

  @ApiProperty()
  profileId: number;

  @ApiProperty()
  profileName: string;

  @ApiPropertyOptional()
  error: string | null;
}

/**
 * Bulk Assignment Result DTO
 */
export class BulkAssignResultDto {
  @ApiProperty()
  totalRequested: number;

  @ApiProperty()
  successful: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [ProfileAssignmentResultDto] })
  results: ProfileAssignmentResultDto[];
}

/**
 * Profile Update Result DTO
 */
export class ProfileUpdateResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayMappingId: number;

  @ApiProperty({ type: [CalculationSettingResponseDto] })
  updatedSettings: CalculationSettingResponseDto[];

  @ApiPropertyOptional()
  error: string | null;
}

/**
 * Profile Removal Result DTO
 */
export class ProfileRemovalResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayMappingId: number;

  @ApiPropertyOptional()
  error: string | null;
}

/**
 * Staff Profile Summary DTO
 */
export class StaffProfileSummaryDto {
  @ApiProperty()
  staffId: string;

  @ApiProperty()
  staffName: string;

  @ApiProperty()
  simplePayEmployeeId: string;

  @ApiProperty()
  profiles: StaffProfileEntryDto[];
}

/**
 * Staff Profile Entry DTO
 */
export class StaffProfileEntryDto {
  @ApiProperty()
  mappingId: number;

  @ApiProperty()
  profileId: number;

  @ApiProperty()
  profileName: string;

  @ApiProperty()
  enabledCalculations: number;

  @ApiProperty()
  totalCalculations: number;
}

/**
 * Suggested Profile DTO
 */
export class SuggestedProfileDto {
  @ApiProperty()
  profileId: number;

  @ApiProperty()
  profileName: string;

  @ApiProperty()
  matchReason: string;

  @ApiProperty()
  confidence: number;
}

/**
 * Profile Suggestions Response DTO
 */
export class ProfileSuggestionsResponseDto {
  @ApiProperty()
  staffId: string;

  @ApiProperty()
  staffRole: string | null;

  @ApiProperty({ type: [SuggestedProfileDto] })
  suggestions: SuggestedProfileDto[];
}

// ============================================
// Helper Functions for DTO Mapping
// ============================================

/**
 * Map profile mapping sync entity to response DTO
 */
export function mapProfileMappingToResponseDto(entity: {
  id: string;
  tenantId: string;
  staffId: string;
  simplePayMappingId: number;
  simplePayProfileId: number;
  profileName: string;
  calculationSettings: Prisma.JsonValue;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): ProfileMappingResponseDto {
  const settings = parseCalculationSettings(entity.calculationSettings);
  const enabledCount = settings.filter((s) => s.isEnabled).length;

  return {
    id: entity.id,
    tenantId: entity.tenantId,
    staffId: entity.staffId,
    simplePayMappingId: entity.simplePayMappingId,
    simplePayProfileId: entity.simplePayProfileId,
    profileName: entity.profileName,
    calculationSettings: settings,
    enabledCalculations: enabledCount,
    totalCalculations: settings.length,
    syncedAt: entity.syncedAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Parse calculation settings from JSON
 */
export function parseCalculationSettings(
  json: Prisma.JsonValue,
): CalculationSettingResponseDto[] {
  if (!json || !Array.isArray(json)) {
    return [];
  }

  return json.map((item) => {
    const setting = item as Record<string, unknown>;
    return {
      calculationId:
        (setting.calculation_id as number) ||
        (setting.calculationId as number) ||
        0,
      calculationCode:
        (setting.calculation_code as string) ||
        (setting.calculationCode as string) ||
        '',
      calculationName:
        (setting.calculation_name as string) ||
        (setting.calculationName as string) ||
        '',
      isEnabled:
        (setting.is_enabled as boolean) ??
        (setting.isEnabled as boolean) ??
        false,
      amountCents:
        (setting.amount_cents as number | null) ??
        (setting.amountCents as number | null) ??
        null,
      percentage: (setting.percentage as number | null) ?? null,
      formula: (setting.formula as string | null) ?? null,
    };
  });
}

/**
 * Convert CalculationSettingDto to SimplePay API format
 */
export function toSimplePayCalculationSettings(
  settings: CalculationSettingDto[],
): Array<{
  calculation_id: number;
  is_enabled: boolean;
  amount_cents: number | null;
  percentage: number | null;
  formula: string | null;
}> {
  return settings.map((s) => ({
    calculation_id: s.calculationId,
    is_enabled: s.isEnabled,
    amount_cents: s.amountCents ?? null,
    percentage: s.percentage ?? null,
    formula: s.formula ?? null,
  }));
}
