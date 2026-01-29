/**
 * SONA Bootstrap Service Tests
 * TASK-STUB-011: Persistence and SONA Cold Start Bootstrap
 *
 * All tests mock Prisma and IntelligenceEngine -- zero real API calls.
 * Tests cover: seeding, idempotency, quality normalization, graceful failure,
 * forceLearning trigger, disabled bootstrap, unavailable engine.
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  SonaBootstrapService,
  type BootstrapStats as _BootstrapStats,
} from '../../../src/agents/sdk/sona-bootstrap.service';
import { IntelligenceEngineService } from '../../../src/agents/sdk/intelligence-engine.service';
import { PersistenceConfig } from '../../../src/agents/sdk/persistence-config';
import { PrismaService } from '../../../src/database/prisma/prisma.service';

// ── Mock PrismaService ──────────────────────────────────────────────

const TENANT_ID = 'bdff4374-64d5-420c-b454-8e85e9df552a';

const mockPrisma = {
  payeePattern: {
    findMany: jest.fn().mockResolvedValue([
      {
        tenantId: TENANT_ID,
        payeePattern: 'Woolworths',
        defaultAccountCode: '5200',
        defaultAccountName: 'Food & Catering Costs',
        confidenceBoost: 95,
        matchCount: 42,
      },
      {
        tenantId: TENANT_ID,
        payeePattern: 'FNB',
        defaultAccountCode: '6600',
        defaultAccountName: 'Bank Charges & Fees',
        confidenceBoost: 99,
        matchCount: 120,
      },
    ]),
  },
  agentAuditLog: {
    findMany: jest.fn().mockResolvedValue([
      {
        tenantId: TENANT_ID,
        agentType: 'categorizer',
        decision: JSON.stringify({ accountCode: '5200', confidence: 88 }),
        confidence: 88,
        source: 'HEURISTIC',
        durationMs: 45,
        createdAt: new Date('2026-01-15'),
      },
    ]),
  },
  featureFlag: {
    findUnique: jest.fn().mockResolvedValue(null), // Not bootstrapped yet
    upsert: jest.fn().mockResolvedValue({
      tenantId: '__system__',
      flag: 'SONA_BOOTSTRAPPED',
      enabled: true,
      mode: 'PRIMARY',
    }),
  },
};

// ── Mock IntelligenceEngineService ───────────────────────────────────

const mockIntelligence = {
  isAvailable: jest.fn().mockReturnValue(true),
  learn: jest.fn().mockResolvedValue(undefined),
  getStats: jest.fn().mockResolvedValue({
    sona: {
      trajectoriesRecorded: 3,
      patternsLearned: 0,
      lastBackgroundRun: null,
      backgroundIntervalMs: 3600000,
    },
    vectorDb: { totalVectors: 0, collections: 0, storageSizeBytes: 0 },
    fastAgentDb: { totalEpisodes: 0, totalMemories: 0 },
    learningEngine: {
      totalDecisions: 0,
      averageConfidence: 0,
      routingAccuracy: 0,
    },
    initialized: true,
    uptimeMs: 1000,
  }),
};

// ── Mock PersistenceConfig ──────────────────────────────────────────

const defaultPersistenceValues = {
  dataDir: './data/test-ruvector',
  intelligenceDbPath: './data/test-ruvector/intelligence.db',
  collectionsDir: './data/test-ruvector/collections',
  sonaDir: './data/test-ruvector/sona',
  backupDir: './data/test-ruvector/backups',
  isPersistent: true,
  bootstrapEnabled: true,
};

const mockPersistenceConfig = {
  getConfig: jest.fn().mockReturnValue({ ...defaultPersistenceValues }),
};

// ── Tests ────────────────────────────────────────────────────────────

describe('SonaBootstrapService', () => {
  let service: SonaBootstrapService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset default mock return values
    mockPrisma.payeePattern.findMany.mockResolvedValue([
      {
        tenantId: TENANT_ID,
        payeePattern: 'Woolworths',
        defaultAccountCode: '5200',
        defaultAccountName: 'Food & Catering Costs',
        confidenceBoost: 95,
        matchCount: 42,
      },
      {
        tenantId: TENANT_ID,
        payeePattern: 'FNB',
        defaultAccountCode: '6600',
        defaultAccountName: 'Bank Charges & Fees',
        confidenceBoost: 99,
        matchCount: 120,
      },
    ]);
    mockPrisma.agentAuditLog.findMany.mockResolvedValue([
      {
        tenantId: TENANT_ID,
        agentType: 'categorizer',
        decision: JSON.stringify({ accountCode: '5200', confidence: 88 }),
        confidence: 88,
        source: 'HEURISTIC',
        durationMs: 45,
        createdAt: new Date('2026-01-15'),
      },
    ]);
    mockPrisma.featureFlag.findUnique.mockResolvedValue(null);
    mockPrisma.featureFlag.upsert.mockResolvedValue({
      tenantId: '__system__',
      flag: 'SONA_BOOTSTRAPPED',
      enabled: true,
      mode: 'PRIMARY',
    });
    mockIntelligence.isAvailable.mockReturnValue(true);
    mockIntelligence.learn.mockResolvedValue(undefined);
    mockIntelligence.getStats.mockResolvedValue({
      sona: {
        trajectoriesRecorded: 3,
        patternsLearned: 0,
        lastBackgroundRun: null,
        backgroundIntervalMs: 3600000,
      },
      vectorDb: { totalVectors: 0, collections: 0, storageSizeBytes: 0 },
      fastAgentDb: { totalEpisodes: 0, totalMemories: 0 },
      learningEngine: {
        totalDecisions: 0,
        averageConfidence: 0,
        routingAccuracy: 0,
      },
      initialized: true,
      uptimeMs: 1000,
    });
    mockPersistenceConfig.getConfig.mockReturnValue({
      ...defaultPersistenceValues,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SonaBootstrapService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IntelligenceEngineService, useValue: mockIntelligence },
        { provide: PersistenceConfig, useValue: mockPersistenceConfig },
      ],
    }).compile();

    service = module.get<SonaBootstrapService>(SonaBootstrapService);
  });

  describe('bootstrap', () => {
    it('should seed from PayeePatterns and AuditLogs', async () => {
      const stats = await service.bootstrap();

      expect(stats.patternTrajectories).toBe(2);
      expect(stats.auditTrajectories).toBe(1);
      expect(stats.totalSeeded).toBe(3);
      expect(stats.forceLearningTriggered).toBe(true);
      expect(stats.skipped).toBe(false);
    });

    it('should be idempotent (skip if already bootstrapped)', async () => {
      mockPrisma.featureFlag.findUnique.mockResolvedValueOnce({
        tenantId: '__system__',
        flag: 'SONA_BOOTSTRAPPED',
        enabled: true,
        mode: 'PRIMARY',
      });

      const stats = await service.bootstrap();

      expect(stats.skipped).toBe(true);
      expect(stats.skipReason).toContain('Already bootstrapped');
      expect(stats.totalSeeded).toBe(0);
    });

    it('should normalize quality scores to 0-1 range', async () => {
      await service.bootstrap();

      // Verify learn() was called with quality between 0 and 1
      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [
          string,
          { quality: number; state: Record<string, unknown>; action: string },
        ]
      >;
      for (const call of learnCalls) {
        if (call[1].state['__command']) continue; // Skip forceLearning trajectory
        expect(call[1].quality).toBeGreaterThanOrEqual(0);
        expect(call[1].quality).toBeLessThanOrEqual(1);
      }
    });

    it('should normalize PayeePattern quality based on matchCount', async () => {
      await service.bootstrap();

      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [
          string,
          {
            quality: number;
            action: string;
            metadata?: Record<string, unknown>;
          },
        ]
      >;

      // FNB has matchCount=120 (max), so quality should be 1.0
      const fnbCall = learnCalls.find(
        (c) => c[1].action === 'categorize:6600:Bank Charges & Fees',
      );
      expect(fnbCall).toBeDefined();
      expect(fnbCall![1].quality).toBe(1.0);

      // Woolworths has matchCount=42, so quality should be 42/120 = 0.35
      const woolworthsCall = learnCalls.find(
        (c) => c[1].action === 'categorize:5200:Food & Catering Costs',
      );
      expect(woolworthsCall).toBeDefined();
      expect(woolworthsCall![1].quality).toBe(42 / 120);
    });

    it('should include bootstrap source metadata', async () => {
      await service.bootstrap();

      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { metadata?: Record<string, unknown> }]
      >;
      const patternCall = learnCalls.find(
        (c) => c[1].metadata?.['source'] === 'bootstrap:payee-pattern',
      );
      expect(patternCall).toBeDefined();

      const auditCall = learnCalls.find(
        (c) => c[1].metadata?.['source'] === 'bootstrap:audit-log',
      );
      expect(auditCall).toBeDefined();
    });

    it('should set SONA_BOOTSTRAPPED flag after completion', async () => {
      await service.bootstrap();

      expect(mockPrisma.featureFlag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_flag: {
              tenantId: '__system__',
              flag: 'SONA_BOOTSTRAPPED',
            },
          },
          create: expect.objectContaining({
            tenantId: '__system__',
            flag: 'SONA_BOOTSTRAPPED',
            enabled: true,
            mode: 'PRIMARY',
          }),
        }),
      );
    });

    it('should trigger forceLearning when trajectories were seeded', async () => {
      await service.bootstrap();

      // forceLearning is triggered via a special trajectory
      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { action: string }]
      >;
      const forceCall = learnCalls.find(
        (c) => c[1].action === 'sona:forceLearning',
      );
      expect(forceCall).toBeDefined();
    });

    it('should not trigger forceLearning when no trajectories seeded', async () => {
      mockPrisma.payeePattern.findMany.mockResolvedValueOnce([]);
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([]);

      const stats = await service.bootstrap();

      expect(stats.forceLearningTriggered).toBe(false);
      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { action: string }]
      >;
      const forceCall = learnCalls.find(
        (c) => c[1].action === 'sona:forceLearning',
      );
      expect(forceCall).toBeUndefined();
    });

    it('should pass correct tenantId when calling learn()', async () => {
      await service.bootstrap();

      // Pattern calls should use the pattern's tenantId
      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { metadata?: Record<string, unknown> }]
      >;
      const patternCalls = learnCalls.filter(
        (c) => c[1].metadata?.['source'] === 'bootstrap:payee-pattern',
      );
      for (const call of patternCalls) {
        expect(call[0]).toBe(TENANT_ID);
      }

      // Audit log calls should use the log's tenantId
      const auditCalls = learnCalls.filter(
        (c) => c[1].metadata?.['source'] === 'bootstrap:audit-log',
      );
      for (const call of auditCalls) {
        expect(call[0]).toBe(TENANT_ID);
      }
    });

    it('should handle individual pattern seeding failures gracefully', async () => {
      // First learn call fails, second succeeds
      mockIntelligence.learn
        .mockRejectedValueOnce(new Error('Vector insert failed'))
        .mockResolvedValue(undefined);

      const stats = await service.bootstrap();

      // Should still seed the second pattern and audit log
      expect(stats.patternTrajectories).toBe(1);
      expect(stats.auditTrajectories).toBe(1);
      expect(stats.totalSeeded).toBe(2);
    });

    it('should parse JSON decision from audit logs', async () => {
      await service.bootstrap();

      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { action: string; metadata?: Record<string, unknown> }]
      >;
      const auditCall = learnCalls.find(
        (c) => c[1].metadata?.['source'] === 'bootstrap:audit-log',
      );
      expect(auditCall).toBeDefined();
      // Action should include the parsed accountCode from decision JSON
      expect(auditCall![1].action).toBe('categorizer:5200');
    });

    it('should handle non-JSON decision in audit logs', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([
        {
          tenantId: TENANT_ID,
          agentType: 'matcher',
          decision: 'plain-text-decision',
          confidence: 75,
          source: 'SDK',
          durationMs: 30,
          createdAt: new Date('2026-01-15'),
        },
      ]);

      const stats = await service.bootstrap();

      expect(stats.auditTrajectories).toBe(1);
      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { action: string; metadata?: Record<string, unknown> }]
      >;
      const auditCall = learnCalls.find(
        (c) => c[1].metadata?.['source'] === 'bootstrap:audit-log',
      );
      expect(auditCall).toBeDefined();
      // Non-JSON decision should fall back to 'unknown' action
      expect(auditCall![1].action).toBe('matcher:unknown');
    });

    it('should clamp audit log quality to 0-1', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([
        {
          tenantId: TENANT_ID,
          agentType: 'categorizer',
          decision: '{}',
          confidence: 150, // Exceeds 100 (edge case)
          source: 'HEURISTIC',
          durationMs: 10,
          createdAt: new Date('2026-01-15'),
        },
      ]);

      await service.bootstrap();

      const learnCalls = mockIntelligence.learn.mock.calls as Array<
        [string, { quality: number; metadata?: Record<string, unknown> }]
      >;
      const auditCall = learnCalls.find(
        (c) => c[1].metadata?.['source'] === 'bootstrap:audit-log',
      );
      expect(auditCall).toBeDefined();
      // 150/100 = 1.5, clamped to 1.0
      expect(auditCall![1].quality).toBe(1.0);
    });

    it('should use compound unique key for bootstrap flag check', async () => {
      await service.bootstrap();

      expect(mockPrisma.featureFlag.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_flag: {
            tenantId: '__system__',
            flag: 'SONA_BOOTSTRAPPED',
          },
        },
      });
    });
  });

  describe('onModuleInit', () => {
    it('should skip when bootstrap is disabled', async () => {
      mockPersistenceConfig.getConfig.mockReturnValueOnce({
        ...defaultPersistenceValues,
        bootstrapEnabled: false,
      });

      await service.onModuleInit();

      const stats = service.getBootstrapStats();
      expect(stats?.skipped).toBe(true);
      expect(stats?.skipReason).toContain('SONA_BOOTSTRAP_ENABLED=false');
    });

    it('should skip when IntelligenceEngine is not available', async () => {
      mockIntelligence.isAvailable.mockReturnValueOnce(false);

      await service.onModuleInit();

      const stats = service.getBootstrapStats();
      expect(stats?.skipped).toBe(true);
      expect(stats?.skipReason).toContain('IntelligenceEngine not available');
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.payeePattern.findMany.mockRejectedValueOnce(
        new Error('Database connection lost'),
      );

      await service.onModuleInit();

      const stats = service.getBootstrapStats();
      expect(stats?.skipped).toBe(true);
      expect(stats?.skipReason).toContain('Error');
    });

    it('should run bootstrap successfully in onModuleInit', async () => {
      await service.onModuleInit();

      const stats = service.getBootstrapStats();
      expect(stats).toBeDefined();
      expect(stats?.skipped).toBe(false);
      expect(stats?.totalSeeded).toBe(3);
    });
  });

  describe('getBootstrapStats', () => {
    it('should return null before bootstrap runs', () => {
      expect(service.getBootstrapStats()).toBeNull();
    });

    it('should return stats after bootstrap runs', async () => {
      await service.onModuleInit();
      const stats = service.getBootstrapStats();
      expect(stats).toBeDefined();
      expect(stats?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('graceful degradation without PrismaService', () => {
    let serviceWithoutPrisma: SonaBootstrapService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SonaBootstrapService,
          { provide: PrismaService, useValue: undefined },
          { provide: IntelligenceEngineService, useValue: mockIntelligence },
          { provide: PersistenceConfig, useValue: mockPersistenceConfig },
        ],
      }).compile();

      serviceWithoutPrisma =
        module.get<SonaBootstrapService>(SonaBootstrapService);
    });

    it('should skip bootstrap when Prisma is unavailable', async () => {
      await serviceWithoutPrisma.onModuleInit();

      const stats = serviceWithoutPrisma.getBootstrapStats();
      expect(stats?.skipped).toBe(true);
      expect(stats?.skipReason).toContain('PrismaService not available');
    });

    it('should return skipped stats from bootstrap() when Prisma is unavailable', async () => {
      const stats = await serviceWithoutPrisma.bootstrap();
      expect(stats.skipped).toBe(true);
      expect(stats.skipReason).toContain('PrismaService not available');
    });
  });
});
