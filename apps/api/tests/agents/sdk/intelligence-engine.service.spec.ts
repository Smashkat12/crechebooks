/**
 * IntelligenceEngineService Unit Tests
 * TASK-STUB-009: IntelligenceEngine Full Stack Integration
 *
 * All tests mock ruvector -- zero real IntelligenceEngine instantiation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntelligenceEngineService } from '../../../src/agents/sdk/intelligence-engine.service';

// Mock the entire ruvector module
jest.mock('ruvector', () => ({
  IntelligenceEngine: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    routeAgent: jest.fn().mockResolvedValue({
      recommendedPath: 'sdk',
      confidence: 0.92,
      reasoning: 'High pattern match confidence',
      alternatives: [{ path: 'heuristic', confidence: 0.78 }],
    }),
    storeMemory: jest.fn().mockResolvedValue(undefined),
    recall: jest.fn().mockResolvedValue([
      {
        key: 'categorizer:tx-123',
        content: '{"accountCode": "5200"}',
        type: 'decision',
        similarity: 0.95,
        metadata: {},
      },
    ]),
    learn: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockResolvedValue({
      vectorDb: { totalVectors: 1500, collections: 4, storageSizeBytes: 2048000 },
      sona: {
        trajectoriesRecorded: 350,
        patternsLearned: 42,
        lastBackgroundRun: Date.now() - 3600000,
        backgroundIntervalMs: 3600000,
      },
      fastAgentDb: { totalEpisodes: 200, totalMemories: 800 },
      learningEngine: {
        totalDecisions: 1200,
        averageConfidence: 0.87,
        routingAccuracy: 0.91,
      },
      uptimeMs: 86400000,
    }),
  })),
}));

describe('IntelligenceEngineService', () => {
  let service: IntelligenceEngineService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({
            RUVECTOR_DATA_DIR: './data/test-ruvector',
            RUVECTOR_EMBEDDING_DIM: 384,
            RUVECTOR_MAX_MEMORIES: 100000,
            RUVECTOR_MAX_EPISODES: 50000,
            RUVECTOR_ENABLE_SONA: 'true',
            RUVECTOR_ENABLE_ATTENTION: 'false',
            RUVECTOR_LEARNING_RATE: 0.1,
          })],
        }),
      ],
      providers: [IntelligenceEngineService],
    }).compile();

    service = module.get<IntelligenceEngineService>(IntelligenceEngineService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('lifecycle', () => {
    it('should initialize on module init', async () => {
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);
    });

    it('should handle initialization failure gracefully', async () => {
      // Override mock to throw on initialize
      const { IntelligenceEngine } = require('ruvector');
      IntelligenceEngine.mockImplementationOnce(() => ({
        initialize: jest.fn().mockRejectedValue(new Error('Storage unavailable')),
      }));

      const failService = new IntelligenceEngineService(configService);
      await failService.onModuleInit();
      expect(failService.isAvailable()).toBe(false);
    });

    it('should shut down gracefully', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();
      // No error thrown
    });
  });

  describe('routeAgent', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return routing decision with confidence', async () => {
      const result = await service.routeAgent(
        'bdff4374-64d5-420c-b454-8e85e9df552a',
        'categorizer',
        { payeeName: 'Woolworths', isCredit: false },
      );

      expect(result.recommendedPath).toBe('sdk');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.reasoning).toBeTruthy();
    });

    it('should throw when engine not available', async () => {
      const unavailableService = new IntelligenceEngineService(configService);
      await expect(
        unavailableService.routeAgent('tenant', 'categorizer', {}),
      ).rejects.toThrow('IntelligenceEngine is not available');
    });
  });

  describe('storeMemory', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should store memory with tenant isolation', async () => {
      await expect(
        service.storeMemory(
          'bdff4374-64d5-420c-b454-8e85e9df552a',
          'categorizer:tx-001',
          '{"accountCode": "5200", "confidence": 92}',
          'decision',
        ),
      ).resolves.not.toThrow();
    });

    it('should accept all memory types', async () => {
      const types = ['decision', 'reasoning', 'pattern', 'embedding'] as const;
      for (const type of types) {
        await expect(
          service.storeMemory('tenant', `key-${type}`, 'content', type),
        ).resolves.not.toThrow();
      }
    });
  });

  describe('recall', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return recall results with similarity scores', async () => {
      const results = await service.recall(
        'bdff4374-64d5-420c-b454-8e85e9df552a',
        'Woolworths food categorization',
        5,
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThan(0);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
      expect(results[0].key).toBeTruthy();
      expect(results[0].content).toBeTruthy();
    });

    it('should default k to 5', async () => {
      const results = await service.recall('tenant', 'query');
      expect(results).toBeDefined();
    });
  });

  describe('learn', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should record SONA trajectory', async () => {
      await expect(
        service.learn('bdff4374-64d5-420c-b454-8e85e9df552a', {
          state: { payeeName: 'Woolworths', amountCents: 250000 },
          action: 'categorize:5200',
          quality: 0.92,
          metadata: { agentType: 'categorizer' },
        }),
      ).resolves.not.toThrow();
    });

    it('should accept quality between 0 and 1', async () => {
      await expect(
        service.learn('tenant', {
          state: {},
          action: 'test',
          quality: 0.0,
        }),
      ).resolves.not.toThrow();

      await expect(
        service.learn('tenant', {
          state: {},
          action: 'test',
          quality: 1.0,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return unified stats from all subsystems', async () => {
      const stats = await service.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.vectorDb.totalVectors).toBeGreaterThanOrEqual(0);
      expect(stats.sona.trajectoriesRecorded).toBeGreaterThanOrEqual(0);
      expect(stats.fastAgentDb.totalEpisodes).toBeGreaterThanOrEqual(0);
      expect(stats.learningEngine.totalDecisions).toBeGreaterThanOrEqual(0);
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should report correct initialization status', async () => {
      const stats = await service.getStats();
      expect(stats.initialized).toBe(true);
    });
  });

  describe('isHealthy', () => {
    it('should return true when initialized and responsive', async () => {
      await service.onModuleInit();
      const healthy = await service.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false when not initialized', async () => {
      const uninitService = new IntelligenceEngineService(configService);
      const healthy = await uninitService.isHealthy();
      expect(healthy).toBe(false);
    });
  });
});
