/**
 * Profile Selector
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Automatically selects the appropriate SimplePay profile based on
 * staff role and employment type.
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * Staff Role for profile matching
 */
export const StaffRole = {
  PRINCIPAL: 'PRINCIPAL',
  TEACHER: 'TEACHER',
  ASSISTANT: 'ASSISTANT',
  KITCHEN: 'KITCHEN',
  ADMIN: 'ADMIN',
  CLEANER: 'CLEANER',
  DRIVER: 'DRIVER',
  SECURITY: 'SECURITY',
  MAINTENANCE: 'MAINTENANCE',
  OTHER: 'OTHER',
} as const;

export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

/**
 * Employment type for profile matching
 */
export const EmploymentType = {
  PERMANENT: 'PERMANENT',
  CONTRACT: 'CONTRACT',
  CASUAL: 'CASUAL',
} as const;

export type EmploymentType =
  (typeof EmploymentType)[keyof typeof EmploymentType];

/**
 * Profile selection rules
 * Priority: Lower number = higher priority
 */
export interface ProfileRule {
  role: StaffRole | '*';
  employmentType: EmploymentType | '*';
  profileName: string;
  priority: number;
}

/**
 * Default profile rules for creche/daycare
 * Based on TASK-SPAY-008 specification
 */
export const DEFAULT_PROFILE_RULES: ProfileRule[] = [
  // Specific role + employment type combinations
  {
    role: 'PRINCIPAL',
    employmentType: 'PERMANENT',
    profileName: 'Principal/Manager',
    priority: 1,
  },
  {
    role: 'TEACHER',
    employmentType: 'PERMANENT',
    profileName: 'Full-Time Teacher',
    priority: 2,
  },
  {
    role: 'TEACHER',
    employmentType: 'CONTRACT',
    profileName: 'Part-Time Staff',
    priority: 3,
  },
  {
    role: 'ASSISTANT',
    employmentType: '*',
    profileName: 'Teaching Assistant',
    priority: 4,
  },
  {
    role: 'KITCHEN',
    employmentType: '*',
    profileName: 'Kitchen Staff',
    priority: 5,
  },
  {
    role: 'ADMIN',
    employmentType: '*',
    profileName: 'Admin Staff',
    priority: 6,
  },

  // Wildcard rules (any role)
  {
    role: '*',
    employmentType: 'CASUAL',
    profileName: 'Casual Worker',
    priority: 10,
  },

  // Fallback rule
  {
    role: '*',
    employmentType: '*',
    profileName: 'General Staff',
    priority: 100,
  },
];

/**
 * Profile selection result
 */
export interface ProfileSelectionResult {
  profileName: string;
  matchedRule: ProfileRule;
  confidence: number; // 0-1, higher is more specific match
}

/**
 * Profile Selector - selects appropriate profile based on staff details
 */
@Injectable()
export class ProfileSelector {
  private readonly logger = new Logger(ProfileSelector.name);
  private readonly rules: ProfileRule[];

  constructor() {
    this.rules = [...DEFAULT_PROFILE_RULES].sort(
      (a, b) => a.priority - b.priority,
    );
  }

  /**
   * Select profile based on role and employment type
   */
  selectProfile(
    position: string | null,
    employmentType: string,
  ): ProfileSelectionResult {
    const role = this.normalizeRole(position);
    const empType = this.normalizeEmploymentType(employmentType);

    this.logger.debug(
      `Selecting profile for role=${role}, employmentType=${empType}`,
    );

    // Find matching rule
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, role, empType)) {
        const confidence = this.calculateConfidence(rule);
        this.logger.log(
          `Selected profile: ${rule.profileName} (confidence: ${confidence})`,
        );
        return {
          profileName: rule.profileName,
          matchedRule: rule,
          confidence,
        };
      }
    }

    // Should never reach here due to fallback rule, but just in case
    const fallbackRule = this.rules[this.rules.length - 1];
    return {
      profileName: fallbackRule.profileName,
      matchedRule: fallbackRule,
      confidence: 0.1,
    };
  }

  /**
   * Get all available profile names
   */
  getAvailableProfiles(): string[] {
    return [...new Set(this.rules.map((r) => r.profileName))];
  }

  /**
   * Check if a rule matches the given role and employment type
   */
  private ruleMatches(
    rule: ProfileRule,
    role: StaffRole,
    employmentType: EmploymentType,
  ): boolean {
    const roleMatches = rule.role === '*' || rule.role === role;
    const empTypeMatches =
      rule.employmentType === '*' || rule.employmentType === employmentType;
    return roleMatches && empTypeMatches;
  }

  /**
   * Calculate confidence score based on rule specificity
   */
  private calculateConfidence(rule: ProfileRule): number {
    let score = 0;

    // Specific role match
    if (rule.role !== '*') {
      score += 0.5;
    }

    // Specific employment type match
    if (rule.employmentType !== '*') {
      score += 0.5;
    }

    // Adjust based on priority (lower priority = higher confidence)
    const priorityBonus = Math.max(0, (100 - rule.priority) / 200);
    score += priorityBonus;

    return Math.min(1, score);
  }

  /**
   * Normalize position string to StaffRole
   */
  normalizeRole(position: string | null): StaffRole {
    if (!position) return StaffRole.OTHER;

    const normalized = position.toUpperCase().trim();

    // Principal/Manager
    if (
      normalized.includes('PRINCIPAL') ||
      normalized.includes('DIRECTOR') ||
      normalized.includes('MANAGER') ||
      normalized.includes('HEAD')
    ) {
      return StaffRole.PRINCIPAL;
    }

    // Teacher
    if (normalized.includes('TEACHER') && !normalized.includes('ASSISTANT')) {
      return StaffRole.TEACHER;
    }

    // Assistant
    if (
      normalized.includes('ASSISTANT') ||
      normalized.includes('AIDE') ||
      normalized.includes('HELPER')
    ) {
      return StaffRole.ASSISTANT;
    }

    // Kitchen
    if (
      normalized.includes('KITCHEN') ||
      normalized.includes('COOK') ||
      normalized.includes('CHEF') ||
      normalized.includes('FOOD')
    ) {
      return StaffRole.KITCHEN;
    }

    // Admin
    if (
      normalized.includes('ADMIN') ||
      normalized.includes('SECRETARY') ||
      normalized.includes('RECEPTIONIST') ||
      normalized.includes('CLERK') ||
      normalized.includes('OFFICE')
    ) {
      return StaffRole.ADMIN;
    }

    // Cleaner
    if (
      normalized.includes('CLEAN') ||
      normalized.includes('DOMESTIC') ||
      normalized.includes('JANITORIAL')
    ) {
      return StaffRole.CLEANER;
    }

    // Driver
    if (normalized.includes('DRIVER') || normalized.includes('TRANSPORT')) {
      return StaffRole.DRIVER;
    }

    // Security
    if (normalized.includes('SECURITY') || normalized.includes('GUARD')) {
      return StaffRole.SECURITY;
    }

    // Maintenance
    if (
      normalized.includes('MAINTENANCE') ||
      normalized.includes('HANDYMAN') ||
      normalized.includes('GARDENER')
    ) {
      return StaffRole.MAINTENANCE;
    }

    return StaffRole.OTHER;
  }

  /**
   * Normalize employment type string
   */
  normalizeEmploymentType(employmentType: string): EmploymentType {
    const normalized = employmentType.toUpperCase().trim();

    if (normalized === 'PERMANENT' || normalized === 'FULL_TIME') {
      return EmploymentType.PERMANENT;
    }

    if (normalized === 'CONTRACT' || normalized === 'TEMPORARY') {
      return EmploymentType.CONTRACT;
    }

    if (normalized === 'CASUAL' || normalized === 'PART_TIME') {
      return EmploymentType.CASUAL;
    }

    // Default to permanent
    return EmploymentType.PERMANENT;
  }

  /**
   * Add a custom rule
   */
  addRule(rule: ProfileRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a rule by profile name
   */
  removeRuleByProfile(profileName: string): boolean {
    const index = this.rules.findIndex((r) => r.profileName === profileName);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get rules for a specific role
   */
  getRulesForRole(role: StaffRole): ProfileRule[] {
    return this.rules.filter((r) => r.role === role || r.role === '*');
  }
}
