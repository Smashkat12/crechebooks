/**
 * Ruvector Service Tests
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * Tests initialization, availability checking, and graceful degradation.
 * Uses a TestableRuvectorService subclass that overrides the module loader
 * to avoid real native/WASM loading.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  RuvectorService,
  RuvectorModule,
} from '../../../src/agents/sdk/ruvector.service';

/**
 * Create a mock ruvector module with working VectorDb and EmbeddingService.
 */
function createMockRuvectorModule(): RuvectorModule {
  const mockSearch = jest.fn().mockResolvedValue([
    { id: 'vec-001', score: 0.95, metadata: { label: 'test' } },
    { id: 'vec-002', score: 0.87, metadata: { label: 'other' } },
  ]);

  const MockVectorDb = jest.fn().mockImplementation(() => ({
    search: mockSearch,
    insert: jest.fn().mockResolvedValue('vec-new'),
  })) as unknown as RuvectorModule['VectorDb'];

  const mockEmbedOne = jest.fn().mockResolvedValue(new Array(384).fill(0.1));
  const MockEmbeddingService = jest.fn().mockImplementation(() => ({
    embedOne: mockEmbedOne,
  })) as unknown as RuvectorModule['EmbeddingService'];

  return {
    VectorDb: MockVectorDb,
    VectorDB: MockVectorDb,
    EmbeddingService: MockEmbeddingService,
    createEmbeddingService: jest.fn().mockReturnValue({
      embedOne: mockEmbedOne,
    }),
  };
}

/**
 * Create a failing mock ruvector module that throws on VectorDb construction.
 */
function createFailingMockRuvectorModule(): RuvectorModule {
  const FailingVectorDb = jest.fn().mockImplementation(() => {
    throw new Error('Native module not found');
  }) as unknown as RuvectorModule['VectorDb'];

  return {
    VectorDb: FailingVectorDb,
    VectorDB: FailingVectorDb,
  };
}

/**
 * Testable subclass that injects a mock ruvector module
 * instead of dynamically importing the real one.
 */
class TestableRuvectorService extends RuvectorService {
  private mockModule: RuvectorModule | null;

  constructor(configService: ConfigService, mockModule: RuvectorModule | null) {
    super(configService);
    this.mockModule = mockModule;
  }

  protected override async loadRuvectorModule(): Promise<RuvectorModule> {
    if (!this.mockModule) {
      throw new Error('No mock module configured for TestableRuvectorService');
    }
    return this.mockModule;
  }
}

describe('RuvectorService', () => {
  /**
   * Create a test module with the given environment config and optional mock module.
   */
  async function createTestModule(
    envConfig: Record<string, string>,
    mockModule: RuvectorModule | null = createMockRuvectorModule(),
  ): Promise<{
    service: RuvectorService;
    module: TestingModule;
  }> {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => envConfig],
        }),
      ],
      providers: [
        {
          provide: RuvectorService,
          useFactory: (configService: ConfigService) => {
            return new TestableRuvectorService(configService, mockModule);
          },
          inject: [ConfigService],
        },
      ],
    }).compile();

    const service = module.get<RuvectorService>(RuvectorService);
    return { service, module };
  }

  describe('initialization', () => {
    it('should initialize successfully when RUVECTOR_ENABLED=true', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
        RUVECTOR_PG_EXTENSION: 'false',
      });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(true);
    });

    it('should skip initialization when RUVECTOR_ENABLED is not true', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
    });

    it('should skip initialization when RUVECTOR_ENABLED is not set', async () => {
      const { service } = await createTestModule({});

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should return false before onModuleInit is called', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
      });

      // Before init
      expect(service.isAvailable()).toBe(false);
    });

    it('should reflect initialization state accurately', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
      });

      expect(service.isAvailable()).toBe(false);
      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('graceful degradation', () => {
    it('should handle initialization failure gracefully', async () => {
      const { service } = await createTestModule(
        { RUVECTOR_ENABLED: 'true' },
        createFailingMockRuvectorModule(),
      );

      // Should not throw
      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.isAvailable()).toBe(false);
    });

    it('should throw descriptive error when generateEmbedding is called while unavailable', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'Ruvector is not initialized',
      );
    });

    it('should throw descriptive error when searchSimilar is called while unavailable', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      await expect(
        service.searchSimilar([0.1, 0.2, 0.3], 'test-collection', 5),
      ).rejects.toThrow('Ruvector is not initialized');
    });
  });

  describe('searchSimilar', () => {
    it('should return search results when available', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
      });

      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      const results = await service.searchSimilar(
        [0.1, 0.2, 0.3],
        'test-collection',
        5,
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('score');
    });
  });
});
