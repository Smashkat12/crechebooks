/**
 * RecipientGroupEntity Tests
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { RecipientGroupEntity } from '../../../src/communications/entities/recipient-group.entity';
import { RecipientType } from '../../../src/communications/types/communication.types';

describe('RecipientGroupEntity', () => {
  let entity: RecipientGroupEntity;
  let _prismaService: PrismaService;

  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174001';
  const mockGroupId = '123e4567-e89b-12d3-a456-426614174002';

  const mockGroup = {
    id: mockGroupId,
    tenantId: mockTenantId,
    name: 'All Active Parents',
    description: 'Parents with active enrollments',
    recipientType: RecipientType.PARENT,
    filterCriteria: { parentFilter: { isActive: true } },
    isSystem: false,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSystemGroup = {
    ...mockGroup,
    id: '123e4567-e89b-12d3-a456-426614174003',
    name: 'System Group',
    isSystem: true,
    createdBy: null,
  };

  const mockPrismaService = {
    recipientGroup: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientGroupEntity,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    entity = module.get<RecipientGroupEntity>(RecipientGroupEntity);
    _prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a recipient group', async () => {
      mockPrismaService.recipientGroup.create.mockResolvedValue(mockGroup);

      const result = await entity.create(
        {
          tenantId: mockTenantId,
          name: 'All Active Parents',
          description: 'Parents with active enrollments',
          recipientType: RecipientType.PARENT,
          filterCriteria: { parentFilter: { isActive: true } },
        },
        mockUserId,
      );

      expect(result).toEqual(mockGroup);
      expect(mockPrismaService.recipientGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            name: 'All Active Parents',
            createdBy: mockUserId,
            isSystem: false,
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should find a group by ID', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(mockGroup);

      const result = await entity.findById(mockGroupId);

      expect(result).toEqual(mockGroup);
    });

    it('should return null if group not found', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(null);

      const result = await entity.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should find all groups for a tenant', async () => {
      const groups = [mockSystemGroup, mockGroup];
      mockPrismaService.recipientGroup.findMany.mockResolvedValue(groups);

      const result = await entity.findByTenant(mockTenantId);

      expect(result).toEqual(groups);
      expect(mockPrismaService.recipientGroup.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    });

    it('should filter by recipient type when provided', async () => {
      mockPrismaService.recipientGroup.findMany.mockResolvedValue([mockGroup]);

      await entity.findByTenant(mockTenantId, RecipientType.PARENT);

      expect(mockPrismaService.recipientGroup.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          recipientType: RecipientType.PARENT,
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      });
    });
  });

  describe('findByName', () => {
    it('should find a group by unique name within tenant', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(mockGroup);

      const result = await entity.findByName(
        mockTenantId,
        'All Active Parents',
      );

      expect(result).toEqual(mockGroup);
      expect(mockPrismaService.recipientGroup.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_name: {
            tenantId: mockTenantId,
            name: 'All Active Parents',
          },
        },
      });
    });
  });

  describe('update', () => {
    it('should update a user-created group', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(mockGroup);
      const updatedGroup = { ...mockGroup, name: 'Updated Name' };
      mockPrismaService.recipientGroup.update.mockResolvedValue(updatedGroup);

      const result = await entity.update(mockTenantId, mockGroupId, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException if group not found', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(null);

      await expect(
        entity.update(mockTenantId, 'non-existent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when updating system group', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(
        mockSystemGroup,
      );

      await expect(
        entity.update(mockTenantId, mockSystemGroup.id, { name: 'New Name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when tenant does not match', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(mockGroup);

      await expect(
        entity.update('different-tenant', mockGroupId, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete a user-created group', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(mockGroup);
      mockPrismaService.recipientGroup.delete.mockResolvedValue(mockGroup);

      await entity.delete(mockTenantId, mockGroupId);

      expect(mockPrismaService.recipientGroup.delete).toHaveBeenCalledWith({
        where: { id: mockGroupId },
      });
    });

    it('should throw BadRequestException when deleting system group', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(
        mockSystemGroup,
      );

      await expect(
        entity.delete(mockTenantId, mockSystemGroup.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when group not found', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(null);

      await expect(entity.delete(mockTenantId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getFilterCriteria', () => {
    it('should return filter criteria for a group', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(mockGroup);

      const result = await entity.getFilterCriteria(mockGroupId);

      expect(result).toEqual({ parentFilter: { isActive: true } });
    });

    it('should return null if group not found', async () => {
      mockPrismaService.recipientGroup.findUnique.mockResolvedValue(null);

      const result = await entity.getFilterCriteria('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('seedSystemGroups', () => {
    it('should seed system groups for a tenant', async () => {
      mockPrismaService.recipientGroup.upsert.mockResolvedValue(
        mockSystemGroup,
      );

      await entity.seedSystemGroups(mockTenantId);

      // Should create 5 system groups
      expect(mockPrismaService.recipientGroup.upsert).toHaveBeenCalledTimes(5);

      // Verify one of the system groups
      expect(mockPrismaService.recipientGroup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_name: {
              tenantId: mockTenantId,
              name: 'All Active Parents',
            },
          },
          create: expect.objectContaining({
            tenantId: mockTenantId,
            name: 'All Active Parents',
            isSystem: true,
          }),
        }),
      );
    });
  });

  describe('hasSystemGroups', () => {
    it('should return true if tenant has system groups', async () => {
      mockPrismaService.recipientGroup.count.mockResolvedValue(5);

      const result = await entity.hasSystemGroups(mockTenantId);

      expect(result).toBe(true);
    });

    it('should return false if tenant has no system groups', async () => {
      mockPrismaService.recipientGroup.count.mockResolvedValue(0);

      const result = await entity.hasSystemGroups(mockTenantId);

      expect(result).toBe(false);
    });
  });

  describe('countByTenant', () => {
    it('should count groups by tenant', async () => {
      mockPrismaService.recipientGroup.count.mockResolvedValue(10);

      const result = await entity.countByTenant(mockTenantId);

      expect(result).toBe(10);
    });
  });
});
