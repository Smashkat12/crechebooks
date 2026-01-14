/**
 * Xero Accounts Controller Tests
 * TASK-XERO-006: Chart of Accounts Database Sync
 */

import { Test, TestingModule } from '@nestjs/testing';
import { XeroAccountStatus } from '@prisma/client';
import { XeroController } from '../../../src/integrations/xero/xero.controller';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BankFeedService } from '../../../src/integrations/xero/bank-feed.service';
import { XeroSyncGateway } from '../../../src/integrations/xero/xero.gateway';
import { TokenManager } from '../../../src/mcp/xero-mcp/auth/token-manager';
import type { IUser } from '../../../src/database/entities/user.entity';
import { BusinessException } from '../../../src/shared/exceptions';

// Mock TokenManager
jest.mock('../../../src/mcp/xero-mcp/auth/token-manager');

describe('XeroController - Chart of Accounts', () => {
  let controller: XeroController;
  let xeroSyncService: jest.Mocked<XeroSyncService>;
  let prismaService: jest.Mocked<PrismaService>;
  let mockTokenManager: jest.Mocked<TokenManager>;

  const mockUser: IUser = {
    id: 'user-123',
    tenantId: 'tenant-123',
    auth0Id: 'auth0|123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'ADMIN',
    isActive: true,
    lastLoginAt: null,
    currentTenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSyncResult = {
    accountsFetched: 50,
    accountsCreated: 10,
    accountsUpdated: 35,
    accountsArchived: 5,
    errors: [],
    syncedAt: new Date(),
  };

  const mockAccounts = [
    {
      id: 'acc-1',
      accountCode: '200',
      name: 'Sales Revenue',
      type: 'REVENUE',
      taxType: 'OUTPUT',
      status: XeroAccountStatus.ACTIVE,
    },
    {
      id: 'acc-2',
      accountCode: '400',
      name: 'Cost of Sales',
      type: 'DIRECTCOSTS',
      taxType: 'INPUT',
      status: XeroAccountStatus.ACTIVE,
    },
  ];

  beforeEach(async () => {
    // Create mock implementations
    mockTokenManager = {
      hasValidConnection: jest.fn(),
      getAccessToken: jest.fn(),
      getXeroTenantId: jest.fn(),
      storeTokens: jest.fn(),
      removeTokens: jest.fn(),
    } as any;

    (TokenManager as jest.Mock).mockImplementation(() => mockTokenManager);

    const mockXeroSyncService = {
      syncChartOfAccountsToDb: jest.fn(),
      getSyncedAccounts: jest.fn(),
      validateAccountCode: jest.fn(),
    };

    const mockPrismaService = {
      xeroOAuthState: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      bankConnection: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      xeroToken: {
        findUnique: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
    };

    const mockBankFeedService = {
      syncTransactions: jest.fn(),
      syncUnreconciledStatements: jest.fn(),
    };

    const mockSyncGateway = {
      emitProgress: jest.fn(),
      emitComplete: jest.fn(),
      emitError: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [XeroController],
      providers: [
        {
          provide: XeroSyncService,
          useValue: mockXeroSyncService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: BankFeedService,
          useValue: mockBankFeedService,
        },
        {
          provide: XeroSyncGateway,
          useValue: mockSyncGateway,
        },
      ],
    }).compile();

    controller = module.get<XeroController>(XeroController);
    xeroSyncService = module.get(XeroSyncService);
    prismaService = module.get(PrismaService);
  });

  describe('POST /xero/sync-accounts', () => {
    it('should sync accounts from Xero', async () => {
      mockTokenManager.hasValidConnection.mockResolvedValue(true);
      xeroSyncService.syncChartOfAccountsToDb.mockResolvedValue(mockSyncResult);

      const result = await controller.syncAccounts({}, mockUser);

      expect(result.accountsFetched).toBe(50);
      expect(result.accountsCreated).toBe(10);
      expect(result.accountsUpdated).toBe(35);
      expect(result.accountsArchived).toBe(5);
      expect(result.errors).toEqual([]);
      expect(xeroSyncService.syncChartOfAccountsToDb).toHaveBeenCalledWith(
        mockUser.tenantId,
        false,
      );
    });

    it('should force sync when requested', async () => {
      mockTokenManager.hasValidConnection.mockResolvedValue(true);
      xeroSyncService.syncChartOfAccountsToDb.mockResolvedValue(mockSyncResult);

      await controller.syncAccounts({ forceSync: true }, mockUser);

      expect(xeroSyncService.syncChartOfAccountsToDb).toHaveBeenCalledWith(
        mockUser.tenantId,
        true,
      );
    });

    it('should throw error when not connected to Xero', async () => {
      mockTokenManager.hasValidConnection.mockResolvedValue(false);

      await expect(controller.syncAccounts({}, mockUser)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('GET /xero/accounts', () => {
    it('should list synced accounts', async () => {
      xeroSyncService.getSyncedAccounts.mockResolvedValue({
        accounts: mockAccounts,
        total: 2,
        lastSyncedAt: new Date(),
      });

      const result = await controller.getAccounts({}, mockUser);

      expect(result.accounts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.accounts[0].accountCode).toBe('200');
    });

    it('should apply filters', async () => {
      xeroSyncService.getSyncedAccounts.mockResolvedValue({
        accounts: [mockAccounts[0]],
        total: 1,
        lastSyncedAt: new Date(),
      });

      await controller.getAccounts(
        {
          status: XeroAccountStatus.ACTIVE,
          type: 'REVENUE',
          codePrefix: '2',
          limit: 10,
          offset: 0,
        },
        mockUser,
      );

      expect(xeroSyncService.getSyncedAccounts).toHaveBeenCalledWith(
        mockUser.tenantId,
        {
          status: XeroAccountStatus.ACTIVE,
          type: 'REVENUE',
          codePrefix: '2',
          nameSearch: undefined,
          limit: 10,
          offset: 0,
        },
      );
    });
  });

  describe('GET /xero/validate-account/:code', () => {
    it('should validate active account code', async () => {
      xeroSyncService.validateAccountCode.mockResolvedValue({
        isValid: true,
        account: {
          id: 'acc-1',
          tenantId: mockUser.tenantId,
          accountCode: '200',
          name: 'Sales Revenue',
          type: 'REVENUE',
          taxType: 'OUTPUT',
          status: XeroAccountStatus.ACTIVE,
          xeroAccountId: 'xero-123',
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const result = await controller.validateAccountCode('200', mockUser);

      expect(result.isValid).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account?.accountCode).toBe('200');
    });

    it('should return invalid for non-existent account', async () => {
      xeroSyncService.validateAccountCode.mockResolvedValue({
        isValid: false,
        error: "Account code 'nonexistent' not found",
        suggestions: ['200: Sales Revenue', '201: Other Revenue'],
      });

      const result = await controller.validateAccountCode(
        'nonexistent',
        mockUser,
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.suggestions).toHaveLength(2);
    });

    it('should return invalid for archived account', async () => {
      xeroSyncService.validateAccountCode.mockResolvedValue({
        isValid: false,
        account: {
          id: 'acc-1',
          tenantId: mockUser.tenantId,
          accountCode: '200',
          name: 'Sales Revenue',
          type: 'REVENUE',
          taxType: null,
          status: XeroAccountStatus.ARCHIVED,
          xeroAccountId: null,
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        error: "Account code '200' is archived",
        suggestions: ['201: Other Revenue'],
      });

      const result = await controller.validateAccountCode('200', mockUser);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('archived');
      expect(result.account).toBeDefined();
    });

    it('should handle empty code', async () => {
      const result = await controller.validateAccountCode('', mockUser);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Account code is required');
    });
  });
});
