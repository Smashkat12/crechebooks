/**
 * Test Data Generators
 * Creates real database records for E2E testing - NO MOCKS
 */
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

// Use a test JWT secret - E2E tests should configure this
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-e2e-testing';

export interface TestTenant {
  id: string;
  name: string;
  email: string;
}

export interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  auth0Id: string;
}

/**
 * Create a test tenant with required fields
 */
export async function createTestTenant(
  prisma: PrismaService,
  opts: { name?: string; email?: string } = {}
): Promise<TestTenant> {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const tenant = await prisma.tenant.create({
    data: {
      name: opts.name || `E2E Test Tenant ${uniqueId}`,
      addressLine1: '123 Test Street',
      city: 'Johannesburg',
      province: 'Gauteng',
      postalCode: '2000',
      phone: '+27 11 123 4567',
      email: opts.email || `e2e-test-${uniqueId}@test.crechebooks.co.za`,
    },
  });
  return { id: tenant.id, name: tenant.name, email: tenant.email };
}

/**
 * Create a test user linked to tenant
 */
export async function createTestUser(
  prisma: PrismaService,
  tenantId: string,
  opts: { role?: UserRole; email?: string } = {}
): Promise<TestUser> {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const user = await prisma.user.create({
    data: {
      tenantId,
      auth0Id: `auth0|test-${uniqueId}`,
      email: opts.email || `testuser-${uniqueId}@test.crechebooks.co.za`,
      name: 'E2E Test User',
      role: opts.role || UserRole.OWNER,
      isActive: true,
    },
  });
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    auth0Id: user.auth0Id,
  };
}

/**
 * Generate a valid JWT token for testing
 */
export function getAuthToken(user: TestUser): string {
  const payload = {
    sub: user.auth0Id,
    email: user.email,
    // Include user info that JwtStrategy expects
    'https://crechebooks.co.za/user_id': user.id,
    'https://crechebooks.co.za/tenant_id': user.tenantId,
    'https://crechebooks.co.za/role': user.role,
  };
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Seed chart of accounts for a tenant
 */
export async function seedChartOfAccounts(
  prisma: PrismaService,
  tenantId: string
): Promise<void> {
  // Create payee patterns for common SA retailers
  const patterns = [
    { payeePattern: 'WOOLWORTHS', accountCode: '5100', accountName: 'Groceries & Supplies' },
    { payeePattern: 'CHECKERS', accountCode: '5100', accountName: 'Groceries & Supplies' },
    { payeePattern: 'PICK N PAY', accountCode: '5100', accountName: 'Groceries & Supplies' },
    { payeePattern: 'SPAR', accountCode: '5100', accountName: 'Groceries & Supplies' },
    { payeePattern: 'ESKOM', accountCode: '5200', accountName: 'Utilities' },
    { payeePattern: 'CITY OF JOHANNESBURG', accountCode: '5200', accountName: 'Utilities' },
  ];

  for (const p of patterns) {
    await prisma.payeePattern.upsert({
      where: { tenantId_payeePattern: { tenantId, payeePattern: p.payeePattern } },
      update: {},
      create: {
        tenantId,
        payeePattern: p.payeePattern,
        defaultAccountCode: p.accountCode,
        defaultAccountName: p.accountName,
        confidenceBoost: 10,
      },
    });
  }
}

/**
 * Cleanup test data by tenant ID
 */
export async function cleanupTestData(
  prisma: PrismaService,
  tenantId: string
): Promise<void> {
  // Delete in order respecting foreign keys
  await prisma.categorization.deleteMany({
    where: { transaction: { tenantId } }
  });
  await prisma.transaction.deleteMany({ where: { tenantId } });
  await prisma.payeePattern.deleteMany({ where: { tenantId } });

  // Billing data cleanup
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.enrollment.deleteMany({ where: { tenantId } });
  await prisma.child.deleteMany({ where: { tenantId } });
  await prisma.parent.deleteMany({ where: { tenantId } });
  await prisma.feeStructure.deleteMany({ where: { tenantId } });

  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}
