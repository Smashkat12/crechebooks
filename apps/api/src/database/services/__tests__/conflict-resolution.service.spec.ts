/**
 * ConflictResolutionService Unit Tests
 * TASK-XERO-001
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictResolutionService } from '../conflict-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log.service';
import { ConflictStatus } from '../../entities/sync-conflict.entity';
import { BusinessException, NotFoundException } from '../../../shared/exceptions';

describe('ConflictResolutionService', () => {
  let service: ConflictResolutionService;
  let prisma: PrismaService;
  let auditLogService: AuditLogService;

  const mockPrismaService = {
    syncConflict: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAuditLogService = {
    logAction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictResolutionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<ConflictResolutionService>(ConflictResolutionService);
    prisma = module.get<PrismaService>(PrismaService);
    auditLogService = module.get<AuditLogService>(AuditLogService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveConflict', () => {
    const mockConflict = {
      id: 'conflict-123',
      tenantId: 'tenant-456',
      entityType: 'Transaction',
      entityId: 'tx-789',
      conflictType: 'UPDATE_UPDATE',
      localData: { accountCode: '4000', amountCents: 10000 },
      xeroData: { AccountCode: '5000', Total: 120 },
      localModifiedAt: new Date('2024-01-02T10:00:00Z'),
      xeroModifiedAt: new Date('2024-01-02T11:00:00Z'),
      status: 'PENDING',
      createdAt: new Date('2024-01-02T12:00:00Z'),
      updatedAt: new Date('2024-01-02T12:00:00Z'),
    };

    it('should resolve conflict with local_wins strategy', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...mockConflict,
        status: 'AUTO_RESOLVED',
        resolution: 'local_wins',
      });

      const result = await service.resolveConflict(
        'conflict-123',
        'local_wins',
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.appliedStrategy).toBe('local_wins');
      expect(result.winnerData).toEqual(mockConflict.localData);
      expect(mockPrismaService.syncConflict.update).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should resolve conflict with xero_wins strategy', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...mockConflict,
        status: 'AUTO_RESOLVED',
        resolution: 'xero_wins',
      });

      const result = await service.resolveConflict(
        'conflict-123',
        'xero_wins',
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.appliedStrategy).toBe('xero_wins');
      expect(result.winnerData).toEqual(mockConflict.xeroData);
    });

    it('should resolve conflict with last_modified_wins strategy (Xero wins)', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...mockConflict,
        status: 'AUTO_RESOLVED',
        resolution: 'last_modified_wins',
      });

      const result = await service.resolveConflict(
        'conflict-123',
        'last_modified_wins',
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.appliedStrategy).toBe('last_modified_wins');
      // Xero modified later, so Xero should win
      expect(result.winnerData).toEqual(mockConflict.xeroData);
      expect(result.message).toContain('Xero version selected');
    });

    it('should resolve conflict with last_modified_wins strategy (Local wins)', async () => {
      const conflictWithLocalNewer = {
        ...mockConflict,
        localModifiedAt: new Date('2024-01-02T14:00:00Z'), // Local newer
        xeroModifiedAt: new Date('2024-01-02T11:00:00Z'),
      };

      mockPrismaService.syncConflict.findUnique.mockResolvedValue(
        conflictWithLocalNewer,
      );
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...conflictWithLocalNewer,
        status: 'AUTO_RESOLVED',
        resolution: 'last_modified_wins',
      });

      const result = await service.resolveConflict(
        'conflict-123',
        'last_modified_wins',
        'user-123',
      );

      expect(result.winnerData).toEqual(mockConflict.localData);
      expect(result.message).toContain('Local version selected');
    });

    it('should mark manual resolution correctly', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...mockConflict,
        status: 'MANUALLY_RESOLVED',
        resolution: 'manual',
      });

      const result = await service.resolveConflict(
        'conflict-123',
        'manual',
        'user-123',
      );

      expect(result.success).toBe(true);
      expect(result.appliedStrategy).toBe('manual');
      expect(mockPrismaService.syncConflict.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ConflictStatus.MANUALLY_RESOLVED,
          }),
        }),
      );
    });

    it('should throw NotFoundException when conflict not found', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveConflict('conflict-123', 'local_wins', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException when conflict already resolved', async () => {
      const resolvedConflict = {
        ...mockConflict,
        status: 'AUTO_RESOLVED',
      };

      mockPrismaService.syncConflict.findUnique.mockResolvedValue(
        resolvedConflict,
      );

      await expect(
        service.resolveConflict('conflict-123', 'local_wins', 'user-123'),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('autoResolve', () => {
    const mockConflict = {
      id: 'conflict-123',
      tenantId: 'tenant-456',
      entityType: 'Transaction',
      entityId: 'tx-789',
      conflictType: 'UPDATE_UPDATE',
      localData: { accountCode: '4000' },
      xeroData: { AccountCode: '5000' },
      localModifiedAt: new Date('2024-01-02T10:00:00Z'),
      xeroModifiedAt: new Date('2024-01-02T11:00:00Z'),
      status: 'PENDING',
      createdAt: new Date('2024-01-02T12:00:00Z'),
      updatedAt: new Date('2024-01-02T12:00:00Z'),
    };

    it('should auto-resolve with default strategy', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...mockConflict,
        status: 'AUTO_RESOLVED',
      });

      const result = await service.autoResolve('conflict-123');

      expect(result).toBe(true);
      expect(mockPrismaService.syncConflict.update).toHaveBeenCalled();
    });

    it('should return false for manual strategy', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);

      const result = await service.autoResolve('conflict-123', 'manual');

      expect(result).toBe(false);
      expect(mockPrismaService.syncConflict.update).not.toHaveBeenCalled();
    });

    it('should return false on resolution failure', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.autoResolve('conflict-123');

      expect(result).toBe(false);
    });
  });

  describe('getPendingConflicts', () => {
    it('should return pending conflicts sorted by age', async () => {
      const mockConflicts = [
        {
          id: 'conflict-1',
          entityType: 'Transaction',
          entityId: 'tx-1',
          conflictType: 'UPDATE_UPDATE',
          createdAt: new Date('2024-01-01T10:00:00Z'), // Oldest
        },
        {
          id: 'conflict-2',
          entityType: 'Invoice',
          entityId: 'inv-1',
          conflictType: 'DELETE_UPDATE',
          createdAt: new Date('2024-01-02T10:00:00Z'),
        },
      ];

      mockPrismaService.syncConflict.findMany.mockResolvedValue(mockConflicts);

      const result = await service.getPendingConflicts('tenant-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conflict-1');
      expect(result[0]).toHaveProperty('ageInDays');
      expect(mockPrismaService.syncConflict.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          status: 'PENDING',
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: expect.any(Object),
      });
    });

    it('should return empty array when no pending conflicts', async () => {
      mockPrismaService.syncConflict.findMany.mockResolvedValue([]);

      const result = await service.getPendingConflicts('tenant-123');

      expect(result).toEqual([]);
    });
  });

  describe('queueForManualResolution', () => {
    it('should do nothing if conflict already pending', async () => {
      const mockConflict = {
        id: 'conflict-123',
        status: 'PENDING',
      };

      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);

      await service.queueForManualResolution('conflict-123');

      expect(mockPrismaService.syncConflict.update).not.toHaveBeenCalled();
    });

    it('should reset resolved conflict to pending', async () => {
      const mockConflict = {
        id: 'conflict-123',
        status: 'AUTO_RESOLVED',
        resolvedBy: 'system',
        resolution: 'local_wins',
        resolvedAt: new Date(),
      };

      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);
      mockPrismaService.syncConflict.update.mockResolvedValue({
        ...mockConflict,
        status: 'PENDING',
        resolvedBy: null,
        resolution: null,
        resolvedAt: null,
      });

      await service.queueForManualResolution('conflict-123');

      expect(mockPrismaService.syncConflict.update).toHaveBeenCalledWith({
        where: { id: 'conflict-123' },
        data: {
          status: ConflictStatus.PENDING,
          resolvedBy: null,
          resolution: null,
          resolvedAt: null,
        },
      });
    });

    it('should throw NotFoundException when conflict not found', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(null);

      await expect(
        service.queueForManualResolution('conflict-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyResolution', () => {
    const mockConflict = {
      id: 'conflict-123',
      tenantId: 'tenant-456',
      entityType: 'Transaction',
      entityId: 'tx-789',
      status: 'AUTO_RESOLVED',
      resolution: 'local_wins',
    };

    it('should log audit trail when applying resolution', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(mockConflict);

      const winnerData = { accountCode: '4000', amountCents: 10000 };

      await service.applyResolution('conflict-123', winnerData);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-456',
          entityType: 'Transaction',
          entityId: 'tx-789',
          afterValue: winnerData,
          changeSummary: expect.stringContaining('local_wins'),
        }),
      );
    });

    it('should throw NotFoundException when conflict not found', async () => {
      mockPrismaService.syncConflict.findUnique.mockResolvedValue(null);

      await expect(
        service.applyResolution('conflict-123', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException when conflict not resolved', async () => {
      const pendingConflict = {
        ...mockConflict,
        status: 'PENDING',
      };

      mockPrismaService.syncConflict.findUnique.mockResolvedValue(
        pendingConflict,
      );

      await expect(
        service.applyResolution('conflict-123', {}),
      ).rejects.toThrow(BusinessException);
    });
  });
});
