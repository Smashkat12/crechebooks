/**
 * Test Fixtures - Centralized Test Context Management
 * TASK-TEST-001: Remove Mock Data from E2E Tests
 *
 * Provides reusable test context creation and cleanup for E2E tests.
 */
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { createTestTenant, createTestUser, getAuthToken, TestTenant, TestUser } from '../helpers';
import { UserRole } from '@prisma/client';

// Import generateUniqueId from utils for local use
import { generateUniqueId } from './utils';

/**
 * Complete test context for E2E tests
 */
export interface TestContext {
  prisma: PrismaService;
  tenant: TestTenant;
  user: TestUser;
  token: string;
  cleanup: () => Promise<void>;
}

/**
 * Options for creating test context
 */
export interface TestContextOptions {
  tenantName?: string;
  userEmail?: string;
  userRole?: UserRole;
}

/**
 * Create a complete test context with tenant, user, and auth token
 * Includes cleanup function for proper teardown
 */
export async function createTestContext(
  prisma: PrismaService,
  opts: TestContextOptions = {},
): Promise<TestContext> {
  const uniqueId = generateUniqueId();

  // Create tenant
  const tenant = await createTestTenant(prisma, {
    name: opts.tenantName || `Test Tenant ${uniqueId}`,
  });

  // Create user
  const user = await createTestUser(prisma, tenant.id, {
    email: opts.userEmail || `test-${uniqueId}@crechebooks.co.za`,
    role: opts.userRole || 'OWNER',
  });

  // Get auth token
  const token = getAuthToken(user);

  // Create cleanup function
  const cleanup = async () => {
    await cleanupTestData(prisma, tenant.id);
  };

  return { prisma, tenant, user, token, cleanup };
}

/**
 * Clean up all test data for a tenant
 * Order matters due to foreign key constraints - delete children before parents
 */
export async function cleanupTestData(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  // Delete in reverse order of dependencies
  try {
    // Payments first (references invoices)
    await prisma.payment.deleteMany({ where: { tenantId } });

    // Invoice lines (references invoices)
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });

    // Invoices (references parents, children)
    await prisma.invoice.deleteMany({ where: { tenantId } });

    // Enrollments (references children, fee structures)
    await prisma.enrollment.deleteMany({ where: { tenantId } });

    // Children (references parents)
    await prisma.child.deleteMany({ where: { tenantId } });

    // Parents
    await prisma.parent.deleteMany({ where: { tenantId } });

    // Fee structures
    await prisma.feeStructure.deleteMany({ where: { tenantId } });

    // Transactions
    await prisma.transaction.deleteMany({ where: { tenantId } });

    // Bank connections
    await prisma.bankConnection.deleteMany({ where: { tenantId } });

    // Reconciliations
    await prisma.reconciliation.deleteMany({ where: { tenantId } });

    // SARS submissions
    await prisma.sarsSubmission.deleteMany({ where: { tenantId } });

    // Audit logs
    await prisma.auditLog.deleteMany({ where: { tenantId } });

    // Users (before tenant)
    await prisma.user.deleteMany({ where: { tenantId } });

    // Finally, delete the tenant
    await prisma.tenant.delete({ where: { id: tenantId } });
  } catch (error) {
    // Log but don't fail - data might already be deleted
    console.warn(`Cleanup warning for tenant ${tenantId}:`, error);
  }
}

// Re-export helpers, factories, and utils
export * from './factories';
export * from './utils';
