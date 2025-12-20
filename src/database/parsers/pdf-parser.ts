/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import { Logger } from '@nestjs/common';
import { ParsedTransaction } from '../dto/import.dto';
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
   * Pattern: DD MMM YYYY Description Amount
   * Requires month name normalization (Jan, Feb, etc.)
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

    // Regex: DD MMM YYYY followed by description and amount
    const linePattern =
      /(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(.+?)\s+([-]?\d[\d\s,]*\.?\d*)\s*$/i;

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
        const [, day, monthName, year, description, amountStr] = match;

        // Normalize month name to number
        const monthNum = monthMap[monthName.toLowerCase()];
        if (!monthNum) {
          this.logger.warn(`Invalid month name at line ${i + 1}: ${monthName}`);
          continue;
        }

        // Create ISO format date string
        const isoDateStr = `${year}-${monthNum}-${day.padStart(2, '0')}`;

        // Parse date
        const date = parseDate(isoDateStr);

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
}
