/**
 * GnnPatternAdapter Tests
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * Tests GNN pattern learning, prediction, EWC consolidation,
 * graceful degradation, and dual-write to Prisma.
 */

import { GnnPatternAdapter } from '../../../src/agents/memory/gnn-pattern-adapter';
import type { PrismaService } from '../../../src/database/prisma/prisma.service';

/**
 * Typed interface for internal adapter state access in tests.
 * Replaces 'any' cast with explicit property access.
 */
interface GnnPatternAdapterTestAccess {
  ruvectorLayer: {
    forward: jest.Mock;
    computeFisherInformation?: jest.Mock;
  } | null;
  initialized: boolean;
  embeddingCache: Map<string, Float32Array>;
  accessCounts: Map<string, number>;
}

/**
 * Helper to access internal adapter properties for test setup.
 * Uses a typed interface instead of 'any'.
 */
function getTestAccess(
  adapter: GnnPatternAdapter,
): GnnPatternAdapterTestAccess {
  return adapter as unknown as GnnPatternAdapterTestAccess;
}

describe('GnnPatternAdapter', () => {
  let adapter: GnnPatternAdapter;
  let mockPrisma: jest.Mocked<Pick<PrismaService, 'payeePattern'>>;

  beforeEach(() => {
    mockPrisma = {
      payeePattern: {
        upsert: jest.fn().mockResolvedValue({ id: 'pat-1' }),
      },
    } as unknown as jest.Mocked<Pick<PrismaService, 'payeePattern'>>;

    adapter = new GnnPatternAdapter(
      undefined,
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('learnPattern', () => {
    it('should not throw when ruvector is unavailable', async () => {
      await expect(
        adapter.learnPattern({
          tenantId: 't1',
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        }),
      ).resolves.not.toThrow();
    });

    it('should create Prisma PayeePattern with source LEARNED_GNN', async () => {
      // Mock the GNN layer
      const mockLayer = {
        forward: jest.fn().mockResolvedValue(new Float32Array(256)),
      };
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = mockLayer;
      testAccess.initialized = true;

      await adapter.learnPattern({
        tenantId: 't1',
        payeeName: 'Woolworths',
        accountCode: '5200',
        accountName: 'Food & Catering',
        amountCents: 250000,
        isCredit: false,
      });

      expect(mockPrisma.payeePattern.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            source: 'LEARNED_GNN',
            tenantId: 't1',
            payeePattern: 'woolworths',
            defaultAccountCode: '5200',
            defaultAccountName: 'Food & Catering',
            isActive: true,
          }),
          update: expect.objectContaining({
            source: 'LEARNED_GNN',
            defaultAccountCode: '5200',
            defaultAccountName: 'Food & Catering',
          }),
        }),
      );
    });

    it('should cache graph-aware embedding after learning', async () => {
      const mockEmb = new Float32Array(256).fill(0.5);
      const mockLayer = {
        forward: jest.fn().mockResolvedValue(mockEmb),
      };
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = mockLayer;
      testAccess.initialized = true;

      await adapter.learnPattern({
        tenantId: 't1',
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });

      const cacheKey = 't1:woolworths:5200';
      expect(testAccess.embeddingCache.has(cacheKey)).toBe(true);
      expect(testAccess.accessCounts.get(cacheKey)).toBe(0);
    });

    it('should call GNN layer forward with node embedding and neighbors', async () => {
      const mockLayer = {
        forward: jest.fn().mockResolvedValue(new Float32Array(256)),
      };
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = mockLayer;
      testAccess.initialized = true;

      await adapter.learnPattern({
        tenantId: 't1',
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });

      expect(mockLayer.forward).toHaveBeenCalledTimes(1);
      // First arg: Float32Array node embedding (448d)
      const nodeEmb = mockLayer.forward.mock.calls[0][0] as Float32Array;
      expect(nodeEmb).toBeInstanceOf(Float32Array);
      expect(nodeEmb.length).toBe(448);
    });

    it('should gracefully handle Prisma upsert failure', async () => {
      const mockLayer = {
        forward: jest.fn().mockResolvedValue(new Float32Array(256)),
      };
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = mockLayer;
      testAccess.initialized = true;

      (
        mockPrisma.payeePattern.upsert as unknown as jest.Mock
      ).mockRejectedValue(new Error('DB down'));

      // Should not throw
      await expect(
        adapter.learnPattern({
          tenantId: 't1',
          payeeName: 'Test',
          accountCode: '5200',
          amountCents: 100000,
          isCredit: false,
        }),
      ).resolves.not.toThrow();
    });

    it('should handle GNN forward failure gracefully', async () => {
      const mockLayer = {
        forward: jest.fn().mockRejectedValue(new Error('GNN error')),
      };
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = mockLayer;
      testAccess.initialized = true;

      await expect(
        adapter.learnPattern({
          tenantId: 't1',
          payeeName: 'Test',
          accountCode: '5200',
          amountCents: 100000,
          isCredit: false,
        }),
      ).resolves.not.toThrow();
    });

    it('should use tenant-prefixed cache keys for isolation', async () => {
      const mockLayer = {
        forward: jest.fn().mockResolvedValue(new Float32Array(256)),
      };
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = mockLayer;
      testAccess.initialized = true;

      await adapter.learnPattern({
        tenantId: 'tenant-A',
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });

      await adapter.learnPattern({
        tenantId: 'tenant-B',
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });

      expect(testAccess.embeddingCache.has('tenant-A:woolworths:5200')).toBe(
        true,
      );
      expect(testAccess.embeddingCache.has('tenant-B:woolworths:5200')).toBe(
        true,
      );
    });

    it('should work without Prisma service', async () => {
      const adapterNoPrisma = new GnnPatternAdapter(undefined, undefined);
      const testAccess = getTestAccess(adapterNoPrisma);
      testAccess.ruvectorLayer = {
        forward: jest.fn().mockResolvedValue(new Float32Array(256)),
      };
      testAccess.initialized = true;

      await expect(
        adapterNoPrisma.learnPattern({
          tenantId: 't1',
          payeeName: 'Test',
          accountCode: '5200',
          amountCents: 100000,
          isCredit: false,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('predict', () => {
    it('should return null when no cached embeddings', async () => {
      const result = await adapter.predict({
        tenantId: 't1',
        payeeName: 'Unknown',
        amountCents: 5000,
        isCredit: false,
      });
      expect(result).toBeNull();
    });

    it('should return null when GNN is unavailable', async () => {
      // Not initialized, so predict should return null
      const result = await adapter.predict({
        tenantId: 't1',
        payeeName: 'Test',
        amountCents: 100000,
        isCredit: false,
      });
      expect(result).toBeNull();
    });

    it('should return null when no embeddings match tenant', async () => {
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = {
        forward: jest.fn().mockResolvedValue(new Float32Array(256)),
      };
      testAccess.initialized = true;

      // Add embedding for different tenant
      testAccess.embeddingCache.set(
        'other-tenant:woolworths:5200',
        new Float32Array(256),
      );

      const result = await adapter.predict({
        tenantId: 't1',
        payeeName: 'Woolworths',
        amountCents: 250000,
        isCredit: false,
      });
      expect(result).toBeNull();
    });
  });

  describe('consolidateEWC', () => {
    it('should not throw when layer is unavailable', async () => {
      await expect(adapter.consolidateEWC()).resolves.not.toThrow();
    });

    it('should call computeFisherInformation when available', async () => {
      const mockFisher = jest.fn().mockResolvedValue(undefined);
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = {
        forward: jest.fn(),
        computeFisherInformation: mockFisher,
      };
      testAccess.initialized = true;

      await adapter.consolidateEWC();

      expect(mockFisher).toHaveBeenCalledTimes(1);
    });

    it('should handle computeFisherInformation failure gracefully', async () => {
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = {
        forward: jest.fn(),
        computeFisherInformation: jest
          .fn()
          .mockRejectedValue(new Error('EWC error')),
      };
      testAccess.initialized = true;

      await expect(adapter.consolidateEWC()).resolves.not.toThrow();
    });

    it('should skip when computeFisherInformation is not a function', async () => {
      const testAccess = getTestAccess(adapter);
      testAccess.ruvectorLayer = {
        forward: jest.fn(),
        // No computeFisherInformation method
      };
      testAccess.initialized = true;

      await expect(adapter.consolidateEWC()).resolves.not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should use default config values', () => {
      const defaultAdapter = new GnnPatternAdapter();
      // Adapter should initialize without errors using default config
      expect(defaultAdapter).toBeDefined();
    });

    it('should accept partial config overrides', () => {
      const customAdapter = new GnnPatternAdapter(undefined, undefined, {
        searchTopK: 10,
        searchTemperature: 0.2,
      });
      expect(customAdapter).toBeDefined();
    });
  });
});
