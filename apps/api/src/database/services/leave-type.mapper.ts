/**
 * LeaveTypeMapper Service
 * TASK-STAFF-004
 *
 * Provides bidirectional mapping between CrecheBooks internal leave types
 * and external system codes (SimplePay, Xero).
 *
 * Ensures consistent leave type translation across all integrations
 * while maintaining BCEA compliance information.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  LeaveType,
  LeaveTypeConfig,
  LEAVE_TYPE_CONFIG,
  SIMPLEPAY_LEAVE_TYPE_MAP,
  SIMPLEPAY_TO_INTERNAL_MAP,
  XERO_LEAVE_TYPE_MAP,
  XERO_TO_INTERNAL_MAP,
  STATUTORY_LEAVE_TYPES,
  PAID_LEAVE_TYPES,
  UIF_COVERED_LEAVE_TYPES,
} from '../constants/leave-types.constants';

/**
 * Mapping result with confidence indicator
 */
export interface MappingResult<T> {
  /** The mapped value */
  value: T;
  /** Whether this was an exact mapping or a fallback */
  isExactMatch: boolean;
  /** Original value that was mapped */
  originalValue: string;
}

/**
 * Leave Type Mapper Service
 *
 * Handles all leave type conversions between internal CrecheBooks
 * representation and external systems (SimplePay, Xero).
 */
@Injectable()
export class LeaveTypeMapper {
  private readonly logger = new Logger(LeaveTypeMapper.name);

  // Default fallback values for unmapped types
  private readonly SIMPLEPAY_FALLBACK = 'OTHER';
  private readonly XERO_FALLBACK = 'other-leave';
  private readonly INTERNAL_FALLBACK = LeaveType.SPECIAL;

  /**
   * Convert internal LeaveType to SimplePay leave type code
   *
   * @param internalType - Internal LeaveType enum value
   * @returns SimplePay leave type code string
   */
  toSimplePay(internalType: LeaveType): string {
    const mapped = SIMPLEPAY_LEAVE_TYPE_MAP[internalType];

    if (!mapped) {
      this.logger.warn(
        `No SimplePay mapping found for leave type: ${internalType}. Using fallback: ${this.SIMPLEPAY_FALLBACK}`,
      );
      return this.SIMPLEPAY_FALLBACK;
    }

    return mapped;
  }

  /**
   * Convert internal LeaveType to SimplePay with mapping metadata
   *
   * @param internalType - Internal LeaveType enum value
   * @returns MappingResult with value and metadata
   */
  toSimplePayWithMeta(internalType: LeaveType): MappingResult<string> {
    const mapped = SIMPLEPAY_LEAVE_TYPE_MAP[internalType];
    const isExactMatch = !!mapped;

    return {
      value: mapped || this.SIMPLEPAY_FALLBACK,
      isExactMatch,
      originalValue: internalType,
    };
  }

  /**
   * Convert SimplePay leave type code to internal LeaveType
   *
   * @param simplePayType - SimplePay leave type code
   * @returns Internal LeaveType enum value
   */
  fromSimplePay(simplePayType: string): LeaveType {
    const normalizedType = simplePayType.toUpperCase().trim();
    const mapped = SIMPLEPAY_TO_INTERNAL_MAP[normalizedType];

    if (!mapped) {
      this.logger.warn(
        `Unknown SimplePay leave type: ${simplePayType}. Using fallback: ${this.INTERNAL_FALLBACK}`,
      );
      return this.INTERNAL_FALLBACK;
    }

    return mapped;
  }

  /**
   * Convert SimplePay leave type code to internal LeaveType with metadata
   *
   * @param simplePayType - SimplePay leave type code
   * @returns MappingResult with value and metadata
   */
  fromSimplePayWithMeta(simplePayType: string): MappingResult<LeaveType> {
    const normalizedType = simplePayType.toUpperCase().trim();
    const mapped = SIMPLEPAY_TO_INTERNAL_MAP[normalizedType];
    const isExactMatch = !!mapped;

    return {
      value: mapped || this.INTERNAL_FALLBACK,
      isExactMatch,
      originalValue: simplePayType,
    };
  }

  /**
   * Convert internal LeaveType to Xero leave type identifier
   *
   * @param internalType - Internal LeaveType enum value
   * @returns Xero leave type identifier string
   */
  toXero(internalType: LeaveType): string {
    const mapped = XERO_LEAVE_TYPE_MAP[internalType];

    if (!mapped) {
      this.logger.warn(
        `No Xero mapping found for leave type: ${internalType}. Using fallback: ${this.XERO_FALLBACK}`,
      );
      return this.XERO_FALLBACK;
    }

    return mapped;
  }

  /**
   * Convert internal LeaveType to Xero with mapping metadata
   *
   * @param internalType - Internal LeaveType enum value
   * @returns MappingResult with value and metadata
   */
  toXeroWithMeta(internalType: LeaveType): MappingResult<string> {
    const mapped = XERO_LEAVE_TYPE_MAP[internalType];
    const isExactMatch = !!mapped;

    return {
      value: mapped || this.XERO_FALLBACK,
      isExactMatch,
      originalValue: internalType,
    };
  }

  /**
   * Convert Xero leave type identifier to internal LeaveType
   *
   * @param xeroType - Xero leave type identifier
   * @returns Internal LeaveType enum value
   */
  fromXero(xeroType: string): LeaveType {
    const normalizedType = xeroType.toLowerCase().trim();
    const mapped = XERO_TO_INTERNAL_MAP[normalizedType];

    if (!mapped) {
      this.logger.warn(
        `Unknown Xero leave type: ${xeroType}. Using fallback: ${this.INTERNAL_FALLBACK}`,
      );
      return this.INTERNAL_FALLBACK;
    }

    return mapped;
  }

  /**
   * Convert Xero leave type identifier to internal LeaveType with metadata
   *
   * @param xeroType - Xero leave type identifier
   * @returns MappingResult with value and metadata
   */
  fromXeroWithMeta(xeroType: string): MappingResult<LeaveType> {
    const normalizedType = xeroType.toLowerCase().trim();
    const mapped = XERO_TO_INTERNAL_MAP[normalizedType];
    const isExactMatch = !!mapped;

    return {
      value: mapped || this.INTERNAL_FALLBACK,
      isExactMatch,
      originalValue: xeroType,
    };
  }

  /**
   * Get configuration for a leave type
   *
   * @param type - LeaveType enum value
   * @returns LeaveTypeConfig with all configuration details
   */
  getConfig(type: LeaveType): LeaveTypeConfig {
    const config = LEAVE_TYPE_CONFIG[type];

    if (!config) {
      this.logger.error(`No configuration found for leave type: ${type}`);
      throw new Error(`Unknown leave type: ${type}`);
    }

    return config;
  }

  /**
   * Get configuration safely (returns null instead of throwing)
   *
   * @param type - LeaveType enum value
   * @returns LeaveTypeConfig or null if not found
   */
  getConfigSafe(type: LeaveType): LeaveTypeConfig | null {
    return LEAVE_TYPE_CONFIG[type] || null;
  }

  /**
   * Check if a leave type is statutory under BCEA
   *
   * @param type - LeaveType enum value
   * @returns True if the leave type is statutory
   */
  isStatutory(type: LeaveType): boolean {
    const config = LEAVE_TYPE_CONFIG[type];
    return config?.isStatutory ?? false;
  }

  /**
   * Check if a leave type is paid by the employer
   *
   * @param type - LeaveType enum value
   * @returns True if the leave type is paid
   */
  isPaid(type: LeaveType): boolean {
    const config = LEAVE_TYPE_CONFIG[type];
    return config?.isPaid ?? false;
  }

  /**
   * Check if a leave type is covered by UIF
   *
   * @param type - LeaveType enum value
   * @returns True if the leave type is UIF-covered
   */
  isUifCovered(type: LeaveType): boolean {
    return UIF_COVERED_LEAVE_TYPES.includes(type);
  }

  /**
   * Check if a leave type requires a certificate/documentation
   *
   * @param type - LeaveType enum value
   * @returns True if documentation is required
   */
  requiresCertificate(type: LeaveType): boolean {
    const config = LEAVE_TYPE_CONFIG[type];
    return config?.requiresCertificate ?? false;
  }

  /**
   * Get the default entitlement for a leave type
   *
   * @param type - LeaveType enum value
   * @returns Default entitlement in days, or null if not applicable
   */
  getDefaultEntitlement(type: LeaveType): number | null {
    const config = LEAVE_TYPE_CONFIG[type];
    return config?.defaultEntitlement ?? null;
  }

  /**
   * Get the human-readable name for a leave type
   *
   * @param type - LeaveType enum value
   * @returns Human-readable leave type name
   */
  getName(type: LeaveType): string {
    const config = LEAVE_TYPE_CONFIG[type];
    return config?.name ?? type;
  }

  /**
   * Get the description for a leave type
   *
   * @param type - LeaveType enum value
   * @returns Leave type description
   */
  getDescription(type: LeaveType): string {
    const config = LEAVE_TYPE_CONFIG[type];
    return config?.description ?? '';
  }

  /**
   * Get all available leave types
   *
   * @returns Array of all LeaveType enum values
   */
  getAllTypes(): LeaveType[] {
    return Object.values(LeaveType);
  }

  /**
   * Get all statutory leave types (BCEA-mandated)
   *
   * @returns Array of statutory LeaveType enum values
   */
  getStatutoryTypes(): LeaveType[] {
    return [...STATUTORY_LEAVE_TYPES];
  }

  /**
   * Get all paid leave types
   *
   * @returns Array of paid LeaveType enum values
   */
  getPaidTypes(): LeaveType[] {
    return [...PAID_LEAVE_TYPES];
  }

  /**
   * Get all UIF-covered leave types
   *
   * @returns Array of UIF-covered LeaveType enum values
   */
  getUifCoveredTypes(): LeaveType[] {
    return [...UIF_COVERED_LEAVE_TYPES];
  }

  /**
   * Get all non-statutory (custom) leave types
   *
   * @returns Array of non-statutory LeaveType enum values
   */
  getNonStatutoryTypes(): LeaveType[] {
    return Object.values(LeaveType).filter((type) => !this.isStatutory(type));
  }

  /**
   * Validate if a string is a valid LeaveType
   *
   * @param value - String value to validate
   * @returns True if the value is a valid LeaveType
   */
  isValidLeaveType(value: string): value is LeaveType {
    return Object.values(LeaveType).includes(value as LeaveType);
  }

  /**
   * Parse a string to LeaveType enum
   *
   * @param value - String value to parse
   * @returns LeaveType if valid, null otherwise
   */
  parseLeaveType(value: string): LeaveType | null {
    const normalizedValue = value.toUpperCase().trim().replace(/-/g, '_');

    if (this.isValidLeaveType(normalizedValue)) {
      return normalizedValue;
    }

    // Try to find by name
    const foundEntry = Object.entries(LEAVE_TYPE_CONFIG).find(
      ([, config]) =>
        config.name.toLowerCase() === value.toLowerCase().trim() ||
        config.type.toLowerCase() === value.toLowerCase().trim(),
    );

    if (foundEntry) {
      return foundEntry[0] as LeaveType;
    }

    return null;
  }

  /**
   * Get all leave types with their configurations
   *
   * @returns Array of LeaveTypeConfig objects
   */
  getAllConfigs(): LeaveTypeConfig[] {
    return Object.values(LEAVE_TYPE_CONFIG);
  }

  /**
   * Get leave types filtered by criteria
   *
   * @param criteria - Filter criteria
   * @returns Array of matching LeaveType values
   */
  getTypesBy(criteria: {
    isPaid?: boolean;
    isStatutory?: boolean;
    requiresCertificate?: boolean;
  }): LeaveType[] {
    return Object.values(LeaveType).filter((type) => {
      const config = LEAVE_TYPE_CONFIG[type];
      if (!config) return false;

      if (criteria.isPaid !== undefined && config.isPaid !== criteria.isPaid) {
        return false;
      }
      if (
        criteria.isStatutory !== undefined &&
        config.isStatutory !== criteria.isStatutory
      ) {
        return false;
      }
      if (
        criteria.requiresCertificate !== undefined &&
        config.requiresCertificate !== criteria.requiresCertificate
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Bulk convert internal types to SimplePay codes
   *
   * @param types - Array of internal LeaveType values
   * @returns Record mapping internal types to SimplePay codes
   */
  bulkToSimplePay(types: LeaveType[]): Record<LeaveType, string> {
    return types.reduce(
      (acc, type) => {
        acc[type] = this.toSimplePay(type);
        return acc;
      },
      {} as Record<LeaveType, string>,
    );
  }

  /**
   * Bulk convert internal types to Xero identifiers
   *
   * @param types - Array of internal LeaveType values
   * @returns Record mapping internal types to Xero identifiers
   */
  bulkToXero(types: LeaveType[]): Record<LeaveType, string> {
    return types.reduce(
      (acc, type) => {
        acc[type] = this.toXero(type);
        return acc;
      },
      {} as Record<LeaveType, string>,
    );
  }
}
