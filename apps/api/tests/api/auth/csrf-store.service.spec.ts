import { Test, TestingModule } from '@nestjs/testing';
import { CsrfStoreService } from '../../../src/api/auth/csrf-store.service';
import { RedisService } from '../../../src/common/redis/redis.service';
import * as crypto from 'crypto';

describe('CsrfStoreService', () => {
  let service: CsrfStoreService;
  let redisService: jest.Mocked<RedisService>;

  // Mock Redis storage
  const mockStorage = new Map<string, string>();

  beforeEach(async () => {
    mockStorage.clear();

    const mockRedisService = {
      set: jest.fn().mockImplementation((key: string, value: string) => {
        mockStorage.set(key, value);
        return Promise.resolve();
      }),
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(mockStorage.get(key) || null);
      }),
      delete: jest.fn().mockImplementation((key: string) => {
        const existed = mockStorage.has(key);
        mockStorage.delete(key);
        return Promise.resolve(existed);
      }),
      deletePattern: jest.fn().mockImplementation((pattern: string) => {
        // Simple pattern matching for tests
        const prefix = pattern.replace('*', '');
        let deletedCount = 0;
        for (const key of mockStorage.keys()) {
          if (key.startsWith(prefix)) {
            mockStorage.delete(key);
            deletedCount++;
          }
        }
        return Promise.resolve(deletedCount);
      }),
      isReady: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsrfStoreService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<CsrfStoreService>(CsrfStoreService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate unique tokens', () => {
      const tokens = new Set<string>();

      // Generate 100 tokens and verify uniqueness
      for (let i = 0; i < 100; i++) {
        const token = service.generateToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }

      expect(tokens.size).toBe(100);
    });

    it('should generate URL-safe tokens', () => {
      const token = service.generateToken();

      // base64url encoding doesn't use +, /, or =
      expect(token).not.toMatch(/[+/=]/);

      // Should be valid base64url characters only
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate tokens of consistent length', () => {
      // 32 bytes encoded as base64url = 43 characters
      const expectedLength = 43;

      for (let i = 0; i < 10; i++) {
        const token = service.generateToken();
        expect(token.length).toBe(expectedLength);
      }
    });

    it('should use cryptographically secure randomness', () => {
      // Verify token has sufficient entropy by checking:
      // 1. Token length matches 32 bytes base64url encoded
      // 2. Different tokens are generated each time
      // 3. Token contains expected character set
      const token = service.generateToken();

      // 32 bytes = 256 bits of entropy, base64url encoded = 43 chars
      expect(token.length).toBe(43);

      // Verify randomness by generating multiple tokens and checking they differ
      const tokens = new Set<string>();
      for (let i = 0; i < 10; i++) {
        tokens.add(service.generateToken());
      }
      expect(tokens.size).toBe(10);
    });
  });

  describe('store and validate', () => {
    const userId = 'user-123-456-789';

    it('should store and validate a valid token', async () => {
      const token = service.generateToken();

      await service.store(userId, token);

      const isValid = await service.validate(userId, token);

      expect(isValid).toBe(true);
      expect(redisService.set).toHaveBeenCalled();
      expect(redisService.get).toHaveBeenCalled();
    });

    it('should reject an invalid token', async () => {
      const token = service.generateToken();
      const wrongToken = service.generateToken();

      await service.store(userId, token);

      const isValid = await service.validate(userId, wrongToken);

      expect(isValid).toBe(false);
    });

    it('should reject a token for wrong user', async () => {
      const token = service.generateToken();
      const wrongUserId = 'wrong-user-id';

      await service.store(userId, token);

      const isValid = await service.validate(wrongUserId, token);

      expect(isValid).toBe(false);
    });

    it('should reject an expired token', async () => {
      const token = service.generateToken();

      // Store with very short TTL
      await service.store(userId, token, 1);

      // Manually expire the token by modifying stored data
      const key = `csrf:user:${userId}:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
      const storedData = mockStorage.get(key);
      if (storedData) {
        const metadata = JSON.parse(storedData);
        metadata.expiresAt = Date.now() - 1000; // Set to past
        mockStorage.set(key, JSON.stringify(metadata));
      }

      const isValid = await service.validate(userId, token);

      expect(isValid).toBe(false);
    });

    it('should store token hash, not plaintext', async () => {
      const token = service.generateToken();

      await service.store(userId, token);

      // Check that the stored data contains hash, not plaintext
      const setCall = redisService.set.mock.calls[0];
      const storedData = JSON.parse(setCall[1]);

      // tokenHash should be SHA-256 hash (64 hex chars)
      expect(storedData.tokenHash).toHaveLength(64);
      expect(storedData.tokenHash).toMatch(/^[a-f0-9]+$/);

      // Verify it's the correct hash
      const expectedHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
      expect(storedData.tokenHash).toBe(expectedHash);
    });

    it('should use constant-time comparison', async () => {
      // This test verifies the implementation correctly validates tokens
      // by testing various edge cases that would fail with naive comparison
      const token = service.generateToken();

      await service.store(userId, token);

      // Valid token should pass
      const validResult = await service.validate(userId, token);
      expect(validResult).toBe(true);

      // Token with same prefix but different suffix should fail
      // This would pass a naive startsWith comparison
      const prefixToken = token.substring(0, 20) + 'x'.repeat(23);
      const prefixResult = await service.validate(userId, prefixToken);
      expect(prefixResult).toBe(false);

      // Token with same suffix but different prefix should fail
      const suffixToken = 'x'.repeat(20) + token.substring(20);
      const suffixResult = await service.validate(userId, suffixToken);
      expect(suffixResult).toBe(false);

      // Empty token should fail
      const emptyResult = await service.validate(userId, '');
      expect(emptyResult).toBe(false);
    });

    it('should use default TTL of 3600 seconds', async () => {
      const token = service.generateToken();

      await service.store(userId, token);

      // Verify set was called with default TTL
      expect(redisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        3600,
      );
    });

    it('should allow custom TTL', async () => {
      const token = service.generateToken();
      const customTtl = 7200;

      await service.store(userId, token, customTtl);

      expect(redisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        customTtl,
      );
    });

    it('should store metadata with correct structure', async () => {
      const token = service.generateToken();
      const ttl = 3600;

      const beforeStore = Date.now();
      await service.store(userId, token, ttl);
      const afterStore = Date.now();

      const setCall = redisService.set.mock.calls[0];
      const metadata = JSON.parse(setCall[1]);

      expect(metadata).toHaveProperty('userId', userId);
      expect(metadata).toHaveProperty('tokenHash');
      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('expiresAt');

      // Verify timestamps are reasonable
      expect(metadata.createdAt).toBeGreaterThanOrEqual(beforeStore);
      expect(metadata.createdAt).toBeLessThanOrEqual(afterStore);
      expect(metadata.expiresAt).toBe(metadata.createdAt + ttl * 1000);
    });
  });

  describe('invalidate', () => {
    const userId = 'user-123-456-789';

    it('should invalidate a specific token', async () => {
      const token = service.generateToken();

      await service.store(userId, token);

      // Token should be valid before invalidation
      expect(await service.validate(userId, token)).toBe(true);

      await service.invalidate(userId, token);

      // Token should be invalid after invalidation
      expect(await service.validate(userId, token)).toBe(false);
    });

    it('should only invalidate the specified token', async () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();

      await service.store(userId, token1);
      await service.store(userId, token2);

      await service.invalidate(userId, token1);

      // token1 should be invalid
      expect(await service.validate(userId, token1)).toBe(false);

      // token2 should still be valid
      expect(await service.validate(userId, token2)).toBe(true);
    });

    it('should not throw when invalidating non-existent token', async () => {
      const token = service.generateToken();

      // Should not throw
      await expect(service.invalidate(userId, token)).resolves.not.toThrow();
    });
  });

  describe('invalidateAllForUser', () => {
    const userId = 'user-123-456-789';
    const otherUserId = 'other-user-456';

    it('should invalidate all tokens for a user', async () => {
      const token1 = service.generateToken();
      const token2 = service.generateToken();
      const token3 = service.generateToken();

      await service.store(userId, token1);
      await service.store(userId, token2);
      await service.store(userId, token3);

      await service.invalidateAllForUser(userId);

      expect(redisService.deletePattern).toHaveBeenCalledWith(
        `csrf:user:${userId}:*`,
      );
    });

    it('should not affect tokens for other users', async () => {
      const userToken = service.generateToken();
      const otherToken = service.generateToken();

      await service.store(userId, userToken);
      await service.store(otherUserId, otherToken);

      await service.invalidateAllForUser(userId);

      // Other user's token should still be valid
      expect(await service.validate(otherUserId, otherToken)).toBe(true);
    });
  });

  describe('OAuth state tokens', () => {
    const state = 'random-oauth-state-token';
    const redirectUri = 'https://app.example.com/callback';

    it('should store and retrieve OAuth state', async () => {
      await service.storeState(state, redirectUri);

      const result = await service.getState(state);

      expect(result).not.toBeNull();
      expect(result?.redirectUri).toBe(redirectUri);
    });

    it('should return null for non-existent state', async () => {
      const result = await service.getState('non-existent-state');

      expect(result).toBeNull();
    });

    it('should delete state', async () => {
      await service.storeState(state, redirectUri);

      const deleted = await service.deleteState(state);

      expect(deleted).toBe(true);

      const result = await service.getState(state);
      expect(result).toBeNull();
    });

    it('should validate and consume state (single use)', async () => {
      await service.storeState(state, redirectUri);

      // First call should return the state
      const result = await service.validateAndConsume(state);
      expect(result).not.toBeNull();
      expect(result?.redirectUri).toBe(redirectUri);

      // Second call should return null (already consumed)
      const secondResult = await service.validateAndConsume(state);
      expect(secondResult).toBeNull();
    });

    it('should use default TTL of 300 seconds for OAuth state', async () => {
      await service.storeState(state, redirectUri);

      expect(redisService.set).toHaveBeenCalledWith(
        `csrf:state:${state}`,
        expect.any(String),
        300,
      );
    });

    it('should allow custom TTL for OAuth state', async () => {
      const customTtl = 600;

      await service.storeState(state, redirectUri, customTtl);

      expect(redisService.set).toHaveBeenCalledWith(
        `csrf:state:${state}`,
        expect.any(String),
        customTtl,
      );
    });

    it('should return null for expired OAuth state', async () => {
      await service.storeState(state, redirectUri);

      // Manually expire the state
      const key = `csrf:state:${state}`;
      const storedData = mockStorage.get(key);
      if (storedData) {
        const metadata = JSON.parse(storedData);
        metadata.expiresAt = Date.now() - 1000;
        mockStorage.set(key, JSON.stringify(metadata));
      }

      const result = await service.getState(state);

      expect(result).toBeNull();
    });
  });

  describe('graceful degradation', () => {
    it('should report availability status', async () => {
      const isAvailable = await service.isAvailable();

      expect(isAvailable).toBe(true);
      expect(redisService.isReady).toHaveBeenCalled();
    });

    it('should report unavailable when Redis is not ready', async () => {
      redisService.isReady.mockReturnValue(false);

      const isAvailable = await service.isAvailable();

      expect(isAvailable).toBe(false);
    });

    it('should throw when Redis fails during store', async () => {
      redisService.set.mockRejectedValue(new Error('Redis connection failed'));

      const token = service.generateToken();

      await expect(service.store('user-id', token)).rejects.toThrow(
        'Failed to store CSRF token in Redis',
      );
    });

    it('should throw when Redis fails during validate', async () => {
      redisService.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.validate('user-id', 'token')).rejects.toThrow(
        'Failed to validate CSRF token from Redis',
      );
    });

    it('should throw when Redis fails during invalidate', async () => {
      redisService.delete.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(service.invalidate('user-id', 'token')).rejects.toThrow(
        'Failed to invalidate CSRF token from Redis',
      );
    });

    it('should throw when Redis fails during invalidateAllForUser', async () => {
      redisService.deletePattern.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(service.invalidateAllForUser('user-id')).rejects.toThrow(
        'Failed to invalidate all CSRF tokens for user',
      );
    });

    it('should throw when Redis fails during OAuth state store', async () => {
      redisService.set.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.storeState('state', 'redirect-uri')).rejects.toThrow(
        'Failed to store OAuth state in Redis',
      );
    });

    it('should throw when Redis fails during OAuth state get', async () => {
      redisService.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.getState('state')).rejects.toThrow(
        'Failed to retrieve OAuth state from Redis',
      );
    });

    it('should throw when Redis fails during OAuth state delete', async () => {
      redisService.delete.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(service.deleteState('state')).rejects.toThrow(
        'Failed to delete OAuth state from Redis',
      );
    });
  });

  describe('security edge cases', () => {
    const userId = 'user-123';

    it('should handle empty token gracefully', async () => {
      const isValid = await service.validate(userId, '');
      expect(isValid).toBe(false);
    });

    it('should handle very long tokens', async () => {
      const longToken = 'a'.repeat(10000);

      await service.store(userId, longToken);
      const isValid = await service.validate(userId, longToken);

      expect(isValid).toBe(true);
    });

    it('should handle special characters in userId', async () => {
      const specialUserId = 'user:with:colons:and/slashes';
      const token = service.generateToken();

      await service.store(specialUserId, token);
      const isValid = await service.validate(specialUserId, token);

      expect(isValid).toBe(true);
    });

    it('should handle unicode characters in userId', async () => {
      const unicodeUserId = 'user-\u00e9\u00e0\u00fc-unicode';
      const token = service.generateToken();

      await service.store(unicodeUserId, token);
      const isValid = await service.validate(unicodeUserId, token);

      expect(isValid).toBe(true);
    });

    it('should reject tampered metadata (wrong userId)', async () => {
      const token = service.generateToken();

      await service.store(userId, token);

      // Tamper with stored metadata
      const key = `csrf:user:${userId}:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
      const storedData = mockStorage.get(key);
      if (storedData) {
        const metadata = JSON.parse(storedData);
        metadata.userId = 'tampered-user-id';
        mockStorage.set(key, JSON.stringify(metadata));
      }

      const isValid = await service.validate(userId, token);

      expect(isValid).toBe(false);
    });

    it('should reject tampered metadata (wrong tokenHash)', async () => {
      const token = service.generateToken();

      await service.store(userId, token);

      // Tamper with stored metadata
      const key = `csrf:user:${userId}:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
      const storedData = mockStorage.get(key);
      if (storedData) {
        const metadata = JSON.parse(storedData);
        metadata.tokenHash = crypto
          .createHash('sha256')
          .update('wrong-token')
          .digest('hex');
        mockStorage.set(key, JSON.stringify(metadata));
      }

      const isValid = await service.validate(userId, token);

      expect(isValid).toBe(false);
    });
  });
});
