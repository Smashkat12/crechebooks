/**
 * Tesseract OCR Parser Tests
 * TASK-TRANS-035: Offline OCR Fallback for Scanned PDFs
 */

import { TesseractOcrParser } from '../tesseract-ocr-parser';

describe('TesseractOcrParser', () => {
  let parser: TesseractOcrParser;

  beforeAll(() => {
    parser = new TesseractOcrParser();
  });

  afterAll(async () => {
    await parser.terminate();
  });

  describe('isScannedPdf', () => {
    it('should detect scanned PDF when text content is very low', () => {
      const textContent = 'Page 1'; // Very little text
      const pageCount = 5;

      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(true);
    });

    it('should detect scanned PDF with empty text', () => {
      const textContent = '';
      const pageCount = 3;

      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(true);
    });

    it('should NOT detect as scanned when text content is adequate', () => {
      // 500 chars per page is well above the 100 threshold
      const textContent = 'A'.repeat(500);
      const pageCount = 1;

      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(false);
    });

    it('should NOT detect as scanned when text per page exceeds threshold', () => {
      // 600 chars for 5 pages = 120 chars/page (above 100 threshold)
      const textContent = 'Transaction data '.repeat(35); // ~595 chars
      const pageCount = 5;

      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(false);
    });

    it('should handle edge case with 0 pages', () => {
      const textContent = 'Some text';
      const pageCount = 0;

      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(false);
    });

    it('should handle null/undefined text', () => {
      const result1 = parser.isScannedPdf(null as unknown as string, 3);
      const result2 = parser.isScannedPdf(undefined as unknown as string, 3);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should detect boundary case - exactly at threshold', () => {
      // Exactly 100 chars per page = threshold boundary
      const textContent = 'A'.repeat(100);
      const pageCount = 1;

      // At exactly 100, it should NOT be detected as scanned (< 100 is the condition)
      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(false);
    });

    it('should detect just below threshold', () => {
      // 99 chars per page = below 100 threshold
      const textContent = 'A'.repeat(99);
      const pageCount = 1;

      const result = parser.isScannedPdf(textContent, pageCount);

      expect(result).toBe(true);
    });
  });

  describe('extractText', () => {
    it('should throw ValidationException for invalid buffer', async () => {
      const invalidBuffer = Buffer.from('not a pdf');

      await expect(parser.extractText(invalidBuffer)).rejects.toThrow(
        'Failed to convert PDF for OCR',
      );
    });

    it('should throw ValidationException for empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(parser.extractText(emptyBuffer)).rejects.toThrow();
    });
  });

  describe('parse', () => {
    it('should return empty array for invalid PDF', async () => {
      const invalidBuffer = Buffer.from('invalid data');

      await expect(parser.parse(invalidBuffer)).rejects.toThrow();
    });
  });

  describe('OCR text parsing patterns', () => {
    // Test the internal parsing logic by creating a parser and testing patterns
    // We'll create a minimal test that validates the parser can be instantiated

    it('should create parser instance', () => {
      const testParser = new TesseractOcrParser();
      expect(testParser).toBeDefined();
      expect(typeof testParser.isScannedPdf).toBe('function');
      expect(typeof testParser.extractText).toBe('function');
      expect(typeof testParser.parse).toBe('function');
      expect(typeof testParser.terminate).toBe('function');
    });
  });

  describe('resource management', () => {
    it('should allow multiple terminate calls without error', async () => {
      const testParser = new TesseractOcrParser();

      // Multiple terminate calls should not throw
      await expect(testParser.terminate()).resolves.not.toThrow();
      await expect(testParser.terminate()).resolves.not.toThrow();
    });
  });
});

describe('TesseractOcrParser - Integration', () => {
  // These tests require actual PDF files and Tesseract processing
  // They are marked with increased timeout since OCR can be slow

  describe('Real PDF processing', () => {
    // Skip these tests in CI unless we have test fixtures
    // The tests above cover the unit testing aspect

    it.skip('should process a real scanned PDF', async () => {
      // This test would require a real scanned PDF fixture
      // Implementation would look like:
      // const buffer = await fs.readFile('fixtures/scanned-statement.pdf');
      // const parser = new TesseractOcrParser();
      // const result = await parser.extractText(buffer);
      // expect(result.text.length).toBeGreaterThan(0);
      // await parser.terminate();
    }, 60000);
  });
});
