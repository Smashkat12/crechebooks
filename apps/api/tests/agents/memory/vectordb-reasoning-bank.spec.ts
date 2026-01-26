/**
 * VectorDB Reasoning Bank Tests
 * TASK-STUB-006: ReasoningBank VectorDB Store (Decision Chain Persistence)
 *
 * @description Unit tests for VectorDBReasoningBank. ALL external dependencies
 * (ruvector, VectorDB) are fully mocked. Zero real API calls.
 *
 * CRITICAL:
 * - Every test mocks ALL dynamic imports
 * - Zero real VectorDB / EmbeddingService instances
 * - Tests cover: store, get, findSimilarReasoning, init failure,
 *   write failure recovery, tenant isolation, uninitialised state
 *
 * NOTE: VectorDBReasoningBank uses lazy initialization via ensureInitialized().
 * To bypass the dynamic import('ruvector'), we inject mock instances directly
 * into the adapter's private fields after construction. This is the standard
 * pattern for testing adapters with lazy-loaded dependencies.
 */

import { VectorDBReasoningBank } from '../../../src/agents/memory/vectordb-reasoning-bank';
import { AgentMemoryService } from '../../../src/agents/memory/agent-memory.service';
import type { RuvectorService } from '../../../src/agents/sdk/ruvector.service';
import type { ReasoningBankInterface } from '../../../src/agents/memory/interfaces/reasoning-bank.interface';
import type { EmbeddingResult } from '../../../src/agents/sdk/interfaces/embedding.interface';

// ────────────────────────────────────────────────────────────────────
// Mock factory types
// ────────────────────────────────────────────────────────────────────

interface MockVectorDb {
  insert: jest.Mock;
  search: jest.Mock;
}

function createMockVectorDb(): MockVectorDb {
  return {
    insert: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
  };
}

function createMockEmbeddingResult(vector?: number[]): EmbeddingResult {
  return {
    vector: vector ?? new Array(384).fill(0.1),
    provider: 'onnx-fallback',
    dimensions: 384,
    durationMs: 5,
  };
}

function createMockRuvector(
  available = true,
): jest.Mocked<
  Pick<RuvectorService, 'isAvailable' | 'generateEmbedding' | 'searchSimilar'>
> {
  return {
    isAvailable: jest.fn().mockReturnValue(available),
    generateEmbedding: jest.fn().mockResolvedValue(createMockEmbeddingResult()),
    searchSimilar: jest.fn().mockResolvedValue([]),
  };
}

/**
 * Injects mock instances into the bank's private fields and sets
 * initialized=true. This bypasses ensureInitialized()'s dynamic import().
 */
function injectMocks(
  bank: VectorDBReasoningBank,
  vectorDb: MockVectorDb,
): void {
  (bank as Record<string, unknown>)['vectorDb'] = vectorDb;
  (bank as Record<string, unknown>)['initialized'] = true;
}

// ────────────────────────────────────────────────────────────────────
// VectorDBReasoningBank Tests
// ────────────────────────────────────────────────────────────────────

describe('VectorDBReasoningBank', () => {
  let bank: VectorDBReasoningBank;
  let mockRuvector: jest.Mocked<
    Pick<RuvectorService, 'isAvailable' | 'generateEmbedding' | 'searchSimilar'>
  >;
  let mockVectorDb: MockVectorDb;

  beforeEach(() => {
    mockRuvector = createMockRuvector();
    mockVectorDb = createMockVectorDb();

    bank = new VectorDBReasoningBank(
      mockRuvector as unknown as RuvectorService,
    );

    // Inject mock VectorDB directly (bypass dynamic import)
    injectMocks(bank, mockVectorDb);
  });

  // ──────────────────────────────────────────────────────────────────
  // store()
  // ──────────────────────────────────────────────────────────────────

  describe('store', () => {
    it('should not throw when VectorDB is unavailable', async () => {
      mockRuvector.isAvailable.mockReturnValue(false);
      // Reset initialized to trigger ensureInitialized
      (bank as Record<string, unknown>)['initialized'] = false;

      await expect(
        bank.store({
          decisionId: 'dec-1',
          chain: 'Categorized as food because Woolworths is a grocery store',
          tenantId: 'tenant-abc',
        }),
      ).resolves.not.toThrow();
    });

    it('should generate embedding from chain text', async () => {
      await bank.store({
        decisionId: 'dec-1',
        chain: 'Woolworths categorized as 5200 Food & Catering',
        tenantId: 'tenant-abc',
      });

      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'Woolworths categorized as 5200 Food & Catering',
      );
    });

    it('should use tenant-scoped collection', async () => {
      await bank.store({
        decisionId: 'dec-1',
        chain: 'test chain',
        tenantId: 'tenant-xyz',
      });

      expect(mockVectorDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'reasoning-chains-tenant-xyz',
        }),
      );
    });

    it('should store decisionId in metadata', async () => {
      await bank.store({
        decisionId: 'dec-42',
        chain: 'test',
        tenantId: 't1',
      });

      expect(mockVectorDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'dec-42',
          metadata: expect.objectContaining({
            decisionId: 'dec-42',
            chain: 'test',
            tenantId: 't1',
          }),
        }),
      );
    });

    it('should store tenantId in metadata', async () => {
      await bank.store({
        decisionId: 'dec-1',
        chain: 'test',
        tenantId: 'tenant-isolation-test',
      });

      expect(mockVectorDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenantId: 'tenant-isolation-test',
          }),
        }),
      );
    });

    it('should store storedAt ISO timestamp in metadata', async () => {
      await bank.store({
        decisionId: 'dec-1',
        chain: 'test',
        tenantId: 't1',
      });

      const callArgs = mockVectorDb.insert.mock.calls[0][0] as {
        metadata: { storedAt: string };
      };
      expect(callArgs.metadata.storedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it('should stringify object chains', async () => {
      const chainObj = { step1: 'check patterns', step2: 'apply LLM' };

      await bank.store({
        decisionId: 'dec-1',
        chain: chainObj as unknown as string,
        tenantId: 't1',
      });

      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        JSON.stringify(chainObj),
      );

      expect(mockVectorDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            chain: JSON.stringify(chainObj),
          }),
        }),
      );
    });

    it('should pass embedding vector from EmbeddingResult to VectorDB insert', async () => {
      const testVector = [0.5, 0.6, 0.7];
      mockRuvector.generateEmbedding.mockResolvedValueOnce(
        createMockEmbeddingResult(testVector),
      );

      await bank.store({
        decisionId: 'dec-1',
        chain: 'test',
        tenantId: 't1',
      });

      expect(mockVectorDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: testVector,
        }),
      );
    });

    it('should not throw when VectorDB insert fails', async () => {
      mockVectorDb.insert.mockRejectedValueOnce(new Error('insert failed'));

      await expect(
        bank.store({
          decisionId: 'dec-1',
          chain: 'test',
          tenantId: 't1',
        }),
      ).resolves.not.toThrow();
    });

    it('should not throw when embedding generation fails', async () => {
      mockRuvector.generateEmbedding.mockRejectedValueOnce(
        new Error('embedding failed'),
      );

      await expect(
        bank.store({
          decisionId: 'dec-1',
          chain: 'test',
          tenantId: 't1',
        }),
      ).resolves.not.toThrow();
    });

    it('should return without storing when ruvector is not available after init', async () => {
      (bank as Record<string, unknown>)['initialized'] = false;
      mockRuvector.isAvailable.mockReturnValue(false);

      await bank.store({
        decisionId: 'dec-1',
        chain: 'test',
        tenantId: 't1',
      });

      expect(mockVectorDb.insert).not.toHaveBeenCalled();
      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // get()
  // ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return null when VectorDB is unavailable', async () => {
      (bank as Record<string, unknown>)['initialized'] = false;
      mockRuvector.isAvailable.mockReturnValue(false);

      const result = await bank.get('dec-1');
      expect(result).toBeNull();
    });

    it('should return chain text for exact decisionId match', async () => {
      mockVectorDb.search.mockResolvedValueOnce([
        {
          id: 'dec-1',
          score: 1.0,
          metadata: {
            decisionId: 'dec-1',
            chain: 'Found pattern for Woolworths \u2192 5200',
            tenantId: 't1',
          },
        },
      ]);

      const result = await bank.get('dec-1');
      expect(result).toBe('Found pattern for Woolworths \u2192 5200');
    });

    it('should return null when decisionId not found', async () => {
      mockVectorDb.search.mockResolvedValueOnce([]);

      const result = await bank.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when search returns null metadata', async () => {
      mockVectorDb.search.mockResolvedValueOnce([
        { id: 'dec-1', score: 1.0, metadata: undefined },
      ]);

      const result = await bank.get('dec-1');
      expect(result).toBeNull();
    });

    it('should search with decisionId filter', async () => {
      await bank.get('dec-123');

      expect(mockVectorDb.search).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            field: 'decisionId',
            op: 'eq',
            value: 'dec-123',
          },
          limit: 1,
        }),
      );
    });

    it('should return null when VectorDB search throws', async () => {
      mockVectorDb.search.mockRejectedValueOnce(new Error('search error'));

      const result = await bank.get('dec-1');
      expect(result).toBeNull();
    });

    it('should return null when results is null', async () => {
      mockVectorDb.search.mockResolvedValueOnce(null);

      const result = await bank.get('dec-1');
      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // findSimilarReasoning()
  // ──────────────────────────────────────────────────────────────────

  describe('findSimilarReasoning', () => {
    it('should return empty array when VectorDB unavailable', async () => {
      (bank as Record<string, unknown>)['initialized'] = false;
      mockRuvector.isAvailable.mockReturnValue(false);

      const results = await bank.findSimilarReasoning('test', 't1');
      expect(results).toEqual([]);
    });

    it('should return empty array when ruvector is not provided', async () => {
      const bankNoRuvector = new VectorDBReasoningBank();
      (bankNoRuvector as Record<string, unknown>)['initialized'] = false;

      const results = await bankNoRuvector.findSimilarReasoning('test', 't1');
      expect(results).toEqual([]);
    });

    it('should search with tenant-scoped collection', async () => {
      await bank.findSimilarReasoning('food categorization', 'tenant-abc', 3);

      expect(mockVectorDb.search).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'reasoning-chains-tenant-abc',
          limit: 3,
        }),
      );
    });

    it('should generate embedding for query text', async () => {
      await bank.findSimilarReasoning('food categorization', 't1');

      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'food categorization',
      );
    });

    it('should pass query embedding vector to VectorDB search', async () => {
      const queryVector = [0.2, 0.3, 0.4];
      mockRuvector.generateEmbedding.mockResolvedValueOnce(
        createMockEmbeddingResult(queryVector),
      );

      await bank.findSimilarReasoning('test', 't1');

      expect(mockVectorDb.search).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: queryVector,
        }),
      );
    });

    it('should return similarity results with proper shape', async () => {
      mockVectorDb.search.mockResolvedValueOnce([
        {
          id: 'dec-1',
          score: 0.92,
          metadata: {
            decisionId: 'dec-1',
            chain: 'Woolworths matched to Food & Catering (5200)',
            storedAt: '2026-01-20T10:00:00Z',
          },
        },
        {
          id: 'dec-2',
          score: 0.87,
          metadata: {
            decisionId: 'dec-2',
            chain: 'Pick n Pay matched to Food & Catering (5200)',
            storedAt: '2026-01-21T10:00:00Z',
          },
        },
      ]);

      const results = await bank.findSimilarReasoning('grocery food', 't1', 5);

      expect(results).toHaveLength(2);
      expect(results[0].decisionId).toBe('dec-1');
      expect(results[0].chain).toContain('Woolworths');
      expect(results[0].similarity).toBe(0.92);
      expect(results[0].storedAt).toBe('2026-01-20T10:00:00Z');
      expect(results[1].decisionId).toBe('dec-2');
      expect(results[1].similarity).toBe(0.87);
    });

    it('should default k to 5', async () => {
      await bank.findSimilarReasoning('test', 't1');

      expect(mockVectorDb.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 }),
      );
    });

    it('should return empty array when search returns empty', async () => {
      mockVectorDb.search.mockResolvedValueOnce([]);

      const results = await bank.findSimilarReasoning('test', 't1');
      expect(results).toEqual([]);
    });

    it('should return empty array when search returns null', async () => {
      mockVectorDb.search.mockResolvedValueOnce(null);

      const results = await bank.findSimilarReasoning('test', 't1');
      expect(results).toEqual([]);
    });

    it('should return empty array when search throws', async () => {
      mockVectorDb.search.mockRejectedValueOnce(new Error('search error'));

      const results = await bank.findSimilarReasoning('test', 't1');
      expect(results).toEqual([]);
    });

    it('should return empty array when embedding generation fails', async () => {
      mockRuvector.generateEmbedding.mockRejectedValueOnce(
        new Error('embed error'),
      );

      const results = await bank.findSimilarReasoning('test', 't1');
      expect(results).toEqual([]);
    });

    it('should use r.id as fallback decisionId when metadata.decisionId is missing', async () => {
      mockVectorDb.search.mockResolvedValueOnce([
        {
          id: 'fallback-id',
          score: 0.8,
          metadata: {
            chain: 'some chain',
          },
        },
      ]);

      const results = await bank.findSimilarReasoning('test', 't1');

      expect(results[0].decisionId).toBe('fallback-id');
    });

    it('should handle missing storedAt gracefully', async () => {
      mockVectorDb.search.mockResolvedValueOnce([
        {
          id: 'dec-1',
          score: 0.9,
          metadata: {
            decisionId: 'dec-1',
            chain: 'test chain',
            // storedAt intentionally missing
          },
        },
      ]);

      const results = await bank.findSimilarReasoning('test', 't1');

      expect(results[0].storedAt).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Tenant Isolation
  // ──────────────────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('should use different collections for different tenants on store', async () => {
      await bank.store({
        decisionId: 'dec-1',
        chain: 'chain-1',
        tenantId: 'tenant-A',
      });

      await bank.store({
        decisionId: 'dec-2',
        chain: 'chain-2',
        tenantId: 'tenant-B',
      });

      expect(mockVectorDb.insert).toHaveBeenCalledTimes(2);
      expect(mockVectorDb.insert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          collection: 'reasoning-chains-tenant-A',
        }),
      );
      expect(mockVectorDb.insert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          collection: 'reasoning-chains-tenant-B',
        }),
      );
    });

    it('should use different collections for different tenants on findSimilarReasoning', async () => {
      await bank.findSimilarReasoning('test', 'tenant-X', 3);
      await bank.findSimilarReasoning('test', 'tenant-Y', 3);

      expect(mockVectorDb.search).toHaveBeenCalledTimes(2);
      expect(mockVectorDb.search).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          collection: 'reasoning-chains-tenant-X',
        }),
      );
      expect(mockVectorDb.search).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          collection: 'reasoning-chains-tenant-Y',
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────────────────────────────────

  describe('initialization', () => {
    it('should skip init when ruvector is not available', async () => {
      const freshBank = new VectorDBReasoningBank(
        createMockRuvector(false) as unknown as RuvectorService,
      );

      // store should not throw, just silently skip
      await expect(
        freshBank.store({
          decisionId: 'dec-1',
          chain: 'test',
          tenantId: 't1',
        }),
      ).resolves.not.toThrow();
    });

    it('should skip init when ruvector is not provided', async () => {
      const freshBank = new VectorDBReasoningBank();

      await expect(
        freshBank.store({
          decisionId: 'dec-1',
          chain: 'test',
          tenantId: 't1',
        }),
      ).resolves.not.toThrow();

      const result = await freshBank.get('dec-1');
      expect(result).toBeNull();
    });

    it('should only initialize once (idempotent)', async () => {
      // ensureInitialized is already true from injectMocks
      // Calling store twice should not re-initialize
      await bank.store({
        decisionId: 'dec-1',
        chain: 'test',
        tenantId: 't1',
      });
      await bank.store({
        decisionId: 'dec-2',
        chain: 'test2',
        tenantId: 't1',
      });

      // Both should use the same vectorDb instance
      expect(mockVectorDb.insert).toHaveBeenCalledTimes(2);
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// AgentMemoryService with VectorDBReasoningBank Integration Tests
// ────────────────────────────────────────────────────────────────────

describe('AgentMemoryService with VectorDBReasoningBank', () => {
  it('should use injected ReasoningBank when provided', async () => {
    const storeSpy = jest.fn().mockResolvedValue(undefined);
    const getSpy = jest.fn().mockResolvedValue(null);
    const bank: ReasoningBankInterface = { store: storeSpy, get: getSpy };

    const service = new AgentMemoryService(
      undefined, // prisma
      undefined, // ruvector
      undefined, // patternLearner
      undefined, // agentDb
      bank,
    );

    const recordId = await service.storeDecision({
      tenantId: 't1',
      agentType: 'categorizer',
      inputHash: 'hash-1',
      inputText: 'test',
      decision: {},
      confidence: 85,
      source: 'LLM',
      reasoningChain: 'LLM decided this is food',
    });

    expect(recordId).toBeDefined();

    // The store is fire-and-forget so we give it a tick to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(storeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: 'LLM decided this is food',
        tenantId: 't1',
      }),
    );
  });

  it('should not call reasoning bank when no reasoningChain is provided', async () => {
    const storeSpy = jest.fn().mockResolvedValue(undefined);
    const bank: ReasoningBankInterface = {
      store: storeSpy,
      get: jest.fn().mockResolvedValue(null),
    };

    const service = new AgentMemoryService(
      undefined,
      undefined,
      undefined,
      undefined,
      bank,
    );

    await service.storeDecision({
      tenantId: 't1',
      agentType: 'categorizer',
      inputHash: 'hash-1',
      inputText: 'test',
      decision: {},
      confidence: 85,
      source: 'LLM',
      // no reasoningChain
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(storeSpy).not.toHaveBeenCalled();
  });

  it('should fall back to no-op when VectorDBReasoningBank is not provided', async () => {
    // @Optional() injection returns undefined -- service uses in-line stub
    const service = new AgentMemoryService();
    // Should not throw
    await expect(
      service.storeDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputHash: 'h1',
        inputText: 'test',
        decision: {},
        confidence: 80,
        source: 'PATTERN',
        reasoningChain: 'This should not throw even without a bank',
      }),
    ).resolves.toBeDefined();
  });

  it('should not throw when reasoning bank store rejects', async () => {
    const storeSpy = jest
      .fn()
      .mockRejectedValue(new Error('reasoning bank error'));
    const bank: ReasoningBankInterface = {
      store: storeSpy,
      get: jest.fn().mockResolvedValue(null),
    };

    const service = new AgentMemoryService(
      undefined,
      undefined,
      undefined,
      undefined,
      bank,
    );

    // storeDecision itself should not throw because reasoning bank is fire-and-forget
    await expect(
      service.storeDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputHash: 'h1',
        inputText: 'test',
        decision: {},
        confidence: 80,
        source: 'LLM',
        reasoningChain: 'test chain',
      }),
    ).resolves.toBeDefined();

    // Wait for fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('should pass decisionId from Prisma record to reasoning bank', async () => {
    const storeSpy = jest.fn().mockResolvedValue(undefined);
    const bank: ReasoningBankInterface = {
      store: storeSpy,
      get: jest.fn().mockResolvedValue(null),
    };

    const service = new AgentMemoryService(
      undefined, // no prisma -> will use randomUUID
      undefined,
      undefined,
      undefined,
      bank,
    );

    const recordId = await service.storeDecision({
      tenantId: 't1',
      agentType: 'categorizer',
      inputHash: 'h1',
      inputText: 'test',
      decision: {},
      confidence: 80,
      source: 'LLM',
      reasoningChain: 'chain text',
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(storeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: recordId,
        chain: 'chain text',
        tenantId: 't1',
      }),
    );
  });
});
