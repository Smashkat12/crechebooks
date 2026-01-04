/**
 * Hybrid PDF Parser
 * TASK-TRANS-015, TASK-TRANS-035
 *
 * Implements confidence-based routing between:
 * 1. Local pdf-parse (first attempt)
 * 2. Tesseract OCR (fallback for scanned PDFs when LLMWhisperer unavailable)
 * 3. LLMWhisperer (cloud fallback for low confidence)
 *
 * CRITICAL: No workarounds - if something fails, error immediately.
 */
import { Logger } from '@nestjs/common';
import { PdfParser } from './pdf-parser';
import { LLMWhispererParser } from './llmwhisperer-parser';
import { TesseractOcrParser } from './tesseract-ocr-parser';
import {
  ParsedTransaction,
  ParsedTransactionWithConfidence,
} from '../dto/import.dto';
import { getPdfParserConfig } from '../../config/llmwhisperer.config';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

export class HybridPdfParser {
  private readonly logger = new Logger(HybridPdfParser.name);
  private readonly localParser: PdfParser;
  private readonly llmWhispererParser: LLMWhispererParser;
  private readonly tesseractParser: TesseractOcrParser;
  private readonly config = getPdfParserConfig();

  constructor() {
    this.localParser = new PdfParser();
    this.llmWhispererParser = new LLMWhispererParser();
    this.tesseractParser = new TesseractOcrParser();
  }

  /**
   * Parse PDF using hybrid approach:
   * 1. Try local parser first
   * 2. Calculate confidence for each transaction
   * 3. Check if PDF is scanned (low text content)
   * 4. If scanned and LLMWhisperer unavailable, use Tesseract OCR
   * 5. If any transaction below threshold, try LLMWhisperer
   * 6. Return best results
   *
   * @throws ValidationException if buffer is invalid
   * @throws BusinessException if all parsers fail
   */
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    this.logger.log('Starting hybrid PDF parsing');

    // 1. Try local parser first
    const localResults = await this.localParser.parseWithConfidence(buffer);

    this.logger.log(
      `Local parser extracted ${localResults.length} transactions`,
    );

    // 2. Check if we need alternative parsing
    const threshold = this.config.confidenceThreshold;
    const lowConfidenceCount = localResults.filter(
      (tx) => tx.parsingConfidence < threshold,
    ).length;

    const totalCount = localResults.length;
    const needsFallback =
      totalCount < this.config.minTransactionsForLocal ||
      lowConfidenceCount > totalCount * 0.2; // More than 20% low confidence

    // 3. Check if this is a scanned PDF
    const isScannedPdf = await this.checkIfScannedPdf(buffer);

    if (!needsFallback) {
      this.logger.log(
        `Returning ${localResults.length} local results (confidence OK)`,
      );
      return localResults.map(this.stripConfidence);
    }

    // 4. If scanned PDF and LLMWhisperer unavailable, try Tesseract OCR
    if (isScannedPdf && !this.llmWhispererParser.isAvailable()) {
      this.logger.log(
        'Scanned PDF detected and LLMWhisperer unavailable - using Tesseract OCR',
      );

      try {
        const ocrResults = await this.tesseractParser.parse(buffer);
        this.logger.log(
          `Tesseract OCR extracted ${ocrResults.length} transactions`,
        );

        if (ocrResults.length > 0) {
          return ocrResults;
        }

        // OCR returned nothing, fall back to local results
        this.logger.warn(
          'Tesseract OCR returned no transactions, using local results',
        );
        return localResults.map(this.stripConfidence);
      } catch (error) {
        this.logger.error(
          `Tesseract OCR failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Fall through to return local results
        return localResults.map(this.stripConfidence);
      }
    }

    // 5. LLMWhisperer not available - use local results or Tesseract
    if (!this.llmWhispererParser.isAvailable()) {
      if (needsFallback) {
        this.logger.warn(
          'LLMWhisperer not available - attempting Tesseract OCR as fallback',
        );

        try {
          const ocrResults = await this.tesseractParser.parse(buffer);
          if (ocrResults.length > localResults.length) {
            this.logger.log(
              `Using Tesseract OCR results (${ocrResults.length} vs ${localResults.length} local)`,
            );
            return ocrResults;
          }
        } catch (error) {
          this.logger.warn(
            `Tesseract OCR failed, using local: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Returning ${localResults.length} local results (no cloud fallback available)`,
      );
      return localResults.map(this.stripConfidence);
    }

    // 6. Use LLMWhisperer for better extraction
    this.logger.log(
      `Low confidence detected (${lowConfidenceCount}/${totalCount} below threshold) - using LLMWhisperer`,
    );

    try {
      const llmResults = await this.llmWhispererParser.parse(buffer);

      this.logger.log(
        `LLMWhisperer extracted ${llmResults.length} transactions`,
      );

      // If LLMWhisperer got more transactions, prefer it
      if (llmResults.length > localResults.length) {
        this.logger.log('Using LLMWhisperer results (more transactions found)');
        return llmResults;
      }

      // Otherwise, use local results (already verified the count is ok)
      this.logger.log('Using local results (comparable count)');
      return localResults.map(this.stripConfidence);
    } catch (error) {
      // LLMWhisperer failed - try Tesseract, then return local results
      this.logger.error(
        `LLMWhisperer failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Try Tesseract as last resort
      try {
        const ocrResults = await this.tesseractParser.parse(buffer);
        if (ocrResults.length > localResults.length) {
          this.logger.log(
            `Using Tesseract OCR results after LLMWhisperer failure`,
          );
          return ocrResults;
        }
      } catch (ocrError) {
        this.logger.warn(
          `Tesseract also failed: ${ocrError instanceof Error ? ocrError.message : String(ocrError)}`,
        );
      }

      return localResults.map(this.stripConfidence);
    }
  }

  /**
   * Check if the PDF is a scanned document (image-based)
   * Uses pdf-parse to extract text and checks character count per page
   */
  private async checkIfScannedPdf(buffer: Buffer): Promise<boolean> {
    try {
      const data = await pdfParse(buffer);
      const text: string = data.text || '';
      const pageCount: number = data.numpages || 1;

      return this.tesseractParser.isScannedPdf(text, pageCount);
    } catch (error) {
      this.logger.warn(
        `Could not determine if PDF is scanned: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Cleanup resources (call when done with parsing)
   */
  async cleanup(): Promise<void> {
    await this.tesseractParser.terminate();
  }

  /**
   * Parse with confidence scoring - exposes confidence for testing
   */
  async parseWithConfidence(
    buffer: Buffer,
  ): Promise<ParsedTransactionWithConfidence[]> {
    return this.localParser.parseWithConfidence(buffer);
  }

  /**
   * Strip confidence from transaction for final output
   */
  private stripConfidence = (
    tx: ParsedTransactionWithConfidence,
  ): ParsedTransaction => {
    return {
      date: tx.date,
      description: tx.description,
      payeeName: tx.payeeName,
      reference: tx.reference,
      amountCents: tx.amountCents,
      isCredit: tx.isCredit,
    };
  };
}
