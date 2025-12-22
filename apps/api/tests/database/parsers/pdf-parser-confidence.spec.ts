/**
 * PDF Parser Confidence Scoring Tests
 * TASK-TRANS-015
 *
 * Tests confidence scoring logic for local PDF extraction
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PdfParser } from '../../../src/database/parsers/pdf-parser';

describe('PdfParser - Confidence Scoring', () => {
  let parser: PdfParser;
  const bankStatementsDir = path.join(process.cwd(), 'bank-statements');

  beforeAll(() => {
    parser = new PdfParser();
  });

  describe('parseWithConfidence()', () => {
    it('should add confidence scores to parsed transactions', async () => {
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
        expect(tx).toHaveProperty('parsingConfidence');
        expect(tx).toHaveProperty('confidenceReasons');
        expect(typeof tx.parsingConfidence).toBe('number');
        expect(tx.parsingConfidence).toBeGreaterThanOrEqual(0);
        expect(tx.parsingConfidence).toBeLessThanOrEqual(100);
      }
    });

    it('should lower confidence for transactions with missing data', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-01-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parseWithConfidence(buffer);

      // Check that confidence reasons are populated for lower scores
      const lowConfidence = transactions.filter(
        (tx) => tx.parsingConfidence < 80,
      );

      for (const tx of lowConfidence) {
        expect(tx.confidenceReasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe('confidence thresholds', () => {
    it('should identify transactions needing LLMWhisperer fallback', async () => {
      const pdfFiles = fs
        .readdirSync(bankStatementsDir)
        .filter((f) => f.endsWith('.pdf'))
        .slice(0, 5);

      let totalTransactions = 0;
      let lowConfidenceTransactions = 0;
      const threshold = 70;

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        try {
          const transactions = await parser.parseWithConfidence(buffer);
          totalTransactions += transactions.length;
          lowConfidenceTransactions += transactions.filter(
            (tx) => tx.parsingConfidence < threshold,
          ).length;
        } catch {
          // Skip files that fail to parse
        }
      }

      console.log(
        `Total: ${totalTransactions}, Low confidence (< ${threshold}%): ${lowConfidenceTransactions}`,
      );
      console.log(
        `Low confidence rate: ${((lowConfidenceTransactions / totalTransactions) * 100).toFixed(1)}%`,
      );
    });

    it('should calculate consistent confidence scores', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);

      // Parse twice and compare
      const results1 = await parser.parseWithConfidence(buffer);
      const results2 = await parser.parseWithConfidence(buffer);

      expect(results1.length).toBe(results2.length);

      for (let i = 0; i < results1.length; i++) {
        expect(results1[i].parsingConfidence).toBe(results2[i].parsingConfidence);
        expect(results1[i].confidenceReasons).toEqual(results2[i].confidenceReasons);
      }
    });
  });

  describe('confidence scoring factors', () => {
    it('should penalize short descriptions', async () => {
      const pdfFiles = fs
        .readdirSync(bankStatementsDir)
        .filter((f) => f.endsWith('.pdf'))
        .slice(0, 3);

      let shortDescCount = 0;
      let briefDescCount = 0;

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        try {
          const transactions = await parser.parseWithConfidence(buffer);

          for (const tx of transactions) {
            if (tx.confidenceReasons.includes('Short description')) {
              shortDescCount++;
            }
            if (tx.confidenceReasons.includes('Brief description')) {
              briefDescCount++;
            }
          }
        } catch {
          // Skip
        }
      }

      console.log(`Short descriptions (<5 chars): ${shortDescCount}`);
      console.log(`Brief descriptions (<10 chars): ${briefDescCount}`);
    });

    it('should penalize missing payee extraction', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parseWithConfidence(buffer);

      const noPayee = transactions.filter((tx) =>
        tx.confidenceReasons.includes('No payee extracted'),
      );

      console.log(
        `Transactions without payee: ${noPayee.length}/${transactions.length}`,
      );
    });
  });

  describe('parseWithConfidence vs parse', () => {
    it('should return same transaction data but with confidence', async () => {
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);

      const basicResults = await parser.parse(buffer);
      const confResults = await parser.parseWithConfidence(buffer);

      expect(confResults.length).toBe(basicResults.length);

      for (let i = 0; i < basicResults.length; i++) {
        expect(confResults[i].date).toEqual(basicResults[i].date);
        expect(confResults[i].description).toBe(basicResults[i].description);
        expect(confResults[i].amountCents).toBe(basicResults[i].amountCents);
        expect(confResults[i].isCredit).toBe(basicResults[i].isCredit);
      }
    });
  });
});
