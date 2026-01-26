/**
 * Rollout Integration Tests
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 *
 * Tests mode transitions, multi-agent scenarios, and graceful degradation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FeatureFlagService } from '../feature-flags.service';
import { ShadowRunner } from '../shadow-runner';
import { AuditTrailService } from '../../audit/audit-trail.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  SdkMode,
  SdkFlag,
  ComparisonResult,
} from '../interfaces/rollout.interface';

describe('Rollout Integration', () => {
  let featureFlagService: FeatureFlagService;
  let shadowRunner: ShadowRunner;
  let prisma: {
    featureFlag: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let auditTrail: { logDecision: jest.Mock };

  const tenantId = 'tenant-integration-1';

  const mockCompare = (
    sdk: string,
    heuristic: string,
  ): ComparisonResult => ({
    tenantId,
    agentType: 'categorizer',
    sdkResult: sdk,
    heuristicResult: heuristic,
    sdkDurationMs: 100,
    heuristicDurationMs: 50,
    resultsMatch: sdk === heuristic,
    details: {},
  });

  beforeEach(async () => {
    prisma = {
      featureFlag: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    auditTrail = { logDecision: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagService,
        ShadowRunner,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditTrailService, useValue: auditTrail },
      ],
    }).compile();

    featureFlagService = module.get<FeatureFlagService>(FeatureFlagService);
    shadowRunner = module.get<ShadowRunner>(ShadowRunner);
  });

  describe('Feature flag mode transitions', () => {
    it('should transition DISABLED -> SHADOW -> PRIMARY -> DISABLED', async () => {
      // Start: DISABLED (no flag exists)
      prisma.featureFlag.findUnique.mockResolvedValue(null);
      let mode = await featureFlagService.getMode(
        tenantId,
        SdkFlag.CATEGORIZER,
      );
      expect(mode).toBe(SdkMode.DISABLED);

      // Transition to SHADOW
      await featureFlagService.enableShadow(tenantId, SdkFlag.CATEGORIZER);
      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ mode: 'SHADOW', enabled: true }),
        }),
      );

      // Simulate DB now returning SHADOW
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId,
        flag: SdkFlag.CATEGORIZER,
        enabled: true,
        mode: 'SHADOW',
      });
      mode = await featureFlagService.getMode(tenantId, SdkFlag.CATEGORIZER);
      expect(mode).toBe(SdkMode.SHADOW);

      // Transition to PRIMARY
      await featureFlagService.enablePrimary(tenantId, SdkFlag.CATEGORIZER);
      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ mode: 'PRIMARY', enabled: true }),
        }),
      );

      // Simulate DB now returning PRIMARY
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId,
        flag: SdkFlag.CATEGORIZER,
        enabled: true,
        mode: 'PRIMARY',
      });
      mode = await featureFlagService.getMode(tenantId, SdkFlag.CATEGORIZER);
      expect(mode).toBe(SdkMode.PRIMARY);

      // Transition back to DISABLED
      await featureFlagService.disable(tenantId, SdkFlag.CATEGORIZER);
      expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            mode: 'DISABLED',
            enabled: false,
          }),
        }),
      );

      // Simulate DB now returning DISABLED
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId,
        flag: SdkFlag.CATEGORIZER,
        enabled: false,
        mode: 'DISABLED',
      });
      mode = await featureFlagService.getMode(tenantId, SdkFlag.CATEGORIZER);
      expect(mode).toBe(SdkMode.DISABLED);
    });

    it('should support instant rollback from PRIMARY to DISABLED', async () => {
      // Currently in PRIMARY
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId,
        flag: SdkFlag.CATEGORIZER,
        enabled: true,
        mode: 'PRIMARY',
      });

      let mode = await featureFlagService.getMode(
        tenantId,
        SdkFlag.CATEGORIZER,
      );
      expect(mode).toBe(SdkMode.PRIMARY);

      // Instant rollback
      await featureFlagService.disable(tenantId, SdkFlag.CATEGORIZER);

      // After disable, next read should get DISABLED
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId,
        flag: SdkFlag.CATEGORIZER,
        enabled: false,
        mode: 'DISABLED',
      });

      mode = await featureFlagService.getMode(tenantId, SdkFlag.CATEGORIZER);
      expect(mode).toBe(SdkMode.DISABLED);
    });
  });

  describe('Different modes for different agents simultaneously', () => {
    it('should support different modes per agent flag', async () => {
      // Set up different modes for different agents
      prisma.featureFlag.findUnique.mockImplementation(
        (args: { where: { tenantId_flag: { flag: string } } }) => {
          const flag = args.where.tenantId_flag.flag;
          switch (flag) {
            case SdkFlag.CATEGORIZER:
              return Promise.resolve({
                id: 'f1',
                tenantId,
                flag: SdkFlag.CATEGORIZER,
                enabled: true,
                mode: 'SHADOW',
              });
            case SdkFlag.MATCHER:
              return Promise.resolve({
                id: 'f2',
                tenantId,
                flag: SdkFlag.MATCHER,
                enabled: true,
                mode: 'PRIMARY',
              });
            case SdkFlag.SARS:
              return Promise.resolve(null); // DISABLED
            default:
              return Promise.resolve(null);
          }
        },
      );

      const categorizerMode = await featureFlagService.getMode(
        tenantId,
        SdkFlag.CATEGORIZER,
      );
      const matcherMode = await featureFlagService.getMode(
        tenantId,
        SdkFlag.MATCHER,
      );
      const sarsMode = await featureFlagService.getMode(
        tenantId,
        SdkFlag.SARS,
      );

      expect(categorizerMode).toBe(SdkMode.SHADOW);
      expect(matcherMode).toBe(SdkMode.PRIMARY);
      expect(sarsMode).toBe(SdkMode.DISABLED);
    });
  });

  describe('ShadowRunner with AuditTrailService unavailable', () => {
    it('should work without audit trail (graceful degradation)', async () => {
      // Create runner without audit trail
      const noAuditModule = await Test.createTestingModule({
        providers: [
          ShadowRunner,
          FeatureFlagService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();

      const noAuditRunner = noAuditModule.get<ShadowRunner>(ShadowRunner);

      // Set mode to SHADOW
      prisma.featureFlag.findUnique.mockResolvedValue({
        id: 'flag-1',
        tenantId,
        flag: 'sdk_categorizer',
        enabled: true,
        mode: 'SHADOW',
      });

      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      const result = await noAuditRunner.run({
        tenantId,
        agentType: 'categorizer',
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('heuristic-result');
      expect(heuristicFn).toHaveBeenCalled();

      // Wait for background SDK
      await new Promise((r) => setTimeout(r, 50));
      expect(sdkFn).toHaveBeenCalled();
    });
  });

  describe('Multiple tenants with different flag configurations', () => {
    it('should isolate flags per tenant', async () => {
      const tenant1 = 'tenant-A';
      const tenant2 = 'tenant-B';

      prisma.featureFlag.findUnique.mockImplementation(
        (args: {
          where: { tenantId_flag: { tenantId: string; flag: string } };
        }) => {
          const { tenantId: tid, flag } = args.where.tenantId_flag;
          if (tid === tenant1 && flag === SdkFlag.CATEGORIZER) {
            return Promise.resolve({
              id: 'f1',
              tenantId: tenant1,
              flag: SdkFlag.CATEGORIZER,
              enabled: true,
              mode: 'PRIMARY',
            });
          }
          if (tid === tenant2 && flag === SdkFlag.CATEGORIZER) {
            return Promise.resolve({
              id: 'f2',
              tenantId: tenant2,
              flag: SdkFlag.CATEGORIZER,
              enabled: true,
              mode: 'SHADOW',
            });
          }
          return Promise.resolve(null);
        },
      );

      const tenant1Mode = await featureFlagService.getMode(
        tenant1,
        SdkFlag.CATEGORIZER,
      );
      const tenant2Mode = await featureFlagService.getMode(
        tenant2,
        SdkFlag.CATEGORIZER,
      );

      expect(tenant1Mode).toBe(SdkMode.PRIMARY);
      expect(tenant2Mode).toBe(SdkMode.SHADOW);
    });

    it('should run different strategies for different tenants', async () => {
      const tenant1 = 'tenant-primary';
      const tenant2 = 'tenant-disabled';

      prisma.featureFlag.findUnique.mockImplementation(
        (args: {
          where: { tenantId_flag: { tenantId: string; flag: string } };
        }) => {
          const { tenantId: tid } = args.where.tenantId_flag;
          if (tid === tenant1) {
            return Promise.resolve({
              id: 'f1',
              tenantId: tenant1,
              flag: 'sdk_categorizer',
              enabled: true,
              mode: 'PRIMARY',
            });
          }
          return Promise.resolve(null);
        },
      );

      const sdkFn = jest.fn().mockResolvedValue('sdk');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic');

      // Tenant 1 (PRIMARY): should get SDK result
      const result1 = await shadowRunner.run({
        tenantId: tenant1,
        agentType: 'categorizer',
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });
      expect(result1).toBe('sdk');

      // Reset mocks
      sdkFn.mockClear();
      heuristicFn.mockClear();

      // Tenant 2 (DISABLED): should get heuristic result
      const result2 = await shadowRunner.run({
        tenantId: tenant2,
        agentType: 'categorizer',
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });
      expect(result2).toBe('heuristic');
      expect(sdkFn).not.toHaveBeenCalled();
    });
  });

  describe('SdkFlag enum coverage', () => {
    it('should have all expected flag values', () => {
      expect(SdkFlag.CATEGORIZER).toBe('sdk_categorizer');
      expect(SdkFlag.MATCHER).toBe('sdk_matcher');
      expect(SdkFlag.SARS).toBe('sdk_sars');
      expect(SdkFlag.VALIDATOR).toBe('sdk_validator');
      expect(SdkFlag.ORCHESTRATOR).toBe('sdk_orchestrator');
      expect(SdkFlag.CONVERSATIONAL).toBe('sdk_conversational');
    });
  });

  describe('SdkMode enum coverage', () => {
    it('should have all expected mode values', () => {
      expect(SdkMode.DISABLED).toBe('DISABLED');
      expect(SdkMode.SHADOW).toBe('SHADOW');
      expect(SdkMode.PRIMARY).toBe('PRIMARY');
    });
  });
});
