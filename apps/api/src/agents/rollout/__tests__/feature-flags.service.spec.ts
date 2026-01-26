/**
 * Feature Flags Service Tests
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagService } from '../feature-flags.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SdkMode } from '../interfaces/rollout.interface';

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;
  let prisma: {
    featureFlag: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      featureFlag: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FeatureFlagService>(FeatureFlagService);
  });

  describe('getMode', () => {
    it('should return DISABLED when no flag exists', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);

      const mode = await service.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.DISABLED);
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_flag: { tenantId: 'tenant-1', flag: 'sdk_categorizer' },
        },
      });
    });

    it('should return DISABLED when flag exists but not enabled', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId: 'tenant-1',
        flag: 'sdk_categorizer',
        enabled: false,
        mode: 'SHADOW',
      });

      const mode = await service.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.DISABLED);
    });

    it('should return correct mode when flag exists and enabled (SHADOW)', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId: 'tenant-1',
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'SHADOW',
      });

      const mode = await service.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.SHADOW);
    });

    it('should return correct mode when flag exists and enabled (PRIMARY)', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId: 'tenant-1',
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'PRIMARY',
      });

      const mode = await service.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.PRIMARY);
    });

    it('should return DISABLED for unknown mode strings', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId: 'tenant-1',
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'UNKNOWN_MODE',
      });

      const mode = await service.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.DISABLED);
    });

    it('should return DISABLED when Prisma is unavailable', async () => {
      // Create service without Prisma
      const noPrismaModule = await Test.createTestingModule({
        providers: [FeatureFlagService],
      }).compile();

      const noPrismaService =
        noPrismaModule.get<FeatureFlagService>(FeatureFlagService);

      const mode = await noPrismaService.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.DISABLED);
    });

    it('should return DISABLED when Prisma throws', async () => {
      prisma.featureFlag.findUnique.mockRejectedValue(
        new Error('Connection lost'),
      );

      const mode = await service.getMode('tenant-1', 'sdk_categorizer');

      expect(mode).toBe(SdkMode.DISABLED);
    });
  });

  describe('enableShadow', () => {
    it('should upsert flag with SHADOW mode and enabled=true', async () => {
      prisma.featureFlag.upsert.mockResolvedValue({});

      await service.enableShadow('tenant-1', 'sdk_categorizer');

      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_flag: { tenantId: 'tenant-1', flag: 'sdk_categorizer' },
        },
        create: {
          tenantId: 'tenant-1',
          flag: 'sdk_categorizer',
          enabled: true,
          mode: 'SHADOW',
          metadata: undefined,
        },
        update: {
          enabled: true,
          mode: 'SHADOW',
          metadata: undefined,
        },
      });
    });

    it('should pass metadata when provided', async () => {
      prisma.featureFlag.upsert.mockResolvedValue({});
      const metadata = { reason: 'testing', enabledBy: 'admin' };

      await service.enableShadow('tenant-1', 'sdk_categorizer', metadata);

      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ metadata }),
          update: expect.objectContaining({ metadata }),
        }),
      );
    });
  });

  describe('enablePrimary', () => {
    it('should upsert flag with PRIMARY mode and enabled=true', async () => {
      prisma.featureFlag.upsert.mockResolvedValue({});

      await service.enablePrimary('tenant-1', 'sdk_categorizer');

      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_flag: { tenantId: 'tenant-1', flag: 'sdk_categorizer' },
        },
        create: {
          tenantId: 'tenant-1',
          flag: 'sdk_categorizer',
          enabled: true,
          mode: 'PRIMARY',
          metadata: undefined,
        },
        update: {
          enabled: true,
          mode: 'PRIMARY',
          metadata: undefined,
        },
      });
    });

    it('should pass metadata when provided', async () => {
      prisma.featureFlag.upsert.mockResolvedValue({});
      const metadata = { reason: 'rollout', enabledBy: 'admin' };

      await service.enablePrimary('tenant-1', 'sdk_matcher', metadata);

      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            flag: 'sdk_matcher',
            mode: 'PRIMARY',
            metadata,
          }),
        }),
      );
    });
  });

  describe('disable', () => {
    it('should upsert flag with DISABLED mode and enabled=false', async () => {
      prisma.featureFlag.upsert.mockResolvedValue({});

      await service.disable('tenant-1', 'sdk_categorizer');

      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_flag: { tenantId: 'tenant-1', flag: 'sdk_categorizer' },
        },
        create: {
          tenantId: 'tenant-1',
          flag: 'sdk_categorizer',
          enabled: false,
          mode: 'DISABLED',
        },
        update: {
          enabled: false,
          mode: 'DISABLED',
        },
      });
    });
  });

  describe('getAllFlags', () => {
    it('should return all flags for a tenant', async () => {
      prisma.featureFlag.findMany.mockResolvedValue([
        {
          id: 'f1',
          tenantId: 'tenant-1',
          flag: 'sdk_categorizer',
          enabled: true,
          mode: 'SHADOW',
          metadata: null,
        },
        {
          id: 'f2',
          tenantId: 'tenant-1',
          flag: 'sdk_matcher',
          enabled: false,
          mode: 'DISABLED',
          metadata: { reason: 'rollback' },
        },
      ]);

      const flags = await service.getAllFlags('tenant-1');

      expect(flags).toHaveLength(2);
      expect(flags[0]).toEqual({
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'SHADOW',
        metadata: null,
      });
      expect(flags[1]).toEqual({
        flag: 'sdk_matcher',
        enabled: false,
        mode: 'DISABLED',
        metadata: { reason: 'rollback' },
      });
    });

    it('should return empty array when Prisma is unavailable', async () => {
      const noPrismaModule = await Test.createTestingModule({
        providers: [FeatureFlagService],
      }).compile();

      const noPrismaService =
        noPrismaModule.get<FeatureFlagService>(FeatureFlagService);

      const flags = await noPrismaService.getAllFlags('tenant-1');

      expect(flags).toEqual([]);
    });
  });

  describe('isEnabled', () => {
    it('should return false for DISABLED mode', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);

      const enabled = await service.isEnabled('tenant-1', 'sdk_categorizer');

      expect(enabled).toBe(false);
    });

    it('should return true for SHADOW mode', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'f1',
        tenantId: 'tenant-1',
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'SHADOW',
      });

      const enabled = await service.isEnabled('tenant-1', 'sdk_categorizer');

      expect(enabled).toBe(true);
    });

    it('should return true for PRIMARY mode', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'f1',
        tenantId: 'tenant-1',
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'PRIMARY',
      });

      const enabled = await service.isEnabled('tenant-1', 'sdk_categorizer');

      expect(enabled).toBe(true);
    });
  });
});
