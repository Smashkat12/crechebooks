/**
 * Output Module Tests
 * Tests for output formatting functions
 */

import { describe, it, expect } from 'vitest';
import {
  formatZAR,
  formatDate,
  formatJson,
  formatCsv,
} from '../../src/lib/output.js';

describe('Output Module', () => {
  describe('formatZAR', () => {
    it('should format cents to ZAR currency', () => {
      // Handle both . and , as decimal separators (locale dependent)
      expect(formatZAR(100)).toMatch(/R\s*1[,.]00/);
      expect(formatZAR(12345)).toMatch(/R\s*123[,.]45/);
      expect(formatZAR(1000000)).toMatch(/R\s*10[\s,.]?000[,.]00/);
    });

    it('should handle zero', () => {
      expect(formatZAR(0)).toMatch(/R\s*0[,.]00/);
    });

    it('should handle negative amounts', () => {
      expect(formatZAR(-12345)).toMatch(/R\s*-?123[,.]45/);
    });
  });

  describe('formatDate', () => {
    it('should format ISO date string to locale format', () => {
      const result = formatDate('2025-01-15T00:00:00.000Z');
      // Should contain year, month, day in some format
      expect(result).toMatch(/2025|15|01/);
    });
  });

  describe('formatJson', () => {
    it('should format data as indented JSON', () => {
      const data = { foo: 'bar', count: 42 };
      const result = formatJson(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3];
      const result = formatJson(data);
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it('should handle null', () => {
      expect(formatJson(null)).toBe('null');
    });
  });

  describe('formatCsv', () => {
    it('should format array of objects as CSV', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];
      const result = formatCsv(data);
      const lines = result.split('\n');
      expect(lines[0]).toBe('name,age');
      expect(lines[1]).toBe('Alice,30');
      expect(lines[2]).toBe('Bob,25');
    });

    it('should handle empty array', () => {
      expect(formatCsv([])).toBe('');
    });

    it('should escape values with commas', () => {
      const data = [{ name: 'Smith, John', value: 100 }];
      const result = formatCsv(data);
      expect(result).toContain('"Smith, John"');
    });

    it('should escape values with quotes', () => {
      const data = [{ name: 'Say "Hello"', value: 100 }];
      const result = formatCsv(data);
      expect(result).toContain('"Say ""Hello"""');
    });
  });
});
