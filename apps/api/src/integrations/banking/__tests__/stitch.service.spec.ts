/**
 * Stitch Banking Service Tests
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * Tests for StitchBankingService including:
 * - Account linking flow
 * - Token management
 * - Transaction retrieval
 * - Balance queries
 * - Error handling
 * - POPIA audit logging
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { StitchBankingService } from '../stitch.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { LinkedAccountStatus, StitchErrorCode } from '../stitch.types';

describe('StitchBankingService', () => {
  let service: StitchBankingService;
  let prismaService: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;
  let encryptionService: jest.Mocked<EncryptionService>;

  // Mock data
  const mockTenantId = 'tenant-123';
  const mockAccountId = 'account-456';
  const mockStitchAccountId = 'stitch-acc-789';
  const mockAccessToken = 'access-token-xyz';
  const mockRefreshToken = 'refresh-token-abc';
  const mockEncryptedAccessToken = 'encrypted-access-token';
  const mockEncryptedRefreshToken = 'encrypted-refresh-token';

  const mockLinkedAccount = {
    id: mockAccountId,
    tenantId: mockTenantId,
    bankName: 'First National Bank',
    accountHolderName: 'John Doe',
    accountNumberMasked: '****1234',
    accountType: 'cheque',
    stitchAccountId: mockStitchAccountId,
    accessToken: mockEncryptedAccessToken,
    refreshToken: mockEncryptedRefreshToken,
    tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    consentGrantedAt: new Date(),
    lastSyncedAt: null,
    lastSyncError: null,
    syncErrorCount: 0,
    status: 'ACTIVE' as const,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Create mock implementations
    const mockPrismaService = {
      linkedBankAccount: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      linkedBankSyncEvent: {
        create: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          STITCH_API_URL: 'https://api.stitch.money',
          STITCH_CLIENT_ID: 'test-client-id',
          STITCH_CLIENT_SECRET: 'test-client-secret',
          STITCH_REDIRECT_URI: 'https://app.test.com/banking/callback',
          STITCH_SANDBOX: 'true',
          NODE_ENV: 'test',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const mockEncryptionService = {
      encrypt: jest.fn().mockReturnValue(mockEncryptedAccessToken),
      decrypt: jest.fn().mockReturnValue(mockAccessToken),
      generateRandomString: jest.fn().mockReturnValue('random-string-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StitchBankingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<StitchBankingService>(StitchBankingService);
    prismaService = module.get(PrismaService);
    configService = module.get(ConfigService);
    encryptionService = module.get(EncryptionService);

    // Mock global fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateAccountLink', () => {
    it('should generate OAuth link URL with correct parameters', async () => {
      const result = await service.initiateAccountLink({
        tenantId: mockTenantId,
        redirectUri: 'https://custom.callback.com/banking',
      });

      expect(result).toHaveProperty('linkUrl');
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('linkId');
      expect(result).toHaveProperty('expiresAt');

      expect(result.linkUrl).toContain(
        'https://api.stitch.money/connect/authorize',
      );
      expect(result.linkUrl).toContain('client_id=test-client-id');
      expect(result.linkUrl).toContain(
        'redirect_uri=https%3A%2F%2Fcustom.callback.com%2Fbanking',
      );
      expect(result.linkUrl).toContain('response_type=code');
      expect(result.linkUrl).toContain(
        'scope=accounts+balances+transactions+offline_access',
      );
    });

    it('should use default redirect URI if not provided', async () => {
      const result = await service.initiateAccountLink({
        tenantId: mockTenantId,
      });

      expect(result.linkUrl).toContain(
        'redirect_uri=https%3A%2F%2Fapp.test.com%2Fbanking%2Fcallback',
      );
    });

    it('should include user reference in link URL when provided', async () => {
      const result = await service.initiateAccountLink({
        tenantId: mockTenantId,
        userReference: 'user-email@test.com',
      });

      expect(result.linkUrl).toContain('user_reference=user-email%40test.com');
    });

    it('should set expiry 10 minutes in the future', async () => {
      const beforeCall = Date.now();
      const result = await service.initiateAccountLink({
        tenantId: mockTenantId,
      });
      const afterCall = Date.now();

      const expiryTime = result.expiresAt.getTime();
      const expectedExpiry = 10 * 60 * 1000; // 10 minutes

      expect(expiryTime).toBeGreaterThanOrEqual(
        beforeCall + expectedExpiry - 1000,
      );
      expect(expiryTime).toBeLessThanOrEqual(afterCall + expectedExpiry + 1000);
    });
  });

  describe('getLinkedAccounts', () => {
    it('should return mapped linked accounts for tenant', async () => {
      prismaService.linkedBankAccount.findMany.mockResolvedValue([
        mockLinkedAccount,
      ]);

      const result = await service.getLinkedAccounts(mockTenantId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: mockAccountId,
          tenantId: mockTenantId,
          bankName: 'First National Bank',
          accountNumberMasked: '****1234',
          accountType: 'cheque',
          status: 'active',
        }),
      );

      expect(prismaService.linkedBankAccount.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          status: { not: 'REVOKED' },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should calculate consent days remaining correctly', async () => {
      const consentExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      prismaService.linkedBankAccount.findMany.mockResolvedValue([
        { ...mockLinkedAccount, consentExpiresAt },
      ]);

      const result = await service.getLinkedAccounts(mockTenantId);

      expect(result[0].consentDaysRemaining).toBe(30);
      expect(result[0].requiresRenewal).toBe(false);
    });

    it('should mark accounts as requiring renewal when < 14 days', async () => {
      const consentExpiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days
      prismaService.linkedBankAccount.findMany.mockResolvedValue([
        { ...mockLinkedAccount, consentExpiresAt },
      ]);

      const result = await service.getLinkedAccounts(mockTenantId);

      expect(result[0].consentDaysRemaining).toBe(10);
      expect(result[0].requiresRenewal).toBe(true);
    });

    it('should return empty array when no accounts found', async () => {
      prismaService.linkedBankAccount.findMany.mockResolvedValue([]);

      const result = await service.getLinkedAccounts(mockTenantId);

      expect(result).toEqual([]);
    });
  });

  describe('getAccountsNeedingRenewal', () => {
    it('should return accounts expiring within threshold', async () => {
      const expiringAccount = {
        ...mockLinkedAccount,
        consentExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      prismaService.linkedBankAccount.findMany.mockResolvedValue([
        expiringAccount,
      ]);

      const result = await service.getAccountsNeedingRenewal(mockTenantId, 14);

      expect(result).toHaveLength(1);
      expect(prismaService.linkedBankAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
            status: 'ACTIVE',
            consentExpiresAt: expect.any(Object),
          }),
        }),
      );
    });

    it('should use default 14 day threshold', async () => {
      prismaService.linkedBankAccount.findMany.mockResolvedValue([]);

      await service.getAccountsNeedingRenewal(mockTenantId);

      const call = prismaService.linkedBankAccount.findMany.mock.calls[0][0];
      const threshold = (call as { where: { consentExpiresAt: { lte: Date } } })
        .where.consentExpiresAt.lte;
      const daysDiff =
        (threshold.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

      expect(daysDiff).toBeCloseTo(14, 0);
    });
  });

  describe('getAccountsDueForSync', () => {
    it('should return active accounts with valid consent', async () => {
      prismaService.linkedBankAccount.findMany.mockResolvedValue([
        { id: 'acc-1' },
        { id: 'acc-2' },
      ]);

      const result = await service.getAccountsDueForSync();

      expect(result).toEqual(['acc-1', 'acc-2']);
      expect(prismaService.linkedBankAccount.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          consentExpiresAt: { gt: expect.any(Date) },
        },
        select: { id: true },
      });
    });
  });

  describe('unlinkAccount', () => {
    it('should revoke tokens and update status', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      prismaService.linkedBankAccount.update.mockResolvedValue({
        ...mockLinkedAccount,
        status: 'REVOKED',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await service.unlinkAccount(mockAccountId);

      expect(prismaService.linkedBankAccount.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: {
          status: 'REVOKED',
          accessToken: '',
          refreshToken: '',
        },
      });
    });

    it('should throw if account not found', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(null);

      await expect(service.unlinkAccount('nonexistent-id')).rejects.toThrow(
        HttpException,
      );
    });

    it('should still unlink account if token revocation fails', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      prismaService.linkedBankAccount.update.mockResolvedValue({
        ...mockLinkedAccount,
        status: 'REVOKED',
      });
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await service.unlinkAccount(mockAccountId);

      expect(prismaService.linkedBankAccount.update).toHaveBeenCalled();
    });
  });

  describe('syncAccount', () => {
    beforeEach(() => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      prismaService.transaction.findMany.mockResolvedValue([]);
      prismaService.transaction.createMany.mockResolvedValue({ count: 0 });
      encryptionService.decrypt.mockReturnValue(mockAccessToken);
    });

    it('should return error result for expired consent', async () => {
      const expiredAccount = {
        ...mockLinkedAccount,
        consentExpiresAt: new Date(Date.now() - 1000), // Expired
      };
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        expiredAccount,
      );

      const result = await service.syncAccount(mockAccountId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONSENT_EXPIRED');
      expect(prismaService.linkedBankAccount.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: { status: 'EXPIRED' },
      });
    });

    it('should fetch transactions and import new ones', async () => {
      const mockTransactions = [
        {
          id: 'txn-1',
          account_id: mockStitchAccountId,
          amount: -150.0,
          currency: 'ZAR',
          date: '2026-01-15',
          description: 'POS PURCHASE',
          reference: 'REF123',
          type: 'debit',
          status: 'posted',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ transactions: mockTransactions }),
      });

      const result = await service.syncAccount(mockAccountId);

      expect(result.success).toBe(true);
      expect(result.transactionsRetrieved).toBe(1);
    });

    it('should skip duplicate transactions', async () => {
      prismaService.transaction.findMany.mockResolvedValue([
        { reference: 'existing-txn-id' },
      ]);

      const mockTransactions = [
        {
          id: 'existing-txn-id',
          account_id: mockStitchAccountId,
          amount: -100.0,
          currency: 'ZAR',
          date: '2026-01-15',
          description: 'Old transaction',
          reference: 'REF123',
          type: 'debit',
          status: 'posted',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ transactions: mockTransactions }),
      });

      const result = await service.syncAccount(mockAccountId);

      expect(result.transactionsDuplicate).toBe(1);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'server_error' }),
      });

      const result = await service.syncAccount(mockAccountId);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it('should update error count on failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await service.syncAccount(mockAccountId);

      expect(prismaService.linkedBankAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            syncErrorCount: { increment: 1 },
          }),
        }),
      );
    });
  });

  describe('getTransactions', () => {
    it('should fetch and map transactions correctly', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      prismaService.transaction.findMany.mockResolvedValue([]);

      const mockApiTransactions = [
        {
          id: 'txn-1',
          account_id: mockStitchAccountId,
          amount: -250.5,
          currency: 'ZAR',
          date: '2026-01-15',
          description: 'WOOLWORTHS PURCHASE',
          reference: 'WW123456',
          type: 'debit',
          status: 'posted',
          counterparty: { name: 'Woolworths' },
          category: 'Shopping',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ transactions: mockApiTransactions }),
      });

      const from = new Date('2026-01-01');
      const to = new Date('2026-01-31');

      const result = await service.getTransactions(mockAccountId, from, to);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          externalId: 'txn-1',
          linkedBankAccountId: mockAccountId,
          tenantId: mockTenantId,
          amountCents: -25050, // -250.50 * 100
          description: 'WOOLWORTHS PURCHASE',
          reference: 'WW123456',
          type: 'debit',
          counterpartyName: 'Woolworths',
          bankCategory: 'Shopping',
          isDuplicate: false,
        }),
      );
    });

    it('should mark existing transactions as duplicates', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      prismaService.transaction.findMany.mockResolvedValue([
        { reference: 'existing-txn' },
      ]);

      const mockApiTransactions = [
        {
          id: 'existing-txn',
          account_id: mockStitchAccountId,
          amount: 100,
          currency: 'ZAR',
          date: '2026-01-15',
          description: 'Test',
          reference: 'REF',
          type: 'credit',
          status: 'posted',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ transactions: mockApiTransactions }),
      });

      const result = await service.getTransactions(
        mockAccountId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result[0].isDuplicate).toBe(true);
    });

    it('should throw if account not found', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.getTransactions('nonexistent-id', new Date(), new Date()),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getBalance', () => {
    it('should fetch and map balance correctly', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );

      const mockBalanceResponse = {
        current_balance: 12345.67,
        available_balance: 12000.0,
        currency: 'ZAR',
        as_of: '2026-01-20T08:00:00Z',
        overdraft_limit: 5000,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBalanceResponse),
      });

      const result = await service.getBalance(mockAccountId);

      expect(result).toEqual({
        accountId: mockStitchAccountId,
        currentBalanceCents: 1234567,
        availableBalanceCents: 1200000,
        currency: 'ZAR',
        asOf: expect.any(Date),
        overdraftLimitCents: 500000,
      });
    });

    it('should throw if account not found', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(null);

      await expect(service.getBalance('nonexistent-id')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('refreshAccountLink', () => {
    it('should exchange refresh token for new tokens', async () => {
      prismaService.linkedBankAccount.findUnique
        .mockResolvedValueOnce(mockLinkedAccount)
        .mockResolvedValueOnce({ ...mockLinkedAccount, id: mockAccountId }); // For sync event
      encryptionService.decrypt.mockReturnValue(mockRefreshToken);
      encryptionService.encrypt.mockReturnValue(mockEncryptedAccessToken);

      const mockTokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'accounts balances transactions',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse),
      });

      await service.refreshAccountLink(mockAccountId);

      expect(prismaService.linkedBankAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAccountId },
          data: expect.objectContaining({
            accessToken: expect.any(String),
            refreshToken: expect.any(String),
            tokenExpiresAt: expect.any(Date),
            status: 'ACTIVE',
            lastSyncError: null,
            syncErrorCount: 0,
          }),
        }),
      );
    });

    it('should mark account as revoked on invalid_grant error', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      encryptionService.decrypt.mockReturnValue(mockRefreshToken);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
      });

      await expect(service.refreshAccountLink(mockAccountId)).rejects.toThrow();

      expect(prismaService.linkedBankAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REVOKED',
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle network timeouts', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      await expect(service.getBalance(mockAccountId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle rate limiting', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'rate_limited' }),
      });

      await expect(service.getBalance(mockAccountId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should handle server errors', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'internal_error' }),
      });

      await expect(service.getBalance(mockAccountId)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('token expiry handling', () => {
    it('should refresh expired token before API call', async () => {
      const expiredTokenAccount = {
        ...mockLinkedAccount,
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
      };

      const refreshedAccount = {
        ...mockLinkedAccount,
        tokenExpiresAt: new Date(Date.now() + 3600000), // Valid
      };

      // First call returns expired token account to trigger refresh flow
      // Subsequent calls return refreshed account (for refreshAccountLink and post-refresh fetch)
      prismaService.linkedBankAccount.findUnique
        .mockResolvedValueOnce(expiredTokenAccount)
        .mockResolvedValue(refreshedAccount);

      const mockTokenResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'accounts balances transactions',
      };

      const mockBalanceResponse = {
        current_balance: 1000,
        available_balance: 1000,
        currency: 'ZAR',
        as_of: '2026-01-20T08:00:00Z',
      };

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockBalanceResponse),
        });

      await service.getBalance(mockAccountId);

      // Verify token refresh was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/token'),
        expect.any(Object),
      );
    });
  });

  describe('POPIA compliance', () => {
    it('should log audit events for successful sync', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );
      prismaService.transaction.findMany.mockResolvedValue([]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ transactions: [] }),
      });

      await service.syncAccount(mockAccountId);

      expect(prismaService.linkedBankSyncEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            linkedBankAccountId: mockAccountId,
            syncType: expect.any(String),
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('should log audit events for failed sync', async () => {
      prismaService.linkedBankAccount.findUnique.mockResolvedValue(
        mockLinkedAccount,
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'server_error' }),
      });

      await service.syncAccount(mockAccountId);

      expect(prismaService.linkedBankSyncEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: expect.any(String),
          }),
        }),
      );
    });
  });
});
