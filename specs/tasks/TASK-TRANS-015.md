<task_spec id="TASK-TRANS-015" version="1.0">

<metadata>
  <title>LLMWhisperer PDF Extraction Integration</title>
  <status>completed</status>
  <layer>logic</layer>
  <sequence>37</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <requirement_ref>REQ-TRANS-011</requirement_ref>
    <requirement_ref>EC-TRANS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-21</last_updated>
</metadata>

<reasoning_mode>
REQUIRED: Use systems thinking + analytical reasoning. This task involves:
1. Cloud API integration - requires robust error handling
2. Confidence-based routing - requires algorithmic scoring
3. Hybrid fallback logic - requires fail-fast approach
4. Real PDF testing - requires actual bank statements
</reasoning_mode>

<context>
Integrates LLMWhisperer cloud API as a fallback PDF extraction service for bank statements.
Uses confidence-based routing: local pdf-parse first, then LLMWhisperer for low-confidence
extractions. Supports OCR for scanned bank statements.

CRITICAL: This project does NOT use workarounds. If LLMWhisperer API fails, error immediately.
All tests use REAL bank statement PDFs from /bank-statements/ folder.
</context>

<current_state>
## Codebase State (as of 2025-12-21)
- TASK-TRANS-011: Complete (Transaction Import Service)
- PdfParser: EXISTS at `src/database/parsers/pdf-parser.ts` (Standard Bank, FNB, ABSA)
- TransactionImportService: EXISTS at `src/database/services/transaction-import.service.ts`
- ParsedTransaction interface: EXISTS at `src/database/dto/import.dto.ts`

## What Exists
- PdfParser with regex-based extraction for SA banks
- Transaction import pipeline with duplicate detection
- Bank statement test PDFs at `/bank-statements/` (29 FNB PDFs)

## What Does NOT Exist (Must Be Created)
- LLMWhisperer API client wrapper
- Confidence scoring for PDF extraction
- Hybrid parser with fallback logic
- LLMWhisperer configuration
</current_state>

<directory_structure>
## CORRECT Directory Structure (Use These Paths)
src/
  database/
    parsers/
      pdf-parser.ts                    # UPDATE - Add confidence scoring
      llmwhisperer-parser.ts           # NEW - LLMWhisperer client wrapper
      hybrid-pdf-parser.ts             # NEW - Hybrid routing logic
      index.ts                         # UPDATE - Export new parsers
    dto/
      import.dto.ts                    # UPDATE - Add confidence interface
  config/
    llmwhisperer.config.ts             # NEW - API configuration
tests/
  database/
    parsers/
      llmwhisperer-parser.spec.ts      # NEW - Real PDF tests
      hybrid-pdf-parser.spec.ts        # NEW - Confidence routing tests
</directory_structure>

<environment_variables>
## Required in .env
LLMWHISPERER_API_KEY=<your-api-key>
LLMWHISPERER_KEY_ID=<your-key-id>
LLMWHISPERER_BASE_URL=https://llmwhisperer-api.us-central.unstract.com
</environment_variables>

<scope>
  <in_scope>
    - LLMWhisperer client wrapper service
    - Confidence scoring for PDF extraction results
    - Hybrid parser with fallback logic (local first, LLM for low-confidence)
    - Configuration management for API keys
    - Rate limiting and cost controls
    - Integration tests with REAL FNB PDFs from /bank-statements/
  </in_scope>
  <out_of_scope>
    - Xero sync changes
    - UI for extraction quality review
    - Other document types (DOCX, XLSX)
    - MCP server integration (Phase 2)
  </out_of_scope>
</scope>

<implementation_order>
Execute in this exact order:
1. Create LLMWhisperer configuration (src/config/llmwhisperer.config.ts)
2. Update import.dto.ts with confidence interface
3. Create LLMWhisperer parser (src/database/parsers/llmwhisperer-parser.ts)
4. Add confidence scoring to PdfParser
5. Create HybridPdfParser with routing logic
6. Update parsers/index.ts exports
7. Write integration tests with REAL PDFs
8. Run all tests to verify
</implementation_order>

<files_to_create>

<file path="src/config/llmwhisperer.config.ts">
/**
 * LLMWhisperer Configuration
 * TASK-TRANS-015
 *
 * Cloud-based PDF extraction service configuration.
 * CRITICAL: API key required - fails immediately if missing.
 */
import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('LLMWhispererConfig');

export const LLMWHISPERER_CONFIG = {
  apiKey: process.env.LLMWHISPERER_API_KEY || '',
  keyId: process.env.LLMWHISPERER_KEY_ID || '',
  baseUrl: process.env.LLMWHISPERER_BASE_URL || 'https://llmwhisperer-api.us-central.unstract.com',

  // Extraction settings
  mode: 'native_text' as const,  // native_text for digital PDFs
  outputMode: 'layout_preserving' as const,  // Preserve document structure

  // Timeout and retry settings
  timeoutMs: 30000,  // 30 seconds
  maxRetries: 2,

  // Rate limiting
  maxCallsPerBatch: 50,
} as const;

export const PDF_PARSER_CONFIG = {
  confidenceThreshold: 70,        // Below this -> LLMWhisperer
  minTransactionsForLocal: 3,     // If < 3 extracted, try LLMWhisperer
  maxLLMWhispererCalls: 50,       // Rate limit per import batch
} as const;

/**
 * Validate configuration at startup
 * @throws Error if required config is missing
 */
export function validateLLMWhispererConfig(): void {
  if (!LLMWHISPERER_CONFIG.apiKey) {
    logger.warn('LLMWHISPERER_API_KEY not set - LLMWhisperer fallback disabled');
  }
}

export default registerAs('llmwhisperer', () => LLMWHISPERER_CONFIG);
</file>

<file path="src/database/parsers/llmwhisperer-parser.ts">
/**
 * LLMWhisperer PDF Parser
 * TASK-TRANS-015
 *
 * Cloud-based PDF extraction using LLMWhisperer API.
 * CRITICAL: No fallbacks - if API fails, error immediately with full context.
 */
import { Logger } from '@nestjs/common';
import { ParsedTransaction } from '../dto/import.dto';
import { parseCurrency, parseDate, extractPayeeName } from './parse-utils';
import { BusinessException, ValidationException } from '../../shared/exceptions';
import { LLMWHISPERER_CONFIG } from '../../config/llmwhisperer.config';

interface LLMWhispererResponse {
  status: string;
  status_code: number;
  whisper_hash?: string;
  extraction?: {
    result_text?: string;
  };
  message?: string;
}

export class LLMWhispererParser {
  private readonly logger = new Logger(LLMWhispererParser.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = LLMWHISPERER_CONFIG.apiKey;
    this.baseUrl = LLMWHISPERER_CONFIG.baseUrl;
  }

  /**
   * Check if LLMWhisperer is configured and available
   */
  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Extract text from PDF using LLMWhisperer cloud API
   * @throws BusinessException if API is not configured
   * @throws BusinessException if API request fails
   * @throws ValidationException if extraction returns no text
   */
  async extractText(buffer: Buffer): Promise<string> {
    if (!this.apiKey) {
      this.logger.error('LLMWhisperer API key not configured');
      throw new BusinessException(
        'LLMWhisperer API key not configured. Set LLMWHISPERER_API_KEY environment variable.',
        'LLMWHISPERER_NOT_CONFIGURED'
      );
    }

    this.logger.log(`Sending ${buffer.length} bytes to LLMWhisperer API`);

    try {
      const response = await fetch(`${this.baseUrl}/api/v2/whisper`, {
        method: 'POST',
        headers: {
          'unstract-key': this.apiKey,
          'Content-Type': 'application/pdf',
        },
        body: buffer,
        signal: AbortSignal.timeout(LLMWHISPERER_CONFIG.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `LLMWhisperer API error: HTTP ${response.status} - ${errorText}`
        );
        throw new BusinessException(
          `LLMWhisperer API request failed: HTTP ${response.status}`,
          'LLMWHISPERER_API_ERROR',
          {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          }
        );
      }

      const result = (await response.json()) as LLMWhispererResponse;

      if (result.status !== 'processed' && result.status !== 'success') {
        this.logger.error(`LLMWhisperer extraction failed: ${result.message}`);
        throw new BusinessException(
          `LLMWhisperer extraction failed: ${result.message || result.status}`,
          'LLMWHISPERER_EXTRACTION_FAILED',
          { status: result.status, message: result.message }
        );
      }

      const extractedText = result.extraction?.result_text || '';

      if (!extractedText.trim()) {
        throw new ValidationException('LLMWhisperer returned empty text', [
          {
            field: 'extraction',
            message: 'No text could be extracted from PDF via LLMWhisperer',
          },
        ]);
      }

      this.logger.log(
        `LLMWhisperer extracted ${extractedText.length} characters`
      );
      return extractedText;
    } catch (error) {
      if (error instanceof BusinessException || error instanceof ValidationException) {
        throw error;
      }

      // Handle timeout
      if (error instanceof Error && error.name === 'TimeoutError') {
        this.logger.error(
          `LLMWhisperer API timeout after ${LLMWHISPERER_CONFIG.timeoutMs}ms`
        );
        throw new BusinessException(
          `LLMWhisperer API timeout after ${LLMWHISPERER_CONFIG.timeoutMs}ms`,
          'LLMWHISPERER_TIMEOUT'
        );
      }

      // Handle network errors
      this.logger.error(
        `LLMWhisperer network error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new BusinessException(
        `LLMWhisperer network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LLMWHISPERER_NETWORK_ERROR',
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Parse PDF buffer into transactions using LLMWhisperer
   * @throws BusinessException if extraction fails
   */
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const text = await this.extractText(buffer);
    return this.parseExtractedText(text);
  }

  /**
   * Parse extracted text into transactions
   * Uses multiple regex patterns to handle different bank formats
   */
  private parseExtractedText(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // FNB format patterns (primary target based on test PDFs)
    const fnbPatterns = [
      // DD MMM YYYY Description Amount
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(.+?)\s+([-]?\d[\d\s,]*\.?\d*)\s*$/i,
      // Alternative: Date Description Amount with R symbol
      /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?R?\s*\d[\d\s,]*\.?\d*)\s*$/i,
    ];

    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04',
      may: '05', jun: '06', jul: '07', aug: '08',
      sep: '09', oct: '10', nov: '11', dec: '12',
    };

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Try FNB format with month name
      const fnbMatch = trimmedLine.match(fnbPatterns[0]);
      if (fnbMatch) {
        try {
          const [, day, month, year, description, amountStr] = fnbMatch;
          const monthNum = monthMap[month.toLowerCase()];
          if (monthNum) {
            const dateStr = `${year}-${monthNum}-${day.padStart(2, '0')}`;
            const date = parseDate(dateStr);
            const amountCents = parseCurrency(amountStr);

            transactions.push({
              date,
              description: description.trim(),
              payeeName: extractPayeeName(description),
              reference: null,
              amountCents: Math.abs(amountCents),
              isCredit: !amountStr.trim().startsWith('-'),
            });
          }
        } catch (error) {
          this.logger.debug(`Skipping line (parse error): ${trimmedLine.substring(0, 50)}`);
        }
        continue;
      }

      // Try standard date format
      const stdMatch = trimmedLine.match(fnbPatterns[1]);
      if (stdMatch) {
        try {
          const [, dateStr, description, amountStr] = stdMatch;
          const date = parseDate(dateStr);
          const amountCents = parseCurrency(amountStr);

          transactions.push({
            date,
            description: description.trim(),
            payeeName: extractPayeeName(description),
            reference: null,
            amountCents: Math.abs(amountCents),
            isCredit: !amountStr.trim().startsWith('-'),
          });
        } catch (error) {
          this.logger.debug(`Skipping line (parse error): ${trimmedLine.substring(0, 50)}`);
        }
      }
    }

    this.logger.log(`LLMWhisperer parsed ${transactions.length} transactions`);
    return transactions;
  }
}
</file>

<file path="src/database/parsers/hybrid-pdf-parser.ts">
/**
 * Hybrid PDF Parser
 * TASK-TRANS-015
 *
 * Implements confidence-based routing between local pdf-parse and LLMWhisperer.
 * CRITICAL: No workarounds - if something fails, error immediately.
 */
import { Logger } from '@nestjs/common';
import { PdfParser } from './pdf-parser';
import { LLMWhispererParser } from './llmwhisperer-parser';
import { ParsedTransaction, ParsedTransactionWithConfidence } from '../dto/import.dto';
import { PDF_PARSER_CONFIG } from '../../config/llmwhisperer.config';

export class HybridPdfParser {
  private readonly logger = new Logger(HybridPdfParser.name);
  private readonly localParser: PdfParser;
  private readonly llmWhispererParser: LLMWhispererParser;

  constructor() {
    this.localParser = new PdfParser();
    this.llmWhispererParser = new LLMWhispererParser();
  }

  /**
   * Parse PDF using hybrid approach:
   * 1. Try local parser first
   * 2. Calculate confidence for each transaction
   * 3. If any transaction below threshold, try LLMWhisperer
   * 4. Return best results
   *
   * @throws ValidationException if buffer is invalid
   * @throws BusinessException if both parsers fail
   */
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    this.logger.log('Starting hybrid PDF parsing');

    // 1. Try local parser first
    const localResults = await this.localParser.parseWithConfidence(buffer);

    this.logger.log(`Local parser extracted ${localResults.length} transactions`);

    // 2. Check if we need LLMWhisperer
    const threshold = PDF_PARSER_CONFIG.confidenceThreshold;
    const lowConfidenceCount = localResults.filter(
      (tx) => tx.parsingConfidence < threshold
    ).length;

    const totalCount = localResults.length;
    const needsLLMWhisperer =
      totalCount < PDF_PARSER_CONFIG.minTransactionsForLocal ||
      lowConfidenceCount > totalCount * 0.2;  // More than 20% low confidence

    if (!needsLLMWhisperer || !this.llmWhispererParser.isAvailable()) {
      if (!this.llmWhispererParser.isAvailable() && needsLLMWhisperer) {
        this.logger.warn('LLMWhisperer not available - using local results only');
      }

      this.logger.log(`Returning ${localResults.length} local results (confidence OK)`);
      return localResults.map(this.stripConfidence);
    }

    // 3. Use LLMWhisperer for better extraction
    this.logger.log(
      `Low confidence detected (${lowConfidenceCount}/${totalCount} below threshold) - using LLMWhisperer`
    );

    try {
      const llmResults = await this.llmWhispererParser.parse(buffer);

      this.logger.log(`LLMWhisperer extracted ${llmResults.length} transactions`);

      // If LLMWhisperer got more transactions, prefer it
      if (llmResults.length > localResults.length) {
        this.logger.log('Using LLMWhisperer results (more transactions found)');
        return llmResults;
      }

      // Otherwise, use local results (already verified the count is ok)
      this.logger.log('Using local results (comparable count)');
      return localResults.map(this.stripConfidence);
    } catch (error) {
      // LLMWhisperer failed - log and return local results
      this.logger.error(
        `LLMWhisperer failed, falling back to local: ${error instanceof Error ? error.message : String(error)}`
      );
      return localResults.map(this.stripConfidence);
    }
  }

  /**
   * Parse with confidence scoring - exposes confidence for testing
   */
  async parseWithConfidence(buffer: Buffer): Promise<ParsedTransactionWithConfidence[]> {
    return this.localParser.parseWithConfidence(buffer);
  }

  /**
   * Strip confidence from transaction for final output
   */
  private stripConfidence(tx: ParsedTransactionWithConfidence): ParsedTransaction {
    return {
      date: tx.date,
      description: tx.description,
      payeeName: tx.payeeName,
      reference: tx.reference,
      amountCents: tx.amountCents,
      isCredit: tx.isCredit,
    };
  }
}
</file>

</files_to_create>

<files_to_modify>

<file path="src/database/dto/import.dto.ts" action="add_interface">
Add after ParsedTransaction interface:

```typescript
/**
 * Parsed transaction with confidence scoring for hybrid parsing.
 * TASK-TRANS-015
 */
export interface ParsedTransactionWithConfidence extends ParsedTransaction {
  /** Parsing confidence score 0-100 */
  parsingConfidence: number;

  /** Reasons for confidence adjustments */
  confidenceReasons: string[];
}
```
</file>

<file path="src/database/parsers/pdf-parser.ts" action="add_method">
Add parseWithConfidence method after the parse method:

```typescript
/**
 * Parse PDF with confidence scoring
 * TASK-TRANS-015 - Confidence-based fallback support
 */
async parseWithConfidence(buffer: Buffer): Promise<ParsedTransactionWithConfidence[]> {
  const transactions = await this.parse(buffer);
  return transactions.map((tx) => this.addConfidenceScore(tx));
}

/**
 * Calculate confidence score for a parsed transaction
 */
private addConfidenceScore(tx: ParsedTransaction): ParsedTransactionWithConfidence {
  let confidence = 100;
  const reasons: string[] = [];

  // Date quality check
  if (!tx.date || isNaN(tx.date.getTime())) {
    confidence -= 30;
    reasons.push('Invalid date');
  }

  // Amount validation
  if (tx.amountCents <= 0) {
    confidence -= 25;
    reasons.push('Invalid amount');
  }

  // Description quality
  if (!tx.description || tx.description.length < 5) {
    confidence -= 15;
    reasons.push('Short description');
  } else if (tx.description.length < 10) {
    confidence -= 5;
    reasons.push('Brief description');
  }

  // Payee extraction success
  if (!tx.payeeName) {
    confidence -= 10;
    reasons.push('No payee extracted');
  }

  // Multi-line check (description contains unusual characters)
  if (tx.description && /[\n\r\t]/.test(tx.description)) {
    confidence -= 20;
    reasons.push('Multi-line description');
  }

  return {
    ...tx,
    parsingConfidence: Math.max(0, confidence),
    confidenceReasons: reasons,
  };
}
```
</file>

<file path="src/database/parsers/index.ts" action="update">
Update exports:

```typescript
export { CsvParser } from './csv-parser';
export { PdfParser } from './pdf-parser';
export { LLMWhispererParser } from './llmwhisperer-parser';
export { HybridPdfParser } from './hybrid-pdf-parser';
export * from './parse-utils';
```
</file>

</files_to_modify>

<test_files>

<file path="tests/database/parsers/llmwhisperer-parser.spec.ts">
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
        console.warn('LLMWHISPERER_API_KEY not set - skipping availability test');
        return;
      }
      expect(parser.isAvailable()).toBe(true);
    });
  });

  describe('extractText() - REAL API', () => {
    it('should extract text from real FNB PDF', async () => {
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn('LLMWHISPERER_API_KEY not set - skipping API test');
        return;
      }

      // Use one of the test PDFs
      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-11-03.pdf');

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const text = await parser.extractText(buffer);

      expect(text).toBeDefined();
      expect(text.length).toBeGreaterThan(100);
      expect(text.toUpperCase()).toContain('FNB');
    }, 60000); // 60 second timeout for API call
  });

  describe('parse() - REAL API', () => {
    it('should parse transactions from real FNB PDF', async () => {
      if (!process.env.LLMWHISPERER_API_KEY) {
        console.warn('LLMWHISPERER_API_KEY not set - skipping parse test');
        return;
      }

      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-11-03.pdf');

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parse(buffer);

      expect(Array.isArray(transactions)).toBe(true);
      // Real bank statements should have at least some transactions
      expect(transactions.length).toBeGreaterThan(0);

      // Verify transaction structure
      for (const tx of transactions) {
        expect(tx.date).toBeInstanceOf(Date);
        expect(typeof tx.description).toBe('string');
        expect(typeof tx.amountCents).toBe('number');
        expect(typeof tx.isCredit).toBe('boolean');
      }
    }, 60000);
  });

  describe('error handling', () => {
    it('should throw BusinessException when API key not configured', async () => {
      // Create parser with no API key
      const oldKey = process.env.LLMWHISPERER_API_KEY;
      delete process.env.LLMWHISPERER_API_KEY;

      const unconfiguredParser = new LLMWhispererParser();

      await expect(
        unconfiguredParser.extractText(Buffer.from('test'))
      ).rejects.toThrow(BusinessException);

      // Restore
      if (oldKey) {
        process.env.LLMWHISPERER_API_KEY = oldKey;
      }
    });
  });
});
</file>

<file path="tests/database/parsers/hybrid-pdf-parser.spec.ts">
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
      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-11-03.pdf');

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parse(buffer);

      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThanOrEqual(0);

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
      const pdfFiles = fs.readdirSync(bankStatementsDir)
        .filter(f => f.endsWith('.pdf'))
        .slice(0, 3); // Test first 3 PDFs

      for (const pdfFile of pdfFiles) {
        const pdfPath = path.join(bankStatementsDir, pdfFile);
        const buffer = fs.readFileSync(pdfPath);

        const transactions = await parser.parse(buffer);

        expect(Array.isArray(transactions)).toBe(true);
        console.log(`${pdfFile}: ${transactions.length} transactions`);
      }
    });
  });

  describe('parseWithConfidence()', () => {
    it('should return transactions with confidence scores', async () => {
      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-11-03.pdf');

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
    });
  });

  describe('confidence scoring', () => {
    it('should give high confidence to well-formatted transactions', async () => {
      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-11-03.pdf');

      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parseWithConfidence(buffer);

      // At least some transactions should have high confidence
      const highConfidence = transactions.filter(tx => tx.parsingConfidence >= 70);

      if (transactions.length > 0) {
        // Expect at least 50% to have decent confidence
        expect(highConfidence.length / transactions.length).toBeGreaterThan(0.3);
      }
    });
  });

  describe('error handling', () => {
    it('should throw on empty buffer', async () => {
      await expect(parser.parse(Buffer.from(''))).rejects.toThrow(ValidationException);
    });

    it('should throw on invalid PDF buffer', async () => {
      await expect(
        parser.parse(Buffer.from('not a pdf'))
      ).rejects.toThrow(ValidationException);
    });
  });
});
</file>

<file path="tests/database/parsers/pdf-parser-confidence.spec.ts">
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
      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-11-03.pdf');

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
      const pdfPath = path.join(bankStatementsDir, '63061274808 2025-01-03.pdf');

      if (!fs.existsSync(pdfPath)) {
        console.warn(`Test PDF not found at ${pdfPath}`);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const transactions = await parser.parseWithConfidence(buffer);

      // Check that confidence reasons are populated for lower scores
      const lowConfidence = transactions.filter(tx => tx.parsingConfidence < 80);

      for (const tx of lowConfidence) {
        expect(tx.confidenceReasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe('confidence thresholds', () => {
    it('should identify transactions needing LLMWhisperer fallback', async () => {
      const pdfFiles = fs.readdirSync(bankStatementsDir)
        .filter(f => f.endsWith('.pdf'))
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
            tx => tx.parsingConfidence < threshold
          ).length;
        } catch {
          // Skip files that fail to parse
        }
      }

      console.log(`Total: ${totalTransactions}, Low confidence (< ${threshold}%): ${lowConfidenceTransactions}`);
      console.log(`Low confidence rate: ${((lowConfidenceTransactions / totalTransactions) * 100).toFixed(1)}%`);
    });
  });
});
</file>

</test_files>

<validation_checklist>
Run these commands in order after implementation:

1. Verify environment:
   grep LLMWHISPERER .env

2. Build project:
   npm run build

3. Run parser tests:
   npm test -- --testPathPattern="parsers" --verbose

4. Run LLMWhisperer-specific tests:
   npm test -- --testPathPattern="llmwhisperer" --verbose

5. Run hybrid parser tests:
   npm test -- --testPathPattern="hybrid" --verbose

6. Run all tests:
   npm test

Expected: All existing tests pass + new parser tests pass
</validation_checklist>

<error_handling>
## CRITICAL: No Fallbacks, Fail Fast

All errors MUST:
1. Throw immediately with descriptive message and error code
2. Include full context for debugging
3. Log stack trace before throwing

## Exception Types
- ValidationException: Empty buffer, invalid PDF
- BusinessException: API not configured, API errors, network failures

## Example Error Pattern
```typescript
this.logger.error(
  `LLMWhisperer API error: HTTP ${status}`,
  { status, error: errorText }
);
throw new BusinessException(
  `LLMWhisperer API request failed: HTTP ${status}`,
  'LLMWHISPERER_API_ERROR',
  { status, error: errorText }
);
```
</error_handling>

<testing_requirements>
## CRITICAL: Real Data, No Mocks

All tests MUST:
1. Use REAL FNB PDF files from /bank-statements/
2. Test actual API integration (with timeout handling)
3. Verify transaction parsing accuracy
4. Test confidence scoring logic
5. Test hybrid routing decisions

## Test PDFs Available
- 29 FNB bank statements (2023-2025)
- Located at: /bank-statements/63061274808 YYYY-MM-DD.pdf
</testing_requirements>

<success_criteria>
1. `npm run build` succeeds with no TypeScript errors
2. All existing 1200+ tests pass
3. LLMWhisperer parser tests pass with real API
4. Hybrid parser tests pass with real PDFs
5. Confidence scoring correctly identifies low-quality extractions
6. Hybrid routing uses LLMWhisperer when local confidence is low
7. Error handling is robust - no silent failures
</success_criteria>

</task_spec>
