/**
 * XeroJournalService
 * TASK-STAFF-001: Implement Xero Journal Posting
 * TASK-XERO-008: Implement Distributed Rate Limiting for Xero API
 *
 * Service for creating and managing manual journal entries in Xero.
 * Implements retry logic with exponential backoff for transient failures.
 * Integrates with distributed rate limiter for multi-instance coordination.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * Uses banker's rounding (ROUND_HALF_EVEN) for currency conversions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import Decimal from 'decimal.js';

import {
  CreateJournalDto,
  JournalResponseDto,
  JournalLineDto,
} from './dto/xero-journal.dto';
import {
  XeroAuthenticationError,
  XeroValidationError,
  XeroRateLimitError,
  XeroServerError,
  XeroJournalUnbalancedError,
  XeroMaxRetriesExceededError,
  XeroNotConnectedError,
  isRetryableXeroError,
  extractRetryAfter,
} from './xero-journal.errors';
import { XeroRateLimiter } from './xero-rate-limiter.service';

// Configure Decimal for banker's rounding (ROUND_HALF_EVEN)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

/**
 * Xero API Manual Journal payload structure
 */
interface XeroManualJournalPayload {
  ManualJournals: Array<{
    Narration: string;
    Date: string;
    Status?: string;
    ShowOnCashBasisReports?: boolean;
    Url?: string;
    JournalLines: Array<{
      AccountCode: string;
      Description?: string;
      LineAmount: number;
      TaxType?: string;
      Tracking?: Array<{
        Name: string;
        Option: string;
      }>;
    }>;
  }>;
}

/**
 * Xero API response structure for manual journals
 */
interface XeroManualJournalResponse {
  ManualJournals?: Array<{
    ManualJournalID: string;
    Narration: string;
    Date: string;
    Status: string;
    LineAmountTypes?: string;
    UpdatedDateUTC?: string;
    JournalLines?: Array<{
      AccountCode: string;
      Description: string;
      LineAmount: number;
      TaxType: string;
      AccountID?: string;
      TaxAmount?: number;
    }>;
    Warnings?: Array<{
      Message: string;
    }>;
    ValidationErrors?: Array<{
      Message: string;
    }>;
  }>;
}

@Injectable()
export class XeroJournalService {
  private readonly logger = new Logger(XeroJournalService.name);

  // Retry configuration
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  // Xero API base URL
  private readonly xeroApiBaseUrl = 'https://api.xero.com/api.xro/2.0';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly rateLimiter: XeroRateLimiter,
  ) {
    // Load retry configuration from environment or use defaults
    this.maxRetries = this.configService.get<number>('XERO_MAX_RETRIES', 3);
    this.baseDelayMs = this.configService.get<number>(
      'XERO_BASE_DELAY_MS',
      1000,
    );
    this.maxDelayMs = this.configService.get<number>(
      'XERO_MAX_DELAY_MS',
      30000,
    );
  }

  /**
   * Create a manual journal entry in Xero.
   * Implements retry logic with exponential backoff for transient failures.
   *
   * @param tenantId - Internal tenant ID for logging/tracking
   * @param accessToken - Valid Xero OAuth2 access token
   * @param xeroTenantId - Xero organization tenant ID
   * @param journal - Journal entry data
   * @returns JournalResponseDto with created journal details
   * @throws XeroJournalUnbalancedError if debits != credits
   * @throws XeroAuthenticationError if token is invalid/expired
   * @throws XeroValidationError if journal data is invalid
   * @throws XeroRateLimitError if rate limit exceeded
   * @throws XeroServerError if Xero server error
   * @throws XeroMaxRetriesExceededError if all retries exhausted
   */
  async createJournal(
    tenantId: string,
    accessToken: string,
    xeroTenantId: string,
    journal: CreateJournalDto,
  ): Promise<JournalResponseDto> {
    // Validate that journal lines balance (debits = credits)
    this.validateJournalBalance(journal.lines);

    // Build Xero API payload
    const payload = this.buildJournalPayload(journal);

    this.logger.log(`Creating journal in Xero for tenant ${tenantId}`, {
      narration: journal.narration,
      date: journal.date,
      lineCount: journal.lines.length,
    });

    // Execute with retry logic
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Check rate limit before making API call
      const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
      if (!rateLimit.allowed) {
        this.logger.warn(
          `Rate limit exceeded for tenant ${tenantId}. Retry after ${rateLimit.retryAfter}s.`,
        );
        throw new XeroRateLimitError(rateLimit.retryAfter);
      }

      try {
        const response = await this.postJournalToXero(
          accessToken,
          xeroTenantId,
          payload,
        );

        this.logger.log(
          `Journal created successfully in Xero: ${response.manualJournalId}`,
          {
            tenantId,
            xeroTenantId,
            journalId: response.manualJournalId,
            status: response.status,
          },
        );

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If it's already one of our custom errors, re-throw it directly
        // (e.g., XeroValidationError thrown from postJournalToXero)
        if (
          error instanceof XeroValidationError ||
          error instanceof XeroJournalUnbalancedError
        ) {
          throw error;
        }

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);

        // If this is the last attempt OR error is not retryable, handle it
        if (attempt >= this.maxRetries || !isRetryable) {
          if (isRetryable) {
            // Retryable error but we've exhausted retries
            throw new XeroMaxRetriesExceededError(
              this.maxRetries + 1,
              lastError,
            );
          }
          // Non-retryable error - throw mapped error
          throw this.mapXeroError(error);
        }

        // Retryable error with attempts remaining
        const delay = this.calculateBackoffDelay(error, attempt);

        this.logger.warn(
          `Xero API call failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries + 1})`,
          {
            tenantId,
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries: this.maxRetries + 1,
          },
        );

        await this.sleep(delay);
      }
    }

    // Should not reach here, but just in case
    throw new XeroMaxRetriesExceededError(this.maxRetries + 1, lastError);
  }

  /**
   * Validate that journal debits equal credits.
   * Uses Decimal.js with banker's rounding for precise calculation.
   *
   * @param lines - Array of journal lines
   * @throws XeroJournalUnbalancedError if totals don't match
   */
  validateJournalBalance(lines: JournalLineDto[]): void {
    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    for (const line of lines) {
      const amount = new Decimal(line.amountCents);
      if (line.isDebit) {
        totalDebits = totalDebits.plus(amount);
      } else {
        totalCredits = totalCredits.plus(amount);
      }
    }

    // Compare with tolerance of 0 (exact match required)
    if (!totalDebits.equals(totalCredits)) {
      throw new XeroJournalUnbalancedError(
        totalDebits.toNumber(),
        totalCredits.toNumber(),
      );
    }

    this.logger.debug(
      `Journal balance validated: debits=${totalDebits.toNumber()} cents, credits=${totalCredits.toNumber()} cents`,
    );
  }

  /**
   * Build Xero API payload from CreateJournalDto.
   * Converts cents to decimal amounts for Xero.
   *
   * @param journal - Journal DTO
   * @returns Xero API payload structure
   */
  private buildJournalPayload(
    journal: CreateJournalDto,
  ): XeroManualJournalPayload {
    return {
      ManualJournals: [
        {
          Narration: journal.narration,
          Date: journal.date,
          Status: 'POSTED', // Create as posted by default
          ShowOnCashBasisReports: journal.showOnCashBasisReports ?? false,
          Url: journal.sourceUrl,
          JournalLines: journal.lines.map((line) => {
            // Convert cents to decimal amount
            // Xero uses positive for debits, negative for credits
            const decimalAmount = new Decimal(line.amountCents).div(100);
            const lineAmount = line.isDebit
              ? decimalAmount.toNumber()
              : decimalAmount.negated().toNumber();

            const journalLine: XeroManualJournalPayload['ManualJournals'][0]['JournalLines'][0] =
              {
                AccountCode: line.accountCode,
                Description: line.description ?? '',
                LineAmount: lineAmount,
                TaxType: line.taxType ?? 'NONE',
              };

            // Add tracking if specified
            if (line.trackingCategoryName && line.trackingOptionName) {
              journalLine.Tracking = [
                {
                  Name: line.trackingCategoryName,
                  Option: line.trackingOptionName,
                },
              ];
            }

            return journalLine;
          }),
        },
      ],
    };
  }

  /**
   * Post journal to Xero API.
   *
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero tenant ID
   * @param payload - Xero API payload
   * @returns Parsed journal response
   */
  private async postJournalToXero(
    accessToken: string,
    xeroTenantId: string,
    payload: XeroManualJournalPayload,
  ): Promise<JournalResponseDto> {
    const url = `${this.xeroApiBaseUrl}/ManualJournals`;

    const response = await firstValueFrom(
      this.httpService.post<XeroManualJournalResponse>(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'xero-tenant-id': xeroTenantId,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 30000, // 30 second timeout
      }),
    );

    // Parse and validate response
    const journal = response.data.ManualJournals?.[0];
    if (!journal) {
      throw new XeroServerError('No journal returned from Xero API');
    }

    // Check for validation errors in response
    if (journal.ValidationErrors && journal.ValidationErrors.length > 0) {
      const errorMessages = journal.ValidationErrors.map((e) => e.Message).join(
        '; ',
      );
      throw new XeroValidationError(
        `Xero validation failed: ${errorMessages}`,
        journal.ValidationErrors,
      );
    }

    // Calculate totals from response
    let totalDebitCents = 0;
    let totalCreditCents = 0;

    for (const line of journal.JournalLines ?? []) {
      // LineAmount: positive = debit, negative = credit
      const amountCents = Math.round(Math.abs(line.LineAmount) * 100);
      if (line.LineAmount >= 0) {
        totalDebitCents += amountCents;
      } else {
        totalCreditCents += amountCents;
      }
    }

    // Collect warnings if any
    const warnings = journal.Warnings?.map((w) => w.Message);

    return {
      manualJournalId: journal.ManualJournalID,
      narration: journal.Narration,
      date: journal.Date,
      status: journal.Status,
      totalDebitCents,
      totalCreditCents,
      warnings,
    };
  }

  /**
   * Determine if the error is retryable (transient).
   *
   * @param error - The error that occurred
   * @returns True if the error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // Use helper to check retryable errors
    if (isRetryableXeroError(error)) {
      return true;
    }

    // Check HTTP status codes
    const axiosError = error as AxiosError;
    const status = axiosError?.response?.status;

    if (status) {
      // Rate limits and server errors are retryable
      if (status === 429 || status >= 500) {
        return true;
      }
    }

    // Network errors (no response) are retryable
    if (
      axiosError?.code === 'ECONNRESET' ||
      axiosError?.code === 'ETIMEDOUT' ||
      axiosError?.code === 'ECONNREFUSED'
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculate backoff delay with exponential increase.
   * Respects Retry-After header if present.
   *
   * @param error - The error that occurred
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(error: unknown, attempt: number): number {
    // Check for Retry-After header
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      // Convert seconds to milliseconds, cap at max delay
      return Math.min(retryAfter * 1000, this.maxDelayMs);
    }

    // Exponential backoff: baseDelay * 2^attempt
    // With jitter to prevent thundering herd
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // Up to 30% jitter
    const delay = exponentialDelay + jitter;

    // Cap at max delay
    return Math.min(delay, this.maxDelayMs);
  }

  /**
   * Map Axios/HTTP errors to custom Xero error types.
   *
   * @param error - The original error
   * @returns Appropriate XeroJournalError subclass
   */
  private mapXeroError(error: unknown): Error {
    const axiosError = error as AxiosError<{
      Message?: string;
      Elements?: Array<{
        ValidationErrors?: Array<{ Message: string }>;
      }>;
    }>;

    const status = axiosError?.response?.status;
    const data = axiosError?.response?.data;

    this.logger.error('Xero API error', {
      status,
      message: axiosError?.message,
      data: JSON.stringify(data),
    });

    // Map by HTTP status
    switch (status) {
      case 401:
      case 403:
        return new XeroAuthenticationError(
          'Xero authentication failed. Token may be expired or invalid.',
          data,
        );

      case 400: {
        // Extract validation errors from response
        const validationErrors = data?.Elements?.[0]?.ValidationErrors;
        const message =
          validationErrors?.map((e) => e.Message).join('; ') ||
          data?.Message ||
          'Invalid journal data';
        return new XeroValidationError(message, validationErrors, data);
      }

      case 429: {
        const retryAfter = extractRetryAfter(error);
        return new XeroRateLimitError(retryAfter, data);
      }

      case 404:
        return new XeroNotConnectedError(
          'Xero resource not found. Check your Xero connection.',
        );

      default:
        if (status && status >= 500) {
          return new XeroServerError(
            `Xero server error (${status}): ${data?.Message || 'Unknown error'}`,
            data,
          );
        }

        // Generic error for unknown cases
        return new XeroServerError(
          `Xero API error: ${axiosError?.message || 'Unknown error'}`,
          data,
        );
    }
  }

  /**
   * Sleep for specified milliseconds.
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Void/delete a journal entry in Xero.
   * Only POSTED journals can be voided.
   *
   * @param tenantId - Internal tenant ID
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero tenant ID
   * @param manualJournalId - ID of journal to void
   * @returns Updated journal response
   */
  async voidJournal(
    tenantId: string,
    accessToken: string,
    xeroTenantId: string,
    manualJournalId: string,
  ): Promise<JournalResponseDto> {
    // Check rate limit before making API call
    const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
    if (!rateLimit.allowed) {
      this.logger.warn(
        `Rate limit exceeded for tenant ${tenantId}. Retry after ${rateLimit.retryAfter}s.`,
      );
      throw new XeroRateLimitError(rateLimit.retryAfter);
    }

    const url = `${this.xeroApiBaseUrl}/ManualJournals/${manualJournalId}`;

    this.logger.log(
      `Voiding journal ${manualJournalId} in Xero for tenant ${tenantId}`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<XeroManualJournalResponse>(
          url,
          {
            ManualJournals: [
              {
                ManualJournalID: manualJournalId,
                Status: 'VOIDED',
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'xero-tenant-id': xeroTenantId,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 30000,
          },
        ),
      );

      const journal = response.data.ManualJournals?.[0];
      if (!journal) {
        throw new XeroServerError('No journal returned from void operation');
      }

      this.logger.log(`Journal ${manualJournalId} voided successfully`, {
        status: journal.Status,
      });

      return {
        manualJournalId: journal.ManualJournalID,
        narration: journal.Narration,
        date: journal.Date,
        status: journal.Status,
        totalDebitCents: 0,
        totalCreditCents: 0,
      };
    } catch (error) {
      throw this.mapXeroError(error);
    }
  }

  /**
   * Get a journal entry from Xero by ID.
   *
   * @param tenantId - Internal tenant ID (for rate limiting)
   * @param accessToken - Xero OAuth2 access token
   * @param xeroTenantId - Xero tenant ID
   * @param manualJournalId - ID of journal to retrieve
   * @returns Journal response
   */
  async getJournal(
    tenantId: string,
    accessToken: string,
    xeroTenantId: string,
    manualJournalId: string,
  ): Promise<JournalResponseDto> {
    // Check rate limit before making API call
    const rateLimit = await this.rateLimiter.acquireSlot(tenantId);
    if (!rateLimit.allowed) {
      this.logger.warn(
        `Rate limit exceeded for tenant ${tenantId}. Retry after ${rateLimit.retryAfter}s.`,
      );
      throw new XeroRateLimitError(rateLimit.retryAfter);
    }

    const url = `${this.xeroApiBaseUrl}/ManualJournals/${manualJournalId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<XeroManualJournalResponse>(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'xero-tenant-id': xeroTenantId,
            Accept: 'application/json',
          },
          timeout: 30000,
        }),
      );

      const journal = response.data.ManualJournals?.[0];
      if (!journal) {
        throw new XeroServerError('Journal not found');
      }

      // Calculate totals
      let totalDebitCents = 0;
      let totalCreditCents = 0;

      for (const line of journal.JournalLines ?? []) {
        const amountCents = Math.round(Math.abs(line.LineAmount) * 100);
        if (line.LineAmount >= 0) {
          totalDebitCents += amountCents;
        } else {
          totalCreditCents += amountCents;
        }
      }

      return {
        manualJournalId: journal.ManualJournalID,
        narration: journal.Narration,
        date: journal.Date,
        status: journal.Status,
        totalDebitCents,
        totalCreditCents,
      };
    } catch (error) {
      throw this.mapXeroError(error);
    }
  }
}
