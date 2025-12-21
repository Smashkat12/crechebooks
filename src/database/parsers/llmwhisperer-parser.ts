/**
 * LLMWhisperer PDF Parser
 * TASK-TRANS-015
 *
 * Cloud-based PDF extraction using LLMWhisperer API.
 * CRITICAL: No fallbacks - if API fails, error immediately with full context.
 */
import { Logger } from '@nestjs/common';
import { ParsedTransaction } from '../dto/import.dto';
import { parseDate, extractPayeeName } from './parse-utils';
import {
  BusinessException,
  ValidationException,
} from '../../shared/exceptions';
import { getLLMWhispererConfig } from '../../config/llmwhisperer.config';

interface LLMWhispererResponse {
  status: string;
  status_code?: number;
  whisper_hash?: string;
  extraction?: {
    result_text?: string;
  };
  message?: string;
  // V2 API response format
  extracted_text?: string;
}

export class LLMWhispererParser {
  private readonly logger = new Logger(LLMWhispererParser.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    const config = getLLMWhispererConfig();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
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
        'LLMWHISPERER_NOT_CONFIGURED',
      );
    }

    this.logger.log(`Sending ${buffer.length} bytes to LLMWhisperer API`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.baseUrl}/api/v2/whisper`, {
        method: 'POST',
        headers: {
          'unstract-key': this.apiKey,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(buffer),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `LLMWhisperer API error: HTTP ${response.status} - ${errorText}`,
        );
        throw new BusinessException(
          `LLMWhisperer API request failed: HTTP ${response.status}`,
          'LLMWHISPERER_API_ERROR',
          {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          },
        );
      }

      const result = (await response.json()) as LLMWhispererResponse;

      // Handle different API response formats
      let extractedText = '';

      if (result.extracted_text) {
        // V2 API direct response
        extractedText = result.extracted_text;
      } else if (result.extraction?.result_text) {
        // Nested extraction format
        extractedText = result.extraction.result_text;
      } else if (result.status === 'processed' || result.status === 'success') {
        // Status indicates success but text might be elsewhere
        this.logger.warn(
          'LLMWhisperer returned success but no text found in expected locations',
        );
      }

      if (!extractedText.trim()) {
        this.logger.error(
          `LLMWhisperer returned empty text. Response: ${JSON.stringify(result).substring(0, 500)}`,
        );
        throw new ValidationException('LLMWhisperer returned empty text', [
          {
            field: 'extraction',
            message: 'No text could be extracted from PDF via LLMWhisperer',
            value: JSON.stringify(result).substring(0, 200),
          },
        ]);
      }

      this.logger.log(
        `LLMWhisperer extracted ${extractedText.length} characters`,
      );
      return extractedText;
    } catch (error) {
      if (
        error instanceof BusinessException ||
        error instanceof ValidationException
      ) {
        throw error;
      }

      // Handle timeout
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(`LLMWhisperer API timeout after ${this.timeoutMs}ms`);
        throw new BusinessException(
          `LLMWhisperer API timeout after ${this.timeoutMs}ms`,
          'LLMWHISPERER_TIMEOUT',
        );
      }

      // Handle network errors
      this.logger.error(
        `LLMWhisperer network error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BusinessException(
        `LLMWhisperer network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LLMWHISPERER_NETWORK_ERROR',
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
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
   * LLMWhisperer outputs multi-line format:
   *   Line 1: DD Mon (date)
   *   Line 2: Description
   *   Line 3: Amount with Cr/Dr suffix (credits) or just number (debits)
   *   Line 4: Balance with Cr/Dr suffix
   *   Line 5: Optional bank charges
   */
  private parseExtractedText(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    const monthMap: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    };

    // Extract year from statement period line
    let statementYear = new Date().getFullYear().toString();
    for (const line of lines) {
      const periodMatch = line.match(/Statement Period.*?(\d{4})/i);
      if (periodMatch) {
        statementYear = periodMatch[1];
        break;
      }
    }

    // Date pattern: DD Mon (e.g., "01 Aug")
    const datePattern =
      /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;
    // Amount pattern: number with optional Cr/Dr suffix
    const amountPattern = /^([\d,]+\.\d{2})(Cr)?$/i;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Skip headers/footers
      if (this.isHeaderOrFooter(line)) {
        i++;
        continue;
      }

      // Look for date line
      const dateMatch = line.match(datePattern);
      if (dateMatch && i + 2 < lines.length) {
        const [, day, monthName] = dateMatch;
        const monthNum = monthMap[monthName.toLowerCase()];

        if (monthNum) {
          const description = lines[i + 1];
          const amountLine = lines[i + 2];

          // Skip if description looks like a header
          if (this.isHeaderOrFooter(description)) {
            i++;
            continue;
          }

          const amountMatch = amountLine.match(amountPattern);
          if (amountMatch) {
            try {
              const [, amountStr, crSuffix] = amountMatch;
              const isoDateStr = `${statementYear}-${monthNum}-${day.padStart(2, '0')}`;
              const date = parseDate(isoDateStr);

              // Parse amount (remove commas)
              const cleanAmount = amountStr.replace(/,/g, '');
              const amountCents = Math.round(parseFloat(cleanAmount) * 100);

              // If amount ends with Cr, it's a credit; otherwise debit
              const isCredit = !!crSuffix;

              transactions.push({
                date,
                description: description.trim(),
                payeeName: extractPayeeName(description),
                reference: null,
                amountCents,
                isCredit,
              });

              // Skip past the transaction lines (date, description, amount, balance)
              i += 4;

              // Check if next line is bank charges (decimal number without Cr/Dr suffix)
              // Bank charges appear after balance for debit transactions
              // Examples: 12.00, 3.68, 26.10, 8.00, 18.60
              if (i < lines.length) {
                const bankChargesPattern = /^[\d,]+\.\d{2}$/;
                if (
                  bankChargesPattern.test(lines[i]) &&
                  !lines[i].includes('Cr')
                ) {
                  this.logger.debug(`Skipping bank charges line: ${lines[i]}`);
                  i++; // Skip bank charges line
                }
              }
              continue;
            } catch {
              this.logger.debug(
                `Skipping transaction (parse error): ${line} - ${description}`,
              );
            }
          }
        }
      }

      i++;
    }

    this.logger.log(`LLMWhisperer parsed ${transactions.length} transactions`);
    return transactions;
  }

  /**
   * Check if line is a header or footer that should be skipped
   */
  private isHeaderOrFooter(line: string): boolean {
    const skipPatterns = [
      /^page\s+\d+/i,
      /^statement\s+date/i,
      /^account\s+(number|holder)/i,
      /^balance\s+(brought|carried)/i,
      /^opening\s+balance/i,
      /^closing\s+balance/i,
      /^total/i,
      /^date\s+description\s+amount/i,
      /^fnb\s+/i,
      /^first\s+national\s+bank/i,
    ];

    return skipPatterns.some((pattern) => pattern.test(line));
  }
}
