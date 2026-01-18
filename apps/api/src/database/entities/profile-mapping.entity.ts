/**
 * Profile Mapping Entity Types
 * TASK-SPAY-006: SimplePay Profile (Calculation Template) Mapping Management
 *
 * Provides types for profile/calculation template management,
 * including assignment, update, and bulk operations.
 *
 * SimplePay uses "profiles" (also called calculation templates) to define
 * sets of calculations that apply to employees. Each employee can have
 * multiple profile mappings defining which earnings/deductions apply.
 */

import type { ProfileMappingSync, Prisma } from '@prisma/client';

// Interface alias for the Prisma model
export type IProfileMappingSync = ProfileMappingSync;

// Type for calculation settings input
export type CalculationSettingsInput = Prisma.InputJsonValue;

/**
 * SimplePay Profile (Calculation Template) structure
 * Note: SimplePay returns wrapped responses like [{ profile: {...} }]
 */
export interface SimplePayProfile {
  id: number;
  name: string;
  description: string | null;
  calculation_items: SimplePayProfileCalculationItem[];
  is_default: boolean;
}

/**
 * SimplePay Profile Calculation Item
 */
export interface SimplePayProfileCalculationItem {
  id: number;
  code: string;
  name: string;
  type: 'earning' | 'deduction' | 'company_contribution';
  is_taxable: boolean;
  affects_uif: boolean;
  is_active: boolean;
}

/**
 * SimplePay Profile Mapping - associates a profile with an employee
 * Note: SimplePay returns wrapped responses like [{ profile_mapping: {...} }]
 */
export interface SimplePayProfileMapping {
  id: number;
  employee_id: number;
  profile_id: number;
  profile_name: string;
  calculation_settings: SimplePayProfileCalculationSetting[];
  created_at: string;
  updated_at: string;
}

/**
 * Profile mapping wrapper for unwrapping API responses
 */
export interface ProfileMappingWrapper {
  profile_mapping: SimplePayProfileMapping;
}

/**
 * Profile wrapper for unwrapping API responses
 */
export interface ProfileWrapper {
  profile: SimplePayProfile;
}

/**
 * SimplePay Profile Calculation Setting - individual calculation toggle
 */
export interface SimplePayProfileCalculationSetting {
  calculation_id: number;
  calculation_code: string;
  calculation_name: string;
  is_enabled: boolean;
  amount_cents: number | null;
  percentage: number | null;
  formula: string | null;
}

/**
 * SimplePay Template Names - MUST match exactly what's in SimplePay admin
 * Updated to match actual SimplePay templates created:
 * - General Staff (ID: 380792)
 * - Full-Time Teacher (ID: 380795)
 * - Part-Time Teacher (ID: 380796)
 * - Principal/Manager (ID: 380797)
 */
export const CRECHE_PROFILES = {
  FULL_TIME_TEACHER: 'Full-Time Teacher',
  PART_TIME_TEACHER: 'Part-Time Teacher',
  PRINCIPAL: 'Principal/Manager',
  GENERAL_STAFF: 'General Staff',
} as const;

export type CrecheProfileType = keyof typeof CRECHE_PROFILES;

/**
 * Role to profile mapping suggestions
 * Maps common creche staff positions to appropriate SimplePay template types
 */
export const ROLE_TO_PROFILE_SUGGESTIONS: Record<string, CrecheProfileType[]> =
  {
    // Teachers
    teacher: ['FULL_TIME_TEACHER'],
    'full-time teacher': ['FULL_TIME_TEACHER'],
    'full time teacher': ['FULL_TIME_TEACHER'],
    'part-time teacher': ['PART_TIME_TEACHER'],
    'part time teacher': ['PART_TIME_TEACHER'],
    'head teacher': ['FULL_TIME_TEACHER', 'PRINCIPAL'],
    assistant: ['PART_TIME_TEACHER'],
    'teacher assistant': ['PART_TIME_TEACHER'],

    // Management
    principal: ['PRINCIPAL'],
    manager: ['PRINCIPAL'],
    director: ['PRINCIPAL'],
    owner: ['PRINCIPAL'],

    // General Staff
    admin: ['GENERAL_STAFF'],
    administrator: ['GENERAL_STAFF'],
    secretary: ['GENERAL_STAFF'],
    cleaner: ['GENERAL_STAFF'],
    cook: ['GENERAL_STAFF'],
    chef: ['GENERAL_STAFF'],
    kitchen: ['GENERAL_STAFF'],
    driver: ['GENERAL_STAFF'],
    transport: ['GENERAL_STAFF'],
    gardener: ['GENERAL_STAFF'],
    maintenance: ['GENERAL_STAFF'],
    security: ['GENERAL_STAFF'],
  };

/**
 * Profile assignment result
 */
export interface ProfileAssignmentResult {
  success: boolean;
  staffId: string;
  simplePayMappingId: number | null;
  profileId: number;
  profileName: string;
  error: string | null;
}

/**
 * Bulk profile assignment result
 */
export interface BulkProfileAssignmentResult {
  totalRequested: number;
  successful: number;
  failed: number;
  results: ProfileAssignmentResult[];
}

/**
 * Calculation setting response (camelCase for API responses)
 */
export interface CalculationSettingResponse {
  calculationId: number;
  calculationCode: string;
  calculationName: string;
  isEnabled: boolean;
  amountCents: number | null;
  percentage: number | null;
  formula: string | null;
}

/**
 * Profile update result
 */
export interface ProfileUpdateResult {
  success: boolean;
  staffId: string;
  simplePayMappingId: number;
  updatedSettings: CalculationSettingResponse[];
  error: string | null;
}

/**
 * Profile removal result
 */
export interface ProfileRemovalResult {
  success: boolean;
  staffId: string;
  simplePayMappingId: number;
  error: string | null;
}

/**
 * Profile sync comparison between local and SimplePay
 */
export interface ProfileSyncComparison {
  staffId: string;
  simplePayEmployeeId: string;
  localMappings: number;
  remoteMappings: number;
  isInSync: boolean;
  differences: ProfileSyncDifference[];
}

/**
 * Individual profile sync difference
 */
export interface ProfileSyncDifference {
  type: 'missing_local' | 'missing_remote' | 'settings_mismatch';
  profileId: number;
  profileName: string;
  localSettings: SimplePayProfileCalculationSetting[] | null;
  remoteSettings: SimplePayProfileCalculationSetting[] | null;
}

/**
 * Available profiles for assignment
 */
export interface AvailableProfile {
  id: number;
  name: string;
  description: string | null;
  calculationCount: number;
  isDefault: boolean;
}

/**
 * Staff profile summary
 */
export interface StaffProfileSummary {
  staffId: string;
  staffName: string;
  simplePayEmployeeId: string;
  profiles: Array<{
    mappingId: number;
    profileId: number;
    profileName: string;
    enabledCalculations: number;
    totalCalculations: number;
  }>;
}

/**
 * Helper function: Parse SimplePay profile mapping response
 */
export function parseSimplePayProfileMapping(
  raw: SimplePayProfileMapping,
  staffId: string,
  tenantId: string,
): {
  tenantId: string;
  staffId: string;
  simplePayMappingId: number;
  simplePayProfileId: number;
  profileName: string;
  calculationSettings: SimplePayProfileCalculationSetting[];
} {
  return {
    tenantId,
    staffId,
    simplePayMappingId: raw.id,
    simplePayProfileId: raw.profile_id,
    profileName: raw.profile_name,
    calculationSettings: raw.calculation_settings || [],
  };
}

/**
 * Helper function: Get suggested profiles for a role
 */
export function getSuggestedProfilesForRole(role: string): CrecheProfileType[] {
  const normalizedRole = role.toLowerCase().trim();

  // Check for exact match first
  if (ROLE_TO_PROFILE_SUGGESTIONS[normalizedRole]) {
    return ROLE_TO_PROFILE_SUGGESTIONS[normalizedRole];
  }

  // Check for partial matches
  for (const [key, profiles] of Object.entries(ROLE_TO_PROFILE_SUGGESTIONS)) {
    if (normalizedRole.includes(key) || key.includes(normalizedRole)) {
      return profiles;
    }
  }

  // Default to General Staff if no match found
  return ['GENERAL_STAFF'];
}

/**
 * Helper function: Check if profile name matches a creche profile type
 */
export function matchesCrecheProfile(
  profileName: string,
  crecheProfile: CrecheProfileType,
): boolean {
  const targetName = CRECHE_PROFILES[crecheProfile].toLowerCase();
  return profileName.toLowerCase().includes(targetName);
}

/**
 * Helper function: Count enabled calculations in settings
 */
export function countEnabledCalculations(
  settings: SimplePayProfileCalculationSetting[],
): number {
  return settings.filter((s) => s.is_enabled).length;
}

/**
 * Helper function: Validate calculation settings structure
 */
export function isValidCalculationSettings(
  settings: unknown,
): settings is SimplePayProfileCalculationSetting[] {
  if (!Array.isArray(settings)) return false;
  return settings.every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      typeof s.calculation_id === 'number' &&
      typeof s.is_enabled === 'boolean',
  );
}
