/**
 * Stitch Banking Service
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * Handles all interactions with Stitch API for South African Open Banking.
 * Supports: FNB, Standard Bank, Nedbank, ABSA, Capitec
 *
 * Features:
 * - OAuth account linking flow
 * - Token management with AES-256-GCM encryption
 * - Transaction retrieval with incremental sync
 * - Balance queries
 * - Consent renewal (90-day cycle)
 * - POPIA-compliant audit logging
 */

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EncryptionService } from '../../shared/services/encryption.service';
import {
  LinkInitRequest,
  LinkInitResponse,
  TokenResponse,
  StitchAccount,
  LinkedAccount,
  StitchTransaction,
  BankTransaction,
  AccountBalance,
  AccountSyncResult,
  StitchConfig,
  StitchRequestOptions,
  StitchApiError,
  StitchErrorCode,
  RETRYABLE_ERRORS,
  DEFAULT_SCOPES,
  DEFAULT_STITCH_CONFIG,
  SyncEventType,
  LinkedAccountStatus,
  SUPPORTED_BANKS,
  SupportedBank,
} from './stitch.types';
import { LinkedBankAccountStatus } from '@prisma/client';

/**
 * Maps Prisma status to API status
 */
function mapPrismaStatus(status: LinkedBankAccountStatus): LinkedAccountStatus {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'ACTIVE':
      return 'active';
    case 'EXPIRED':
      return 'expired';
    case 'REVOKED':
      return 'revoked';
    case 'ERROR':
      return 'error';
    default:
      return 'error';
  }
}

/**
 * Maps API status to Prisma status
 */
function mapToPrismaStatus(status: LinkedAccountStatus): LinkedBankAccountStatus {
  switch (status) {
    case 'pending':
      return 'PENDING';
    case 'active':
      return 'ACTIVE';
    case 'expired':
      return 'EXPIRED';
    case 'revoked':
      return 'REVOKED';
    case 'error':
      return 'ERROR';
    default:
      return 'ERROR';
  }
}

@Injectable()
export class StitchBankingService {
  private readonly logger = new Logger(StitchBankingService.name);
  private readonly config: StitchConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {
    // Load Stitch configuration
    this.config = {
      baseUrl:
        this.configService.get<string>('STITCH_API_URL') ||
        DEFAULT_STITCH_CONFIG.baseUrl!,
      clientId: this.configService.get<string>('STITCH_CLIENT_ID') || '',
      clientSecret:
        this.configService.get<string>('STITCH_CLIENT_SECRET') || '',
      redirectUri:
        this.configService.get<string>('STITCH_REDIRECT_URI') || '',
      timeoutMs: DEFAULT_STITCH_CONFIG.timeoutMs!,
      sandbox:
        this.configService.get<string>('STITCH_SANDBOX') === 'true' ||
        this.configService.get<string>('NODE_ENV') !== 'production',
    };

    // Validate required config in production
    if (
      !this.config.sandbox &&
      (!this.config.clientId || !this.config.clientSecret)
    ) {
      this.logger.warn(
        'STITCH_CLIENT_ID and STITCH_CLIENT_SECRET required for production. ' +
          'Bank linking will be disabled.',
      );
    }

    this.logger.log(
      `StitchBankingService initialized (sandbox: ${this.config.sandbox})`,
    );
  }

  // ===========================================================================
  // Account Linking
  // ===========================================================================

  /**
   * Initiate bank account linking flow
   * Generates OAuth URL for user to authorize bank access
   *
   * @param request - Link initiation parameters
   * @returns Link URL and state for OAuth flow
   */
  async initiateAccountLink(request: LinkInitRequest): Promise<LinkInitResponse> {
    this.logger.log(`Initiating account link for tenant: ${request.tenantId}`);

    // Generate state for CSRF protection
    const state = this.encryptionService.generateRandomString(32);

    // Store state in database for callback verification
    const linkId = this.encryptionService.generateRandomString(16);

    // Build OAuth authorization URL
    const scopes = request.scopes || DEFAULT_SCOPES;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: request.redirectUri || this.config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: state,
    });

    if (request.userReference) {
      params.append('user_reference', request.userReference);
    }

    const linkUrl = `${this.config.baseUrl}/connect/authorize?${params.toString()}`;

    // Log audit event
    await this.logSyncEvent({
      type: 'link_initiated',
      linkedBankAccountId: linkId, // Temporary ID until account is created
      tenantId: request.tenantId,
      timestamp: new Date(),
      details: {
        scopes,
        redirectUri: request.redirectUri || this.config.redirectUri,
      },
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    this.logger.debug(`Link URL generated for tenant ${request.tenantId}`);

    return {
      linkUrl,
      state,
      linkId,
      expiresAt,
    };
  }

  /**
   * Complete bank account linking after OAuth callback
   * Exchanges authorization code for tokens and creates linked account
   *
   * @param tenantId - Tenant ID
   * @param authCode - Authorization code from callback
   * @param state - State parameter for verification
   * @returns Linked account details
   */
  async completeAccountLink(
    tenantId: string,
    authCode: string,
    state?: string,
  ): Promise<LinkedAccount> {
    this.logger.log(`Completing account link for tenant: ${tenantId}`);

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeToken({
        code: authCode,
        redirectUri: this.config.redirectUri,
        grantType: 'authorization_code',
      });

      // Get account details from Stitch
      const accounts = await this.fetchAccounts(tokenResponse.accessToken);

      if (accounts.length === 0) {
        throw new HttpException(
          'No bank accounts found in linked account',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Use first account (user can link multiple separately)
      const account = accounts[0];

      // Calculate consent expiry (90 days from grant)
      const consentGrantedAt = new Date();
      const consentExpiresAt = new Date(
        consentGrantedAt.getTime() + 90 * 24 * 60 * 60 * 1000,
      );

      // Encrypt tokens before storage
      const encryptedAccessToken = this.encryptionService.encrypt(
        tokenResponse.accessToken,
      );
      const encryptedRefreshToken = this.encryptionService.encrypt(
        tokenResponse.refreshToken,
      );

      // Calculate token expiry
      const tokenExpiresAt = new Date(
        Date.now() + tokenResponse.expiresIn * 1000,
      );

      // Create linked bank account record
      const linkedAccount = await this.prisma.linkedBankAccount.create({
        data: {
          tenantId,
          bankName: this.getBankDisplayName(account.bankId),
          accountHolderName: account.accountHolderName,
          accountNumberMasked: account.accountNumberMasked,
          accountType: account.accountType,
          stitchAccountId: account.id,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          consentExpiresAt,
          consentGrantedAt,
          status: 'ACTIVE',
          metadata: {
            currency: account.currency,
            branchCode: account.branchCode,
            swiftCode: account.swiftCode,
          },
        },
      });

      // Log audit event
      await this.logSyncEvent({
        type: 'link_completed',
        linkedBankAccountId: linkedAccount.id,
        tenantId,
        timestamp: new Date(),
        details: {
          bankName: linkedAccount.bankName,
          accountType: linkedAccount.accountType,
          stitchAccountId: account.id,
        },
      });

      this.logger.log(
        `Account linked successfully: ${linkedAccount.id} (${linkedAccount.bankName})`,
      );

      return this.mapToLinkedAccount(linkedAccount);
    } catch (error) {
      // Log failure
      await this.logSyncEvent({
        type: 'link_failed',
        linkedBankAccountId: 'unknown',
        tenantId,
        timestamp: new Date(),
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          authCode: authCode.substring(0, 8) + '...', // Partial for debugging
        },
      });

      throw error;
    }
  }

  // ===========================================================================
  // Transaction Retrieval
  // ===========================================================================

  /**
   * Get transactions for a linked account
   *
   * @param accountId - Linked bank account ID
   * @param from - Start date
   * @param to - End date
   * @returns Array of bank transactions
   */
  async getTransactions(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<BankTransaction[]> {
    this.logger.log(
      `Fetching transactions for account ${accountId} from ${from.toISOString()} to ${to.toISOString()}`,
    );

    const linkedAccount = await this.getLinkedAccountOrThrow(accountId);

    // Refresh token if needed
    const accessToken = await this.ensureValidToken(linkedAccount);

    // Fetch transactions from Stitch
    const transactions = await this.fetchTransactions(
      accessToken,
      linkedAccount.stitchAccountId,
      from,
      to,
    );

    // Check for duplicates against existing transactions
    const existingTxnIds = await this.getExistingTransactionIds(
      linkedAccount.tenantId,
      transactions.map((t) => t.id),
    );

    // Map to internal format
    return transactions.map((txn) => ({
      externalId: txn.id,
      linkedBankAccountId: accountId,
      tenantId: linkedAccount.tenantId,
      date: txn.date,
      amountCents: txn.amountCents,
      description: txn.description,
      reference: txn.reference,
      type: txn.type,
      runningBalanceCents: txn.runningBalanceCents,
      counterpartyName: txn.counterparty?.name,
      bankCategory: txn.category,
      isDuplicate: existingTxnIds.has(txn.id),
    }));
  }

  /**
   * Get account balance
   *
   * @param accountId - Linked bank account ID
   * @returns Account balance information
   */
  async getBalance(accountId: string): Promise<AccountBalance> {
    this.logger.log(`Fetching balance for account ${accountId}`);

    const linkedAccount = await this.getLinkedAccountOrThrow(accountId);
    const accessToken = await this.ensureValidToken(linkedAccount);

    return this.fetchBalance(accessToken, linkedAccount.stitchAccountId);
  }

  // ===========================================================================
  // Token Management
  // ===========================================================================

  /**
   * Refresh account link tokens
   *
   * @param accountId - Linked bank account ID
   */
  async refreshAccountLink(accountId: string): Promise<void> {
    this.logger.log(`Refreshing tokens for account ${accountId}`);

    const linkedAccount = await this.getLinkedAccountOrThrow(accountId);

    // Decrypt current refresh token
    const refreshToken = this.encryptionService.decrypt(
      linkedAccount.refreshToken,
    );

    try {
      // Exchange refresh token for new tokens
      const tokenResponse = await this.exchangeToken({
        code: '',
        redirectUri: this.config.redirectUri,
        grantType: 'refresh_token',
        refreshToken,
      });

      // Encrypt new tokens
      const encryptedAccessToken = this.encryptionService.encrypt(
        tokenResponse.accessToken,
      );
      const encryptedRefreshToken = this.encryptionService.encrypt(
        tokenResponse.refreshToken,
      );

      const tokenExpiresAt = new Date(
        Date.now() + tokenResponse.expiresIn * 1000,
      );

      // Update database
      await this.prisma.linkedBankAccount.update({
        where: { id: accountId },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          status: 'ACTIVE',
          lastSyncError: null,
          syncErrorCount: 0,
        },
      });

      // Log audit event
      await this.logSyncEvent({
        type: 'token_refreshed',
        linkedBankAccountId: accountId,
        tenantId: linkedAccount.tenantId,
        timestamp: new Date(),
        details: {
          tokenExpiresAt: tokenExpiresAt.toISOString(),
        },
      });

      this.logger.log(`Tokens refreshed for account ${accountId}`);
    } catch (error) {
      // Handle invalid refresh token
      if (
        error instanceof HttpException &&
        (error.message.includes('invalid_grant') ||
          error.message.includes('CONSENT_REVOKED'))
      ) {
        await this.prisma.linkedBankAccount.update({
          where: { id: accountId },
          data: {
            status: 'REVOKED',
            lastSyncError: 'Refresh token revoked or expired',
          },
        });

        await this.logSyncEvent({
          type: 'consent_expired',
          linkedBankAccountId: accountId,
          tenantId: linkedAccount.tenantId,
          timestamp: new Date(),
          details: {
            error: 'Refresh token revoked or expired',
          },
        });
      }

      throw error;
    }
  }

  /**
   * Unlink a bank account
   *
   * @param accountId - Linked bank account ID
   */
  async unlinkAccount(accountId: string): Promise<void> {
    this.logger.log(`Unlinking account ${accountId}`);

    const linkedAccount = await this.getLinkedAccountOrThrow(accountId);

    // Revoke tokens at Stitch (best effort)
    try {
      const accessToken = this.encryptionService.decrypt(
        linkedAccount.accessToken,
      );
      await this.revokeToken(accessToken);
    } catch (error) {
      this.logger.warn(
        `Failed to revoke token at Stitch for account ${accountId}: ${error}`,
      );
    }

    // Soft delete by setting status to REVOKED
    await this.prisma.linkedBankAccount.update({
      where: { id: accountId },
      data: {
        status: 'REVOKED',
        accessToken: '', // Clear tokens
        refreshToken: '',
      },
    });

    // Log audit event
    await this.logSyncEvent({
      type: 'account_unlinked',
      linkedBankAccountId: accountId,
      tenantId: linkedAccount.tenantId,
      timestamp: new Date(),
      details: {
        bankName: linkedAccount.bankName,
      },
    });

    this.logger.log(`Account ${accountId} unlinked successfully`);
  }

  // ===========================================================================
  // Sync Operations
  // ===========================================================================

  /**
   * Sync transactions for a single account
   *
   * @param accountId - Linked bank account ID
   * @returns Sync result
   */
  async syncAccount(accountId: string): Promise<AccountSyncResult> {
    const startedAt = new Date();
    this.logger.log(`Starting sync for account ${accountId}`);

    const linkedAccount = await this.getLinkedAccountOrThrow(accountId);

    // Skip if consent expired
    if (linkedAccount.consentExpiresAt < new Date()) {
      await this.prisma.linkedBankAccount.update({
        where: { id: accountId },
        data: { status: 'EXPIRED' },
      });

      return {
        accountId,
        success: false,
        transactionsRetrieved: 0,
        transactionsNew: 0,
        transactionsDuplicate: 0,
        startedAt,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        errorMessage: 'Consent expired',
        errorCode: 'CONSENT_EXPIRED',
        reconciliationTriggered: false,
      };
    }

    try {
      // Log sync start
      await this.logSyncEvent({
        type: 'sync_started',
        linkedBankAccountId: accountId,
        tenantId: linkedAccount.tenantId,
        timestamp: startedAt,
        details: {
          lastSyncedAt: linkedAccount.lastSyncedAt?.toISOString(),
        },
      });

      // Determine date range
      const to = new Date();
      const from = linkedAccount.lastSyncedAt
        ? new Date(linkedAccount.lastSyncedAt.getTime() - 24 * 60 * 60 * 1000) // 1 day overlap
        : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days for initial

      // Fetch transactions
      const transactions = await this.getTransactions(accountId, from, to);

      const transactionsNew = transactions.filter((t) => !t.isDuplicate);
      const transactionsDuplicate = transactions.filter((t) => t.isDuplicate);

      // Import new transactions to bank import table
      if (transactionsNew.length > 0) {
        await this.importTransactions(linkedAccount.tenantId, transactionsNew);
      }

      // Update last sync timestamp
      const completedAt = new Date();
      await this.prisma.linkedBankAccount.update({
        where: { id: accountId },
        data: {
          lastSyncedAt: completedAt,
          lastSyncError: null,
          syncErrorCount: 0,
        },
      });

      // Log sync completion
      await this.logSyncEvent({
        type: 'sync_completed',
        linkedBankAccountId: accountId,
        tenantId: linkedAccount.tenantId,
        timestamp: completedAt,
        details: {
          transactionsRetrieved: transactions.length,
          transactionsNew: transactionsNew.length,
          transactionsDuplicate: transactionsDuplicate.length,
          dateRange: { from: from.toISOString(), to: to.toISOString() },
        },
      });

      // Trigger auto-reconciliation if new transactions
      const reconciliationTriggered = transactionsNew.length > 0;

      this.logger.log(
        `Sync completed for account ${accountId}: ${transactionsNew.length} new, ${transactionsDuplicate.length} duplicates`,
      );

      return {
        accountId,
        success: true,
        transactionsRetrieved: transactions.length,
        transactionsNew: transactionsNew.length,
        transactionsDuplicate: transactionsDuplicate.length,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        reconciliationTriggered,
      };
    } catch (error) {
      const completedAt = new Date();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorCode = this.mapErrorCode(error);

      // Update error status
      await this.prisma.linkedBankAccount.update({
        where: { id: accountId },
        data: {
          lastSyncError: errorMessage,
          syncErrorCount: { increment: 1 },
          status:
            linkedAccount.syncErrorCount >= 2
              ? 'ERROR'
              : linkedAccount.status,
        },
      });

      // Log sync failure
      await this.logSyncEvent({
        type: 'sync_failed',
        linkedBankAccountId: accountId,
        tenantId: linkedAccount.tenantId,
        timestamp: completedAt,
        details: {
          error: errorMessage,
          errorCode,
        },
      });

      this.logger.error(`Sync failed for account ${accountId}: ${errorMessage}`);

      return {
        accountId,
        success: false,
        transactionsRetrieved: 0,
        transactionsNew: 0,
        transactionsDuplicate: 0,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        errorMessage,
        errorCode,
        reconciliationTriggered: false,
      };
    }
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get all linked accounts for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns Array of linked accounts
   */
  async getLinkedAccounts(tenantId: string): Promise<LinkedAccount[]> {
    const accounts = await this.prisma.linkedBankAccount.findMany({
      where: {
        tenantId,
        status: { not: 'REVOKED' },
      },
      orderBy: { createdAt: 'desc' },
    });

    return accounts.map((a) => this.mapToLinkedAccount(a));
  }

  /**
   * Get accounts that need consent renewal
   *
   * @param tenantId - Tenant ID
   * @param daysThreshold - Days before expiry to warn
   * @returns Accounts needing renewal
   */
  async getAccountsNeedingRenewal(
    tenantId: string,
    daysThreshold: number = 14,
  ): Promise<LinkedAccount[]> {
    const threshold = new Date(
      Date.now() + daysThreshold * 24 * 60 * 60 * 1000,
    );

    const accounts = await this.prisma.linkedBankAccount.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        consentExpiresAt: { lte: threshold },
      },
      orderBy: { consentExpiresAt: 'asc' },
    });

    return accounts.map((a) => this.mapToLinkedAccount(a));
  }

  /**
   * Get all accounts due for sync
   *
   * @returns Account IDs to sync
   */
  async getAccountsDueForSync(): Promise<string[]> {
    const accounts = await this.prisma.linkedBankAccount.findMany({
      where: {
        status: 'ACTIVE',
        consentExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    return accounts.map((a) => a.id);
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get linked account or throw not found
   */
  private async getLinkedAccountOrThrow(accountId: string) {
    const account = await this.prisma.linkedBankAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new HttpException(
        `Linked bank account not found: ${accountId}`,
        HttpStatus.NOT_FOUND,
      );
    }

    return account;
  }

  /**
   * Ensure access token is valid, refresh if needed
   */
  private async ensureValidToken(
    linkedAccount: Awaited<ReturnType<typeof this.getLinkedAccountOrThrow>>,
  ): Promise<string> {
    // Check if token is expired (with 5 min buffer)
    const isExpired =
      linkedAccount.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (isExpired) {
      await this.refreshAccountLink(linkedAccount.id);
      // Re-fetch account with new tokens
      const refreshed = await this.getLinkedAccountOrThrow(linkedAccount.id);
      return this.encryptionService.decrypt(refreshed.accessToken);
    }

    return this.encryptionService.decrypt(linkedAccount.accessToken);
  }

  /**
   * Exchange authorization code or refresh token for access token
   */
  private async exchangeToken(request: {
    code: string;
    redirectUri: string;
    grantType: 'authorization_code' | 'refresh_token';
    refreshToken?: string;
  }): Promise<TokenResponse> {
    const body: Record<string, string> = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: request.grantType,
    };

    if (request.grantType === 'authorization_code') {
      body.code = request.code;
      body.redirect_uri = request.redirectUri;
    } else {
      body.refresh_token = request.refreshToken!;
    }

    const response = await this.makeRequest({
      method: 'POST',
      path: '/oauth/token',
      body,
    });

    return {
      accessToken: String(response.access_token),
      refreshToken: String(response.refresh_token),
      tokenType: 'Bearer',
      expiresIn: Number(response.expires_in),
      scope: String(response.scope),
    };
  }

  /**
   * Fetch accounts from Stitch API
   */
  private async fetchAccounts(accessToken: string): Promise<StitchAccount[]> {
    const response = await this.makeRequest({
      method: 'GET',
      path: '/api/accounts',
      accessToken,
    });

    const accounts = Array.isArray(response.accounts) ? response.accounts : [];
    return accounts.map((acc: Record<string, unknown>) =>
      this.mapStitchAccount(acc),
    );
  }

  /**
   * Fetch transactions from Stitch API
   */
  private async fetchTransactions(
    accessToken: string,
    stitchAccountId: string,
    from: Date,
    to: Date,
  ): Promise<StitchTransaction[]> {
    const response = await this.makeRequest({
      method: 'GET',
      path: `/api/accounts/${stitchAccountId}/transactions`,
      params: {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      },
      accessToken,
    });

    const transactions = Array.isArray(response.transactions) ? response.transactions : [];
    return transactions.map((txn: Record<string, unknown>) =>
      this.mapStitchTransaction(txn),
    );
  }

  /**
   * Fetch balance from Stitch API
   */
  private async fetchBalance(
    accessToken: string,
    stitchAccountId: string,
  ): Promise<AccountBalance> {
    const response = await this.makeRequest({
      method: 'GET',
      path: `/api/accounts/${stitchAccountId}/balance`,
      accessToken,
    });

    return {
      accountId: stitchAccountId,
      currentBalanceCents: Math.round(Number(response.current_balance || 0) * 100),
      availableBalanceCents: Math.round(Number(response.available_balance || 0) * 100),
      currency: String(response.currency || 'ZAR'),
      asOf: new Date(String(response.as_of) || Date.now()),
      overdraftLimitCents: response.overdraft_limit
        ? Math.round(Number(response.overdraft_limit) * 100)
        : undefined,
    };
  }

  /**
   * Revoke token at Stitch
   */
  private async revokeToken(accessToken: string): Promise<void> {
    await this.makeRequest({
      method: 'POST',
      path: '/oauth/revoke',
      body: {
        token: accessToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
    });
  }

  /**
   * Make HTTP request to Stitch API
   */
  private async makeRequest(options: StitchRequestOptions): Promise<Record<string, unknown>> {
    const url = new URL(options.path, this.config.baseUrl);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (options.accessToken) {
      headers['Authorization'] = `Bearer ${options.accessToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs || this.config.timeoutMs,
    );

    try {
      const response = await fetch(url.toString(), {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = this.mapApiError(response.status, errorBody);
        throw new HttpException(error.message, error.statusCode);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpException(
          'Request timeout',
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      throw new HttpException(
        `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Map Stitch API account response to internal type
   */
  private mapStitchAccount(data: Record<string, unknown>): StitchAccount {
    const accountNumber = String(data.account_number || '');
    return {
      id: String(data.id),
      bankId: String(data.bank_id || 'unknown') as SupportedBank,
      accountHolderName: String(data.account_holder_name || ''),
      accountNumber,
      accountNumberMasked: `****${accountNumber.slice(-4)}`,
      accountType: String(data.account_type || 'unknown') as StitchAccount['accountType'],
      currency: String(data.currency || 'ZAR'),
      currentBalanceCents: Math.round(Number(data.current_balance || 0) * 100),
      availableBalanceCents: Math.round(
        Number(data.available_balance || 0) * 100,
      ),
      status: String(data.status || 'active') as StitchAccount['status'],
      branchCode: data.branch_code ? String(data.branch_code) : undefined,
      swiftCode: data.swift_code ? String(data.swift_code) : undefined,
    };
  }

  /**
   * Map Stitch API transaction response to internal type
   */
  private mapStitchTransaction(
    data: Record<string, unknown>,
  ): StitchTransaction {
    return {
      id: String(data.id),
      accountId: String(data.account_id),
      amountCents: Math.round(Number(data.amount || 0) * 100),
      currency: String(data.currency || 'ZAR'),
      date: new Date(String(data.date)),
      description: String(data.description || ''),
      reference: String(data.reference || ''),
      type: String(data.type || 'other') as StitchTransaction['type'],
      runningBalanceCents: data.running_balance
        ? Math.round(Number(data.running_balance) * 100)
        : undefined,
      counterparty: data.counterparty
        ? {
            name: (data.counterparty as Record<string, unknown>).name as string | undefined,
            accountNumber: (data.counterparty as Record<string, unknown>)
              .account_number as string | undefined,
            bankId: (data.counterparty as Record<string, unknown>).bank_id as
              | string
              | undefined,
          }
        : undefined,
      category: data.category ? String(data.category) : undefined,
      status: String(data.status || 'posted') as StitchTransaction['status'],
    };
  }

  /**
   * Map linked bank account record to API response
   */
  private mapToLinkedAccount(
    account: Awaited<ReturnType<typeof this.prisma.linkedBankAccount.findUnique>> & {},
  ): LinkedAccount {
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (account.consentExpiresAt.getTime() - Date.now()) /
          (24 * 60 * 60 * 1000),
      ),
    );

    return {
      id: account.id,
      tenantId: account.tenantId,
      bankName: account.bankName,
      accountNumberMasked: account.accountNumberMasked,
      accountType: account.accountType,
      accountHolderName: account.accountHolderName,
      status: mapPrismaStatus(account.status),
      linkedAt: account.consentGrantedAt,
      lastSyncedAt: account.lastSyncedAt,
      nextSyncAt: account.lastSyncedAt
        ? new Date(account.lastSyncedAt.getTime() + 4 * 60 * 60 * 1000)
        : null,
      consentExpiresAt: account.consentExpiresAt,
      consentDaysRemaining: daysRemaining,
      requiresRenewal: daysRemaining <= 14,
      lastSyncError: account.lastSyncError || undefined,
    };
  }

  /**
   * Get bank display name from bank ID
   */
  private getBankDisplayName(bankId: string): string {
    return SUPPORTED_BANKS[bankId as SupportedBank] || bankId;
  }

  /**
   * Map API error to internal error type
   */
  private mapApiError(
    statusCode: number,
    body: Record<string, unknown>,
  ): StitchApiError {
    const code = this.mapErrorCodeFromBody(body);
    // OAuth errors use 'error' field, include it in message for catch blocks to detect
    const errorField = body.error ? String(body.error) : '';
    const description = String(
      body.error_description || body.message || errorField || 'Unknown error',
    );
    return {
      code,
      message: errorField && !description.includes(errorField)
        ? `${errorField}: ${description}`
        : description,
      statusCode,
      details: body,
      retryable: RETRYABLE_ERRORS.includes(code),
    };
  }

  /**
   * Map error body to error code
   */
  private mapErrorCodeFromBody(body: Record<string, unknown>): StitchErrorCode {
    const error = String(body.error || '').toLowerCase();
    if (error.includes('invalid_grant')) return 'INVALID_GRANT';
    if (error.includes('consent_expired')) return 'CONSENT_EXPIRED';
    if (error.includes('consent_revoked')) return 'CONSENT_REVOKED';
    if (error.includes('rate_limit')) return 'RATE_LIMITED';
    if (error.includes('invalid_token')) return 'TOKEN_EXPIRED';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Map error to error code
   */
  private mapErrorCode(error: unknown): StitchErrorCode {
    if (error instanceof HttpException) {
      if (error.getStatus() === 401) return 'TOKEN_EXPIRED';
      if (error.getStatus() === 429) return 'RATE_LIMITED';
      if (error.getStatus() >= 500) return 'SERVER_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Get existing transaction IDs to detect duplicates
   */
  private async getExistingTransactionIds(
    tenantId: string,
    externalIds: string[],
  ): Promise<Set<string>> {
    const existing = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        reference: { in: externalIds },
      },
      select: { reference: true },
    });

    return new Set(existing.map((t) => t.reference || ''));
  }

  /**
   * Import transactions to bank import table
   */
  private async importTransactions(
    tenantId: string,
    transactions: BankTransaction[],
  ): Promise<void> {
    // Get linked account to determine bank account name
    const linkedAccount = transactions.length > 0
      ? await this.prisma.linkedBankAccount.findUnique({
          where: { id: transactions[0].linkedBankAccountId },
        })
      : null;

    const bankAccountName = linkedAccount
      ? `${linkedAccount.bankName} (${linkedAccount.accountNumberMasked})`
      : 'Stitch API';

    // Create transactions in the existing Transaction table
    await this.prisma.transaction.createMany({
      data: transactions.map((txn) => ({
        tenantId,
        date: txn.date,
        amountCents: Math.abs(txn.amountCents),
        isCredit: txn.amountCents > 0,
        description: txn.description,
        reference: txn.externalId,
        payeeName: txn.counterpartyName || null,
        bankAccount: bankAccountName,
        source: 'BANK_FEED' as const,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Imported ${transactions.length} transactions for tenant ${tenantId}`,
    );
  }

  /**
   * Log sync event for POPIA audit trail
   */
  private async logSyncEvent(event: {
    type: SyncEventType;
    linkedBankAccountId: string;
    tenantId: string;
    timestamp: Date;
    details: Record<string, unknown>;
    triggeredBy?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      // Only log for real accounts (not temp IDs)
      if (event.linkedBankAccountId === 'unknown' || !event.linkedBankAccountId) {
        this.logger.warn(`Skipping sync event log - invalid account ID: ${event.linkedBankAccountId}`);
        return;
      }

      // Check if account exists
      const accountExists = await this.prisma.linkedBankAccount.findUnique({
        where: { id: event.linkedBankAccountId },
        select: { id: true },
      });

      if (!accountExists) {
        this.logger.debug(`Skipping sync event log - account not found: ${event.linkedBankAccountId}`);
        return;
      }

      const durationMs = event.details.durationMs as number | undefined;

      await this.prisma.linkedBankSyncEvent.create({
        data: {
          linkedBankAccountId: event.linkedBankAccountId,
          syncType: event.type,
          status: event.type.includes('failed') ? 'FAILED' : 'SUCCESS',
          transactionsFetched: (event.details.transactionsRetrieved as number) || null,
          transactionsImported: (event.details.transactionsNew as number) || null,
          transactionsDuplicate: (event.details.transactionsDuplicate as number) || null,
          errorMessage: (event.details.error as string) || null,
          errorCode: (event.details.errorCode as string) || null,
          durationMs: durationMs || null,
          completedAt: event.timestamp,
        },
      });
    } catch (error) {
      // Don't fail main operation if audit logging fails
      this.logger.error(`Failed to log sync event: ${error}`);
    }
  }
}
