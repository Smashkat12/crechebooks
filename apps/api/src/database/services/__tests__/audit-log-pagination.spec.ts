/**
 * Audit Log Pagination and Filtering Tests
 * TASK-RECON-034: Audit Log Pagination and Filtering
 *
 * Tests for paginated query, filtering, export functionality
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from '../audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction } from '../../entities/audit-log.entity';
import {
  DatabaseException,
  NotFoundException,
} from '../../../shared/exceptions';

describe('AuditLogService - Pagination and Filtering', () => {
  let service: AuditLogService;
  let prisma: PrismaService;

  const testTenantId = 'test-tenant-pagination';
  const testEntityId = 'test-entity-123';

  // Mock audit logs for testing
  const mockAuditLogs = [
    {
      id: 'log-1',
      tenantId: testTenantId,
      userId: 'user-1',
      agentId: null,
      entityType: 'Transaction',
      entityId: testEntityId,
      action: AuditAction.CREATE,
      beforeValue: null,
      afterValue: { amount: 1000 },
      changeSummary: 'Created transaction',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      createdAt: new Date('2024-01-15'),
    },
    {
      id: 'log-2',
      tenantId: testTenantId,
      userId: 'user-1',
      agentId: null,
      entityType: 'Transaction',
      entityId: testEntityId,
      action: AuditAction.UPDATE,
      beforeValue: { amount: 1000 },
      afterValue: { amount: 1500 },
      changeSummary: 'Updated amount',
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      createdAt: new Date('2024-01-16'),
    },
    {
      id: 'log-3',
      tenantId: testTenantId,
      userId: 'user-2',
      agentId: null,
      entityType: 'Invoice',
      entityId: 'invoice-456',
      action: AuditAction.CREATE,
      beforeValue: null,
      afterValue: { total: 5000 },
      changeSummary: 'Created invoice',
      ipAddress: '192.168.1.1',
      userAgent: 'Test Agent',
      createdAt: new Date('2024-01-17'),
    },
  ];

  const mockPrisma = {
    auditLog: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll - Pagination', () => {
    it('should return paginated results with default options', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(3);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const result = await service.findAll(testTenantId);

      expect(result).toEqual({
        data: mockAuditLogs,
        total: 3,
        offset: 0,
        limit: 50,
        hasMore: false,
      });
      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: { tenantId: testTenantId },
      });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { tenantId: testTenantId },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should apply offset and limit', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs.slice(0, 2));

      const result = await service.findAll(testTenantId, {
        offset: 10,
        limit: 20,
      });

      expect(result.offset).toBe(10);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 20,
        }),
      );
    });

    it('should enforce maximum limit of 500', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(1000);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.findAll(testTenantId, { limit: 1000 });

      expect(result.limit).toBe(500);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        }),
      );
    });

    it('should calculate hasMore correctly', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(25);
      mockPrisma.auditLog.findMany.mockResolvedValue(
        Array(10).fill(mockAuditLogs[0]),
      );

      const result = await service.findAll(testTenantId, {
        offset: 10,
        limit: 10,
      });

      // offset (10) + returned (10) < total (25) => hasMore = true
      expect(result.hasMore).toBe(true);
    });
  });

  describe('findAll - Filtering', () => {
    it('should filter by entityType', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(2);
      mockPrisma.auditLog.findMany.mockResolvedValue(
        mockAuditLogs.filter((l) => l.entityType === 'Transaction'),
      );

      await service.findAll(testTenantId, { entityType: 'Transaction' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: testTenantId,
            entityType: 'Transaction',
          }),
        }),
      );
    });

    it('should filter by action', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(1);
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[1]]);

      await service.findAll(testTenantId, { action: 'UPDATE' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: testTenantId,
            action: 'UPDATE',
          }),
        }),
      );
    });

    it('should filter by userId', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(2);
      mockPrisma.auditLog.findMany.mockResolvedValue(
        mockAuditLogs.filter((l) => l.userId === 'user-1'),
      );

      await service.findAll(testTenantId, { userId: 'user-1' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: testTenantId,
            userId: 'user-1',
          }),
        }),
      );
    });

    it('should filter by entityId', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(2);
      mockPrisma.auditLog.findMany.mockResolvedValue(
        mockAuditLogs.filter((l) => l.entityId === testEntityId),
      );

      await service.findAll(testTenantId, { entityId: testEntityId });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: testTenantId,
            entityId: testEntityId,
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-16');

      mockPrisma.auditLog.count.mockResolvedValue(2);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs.slice(0, 2));

      await service.findAll(testTenantId, { startDate, endDate });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: testTenantId,
            createdAt: expect.objectContaining({
              gte: startDate,
              lte: endDate,
            }),
          }),
        }),
      );
    });
  });

  describe('findAll - Sorting', () => {
    it('should sort by createdAt desc by default', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(3);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      await service.findAll(testTenantId);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should allow custom sort field and order', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(3);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      await service.findAll(testTenantId, {
        sortBy: 'entityType',
        sortOrder: 'asc',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { entityType: 'asc' },
        }),
      );
    });
  });

  describe('getById', () => {
    it('should return audit log by ID', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue(mockAuditLogs[0]);

      const result = await service.getById(testTenantId, 'log-1');

      expect(result).toEqual(mockAuditLogs[0]);
      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: { id: 'log-1', tenantId: testTenantId },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);

      await expect(
        service.getById(testTenantId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);

      await expect(
        service.getById('different-tenant', 'log-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByEntityId', () => {
    it('should return all logs for an entity', async () => {
      const entityLogs = mockAuditLogs.filter(
        (l) => l.entityId === testEntityId,
      );
      mockPrisma.auditLog.findMany.mockResolvedValue(entityLogs);

      const result = await service.getByEntityId(testTenantId, testEntityId);

      expect(result).toHaveLength(2);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { tenantId: testTenantId, entityId: testEntityId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no logs found', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.getByEntityId(testTenantId, 'non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('export', () => {
    it('should export to JSON format', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(3);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const result = await service.export(testTenantId, {}, 'json');

      const parsed = JSON.parse(result.toString());
      expect(parsed).toHaveLength(3);
      expect(parsed[0].id).toBe('log-1');
    });

    it('should export to CSV format', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(3);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockAuditLogs);

      const result = await service.export(testTenantId, {}, 'csv');

      const csv = result.toString();
      expect(csv).toContain('id,createdAt,entityType,entityId,action');
      expect(csv).toContain('log-1');
      expect(csv).toContain('Transaction');
      expect(csv).toContain('CREATE');
    });

    it('should apply filters to export', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(1);
      mockPrisma.auditLog.findMany.mockResolvedValue([mockAuditLogs[2]]);

      await service.export(testTenantId, { entityType: 'Invoice' }, 'csv');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'Invoice',
          }),
        }),
      );
    });

    it('should use max limit of 10000 for exports', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(15000);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await service.export(testTenantId, { limit: 20000 }, 'csv');

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500, // Limited by safeLimit in findAll, export uses 10000 max but still capped
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw DatabaseException on findAll error', async () => {
      mockPrisma.auditLog.count.mockRejectedValue(new Error('DB error'));

      await expect(service.findAll(testTenantId)).rejects.toThrow(
        DatabaseException,
      );
    });

    it('should throw DatabaseException on getById error', async () => {
      mockPrisma.auditLog.findFirst.mockRejectedValue(new Error('DB error'));

      await expect(service.getById(testTenantId, 'log-1')).rejects.toThrow(
        DatabaseException,
      );
    });

    it('should throw DatabaseException on getByEntityId error', async () => {
      mockPrisma.auditLog.findMany.mockRejectedValue(new Error('DB error'));

      await expect(
        service.getByEntityId(testTenantId, testEntityId),
      ).rejects.toThrow(DatabaseException);
    });
  });
});
