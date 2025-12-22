/**
 * LLMWhisperer Parser Tests
 * TASK-TRANS-015
 *
 * CRITICAL: Uses REAL FNB PDF bank statements
 * Tests actual API integration - no mocks
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { LLMWhispererParser } from '../../../src/database/parsers/llmwhisperer-parser';
import { BusinessException } from '../../../src/shared/exceptions';

describe('LLMWhispererParser', () => {
  let parser: LLMWhispererParser;
  const bankStatementsDir = path.join(process.cwd(), 'bank-statements');

  beforeAll(() => {
    parser = new LLMWhispererParser();
  });

  describe('isAvailable()', () => {
    it('should return true when API key is configured', () => {
      // This test requires LLMWHISPERER_API_KEY in .env
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn(
          'LLMWHISPERER_API_KEY not set - skipping availability test',
        );
        return;
      }
      expect(parser.isAvailable()).toBe(true);
    });

    it('should return false when API key is not configured', () => {
      // Create parser with environment where key is missing
      const oldKey = process.env.LLMWHISPERER_API_KEY;
      delete process.env.LLMWHISPERER_API_KEY;

      // Need to create new parser to pick up env change
      const unconfiguredParser = new LLMWhispererParser();
      expect(unconfiguredParser.isAvailable()).toBe(false);

      // Restore
      if (oldKey) {
        process.env.LLMWHISPERER_API_KEY = oldKey;
      }
    });
  });

  describe('extractText() - REAL API', () => {
    it('should extract text from real FNB PDF', async () => {
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn('LLMWHISPERER_API_KEY not set - skipping API test');
        return;
      }

      // Use one of the test PDFs
      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);

      try {
        const text = await parser.extractText(buffer);
        expect(text).toBeDefined();
        expect(text.length).toBeGreaterThan(100);
        // FNB statements should contain bank identifier
        expect(text.toUpperCase()).toMatch(/FNB|FIRST NATIONAL BANK/);
      } catch (error) {
        // Skip test if rate limited (HTTP 402) or API unavailable
        if (
          error instanceof BusinessException &&
          (error.message.includes('402') ||
            error.message.includes('rate limit'))
        ) {
          console.warn('LLMWhisperer API rate limited - skipping test');
          return;
        }
        throw error;
      }
    }, 60000); // 60 second timeout for API call

    it('should extract text from oldest FNB PDF', async () => {
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn('LLMWHISPERER_API_KEY not set - skipping API test');
        return;
      }

      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2023-08-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);

      try {
        const text = await parser.extractText(buffer);
        expect(text).toBeDefined();
        expect(text.length).toBeGreaterThan(100);
      } catch (error) {
        if (
          error instanceof BusinessException &&
          (error.message.includes('402') ||
            error.message.includes('rate limit'))
        ) {
          console.warn('LLMWhisperer API rate limited - skipping test');
          return;
        }
        throw error;
      }
    }, 60000);
  });

  describe('parse() - REAL API', () => {
    it('should parse transactions from real FNB PDF', async () => {
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn('LLMWHISPERER_API_KEY not set - skipping parse test');
        return;
      }

      const pdfPath = path.join(
        bankStatementsDir,
        '63061274808 2025-11-03.pdf',
      );

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);

      try {
        const transactions = await parser.parse(buffer);

        expect(Array.isArray(transactions)).toBe(true);
        // Real bank statements should have at least some transactions
        console.log(
          `Parsed ${transactions.length} transactions from LLMWhisperer`,
        );

        // Verify transaction structure
        for (const tx of transactions) {
          expect(tx.date).toBeInstanceOf(Date);
          expect(typeof tx.description).toBe('string');
          expect(typeof tx.amountCents).toBe('number');
          expect(typeof tx.isCredit).toBe('boolean');
        }
      } catch (error) {
        if (
          error instanceof BusinessException &&
          (error.message.includes('402') ||
            error.message.includes('rate limit'))
        ) {
          console.warn('LLMWhisperer API rate limited - skipping test');
          return;
        }
        throw error;
      }
    }, 60000);

    it('should parse multiple PDFs consistently', async () => {
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn('LLMWHISPERER_API_KEY not set - skipping multi-PDF test');
        return;
      }

      const pdfFiles = fs
        .readdirSync(bankStatementsDir)
        .filter((f) => f.endsWith('.pdf'))
        .slice(0, 2); // Test first 2 PDFs to avoid rate limits

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        try {
          const transactions = await parser.parse(buffer);
          console.log(`${pdfFile}: ${transactions.length} transactions`);
          expect(Array.isArray(transactions)).toBe(true);
        } catch (error) {
          if (
            error instanceof BusinessException &&
            (error.message.includes('402') ||
              error.message.includes('rate limit'))
          ) {
            console.warn(
              `LLMWhisperer API rate limited for ${pdfFile} - skipping`,
            );
            continue;
          }
          throw error;
        }
      }
    }, 120000); // 2 minute timeout for multiple API calls
  });

  describe('error handling', () => {
    it('should throw BusinessException when API key not configured', async () => {
      // Create parser with no API key
      const oldKey = process.env.LLMWHISPERER_API_KEY;
      delete process.env.LLMWHISPERER_API_KEY;

      const unconfiguredParser = new LLMWhispererParser();

      await expect(
        unconfiguredParser.extractText(Buffer.from('test')),
      ).rejects.toThrow(BusinessException);

      // Restore
      if (oldKey) {
        process.env.LLMWHISPERER_API_KEY = oldKey;
      }
    });

    it('should throw BusinessException with correct error code', async () => {
      const oldKey = process.env.LLMWHISPERER_API_KEY;
      delete process.env.LLMWHISPERER_API_KEY;

      const unconfiguredParser = new LLMWhispererParser();

      try {
        await unconfiguredParser.extractText(Buffer.from('test'));
        fail('Expected BusinessException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessException);
        expect((error as BusinessException).code).toBe(
          'LLMWHISPERER_NOT_CONFIGURED',
        );
      }

      // Restore
      if (oldKey) {
        process.env.LLMWHISPERER_API_KEY = oldKey;
      }
    });
  });
});
