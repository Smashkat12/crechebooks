/**
 * XeroAccountRepository Tests
 * TASK-XERO-006: Chart of Accounts Database Sync
 */

import { Test, TestingModule } from '@nestjs/testing';
import { XeroAccountStatus } from '@prisma/client';
import { XeroAccountRepository } from '../../../src/database/repositories/xero-account.repository';
import { PrismaService } from '../../../src/database/prisma/prisma.service';

// Define mock types for Prisma xeroAccount methods
interface MockXeroAccountMethods {
  create: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
}

interface MockPrismaService {
  xeroAccount: MockXeroAccountMethods;
}

describe('XeroAccountRepository', () => {
  let repository: XeroAccountRepository;
  let prismaService: MockPrismaService;

  const mockTenantId = 'test-tenant-id';
  const mockAccountId = 'test-account-id';

  const mockXeroAccount = {
    id: mockAccountId,
    tenantId: mockTenantId,
    accountCode: '200',
    name: 'Sales Revenue',
    type: 'REVENUE',
    taxType: 'OUTPUT',
    status: XeroAccountStatus.ACTIVE,
    xeroAccountId: 'xero-uuid-123',
    lastSyncedAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrismaService: MockPrismaService = {
      xeroAccount: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroAccountRepository,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    repository = module.get<XeroAccountRepository>(XeroAccountRepository);
    prismaService = module.get(PrismaService);
  });

  describe('create', () => {
    it('should create a new Xero account record', async () => {
      prismaService.xeroAccount.create.mockResolvedValue(mockXeroAccount);

      const result = await repository.create({
        tenantId: mockTenantId,
        accountCode: '200',
        name: 'Sales Revenue',
        type: 'REVENUE',
        taxType: 'OUTPUT',
        xeroAccountId: 'xero-uuid-123',
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: mockAccountId,
          accountCode: '200',
          name: 'Sales Revenue',
          status: XeroAccountStatus.ACTIVE,
        }),
      );

      expect(prismaService.xeroAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockTenantId,
          accountCode: '200',
          name: 'Sales Revenue',
          type: 'REVENUE',
        }),
      });
    });
  });

  describe('findByCode', () => {
    it('should find account by code', async () => {
      prismaService.xeroAccount.findUnique.mockResolvedValue(mockXeroAccount);

      const result = await repository.findByCode(mockTenantId, '200');

      expect(result).toEqual(
        expect.objectContaining({
          accountCode: '200',
          name: 'Sales Revenue',
        }),
      );

      expect(prismaService.xeroAccount.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_accountCode: { tenantId: mockTenantId, accountCode: '200' },
        },
      });
    });

    it('should return null when account not found', async () => {
      prismaService.xeroAccount.findUnique.mockResolvedValue(null);

      const result = await repository.findByCode(mockTenantId, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find account by ID', async () => {
      prismaService.xeroAccount.findFirst.mockResolvedValue(mockXeroAccount);

      const result = await repository.findById(mockTenantId, mockAccountId);

      expect(result).toEqual(
        expect.objectContaining({
          id: mockAccountId,
        }),
      );
    });
  });

  describe('findByTenant', () => {
    it('should find all accounts for tenant', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);
      prismaService.xeroAccount.count.mockResolvedValue(1);

      const result = await repository.findByTenant(mockTenantId);

      expect(result.accounts).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should apply status filter', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);
      prismaService.xeroAccount.count.mockResolvedValue(1);

      await repository.findByTenant(mockTenantId, {
        status: XeroAccountStatus.ACTIVE,
      });

      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: XeroAccountStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should apply type filter', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);
      prismaService.xeroAccount.count.mockResolvedValue(1);

      await repository.findByTenant(mockTenantId, { type: 'REVENUE' });

      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'REVENUE',
          }),
        }),
      );
    });

    it('should apply code prefix filter', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);
      prismaService.xeroAccount.count.mockResolvedValue(1);

      await repository.findByTenant(mockTenantId, { codePrefix: '2' });

      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountCode: { startsWith: '2' },
          }),
        }),
      );
    });

    it('should apply name search filter', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);
      prismaService.xeroAccount.count.mockResolvedValue(1);

      await repository.findByTenant(mockTenantId, { nameSearch: 'Sales' });

      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'Sales', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should apply pagination', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);
      prismaService.xeroAccount.count.mockResolvedValue(10);

      await repository.findByTenant(mockTenantId, { limit: 5, offset: 10 });

      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          skip: 10,
        }),
      );
    });
  });

  describe('findActiveByTenant', () => {
    it('should find only active accounts', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);

      const result = await repository.findActiveByTenant(mockTenantId);

      expect(result).toHaveLength(1);
      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          status: XeroAccountStatus.ACTIVE,
        },
        orderBy: { accountCode: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('should update account', async () => {
      prismaService.xeroAccount.update.mockResolvedValue({
        ...mockXeroAccount,
        name: 'Updated Sales Revenue',
      });

      const result = await repository.update(mockTenantId, mockAccountId, {
        name: 'Updated Sales Revenue',
      });

      expect(result.name).toBe('Updated Sales Revenue');
    });
  });

  describe('upsert', () => {
    it('should create new account when not exists', async () => {
      prismaService.xeroAccount.findUnique.mockResolvedValue(null);
      prismaService.xeroAccount.create.mockResolvedValue(mockXeroAccount);

      const result = await repository.upsert({
        tenantId: mockTenantId,
        accountCode: '200',
        name: 'Sales Revenue',
        type: 'REVENUE',
      });

      expect(result.isNew).toBe(true);
      expect(result.account.accountCode).toBe('200');
    });

    it('should update existing account', async () => {
      prismaService.xeroAccount.findUnique.mockResolvedValue(mockXeroAccount);
      prismaService.xeroAccount.update.mockResolvedValue({
        ...mockXeroAccount,
        name: 'Updated Name',
      });

      const result = await repository.upsert({
        tenantId: mockTenantId,
        accountCode: '200',
        name: 'Updated Name',
        type: 'REVENUE',
      });

      expect(result.isNew).toBe(false);
      expect(result.account.name).toBe('Updated Name');
    });
  });

  describe('archive', () => {
    it('should archive account', async () => {
      prismaService.xeroAccount.update.mockResolvedValue({
        ...mockXeroAccount,
        status: XeroAccountStatus.ARCHIVED,
      });

      const result = await repository.archive(mockTenantId, mockAccountId);

      expect(result.status).toBe(XeroAccountStatus.ARCHIVED);
      expect(prismaService.xeroAccount.update).toHaveBeenCalledWith({
        where: { id: mockAccountId },
        data: expect.objectContaining({
          status: XeroAccountStatus.ARCHIVED,
        }),
      });
    });
  });

  describe('archiveNotInCodes', () => {
    it('should archive accounts not in active codes list', async () => {
      prismaService.xeroAccount.updateMany.mockResolvedValue({ count: 3 });

      const result = await repository.archiveNotInCodes(mockTenantId, [
        '200',
        '300',
        '400',
      ]);

      expect(result).toBe(3);
      expect(prismaService.xeroAccount.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          accountCode: { notIn: ['200', '300', '400'] },
          status: XeroAccountStatus.ACTIVE,
        },
        data: expect.objectContaining({
          status: XeroAccountStatus.ARCHIVED,
        }),
      });
    });

    it('should return 0 when empty codes list', async () => {
      const result = await repository.archiveNotInCodes(mockTenantId, []);

      expect(result).toBe(0);
      expect(prismaService.xeroAccount.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('validateAccountCode', () => {
    it('should return valid for active account', async () => {
      prismaService.xeroAccount.findUnique.mockResolvedValue(mockXeroAccount);

      const result = await repository.validateAccountCode(mockTenantId, '200');

      expect(result.isValid).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for non-existent account', async () => {
      prismaService.xeroAccount.findUnique.mockResolvedValue(null);
      prismaService.xeroAccount.findMany.mockResolvedValue([]);

      const result = await repository.validateAccountCode(
        mockTenantId,
        'nonexistent',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return invalid for archived account with suggestions', async () => {
      const archivedAccount = {
        ...mockXeroAccount,
        status: XeroAccountStatus.ARCHIVED,
      };
      prismaService.xeroAccount.findUnique.mockResolvedValue(archivedAccount);
      prismaService.xeroAccount.findMany.mockResolvedValue([
        { ...mockXeroAccount, accountCode: '201', name: 'Other Revenue' },
      ]);

      const result = await repository.validateAccountCode(mockTenantId, '200');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('archived');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toHaveLength(1);
    });
  });

  describe('getLastSyncTime', () => {
    it('should return last sync time', async () => {
      const lastSyncTime = new Date('2024-01-15T10:00:00Z');
      prismaService.xeroAccount.findFirst.mockResolvedValue({
        lastSyncedAt: lastSyncTime,
      } as any);

      const result = await repository.getLastSyncTime(mockTenantId);

      expect(result).toEqual(lastSyncTime);
    });

    it('should return null when no accounts', async () => {
      prismaService.xeroAccount.findFirst.mockResolvedValue(null);

      const result = await repository.getLastSyncTime(mockTenantId);

      expect(result).toBeNull();
    });
  });

  describe('countByStatus', () => {
    it('should return counts by status', async () => {
      prismaService.xeroAccount.count
        .mockResolvedValueOnce(10) // active
        .mockResolvedValueOnce(3); // archived

      const result = await repository.countByStatus(mockTenantId);

      expect(result).toEqual({ active: 10, archived: 3 });
    });
  });

  describe('findByType', () => {
    it('should find accounts by type', async () => {
      prismaService.xeroAccount.findMany.mockResolvedValue([mockXeroAccount]);

      const result = await repository.findByType(mockTenantId, 'REVENUE');

      expect(result).toHaveLength(1);
      expect(prismaService.xeroAccount.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          type: 'REVENUE',
          status: XeroAccountStatus.ACTIVE,
        },
        orderBy: { accountCode: 'asc' },
      });
    });
  });
});
