/**
 * Query Validator Unit Tests
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/__tests__/query-validator.spec
 * @description Comprehensive tests for QueryValidator:
 * - Empty question rejection
 * - Missing tenantId rejection
 * - Max length enforcement (1000 chars)
 * - Blocked keyword detection (all 11 keywords)
 * - Valid query acceptance
 * - Sanitization (trimming)
 * - Case-insensitive keyword detection
 */

import { QueryValidator } from '../query-validator';

describe('QueryValidator', () => {
  let validator: QueryValidator;
  const VALID_TENANT_ID = 'tenant-abc-123';

  beforeEach(() => {
    validator = new QueryValidator();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Empty question rejection
  // ─────────────────────────────────────────────────────────────────────

  describe('empty question rejection', () => {
    it('should reject an empty string', () => {
      const result = validator.validate('', VALID_TENANT_ID);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('should reject a whitespace-only string', () => {
      const result = validator.validate('   ', VALID_TENANT_ID);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('empty');
    });

    it('should reject undefined-like empty input', () => {
      const result = validator.validate('', VALID_TENANT_ID);
      expect(result.isValid).toBe(false);
      expect(result.sanitizedQuestion).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Missing tenantId rejection
  // ─────────────────────────────────────────────────────────────────────

  describe('missing tenantId rejection', () => {
    it('should reject an empty tenantId', () => {
      const result = validator.validate('What is my revenue?', '');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Tenant');
    });

    it('should reject a whitespace-only tenantId', () => {
      const result = validator.validate('What is my revenue?', '   ');
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Tenant');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Max length enforcement
  // ─────────────────────────────────────────────────────────────────────

  describe('max length enforcement', () => {
    it('should accept a question at exactly 1000 characters', () => {
      const question = 'a'.repeat(1000);
      const result = validator.validate(question, VALID_TENANT_ID);
      expect(result.isValid).toBe(true);
    });

    it('should reject a question exceeding 1000 characters', () => {
      const question = 'a'.repeat(1001);
      const result = validator.validate(question, VALID_TENANT_ID);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('1000');
    });

    it('should reject a very long question', () => {
      const question = 'What is my revenue? '.repeat(200);
      const result = validator.validate(question, VALID_TENANT_ID);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('maximum length');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Blocked keyword detection (all 11 keywords)
  // ─────────────────────────────────────────────────────────────────────

  describe('blocked keyword detection', () => {
    const blockedKeywords = [
      'delete',
      'drop',
      'truncate',
      'update',
      'insert',
      'alter',
      'password',
      'token',
      'secret',
      'api_key',
      'credential',
    ];

    it.each(blockedKeywords)(
      'should reject question containing "%s"',
      (keyword: string) => {
        const question = `Can you ${keyword} the records?`;
        const result = validator.validate(question, VALID_TENANT_ID);
        expect(result.isValid).toBe(false);
        expect(result.reason).toContain('blocked keyword');
        expect(result.reason).toContain(keyword);
      },
    );

    it('should detect blocked keywords case-insensitively', () => {
      const result = validator.validate(
        'Please DELETE my records',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('blocked keyword');
    });

    it('should detect blocked keywords in mixed case', () => {
      const result = validator.validate(
        'Show me the Password field',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('blocked keyword');
    });

    it('should detect blocked keywords embedded in text', () => {
      const result = validator.validate(
        'How do I update my profile?',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('blocked keyword');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Valid query acceptance
  // ─────────────────────────────────────────────────────────────────────

  describe('valid query acceptance', () => {
    it('should accept a simple revenue question', () => {
      const result = validator.validate('What is my total revenue?', VALID_TENANT_ID);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedQuestion).toBe('What is my total revenue?');
    });

    it('should accept an expense question', () => {
      const result = validator.validate(
        'How much have I spent this month?',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(true);
    });

    it('should accept an invoice question', () => {
      const result = validator.validate(
        'How many invoices are outstanding?',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(true);
    });

    it('should accept a summary question', () => {
      const result = validator.validate(
        'Give me a financial summary',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(true);
    });

    it('should accept an enrollment question', () => {
      const result = validator.validate(
        'How many children are enrolled?',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Sanitization
  // ─────────────────────────────────────────────────────────────────────

  describe('sanitization', () => {
    it('should trim leading whitespace', () => {
      const result = validator.validate('  What is my revenue?', VALID_TENANT_ID);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedQuestion).toBe('What is my revenue?');
    });

    it('should trim trailing whitespace', () => {
      const result = validator.validate('What is my revenue?  ', VALID_TENANT_ID);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedQuestion).toBe('What is my revenue?');
    });

    it('should trim both leading and trailing whitespace', () => {
      const result = validator.validate(
        '   What is my revenue?   ',
        VALID_TENANT_ID,
      );
      expect(result.isValid).toBe(true);
      expect(result.sanitizedQuestion).toBe('What is my revenue?');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Read-only enforcement message
  // ─────────────────────────────────────────────────────────────────────

  describe('read-only enforcement', () => {
    it('should mention read-only in blocked keyword rejection', () => {
      const result = validator.validate('delete everything', VALID_TENANT_ID);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('read-only');
    });
  });
});
