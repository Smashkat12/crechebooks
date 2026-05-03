/**
 * Signup DTO — form-contract tests
 *
 * Verifies that the DTO accepts both the canonical field names
 * (adminName / adminEmail) and the legacy form field aliases
 * (fullName / email) without throwing VALIDATION_ERROR.
 *
 * Also verifies that optional metadata fields (numberOfChildren,
 * marketingOptIn/marketingConsent, acceptTerms/termsAccepted) are
 * accepted and do not trigger forbidNonWhitelisted.
 */

import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SignupDto } from './dto/signup.dto';

// Base valid payload using canonical field names (what the current form sends)
const canonicalPayload = {
  crecheName: 'Journey Test Creche',
  adminName: 'Sarah Johnson',
  adminEmail: 'sarah@journeytest.co.za',
  password: 'SecurePass123!',
  phone: '0821234567',
  province: 'Gauteng',
};

// Legacy payload using old form field names (what triggered JOURNEY1-005)
const legacyPayload = {
  crecheName: 'Journey Test Creche',
  fullName: 'Sarah Johnson',
  email: 'sarah@journeytest.co.za',
  password: 'SecurePass123!',
  phone: '0821234567',
  province: 'Gauteng',
};

// Full form payload including optional metadata fields
const fullLegacyPayload = {
  ...legacyPayload,
  numberOfChildren: '1-20',
  marketingOptIn: true,
  acceptTerms: true,
};

function toDto(plain: object): SignupDto {
  return plainToInstance(SignupDto, plain, { excludeExtraneousValues: false });
}

describe('SignupDto — field contract', () => {
  it('accepts canonical field names (adminName / adminEmail)', async () => {
    const dto = toDto(canonicalPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.adminName).toBeTruthy();
    expect(dto.adminEmail).toBe('sarah@journeytest.co.za');
  });

  it('accepts legacy field names (fullName / email) without validation errors', async () => {
    const dto = toDto(legacyPayload);
    const errors = await validate(dto);
    const errorFields = errors.map((e) => e.property);
    // With fullName present: adminName @ValidateIf skips → no adminName error
    // With email present: adminEmail @ValidateIf skips → no adminEmail error
    expect(errorFields).not.toContain('adminName');
    expect(errorFields).not.toContain('adminEmail');
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('sarah@journeytest.co.za');
    expect(dto.fullName).toBeTruthy();
  });

  it('does not produce validation errors for optional metadata fields', async () => {
    const dto = toDto(fullLegacyPayload);
    const errors = await validate(dto);
    const errorFields = errors.map((e) => e.property);
    expect(errorFields).not.toContain('numberOfChildren');
    expect(errorFields).not.toContain('marketingOptIn');
    expect(errorFields).not.toContain('acceptTerms');
  });

  it('accepts optional marketingConsent and termsAccepted aliases', async () => {
    const dto = toDto({
      ...canonicalPayload,
      marketingConsent: false,
      termsAccepted: true,
    });
    const errors = await validate(dto);
    const errorFields = errors.map((e) => e.property);
    expect(errorFields).not.toContain('marketingConsent');
    expect(errorFields).not.toContain('termsAccepted');
  });

  it('does not require addressLine1, city, postalCode', async () => {
    const dto = toDto(canonicalPayload); // no address fields
    const errors = await validate(dto);
    const addressErrors = errors.filter((e) =>
      ['addressLine1', 'city', 'postalCode'].includes(e.property),
    );
    expect(addressErrors).toHaveLength(0);
  });

  it('still validates that required fields are present', async () => {
    const dto = toDto({
      crecheName: 'Test',
      password: 'SecurePass123!',
      phone: '0821234567',
    });
    const errors = await validate(dto);
    const errorFields = errors.map((e) => e.property);
    // Neither adminEmail nor email provided → both @ValidateIf conditions fire (the other is absent)
    // So at least one of them should fail
    const hasEmailError =
      errorFields.includes('adminEmail') || errorFields.includes('email');
    expect(hasEmailError).toBe(true);
  });
});
