/**
 * SimplePay API Client
 * Low-level HTTP client for SimplePay API with rate limiting and exponential backoff
 *
 * TASK-STAFF-004: SimplePay Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { EncryptionService } from '../../shared/services/encryption.service';

interface SimplePayApiError {
  status: number;
  message: string;
  code?: string;
}

interface RateLimitState {
  requestTimestamps: number[];
  maxRequests: number;
  windowMs: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

@Injectable()
export class SimplePayApiClient {
  private readonly logger = new Logger(SimplePayApiClient.name);
  private readonly baseUrl = 'https://api.payroll.simplepay.cloud/v1';
  private axiosInstance: AxiosInstance | null = null;
  private currentTenantId: string | null = null;
  private clientId: string | null = null;

  // Rate limiting: SimplePay allows 60 requests per minute
  private readonly rateLimit: RateLimitState = {
    requestTimestamps: [],
    maxRequests: 60,
    windowMs: 60000, // 1 minute
  };

  // Exponential backoff configuration
  private readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Initialize client with API key for tenant
   */
  async initializeForTenant(tenantId: string): Promise<void> {
    if (this.currentTenantId === tenantId && this.axiosInstance) {
      return; // Already initialized for this tenant
    }

    const connection = await this.simplePayRepo.findConnection(tenantId);
    if (!connection) {
      throw new Error(`No SimplePay connection found for tenant ${tenantId}`);
    }

    if (!connection.isActive) {
      throw new Error('SimplePay connection is not active');
    }

    const apiKey = this.encryptionService.decrypt(connection.apiKey);

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });

    this.currentTenantId = tenantId;
    this.clientId = connection.clientId;

    this.logger.log(`SimplePay API client initialized for tenant ${tenantId}`);
  }

  /**
   * Get the current client ID
   */
  getClientId(): string {
    if (!this.clientId) {
      throw new Error('SimplePay API client not initialized');
    }
    return this.clientId;
  }

  /**
   * GET request with error handling, rate limiting, and retry
   */
  async get<T>(endpoint: string): Promise<T> {
    this.ensureInitialized();
    return this.executeWithRetry(async () => {
      await this.acquireRateLimit();
      const response = await this.axiosInstance!.get<T>(endpoint);
      return response.data;
    });
  }

  /**
   * POST request with error handling, rate limiting, and retry
   */
  async post<T>(endpoint: string, data: unknown): Promise<T> {
    this.ensureInitialized();
    this.logger.debug(`POST ${endpoint} - Request: ${JSON.stringify(data)}`);
    return this.executeWithRetry(async () => {
      await this.acquireRateLimit();
      const response = await this.axiosInstance!.post<T>(endpoint, data);
      this.logger.debug(
        `POST ${endpoint} - Response: ${JSON.stringify(response.data)}`,
      );
      return response.data;
    });
  }

  /**
   * PATCH request with error handling, rate limiting, and retry
   */
  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    this.ensureInitialized();
    return this.executeWithRetry(async () => {
      await this.acquireRateLimit();
      const response = await this.axiosInstance!.patch<T>(endpoint, data);
      return response.data;
    });
  }

  /**
   * DELETE request with error handling, rate limiting, and retry
   */
  async delete(endpoint: string): Promise<void> {
    this.ensureInitialized();
    return this.executeWithRetry(async () => {
      await this.acquireRateLimit();
      await this.axiosInstance!.delete(endpoint);
    });
  }

  /**
   * Download PDF file with rate limiting and retry
   */
  async downloadPdf(endpoint: string): Promise<Buffer> {
    this.ensureInitialized();
    return this.executeWithRetry(async () => {
      await this.acquireRateLimit();
      const response = await this.axiosInstance!.get(endpoint, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data as ArrayBuffer);
    });
  }

  /**
   * Execute operation with exponential backoff retry
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempt: number = 0,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = this.shouldRetry(error, attempt);
      if (!shouldRetry) {
        throw this.handleError(error);
      }

      const delay = this.calculateBackoffDelay(attempt);
      this.logger.warn(
        `SimplePay API request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`,
      );
      await this.sleep(delay);
      return this.executeWithRetry(operation, attempt + 1);
    }
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Retry on rate limit (429), server errors (5xx), or network errors
      return (
        status === 429 ||
        (status !== undefined && status >= 500) ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND'
      );
    }

    return false;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay =
      this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * Acquire permission to make a request (rate limiting)
   */
  private async acquireRateLimit(): Promise<void> {
    this.cleanOldRequests();

    if (this.rateLimit.requestTimestamps.length >= this.rateLimit.maxRequests) {
      const oldestRequest = this.rateLimit.requestTimestamps[0];
      const waitTime = oldestRequest + this.rateLimit.windowMs - Date.now();

      if (waitTime > 0) {
        this.logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
        await this.sleep(waitTime);
        return this.acquireRateLimit();
      }
    }

    this.rateLimit.requestTimestamps.push(Date.now());
  }

  /**
   * Remove requests outside the current window
   */
  private cleanOldRequests(): void {
    const cutoff = Date.now() - this.rateLimit.windowMs;
    this.rateLimit.requestTimestamps = this.rateLimit.requestTimestamps.filter(
      (timestamp) => timestamp > cutoff,
    );
  }

  /**
   * Get remaining requests allowed in current window
   */
  getRemainingRequests(): number {
    this.cleanOldRequests();
    return Math.max(
      0,
      this.rateLimit.maxRequests - this.rateLimit.requestTimestamps.length,
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test connection by verifying the client ID exists in the accessible clients list
   * Note: SimplePay API doesn't have a /clients/{id} endpoint - we must list and filter
   */
  async testConnection(
    apiKey: string,
    clientId: string,
  ): Promise<{ success: boolean; clientName?: string; message?: string }> {
    try {
      const testClient = axios.create({
        baseURL: this.baseUrl,
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      // SimplePay returns clients wrapped: [{ client: {...} }, ...]
      interface ClientWrapper {
        client: { id: number; name: string };
      }
      const response = await testClient.get<ClientWrapper[]>('/clients');
      const clients = response.data.map((w) => w.client);

      // Find the matching client by ID (SimplePay uses numeric IDs)
      const targetId = parseInt(clientId, 10);
      const matchingClient = clients.find((c) => c.id === targetId);

      if (!matchingClient) {
        return {
          success: false,
          message: `Client ID ${clientId} not found. Available clients: ${clients.map((c) => `${c.name} (${c.id})`).join(', ')}`,
        };
      }

      return {
        success: true,
        clientName: matchingClient.name,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        message:
          axiosError.response?.status === 401
            ? 'Invalid API key'
            : `Connection failed: ${axiosError.message}`,
      };
    }
  }

  /**
   * List all clients accessible with the given API key
   * Use this to discover the client ID needed for connection setup
   * Note: SimplePay returns clients wrapped: [{ client: {...} }, ...]
   */
  async listClients(apiKey: string): Promise<{
    success: boolean;
    clients?: Array<{ id: string; name: string }>;
    message?: string;
  }> {
    try {
      const testClient = axios.create({
        baseURL: this.baseUrl,
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      // SimplePay returns clients wrapped: [{ client: {...} }, ...]
      interface ClientWrapper {
        client: { id: number; name: string };
      }
      const response = await testClient.get<ClientWrapper[]>('/clients');
      const clients = response.data.map((w) => w.client);

      this.logger.log(`Found ${clients.length} SimplePay clients`);

      return {
        success: true,
        clients: clients.map((c) => ({ id: String(c.id), name: c.name })),
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Failed to list SimplePay clients: ${axiosError.message}`,
      );
      return {
        success: false,
        message:
          axiosError.response?.status === 401
            ? 'Invalid API key'
            : `Failed to list clients: ${axiosError.message}`,
      };
    }
  }

  private ensureInitialized(): void {
    if (!this.axiosInstance) {
      throw new Error(
        'SimplePay API client not initialized. Call initializeForTenant first.',
      );
    }
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<SimplePayApiError>;
      const status = axiosError.response?.status || 500;
      const responseData = axiosError.response?.data;
      const message =
        (responseData as SimplePayApiError)?.message ||
        (typeof responseData === 'string' ? responseData : null) ||
        axiosError.message;

      // Log full response for debugging
      this.logger.error(
        `SimplePay API error: ${status} - Response: ${JSON.stringify(responseData)}`,
      );

      if (status === 429) {
        this.logger.warn('SimplePay rate limit hit');
        return new Error('Rate limit exceeded. Please try again later.');
      }

      if (status === 401) {
        return new Error('SimplePay authentication failed. Check API key.');
      }

      if (status === 404) {
        return new Error('SimplePay resource not found');
      }

      return new Error(`SimplePay API error (${status}): ${message}`);
    }

    return error as Error;
  }
}
