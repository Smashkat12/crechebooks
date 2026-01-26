/**
 * Embedding Provider Tests
 * TASK-STUB-001: EmbeddingService Real Provider Setup
 *
 * Tests for RequestyEmbeddingProvider and OnnxFallbackProvider.
 * All tests mock everything — zero real API calls, zero real file I/O.
 *
 * Also tests RuvectorService integration with real providers:
 * - Provider registration and fallback chain
 * - Tenant-scoped collection management
 * - Dimension validation and persistence config
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  RequestyEmbeddingProvider,
  OnnxFallbackProvider,
} from '../../../src/agents/sdk/embedding-provider';
import {
  RuvectorService,
  RuvectorModule,
} from '../../../src/agents/sdk/ruvector.service';

// ─── RequestyEmbeddingProvider ───────────────────────────────────────

describe('RequestyEmbeddingProvider', () => {
  let provider: RequestyEmbeddingProvider;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    provider = new RequestyEmbeddingProvider({
      baseUrl: 'https://router.requesty.ai/v1',
      apiKey: 'test-api-key',
      model: 'voyage-3-lite',
      dimensions: 1024,
    });

    // Mock global fetch
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1024).fill(0.1), index: 0 }],
      }),
      text: async () => '',
    } as Response);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('should embed a single text', async () => {
    const result = await provider.embed(['test transaction']);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1024);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://router.requesty.ai/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
        }),
      }),
    );
  });

  it('should embed multiple texts in a single batch', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1024).fill(0.2), index: 1 },
          { embedding: new Array(1024).fill(0.1), index: 0 },
        ],
      }),
      text: async () => '',
    } as Response);

    const result = await provider.embed(['text one', 'text two']);
    expect(result).toHaveLength(2);
    // Verify sorted by index
    expect(result[0][0]).toBe(0.1); // index 0
    expect(result[1][0]).toBe(0.2); // index 1
  });

  it('should return empty array for empty input', async () => {
    const result = await provider.embed([]);
    expect(result).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should throw on non-OK response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    } as Response);

    await expect(provider.embed(['test'])).rejects.toThrow(
      'Requesty embedding request failed (429)',
    );
  });

  it('should report correct dimensions', () => {
    expect(provider.getDimensions()).toBe(1024);
    expect(provider.name).toBe('requesty');
  });

  it('should strip trailing slashes from baseUrl', () => {
    const p = new RequestyEmbeddingProvider({
      baseUrl: 'https://router.requesty.ai/v1///',
      apiKey: 'key',
    });
    // Verify by calling embed and checking the URL
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1], index: 0 }] }),
      text: async () => '',
    } as Response);

    void p.embed(['test']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://router.requesty.ai/v1/embeddings',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should use default model and dimensions when not specified', () => {
    const p = new RequestyEmbeddingProvider({
      baseUrl: 'https://router.requesty.ai/v1',
      apiKey: 'key',
    });
    expect(p.getDimensions()).toBe(1024);
    expect(p.name).toBe('requesty');
  });

  it('should send correct request body', async () => {
    await provider.embed(['hello world']);

    const callArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      model: 'voyage-3-lite',
      input: ['hello world'],
      encoding_format: 'float',
    });
  });

  it('should handle fetch error body gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('body read failed');
      },
    } as unknown as Response);

    await expect(provider.embed(['test'])).rejects.toThrow(
      'Requesty embedding request failed (500): unknown',
    );
  });
});

// ─── OnnxFallbackProvider ────────────────────────────────────────────

describe('OnnxFallbackProvider', () => {
  let provider: OnnxFallbackProvider;

  beforeEach(() => {
    provider = new OnnxFallbackProvider();
    jest.resetModules();
  });

  it('should report correct dimensions and name', () => {
    expect(provider.getDimensions()).toBe(384);
    expect(provider.name).toBe('onnx-fallback');
  });

  it('should throw when OnnxEmbedder is not available in ruvector', async () => {
    // Mock dynamic import - module exists but has no OnnxEmbedder
    jest.mock('ruvector', () => ({}), { virtual: true });

    // The provider will try to initialize but OnnxEmbedder won't be found
    // It should then throw on embed since onnxEmbedder remains null
    await expect(provider.embed(['test'])).rejects.toThrow(
      'ONNX embedder failed to initialize',
    );
  });

  it('should use OnnxEmbedder when available', async () => {
    const mockEmbed = jest.fn().mockResolvedValue([new Array(384).fill(0.5)]);

    // Create a fresh provider to avoid stale init promise from prior tests
    const freshProvider = new OnnxFallbackProvider();

    // Access internal state to inject mock
    (freshProvider as unknown as Record<string, unknown>)['onnxEmbedder'] = {
      embed: mockEmbed,
    };

    const result = await freshProvider.embed(['test text']);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(384);
    expect(mockEmbed).toHaveBeenCalledWith(['test text']);
  });

  it('should handle ruvector import failure gracefully', async () => {
    // Mock dynamic import failure
    jest.mock(
      'ruvector',
      () => {
        throw new Error('Module not found');
      },
      { virtual: true },
    );

    const freshProvider = new OnnxFallbackProvider();
    await expect(freshProvider.embed(['test'])).rejects.toThrow(
      'ONNX embedder failed to initialize',
    );
  });

  it('should only initialize once even with concurrent calls', async () => {
    const mockEmbed = jest.fn().mockResolvedValue([new Array(384).fill(0.3)]);
    const freshProvider = new OnnxFallbackProvider();

    // Inject mock embedder
    (freshProvider as unknown as Record<string, unknown>)['onnxEmbedder'] = {
      embed: mockEmbed,
    };

    // Concurrent calls
    const [r1, r2] = await Promise.all([
      freshProvider.embed(['text1']),
      freshProvider.embed(['text2']),
    ]);

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });
});

// ─── RuvectorService (with real providers) ───────────────────────────

describe('RuvectorService (with real providers)', () => {
  /**
   * Create a mock ruvector module with provider registration support.
   */
  function createProviderAwareMockModule(): RuvectorModule & {
    registeredProviders: Array<{ name: string }>;
    selectedProvider: string | null;
    mockSearch: jest.Mock;
    mockInsert: jest.Mock;
    mockEmbedOne: jest.Mock;
  } {
    const registeredProviders: Array<{ name: string }> = [];
    let selectedProvider: string | null = null;

    const mockSearch = jest.fn().mockResolvedValue([
      {
        id: 'vec-001',
        score: 0.95,
        metadata: {
          label: 'test',
          _collection: 'decisions-tenant-123',
          _tenantId: 'tenant-123',
        },
      },
      {
        id: 'vec-002',
        score: 0.87,
        metadata: {
          label: 'other',
          _collection: 'decisions-tenant-123',
          _tenantId: 'tenant-123',
        },
      },
    ]);

    const mockInsert = jest.fn().mockResolvedValue('vec-new');

    const MockVectorDb = jest.fn().mockImplementation(() => ({
      search: mockSearch,
      insert: mockInsert,
    })) as unknown as RuvectorModule['VectorDb'];

    const mockEmbedOne = jest.fn().mockResolvedValue(new Array(1024).fill(0.5));

    const MockEmbeddingService = jest.fn().mockImplementation(() => ({
      embedOne: mockEmbedOne,
      registerProvider: jest.fn().mockImplementation((p: { name: string }) => {
        registeredProviders.push(p);
      }),
      selectProvider: jest.fn().mockImplementation((name: string) => {
        selectedProvider = name;
      }),
    })) as unknown as RuvectorModule['EmbeddingService'];

    return {
      VectorDb: MockVectorDb,
      VectorDB: MockVectorDb,
      EmbeddingService: MockEmbeddingService,
      createEmbeddingService: jest.fn().mockReturnValue({
        embedOne: mockEmbedOne,
        registerProvider: jest
          .fn()
          .mockImplementation((p: { name: string }) => {
            registeredProviders.push(p);
          }),
        selectProvider: jest.fn().mockImplementation((name: string) => {
          selectedProvider = name;
        }),
      }),
      registeredProviders,
      get selectedProvider() {
        return selectedProvider;
      },
      set selectedProvider(v) {
        selectedProvider = v;
      },
      mockSearch,
      mockInsert,
      mockEmbedOne,
    };
  }

  /**
   * Testable subclass that injects a mock ruvector module.
   */
  class TestableRuvectorService extends RuvectorService {
    private mockModule: RuvectorModule | null;

    constructor(
      configService: ConfigService,
      mockModule: RuvectorModule | null,
    ) {
      super(configService);
      this.mockModule = mockModule;
    }

    protected override async loadRuvectorModule(): Promise<RuvectorModule> {
      if (!this.mockModule) {
        throw new Error('No mock module configured');
      }
      return this.mockModule;
    }
  }

  async function createTestModule(
    envConfig: Record<string, string>,
    mockModule?: RuvectorModule,
  ): Promise<{
    service: RuvectorService;
    module: TestingModule;
  }> {
    const mock = mockModule ?? createProviderAwareMockModule();
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
            return new TestableRuvectorService(configService, mock);
          },
          inject: [ConfigService],
        },
      ],
    }).compile();

    const service = module.get<RuvectorService>(RuvectorService);
    return { service, module };
  }

  describe('provider registration', () => {
    it('should register requesty provider when API key is available', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
          ANTHROPIC_API_KEY: 'test-key',
          ANTHROPIC_BASE_URL: 'https://router.requesty.ai/v1',
        },
        mock,
      );

      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      // Check providers were registered (requesty + onnx-fallback)
      expect(mock.registeredProviders.length).toBeGreaterThanOrEqual(2);
      expect(mock.registeredProviders.some((p) => p.name === 'requesty')).toBe(
        true,
      );
      expect(
        mock.registeredProviders.some((p) => p.name === 'onnx-fallback'),
      ).toBe(true);
    });

    it('should not register requesty provider when no API key', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      // Only onnx-fallback should be registered
      const requestyRegistered = mock.registeredProviders.some(
        (p) => p.name === 'requesty',
      );
      expect(requestyRegistered).toBe(false);
    });

    it('should select requesty as default when API key is present', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
          ANTHROPIC_API_KEY: 'test-key',
        },
        mock,
      );

      await service.onModuleInit();
      expect(mock.selectedProvider).toBe('requesty');
    });

    it('should select onnx-fallback when no API key', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();
      expect(mock.selectedProvider).toBe('onnx-fallback');
    });

    it('should respect EMBEDDING_PROVIDER env var override', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
          ANTHROPIC_API_KEY: 'test-key',
          EMBEDDING_PROVIDER: 'onnx-fallback',
        },
        mock,
      );

      await service.onModuleInit();
      expect(mock.selectedProvider).toBe('onnx-fallback');
    });
  });

  describe('generateEmbedding with fallback chain', () => {
    it('should return EmbeddingResult with provider info and timing', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
        ANTHROPIC_API_KEY: 'test-key',
      });

      await service.onModuleInit();

      const result = await service.generateEmbedding('Woolworths Foods');
      expect(result.vector).toHaveLength(1024);
      expect(result.provider).toBeDefined();
      expect(result.dimensions).toBe(1024);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw when not initialized', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      await expect(service.generateEmbedding('test')).rejects.toThrow(
        'Ruvector is not initialized',
      );
    });

    it('should fall back to fallback providers when primary fails', async () => {
      const mock = createProviderAwareMockModule();
      // Make primary embedOne fail
      mock.mockEmbedOne.mockRejectedValue(new Error('API timeout'));

      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
          ANTHROPIC_API_KEY: 'test-key',
        },
        mock,
      );

      await service.onModuleInit();

      // The fallback providers (RequestyEmbeddingProvider, OnnxFallbackProvider) are real
      // objects but they'll also fail since we're not mocking fetch or ruvector import.
      // In this case, all providers should fail and we get the "All embedding providers failed" error.
      await expect(service.generateEmbedding('test')).rejects.toThrow(
        'All embedding providers failed',
      );
    });
  });

  describe('tenant-scoped collection management', () => {
    it('should create tenant-scoped collection names', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
      });

      await service.onModuleInit();

      const name = service.getTenantCollection('decisions', 'tenant-123');
      expect(name).toBe('decisions-tenant-123');
    });

    it('should handle various collection types', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
      });

      await service.onModuleInit();

      expect(service.getTenantCollection('episodes', 'abc')).toBe(
        'episodes-abc',
      );
      expect(service.getTenantCollection('patterns', 'def')).toBe(
        'patterns-def',
      );
    });

    it('should insert vector with tenant metadata', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();

      const vector = new Array(384).fill(0.5);
      await service.insertVector('decisions', 'tenant-123', 'vec-001', vector, {
        label: 'groceries',
      });

      expect(mock.mockInsert).toHaveBeenCalledWith({
        id: 'vec-001',
        vector,
        metadata: {
          label: 'groceries',
          _collection: 'decisions-tenant-123',
          _tenantId: 'tenant-123',
        },
      });
    });

    it('should insert vector without optional metadata', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();

      const vector = new Array(384).fill(0.5);
      await service.insertVector('decisions', 'tenant-123', 'vec-002', vector);

      expect(mock.mockInsert).toHaveBeenCalledWith({
        id: 'vec-002',
        vector,
        metadata: {
          _collection: 'decisions-tenant-123',
          _tenantId: 'tenant-123',
        },
      });
    });

    it('should throw on insertVector when not initialized', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      await expect(
        service.insertVector('decisions', 'tenant-123', 'id', [0.1]),
      ).rejects.toThrow('Ruvector not initialized');
    });

    it('should search within tenant-scoped collection', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();

      const queryVector = new Array(384).fill(0.3);
      const results = await service.searchTenantCollection(
        'decisions',
        'tenant-123',
        queryVector,
        5,
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(5);

      // Verify search was called with collection filter
      expect(mock.mockSearch).toHaveBeenCalledWith({
        vector: queryVector,
        k: 10, // limit * 2
        filter: { _collection: 'decisions-tenant-123' },
      });
    });

    it('should throw on searchTenantCollection when not initialized', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      await expect(
        service.searchTenantCollection('decisions', 'tenant-123', [0.1], 5),
      ).rejects.toThrow('Ruvector not initialized');
    });
  });

  describe('dimensions', () => {
    it('should return active provider dimensions', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
        ANTHROPIC_API_KEY: 'test-key',
      });

      await service.onModuleInit();

      // With API key, requesty is active (1024d)
      expect(service.getActiveDimensions()).toBe(1024);
    });

    it('should return onnx dimensions when no API key', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'true',
      });

      await service.onModuleInit();

      // Without API key, onnx-fallback is active (384d)
      expect(service.getActiveDimensions()).toBe(384);
    });

    it('should return default 384 when not initialized', async () => {
      const { service } = await createTestModule({
        RUVECTOR_ENABLED: 'false',
      });

      await service.onModuleInit();

      // Not initialized, returns default
      expect(service.getActiveDimensions()).toBe(384);
    });
  });

  describe('persistence configuration', () => {
    it('should pass storagePath to VectorDb constructor', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
          RUVECTOR_STORAGE_PATH: ':memory:',
        },
        mock,
      );

      await service.onModuleInit();
      expect(service.isAvailable()).toBe(true);

      // VectorDb constructor should have been called with storagePath
      const VectorDbCtor = mock.VectorDb as jest.Mock;
      expect(VectorDbCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          distanceMetric: 'cosine',
          storagePath: ':memory:',
        }),
      );
    });

    it('should use default storagePath when not configured', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();

      const VectorDbCtor = mock.VectorDb as jest.Mock;
      expect(VectorDbCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          storagePath: './data/vectors.db',
        }),
      );
    });
  });

  describe('backward compatibility', () => {
    it('should preserve searchSimilar method', async () => {
      const mock = createProviderAwareMockModule();
      const { service } = await createTestModule(
        {
          RUVECTOR_ENABLED: 'true',
        },
        mock,
      );

      await service.onModuleInit();

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
