/**
 * WhatsApp Onboarding Types
 * TASK-WA-011: State Machine and Session Model
 *
 * Type definitions for the conversational onboarding flow.
 */

import type { OnboardingStep, WaOnboardingStatus } from '@prisma/client';

export { OnboardingStep, WaOnboardingStatus };

/**
 * Data collected during onboarding, stored as JSON in the session
 */
export interface OnboardingCollectedData {
  parent?: {
    firstName?: string;
    surname?: string;
    email?: string;
    idNumber?: string;
    phone?: string; // From waId
    address?: {
      street: string;
      city: string;
      postalCode?: string;
    };
  };
  children?: Array<{
    firstName?: string;
    surname?: string; // TASK-WA-015: Per-child surname (no longer inherits parent's)
    dateOfBirth?: string; // YYYY-MM-DD
    allergies?: string;
  }>;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  idDocumentMediaUrl?: string;
  selectedFeeStructureId?: string; // TASK-WA-015: Selected fee structure
  feeAcknowledged?: boolean;
  startDate?: string; // YYYY-MM-DD: when child starts attending
  mediaConsent?: 'internal_only' | 'website' | 'social_media' | 'all' | 'none'; // TASK-WA-015
  authorizedCollectors?: Array<{
    name: string;
    idNumber: string;
    relationship: string;
  }>; // TASK-WA-015
  consentsAcknowledged?: boolean; // TASK-WA-015: Legal consents
  communicationPrefs?: {
    whatsapp?: boolean;
    email?: boolean;
  };
  popiaConsent?: boolean;
  popiaConsentAt?: string; // ISO timestamp
}

/**
 * Configuration for each onboarding step
 */
export interface OnboardingStepConfig {
  step: OnboardingStep;
  message:
    | string
    | ((data: OnboardingCollectedData, tenantName: string) => string);
  validation?: (input: string) => ValidationResult;
  quickReplies?: Array<{ title: string; id: string }>;
  expectsMedia?: boolean;
  isOptional?: boolean;
  skipValue?: string;
}

/**
 * Result of validating user input
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  /** Cleaned/normalized value to store */
  normalized?: string;
}

// ============================================
// Validation Functions
// ============================================

/**
 * SA ID number validation (13-digit Luhn algorithm)
 */
export function validateSAID(id: string): ValidationResult {
  const lower = id.toLowerCase().trim();
  if (lower === 'skip') return { valid: true, normalized: 'skip' };
  if (!/^\d{13}$/.test(id.trim())) {
    return { valid: false, error: 'SA ID must be exactly 13 digits.' };
  }
  const digits = id.trim().split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    let d = digits[i];
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  if (check !== digits[12]) {
    return {
      valid: false,
      error: 'Invalid SA ID number. Please check and try again.',
    };
  }
  return { valid: true, normalized: id.trim() };
}

/**
 * Email validation
 */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  return { valid: true, normalized: trimmed.toLowerCase() };
}

/**
 * SA phone number validation (+27XXXXXXXXX or 0XXXXXXXXX)
 */
export function validatePhone(phone: string): ValidationResult {
  const cleaned = phone.trim().replace(/[\s\-()]/g, '');
  if (!/^(\+27|0)\d{9}$/.test(cleaned)) {
    return {
      valid: false,
      error: 'Please enter a valid SA phone number (e.g., 0821234567).',
    };
  }
  // Normalize to +27 format
  const normalized = cleaned.startsWith('0')
    ? '+27' + cleaned.substring(1)
    : cleaned.startsWith('+27')
      ? cleaned
      : '+27' + cleaned;
  return { valid: true, normalized };
}

/**
 * Date of birth validation (DD/MM/YYYY, child must be 0-7 years)
 */
export function validateDOB(input: string): ValidationResult {
  const match = input.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!match) {
    return { valid: false, error: 'Please enter date as DD/MM/YYYY.' };
  }
  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { valid: false, error: 'Invalid date. Please enter as DD/MM/YYYY.' };
  }
  const now = new Date();
  if (date > now) {
    return { valid: false, error: 'Date of birth cannot be in the future.' };
  }
  const ageMs = now.getTime() - date.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears > 7) {
    return {
      valid: false,
      error: 'Child must be 7 years old or younger for creche enrollment.',
    };
  }
  // Store as YYYY-MM-DD
  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { valid: true, normalized };
}

/**
 * Start date validation (DD/MM/YYYY)
 * Allows past dates up to 1 year ago (child already attending) and future dates up to 6 months out.
 */
export function validateStartDate(input: string): ValidationResult {
  const match = input.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!match) {
    return { valid: false, error: 'Please enter a date as DD/MM/YYYY.' };
  }
  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { valid: false, error: 'Invalid date. Please enter as DD/MM/YYYY.' };
  }
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (date < oneYearAgo) {
    return {
      valid: false,
      error: 'Start date cannot be more than 1 year in the past.',
    };
  }
  const sixMonthsFromNow = new Date(now);
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  if (date > sixMonthsFromNow) {
    return {
      valid: false,
      error: 'Start date cannot be more than 6 months in the future.',
    };
  }
  const normalized = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { valid: true, normalized };
}

/**
 * Simple name validation (non-empty, reasonable length)
 */
export function validateName(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Please enter a name.' };
  }
  if (trimmed.length > 100) {
    return {
      valid: false,
      error: 'Name is too long. Please use 100 characters or less.',
    };
  }
  return { valid: true, normalized: trimmed };
}

// ============================================
// Constants
// ============================================

/** Session window duration in milliseconds (24 hours) */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Abandon threshold in milliseconds (7 days) */
export const ABANDON_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Trigger keywords to start onboarding */
export const ONBOARDING_TRIGGERS = [
  'enroll',
  'register',
  'sign up',
  'signup',
  'join',
];
