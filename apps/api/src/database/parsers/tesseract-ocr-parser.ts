/**
 * Tesseract OCR Parser
 * TASK-TRANS-035
 *
 * Offline OCR fallback for scanned PDFs using Tesseract.js.
 * Used when:
 * - pdf-parse returns low text content (< 100 chars per page)
 * - LLMWhisperer is unavailable
 */
import { Logger } from '@nestjs/common';
import { createWorker, Worker, OEM, PSM } from 'tesseract.js';
import { pdfToPng } from 'pdf-to-png-converter';
import { ParsedTransaction } from '../dto/import.dto';
import { parseDate, parseCurrency, extractPayeeName } from './parse-utils';
import { ValidationException } from '../../shared/exceptions';

/**
 * Type definition for page output from pdf-to-png-converter
 */
interface PngPage {
  pageNumber: number;
  name: string;
  content?: Buffer;
  path: string;
  width: number;
  height: number;
}

/**
 * Configuration for OCR processing
 */
interface OcrConfig {
  /** Minimum confidence score (0-100) to consider OCR result valid */
  minConfidence: number;
  /** Characters per page threshold to detect scanned PDFs */
  charsPerPageThreshold: number;
  /** Language(s) for OCR */
  languages: string[];
}

/**
 * OCR extraction result with confidence metrics
 */
interface OcrResult {
  /** Extracted text content */
  text: string;
  /** OCR confidence score (0-100) */
  confidence: number;
  /** Number of pages processed */
  pagesProcessed: number;
}

export class TesseractOcrParser {
  private readonly logger = new Logger(TesseractOcrParser.name);
  private worker: Worker | null = null;
  private readonly config: OcrConfig = {
    minConfidence: 60,
    charsPerPageThreshold: 100,
    languages: ['eng'],
  };

  /**
   * Check if a PDF is likely scanned (image-based) based on text content ratio
   *
   * @param textContent - Text extracted by pdf-parse
   * @param pageCount - Number of pages in the PDF
   * @returns true if the PDF appears to be scanned (low text-to-page ratio)
   */
  isScannedPdf(textContent: string, pageCount: number): boolean {
    if (pageCount <= 0) {
      return false;
    }

    const textLength = textContent?.trim().length || 0;
    const charsPerPage = textLength / pageCount;

    const isScanned = charsPerPage < this.config.charsPerPageThreshold;

    if (isScanned) {
      this.logger.log(
        `PDF appears to be scanned: ${charsPerPage.toFixed(1)} chars/page ` +
          `(threshold: ${this.config.charsPerPageThreshold})`,
      );
    }

    return isScanned;
  }

  /**
   * Initialize the Tesseract worker
   */
  private async initWorker(): Promise<Worker> {
    if (this.worker) {
      return this.worker;
    }

    this.logger.log('Initializing Tesseract worker...');

    this.worker = await createWorker(this.config.languages, OEM.LSTM_ONLY, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          this.logger.debug(
            `OCR progress: ${Math.round(m.progress * 100)}%`,
          );
        }
      },
    });

    // Configure for document scanning - single block of text
    await this.worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    this.logger.log('Tesseract worker initialized');
    return this.worker;
  }

  /**
   * Terminate the worker to free resources
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.logger.log('Tesseract worker terminated');
    }
  }

  /**
   * Extract text from a PDF buffer using OCR
   *
   * @param buffer - PDF file buffer
   * @returns OCR result with extracted text and confidence
   * @throws ValidationException if PDF conversion or OCR fails
   */
  async extractText(buffer: Buffer): Promise<OcrResult> {
    this.logger.log(`Starting OCR extraction for ${buffer.length} bytes`);

    // Convert PDF pages to PNG images
    // Need to convert Buffer to Uint8Array for pdf-to-png-converter
    let pngPages: PngPage[];
    try {
      const uint8Array = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
      pngPages = await pdfToPng(uint8Array.buffer, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: 2.0, // Higher resolution for better OCR
      });
    } catch (error) {
      this.logger.error(
        `PDF to PNG conversion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ValidationException('Failed to convert PDF for OCR', [
        {
          field: 'file',
          message: 'Unable to convert PDF pages to images for OCR processing',
          value: error instanceof Error ? error.message : String(error),
        },
      ]);
    }

    if (!pngPages || pngPages.length === 0) {
      throw new ValidationException('No pages found in PDF', [
        {
          field: 'file',
          message: 'PDF contains no pages to process',
        },
      ]);
    }

    this.logger.log(`Converted PDF to ${pngPages.length} PNG images`);

    // Initialize worker
    const worker = await this.initWorker();

    // Process each page
    const textParts: string[] = [];
    let totalConfidence = 0;
    let pagesWithConfidence = 0;

    for (let i = 0; i < pngPages.length; i++) {
      const page = pngPages[i];
      const pageBuffer = page.content;

      // Skip pages with no content
      if (!pageBuffer) {
        this.logger.warn(`Page ${i + 1} has no content, skipping`);
        continue;
      }

      this.logger.debug(`Processing page ${i + 1}/${pngPages.length}`);

      try {
        // Pass Buffer directly - Tesseract.js ImageLike accepts Buffer
        const result = await worker.recognize(pageBuffer as unknown as Buffer);

        if (result.data.text.trim()) {
          textParts.push(result.data.text);
        }

        // Track confidence
        if (result.data.confidence > 0) {
          totalConfidence += result.data.confidence;
          pagesWithConfidence++;
        }

        this.logger.debug(
          `Page ${i + 1} OCR complete - confidence: ${result.data.confidence.toFixed(1)}%`,
        );
      } catch (error) {
        this.logger.warn(
          `OCR failed for page ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue with other pages
      }
    }

    const text = textParts.join('\n\n');
    const averageConfidence =
      pagesWithConfidence > 0 ? totalConfidence / pagesWithConfidence : 0;

    this.logger.log(
      `OCR extraction complete: ${text.length} characters, ` +
        `${pngPages.length} pages, average confidence: ${averageConfidence.toFixed(1)}%`,
    );

    return {
      text,
      confidence: averageConfidence,
      pagesProcessed: pngPages.length,
    };
  }

  /**
   * Parse PDF buffer into transactions using OCR
   *
   * @param buffer - PDF file buffer
   * @returns Array of parsed transactions
   * @throws ValidationException if OCR or parsing fails
   */
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const ocrResult = await this.extractText(buffer);

    if (ocrResult.confidence < this.config.minConfidence) {
      this.logger.warn(
        `OCR confidence (${ocrResult.confidence.toFixed(1)}%) ` +
          `below threshold (${this.config.minConfidence}%)`,
      );
    }

    if (!ocrResult.text.trim()) {
      this.logger.warn('OCR returned no text');
      return [];
    }

    return this.parseOcrText(ocrResult.text);
  }

  /**
   * Parse OCR-extracted text into transactions
   * Handles both line-by-line and multi-line transaction formats
   */
  private parseOcrText(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    this.logger.debug(`Parsing ${lines.length} lines of OCR text`);

    // Month name to number mapping
    const monthMap: Record<string, string> = {
      jan: '01',
      january: '01',
      feb: '02',
      february: '02',
      mar: '03',
      march: '03',
      apr: '04',
      april: '04',
      may: '05',
      jun: '06',
      june: '06',
      jul: '07',
      july: '07',
      aug: '08',
      august: '08',
      sep: '09',
      sept: '09',
      september: '09',
      oct: '10',
      october: '10',
      nov: '11',
      november: '11',
      dec: '12',
      december: '12',
    };

    // Try to extract statement year
    let statementYear = new Date().getFullYear().toString();
    for (const line of lines) {
      // Match "Statement Period : 30 September 2025 to 31 October 2025"
      const periodMatch = line.match(/(\d{4})\s*(?:to|$)/i);
      if (periodMatch) {
        statementYear = periodMatch[1];
        break;
      }
      // Match just a year in context of statement/period
      const yearMatch = line.match(/(?:statement|period).*?(\d{4})/i);
      if (yearMatch) {
        statementYear = yearMatch[1];
        break;
      }
    }

    // Pattern 1: Standard Bank format - DD/MM/YYYY Description Amount
    const standardPattern =
      /(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+([-]?\d[\d\s,]*\.?\d*)\s*$/;

    // Pattern 2: ABSA format - YYYY-MM-DD Description Amount
    const absaPattern =
      /(\d{4}-\d{1,2}-\d{1,2})\s+(.+?)\s+([-]?R?\s*\d[\d\s,]*\.?\d*)\s*$/i;

    // Pattern 3: FNB compact format - DD Mon Description Amount[Cr]
    const fnbCompactPattern =
      /^(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(.+?)([\d,]+\.\d{2})(Cr|Dr)?/i;

    // Pattern 4: Date-only line (for multi-line transactions)
    const dateOnlyPattern =
      /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*$/i;

    // Pattern 5: Amount pattern for multi-line
    const amountPattern = /^([\d,]+\.\d{2})(Cr)?$/i;

    // Process line by line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip headers and footers
      if (this.isHeaderOrFooter(line)) {
        continue;
      }

      // Try Pattern 1: Standard Bank
      const standardMatch = line.match(standardPattern);
      if (standardMatch) {
        try {
          const [, dateStr, description, amountStr] = standardMatch;
          const date = parseDate(dateStr);
          const amountCents = Math.abs(parseCurrency(amountStr));

          if (this.isValidTransactionAmount(amountCents)) {
            transactions.push({
              date,
              description: description.trim(),
              payeeName: extractPayeeName(description),
              reference: null,
              amountCents,
              isCredit: !amountStr.trim().startsWith('-'),
            });
          }
          continue;
        } catch {
          // Pattern didn't work, try next
        }
      }

      // Try Pattern 2: ABSA
      const absaMatch = line.match(absaPattern);
      if (absaMatch) {
        try {
          const [, dateStr, description, amountStr] = absaMatch;
          const date = parseDate(dateStr);
          const amountCents = Math.abs(parseCurrency(amountStr));

          if (this.isValidTransactionAmount(amountCents)) {
            transactions.push({
              date,
              description: description.trim(),
              payeeName: extractPayeeName(description),
              reference: null,
              amountCents,
              isCredit: !amountStr.trim().startsWith('-'),
            });
          }
          continue;
        } catch {
          // Pattern didn't work, try next
        }
      }

      // Try Pattern 3: FNB compact
      const fnbMatch = line.match(fnbCompactPattern);
      if (fnbMatch) {
        try {
          const [, day, monthName, description, amountStr, crSuffix] = fnbMatch;
          const monthNum = monthMap[monthName.toLowerCase()];

          if (monthNum) {
            const isoDateStr = `${statementYear}-${monthNum}-${day.padStart(2, '0')}`;
            const date = parseDate(isoDateStr);
            const cleanAmount = amountStr.replace(/,/g, '');
            const amountCents = Math.round(parseFloat(cleanAmount) * 100);

            if (this.isValidTransactionAmount(amountCents)) {
              transactions.push({
                date,
                description: description.trim(),
                payeeName: extractPayeeName(description),
                reference: null,
                amountCents,
                isCredit: crSuffix?.toLowerCase() === 'cr',
              });
            }
          }
          continue;
        } catch {
          // Pattern didn't work, try next
        }
      }

      // Try Pattern 4: Multi-line format (date on one line, description, then amount)
      const dateOnlyMatch = line.match(dateOnlyPattern);
      if (dateOnlyMatch && i + 2 < lines.length) {
        try {
          const [, day, monthName] = dateOnlyMatch;
          const monthNum = monthMap[monthName.toLowerCase()];

          if (monthNum) {
            const description = lines[i + 1];
            const amountLine = lines[i + 2];

            // Skip if description looks like header
            if (this.isHeaderOrFooter(description)) {
              continue;
            }

            const amountMatch = amountLine.match(amountPattern);
            if (amountMatch) {
              const [, amountStr, crSuffix] = amountMatch;
              const isoDateStr = `${statementYear}-${monthNum}-${day.padStart(2, '0')}`;
              const date = parseDate(isoDateStr);
              const cleanAmount = amountStr.replace(/,/g, '');
              const amountCents = Math.round(parseFloat(cleanAmount) * 100);

              if (this.isValidTransactionAmount(amountCents)) {
                transactions.push({
                  date,
                  description: description.trim(),
                  payeeName: extractPayeeName(description),
                  reference: null,
                  amountCents,
                  isCredit: !!crSuffix,
                });
              }

              // Skip processed lines
              i += 3;
              continue;
            }
          }
        } catch {
          // Pattern didn't work, continue
        }
      }
    }

    this.logger.log(
      `OCR parser extracted ${transactions.length} transactions`,
    );
    return transactions;
  }

  /**
   * Check if a line is a header or footer to skip
   */
  private isHeaderOrFooter(line: string): boolean {
    const skipPatterns = [
      /^page\s+\d+/i,
      /^statement\s+(date|period)/i,
      /^account\s+(number|holder|name)/i,
      /^balance\s+(brought|carried|forward)/i,
      /^opening\s+balance/i,
      /^closing\s+balance/i,
      /^total/i,
      /^date\s+description\s+amount/i,
      /^description\s+debit\s+credit/i,
      /^transaction\s+history/i,
      /^fnb\s+/i,
      /^first\s+national\s+bank/i,
      /^standard\s+bank/i,
      /^absa\s+bank/i,
      /^\d+\s*of\s*\d+$/i, // Page numbers like "1 of 5"
      /^continued/i,
    ];

    return skipPatterns.some((pattern) => pattern.test(line.trim()));
  }

  /**
   * Validate transaction amount is within reasonable bounds
   * Filters out balance values incorrectly parsed as transactions
   */
  private isValidTransactionAmount(amountCents: number): boolean {
    // Skip zero or negative amounts
    if (amountCents <= 0) {
      return false;
    }

    // Skip amounts larger than R1,000,000 (likely balance values)
    const MAX_AMOUNT_CENTS = 100_000_000;
    if (amountCents > MAX_AMOUNT_CENTS) {
      this.logger.debug(
        `Skipping excessive amount: R${(amountCents / 100).toLocaleString()}`,
      );
      return false;
    }

    return true;
  }
}
