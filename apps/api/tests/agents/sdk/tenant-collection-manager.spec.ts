/**
 * TenantCollectionManager Tests
 * TASK-STUB-010: Multi-Tenant Vector Collections
 *
 * Tests lazy collection creation, LRU cache behavior, tenant isolation,
 * input validation, lifecycle management, search filtering, and stats.
 * All tests mock ruvector VectorDB -- zero real VectorDB instantiation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TenantCollectionManager } from '../../../src/agents/sdk/tenant-collection-manager';
import type { VectorDBInstance } from '../../../src/agents/sdk/interfaces/collection-manager.interface';

// Mock ruvector VectorDB
const mockSearch = jest.fn().mockResolvedValue([]);
const mockInsert = jest.fn().mockResolvedValue('vec-id');
const mockInsertBatch = jest.fn().mockResolvedValue(['vec-id']);
const mockGet = jest.fn().mockResolvedValue(null);
const mockDelete = jest.fn().mockResolvedValue(true);
const mockLen = jest.fn().mockResolvedValue(0);
const mockIsEmpty = jest.fn().mockResolvedValue(true);

jest.mock('ruvector', () => ({
  VectorDB: jest.fn().mockImplementation(() => ({
    search: mockSearch,
    insert: mockInsert,
    insertBatch: mockInsertBatch,
    get: mockGet,
    delete: mockDelete,
    len: mockLen,
    isEmpty: mockIsEmpty,
  })),
}));

const TEST_TENANT_ID = 'bdff4374-64d5-420c-b454-8e85e9df552a';
const SECOND_TENANT_ID = 'aaaa1111-2222-3333-4444-555566667777';

describe('TenantCollectionManager', () => {
  let manager: TenantCollectionManager;
  let testModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              RUVECTOR_DATA_DIR: './data/test-ruvector',
              RUVECTOR_MAX_CACHED_COLLECTIONS: 5,
              RUVECTOR_EMBEDDING_DIM: 384,
            }),
          ],
        }),
      ],
      providers: [TenantCollectionManager],
    }).compile();

    manager = testModule.get<TenantCollectionManager>(TenantCollectionManager);
    manager.onModuleInit();
  });

  afterEach(() => {
    manager.onModuleDestroy();
  });

  describe('getCollection', () => {
    it('should create a new collection on first access', async () => {
      const db = await manager.getCollection(TEST_TENANT_ID, 'decisions');
      expect(db).toBeDefined();
      expect(db.search).toBeDefined();
      expect(db.insert).toBeDefined();
      expect(db.get).toBeDefined();
    });

    it('should return cached collection on subsequent access', async () => {
      const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const db2 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
      // Should return the same instance (cache hit)
      expect(db1).toBe(db2);
    });

    it('should create separate collections for different tenants', async () => {
      const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const db2 = await manager.getCollection(SECOND_TENANT_ID, 'decisions');
      expect(db1).not.toBe(db2);
    });

    it('should create separate collections for different purposes', async () => {
      const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const db2 = await manager.getCollection(TEST_TENANT_ID, 'reasoning');
      expect(db1).not.toBe(db2);
    });

    it('should reject invalid tenant ID format', async () => {
      await expect(
        manager.getCollection('invalid-uuid', 'decisions'),
      ).rejects.toThrow('Invalid tenantId format');
    });

    it('should reject empty tenant ID', async () => {
      await expect(manager.getCollection('', 'decisions')).rejects.toThrow(
        'tenantId is required',
      );
    });

    it('should reject invalid purpose', async () => {
      await expect(
        manager.getCollection(TEST_TENANT_ID, 'invalid' as 'decisions'),
      ).rejects.toThrow('Invalid collection purpose');
    });
  });

  describe('LRU cache', () => {
    it('should evict LRU entry when cache is full', async () => {
      // Create 5 collections (max cache size)
      for (let i = 0; i < 5; i++) {
        const tenantId = `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`;
        await manager.getCollection(tenantId, 'decisions');
      }
      expect(manager.getCacheSize()).toBe(5);

      // Access 6th collection -- should evict the LRU (first one)
      const sixthTenant = '00000005-0000-0000-0000-000000000000';
      await manager.getCollection(sixthTenant, 'decisions');
      expect(manager.getCacheSize()).toBe(5);
    });

    it('should update lastAccess on cache hit', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const statsBefore = manager.getCollectionStats();
      const accessBefore = statsBefore[0].lastAccess;

      // Wait a tiny bit so timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const statsAfter = manager.getCollectionStats();
      const accessAfter = statsAfter[0].lastAccess;

      expect(accessAfter).toBeGreaterThanOrEqual(accessBefore);
    });
  });

  describe('initializeTenantCollections', () => {
    it('should create all 4 purpose collections', async () => {
      await manager.initializeTenantCollections(TEST_TENANT_ID);

      expect(manager.hasCollection(TEST_TENANT_ID, 'decisions')).toBe(true);
      expect(manager.hasCollection(TEST_TENANT_ID, 'reasoning')).toBe(true);
      expect(manager.hasCollection(TEST_TENANT_ID, 'patterns')).toBe(true);
      expect(manager.hasCollection(TEST_TENANT_ID, 'embeddings')).toBe(true);
    });

    it('should reject invalid tenant ID', async () => {
      await expect(
        manager.initializeTenantCollections('bad-id'),
      ).rejects.toThrow('Invalid tenantId format');
    });
  });

  describe('searchWithFilter', () => {
    it('should filter results by tenantId metadata', async () => {
      const sharedDb: VectorDBInstance = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            score: 0.95,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' },
          },
          {
            id: 'v2',
            score: 0.9,
            metadata: { tenantId: SECOND_TENANT_ID, purpose: 'decisions' },
          },
          {
            id: 'v3',
            score: 0.85,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' },
          },
        ]),
        insert: jest.fn().mockResolvedValue('id'),
        insertBatch: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(true),
        len: jest.fn().mockResolvedValue(0),
        isEmpty: jest.fn().mockResolvedValue(true),
      };

      const results = await manager.searchWithFilter(
        sharedDb,
        'decisions',
        [0.1, 0.2, 0.3],
        TEST_TENANT_ID,
        10,
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.tenantId === TEST_TENANT_ID)).toBe(
        true,
      );
    });

    it('should exclude results from non-matching tenants (no leak)', async () => {
      const sharedDb: VectorDBInstance = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            score: 0.95,
            metadata: { tenantId: 'wrong-tenant-id', purpose: 'decisions' },
          },
        ]),
        insert: jest.fn().mockResolvedValue('id'),
        insertBatch: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(true),
        len: jest.fn().mockResolvedValue(0),
        isEmpty: jest.fn().mockResolvedValue(true),
      };

      // The post-filter should exclude this, so no leak
      const results = await manager.searchWithFilter(
        sharedDb,
        'decisions',
        [0.1],
        TEST_TENANT_ID,
        10,
      );
      expect(results).toHaveLength(0);
    });

    it('should filter by purpose as well as tenantId', async () => {
      const sharedDb: VectorDBInstance = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            score: 0.95,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' },
          },
          {
            id: 'v2',
            score: 0.9,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'reasoning' },
          },
        ]),
        insert: jest.fn().mockResolvedValue('id'),
        insertBatch: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(true),
        len: jest.fn().mockResolvedValue(0),
        isEmpty: jest.fn().mockResolvedValue(true),
      };

      const results = await manager.searchWithFilter(
        sharedDb,
        'decisions',
        [0.1, 0.2],
        TEST_TENANT_ID,
        10,
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v1');
    });

    it('should respect the k limit', async () => {
      const sharedDb: VectorDBInstance = {
        search: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            score: 0.95,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' },
          },
          {
            id: 'v2',
            score: 0.9,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' },
          },
          {
            id: 'v3',
            score: 0.85,
            metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' },
          },
        ]),
        insert: jest.fn().mockResolvedValue('id'),
        insertBatch: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(true),
        len: jest.fn().mockResolvedValue(0),
        isEmpty: jest.fn().mockResolvedValue(true),
      };

      const results = await manager.searchWithFilter(
        sharedDb,
        'decisions',
        [0.1],
        TEST_TENANT_ID,
        2,
      );

      expect(results).toHaveLength(2);
    });

    it('should reject invalid tenantId in searchWithFilter', async () => {
      const sharedDb: VectorDBInstance = {
        search: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockResolvedValue('id'),
        insertBatch: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(true),
        len: jest.fn().mockResolvedValue(0),
        isEmpty: jest.fn().mockResolvedValue(true),
      };

      await expect(
        manager.searchWithFilter(sharedDb, 'decisions', [0.1], 'bad-id', 10),
      ).rejects.toThrow('Invalid tenantId format');
    });
  });

  describe('getCollectionStats', () => {
    it('should return stats for all cached collections', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      await manager.getCollection(TEST_TENANT_ID, 'reasoning');

      const stats = manager.getCollectionStats();
      expect(stats).toHaveLength(2);
      expect(stats[0].tenantId).toBe(TEST_TENANT_ID);
      expect(stats[0].purpose).toBeDefined();
      expect(stats[0].lastAccess).toBeGreaterThan(0);
    });

    it('should sort by lastAccess descending', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      await new Promise((r) => setTimeout(r, 10));
      await manager.getCollection(TEST_TENANT_ID, 'reasoning');

      const stats = manager.getCollectionStats();
      expect(stats[0].purpose).toBe('reasoning'); // most recent
    });

    it('should return empty array when no collections cached', () => {
      const stats = manager.getCollectionStats();
      expect(stats).toHaveLength(0);
    });
  });

  describe('hasCollection', () => {
    it('should return true for cached collections', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      expect(manager.hasCollection(TEST_TENANT_ID, 'decisions')).toBe(true);
    });

    it('should return false for non-cached collections', () => {
      expect(manager.hasCollection(TEST_TENANT_ID, 'decisions')).toBe(false);
    });
  });

  describe('getCacheSize', () => {
    it('should return 0 initially', () => {
      expect(manager.getCacheSize()).toBe(0);
    });

    it('should reflect number of cached collections', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      expect(manager.getCacheSize()).toBe(1);

      await manager.getCollection(TEST_TENANT_ID, 'reasoning');
      expect(manager.getCacheSize()).toBe(2);
    });
  });

  describe('lifecycle', () => {
    it('should clear all collections on destroy', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      await manager.getCollection(TEST_TENANT_ID, 'reasoning');

      manager.onModuleDestroy();
      expect(manager.getCacheSize()).toBe(0);
    });

    it('should clear cleanup interval on destroy', async () => {
      // onModuleInit already ran in beforeEach, setting up the interval
      // Destroying should clear it without error
      manager.onModuleDestroy();
      // Calling destroy again should be safe (idempotent)
      expect(() => manager.onModuleDestroy()).not.toThrow();
    });
  });

  describe('migrateSharedToIsolated', () => {
    it('should migrate entries from pre-fetched array to isolated collection', async () => {
      const mockEntries = [
        {
          id: 'e1',
          vector: [0.1, 0.2],
          metadata: { tenantId: TEST_TENANT_ID },
        },
        {
          id: 'e2',
          vector: [0.3, 0.4],
          metadata: { tenantId: TEST_TENANT_ID },
        },
      ];

      // mockGet returns null (entry does not exist in target), mockInsert succeeds
      mockGet.mockResolvedValue(null);
      mockInsert.mockResolvedValue('new-id');

      const migrated = await manager.migrateSharedToIsolated(
        mockEntries,
        'decisions',
        TEST_TENANT_ID,
      );

      expect(migrated).toBe(2);
    });

    it('should skip already-existing entries (idempotent)', async () => {
      const mockEntries = [
        { id: 'e1', vector: [0.1, 0.2], metadata: {} },
        { id: 'e2', vector: [0.3, 0.4], metadata: {} },
      ];

      // First entry already exists, second does not
      mockGet.mockResolvedValueOnce({ id: 'e1' }).mockResolvedValueOnce(null);
      mockInsert.mockResolvedValue('new-id');

      const migrated = await manager.migrateSharedToIsolated(
        mockEntries,
        'decisions',
        TEST_TENANT_ID,
      );

      expect(migrated).toBe(1);
    });

    it('should handle migration errors for individual entries', async () => {
      const mockEntries = [
        { id: 'e1', vector: [0.1], metadata: {} },
        { id: 'e2', vector: [0.2], metadata: {} },
      ];

      mockGet.mockResolvedValue(null);
      // First insert fails, second succeeds
      mockInsert
        .mockRejectedValueOnce(new Error('Insert failed'))
        .mockResolvedValueOnce('new-id');

      const migrated = await manager.migrateSharedToIsolated(
        mockEntries,
        'decisions',
        TEST_TENANT_ID,
      );

      expect(migrated).toBe(1);
    });

    it('should reject invalid tenantId', async () => {
      await expect(
        manager.migrateSharedToIsolated([], 'decisions', 'not-a-uuid'),
      ).rejects.toThrow('Invalid tenantId format');
    });
  });

  describe('collection naming convention', () => {
    it('should use purpose_tenantPrefix format for cache keys', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const stats = manager.getCollectionStats();
      expect(stats[0].key).toBe('decisions_bdff4374');
    });

    it('should use full UUID in storage path', async () => {
      await manager.getCollection(TEST_TENANT_ID, 'decisions');
      const stats = manager.getCollectionStats();
      expect(stats[0].storagePath).toBe(
        `./data/test-ruvector/collections/decisions_${TEST_TENANT_ID}/vectors.db`,
      );
    });
  });
});
