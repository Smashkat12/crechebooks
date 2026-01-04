/**
 * OAuth2 Token Manager for Xero
 * Handles token storage, retrieval, and automatic refresh
 */

import { PrismaClient } from '@prisma/client';
import { XeroClient } from 'xero-node';
import { Encryption } from './encryption';
import {
  TokenExpiredError,
  TokenNotFoundError,
  XeroMCPError,
} from '../utils/error-handler';
import { Logger } from '../utils/logger';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  xeroTenantId: string;
}

export class TokenManager {
  private readonly prisma: PrismaClient;
  private readonly encryption: Encryption;
  private readonly logger: Logger;
  private readonly refreshLocks: Map<string, Promise<string>> = new Map();

  // Refresh tokens 5 minutes before expiry
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient({});
    this.encryption = new Encryption();
    this.logger = new Logger('TokenManager');
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getAccessToken(tenantId: string): Promise<string> {
    const record = await this.prisma.xeroToken.findUnique({
      where: { tenantId },
    });

    if (!record) {
      this.logger.error('No Xero token found', { tenantId });
      throw new TokenNotFoundError(tenantId);
    }

    const tokens = this.decryptTokens(record.encryptedTokens);

    // Check if token needs refresh (with 5 minute buffer)
    if (Date.now() >= tokens.expiresAt - this.REFRESH_BUFFER_MS) {
      this.logger.info('Token expires soon, refreshing', { tenantId });
      return this.refreshAccessToken(tenantId);
    }

    return tokens.accessToken;
  }

  /**
   * Refresh access token with mutex lock to prevent concurrent refreshes
   */
  async refreshAccessToken(tenantId: string): Promise<string> {
    // Check if refresh is already in progress
    const existingRefresh = this.refreshLocks.get(tenantId);
    if (existingRefresh) {
      this.logger.debug('Waiting for existing refresh', { tenantId });
      return existingRefresh;
    }

    // Create refresh promise with lock
    const refreshPromise = this.doRefresh(tenantId);
    this.refreshLocks.set(tenantId, refreshPromise);

    try {
      const accessToken = await refreshPromise;
      return accessToken;
    } finally {
      this.refreshLocks.delete(tenantId);
    }
  }

  /**
   * Store new tokens (after OAuth2 flow)
   */
  async storeTokens(tenantId: string, tokens: TokenSet): Promise<void> {
    const encrypted = this.encryption.encrypt(JSON.stringify(tokens));

    await this.prisma.xeroToken.upsert({
      where: { tenantId },
      create: {
        tenantId,
        xeroTenantId: tokens.xeroTenantId,
        encryptedTokens: encrypted,
        tokenExpiresAt: new Date(tokens.expiresAt),
      },
      update: {
        xeroTenantId: tokens.xeroTenantId,
        encryptedTokens: encrypted,
        tokenExpiresAt: new Date(tokens.expiresAt),
      },
    });

    this.logger.info('Tokens stored successfully', { tenantId });
  }

  /**
   * Get Xero tenant ID for API calls
   */
  async getXeroTenantId(tenantId: string): Promise<string> {
    const record = await this.prisma.xeroToken.findUnique({
      where: { tenantId },
    });

    if (!record) {
      throw new TokenNotFoundError(tenantId);
    }

    return record.xeroTenantId;
  }

  /**
   * Check if a tenant has valid Xero connection
   * Attempts to refresh token if expired but refresh token is still valid
   */
  async hasValidConnection(tenantId: string): Promise<boolean> {
    const record = await this.prisma.xeroToken.findUnique({
      where: { tenantId },
    });

    if (!record) {
      return false;
    }

    const tokens = this.decryptTokens(record.encryptedTokens);

    // If token is still valid, return true
    if (Date.now() < tokens.expiresAt - this.REFRESH_BUFFER_MS) {
      return true;
    }

    // Token expired or expiring soon - try to refresh
    try {
      this.logger.info('Token expired, attempting refresh', { tenantId });
      await this.refreshAccessToken(tenantId);
      return true;
    } catch (error) {
      this.logger.warn('Failed to refresh token', {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Remove stored tokens (disconnect from Xero)
   */
  async removeTokens(tenantId: string): Promise<void> {
    await this.prisma.xeroToken.delete({
      where: { tenantId },
    });

    this.logger.info('Tokens removed', { tenantId });
  }

  /**
   * Perform the actual token refresh
   */
  private async doRefresh(tenantId: string): Promise<string> {
    try {
      const record = await this.prisma.xeroToken.findUnique({
        where: { tenantId },
      });

      if (!record) {
        throw new TokenNotFoundError(tenantId);
      }

      const oldTokens = this.decryptTokens(record.encryptedTokens);

      // Create Xero client and initialize it (required for refresh)
      const xeroClient = new XeroClient({
        clientId: process.env.XERO_CLIENT_ID ?? '',
        clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
        redirectUris: [process.env.XERO_REDIRECT_URI ?? ''],
        scopes: [
          'openid',
          'profile',
          'email',
          'accounting.transactions',
          'accounting.contacts',
          'accounting.settings',
        ],
      });

      // Initialize the client to set up openIdClient (required before refreshToken)
      await xeroClient.initialize();

      xeroClient.setTokenSet({
        access_token: oldTokens.accessToken,
        refresh_token: oldTokens.refreshToken,
        expires_in: 0, // Force refresh
        token_type: 'Bearer',
      });

      // Refresh the token
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const newTokenSet = await xeroClient.refreshToken();

      // Type guard for token set response
      const tokenSet = newTokenSet as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const newTokens: TokenSet = {
        accessToken: tokenSet.access_token ?? '',
        refreshToken: tokenSet.refresh_token ?? oldTokens.refreshToken,
        expiresAt: Date.now() + (tokenSet.expires_in ?? 1800) * 1000,
        xeroTenantId: oldTokens.xeroTenantId,
      };

      // Store new tokens
      await this.storeTokens(tenantId, newTokens);

      this.logger.info('Token refreshed successfully', { tenantId });
      return newTokens.accessToken;
    } catch (error) {
      this.logger.logError(
        error instanceof Error ? error : new Error(String(error)),
        { tenantId },
      );

      if (error instanceof XeroMCPError) {
        throw error;
      }

      throw new TokenExpiredError(tenantId);
    }
  }

  /**
   * Decrypt stored tokens
   */
  private decryptTokens(encryptedTokens: string): TokenSet {
    const decrypted = this.encryption.decrypt(encryptedTokens);
    return JSON.parse(decrypted) as TokenSet;
  }
}
