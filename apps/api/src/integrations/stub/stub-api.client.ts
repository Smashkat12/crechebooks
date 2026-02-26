/**
 * Stub.africa Connect API Client
 *
 * Low-level HTTP client for the Stub Connect API.
 * Handles authentication, request formatting, error mapping, and logging.
 *
 * CRITICAL: This client converts CrecheBooks cents to Stub Rands where needed,
 * but most conversion logic lives in the adapter layer. The client accepts
 * Stub-native payloads (amounts already in Rands).
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import {
  ExternalServiceException,
} from '../../shared/exceptions';
import type {
  StubApiError,
  StubBusinessPayload,
  StubBusinessResponse,
  StubConfig,
  StubSettlementPayload,
  StubTransactionPayload,
} from './stub.types';

@Injectable()
export class StubApiClient {
  private readonly logger = new Logger(StubApiClient.name);
  private readonly config: StubConfig;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.config = {
      apiKey: this.configService.get<string>('STUB_API_KEY', ''),
      appId: this.configService.get<string>('STUB_APP_ID', ''),
      baseUrl: this.configService.get<string>(
        'STUB_BASE_URL',
        'https://test.connect.stub.africa',
      ),
      webhookUrl: this.configService.get<string>('STUB_WEBHOOK_URL', ''),
    };
  }

  // ---------------------------------------------------------------------------
  // Auth / Verification
  // ---------------------------------------------------------------------------

  /**
   * Verify that the configured API key is valid.
   *
   * @returns true if the key is valid, false otherwise
   */
  async verifyApiKey(): Promise<boolean> {
    this.logger.log('Verifying Stub API key');

    try {
      await this.post<unknown>('/api/verify/apikey', {});
      return true;
    } catch {
      this.logger.warn('Stub API key verification failed');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Business
  // ---------------------------------------------------------------------------

  /**
   * Create a new business in Stub and receive a uid + token.
   *
   * @param tenantId - CrecheBooks tenant (for logging context)
   * @param payload - Business details
   * @returns Stub business uid and authentication token
   */
  async createBusiness(
    tenantId: string,
    payload: StubBusinessPayload,
  ): Promise<StubBusinessResponse> {
    this.logger.log(
      `Creating Stub business for tenant ${tenantId}: ${payload.businessname}`,
    );

    const response = await this.post<StubBusinessResponse>(
      '/api/push/business',
      payload,
    );

    this.logger.log(
      `Stub business created for tenant ${tenantId}: uid=${response.uid}`,
    );

    return response;
  }

  // ---------------------------------------------------------------------------
  // Push Data
  // ---------------------------------------------------------------------------

  /**
   * Push a single income transaction to Stub.
   *
   * @param token - Stub business token
   * @param transaction - Income transaction payload (amounts in Rands)
   */
  async pushIncome(
    token: string,
    transaction: StubTransactionPayload,
  ): Promise<void> {
    this.logger.log(
      `Pushing income to Stub: id=${transaction.id}, amount=R${transaction.amount}`,
    );

    await this.postWithToken('/api/push/income', token, transaction);
  }

  /**
   * Push a single expense transaction to Stub.
   *
   * @param token - Stub business token
   * @param transaction - Expense transaction payload (amounts in Rands)
   */
  async pushExpense(
    token: string,
    transaction: StubTransactionPayload,
  ): Promise<void> {
    this.logger.log(
      `Pushing expense to Stub: id=${transaction.id}, amount=R${transaction.amount}`,
    );

    await this.postWithToken('/api/push/expense', token, transaction);
  }

  /**
   * Push multiple income and expense transactions in a single batch.
   *
   * @param token - Stub business token
   * @param payload - Batch payload with income and expense arrays
   */
  async pushMany(
    token: string,
    payload: StubSettlementPayload,
  ): Promise<void> {
    this.logger.log(
      `Pushing batch to Stub: ${payload.income.length} income, ${payload.expenses.length} expenses`,
    );

    await this.postWithToken('/api/push/many', token, payload);
  }

  // ---------------------------------------------------------------------------
  // Pull Data (async / webhook-based)
  // ---------------------------------------------------------------------------

  /**
   * Initiate a bank feed pull. Results are delivered to the configured webhook.
   *
   * @param token - Stub business token
   * @param webhookUrl - Override webhook URL (falls back to configured default)
   */
  async pullBankFeed(token: string, webhookUrl?: string): Promise<void> {
    const url = webhookUrl || this.config.webhookUrl;

    this.logger.log(`Initiating Stub bank feed pull, webhook=${url}`);

    await this.postWithToken('/api/pull/bank-feed', token, {
      webhookUrl: url,
    });
  }

  /**
   * Initiate an income data pull. Results are delivered to the configured webhook.
   *
   * @param token - Stub business token
   * @param webhookUrl - Override webhook URL (falls back to configured default)
   */
  async pullIncome(token: string, webhookUrl?: string): Promise<void> {
    const url = webhookUrl || this.config.webhookUrl;

    this.logger.log(`Initiating Stub income pull, webhook=${url}`);

    await this.postWithToken('/api/pull/income', token, {
      webhookUrl: url,
    });
  }

  /**
   * Initiate an expense data pull. Results are delivered to the configured webhook.
   *
   * @param token - Stub business token
   * @param webhookUrl - Override webhook URL (falls back to configured default)
   */
  async pullExpenses(token: string, webhookUrl?: string): Promise<void> {
    const url = webhookUrl || this.config.webhookUrl;

    this.logger.log(`Initiating Stub expenses pull, webhook=${url}`);

    await this.postWithToken('/api/pull/expenses', token, {
      webhookUrl: url,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal HTTP Helpers
  // ---------------------------------------------------------------------------

  /**
   * POST request with standard API key + App ID headers.
   */
  private async post<T>(endpoint: string, data: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, {
          headers: {
            'X-API-Key': this.config.apiKey,
            'X-AppId': this.config.appId,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      throw this.mapError(endpoint, error);
    }
  }

  /**
   * POST request with a Stub business token (X-Token header).
   */
  private async postWithToken<T>(
    endpoint: string,
    token: string,
    data: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, data, {
          headers: {
            'X-API-Key': this.config.apiKey,
            'X-AppId': this.config.appId,
            'X-Token': token,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (error) {
      throw this.mapError(endpoint, error);
    }
  }

  /**
   * Map Axios errors to structured ExternalServiceException.
   */
  private mapError(endpoint: string, error: unknown): ExternalServiceException {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? 0;
      const responseData = error.response?.data as StubApiError | undefined;
      const message =
        responseData?.message ?? error.message ?? 'Unknown Stub API error';

      this.logger.error(
        `Stub API error on ${endpoint}: ${status} - ${message}`,
        { responseData },
      );

      return new ExternalServiceException(
        'Stub.africa',
        `${endpoint} failed (${status}): ${message}`,
        error,
      );
    }

    this.logger.error(
      `Unexpected error calling Stub ${endpoint}`,
      error instanceof Error ? error.stack : String(error),
    );

    return new ExternalServiceException(
      'Stub.africa',
      `${endpoint} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
    );
  }
}
