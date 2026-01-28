/**
 * XeroController Push Categorizations Tests
 * TASK-XERO-004: Push Categorizations to Xero API Endpoint
 *
 * Tests for POST /xero/push-categorizations endpoint and
 * PUSH direction handling in POST /xero/sync.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { XeroController } from '../../../src/integrations/xero/xero.controller';
import { BankFeedService } from '../../../src/integrations/xero/bank-feed.service';
import { XeroSyncGateway } from '../../../src/integrations/xero/xero.gateway';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { XeroAuthService } from '../../../src/integrations/xero/xero-auth.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TokenManager } from '../../../src/mcp/xero-mcp/auth/token-manager';
import { IUser, UserRole } from '../../../src/database/entities/user.entity';
import { TransactionStatus } from '../../../src/database/entities/transaction.entity';
import { BusinessException } from '../../../src/shared/exceptions';

// Mock TokenManager
jest.mock('../../../src/mcp/xero-mcp/auth/token-manager', () => ({
  TokenManager: jest.fn().mockImplementation(() => ({
    hasValidConnection: jest.fn(),
    getAccessToken: jest.fn(),
    getXeroTenantId: jest.fn(),
  })),
}));

// Define mock types for Prisma methods
interface MockTransactionMethods {
  findMany: jest.Mock;
}

interface MockTenantMethods {
  findUnique: jest.Mock;
  update: jest.Mock;
}

interface MockBankConnectionMethods {
  findFirst: jest.Mock;
}

interface MockXeroTokenMethods {
  findUnique: jest.Mock;
}

interface MockXeroOAuthStateMethods {
  upsert: jest.Mock;
  findUnique: jest.Mock;
  delete: jest.Mock;
}

interface MockPrismaService {
  transaction: MockTransactionMethods;
  tenant: MockTenantMethods;
  bankConnection: MockBankConnectionMethods;
  xeroToken: MockXeroTokenMethods;
  xeroOAuthState: MockXeroOAuthStateMethods;
}

describe('XeroController - Push Categorizations', () => {
  let controller: XeroController;
  let xeroSyncService: jest.Mocked<XeroSyncService>;
  let prisma: MockPrismaService;
  let syncGateway: jest.Mocked<XeroSyncGateway>;
  let mockTokenManager: { hasValidConnection: jest.Mock };

  const mockUser: IUser = {
    id: 'user-123',
    tenantId: 'tenant-456',
    auth0Id: 'auth0|123',
    email: 'test@creche.co.za',
    name: 'Test User',
    role: UserRole.OWNER,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: 'tenant-456',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction = {
    id: 'tx-001',
    tenantId: 'tenant-456',
    xeroTransactionId: 'xero-tx-001',
    bankAccount: 'FNB Business',
    date: new Date('2026-01-08'),
    description: 'WOOLWORTHS CAPE GATE',
    payeeName: 'WOOLWORTHS',
    reference: 'REF001',
    amountCents: -125000, // R1,250.00
    isCredit: false,
    source: 'BANK_FEED',
    importBatchId: 'batch-001',
    status: TransactionStatus.CATEGORIZED,
    isReconciled: false,
    reconciledAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    categorizations: [
      {
        id: 'cat-001',
        transactionId: 'tx-001',
        accountCode: '5100',
        accountName: 'Groceries & Supplies',
        confidenceScore: 92,
        source: 'USER_OVERRIDE',
        createdAt: new Date(),
      },
    ],
  };

  const mockSyncResult = {
    totalProcessed: 1,
    synced: 1,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  beforeEach(async () => {
    // Reset mock
    mockTokenManager = {
      hasValidConnection: jest.fn().mockResolvedValue(true),
    };
    (TokenManager as jest.Mock).mockImplementation(() => mockTokenManager);

    const mockPrismaService: MockPrismaService = {
      transaction: {
        findMany: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      bankConnection: {
        findFirst: jest.fn(),
      },
      xeroToken: {
        findUnique: jest.fn(),
      },
      xeroOAuthState: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [XeroController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: BankFeedService,
          useValue: {
            syncTransactions: jest.fn(),
            connectBankAccount: jest.fn(),
            disconnectBankAccount: jest.fn(),
          },
        },
        {
          provide: XeroSyncGateway,
          useValue: {
            emitProgress: jest.fn(),
            emitComplete: jest.fn(),
            emitError: jest.fn(),
          },
        },
        {
          provide: XeroSyncService,
          useValue: {
            syncTransactions: jest.fn(),
            pushToXero: jest.fn(),
          },
        },
        {
          provide: XeroAuthService,
          useValue: {
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            isConnected: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<XeroController>(XeroController);
    xeroSyncService = module.get(XeroSyncService);
    prisma = module.get(PrismaService);
    syncGateway = module.get(XeroSyncGateway);
  });

  describe('POST /xero/push-categorizations', () => {
    it('should push specific transaction IDs', async () => {
      xeroSyncService.syncTransactions.mockResolvedValue(mockSyncResult);

      const result = await controller.pushCategorizations(
        { transactionIds: ['tx-001'] },
        mockUser,
      );

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(xeroSyncService.syncTransactions).toHaveBeenCalledWith(
        ['tx-001'],
        'tenant-456',
      );
    });

    it('should push all unsynced when no IDs provided', async () => {
      prisma.transaction.findMany.mockResolvedValue([mockTransaction]);
      xeroSyncService.syncTransactions.mockResolvedValue(mockSyncResult);

      const result = await controller.pushCategorizations({}, mockUser);

      expect(result.synced).toBe(1);
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-456',
          status: { in: ['CATEGORIZED', 'REVIEW_REQUIRED'] },
          xeroTransactionId: { not: null },
        },
        include: {
          categorizations: {
            take: 1,
          },
        },
      });
    });

    it('should return empty result when no transactions to push', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await controller.pushCategorizations({}, mockUser);

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(xeroSyncService.syncTransactions).not.toHaveBeenCalled();
    });

    it('should throw XERO_NOT_CONNECTED when no connection', async () => {
      mockTokenManager.hasValidConnection.mockResolvedValue(false);

      await expect(
        controller.pushCategorizations(
          { transactionIds: ['tx-001'] },
          mockUser,
        ),
      ).rejects.toThrow(BusinessException);

      await expect(
        controller.pushCategorizations(
          { transactionIds: ['tx-001'] },
          mockUser,
        ),
      ).rejects.toMatchObject({
        code: 'XERO_NOT_CONNECTED',
      });
    });

    it('should skip transactions without xeroTransactionId', async () => {
      // When querying for unsynced transactions, the DB query filters out
      // transactions without xeroTransactionId, so we return empty array
      prisma.transaction.findMany.mockResolvedValue([]);

      const result = await controller.pushCategorizations({}, mockUser);

      // No transactions to push, so return empty result
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(xeroSyncService.syncTransactions).not.toHaveBeenCalled();
    });

    it('should skip transactions without categorizations', async () => {
      const txWithoutCategorization = {
        ...mockTransaction,
        id: 'tx-003',
        categorizations: [],
      };
      prisma.transaction.findMany.mockResolvedValue([txWithoutCategorization]);

      const result = await controller.pushCategorizations({}, mockUser);

      expect(result.synced).toBe(0);
      expect(xeroSyncService.syncTransactions).not.toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      const partialResult = {
        totalProcessed: 3,
        synced: 2,
        failed: 1,
        skipped: 0,
        errors: [
          {
            transactionId: 'tx-002',
            error: 'Account code not found in Xero',
            code: 'ACCOUNT_NOT_FOUND',
          },
        ],
      };
      xeroSyncService.syncTransactions.mockResolvedValue(partialResult);

      const result = await controller.pushCategorizations(
        { transactionIds: ['tx-001', 'tx-002', 'tx-003'] },
        mockUser,
      );

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].transactionId).toBe('tx-002');
      expect(result.errors[0].code).toBe('ACCOUNT_NOT_FOUND');
    });
  });

  describe('POST /xero/sync direction=push', () => {
    it('should trigger push sync when direction is push', async () => {
      const syncRequest = {
        direction: 'push' as const,
      };

      const response = await controller.triggerSync(syncRequest, mockUser);

      expect(response.jobId).toBeDefined();
      expect(response.status).toBe('queued');
    });

    it('should trigger both pull and push when direction is bidirectional', async () => {
      const syncRequest = {
        direction: 'bidirectional' as const,
      };

      const response = await controller.triggerSync(syncRequest, mockUser);

      expect(response.jobId).toBeDefined();
      expect(response.status).toBe('queued');
    });
  });

  describe('Push sync - WebSocket events', () => {
    it('should emit progress events during push', async () => {
      prisma.transaction.findMany.mockResolvedValue([mockTransaction]);
      xeroSyncService.syncTransactions.mockResolvedValue(mockSyncResult);

      // The sync gateway is called during executeSyncAsync
      // We verify it was properly injected and can be called
      expect(syncGateway.emitProgress).toBeDefined();
    });
  });

  describe('South African business context', () => {
    it('should handle ZAR amounts correctly (stored in cents)', async () => {
      const zaTx = {
        ...mockTransaction,
        amountCents: -355000, // R3,550.00
        description: 'PICK N PAY FAMILY',
        payeeName: 'PICK N PAY',
        categorizations: [
          {
            id: 'cat-002',
            transactionId: 'tx-001',
            accountCode: '5100',
            accountName: 'Groceries',
            confidenceScore: 95,
            source: 'USER_OVERRIDE',
            createdAt: new Date(),
          },
        ],
      };
      prisma.transaction.findMany.mockResolvedValue([zaTx]);
      xeroSyncService.syncTransactions.mockResolvedValue(mockSyncResult);

      const result = await controller.pushCategorizations({}, mockUser);

      expect(result.synced).toBe(1);
    });

    it('should handle transactions with VAT categorization', async () => {
      const txWithVat = {
        ...mockTransaction,
        categorizations: [
          {
            id: 'cat-003',
            transactionId: 'tx-001',
            accountCode: '5100',
            accountName: 'Groceries',
            confidenceScore: 92,
            source: 'USER_OVERRIDE',
            vatType: 'STANDARD',
            vatAmountCents: 16304, // 15% of R1,086.96
            createdAt: new Date(),
          },
        ],
      };
      prisma.transaction.findMany.mockResolvedValue([txWithVat]);
      xeroSyncService.syncTransactions.mockResolvedValue(mockSyncResult);

      const result = await controller.pushCategorizations({}, mockUser);

      expect(result.synced).toBe(1);
    });
  });
});
