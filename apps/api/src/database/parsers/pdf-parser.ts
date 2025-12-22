/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import { Logger } from '@nestjs/common';
import {
  ParsedTransaction,
  ParsedTransactionWithConfidence,
} from '../dto/import.dto';
import { parseCurrency, parseDate, extractPayeeName } from './parse-utils';
import {
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';

/**
 * PDF statement parser supporting multiple South African banks.
 *
 * Supported banks:
 * - Standard Bank (DD/MM/YYYY format)
 * - FNB (DD MMM YYYY format)
 * - ABSA (YYYY-MM-DD format)
 *
 * The parser automatically detects the bank from PDF content and applies
 * the appropriate parsing logic for each bank's statement format.
 */
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  /**
   * Parse PDF bank statement buffer into standardized transactions.
   *
   * @param buffer - PDF file buffer
   * @returns Array of parsed transactions
   * @throws ValidationException if buffer is invalid or PDF parsing fails
   * @throws BusinessException if bank format is not supported
   */
  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    // Validate buffer
    if (!buffer || buffer.length === 0) {
      throw new ValidationException('Invalid PDF file', [
        {
          field: 'file',
          message: 'PDF buffer is empty or invalid',
        },
      ]);
    }

    // Extract text from PDF
    let text: string;
    try {
      const data = await pdfParse(buffer);
      text = data.text;
    } catch (error) {
      this.logger.error(
        `PDF parsing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ValidationException('Failed to parse PDF file', [
        {
          field: 'file',
          message:
            'Unable to extract text from PDF. The file may be corrupted or password-protected.',
          value: error instanceof Error ? error.message : String(error),
        },
      ]);
    }

    // Validate text extraction
    if (!text || text.trim().length === 0) {
      throw new ValidationException('Empty PDF content', [
        {
          field: 'file',
          message: 'No text could be extracted from the PDF file',
        },
      ]);
    }

    this.logger.debug(`Extracted ${text.length} characters from PDF`);

    // Detect bank and parse accordingly
    const upperText = text.toUpperCase();

    if (upperText.includes('STANDARD BANK')) {
      this.logger.log('Detected Standard Bank format');
      return this.parseStandardBank(text);
    }

    if (
      upperText.includes('FNB') ||
      upperText.includes('FIRST NATIONAL BANK')
    ) {
      this.logger.log('Detected FNB format');
      return this.parseFNB(text);
    }

    if (upperText.includes('ABSA')) {
      this.logger.log('Detected ABSA format');
      return this.parseAbsa(text);
    }

    // Unsupported bank
    throw new BusinessException(
      'Unsupported bank statement format. Only Standard Bank, FNB, and ABSA are currently supported.',
      'UNSUPPORTED_BANK_FORMAT',
      {
        detectedContent: text.substring(0, 200), // First 200 chars for debugging
      },
    );
  }

  /**
   * Parse Standard Bank statement format.
   * Pattern: DD/MM/YYYY Description Amount
   * Positive amounts = credits, Negative amounts = debits
   */
  private parseStandardBank(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // Regex: DD/MM/YYYY followed by description and amount
    // Amount can be positive or negative, with optional spaces/commas
    const linePattern =
      /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d[\d\s,]*\.?\d*)\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(linePattern);
      if (!match) {
        // Skip unparseable lines silently
        this.logger.debug(
          `Skipping unparseable line ${i + 1}: ${line.substring(0, 50)}`,
        );
        continue;
      }

      try {
        const [, dateStr, description, amountStr] = match;

        // Parse date
        const date = parseDate(dateStr);

        // Parse amount
        const amountCents = Math.abs(parseCurrency(amountStr));

        // Determine if credit or debit based on sign
        const isCredit = !amountStr.trim().startsWith('-');

        // Extract payee name
        const payeeName = extractPayeeName(description);

        transactions.push({
          date,
          description: description.trim(),
          payeeName,
          reference: null, // Standard Bank statements typically don't have separate references
          amountCents,
          isCredit,
        });
      } catch (error) {
        // Log parsing errors but continue processing
        this.logger.warn(
          `Failed to parse line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Parsed ${transactions.length} transactions from Standard Bank statement`,
    );
    return transactions;
  }

  /**
   * Parse FNB statement format.
   * FNB PDFs have compact format with optional bank charges at end:
   *
   * Credit: "01 OctFNB App Payment450.00Cr6,744.42Cr"
   * Debit:  "01 OctMagtape Debit D6Group897.006,847.42Cr12.00"
   * Cash Deposit: "02 OctADT Cash Deposit1,300.00Cr8,088.42Cr22.68"
   *
   * Pattern: DD Mon + Description + Amount[Cr] + BalanceCr + [BankCharges]
   */
  private parseFNB(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // Month mapping for normalization
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

    // Extract year from statement period line (e.g., "Statement Period : 30 September 2025 to 31 October 2025")
    let statementYear = new Date().getFullYear().toString();
    for (const line of lines) {
      const periodMatch = line.match(/Statement Period.*?(\d{4})/i);
      if (periodMatch) {
        statementYear = periodMatch[1];
        break;
      }
    }

    // FNB compact format regex with optional bank charges:
    // Group 1: Day (1-2 digits)
    // Group 2: Month name
    // Group 3: Description (non-greedy, stops at first amount)
    // Group 4: Transaction amount (with optional commas)
    // Group 5: Cr/Dr suffix OR start of balance (indicates credit vs debit)
    // Note: Bank charges at end are ignored (not captured)
    //
    // Examples:
    // "01 OctFNB App Payment450.00Cr6,744.42Cr" → Credit (ends with Cr after amount)
    // "01 OctMagtape Debit897.006,847.42Cr12.00" → Debit (amount followed by balance, then charges)
    // "02 OctADT Cash Deposit1,300.00Cr8,088.42Cr22.68" → Credit with deposit fee
    const compactPattern =
      /^(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(.+?)([\d,]+\.\d{2})(Cr|Dr|[\d,]+)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(compactPattern);
      if (!match) {
        continue;
      }

      try {
        const [, day, monthName, description, amountStr, typeOrBalance] = match;

        // Normalize month name to number
        const monthNum = monthMap[monthName.toLowerCase()];
        if (!monthNum) {
          this.logger.warn(`Invalid month name at line ${i + 1}: ${monthName}`);
          continue;
        }

        // Create ISO format date string using statement year
        const isoDateStr = `${statementYear}-${monthNum}-${day.padStart(2, '0')}`;

        // Parse date
        const date = parseDate(isoDateStr);

        // Parse amount (remove commas)
        const cleanAmount = amountStr.replace(/,/g, '');
        const amountCents = Math.round(parseFloat(cleanAmount) * 100);

        // Determine if credit or debit:
        // - If typeOrBalance is "Cr", it's a credit
        // - If typeOrBalance is "Dr", it's a debit
        // - If typeOrBalance starts with a digit (next amount = balance), it's a debit
        const isCredit = typeOrBalance.toLowerCase() === 'cr';

        // Clean up description
        const cleanDescription = description.trim();

        // Extract payee name
        const payeeName = extractPayeeName(cleanDescription);

        transactions.push({
          date,
          description: cleanDescription,
          payeeName,
          reference: null,
          amountCents,
          isCredit,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to parse line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Parsed ${transactions.length} transactions from FNB statement`,
    );
    return transactions;
  }

  /**
   * Parse ABSA statement format.
   * Pattern: YYYY-MM-DD Description Amount
   * Amount may have R prefix
   */
  private parseAbsa(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // Regex: YYYY-MM-DD followed by description and amount (with optional R prefix)
    const linePattern =
      /(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-]?R?\s*\d[\d\s,]*\.?\d*)\s*$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(linePattern);
      if (!match) {
        this.logger.debug(
          `Skipping unparseable line ${i + 1}: ${line.substring(0, 50)}`,
        );
        continue;
      }

      try {
        const [, dateStr, description, amountStr] = match;

        // Parse date (already in ISO format)
        const date = parseDate(dateStr);

        // Parse amount (parseCurrency handles R prefix)
        const amountCents = Math.abs(parseCurrency(amountStr));

        // Determine if credit or debit based on sign
        const isCredit = !amountStr.trim().startsWith('-');

        // Extract payee name
        const payeeName = extractPayeeName(description);

        transactions.push({
          date,
          description: description.trim(),
          payeeName,
          reference: null,
          amountCents,
          isCredit,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to parse line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Parsed ${transactions.length} transactions from ABSA statement`,
    );
    return transactions;
  }

  /**
   * Parse PDF with confidence scoring
   * TASK-TRANS-015 - Confidence-based fallback support
   */
  async parseWithConfidence(
    buffer: Buffer,
  ): Promise<ParsedTransactionWithConfidence[]> {
    const transactions = await this.parse(buffer);
    return transactions.map((tx) => this.addConfidenceScore(tx));
  }

  /**
   * Calculate confidence score for a parsed transaction
   */
  private addConfidenceScore(
    tx: ParsedTransaction,
  ): ParsedTransactionWithConfidence {
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

    // Check for truncated or garbled text
    if (tx.description && /[^\x20-\x7E\xA0-\xFF]/.test(tx.description)) {
      confidence -= 15;
      reasons.push('Non-printable characters');
    }

    return {
      ...tx,
      parsingConfidence: Math.max(0, confidence),
      confidenceReasons: reasons,
    };
  }
}
