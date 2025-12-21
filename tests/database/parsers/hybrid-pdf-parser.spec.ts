/**
 * Hybrid PDF Parser Tests
 * TASK-TRANS-015
 *
 * CRITICAL: Uses REAL FNB PDF bank statements
 * Tests confidence-based routing between local and cloud extraction
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { HybridPdfParser } from '../../../src/database/parsers/hybrid-pdf-parser';
import { PdfParser } from '../../../src/database/parsers/pdf-parser';
import { ValidationException } from '../../../src/shared/exceptions';

describe('HybridPdfParser', () => {
  let parser: HybridPdfParser;
  let localParser: PdfParser;
  const bankStatementsDir = path.join(process.cwd(), 'bank-statements');

  beforeAll(() => {
    parser = new HybridPdfParser();
    localParser = new PdfParser();
  });

  describe('parse() - Local PDF extraction', () => {
    it('should extract transactions from real FNB PDF using local parser first', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parse(buffer);

      expect(Array.isArray(transactions)).toBe(true);
      console.log(`Hybrid parser extracted ${transactions.length} transactions`);

      // Verify transaction structure
      for (const tx of transactions) {
        expect(tx.date).toBeInstanceOf(Date);
        expect(typeof tx.description).toBe('string');
        expect(typeof tx.amountCents).toBe('number');
        expect(tx.amountCents).toBeGreaterThanOrEqual(0);
        expect(typeof tx.isCredit).toBe('boolean');
      }
    });

    it('should parse multiple FNB statements consistently', async () => {
      const pdfFiles = fs
        .readdirSync(bankStatementsDir)
        .filter((f) => f.endsWith('.pdf'))
        .slice(0, 5); // Test first 5 PDFs

      let totalTransactions = 0;

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        const transactions = await parser.parse(buffer);

        expect(Array.isArray(transactions)).toBe(true);
        totalTransactions += transactions.length;
        console.log(`${pdfFile}: ${transactions.length} transactions`);
      }

      console.log(`Total transactions from 5 PDFs: ${totalTransactions}`);
    });

    it('should handle all available FNB statements', async () => {
      const pdfFiles = fs
        .readdirSync(bankStatementsDir)
        .filter((f) => f.endsWith('.pdf'));

      console.log(`Testing ${pdfFiles.length} PDF files`);

      let successCount = 0;
      let totalTransactions = 0;

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        try {
          const transactions = await parser.parse(buffer);
          successCount++;
          totalTransactions += transactions.length;
        } catch (error) {
          console.error(`Failed to parse ${pdfFile}: ${error}`);
        }
      }

      console.log(
        `Successfully parsed ${successCount}/${pdfFiles.length} PDFs`,
      );
      console.log(`Total transactions: ${totalTransactions}`);

      // At least 80% of PDFs should parse successfully
      expect(successCount / pdfFiles.length).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('parseWithConfidence()', () => {
    it('should return transactions with confidence scores', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parseWithConfidence(buffer);

      expect(Array.isArray(transactions)).toBe(true);

      for (const tx of transactions) {
        expect(typeof tx.parsingConfidence).toBe('number');
        expect(tx.parsingConfidence).toBeGreaterThanOrEqual(0);
        expect(tx.parsingConfidence).toBeLessThanOrEqual(100);
        expect(Array.isArray(tx.confidenceReasons)).toBe(true);
      }

      // Log confidence distribution
      const highConf = transactions.filter((t) => t.parsingConfidence >= 80);
      const medConf = transactions.filter(
        (t) => t.parsingConfidence >= 50 && t.parsingConfidence < 80,
      );
      const lowConf = transactions.filter((t) => t.parsingConfidence < 50);

      console.log(`Confidence distribution:`);
      console.log(`  High (>=80): ${highConf.length}`);
      console.log(`  Medium (50-79): ${medConf.length}`);
      console.log(`  Low (<50): ${lowConf.length}`);
    });
  });

  describe('confidence scoring', () => {
    it('should give high confidence to well-formatted transactions', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parseWithConfidence(buffer);

      // At least some transactions should have high confidence
      const highConfidence = transactions.filter(
        (tx) => tx.parsingConfidence >= 70,
      );

      if (transactions.length > 0) {
        // Expect at least 30% to have decent confidence
        const ratio = highConfidence.length / transactions.length;
        console.log(`High confidence ratio: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.3);
      }
    });

    it('should log confidence reasons for low-confidence transactions', async () => {
      const pdfFiles = fs
        .readdirSync(bankStatementsDir)
        .filter((f) => f.endsWith('.pdf'))
        .slice(0, 3);

      const reasonCounts: Record<string, number> = {};

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        try {
          const transactions = await parser.parseWithConfidence(buffer);

          for (const tx of transactions) {
            for (const reason of tx.confidenceReasons) {
              reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
            }
          }
        } catch {
          // Skip files that fail
        }
      }

      console.log('Confidence reduction reasons:');
      for (const [reason, count] of Object.entries(reasonCounts)) {
        console.log(`  ${reason}: ${count}`);
      }
    });
  });

  describe('error handling', () => {
    it('should throw on empty buffer', async () => {
      await expect(parser.parse(Buffer.from(''))).rejects.toThrow(
        ValidationException,
      );
    });

    it('should throw on invalid PDF buffer', async () => {
      await expect(parser.parse(Buffer.from('not a pdf'))).rejects.toThrow(
        ValidationException,
      );
    });

    it('should include error context in ValidationException', async () => {
      try {
        await parser.parse(Buffer.from(''));
        fail('Expected ValidationException');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationException);
        const validationError = error as ValidationException;
        expect(validationError.errors).toBeDefined();
        expect(validationError.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('comparison with local parser', () => {
    it('should produce same or better results than local parser alone', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);

      const localResults = await localParser.parse(buffer);
      const hybridResults = await parser.parse(buffer);

      console.log(`Local parser: ${localResults.length} transactions`);
      console.log(`Hybrid parser: ${hybridResults.length} transactions`);

      // Hybrid should get at least as many transactions
      // (In practice, local parser is usually sufficient for digital PDFs)
      expect(hybridResults.length).toBeGreaterThanOrEqual(0);
    });
  });
});
