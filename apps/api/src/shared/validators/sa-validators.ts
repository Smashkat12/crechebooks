/**
 * South African Custom Validators
 * TASK-STAFF-002: Staff DTO Validation
 *
 * Custom class-validator decorators for South African specific formats:
 * - SA ID Number (13 digits with Luhn checksum)
 * - SA Phone Number (+27 or 0 prefix)
 * - SA Tax Number (10 digits)
 * - SA Bank Branch Code (6 digits)
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

// ============================================
// SA ID Number Validator (Luhn Algorithm)
// ============================================

/**
 * Validates a South African ID number using the Luhn algorithm.
 *
 * SA ID Format: YYMMDD GSSS C A Z (13 digits total)
 * - YYMMDD: Date of birth (positions 0-5)
 * - G: Gender digit (position 6): 0-4 = female, 5-9 = male
 * - SSS: Sequence number (positions 7-9)
 * - C: Citizenship (position 10): 0 = SA citizen, 1 = permanent resident
 * - A: Usually 8 (position 11, was used for racial classification, now deprecated)
 * - Z: Checksum digit (position 12, validated using Luhn algorithm)
 *
 * The Luhn algorithm (mod 10) works as follows:
 * 1. Starting from the rightmost digit (check digit), double every second digit
 * 2. If doubling results in a number > 9, subtract 9
 * 3. Sum all digits
 * 4. Valid if sum is divisible by 10
 *
 * @param idNumber - The 13-digit SA ID number to validate
 * @returns true if the ID number is valid (passes Luhn check), false otherwise
 *
 * @example
 * validateSAIDNumber('8001015009087') // true - valid ID
 * validateSAIDNumber('8001015009088') // false - invalid checksum
 */
export function validateSAIDNumber(idNumber: string): boolean {
  // Must be exactly 13 digits
  if (!/^[0-9]{13}$/.test(idNumber)) {
    return false;
  }

  // Luhn algorithm validation (mod 10)
  // For a 13-digit number, we double digits at positions 1, 3, 5, 7, 9, 11 (0-indexed)
  // This is because 13 % 2 = 1, so parity starts at odd positions
  let sum = 0;
  const parity = idNumber.length % 2; // 1 for 13 digits

  for (let i = 0; i < idNumber.length; i++) {
    let digit = parseInt(idNumber[i], 10);

    // Double every second digit (alternating based on parity)
    if (i % 2 === parity) {
      digit *= 2;
      // If doubling results in a number > 9, subtract 9
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  // Valid if sum is divisible by 10
  return sum % 10 === 0;
}

/**
 * Extracts date of birth from SA ID number
 * @param idNumber - The 13-digit SA ID number
 * @returns Date object or null if invalid
 */
export function extractDateOfBirthFromSAID(idNumber: string): Date | null {
  if (!/^[0-9]{13}$/.test(idNumber)) {
    return null;
  }

  const yy = parseInt(idNumber.substring(0, 2), 10);
  const mm = parseInt(idNumber.substring(2, 4), 10);
  const dd = parseInt(idNumber.substring(4, 6), 10);

  // Determine century: if yy > current year's last 2 digits, assume 1900s
  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const year = century + yy;

  // Validate month and day
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const date = new Date(year, mm - 1, dd);
  // Verify the date is valid (handles edge cases like Feb 30)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }

  return date;
}

/**
 * Extracts gender from SA ID number
 * @param idNumber - The 13-digit SA ID number
 * @returns 'male', 'female', or null if invalid
 */
export function extractGenderFromSAID(
  idNumber: string,
): 'male' | 'female' | null {
  if (!/^[0-9]{13}$/.test(idNumber)) {
    return null;
  }

  const genderDigit = parseInt(idNumber[6], 10);
  return genderDigit >= 5 ? 'male' : 'female';
}

/**
 * Checks if the SA ID indicates SA citizenship
 * @param idNumber - The 13-digit SA ID number
 * @returns true if SA citizen, false if permanent resident, null if invalid
 */
export function isSACitizen(idNumber: string): boolean | null {
  if (!/^[0-9]{13}$/.test(idNumber)) {
    return null;
  }

  const citizenDigit = parseInt(idNumber[10], 10);
  return citizenDigit === 0;
}

@ValidatorConstraint({ name: 'isSAIDNumber', async: false })
export class IsSAIDNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    return validateSAIDNumber(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid 13-digit South African ID number`;
  }
}

/**
 * Decorator to validate South African ID numbers
 * Uses Luhn algorithm for checksum validation
 *
 * @example
 * ```typescript
 * class CreateStaffDto {
 *   @IsSAIDNumber({ message: 'Invalid SA ID number' })
 *   idNumber: string;
 * }
 * ```
 */
export function IsSAIDNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSAIDNumberConstraint,
    });
  };
}

// ============================================
// SA Phone Number Validator
// ============================================

/**
 * SA Phone Number Format:
 * - Must start with +27 or 0
 * - Next digit must be 6, 7, or 8 (mobile prefixes)
 * - Followed by 8 more digits
 * - Total: 10 digits (with 0) or 12 characters (with +27)
 *
 * Valid examples: +27821234567, 0821234567, +27612345678
 */
export const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/;

@ValidatorConstraint({ name: 'isSAPhoneNumber', async: false })
export class IsSAPhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    // Remove spaces and dashes for validation
    const cleaned = value.replace(/[\s-]/g, '');
    return SA_PHONE_REGEX.test(cleaned);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid South African phone number (format: +27XXXXXXXXX or 0XXXXXXXXX)`;
  }
}

/**
 * Decorator to validate South African phone numbers
 * Accepts formats: +27XXXXXXXXX or 0XXXXXXXXX (mobile prefixes 6, 7, 8)
 *
 * @example
 * ```typescript
 * class CreateStaffDto {
 *   @IsSAPhoneNumber()
 *   phone: string;
 * }
 * ```
 */
export function IsSAPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSAPhoneNumberConstraint,
    });
  };
}

// ============================================
// SA Tax Number Validator
// ============================================

/**
 * SA Tax Number Format:
 * - Exactly 10 digits
 * - No spaces or special characters
 */
export const SA_TAX_NUMBER_REGEX = /^[0-9]{10}$/;

@ValidatorConstraint({ name: 'isSATaxNumber', async: false })
export class IsSATaxNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    // Remove spaces for validation
    const cleaned = value.replace(/\s/g, '');
    return SA_TAX_NUMBER_REGEX.test(cleaned);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid 10-digit South African tax number`;
  }
}

/**
 * Decorator to validate South African tax numbers
 * Must be exactly 10 digits
 *
 * @example
 * ```typescript
 * class CreateStaffDto {
 *   @IsSATaxNumber()
 *   taxNumber: string;
 * }
 * ```
 */
export function IsSATaxNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSATaxNumberConstraint,
    });
  };
}

// ============================================
// SA Bank Branch Code Validator
// ============================================

/**
 * SA Bank Branch Code Format:
 * - Exactly 6 digits
 * - No spaces or special characters
 *
 * Common universal branch codes:
 * - ABSA: 632005
 * - Capitec: 470010
 * - FNB: 250655
 * - Nedbank: 198765
 * - Standard Bank: 051001
 */
export const SA_BRANCH_CODE_REGEX = /^[0-9]{6}$/;

@ValidatorConstraint({ name: 'isSABranchCode', async: false })
export class IsSABranchCodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    // Remove spaces for validation
    const cleaned = value.replace(/\s/g, '');
    return SA_BRANCH_CODE_REGEX.test(cleaned);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid 6-digit South African bank branch code`;
  }
}

/**
 * Decorator to validate South African bank branch codes
 * Must be exactly 6 digits
 *
 * @example
 * ```typescript
 * class CreateStaffDto {
 *   @IsSABranchCode()
 *   bankBranchCode: string;
 * }
 * ```
 */
export function IsSABranchCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSABranchCodeConstraint,
    });
  };
}

// ============================================
// SA Bank Account Number Validator
// ============================================

/**
 * SA Bank Account Number Format:
 * - Between 6 and 16 digits (varies by bank)
 * - Most common: 10-11 digits
 */
export const SA_BANK_ACCOUNT_REGEX = /^[0-9]{6,16}$/;

@ValidatorConstraint({ name: 'isSABankAccount', async: false })
export class IsSABankAccountConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    // Remove spaces and dashes for validation
    const cleaned = value.replace(/[\s-]/g, '');
    return SA_BANK_ACCOUNT_REGEX.test(cleaned);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid South African bank account number (6-16 digits)`;
  }
}

/**
 * Decorator to validate South African bank account numbers
 * Must be between 6 and 16 digits
 *
 * @example
 * ```typescript
 * class CreateStaffDto {
 *   @IsSABankAccount()
 *   bankAccount: string;
 * }
 * ```
 */
export function IsSABankAccount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSABankAccountConstraint,
    });
  };
}
