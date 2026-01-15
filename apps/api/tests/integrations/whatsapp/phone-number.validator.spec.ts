/**
 * Phone Number Validator Tests
 * TASK-INT-006: Input Validation Before DB Query
 *
 * Comprehensive tests for phone number validation including:
 * - E.164 format validation
 * - WhatsApp format validation
 * - Injection attack prevention (SQL, NoSQL, XSS)
 * - Normalization and sanitization
 */

import { validate } from 'class-validator';
import {
  IsPhoneNumber,
  IsPhoneNumberConstraint,
  E164_REGEX,
  WHATSAPP_PHONE_REGEX,
  normalizePhoneNumber,
  sanitizePhoneNumber,
  isValidPhoneNumber,
  containsInjectionPattern,
} from '../../../src/integrations/whatsapp/validators/phone-number.validator';

// Test class for decorator validation
class TestPhoneDto {
  @IsPhoneNumber()
  phone: string;

  constructor(phone: string) {
    this.phone = phone;
  }
}

describe('Phone Number Validator', () => {
  describe('E164_REGEX', () => {
    it('should match valid E.164 numbers', () => {
      const validNumbers = [
        '+27123456789', // South Africa
        '+14155551234', // US
        '+442071234567', // UK
        '+861312345678', // China
        '+81312345678', // Japan
        '+4930123456', // Germany (8 digits)
        '+12025551234', // US Washington DC
        '+61412345678', // Australia mobile
      ];

      validNumbers.forEach((num) => {
        expect(E164_REGEX.test(num)).toBe(true);
      });
    });

    it('should reject invalid E.164 numbers', () => {
      const invalidNumbers = [
        '27123456789', // Missing + prefix
        '+0123456789', // Starts with 0
        '+123', // Too short
        '+1234567890123456', // Too long (16 digits)
        '++27123456789', // Double +
        '+27-123-456-789', // Contains separators
        '+27 123 456 789', // Contains spaces
        '+27abc456789', // Contains letters
      ];

      invalidNumbers.forEach((num) => {
        expect(E164_REGEX.test(num)).toBe(false);
      });
    });
  });

  describe('WHATSAPP_PHONE_REGEX', () => {
    it('should match valid WhatsApp format numbers (without +)', () => {
      const validNumbers = [
        '27123456789', // South Africa
        '14155551234', // US
        '442071234567', // UK
        '861312345678', // China
        '81312345678', // Japan
        '4930123456', // Germany (8 digits)
      ];

      validNumbers.forEach((num) => {
        expect(WHATSAPP_PHONE_REGEX.test(num)).toBe(true);
      });
    });

    it('should reject invalid WhatsApp format numbers', () => {
      const invalidNumbers = [
        '+27123456789', // Has + prefix
        '0123456789', // Starts with 0
        '123', // Too short
        '1234567890123456', // Too long
        '27-123-456-789', // Contains separators
        '27abc456789', // Contains letters
      ];

      invalidNumbers.forEach((num) => {
        expect(WHATSAPP_PHONE_REGEX.test(num)).toBe(false);
      });
    });
  });

  describe('containsInjectionPattern', () => {
    describe('SQL injection detection', () => {
      it('should detect SQL injection attempts', () => {
        const sqlInjections = [
          '1; DROP TABLE users;--',
          "1' OR '1'='1",
          '1" OR "1"="1',
          '1; SELECT * FROM users--',
          '1 UNION SELECT password FROM users',
          '1/* comment */',
          '1; DELETE FROM payments;',
          "1; INSERT INTO admin VALUES('hacker');",
          "1; UPDATE users SET role='admin';",
        ];

        sqlInjections.forEach((input) => {
          expect(containsInjectionPattern(input)).toBe(true);
        });
      });
    });

    describe('NoSQL injection detection', () => {
      it('should detect NoSQL injection attempts', () => {
        const nosqlInjections = [
          '{$gt: ""}',
          '{$ne: null}',
          '{"$lt": 999999}',
          '{$regex: ".*"}',
          '{$where: "this.password.length > 0"}',
          '[$eq: "admin"]',
          '{"role": {$ne: null}}',
        ];

        nosqlInjections.forEach((input) => {
          expect(containsInjectionPattern(input)).toBe(true);
        });
      });
    });

    describe('XSS attack detection', () => {
      it('should detect XSS attempts', () => {
        const xssAttempts = [
          '<script>alert("xss")</script>',
          'javascript:alert(1)',
          '<img src=x onerror=alert(1)>',
        ];

        xssAttempts.forEach((input) => {
          expect(containsInjectionPattern(input)).toBe(true);
        });
      });
    });

    it('should not flag valid phone numbers', () => {
      const validNumbers = [
        '+27123456789',
        '27123456789',
        '+14155551234',
        '442071234567',
      ];

      validNumbers.forEach((num) => {
        expect(containsInjectionPattern(num)).toBe(false);
      });
    });

    it('should return true for non-string inputs', () => {
      expect(containsInjectionPattern(null as unknown as string)).toBe(true);
      expect(containsInjectionPattern(undefined as unknown as string)).toBe(
        true,
      );
      expect(containsInjectionPattern(123 as unknown as string)).toBe(true);
      expect(containsInjectionPattern({} as unknown as string)).toBe(true);
    });
  });

  describe('IsPhoneNumberConstraint', () => {
    const validator = new IsPhoneNumberConstraint();

    it('should validate E.164 format numbers', () => {
      expect(validator.validate('+27123456789', {} as never)).toBe(true);
      expect(validator.validate('+14155551234', {} as never)).toBe(true);
      expect(validator.validate('+442071234567', {} as never)).toBe(true);
    });

    it('should validate WhatsApp format numbers (without +)', () => {
      expect(validator.validate('27123456789', {} as never)).toBe(true);
      expect(validator.validate('14155551234', {} as never)).toBe(true);
      expect(validator.validate('442071234567', {} as never)).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(validator.validate('abc123', {} as never)).toBe(false);
      expect(validator.validate('123', {} as never)).toBe(false);
      expect(validator.validate('+1234567890123456789', {} as never)).toBe(
        false,
      );
      expect(validator.validate('', {} as never)).toBe(false);
      expect(validator.validate('   ', {} as never)).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(validator.validate(null, {} as never)).toBe(false);
      expect(validator.validate(undefined, {} as never)).toBe(false);
      expect(validator.validate(123456789, {} as never)).toBe(false);
      expect(validator.validate({}, {} as never)).toBe(false);
      expect(validator.validate([], {} as never)).toBe(false);
    });

    it('should reject injection attempts', () => {
      expect(validator.validate('1; DROP TABLE users;--', {} as never)).toBe(
        false,
      );
      expect(validator.validate('{$gt: ""}', {} as never)).toBe(false);
      expect(validator.validate("' OR '1'='1", {} as never)).toBe(false);
    });

    it('should provide a meaningful default message', () => {
      const message = validator.defaultMessage({} as never);
      expect(message).toContain('E.164');
      expect(message).toContain('WhatsApp');
    });
  });

  describe('@IsPhoneNumber decorator', () => {
    it('should pass validation for valid E.164 numbers', async () => {
      const dto = new TestPhoneDto('+27123456789');
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation for valid WhatsApp format', async () => {
      const dto = new TestPhoneDto('27123456789');
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation for invalid formats', async () => {
      const invalidCases = ['abc123', '123', '', '+0123456789'];

      for (const phone of invalidCases) {
        const dto = new TestPhoneDto(phone);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });

    it('should fail validation for injection attempts', async () => {
      const injectionAttempts = [
        '1; DROP TABLE users;--',
        '{$gt: ""}',
        "' OR '1'='1",
        'UNION SELECT * FROM users',
      ];

      for (const phone of injectionAttempts) {
        const dto = new TestPhoneDto(phone);
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('normalizePhoneNumber', () => {
    it('should add + prefix to WhatsApp format numbers', () => {
      expect(normalizePhoneNumber('27123456789')).toBe('+27123456789');
      expect(normalizePhoneNumber('14155551234')).toBe('+14155551234');
      expect(normalizePhoneNumber('442071234567')).toBe('+442071234567');
    });

    it('should keep existing + prefix', () => {
      expect(normalizePhoneNumber('+27123456789')).toBe('+27123456789');
      expect(normalizePhoneNumber('+14155551234')).toBe('+14155551234');
    });

    it('should remove common separators', () => {
      expect(normalizePhoneNumber('+27 123 456 789')).toBe('+27123456789');
      expect(normalizePhoneNumber('+27-123-456-789')).toBe('+27123456789');
      expect(normalizePhoneNumber('+27.123.456.789')).toBe('+27123456789');
      expect(normalizePhoneNumber('+1 (415) 555-1234')).toBe('+14155551234');
    });

    it('should throw for invalid phone numbers', () => {
      expect(() => normalizePhoneNumber('abc')).toThrow();
      expect(() => normalizePhoneNumber('123')).toThrow();
      expect(() => normalizePhoneNumber('')).toThrow();
      expect(() => normalizePhoneNumber('+0123456789')).toThrow();
    });

    it('should throw for non-string inputs', () => {
      expect(() => normalizePhoneNumber(null as unknown as string)).toThrow(
        'Phone number must be a string',
      );
      expect(() =>
        normalizePhoneNumber(undefined as unknown as string),
      ).toThrow('Phone number must be a string');
      expect(() => normalizePhoneNumber(123 as unknown as string)).toThrow(
        'Phone number must be a string',
      );
    });

    it('should throw for injection attempts', () => {
      expect(() => normalizePhoneNumber('1; DROP TABLE users;--')).toThrow(
        'suspicious characters',
      );
      expect(() => normalizePhoneNumber('{$gt: ""}')).toThrow(
        'suspicious characters',
      );
    });
  });

  describe('sanitizePhoneNumber', () => {
    it('should remove non-digit characters except +', () => {
      expect(sanitizePhoneNumber('+27 123-456-789')).toBe('+27123456789');
      expect(sanitizePhoneNumber('+1 (415) 555-1234')).toBe('+14155551234');
      expect(sanitizePhoneNumber('27.123.456.789')).toBe('27123456789');
    });

    it('should handle + prefix correctly', () => {
      expect(sanitizePhoneNumber('+27123456789')).toBe('+27123456789');
      expect(sanitizePhoneNumber('27+123+456')).toBe('27123456');
      expect(sanitizePhoneNumber('++27123456789')).toBe('+27123456789');
    });

    it('should remove SQL injection characters', () => {
      expect(sanitizePhoneNumber("27'; DROP TABLE--")).toBe('27');
      expect(sanitizePhoneNumber('27; SELECT * FROM')).toBe('27');
      expect(sanitizePhoneNumber("27' OR '1'='1")).toBe('2711');
    });

    it('should remove NoSQL injection characters', () => {
      expect(sanitizePhoneNumber('{$gt: ""}')).toBe('');
      expect(sanitizePhoneNumber('27{$ne: null}')).toBe('27');
    });

    it('should return empty string for non-string inputs', () => {
      expect(sanitizePhoneNumber(null as unknown as string)).toBe('');
      expect(sanitizePhoneNumber(undefined as unknown as string)).toBe('');
      expect(sanitizePhoneNumber(123 as unknown as string)).toBe('');
      expect(sanitizePhoneNumber({} as unknown as string)).toBe('');
    });

    it('should handle empty and whitespace strings', () => {
      expect(sanitizePhoneNumber('')).toBe('');
      expect(sanitizePhoneNumber('   ')).toBe('');
      expect(sanitizePhoneNumber('\t\n')).toBe('');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should return true for valid E.164 numbers', () => {
      expect(isValidPhoneNumber('+27123456789')).toBe(true);
      expect(isValidPhoneNumber('+14155551234')).toBe(true);
      expect(isValidPhoneNumber('+442071234567')).toBe(true);
    });

    it('should return true for valid WhatsApp format', () => {
      expect(isValidPhoneNumber('27123456789')).toBe(true);
      expect(isValidPhoneNumber('14155551234')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidPhoneNumber('abc')).toBe(false);
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
      expect(isValidPhoneNumber('   ')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(isValidPhoneNumber(null)).toBe(false);
      expect(isValidPhoneNumber(undefined)).toBe(false);
      expect(isValidPhoneNumber(123456789)).toBe(false);
      expect(isValidPhoneNumber({})).toBe(false);
      expect(isValidPhoneNumber([])).toBe(false);
    });

    it('should return false for injection attempts', () => {
      expect(isValidPhoneNumber('1; DROP TABLE users;--')).toBe(false);
      expect(isValidPhoneNumber('{$gt: ""}')).toBe(false);
      expect(isValidPhoneNumber("' OR '1'='1")).toBe(false);
    });

    it('should work as a type guard', () => {
      const input: unknown = '+27123456789';
      if (isValidPhoneNumber(input)) {
        // TypeScript should recognize input as string here
        const phone: string = input;
        expect(phone).toBe('+27123456789');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary length phone numbers', () => {
      // Minimum valid: 8 digits after country code (+ country code = 8+)
      expect(isValidPhoneNumber('+49301234')).toBe(true); // 8 digits total after +
      expect(isValidPhoneNumber('49301234')).toBe(true);

      // Maximum valid: 15 digits total after +
      expect(isValidPhoneNumber('+123456789012345')).toBe(true);
      expect(isValidPhoneNumber('123456789012345')).toBe(true);

      // Too short: 7 digits
      expect(isValidPhoneNumber('+4930123')).toBe(false);
      expect(isValidPhoneNumber('4930123')).toBe(false);

      // Too long: 16 digits
      expect(isValidPhoneNumber('+1234567890123456')).toBe(false);
      expect(isValidPhoneNumber('1234567890123456')).toBe(false);
    });

    it('should handle Unicode and special characters', () => {
      expect(sanitizePhoneNumber('+27①②③④⑤⑥⑦⑧⑨')).toBe('+27');
      expect(sanitizePhoneNumber('+27\u0000123')).toBe('+27123');
      expect(isValidPhoneNumber('+27①②③')).toBe(false);
    });

    it('should handle very long strings safely', () => {
      const longString = '1'.repeat(10000);
      expect(() => sanitizePhoneNumber(longString)).not.toThrow();
      expect(isValidPhoneNumber(longString)).toBe(false);
    });

    it('should handle mixed valid and invalid characters', () => {
      expect(sanitizePhoneNumber('+27(123)456-7890')).toBe('+271234567890');
      expect(sanitizePhoneNumber('  +27  123  456  789  ')).toBe(
        '+27123456789',
      );
    });
  });
});
