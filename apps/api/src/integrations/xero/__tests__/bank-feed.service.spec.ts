/**
 * BankFeedService Tests
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 *
 * Unit tests for bank feed connection, sync, and webhook handling.
 */

// Set required environment variables before importing modules
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-32-chars-min';
process.env.XERO_CLIENT_ID = 'test-client-id';
process.env.XERO_CLIENT_SECRET = 'test-client-secret';
process.env.XERO_REDIRECT_URI = 'http://localhost:3000/callback';

import { Test, TestingModule } from '@nestjs/testing';
import { BankFeedService } from '../bank-feed.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TransactionRepository } from '../../../database/repositories/transaction.repository';
import { AuditLogService } from '../../../database/services/audit-log.service';
import {
  NotFoundException,
  BusinessException,
  ConflictException,
} from '../../../shared/exceptions';
import { BankConnectionStatus } from '@prisma/client';

describe('BankFeedService', () => {
  let service: BankFeedService;
  let mockPrisma: any;
  let mockTransactionRepo: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-123';
  const xeroAccountId = 'xero-account-456';
  const connectionId = 'conn-789';

  beforeEach(async () => {
    mockPrisma = {
      bankConnection: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      xeroToken: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockTransactionRepo = {
      findByXeroId: jest.fn(),
      create: jest.fn(),
    };

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankFeedService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TransactionRepository, useValue: mockTransactionRepo },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<BankFeedService>(BankFeedService);
  });

  describe('connectBankAccount', () => {
    it('should throw ConflictException if account already connected and active', async () => {
      mockPrisma.bankConnection.findUnique.mockResolvedValue({
        id: connectionId,
        tenantId,
        xeroAccountId,
        status: BankConnectionStatus.ACTIVE,
        accountName: 'Test Account',
      });

      await expect(
        service.connectBankAccount(tenantId, xeroAccountId),
      ).rejects.toThrow(ConflictException);
    });

    it('should reactivate disconnected connection', async () => {
      const disconnectedConnection = {
        id: connectionId,
        tenantId,
        xeroAccountId,
        status: BankConnectionStatus.DISCONNECTED,
        accountName: 'Test Account',
        accountNumber: '123456',
        bankName: 'Test Bank',
        connectedAt: new Date(),
        lastSyncAt: null,
        errorMessage: null,
      };

      mockPrisma.bankConnection.findUnique.mockResolvedValue(
        disconnectedConnection,
      );
      mockPrisma.bankConnection.update.mockResolvedValue({
        ...disconnectedConnection,
        status: BankConnectionStatus.ACTIVE,
      });

      const result = await service.connectBankAccount(tenantId, xeroAccountId);

      expect(result.status).toBe('active');
      expect(mockPrisma.bankConnection.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: expect.objectContaining({
          status: BankConnectionStatus.ACTIVE,
          errorMessage: null,
        }),
      });
    });

    it('should require valid Xero connection', async () => {
      mockPrisma.bankConnection.findUnique.mockResolvedValue(null);
      mockPrisma.xeroToken.findUnique.mockResolvedValue(null);

      await expect(
        service.connectBankAccount(tenantId, xeroAccountId),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('disconnectBankAccount', () => {
    it('should set connection status to DISCONNECTED', async () => {
      const activeConnection = {
        id: connectionId,
        tenantId,
        xeroAccountId,
        status: BankConnectionStatus.ACTIVE,
        accountName: 'Test Account',
      };

      mockPrisma.bankConnection.findFirst.mockResolvedValue(activeConnection);
      mockPrisma.bankConnection.update.mockResolvedValue({
        ...activeConnection,
        status: BankConnectionStatus.DISCONNECTED,
      });

      await service.disconnectBankAccount(tenantId, connectionId);

      expect(mockPrisma.bankConnection.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: {
          status: BankConnectionStatus.DISCONNECTED,
          errorMessage: null,
        },
      });
    });

    it('should throw NotFoundException if connection not found', async () => {
      mockPrisma.bankConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.disconnectBankAccount(tenantId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit trail for disconnection', async () => {
      const activeConnection = {
        id: connectionId,
        tenantId,
        xeroAccountId,
        status: BankConnectionStatus.ACTIVE,
        accountName: 'Test Account',
      };

      mockPrisma.bankConnection.findFirst.mockResolvedValue(activeConnection);
      mockPrisma.bankConnection.update.mockResolvedValue({});

      await service.disconnectBankAccount(tenantId, connectionId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'BankConnection',
          entityId: connectionId,
          action: 'UPDATE',
        }),
      );
    });
  });

  describe('getConnectedAccounts', () => {
    it('should return all connections for tenant', async () => {
      const connections = [
        {
          id: 'conn-1',
          tenantId,
          xeroAccountId: 'xero-1',
          accountName: 'Account 1',
          accountNumber: '111',
          bankName: 'Bank 1',
          status: BankConnectionStatus.ACTIVE,
          connectedAt: new Date(),
          lastSyncAt: null,
          errorMessage: null,
        },
        {
          id: 'conn-2',
          tenantId,
          xeroAccountId: 'xero-2',
          accountName: 'Account 2',
          accountNumber: '222',
          bankName: 'Bank 2',
          status: BankConnectionStatus.DISCONNECTED,
          connectedAt: new Date(),
          lastSyncAt: null,
          errorMessage: null,
        },
      ];

      mockPrisma.bankConnection.findMany.mockResolvedValue(connections);

      const result = await service.getConnectedAccounts(tenantId);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('active');
      expect(result[1].status).toBe('disconnected');
    });

    it('should return empty array if no connections', async () => {
      mockPrisma.bankConnection.findMany.mockResolvedValue([]);

      const result = await service.getConnectedAccounts(tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('getActiveConnections', () => {
    it('should only return active connections', async () => {
      const connections = [
        {
          id: 'conn-1',
          tenantId,
          xeroAccountId: 'xero-1',
          accountName: 'Active Account',
          accountNumber: '111',
          bankName: 'Bank 1',
          status: BankConnectionStatus.ACTIVE,
          connectedAt: new Date(),
          lastSyncAt: null,
          errorMessage: null,
        },
      ];

      mockPrisma.bankConnection.findMany.mockResolvedValue(connections);

      const result = await service.getActiveConnections(tenantId);

      expect(mockPrisma.bankConnection.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          status: BankConnectionStatus.ACTIVE,
        },
        orderBy: { connectedAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getConnectionById', () => {
    it('should return connection by ID', async () => {
      const connection = {
        id: connectionId,
        tenantId,
        xeroAccountId,
        accountName: 'Test Account',
        accountNumber: '123',
        bankName: 'Test Bank',
        status: BankConnectionStatus.ACTIVE,
        connectedAt: new Date(),
        lastSyncAt: null,
        errorMessage: null,
      };

      mockPrisma.bankConnection.findFirst.mockResolvedValue(connection);

      const result = await service.getConnectionById(tenantId, connectionId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(connectionId);
    });

    it('should return null if connection not found', async () => {
      mockPrisma.bankConnection.findFirst.mockResolvedValue(null);

      const result = await service.getConnectionById(tenantId, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('syncTransactions', () => {
    it('should return empty result if no active connections', async () => {
      mockPrisma.bankConnection.findMany.mockResolvedValue([]);

      const result = await service.syncTransactions(tenantId);

      expect(result.transactionsFound).toBe(0);
      expect(result.transactionsCreated).toBe(0);
      expect(result.duplicatesSkipped).toBe(0);
    });

    it('should require valid Xero connection', async () => {
      const activeConnection = {
        id: connectionId,
        tenantId,
        xeroAccountId,
        status: BankConnectionStatus.ACTIVE,
        accountName: 'Test Account',
      };

      mockPrisma.bankConnection.findMany.mockResolvedValue([activeConnection]);
      mockPrisma.xeroToken.findUnique.mockResolvedValue(null);

      await expect(service.syncTransactions(tenantId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should accept sync options', async () => {
      mockPrisma.bankConnection.findMany.mockResolvedValue([]);

      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-01-31');

      const result = await service.syncTransactions(tenantId, {
        fromDate,
        toDate,
        connectionId: 'specific-conn',
        forceFullSync: true,
      });

      expect(result.connectionId).toBe('specific-conn');
    });
  });

  describe('verifyWebhookSignature', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should fail if XERO_WEBHOOK_KEY not configured', () => {
      delete process.env.XERO_WEBHOOK_KEY;

      const result = service.verifyWebhookSignature(
        {
          events: [],
          firstEventSequence: 0,
          lastEventSequence: 0,
          entropy: '',
        },
        'some-signature',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('XERO_WEBHOOK_KEY not configured');
    });

    it('should fail for invalid signature', () => {
      process.env.XERO_WEBHOOK_KEY = 'test-key';

      const result = service.verifyWebhookSignature(
        {
          events: [],
          firstEventSequence: 0,
          lastEventSequence: 0,
          entropy: 'test',
        },
        'invalid-signature',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Signature mismatch');
    });
  });

  describe('handleWebhook', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should throw BusinessException for invalid signature', async () => {
      delete process.env.XERO_WEBHOOK_KEY;

      await expect(
        service.handleWebhook(
          {
            events: [],
            firstEventSequence: 0,
            lastEventSequence: 0,
            entropy: '',
          },
          'invalid-signature',
        ),
      ).rejects.toThrow(BusinessException);
    });
  });
});
