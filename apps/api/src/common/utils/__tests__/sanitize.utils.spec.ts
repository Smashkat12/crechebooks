/**
 * Input Sanitization Utilities Tests
 * SEC-006: Comprehensive tests for sanitization functions
 */

import {
  sanitizeString,
  sanitizeHtml,
  sanitizeEmail,
  sanitizePhone,
  sanitizeIdNumber,
  sanitizeTaxNumber,
  sanitizeBankAccount,
  sanitizeBranchCode,
  sanitizeName,
  sanitizeText,
  escapeSqlLike,
  isSqlSafe,
} from '../sanitize.utils';

describe('Sanitization Utilities', () => {
  // ============================================
  // sanitizeString Tests
  // ============================================
  describe('sanitizeString', () => {
    it('should return empty string for null', () => {
      expect(sanitizeString(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString({})).toBe('');
      expect(sanitizeString([])).toBe('');
      expect(sanitizeString(true)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
      expect(sanitizeString('\t\nhello\t\n')).toBe('hello');
    });

    it('should escape HTML special characters', () => {
      expect(sanitizeString('<script>')).toBe('&lt;script&gt;');
      expect(sanitizeString('a & b')).toBe('a &amp; b');
      expect(sanitizeString('"quoted"')).toBe('&quot;quoted&quot;');
      expect(sanitizeString("'single'")).toBe('&#x27;single&#x27;');
      expect(sanitizeString('a/b')).toBe('a&#x2F;b');
      expect(sanitizeString('`backtick`')).toBe('&#x60;backtick&#x60;');
    });

    it('should escape XSS attack vectors', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
      );
      expect(sanitizeString('<img onerror="evil()">')).toBe(
        '&lt;img onerror=&quot;evil()&quot;&gt;',
      );
      expect(sanitizeString('<a href="javascript:evil()">')).toBe(
        '&lt;a href=&quot;javascript:evil()&quot;&gt;',
      );
    });

    it('should remove control characters', () => {
      expect(sanitizeString('hello\x00world')).toBe('helloworld');
      expect(sanitizeString('hello\x1Fworld')).toBe('helloworld');
      expect(sanitizeString('hello\x7Fworld')).toBe('helloworld');
    });

    it('should preserve safe characters', () => {
      expect(sanitizeString('Hello World 123')).toBe('Hello World 123');
      expect(sanitizeString('user@example.com')).toBe('user@example.com');
      expect(sanitizeString('Hello\nWorld')).toBe('Hello\nWorld');
    });
  });

  // ============================================
  // sanitizeHtml Tests
  // ============================================
  describe('sanitizeHtml', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeHtml(null)).toBe('');
      expect(sanitizeHtml(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(sanitizeHtml(123)).toBe('');
      expect(sanitizeHtml({})).toBe('');
    });

    it('should remove all HTML tags', () => {
      expect(sanitizeHtml('<p>Hello</p>')).toBe('Hello');
      expect(sanitizeHtml('<div><span>Hello</span></div>')).toBe('Hello');
      expect(sanitizeHtml('<script>evil()</script>')).toBe('evil()');
    });

    it('should remove script tags and their contents are preserved as text', () => {
      expect(sanitizeHtml('<p>Hello</p><script>alert(1)</script>')).toBe(
        'Helloalert(1)',
      );
    });

    it('should handle self-closing tags', () => {
      expect(sanitizeHtml('Hello<br/>World')).toBe('HelloWorld');
      expect(sanitizeHtml('Hello<br />World')).toBe('HelloWorld');
    });

    it('should decode common HTML entities', () => {
      expect(sanitizeHtml('&nbsp;')).toBe('');
      expect(sanitizeHtml('&amp;')).toBe('&');
      expect(sanitizeHtml('&lt;&gt;')).toBe('<>');
      expect(sanitizeHtml('&quot;')).toBe('"');
    });

    it('should handle complex nested HTML', () => {
      const input =
        '<div class="container"><p id="text">Hello <b>World</b></p></div>';
      expect(sanitizeHtml(input)).toBe('Hello World');
    });

    it('should trim result', () => {
      expect(sanitizeHtml('<p>  Hello  </p>')).toBe('Hello');
    });
  });

  // ============================================
  // sanitizeEmail Tests
  // ============================================
  describe('sanitizeEmail', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeEmail(null)).toBe('');
      expect(sanitizeEmail(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(sanitizeEmail(123)).toBe('');
    });

    it('should convert to lowercase', () => {
      expect(sanitizeEmail('John.Doe@EXAMPLE.COM')).toBe(
        'john.doe@example.com',
      );
      expect(sanitizeEmail('USER@DOMAIN.CO.ZA')).toBe('user@domain.co.za');
    });

    it('should trim whitespace', () => {
      expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
      expect(sanitizeEmail('\tuser@example.com\n')).toBe('user@example.com');
    });

    it('should remove HTML tags from email', () => {
      expect(sanitizeEmail('<script>user@example.com</script>')).toBe(
        'user@example.com',
      );
    });

    it('should handle valid email formats', () => {
      expect(sanitizeEmail('user@example.com')).toBe('user@example.com');
      expect(sanitizeEmail('user.name@example.co.za')).toBe(
        'user.name@example.co.za',
      );
      expect(sanitizeEmail('user+tag@example.com')).toBe(
        'user+tag@example.com',
      );
    });

    it('should still return sanitized invalid emails for validation to handle', () => {
      expect(sanitizeEmail('not-an-email')).toBe('not-an-email');
      expect(sanitizeEmail('missing@domain')).toBe('missing@domain');
    });
  });

  // ============================================
  // sanitizePhone Tests
  // ============================================
  describe('sanitizePhone', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizePhone(null)).toBe('');
      expect(sanitizePhone(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(sanitizePhone(123)).toBe('');
    });

    it('should convert 0XX format to +27XX format', () => {
      expect(sanitizePhone('0821234567')).toBe('+27821234567');
      expect(sanitizePhone('0612345678')).toBe('+27612345678');
      expect(sanitizePhone('0731234567')).toBe('+27731234567');
    });

    it('should convert 27XX format to +27XX format', () => {
      expect(sanitizePhone('27821234567')).toBe('+27821234567');
    });

    it('should preserve +27XX format', () => {
      expect(sanitizePhone('+27821234567')).toBe('+27821234567');
    });

    it('should remove spaces and dashes', () => {
      expect(sanitizePhone('082 123 4567')).toBe('+27821234567');
      expect(sanitizePhone('082-123-4567')).toBe('+27821234567');
      expect(sanitizePhone('082 - 123 - 4567')).toBe('+27821234567');
    });

    it('should handle parentheses', () => {
      expect(sanitizePhone('(082) 123-4567')).toBe('+27821234567');
    });

    it('should return cleaned digits for non-standard formats', () => {
      expect(sanitizePhone('12345')).toBe('12345');
      expect(sanitizePhone('+1234567890123')).toBe('+1234567890123');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizePhone('')).toBe('');
      expect(sanitizePhone('   ')).toBe('');
    });
  });

  // ============================================
  // sanitizeIdNumber Tests
  // ============================================
  describe('sanitizeIdNumber', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeIdNumber(null)).toBe('');
      expect(sanitizeIdNumber(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(sanitizeIdNumber(123)).toBe('');
    });

    it('should remove all non-digit characters', () => {
      expect(sanitizeIdNumber('8001015009087')).toBe('8001015009087');
      expect(sanitizeIdNumber('8001 0150 0908 7')).toBe('8001015009087');
      expect(sanitizeIdNumber('8001-0150-0908-7')).toBe('8001015009087');
    });

    it('should handle ID with letters (should strip them)', () => {
      expect(sanitizeIdNumber('ABC8001015009087XYZ')).toBe('8001015009087');
    });

    it('should handle ID with special characters', () => {
      expect(sanitizeIdNumber('80/01/01-5009087!')).toBe('8001015009087');
    });
  });

  // ============================================
  // sanitizeTaxNumber Tests
  // ============================================
  describe('sanitizeTaxNumber', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeTaxNumber(null)).toBe('');
      expect(sanitizeTaxNumber(undefined)).toBe('');
    });

    it('should remove all non-digit characters', () => {
      expect(sanitizeTaxNumber('1234567890')).toBe('1234567890');
      expect(sanitizeTaxNumber('1234 567 890')).toBe('1234567890');
      expect(sanitizeTaxNumber('1234-567-890')).toBe('1234567890');
    });
  });

  // ============================================
  // sanitizeBankAccount Tests
  // ============================================
  describe('sanitizeBankAccount', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeBankAccount(null)).toBe('');
      expect(sanitizeBankAccount(undefined)).toBe('');
    });

    it('should remove all non-digit characters', () => {
      expect(sanitizeBankAccount('1234567890')).toBe('1234567890');
      expect(sanitizeBankAccount('1234-5678-9012')).toBe('123456789012');
      expect(sanitizeBankAccount('1234 5678 9012')).toBe('123456789012');
    });
  });

  // ============================================
  // sanitizeBranchCode Tests
  // ============================================
  describe('sanitizeBranchCode', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeBranchCode(null)).toBe('');
      expect(sanitizeBranchCode(undefined)).toBe('');
    });

    it('should remove all non-digit characters', () => {
      expect(sanitizeBranchCode('632005')).toBe('632005');
      expect(sanitizeBranchCode('632 005')).toBe('632005');
      expect(sanitizeBranchCode('632-005')).toBe('632005');
    });
  });

  // ============================================
  // sanitizeName Tests
  // ============================================
  describe('sanitizeName', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeName(null)).toBe('');
      expect(sanitizeName(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(sanitizeName(123)).toBe('');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeName('John <script>Doe</script>')).toBe('John Doe');
      expect(sanitizeName('<b>John</b> Doe')).toBe('John Doe');
    });

    it('should normalize whitespace', () => {
      expect(sanitizeName('John    Doe')).toBe('John Doe');
      expect(sanitizeName('  John  Doe  ')).toBe('John Doe');
    });

    it('should preserve valid name characters', () => {
      expect(sanitizeName("O'Brien")).toBe("O'Brien");
      expect(sanitizeName('Jean-Pierre')).toBe('Jean-Pierre');
      expect(sanitizeName('van der Berg')).toBe('van der Berg');
    });

    it('should remove control characters', () => {
      expect(sanitizeName('John\x00Doe')).toBe('JohnDoe');
    });
  });

  // ============================================
  // sanitizeText Tests
  // ============================================
  describe('sanitizeText', () => {
    it('should return empty string for null/undefined', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
    });

    it('should remove HTML tags', () => {
      expect(sanitizeText('<p>Hello</p>')).toBe('Hello');
      expect(sanitizeText('<script>evil()</script>')).toBe('evil()');
    });

    it('should preserve newlines', () => {
      expect(sanitizeText('Line 1\nLine 2')).toBe('Line 1\nLine 2');
      expect(sanitizeText('Line 1\r\nLine 2')).toBe('Line 1\r\nLine 2');
    });

    it('should trim the result', () => {
      expect(sanitizeText('  Hello  ')).toBe('Hello');
    });
  });

  // ============================================
  // escapeSqlLike Tests
  // ============================================
  describe('escapeSqlLike', () => {
    it('should return empty string for null/undefined', () => {
      expect(escapeSqlLike(null)).toBe('');
      expect(escapeSqlLike(undefined)).toBe('');
    });

    it('should return empty string for non-string types', () => {
      expect(escapeSqlLike(123)).toBe('');
    });

    it('should escape % character', () => {
      expect(escapeSqlLike('100%')).toBe('100\\%');
      expect(escapeSqlLike('%test%')).toBe('\\%test\\%');
    });

    it('should escape _ character', () => {
      expect(escapeSqlLike('test_case')).toBe('test\\_case');
      expect(escapeSqlLike('__init__')).toBe('\\_\\_init\\_\\_');
    });

    it('should escape backslash', () => {
      expect(escapeSqlLike('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should handle multiple special characters', () => {
      expect(escapeSqlLike('100%_off\\')).toBe('100\\%\\_off\\\\');
    });

    it('should not modify strings without special characters', () => {
      expect(escapeSqlLike('normal string')).toBe('normal string');
    });
  });

  // ============================================
  // isSqlSafe Tests
  // ============================================
  describe('isSqlSafe', () => {
    it('should return true for null/undefined', () => {
      expect(isSqlSafe(null)).toBe(true);
      expect(isSqlSafe(undefined)).toBe(true);
    });

    it('should return true for non-string types', () => {
      expect(isSqlSafe(123)).toBe(true);
    });

    it('should return true for safe strings', () => {
      expect(isSqlSafe('John Doe')).toBe(true);
      expect(isSqlSafe('user@example.com')).toBe(true);
      expect(isSqlSafe('SELECT is a word')).toBe(true);
    });

    it('should detect DROP TABLE injection', () => {
      expect(isSqlSafe("Robert'; DROP TABLE users;--")).toBe(false);
      expect(isSqlSafe('; DROP TABLE users;')).toBe(false);
    });

    it('should detect DELETE injection', () => {
      expect(isSqlSafe('; DELETE FROM users;')).toBe(false);
    });

    it('should detect comment injection', () => {
      expect(isSqlSafe("admin'--")).toBe(false);
    });

    it('should detect OR 1=1 injection', () => {
      expect(isSqlSafe("' OR '1'='1")).toBe(false);
      expect(isSqlSafe("' or 1=1--")).toBe(false);
    });

    it('should detect UNION SELECT injection', () => {
      expect(isSqlSafe("' UNION SELECT * FROM users--")).toBe(false);
      expect(
        isSqlSafe("' UNION ALL SELECT username, password FROM users"),
      ).toBe(false);
    });

    it('should detect block comment injection', () => {
      expect(isSqlSafe("admin'/**/OR/**/1=1")).toBe(false);
    });

    it('should detect xp_ stored procedures', () => {
      expect(isSqlSafe("'; EXEC xp_cmdshell('dir')--")).toBe(false);
    });
  });

  // ============================================
  // Edge Cases and Security Tests
  // ============================================
  describe('Security Edge Cases', () => {
    describe('XSS Prevention', () => {
      it('should prevent event handler XSS', () => {
        const result = sanitizeString('<img src=x onerror=alert(1)>');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
      });

      it('should prevent javascript: protocol XSS', () => {
        const result = sanitizeString(
          '<a href="javascript:alert(1)">click</a>',
        );
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        // The javascript: text is preserved but HTML is escaped, making it non-executable
        // For complete javascript: removal, use sanitizeHtml which strips all tags
        const htmlResult = sanitizeHtml(
          '<a href="javascript:alert(1)">click</a>',
        );
        expect(htmlResult).toBe('click');
      });

      it('should prevent data: URI XSS', () => {
        const result = sanitizeString(
          '<a href="data:text/html,<script>alert(1)</script>">',
        );
        expect(result).not.toContain('<a');
      });

      it('should prevent SVG XSS', () => {
        const result = sanitizeHtml('<svg onload=alert(1)><rect/></svg>');
        expect(result).not.toContain('<svg');
        expect(result).not.toContain('onload');
      });

      it('should handle double encoding attempts', () => {
        const result = sanitizeString('&lt;script&gt;');
        // First & is escaped, then everything else
        expect(result).not.toContain('<script>');
      });
    });

    describe('Null Byte Injection Prevention', () => {
      it('should remove null bytes', () => {
        expect(sanitizeString('hello\x00world')).toBe('helloworld');
        expect(sanitizeName('John\x00Doe')).toBe('JohnDoe');
      });
    });

    describe('Unicode Handling', () => {
      it('should preserve valid unicode characters', () => {
        expect(sanitizeName('Pieter-Dirk Uys')).toBe('Pieter-Dirk Uys');
        expect(sanitizeName('Thabo Mbeki')).toBe('Thabo Mbeki');
      });

      it('should handle emoji in text fields', () => {
        const result = sanitizeText('Hello World!');
        expect(result).toBe('Hello World!');
      });
    });

    describe('Empty and Edge Inputs', () => {
      it('should handle empty strings', () => {
        expect(sanitizeString('')).toBe('');
        expect(sanitizePhone('')).toBe('');
        expect(sanitizeEmail('')).toBe('');
      });

      it('should handle whitespace-only strings', () => {
        expect(sanitizeString('   ')).toBe('');
        expect(sanitizeName('   ')).toBe('');
      });

      it('should handle very long strings', () => {
        const longString = 'a'.repeat(10000);
        expect(sanitizeString(longString)).toBe(longString);
      });
    });
  });
});
