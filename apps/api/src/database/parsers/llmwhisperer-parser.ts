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
  ParsedBankStatement,
  ParsedBankTransaction,
} from '../entities/bank-statement-match.entity';
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

interface LLMWhispererStatusResponse {
  status: string;
  status_code?: number;
  result_text?: string;
  extracted_text?: string;
  message?: string;
}

export class LLMWhispererParser {
  private readonly logger = new Logger(LLMWhispererParser.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs = 2000; // Poll every 2 seconds
  private readonly maxPollAttempts = 30; // Max 60 seconds of polling

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

      // Handle async processing - API returns job hash for polling
      if (result.status === 'processing' && result.whisper_hash) {
        this.logger.log(
          `LLMWhisperer job accepted, polling for results: ${result.whisper_hash}`,
        );
        return await this.pollForResult(result.whisper_hash);
      }

      // Handle immediate response formats
      const extractedText = this.extractTextFromResponse(result);

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
   * Poll for extraction result using whisper_hash
   * @throws BusinessException if polling times out or fails
   * @throws ValidationException if no text extracted
   */
  private async pollForResult(whisperHash: string): Promise<string> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      // Wait before polling
      await this.sleep(this.pollIntervalMs);

      this.logger.debug(
        `Polling attempt ${attempt + 1}/${this.maxPollAttempts} for hash: ${whisperHash}`,
      );

      try {
        const response = await fetch(
          `${this.baseUrl}/api/v2/whisper-status?whisper_hash=${whisperHash}`,
          {
            method: 'GET',
            headers: {
              'unstract-key': this.apiKey,
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(
            `LLMWhisperer status API error: HTTP ${response.status} - ${errorText}`,
          );
          throw new BusinessException(
            `LLMWhisperer status request failed: HTTP ${response.status}`,
            'LLMWHISPERER_API_ERROR',
            { status: response.status, error: errorText },
          );
        }

        const result = (await response.json()) as LLMWhispererStatusResponse;

        // Check if still processing
        if (result.status === 'processing') {
          this.logger.debug('Still processing, continuing to poll...');
          continue;
        }

        // Check for processed/success status
        if (result.status === 'processed' || result.status === 'success') {
          // Text may be directly in response or need to fetch via retrieve endpoint
          let extractedText = result.result_text || result.extracted_text || '';

          // If no text in status response, fetch via retrieve endpoint
          if (!extractedText.trim()) {
            this.logger.log(
              'No text in status response, fetching via retrieve endpoint...',
            );
            extractedText = await this.retrieveResult(whisperHash);
          }

          if (!extractedText.trim()) {
            this.logger.error(
              `LLMWhisperer returned empty text after polling. Response: ${JSON.stringify(result).substring(0, 500)}`,
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
            `LLMWhisperer extracted ${extractedText.length} characters after ${attempt + 1} poll(s)`,
          );
          return extractedText;
        }

        // Handle error status
        if (result.status === 'error' || result.status === 'failed') {
          this.logger.error(
            `LLMWhisperer extraction failed: ${result.message}`,
          );
          throw new BusinessException(
            `LLMWhisperer extraction failed: ${result.message || 'Unknown error'}`,
            'LLMWHISPERER_EXTRACTION_FAILED',
            { response: result },
          );
        }

        // Unknown status - log and continue polling
        this.logger.warn(`Unknown LLMWhisperer status: ${result.status}`);
      } catch (error) {
        if (
          error instanceof BusinessException ||
          error instanceof ValidationException
        ) {
          throw error;
        }
        this.logger.error(
          `Polling error: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue polling on network errors
      }
    }

    // Polling timed out
    this.logger.error(
      `LLMWhisperer polling timed out after ${this.maxPollAttempts} attempts`,
    );
    throw new BusinessException(
      `LLMWhisperer extraction timed out after ${(this.maxPollAttempts * this.pollIntervalMs) / 1000} seconds`,
      'LLMWHISPERER_POLL_TIMEOUT',
      { whisperHash, attempts: this.maxPollAttempts },
    );
  }

  /**
   * Retrieve extracted text using whisper_hash
   * @throws BusinessException if retrieve fails
   */
  private async retrieveResult(whisperHash: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v2/whisper-retrieve?whisper_hash=${whisperHash}`,
        {
          method: 'GET',
          headers: {
            'unstract-key': this.apiKey,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `LLMWhisperer retrieve API error: HTTP ${response.status} - ${errorText}`,
        );
        throw new BusinessException(
          `LLMWhisperer retrieve request failed: HTTP ${response.status}`,
          'LLMWHISPERER_API_ERROR',
          { status: response.status, error: errorText },
        );
      }

      // The retrieve endpoint may return text directly or as JSON
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const result = (await response.json()) as LLMWhispererStatusResponse;
        return result.result_text || result.extracted_text || '';
      } else {
        // Plain text response
        return await response.text();
      }
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(
        `Retrieve error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BusinessException(
        `LLMWhisperer retrieve failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LLMWHISPERER_RETRIEVE_ERROR',
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Extract text from response object
   */
  private extractTextFromResponse(
    result: LLMWhispererResponse | LLMWhispererStatusResponse,
  ): string {
    if ('extracted_text' in result && result.extracted_text) {
      return result.extracted_text;
    }
    if ('result_text' in result && result.result_text) {
      return result.result_text;
    }
    if (
      'extraction' in result &&
      result.extraction &&
      result.extraction.result_text
    ) {
      return result.extraction.result_text;
    }
    return '';
  }

  /**
   * Sleep helper for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
   * FNB OCR output is SINGLE LINE format:
   *   "DD Mon Description...   Amount[Cr]   Balance[Cr]   [BankCharges]"
   * Examples:
   *   "15 Aug Magtape Credit Capitec Boitumelo Makhubela                          1,000.00Cr       1,100.00Cr"
   *   "17 Aug #Monthly Account Fee                                                   99.00          1,291.00Cr"
   */
  private parseExtractedText(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    // Debug: Log first 50 lines to understand the format
    this.logger.debug(`=== OCR TEXT SAMPLE (first 50 lines) ===`);
    lines.slice(0, 50).forEach((line, i) => {
      this.logger.debug(`Line ${i}: "${line}"`);
    });
    this.logger.debug(`=== END OCR TEXT SAMPLE ===`);

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

    // Extract year from statement period line - get the END date's year
    let statementYear = new Date().getFullYear().toString();
    for (const line of lines) {
      // Match "Statement Period : 31 July 2023 to 31 August 2023"
      // We want the year from the END date
      const periodMatch = line.match(
        /Statement Period\s*:\s*\d{1,2}\s+\w+\s+(\d{4})\s+to\s+\d{1,2}\s+\w+\s+(\d{4})/i,
      );
      if (periodMatch) {
        statementYear = periodMatch[2]; // Use end date year
        this.logger.debug(`Found statement year: ${statementYear}`);
        break;
      }
      // Fallback: just find any year in statement period line
      const simpleMatch = line.match(/Statement Period.*?(\d{4})/i);
      if (simpleMatch) {
        statementYear = simpleMatch[1];
        break;
      }
    }

    // FNB single-line transaction pattern:
    // Starts with DD Mon, then description, then amounts, with optional bank charge at end
    // Examples:
    //   "15 Aug Magtape Credit Capitec Boitumelo Makhubela                          1,000.00Cr       1,100.00Cr"
    //   "17 Aug #Monthly Account Fee                                                   99.00          1,291.00Cr"
    //   "21 Aug ADT Cash Deposit 09741002                     Bokamoso Mbewe          500.00Cr        1,791.00Cr     10.95"
    // The optional fee at the end (10.95) represents bank charges for the transaction
    const singleLinePattern =
      /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(.+?)\s+([\d,]+\.\d{2})(Cr)?\s+([\d,]+\.\d{2})(Cr|Dr)?(?:\s+([\d,]+\.\d{2}))?/i;

    for (const line of lines) {
      // Skip headers/footers
      if (this.isHeaderOrFooter(line)) {
        continue;
      }

      const match = line.match(singleLinePattern);
      if (match) {
        const [
          ,
          day,
          monthName,
          description,
          amountStr,
          amountCrSuffix,
          ,
          ,
          feeStr,
        ] = match;
        const monthNum = monthMap[monthName.toLowerCase()];

        if (monthNum) {
          try {
            const isoDateStr = `${statementYear}-${monthNum}-${day.padStart(2, '0')}`;
            const date = parseDate(isoDateStr);

            // Parse amount (remove commas)
            const cleanAmount = amountStr.replace(/,/g, '');
            const amountCents = Math.round(parseFloat(cleanAmount) * 100);

            // If amount has "Cr" suffix, it's a credit; otherwise it's a debit
            const isCredit = amountCrSuffix?.toLowerCase() === 'cr';

            // Parse optional bank charge/fee at end of line
            let feeAmountCents: number | undefined;
            if (feeStr) {
              const cleanFee = feeStr.replace(/,/g, '');
              feeAmountCents = Math.round(parseFloat(cleanFee) * 100);
              this.logger.debug(
                `Detected inline bank charge: R${(feeAmountCents / 100).toFixed(2)} for transaction`,
              );
            }

            // Clean up description - remove excessive whitespace
            const cleanDescription = description.replace(/\s{2,}/g, ' ').trim();

            const transaction: ParsedTransaction = {
              date,
              description: cleanDescription,
              payeeName: extractPayeeName(cleanDescription),
              reference: null,
              amountCents,
              isCredit,
            };

            // Store fee info if present (may be deducted in a later period)
            if (feeAmountCents && feeAmountCents > 0) {
              // Add fee to reference for visibility
              transaction.reference = `Bank charge: R${(feeAmountCents / 100).toFixed(2)}`;
            }

            transactions.push(transaction);

            this.logger.debug(
              `Parsed transaction: ${day} ${monthName} | ${cleanDescription} | ${amountCents}c | ${isCredit ? 'Credit' : 'Debit'}${feeAmountCents ? ` | Fee: ${feeAmountCents}c` : ''}`,
            );
          } catch (err) {
            this.logger.debug(
              `Skipping transaction (parse error): ${line} - ${err}`,
            );
          }
        }
      }
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
      // FNB table headers (single word headers)
      /^date$/i,
      /^description$/i,
      /^amount$/i,
      /^balance$/i,
      /^accrued$/i,
      /^bank$/i,
      /^charges$/i,
      /^transactions\s+in\s+rand/i,
      /^service\s+fees$/i,
      /^cash\s+deposit\s+fees$/i,
      /^cash\s+handling\s+fees$/i,
      /^other\s+fees$/i,
      /^interest\s+rate$/i,
      /^credit\s+rate/i,
      /^debit\s+rate/i,
      /^tiered$/i,
      /^statement\s+balances$/i,
      /^bank\s+charges$/i,
      /^\d+\.\d{2}%$/i, // Percentage rates like "7.00%"
      /^inclusive\s+of\s+vat/i,
      /^vat\s+registration/i,
      /^customer\s+vat/i,
      /^tax\s+invoice/i,
      /^gold\s+business\s+account/i,
      /^statement\s+period/i,
      /^universal\s+branch/i,
      /^relationship\s+manager/i,
      /^lost\s+cards/i,
      /^account\s+enquiries/i,
      /^fraud\s+/i,
      /^p\s+o\s+box/i,
      /^street\s+address/i,
      /^\d+\s*fnb\.co\.za$/i,
      /^johannesburg/i,
    ];

    return skipPatterns.some((pattern) => pattern.test(line));
  }

  /**
   * Extract bank statement with balances and transactions
   * TASK-RECON-019: Enhanced extraction for reconciliation
   * @throws BusinessException if extraction fails
   * @throws ValidationException if required fields cannot be extracted
   */
  async parseWithBalances(buffer: Buffer): Promise<ParsedBankStatement> {
    const text = await this.extractText(buffer);

    // Extract statement period - support multiple formats:
    // - "Statement Period: 01 October 2025 to 31 October 2025"
    // - "Statement Period : 30 September 2025 to 31 October 2025" (FNB format with space before colon)
    // - Handle multi-line extraction where text may have extra whitespace
    const periodPatterns = [
      /Statement\s+Period\s*:\s*(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i,
      /Statement\s+Period\s*:\s*(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})/i,
      /Period\s*:\s*(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i,
      /(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i,
    ];

    let periodMatch: RegExpMatchArray | null = null;
    for (const pattern of periodPatterns) {
      periodMatch = text.match(pattern);
      if (periodMatch) {
        this.logger.debug(`Matched statement period with pattern: ${pattern}`);
        break;
      }
    }

    if (!periodMatch) {
      this.logger.error(
        `Could not extract statement period from PDF. Text sample: ${text.substring(0, 500)}`,
      );
      throw new ValidationException(
        'Could not extract statement period from PDF',
        [
          {
            field: 'statementPeriod',
            message: 'Statement period not found in PDF',
            value: text.substring(0, 500),
          },
        ],
      );
    }

    const periodStart = this.parseStatementDate(periodMatch[1]);
    const periodEnd = this.parseStatementDate(periodMatch[2]);

    // Extract account number
    const accountMatch = text.match(/Account\s+(?:Number|No):?\s*(\d+)/i);
    const accountNumber = accountMatch ? accountMatch[1] : 'unknown';

    // Extract opening balance - support multiple formats:
    // - "Opening Balance: 6,294.42 Cr" (standard format)
    // - "Opening Balance" followed by amount on next line (FNB table format)
    // - Capture first amount after "Opening Balance" text
    const openingPatterns = [
      /Opening\s+Balance\s*:?\s*([\d,]+\.\d{2})\s*(Cr|Dr)?/i,
      /Opening\s+Balance[\s\S]*?([\d,]+\.\d{2})\s*(Cr|Dr)/i,
    ];

    let openingMatch: RegExpMatchArray | null = null;
    for (const pattern of openingPatterns) {
      openingMatch = text.match(pattern);
      if (openingMatch && openingMatch[1]) {
        this.logger.debug(
          `Matched opening balance: ${openingMatch[1]} ${openingMatch[2] || ''}`,
        );
        break;
      }
    }

    if (!openingMatch) {
      this.logger.error(
        `Could not extract opening balance from PDF. Text sample: ${text.substring(0, 500)}`,
      );
      throw new ValidationException(
        'Could not extract opening balance from PDF',
        [
          {
            field: 'openingBalance',
            message: 'Opening balance not found in PDF',
            value: text.substring(0, 500),
          },
        ],
      );
    }
    const openingBalanceCents = this.parseBalanceAmount(
      openingMatch[1],
      openingMatch[2],
    );

    // Extract closing balance - support multiple formats:
    // - "Closing Balance: 5,961.92 Cr" (standard format)
    // - FNB format where closing balance is second amount after opening
    const closingPatterns = [
      /Closing\s+Balance\s*:?\s*([\d,]+\.\d{2})\s*(Cr|Dr)?/i,
      /Closing\s+Balance[\s\S]*?([\d,]+\.\d{2})\s*(Cr|Dr)/i,
    ];

    let closingMatch: RegExpMatchArray | null = null;
    for (const pattern of closingPatterns) {
      closingMatch = text.match(pattern);
      if (closingMatch && closingMatch[1]) {
        this.logger.debug(
          `Matched closing balance: ${closingMatch[1]} ${closingMatch[2] || ''}`,
        );
        break;
      }
    }

    if (!closingMatch) {
      this.logger.error(
        `Could not extract closing balance from PDF. Text sample: ${text.substring(0, 500)}`,
      );
      throw new ValidationException(
        'Could not extract closing balance from PDF',
        [
          {
            field: 'closingBalance',
            message: 'Closing balance not found in PDF',
            value: text.substring(0, 500),
          },
        ],
      );
    }
    const closingBalanceCents = this.parseBalanceAmount(
      closingMatch[1],
      closingMatch[2],
    );

    // Extract transactions using existing method
    const parsedTransactions = this.parseExtractedText(text);

    // Convert to ParsedBankTransaction format
    const transactions: ParsedBankTransaction[] = parsedTransactions.map(
      (t) => ({
        date: t.date,
        description: t.description,
        amountCents: t.amountCents,
        isCredit: t.isCredit,
      }),
    );

    this.logger.log(
      `Parsed bank statement: account=${accountNumber}, period=${periodStart.toISOString()} to ${periodEnd.toISOString()}, opening=${openingBalanceCents}c, closing=${closingBalanceCents}c, transactions=${transactions.length}`,
    );

    return {
      statementPeriod: {
        start: periodStart,
        end: periodEnd,
      },
      accountNumber,
      openingBalanceCents,
      closingBalanceCents,
      transactions,
    };
  }

  /**
   * Parse statement date from "01 Aug 2023" format
   * @throws Error if date format is invalid
   */
  private parseStatementDate(dateStr: string): Date {
    const months: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    const parts = dateStr.trim().split(/\s+/);
    if (parts.length !== 3) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    const day = parseInt(parts[0], 10);
    const month = months[parts[1].toLowerCase().substring(0, 3)];
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || month === undefined || isNaN(year)) {
      throw new Error(`Invalid date components: ${dateStr}`);
    }

    return new Date(year, month, day);
  }

  /**
   * Parse balance amount with Cr/Dr suffix
   * Returns positive for credit balance, negative for debit balance
   */
  private parseBalanceAmount(amountStr: string, suffix?: string): number {
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    const cents = Math.round(amount * 100);

    // Dr suffix means debit (negative balance)
    if (suffix?.toLowerCase() === 'dr') {
      return -cents;
    }
    return cents;
  }
}
