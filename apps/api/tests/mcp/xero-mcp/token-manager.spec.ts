/**
 * Token Manager Tests
 * Integration tests with real database
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TokenManager, TokenSet } from '../../../src/mcp/xero-mcp/auth/token-manager';
import { Encryption } from '../../../src/mcp/xero-mcp/auth/encryption';
import { TokenNotFoundError } from '../../../src/mcp/xero-mcp/utils/error-handler';

describe('TokenManager', () => {
  let prisma: PrismaService;
  let tokenManager: TokenManager;
  let encryption: Encryption;

  beforeAll(async () => {
    // Ensure required env vars are set for tests
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
      process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-32-characters-!';
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.onModuleInit();

    tokenManager = new TokenManager(prisma);
    encryption = new Encryption();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean in FK order - leaf tables first!
    await prisma.xeroToken.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});
  });

  const createTestTenant = async () => {
    return prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Test St',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27111234567',
        email: `test${Date.now()}@test.co.za`,
      },
    });
  };

  describe('storeTokens', () => {
    it('should store encrypted tokens for a tenant', async () => {
      const tenant = await createTestTenant();

      const tokens: TokenSet = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: Date.now() + 3600000, // 1 hour from now
        xeroTenantId: 'xero-tenant-id-789',
      };

      await tokenManager.storeTokens(tenant.id, tokens);

      // Verify token was stored
      const stored = await prisma.xeroToken.findUnique({
        where: { tenantId: tenant.id },
      });

      expect(stored).not.toBeNull();
      expect(stored!.tenantId).toBe(tenant.id);
      expect(stored!.xeroTenantId).toBe('xero-tenant-id-789');
      expect(stored!.encryptedTokens).not.toContain('access-token-123'); // Should be encrypted
    });

    it('should update existing tokens', async () => {
      const tenant = await createTestTenant();

      const oldTokens: TokenSet = {
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() + 3600000,
        xeroTenantId: 'xero-tenant-id',
      };

      const newTokens: TokenSet = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: Date.now() + 7200000,
        xeroTenantId: 'xero-tenant-id',
      };

      await tokenManager.storeTokens(tenant.id, oldTokens);
      await tokenManager.storeTokens(tenant.id, newTokens);

      // Should still have only one record
      const count = await prisma.xeroToken.count({
        where: { tenantId: tenant.id },
      });
      expect(count).toBe(1);
    });
  });

  describe('getXeroTenantId', () => {
    it('should return Xero tenant ID', async () => {
      const tenant = await createTestTenant();

      const tokens: TokenSet = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        xeroTenantId: 'my-xero-tenant',
      };

      await tokenManager.storeTokens(tenant.id, tokens);

      const xeroTenantId = await tokenManager.getXeroTenantId(tenant.id);
      expect(xeroTenantId).toBe('my-xero-tenant');
    });

    it('should throw TokenNotFoundError when no connection exists', async () => {
      await expect(tokenManager.getXeroTenantId('non-existent-id'))
        .rejects.toThrow(TokenNotFoundError);
    });
  });

  describe('hasValidConnection', () => {
    it('should return true for valid, non-expired token', async () => {
      const tenant = await createTestTenant();

      const tokens: TokenSet = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000, // 1 hour from now
        xeroTenantId: 'xero-tenant',
      };

      await tokenManager.storeTokens(tenant.id, tokens);

      const hasConnection = await tokenManager.hasValidConnection(tenant.id);
      expect(hasConnection).toBe(true);
    });

    it('should return false for expired token', async () => {
      const tenant = await createTestTenant();

      const tokens: TokenSet = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
        xeroTenantId: 'xero-tenant',
      };

      await tokenManager.storeTokens(tenant.id, tokens);

      const hasConnection = await tokenManager.hasValidConnection(tenant.id);
      expect(hasConnection).toBe(false);
    });

    it('should return false when no token exists', async () => {
      const hasConnection = await tokenManager.hasValidConnection('non-existent');
      expect(hasConnection).toBe(false);
    });
  });

  describe('removeTokens', () => {
    it('should remove tokens for a tenant', async () => {
      const tenant = await createTestTenant();

      const tokens: TokenSet = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        xeroTenantId: 'xero-tenant',
      };

      await tokenManager.storeTokens(tenant.id, tokens);
      await tokenManager.removeTokens(tenant.id);

      const stored = await prisma.xeroToken.findUnique({
        where: { tenantId: tenant.id },
      });

      expect(stored).toBeNull();
    });
  });
});
