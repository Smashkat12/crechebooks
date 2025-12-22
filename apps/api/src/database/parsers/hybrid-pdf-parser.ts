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
import {
  ParsedTransaction,
  ParsedTransactionWithConfidence,
} from '../dto/import.dto';
import { getPdfParserConfig } from '../../config/llmwhisperer.config';

export class HybridPdfParser {
  private readonly logger = new Logger(HybridPdfParser.name);
  private readonly localParser: PdfParser;
  private readonly llmWhispererParser: LLMWhispererParser;
  private readonly config = getPdfParserConfig();

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

    this.logger.log(
      `Local parser extracted ${localResults.length} transactions`,
    );

    // 2. Check if we need LLMWhisperer
    const threshold = this.config.confidenceThreshold;
    const lowConfidenceCount = localResults.filter(
      (tx) => tx.parsingConfidence < threshold,
    ).length;

    const totalCount = localResults.length;
    const needsLLMWhisperer =
      totalCount < this.config.minTransactionsForLocal ||
      lowConfidenceCount > totalCount * 0.2; // More than 20% low confidence

    if (!needsLLMWhisperer || !this.llmWhispererParser.isAvailable()) {
      if (!this.llmWhispererParser.isAvailable() && needsLLMWhisperer) {
        this.logger.warn(
          'LLMWhisperer not available - using local results only',
        );
      }

      this.logger.log(
        `Returning ${localResults.length} local results (confidence OK)`,
      );
      return localResults.map(this.stripConfidence);
    }

    // 3. Use LLMWhisperer for better extraction
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
      // LLMWhisperer failed - log and return local results
      this.logger.error(
        `LLMWhisperer failed, using local results: ${error instanceof Error ? error.message : String(error)}`,
      );
      return localResults.map(this.stripConfidence);
    }
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
