/**
 * ApiKeyService Integration Tests
 * TASK-CLI-001: API Key Management for CLI/MCP Access
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 * Tests full lifecycle: create, validate, list, revoke, rotate
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  ApiKeyService,
  CreateApiKeyDto,
} from '../../../src/api/auth/services/api-key.service';
import { ApiKeyScope, Tenant, User, UserRole, TaxStatus, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let prisma: PrismaService;

  // Test data
  let testTenant: Tenant;
  let testUser: User;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'NODE_ENV') return 'test';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    prisma = module.get<PrismaService>(PrismaService);

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche for API Keys',
        email: `api-key-test-${Date.now()}@example.com`,
        phone: '0123456789',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        taxStatus: TaxStatus.NOT_REGISTERED,
        subscriptionPlan: SubscriptionPlan.STARTER,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: `api-key-user-${Date.now()}@example.com`,
        name: 'Test User',
        auth0Id: `auth0|api-key-test-${Date.now()}`,
        role: UserRole.OWNER,
        tenantId: testTenant.id,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.apiKey.deleteMany({
      where: { tenantId: testTenant.id },
    });
    await prisma.user.delete({ where: { id: testUser.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
    await prisma.$disconnect();
  });

  describe('createApiKey', () => {
    it('should create an API key with secret', async () => {
      const dto: CreateApiKeyDto = {
        name: 'Test Production Key',
        scopes: [ApiKeyScope.FULL_ACCESS],
        description: 'Test key for CI/CD',
        environment: 'production',
      };

      const result = await service.createApiKey(testUser.id, testTenant.id, dto);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(dto.name);
      expect(result.secretKey).toBeDefined();
      expect(result.secretKey).toMatch(/^cb_prod_/);
      expect(result.keyPrefix).toBe(result.secretKey.slice(0, 12));
      expect(result.scopes).toContain(ApiKeyScope.FULL_ACCESS);
      expect(result.environment).toBe('production');
      expect(result.revokedAt).toBeNull();
    });

    it('should create staging key with correct prefix', async () => {
      const dto: CreateApiKeyDto = {
        name: 'Staging Key',
        scopes: [ApiKeyScope.READ_INVOICES],
        environment: 'staging',
      };

      const result = await service.createApiKey(testUser.id, testTenant.id, dto);

      expect(result.secretKey).toMatch(/^cb_stag_/);
      expect(result.environment).toBe('staging');
    });

    it('should create key with expiry date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const dto: CreateApiKeyDto = {
        name: 'Expiring Key',
        scopes: [ApiKeyScope.READ_PARENTS],
        expiresAt: futureDate,
      };

      const result = await service.createApiKey(testUser.id, testTenant.id, dto);

      expect(result.expiresAt).toBeDefined();
      expect(new Date(result.expiresAt!).getTime()).toBeCloseTo(futureDate.getTime(), -3);
    });

    it('should default to FULL_ACCESS if no scopes provided', async () => {
      const dto: CreateApiKeyDto = {
        name: 'Default Scopes Key',
        scopes: [],
      };

      const result = await service.createApiKey(testUser.id, testTenant.id, dto);

      expect(result.scopes).toContain(ApiKeyScope.FULL_ACCESS);
    });
  });

  describe('validateApiKey', () => {
    let validKey: Awaited<ReturnType<typeof service.createApiKey>>;

    beforeAll(async () => {
      validKey = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Validation Test Key',
        scopes: [ApiKeyScope.READ_INVOICES, ApiKeyScope.WRITE_INVOICES],
      });
    });

    it('should validate a correct API key', async () => {
      const result = await service.validateApiKey(validKey.secretKey);

      expect(result).not.toBeNull();
      expect(result!.apiKey.id).toBe(validKey.id);
      expect(result!.user.id).toBe(testUser.id);
      expect(result!.tenantId).toBe(testTenant.id);
    });

    it('should validate with client IP tracking', async () => {
      const clientIp = '192.168.1.100';
      const result = await service.validateApiKey(validKey.secretKey, clientIp);

      expect(result).not.toBeNull();

      // Wait for async fire-and-forget update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify lastUsedAt and lastUsedIp were updated
      const updatedKey = await prisma.apiKey.findUnique({
        where: { id: validKey.id },
      });
      expect(updatedKey!.lastUsedAt).toBeDefined();
      expect(updatedKey!.lastUsedIp).toBe(clientIp);
    });

    it('should reject invalid key format', async () => {
      const result = await service.validateApiKey('invalid_key_format');
      expect(result).toBeNull();
    });

    it('should reject wrong key', async () => {
      const result = await service.validateApiKey('cb_prod_wrongkeywrongkeywrongkey12');
      expect(result).toBeNull();
    });

    it('should reject revoked key', async () => {
      const revokedKey = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'To Be Revoked',
        scopes: [ApiKeyScope.READ_TENANTS],
      });

      await service.revokeApiKey(revokedKey.id, testTenant.id, testUser.id);

      const result = await service.validateApiKey(revokedKey.secretKey);
      expect(result).toBeNull();
    });

    it('should reject expired key', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const expiredKey = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Expired Key',
        scopes: [ApiKeyScope.READ_TENANTS],
        expiresAt: pastDate,
      });

      const result = await service.validateApiKey(expiredKey.secretKey);
      expect(result).toBeNull();
    });
  });

  describe('hasScope', () => {
    it('should return true for FULL_ACCESS key with any scope', async () => {
      const key = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Full Access Key',
        scopes: [ApiKeyScope.FULL_ACCESS],
      });

      const apiKey = await prisma.apiKey.findUnique({ where: { id: key.id } });

      expect(service.hasScope(apiKey!, ApiKeyScope.READ_INVOICES)).toBe(true);
      expect(service.hasScope(apiKey!, ApiKeyScope.WRITE_PAYMENTS)).toBe(true);
      expect(service.hasScope(apiKey!, ApiKeyScope.MANAGE_USERS)).toBe(true);
    });

    it('should return true only for granted scopes', async () => {
      const key = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Limited Key',
        scopes: [ApiKeyScope.READ_INVOICES, ApiKeyScope.READ_PAYMENTS],
      });

      const apiKey = await prisma.apiKey.findUnique({ where: { id: key.id } });

      expect(service.hasScope(apiKey!, ApiKeyScope.READ_INVOICES)).toBe(true);
      expect(service.hasScope(apiKey!, ApiKeyScope.READ_PAYMENTS)).toBe(true);
      expect(service.hasScope(apiKey!, ApiKeyScope.WRITE_INVOICES)).toBe(false);
      expect(service.hasScope(apiKey!, ApiKeyScope.MANAGE_USERS)).toBe(false);
    });
  });

  describe('listApiKeys', () => {
    it('should list only active keys by default', async () => {
      const keys = await service.listApiKeys(testTenant.id);

      expect(Array.isArray(keys)).toBe(true);
      keys.forEach((key) => {
        expect(key.revokedAt).toBeNull();
        expect(key.tenantId).toBe(testTenant.id);
      });
    });

    it('should include revoked keys when requested', async () => {
      // Create and revoke a key
      const keyToRevoke = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Key to List Revoked',
        scopes: [ApiKeyScope.READ_TENANTS],
      });
      await service.revokeApiKey(keyToRevoke.id, testTenant.id, testUser.id);

      const keysWithRevoked = await service.listApiKeys(testTenant.id, true);
      const keysWithoutRevoked = await service.listApiKeys(testTenant.id, false);

      expect(keysWithRevoked.length).toBeGreaterThan(keysWithoutRevoked.length);
      expect(keysWithRevoked.some((k) => k.id === keyToRevoke.id)).toBe(true);
      expect(keysWithoutRevoked.some((k) => k.id === keyToRevoke.id)).toBe(false);
    });
  });

  describe('getApiKey', () => {
    it('should return key for valid id and tenant', async () => {
      const created = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Get Test Key',
        scopes: [ApiKeyScope.READ_STAFF],
      });

      const result = await service.getApiKey(created.id, testTenant.id);

      expect(result.id).toBe(created.id);
      expect(result.name).toBe('Get Test Key');
    });

    it('should throw NotFoundException for wrong tenant', async () => {
      const created = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Wrong Tenant Test',
        scopes: [ApiKeyScope.READ_STAFF],
      });

      await expect(
        service.getApiKey(created.id, 'wrong-tenant-id')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        service.getApiKey('non-existent-id', testTenant.id)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an active key', async () => {
      const key = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'To Revoke',
        scopes: [ApiKeyScope.READ_CHILDREN],
      });

      const revoked = await service.revokeApiKey(key.id, testTenant.id, testUser.id);

      expect(revoked.revokedAt).toBeDefined();
      expect(revoked.revokedBy).toBe(testUser.id);
    });

    it('should throw ConflictException when revoking already revoked key', async () => {
      const key = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Already Revoked',
        scopes: [ApiKeyScope.READ_CHILDREN],
      });

      await service.revokeApiKey(key.id, testTenant.id, testUser.id);

      await expect(
        service.revokeApiKey(key.id, testTenant.id, testUser.id)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('rotateApiKey', () => {
    it('should create new key and revoke old one', async () => {
      const original = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Original Key',
        scopes: [ApiKeyScope.READ_TRANSACTIONS],
        description: 'Test description',
        environment: 'staging',
      });

      const rotated = await service.rotateApiKey(
        original.id,
        testTenant.id,
        testUser.id
      );

      // New key should have same settings
      expect(rotated.id).not.toBe(original.id);
      expect(rotated.scopes).toEqual(original.scopes);
      expect(rotated.environment).toBe(original.environment);
      expect(rotated.description).toBe(original.description);
      expect(rotated.name).toContain('(rotated)');
      expect(rotated.secretKey).toBeDefined();
      expect(rotated.secretKey).not.toBe(original.secretKey);

      // Old key should be revoked
      const oldKey = await prisma.apiKey.findUnique({
        where: { id: original.id },
      });
      expect(oldKey!.revokedAt).toBeDefined();
    });

    it('should throw ForbiddenException when rotating revoked key', async () => {
      const key = await service.createApiKey(testUser.id, testTenant.id, {
        name: 'Revoked for Rotate',
        scopes: [ApiKeyScope.READ_REPORTS],
      });

      await service.revokeApiKey(key.id, testTenant.id, testUser.id);

      await expect(
        service.rotateApiKey(key.id, testTenant.id, testUser.id)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('should revoke expired keys', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      // Create an expired key directly in DB (bypassing validation)
      const expiredKey = await prisma.apiKey.create({
        data: {
          name: 'Cleanup Test Key',
          keyPrefix: `cb_prod_exp${Date.now()}`.slice(0, 12),
          keyHash: 'test-hash-for-cleanup',
          tenantId: testTenant.id,
          userId: testUser.id,
          scopes: [ApiKeyScope.READ_TENANTS],
          environment: 'production',
          expiresAt: pastDate,
        },
      });

      const count = await service.cleanupExpiredKeys();

      expect(count).toBeGreaterThanOrEqual(1);

      const updated = await prisma.apiKey.findUnique({
        where: { id: expiredKey.id },
      });
      expect(updated!.revokedAt).toBeDefined();
      expect(updated!.revokedBy).toBe('SYSTEM_EXPIRY');
    });
  });
});
