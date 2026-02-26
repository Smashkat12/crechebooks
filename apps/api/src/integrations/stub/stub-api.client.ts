/**
 * Stub.africa Connect API Client
 *
 * Low-level HTTP client for the Stub Connect API.
 * Handles authentication, request formatting, error mapping, and logging.
 *
 * CRITICAL: Stub uses body-based authentication. Every request body includes
 * `apikey` and `appid`. Push/pull endpoints also require `uid` (business ID)
 * and nest data payloads under the `data` key.
 *
 * This client accepts Stub-native payloads (amounts already in Rands).
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
        'https://connect.stub.africa',
      ),
      webhookUrl: this.configService.get<string>('STUB_WEBHOOK_URL', ''),
    };
  }

  // ---------------------------------------------------------------------------
  // Auth / Verification
  // ---------------------------------------------------------------------------

  /**
   * Verify that the configured API key is valid.
   * Body: { apikey, appid }
   */
  async verifyApiKey(): Promise<boolean> {
    this.logger.log('Verifying Stub API key');

    try {
      await this.post<unknown>('/api/verify/apikey', {
        apikey: this.config.apiKey,
        appid: this.config.appId,
      });
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
   * Body: { apikey, appid, data: { businessname, firstname, ... } }
   */
  async createBusiness(
    payload: StubBusinessPayload,
  ): Promise<StubBusinessResponse> {
    this.logger.log(`Creating Stub business: ${payload.businessname}`);

    const response = await this.post<StubBusinessResponse>(
      '/api/push/business',
      {
        apikey: this.config.apiKey,
        appid: this.config.appId,
        data: payload,
      },
    );

    this.logger.log(`Stub business created: uid=${response.uid}`);
    return response;
  }

  // ---------------------------------------------------------------------------
  // Push Data
  // ---------------------------------------------------------------------------

  /**
   * Push a single income transaction to Stub.
   * Body: { apikey, appid, uid, data: { id, date, name, category, ... } }
   */
  async pushIncome(
    uid: string,
    transaction: StubTransactionPayload,
  ): Promise<void> {
    this.logger.log(
      `Pushing income to Stub: id=${transaction.id}, amount=R${transaction.amount}`,
    );

    await this.post('/api/push/income', {
      apikey: this.config.apiKey,
      appid: this.config.appId,
      uid,
      data: transaction,
      webhook: this.config.webhookUrl || undefined,
    });
  }

  /**
   * Push a single expense transaction to Stub.
   * Body: { apikey, appid, uid, data: { id, date, name, category, ... } }
   */
  async pushExpense(
    uid: string,
    transaction: StubTransactionPayload,
  ): Promise<void> {
    this.logger.log(
      `Pushing expense to Stub: id=${transaction.id}, amount=R${transaction.amount}`,
    );

    await this.post('/api/push/expense', {
      apikey: this.config.apiKey,
      appid: this.config.appId,
      uid,
      data: transaction,
      webhook: this.config.webhookUrl || undefined,
    });
  }

  /**
   * Push a settlement (batch of income + expenses).
   * Body: { apikey, appid, uid, data: { accountid, income: [...], expenses: [...] } }
   */
  async pushSettlement(
    uid: string,
    payload: StubSettlementPayload,
  ): Promise<void> {
    this.logger.log(
      `Pushing settlement to Stub: ${payload.income.length} income, ${payload.expenses.length} expenses`,
    );

    await this.post('/api/push/settlement', {
      apikey: this.config.apiKey,
      appid: this.config.appId,
      uid,
      data: payload,
      webhook: this.config.webhookUrl || undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Pull Data (async / webhook-based)
  // ---------------------------------------------------------------------------

  /**
   * Initiate a bank feed pull. Results are delivered to the configured webhook.
   * Body: { apikey, appid, uid, webhook }
   */
  async pullBankFeed(uid: string): Promise<void> {
    this.logger.log('Initiating Stub bank feed pull');

    await this.post('/api/pull/bank-feed', {
      apikey: this.config.apiKey,
      appid: this.config.appId,
      uid,
      webhook: this.config.webhookUrl,
    });
  }

  /**
   * Initiate an income data pull. Results are delivered to the configured webhook.
   * Body: { apikey, appid, uid, webhook }
   */
  async pullIncome(uid: string): Promise<void> {
    this.logger.log('Initiating Stub income pull');

    await this.post('/api/pull/income', {
      apikey: this.config.apiKey,
      appid: this.config.appId,
      uid,
      webhook: this.config.webhookUrl,
    });
  }

  /**
   * Initiate an expense data pull. Results are delivered to the configured webhook.
   * Body: { apikey, appid, uid, webhook }
   */
  async pullExpenses(uid: string): Promise<void> {
    this.logger.log('Initiating Stub expenses pull');

    await this.post('/api/pull/expenses', {
      apikey: this.config.apiKey,
      appid: this.config.appId,
      uid,
      webhook: this.config.webhookUrl,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal HTTP Helper
  // ---------------------------------------------------------------------------

  /**
   * POST to Stub API. Auth credentials are included in the body by the caller,
   * not added as headers. Only Content-Type header is needed.
   */
  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, body, {
          headers: { 'Content-Type': 'application/json' },
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
