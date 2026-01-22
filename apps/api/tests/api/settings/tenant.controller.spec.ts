/**
 * Tenant Controller Tests
 * TASK-AUTH-001: Role Enforcement for Tenant Controller
 *
 * @module tests/api/settings/tenant.controller
 * @description Tests for tenant controller endpoints including role enforcement.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TenantController } from '../../../src/api/settings/tenant.controller';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { Tenant } from '@prisma/client';

describe('TenantController', () => {
  let controller: TenantController;
  let tenantRepo: TenantRepository;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockTenant: Tenant = {
    id: mockTenantId,
    name: 'Test School',
    tradingName: null,
    registrationNumber: 'REG123456',
    vatNumber: 'VAT123456',
    taxStatus: 'NOT_REGISTERED' as any,
    vatRegistrationDate: null,
    cumulativeTurnoverCents: BigInt(0),
    addressLine1: '123 Test Street',
    addressLine2: null,
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2000',
    phone: '+27821234567',
    email: 'info@testschool.com',
    xeroTenantId: null,
    subscriptionStatus: 'TRIAL' as any,
    invoiceDayOfMonth: 1,
    invoiceDueDays: 7,
    closureDates: [],
    matchingToleranceCents: 0,
    bankName: null,
    bankAccountHolder: null,
    bankAccountNumber: null,
    bankBranchCode: null,
    bankAccountType: null,
    bankSwiftCode: null,
    parentWelcomeMessage: null,
    operatingHours: null,
    xeroConnectedAt: null,
    xeroTenantName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockUser = (
    role: UserRole,
    tenantId: string = mockTenantId,
  ): IUser => ({
    id: mockUserId,
    tenantId,
    auth0Id: `auth0|${role.toLowerCase()}123`,
    email: `${role.toLowerCase()}@school.com`,
    role,
    name: `${role} User`,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        {
          provide: TenantRepository,
          useValue: {
            findByIdOrThrow: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
    tenantRepo = module.get<TenantRepository>(TenantRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /tenants/me (getCurrentTenant)', () => {
    it('should return current tenant for authenticated user', async () => {
      const mockUser = createMockUser(UserRole.VIEWER);
      jest.spyOn(tenantRepo, 'findByIdOrThrow').mockResolvedValue(mockTenant);

      const result = await controller.getCurrentTenant(mockUser);

      expect(result.id).toBe(mockTenantId);
      expect(result.name).toBe('Test School');
      expect(result.cumulativeTurnoverCents).toBe('0');
      expect(tenantRepo.findByIdOrThrow).toHaveBeenCalledWith(mockTenantId);
    });

    it('should serialize BigInt fields to string', async () => {
      const mockUser = createMockUser(UserRole.VIEWER);
      const tenantWithBigInt: Tenant = {
        ...mockTenant,
        cumulativeTurnoverCents: BigInt(1234567890),
      };
      jest
        .spyOn(tenantRepo, 'findByIdOrThrow')
        .mockResolvedValue(tenantWithBigInt);

      const result = await controller.getCurrentTenant(mockUser);

      expect(result.cumulativeTurnoverCents).toBe('1234567890');
      expect(typeof result.cumulativeTurnoverCents).toBe('string');
    });
  });

  describe('GET /tenants/:id (getTenant)', () => {
    it('should return tenant for user belonging to tenant', async () => {
      const mockUser = createMockUser(UserRole.VIEWER);
      jest.spyOn(tenantRepo, 'findByIdOrThrow').mockResolvedValue(mockTenant);

      const result = await controller.getTenant(mockUser, mockTenantId);

      expect(result.id).toBe(mockTenantId);
      expect(tenantRepo.findByIdOrThrow).toHaveBeenCalledWith(mockTenantId);
    });

    it('should throw ForbiddenException when user belongs to different tenant', async () => {
      const mockUser = createMockUser(UserRole.VIEWER, 'different-tenant');

      await expect(
        controller.getTenant(mockUser, mockTenantId),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.getTenant(mockUser, mockTenantId),
      ).rejects.toThrow('You do not have access to this tenant');
    });
  });

  describe('PUT /tenants/:id (updateTenant)', () => {
    const updateDto = {
      name: 'Updated School Name',
      phone: '+27829999999',
    };

    it('should update tenant for OWNER', async () => {
      const mockUser = createMockUser(UserRole.OWNER);
      const updatedTenant = {
        ...mockTenant,
        name: 'Updated School Name',
        phone: '+27829999999',
      };
      jest.spyOn(tenantRepo, 'update').mockResolvedValue(updatedTenant);

      const result = await controller.updateTenant(
        mockUser,
        mockTenantId,
        updateDto,
      );

      expect(result.name).toBe('Updated School Name');
      expect(tenantRepo.update).toHaveBeenCalledWith(mockTenantId, updateDto);
    });

    it('should update tenant for ADMIN', async () => {
      const mockUser = createMockUser(UserRole.ADMIN);
      const updatedTenant = { ...mockTenant, ...updateDto };
      jest.spyOn(tenantRepo, 'update').mockResolvedValue(updatedTenant);

      const result = await controller.updateTenant(
        mockUser,
        mockTenantId,
        updateDto,
      );

      expect(result.name).toBe('Updated School Name');
      expect(tenantRepo.update).toHaveBeenCalledWith(mockTenantId, updateDto);
    });

    it('should throw ForbiddenException when user belongs to different tenant', async () => {
      const mockUser = createMockUser(UserRole.OWNER, 'different-tenant');

      await expect(
        controller.updateTenant(mockUser, mockTenantId, updateDto),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.updateTenant(mockUser, mockTenantId, updateDto),
      ).rejects.toThrow('You do not have access to this tenant');
    });
  });

  describe('Role enforcement via @Roles decorator', () => {
    it('should enforce OWNER/ADMIN role for updateTenant via decorators', () => {
      const updateMethod = TenantController.prototype.updateTenant;
      const metadata = Reflect.getMetadata('roles', updateMethod) as UserRole[];

      expect(metadata).toContain(UserRole.OWNER);
      expect(metadata).toContain(UserRole.ADMIN);
    });

    it('should NOT allow ACCOUNTANT role for updateTenant', () => {
      const updateMethod = TenantController.prototype.updateTenant;
      const metadata = Reflect.getMetadata('roles', updateMethod) as UserRole[];

      expect(metadata).not.toContain(UserRole.ACCOUNTANT);
    });

    it('should NOT allow VIEWER role for updateTenant', () => {
      const updateMethod = TenantController.prototype.updateTenant;
      const metadata = Reflect.getMetadata('roles', updateMethod) as UserRole[];

      expect(metadata).not.toContain(UserRole.VIEWER);
    });

    it('should NOT have @Roles decorator on getCurrentTenant (any role allowed)', () => {
      const getCurrentMethod = TenantController.prototype.getCurrentTenant;
      const metadata = Reflect.getMetadata('roles', getCurrentMethod);

      expect(metadata).toBeUndefined();
    });

    it('should NOT have @Roles decorator on getTenant (any role allowed)', () => {
      const getMethod = TenantController.prototype.getTenant;
      const metadata = Reflect.getMetadata('roles', getMethod);

      expect(metadata).toBeUndefined();
    });
  });
});
