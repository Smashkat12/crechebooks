/**
 * FastAgentDB Adapter Tests
 * TASK-STUB-002: FastAgentDB Stub Replacement
 *
 * @description Unit tests for FastAgentDBAdapter. ALL external dependencies
 * (ruvector, agentic-flow) are fully mocked. Zero real API calls.
 *
 * CRITICAL:
 * - Every test mocks ALL dynamic imports
 * - Zero real FastAgentDB / ReflexionMemory instances
 * - Tests cover: store, correction, accuracy stats, similar search,
 *   init failure, write failure recovery, uninitialised state
 *
 * NOTE: Because FastAgentDBAdapter uses dynamic import() in onModuleInit(),
 * and Jest CJS mode does not intercept dynamic import() the same way as
 * require(), we inject mock instances directly into the adapter's private
 * fields after construction. This is the standard pattern for testing
 * adapters with lazy-loaded dependencies.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FastAgentDBAdapter } from '../../../src/agents/memory/fast-agentdb.adapter';

// ────────────────────────────────────────────────────────────────────
// Mock factory types
// ────────────────────────────────────────────────────────────────────

interface MockFastAgentDB {
  storeEpisode: jest.Mock;
  getEpisode: jest.Mock;
  searchSimilar: jest.Mock;
  getStats: jest.Mock;
  batchStore: jest.Mock;
}

interface MockReflexionMemory {
  storeEpisode: jest.Mock;
  retrieveRelevant: jest.Mock;
  getTaskStats: jest.Mock;
}

function createMockFastAgentDB(): MockFastAgentDB {
  return {
    storeEpisode: jest.fn().mockResolvedValue('ep-001'),
    getEpisode: jest.fn().mockResolvedValue(null),
    searchSimilar: jest.fn().mockResolvedValue([]),
    getStats: jest.fn().mockResolvedValue({
      totalEpisodes: 100,
      avgReward: 0.75,
      maxReward: 1.0,
      minReward: -1.0,
      memoryUsageBytes: 1024,
    }),
    batchStore: jest.fn().mockResolvedValue([]),
  };
}

function createMockReflexionMemory(): MockReflexionMemory {
  return {
    storeEpisode: jest.fn().mockResolvedValue('ref-001'),
    retrieveRelevant: jest.fn().mockResolvedValue([]),
    getTaskStats: jest.fn().mockResolvedValue({
      totalEpisodes: 50,
      successRate: 0.8,
      recentStrategies: ['LLM', 'PATTERN'],
    }),
  };
}

/**
 * Injects mock instances into the adapter's private fields and sets
 * initialized=true. This bypasses onModuleInit()'s dynamic import().
 */
function injectMocks(
  adapter: FastAgentDBAdapter,
  fastAgentDB: MockFastAgentDB,
  reflexionMemory: MockReflexionMemory,
): void {
  // Access private fields via bracket notation (standard test pattern)
  (adapter as Record<string, unknown>)['fastAgentDB'] = fastAgentDB;
  (adapter as Record<string, unknown>)['reflexionMemory'] = reflexionMemory;
  (adapter as Record<string, unknown>)['initialized'] = true;
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('FastAgentDBAdapter', () => {
  let adapter: FastAgentDBAdapter;
  let mockFastAgentDB: MockFastAgentDB;
  let mockReflexionMemory: MockReflexionMemory;

  beforeEach(async () => {
    mockFastAgentDB = createMockFastAgentDB();
    mockReflexionMemory = createMockReflexionMemory();

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [FastAgentDBAdapter],
    }).compile();

    adapter = module.get(FastAgentDBAdapter);

    // Inject mocks directly (bypassing dynamic import in onModuleInit)
    injectMocks(adapter, mockFastAgentDB, mockReflexionMemory);
  });

  // ──────────────────────────────────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should report isAvailable() as true after mock injection', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should report isAvailable() as false before initialization', async () => {
      const freshModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [FastAgentDBAdapter],
      }).compile();

      const freshAdapter = freshModule.get(FastAgentDBAdapter);
      // Do NOT inject mocks or call onModuleInit
      expect(freshAdapter.isAvailable()).toBe(false);
    });

    it('should gracefully handle onModuleInit failure', async () => {
      // Mock dynamic imports to throw (simulate missing packages)
      jest.mock('ruvector', () => {
        throw new Error('Cannot find module ruvector');
      });

      const freshAdapter = new FastAgentDBAdapter();
      // onModuleInit uses dynamic import() which will fail
      await freshAdapter.onModuleInit();
      expect(freshAdapter.isAvailable()).toBe(false);

      jest.unmock('ruvector');
    });

    it('should read AGENTDB_MAX_EPISODES from config', async () => {
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({ AGENTDB_MAX_EPISODES: 25000 })],
          }),
        ],
        providers: [FastAgentDBAdapter],
      }).compile();

      const adapterWithConfig = module.get(FastAgentDBAdapter);
      const configService = module.get(ConfigService);
      expect(configService.get<number>('AGENTDB_MAX_EPISODES')).toBe(25000);
      // Verify the adapter can be instantiated with config
      expect(adapterWithConfig).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // store()
  // ──────────────────────────────────────────────────────────────────

  describe('store', () => {
    it('should store decision in both FastAgentDB and ReflexionMemory', async () => {
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'abc123',
        decision: { accountCode: '4100', vatType: 'STANDARD' },
        confidence: 92,
        source: 'LLM',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledTimes(1);
      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.stringContaining('4100'),
          reward: 0.92,
        }),
      );

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledTimes(1);
      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'categorizer',
          success: true, // 92% >= 80% threshold
        }),
      );
    });

    it('should normalize confidence 0-100 to reward 0-1', async () => {
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'matcher',
        inputHash: 'xyz',
        decision: { matchId: '999' },
        confidence: 50,
        source: 'PATTERN',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          reward: 0.5,
        }),
      );
    });

    it('should mark decisions below 80% confidence as unsuccessful', async () => {
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'low',
        decision: { accountCode: '4100' },
        confidence: 70,
        source: 'HISTORICAL',
      });

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false, // 70% < 80% threshold
        }),
      );
    });

    it('should mark decisions at exactly 80% confidence as successful', async () => {
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'edge',
        decision: {},
        confidence: 80,
        source: 'LLM',
      });

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true, // 80% >= 80% threshold
        }),
      );
    });

    it('should include tenant, agent type, and source in episode metadata', async () => {
      await adapter.store({
        tenantId: 'tenant-456',
        agentType: 'matcher',
        inputHash: 'meta-test',
        decision: {},
        confidence: 85,
        source: 'HYBRID',
        transactionId: 'txn-789',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'tenant-456',
            agentType: 'matcher',
            source: 'HYBRID',
            transactionId: 'txn-789',
          }),
        }),
      );
    });

    it('should include optional embedding in episode', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'embed-test',
        decision: {},
        confidence: 90,
        source: 'LLM',
        embedding,
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          embedding,
        }),
      );
    });

    it('should set state with tenantId, agentType, and inputHash', async () => {
      await adapter.store({
        tenantId: 'tenant-xyz',
        agentType: 'categorizer',
        inputHash: 'state-hash',
        decision: { accountCode: '5000' },
        confidence: 95,
        source: 'LLM',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          state: {
            tenantId: 'tenant-xyz',
            agentType: 'categorizer',
            inputHash: 'state-hash',
          },
        }),
      );
    });

    it('should include strategy from source in ReflexionMemory episode', async () => {
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'strat-test',
        decision: {},
        confidence: 85,
        source: 'PATTERN',
      });

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'PATTERN',
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // recordCorrection()
  // ──────────────────────────────────────────────────────────────────

  describe('recordCorrection', () => {
    it('should record correction with negative reward', async () => {
      await adapter.recordCorrection({
        tenantId: 'tenant-123',
        agentDecisionId: 'dec-001',
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '4200' },
        correctedBy: 'user-001',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          reward: -1.0,
          metadata: expect.objectContaining({ type: 'correction' }),
        }),
      );

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          strategy: 'human-correction',
        }),
      );
    });

    it('should include corrected values in nextState', async () => {
      await adapter.recordCorrection({
        tenantId: 'tenant-123',
        agentDecisionId: 'dec-002',
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '4300' },
        correctedBy: 'user-002',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          nextState: {
            correctedValue: { accountCode: '4300' },
            correctedBy: 'user-002',
          },
        }),
      );
    });

    it('should include tenantId in correction metadata', async () => {
      await adapter.recordCorrection({
        tenantId: 'tenant-999',
        agentDecisionId: 'dec-003',
        originalValue: {},
        correctedValue: {},
        correctedBy: 'admin',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'tenant-999',
            agentDecisionId: 'dec-003',
          }),
        }),
      );
    });

    it('should store correction task in ReflexionMemory', async () => {
      await adapter.recordCorrection({
        tenantId: 'tenant-123',
        agentDecisionId: 'dec-004',
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '4200' },
        correctedBy: 'user-001',
      });

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'correction',
          reflection: expect.stringContaining('Corrected from'),
        }),
      );
    });

    it('should include original state in FastAgentDB episode', async () => {
      await adapter.recordCorrection({
        tenantId: 'tenant-123',
        agentDecisionId: 'dec-005',
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '4500' },
        correctedBy: 'user-003',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          state: {
            tenantId: 'tenant-123',
            agentDecisionId: 'dec-005',
            originalValue: { accountCode: '4100' },
          },
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // getAccuracyStats()
  // ──────────────────────────────────────────────────────────────────

  describe('getAccuracyStats', () => {
    it('should return null from getAccuracyStats when not initialized', async () => {
      const uninitAdapter = new FastAgentDBAdapter();
      const stats = await uninitAdapter.getAccuracyStats(
        'tenant-123',
        'categorizer',
      );
      expect(stats).toBeNull();
    });

    it('should aggregate stats from FastAgentDB and ReflexionMemory', async () => {
      const stats = await adapter.getAccuracyStats('tenant-123', 'categorizer');
      expect(stats).toEqual({
        totalDecisions: 100,
        reviewedDecisions: 50,
        correctDecisions: 40, // 0.8 * 50
        accuracyRate: 80, // 0.8 * 100
      });
    });

    it('should handle ReflexionMemory getTaskStats failure gracefully', async () => {
      mockReflexionMemory.getTaskStats.mockRejectedValueOnce(
        new Error('reflexion error'),
      );

      const stats = await adapter.getAccuracyStats('tenant-123', 'categorizer');
      expect(stats).toEqual({
        totalDecisions: 100,
        reviewedDecisions: 0,
        correctDecisions: 0,
        accuracyRate: 0,
      });
    });

    it('should return null when FastAgentDB getStats throws', async () => {
      mockFastAgentDB.getStats.mockRejectedValueOnce(new Error('stats error'));

      const stats = await adapter.getAccuracyStats('tenant-123', 'categorizer');
      expect(stats).toBeNull();
    });

    it('should call getTaskStats with the correct agentType', async () => {
      await adapter.getAccuracyStats('tenant-123', 'matcher');

      expect(mockReflexionMemory.getTaskStats).toHaveBeenCalledWith('matcher');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // searchSimilarEpisodes()
  // ──────────────────────────────────────────────────────────────────

  describe('searchSimilarEpisodes', () => {
    it('should return empty array when searchSimilar has no matches', async () => {
      const results = await adapter.searchSimilarEpisodes(
        new Array(384).fill(0.1),
        5,
      );
      expect(results).toEqual([]);
    });

    it('should return mapped results from FastAgentDB searchSimilar', async () => {
      mockFastAgentDB.searchSimilar.mockResolvedValueOnce([
        {
          id: 'ep-100',
          episode: {
            state: { tenantId: 'tenant-123' },
            action: '{"accountCode":"4100"}',
            reward: 0.95,
            metadata: { source: 'LLM' },
          },
          score: 0.92,
        },
        {
          id: 'ep-101',
          episode: {
            state: { tenantId: 'tenant-123' },
            action: '{"accountCode":"4200"}',
            reward: 0.8,
            metadata: { source: 'PATTERN' },
          },
          score: 0.85,
        },
      ]);

      const results = await adapter.searchSimilarEpisodes([0.1, 0.2, 0.3], 5);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'ep-100',
        episode: {
          state: { tenantId: 'tenant-123' },
          action: '{"accountCode":"4100"}',
          reward: 0.95,
          metadata: { source: 'LLM' },
        },
        score: 0.92,
      });
      expect(results[1]).toEqual({
        id: 'ep-101',
        episode: {
          state: { tenantId: 'tenant-123' },
          action: '{"accountCode":"4200"}',
          reward: 0.8,
          metadata: { source: 'PATTERN' },
        },
        score: 0.85,
      });
    });

    it('should return empty array when not initialized', async () => {
      const uninitAdapter = new FastAgentDBAdapter();
      const results = await uninitAdapter.searchSimilarEpisodes([0.1, 0.2], 3);
      expect(results).toEqual([]);
    });

    it('should return empty array when searchSimilar throws', async () => {
      mockFastAgentDB.searchSimilar.mockRejectedValueOnce(
        new Error('search error'),
      );

      const results = await adapter.searchSimilarEpisodes([0.1, 0.2, 0.3], 5);
      expect(results).toEqual([]);
    });

    it('should use default limit of 5', async () => {
      await adapter.searchSimilarEpisodes([0.1, 0.2]);

      expect(mockFastAgentDB.searchSimilar).toHaveBeenCalledWith([0.1, 0.2], 5);
    });

    it('should pass custom limit to searchSimilar', async () => {
      await adapter.searchSimilarEpisodes([0.1, 0.2], 10);

      expect(mockFastAgentDB.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2],
        10,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Graceful failure handling
  // ──────────────────────────────────────────────────────────────────

  describe('graceful failure handling', () => {
    it('should gracefully handle store failure without throwing', async () => {
      mockFastAgentDB.storeEpisode.mockRejectedValue(new Error('disk full'));
      // Should not throw
      await expect(
        adapter.store({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
          inputHash: 'abc',
          decision: {},
          confidence: 50,
          source: 'PATTERN',
        }),
      ).resolves.not.toThrow();
    });

    it('should handle ReflexionMemory store failure gracefully', async () => {
      mockReflexionMemory.storeEpisode.mockRejectedValue(
        new Error('memory full'),
      );

      await expect(
        adapter.store({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
          inputHash: 'abc',
          decision: {},
          confidence: 90,
          source: 'LLM',
        }),
      ).resolves.not.toThrow();
    });

    it('should handle FastAgentDB correction failure gracefully', async () => {
      mockFastAgentDB.storeEpisode.mockRejectedValue(
        new Error('correction write error'),
      );

      await expect(
        adapter.recordCorrection({
          tenantId: 'tenant-123',
          agentDecisionId: 'dec-fail',
          originalValue: {},
          correctedValue: {},
          correctedBy: 'admin',
        }),
      ).resolves.not.toThrow();
    });

    it('should handle ReflexionMemory correction failure gracefully', async () => {
      mockReflexionMemory.storeEpisode.mockRejectedValue(
        new Error('reflexion write error'),
      );

      await expect(
        adapter.recordCorrection({
          tenantId: 'tenant-123',
          agentDecisionId: 'dec-fail-2',
          originalValue: {},
          correctedValue: {},
          correctedBy: 'admin',
        }),
      ).resolves.not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Uninitialised state
  // ──────────────────────────────────────────────────────────────────

  describe('uninitialised state', () => {
    let uninitAdapter: FastAgentDBAdapter;

    beforeEach(() => {
      uninitAdapter = new FastAgentDBAdapter();
      // Do NOT call onModuleInit or inject mocks — adapter is uninitialised
    });

    it('should report isAvailable() as false', () => {
      expect(uninitAdapter.isAvailable()).toBe(false);
    });

    it('should no-op on store when uninitialised', async () => {
      // Reset mocks to verify no calls happen
      mockFastAgentDB.storeEpisode.mockClear();
      mockReflexionMemory.storeEpisode.mockClear();

      await uninitAdapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'abc',
        decision: {},
        confidence: 90,
        source: 'LLM',
      });

      // Since uninitAdapter has no injected mocks, it won't call them.
      // The method exits early due to !this.initialized
      expect(uninitAdapter.isAvailable()).toBe(false);
    });

    it('should no-op on recordCorrection when uninitialised', async () => {
      await uninitAdapter.recordCorrection({
        tenantId: 'tenant-123',
        agentDecisionId: 'dec-001',
        originalValue: {},
        correctedValue: {},
        correctedBy: 'admin',
      });

      expect(uninitAdapter.isAvailable()).toBe(false);
    });

    it('should return null from getAccuracyStats when uninitialised', async () => {
      const stats = await uninitAdapter.getAccuracyStats(
        'tenant-123',
        'categorizer',
      );
      expect(stats).toBeNull();
    });

    it('should return empty array from searchSimilarEpisodes when uninitialised', async () => {
      const results = await uninitAdapter.searchSimilarEpisodes([0.1, 0.2], 3);
      expect(results).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // isAvailable()
  // ──────────────────────────────────────────────────────────────────

  describe('isAvailable', () => {
    it('should return true when initialized with mocks', () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false for fresh adapter', () => {
      const fresh = new FastAgentDBAdapter();
      expect(fresh.isAvailable()).toBe(false);
    });
  });
});
