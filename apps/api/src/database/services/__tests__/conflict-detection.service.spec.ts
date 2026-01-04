/**
 * ConflictDetectionService Unit Tests
 * TASK-XERO-001
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictDetectionService } from '../conflict-detection.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictType } from '../../entities/sync-conflict.entity';

describe('ConflictDetectionService', () => {
  let service: ConflictDetectionService;
  let prisma: PrismaService;

  const mockPrismaService = {
    syncConflict: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictDetectionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ConflictDetectionService>(ConflictDetectionService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectConflicts', () => {
    const tenantId = 'tenant-123';
    const entityType = 'Transaction';
    const entityId = 'tx-456';

    it('should detect UPDATE_UPDATE conflict when both sides modified', async () => {
      const lastSyncedAt = new Date('2024-01-01T12:00:00Z');
      const localData = {
        updatedAt: new Date('2024-01-02T10:00:00Z'),
        accountCode: '4000',
        amountCents: 10000,
      };
      const xeroData = {
        UpdatedDateUTC: '2024-01-02T11:00:00Z',
        AccountCode: '5000',
        Total: 100,
      };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
        lastSyncedAt,
      );

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe(ConflictType.UPDATE_UPDATE);
      expect(result.message).toContain('Both local and Xero versions modified');
    });

    it('should not detect conflict when only local modified', async () => {
      const lastSyncedAt = new Date('2024-01-02T10:00:00Z');
      const localData = {
        updatedAt: new Date('2024-01-03T10:00:00Z'), // After sync
        accountCode: '4000',
      };
      const xeroData = {
        UpdatedDateUTC: '2024-01-01T10:00:00Z', // Before sync
        AccountCode: '4000',
      };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
        lastSyncedAt,
      );

      expect(result.hasConflict).toBe(false);
      expect(result.message).toContain('No conflict');
    });

    it('should not detect conflict when only Xero modified', async () => {
      const lastSyncedAt = new Date('2024-01-02T10:00:00Z');
      const localData = {
        updatedAt: new Date('2024-01-01T10:00:00Z'), // Before sync
        accountCode: '4000',
      };
      const xeroData = {
        UpdatedDateUTC: '2024-01-03T10:00:00Z', // After sync
        AccountCode: '4000',
      };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
        lastSyncedAt,
      );

      expect(result.hasConflict).toBe(false);
      expect(result.message).toContain('No conflict');
    });

    it('should detect DELETE_UPDATE conflict when deleted locally but updated in Xero', async () => {
      const lastSyncedAt = new Date('2024-01-01T12:00:00Z');
      const localData = {
        updatedAt: new Date('2024-01-01T10:00:00Z'),
        isDeleted: true,
      };
      const xeroData = {
        UpdatedDateUTC: '2024-01-02T10:00:00Z', // Modified after sync
        Status: 'ACTIVE',
      };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
        lastSyncedAt,
      );

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe(ConflictType.DELETE_UPDATE);
      expect(result.message).toContain('Deleted locally but updated in Xero');
    });

    it('should detect DELETE_UPDATE conflict when deleted in Xero but updated locally', async () => {
      const lastSyncedAt = new Date('2024-01-01T12:00:00Z');
      const localData = {
        updatedAt: new Date('2024-01-02T10:00:00Z'), // Modified after sync
        isDeleted: false,
      };
      const xeroData = {
        UpdatedDateUTC: '2024-01-01T10:00:00Z',
        Status: 'DELETED',
      };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
        lastSyncedAt,
      );

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe(ConflictType.DELETE_UPDATE);
      expect(result.message).toContain('Deleted in Xero but updated locally');
    });

    it('should handle missing timestamps gracefully', async () => {
      const localData = { accountCode: '4000' };
      const xeroData = { AccountCode: '4000' };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
      );

      expect(result.hasConflict).toBe(false);
      expect(result.message).toContain('Missing modification timestamps');
    });

    it('should handle first sync (no lastSyncedAt)', async () => {
      const localData = {
        updatedAt: new Date('2024-01-02T10:00:00Z'),
        accountCode: '4000',
      };
      const xeroData = {
        UpdatedDateUTC: '2024-01-02T11:00:00Z',
        AccountCode: '5000',
      };

      const result = await service.detectConflicts(
        tenantId,
        entityType,
        entityId,
        localData,
        xeroData,
      );

      expect(result.hasConflict).toBe(false);
      expect(result.message).toContain('First sync');
    });
  });

  describe('hasModifications', () => {
    it('should return true when entity modified after sync', async () => {
      const entityData = {
        updatedAt: new Date('2024-01-02T10:00:00Z'),
      };
      const lastSyncedAt = new Date('2024-01-01T10:00:00Z');

      const result = await service.hasModifications(entityData, lastSyncedAt);

      expect(result).toBe(true);
    });

    it('should return false when entity not modified after sync', async () => {
      const entityData = {
        updatedAt: new Date('2024-01-01T08:00:00Z'),
      };
      const lastSyncedAt = new Date('2024-01-01T10:00:00Z');

      const result = await service.hasModifications(entityData, lastSyncedAt);

      expect(result).toBe(false);
    });

    it('should return true when no lastSyncedAt provided', async () => {
      const entityData = {
        updatedAt: new Date('2024-01-02T10:00:00Z'),
      };

      const result = await service.hasModifications(entityData);

      expect(result).toBe(true);
    });
  });

  describe('getConflictingFields', () => {
    it('should identify conflicting fields', async () => {
      const localData = {
        description: 'Local description',
        amountCents: 10000,
        accountCode: '4000',
        status: 'PENDING',
      };
      const xeroData = {
        Description: 'Xero description',
        Total: 100, // Same as 10000 cents
        AccountCode: '5000', // Different
        Status: 'PENDING',
      };

      const result = await service.getConflictingFields(localData, xeroData);

      expect(result).toContain('description');
      expect(result).toContain('accountCode');
      expect(result).not.toContain('amountCents'); // Same value
      expect(result).not.toContain('status'); // Same value
    });

    it('should handle amount conversions correctly', async () => {
      const localData = {
        amountCents: 10050, // $100.50
      };
      const xeroData = {
        Total: 100.5, // $100.50
      };

      const result = await service.getConflictingFields(localData, xeroData);

      expect(result).not.toContain('amountCents');
    });

    it('should detect amount differences', async () => {
      const localData = {
        amountCents: 10050, // $100.50
      };
      const xeroData = {
        Total: 100.0, // $100.00 - different!
      };

      const result = await service.getConflictingFields(localData, xeroData);

      expect(result).toContain('amountCents');
    });
  });

  describe('createConflictRecord', () => {
    it('should create conflict record in database', async () => {
      const mockConflict = {
        id: 'conflict-789',
        tenantId: 'tenant-123',
        entityType: 'Transaction',
        entityId: 'tx-456',
        conflictType: 'UPDATE_UPDATE',
        localData: { accountCode: '4000' },
        xeroData: { AccountCode: '5000' },
        localModifiedAt: new Date('2024-01-02T10:00:00Z'),
        xeroModifiedAt: new Date('2024-01-02T11:00:00Z'),
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.syncConflict.create.mockResolvedValue(mockConflict);

      const conflictId = await service.createConflictRecord(
        'tenant-123',
        'Transaction',
        'tx-456',
        ConflictType.UPDATE_UPDATE,
        { accountCode: '4000' },
        { AccountCode: '5000' },
        new Date('2024-01-02T10:00:00Z'),
        new Date('2024-01-02T11:00:00Z'),
      );

      expect(conflictId).toBe('conflict-789');
      expect(mockPrismaService.syncConflict.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-123',
          entityType: 'Transaction',
          entityId: 'tx-456',
          conflictType: ConflictType.UPDATE_UPDATE,
          localData: { accountCode: '4000' },
          xeroData: { AccountCode: '5000' },
          localModifiedAt: new Date('2024-01-02T10:00:00Z'),
          xeroModifiedAt: new Date('2024-01-02T11:00:00Z'),
        },
      });
    });
  });
});
