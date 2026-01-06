<task_spec id="TASK-TEST-001" version="1.0">

<metadata>
  <title>Remove Mock Data from E2E Tests</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>testing</layer>
  <sequence>152</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-TEST-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - can be done anytime -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis, it was discovered that E2E tests use inline
mock data creation instead of proper test fixtures. This makes tests fragile
and harder to maintain.

## Current State
- E2E tests located in `apps/api/tests/e2e/`
- Each test file creates its own mock data in `beforeAll` blocks
- Helper functions exist in `apps/api/tests/helpers/` but not consistently used
- Tests create tenants, users, parents, children inline
- Mock data scattered across test files

## What Should Happen
E2E tests should:
1. Use centralized test fixtures
2. Have reusable data creation helpers
3. Clean up data properly after tests
4. Use consistent naming conventions
5. Support parallel test execution with isolated data

## Project Context
- **E2E Tests**: `apps/api/tests/e2e/*.e2e.spec.ts`
- **Test Helpers**: `apps/api/tests/helpers/`
- **Prisma Test Utils**: PrismaService for database access
- **Test Framework**: Jest with NestJS TestingModule

## Test Files to Refactor
1. `billing-cycle.e2e.spec.ts` - Has inline createTestParent, createTestChild helpers
2. `transaction-flow.e2e.spec.ts` - Creates test data inline
3. `reconciliation-flow.e2e.spec.ts` - Multiple beforeAll blocks with data setup
4. `payment-matching.e2e.spec.ts` - Inline data creation
5. `sars-submission.e2e.spec.ts` - Multiple data setup blocks
</context>

<input_context_files>
  <file purpose="example_e2e_test">apps/api/tests/e2e/billing-cycle.e2e.spec.ts</file>
  <file purpose="test_helpers">apps/api/tests/helpers/index.ts</file>
  <file purpose="reconciliation_e2e">apps/api/tests/e2e/reconciliation-flow.e2e.spec.ts</file>
  <file purpose="payment_matching_e2e">apps/api/tests/e2e/payment-matching.e2e.spec.ts</file>
</input_context_files>

<prerequisites>
  <check>Test helpers directory exists</check>
  <check>Jest configuration in place</check>
  <check>E2E tests currently passing</check>
</prerequisites>

<scope>
  <in_scope>
    - Create centralized test fixtures module
    - Create reusable factory functions for entities
    - Refactor E2E tests to use fixtures
    - Add proper cleanup in afterAll blocks
    - Ensure tests remain isolated
    - Maintain existing test coverage
    - Add unique identifiers for parallel execution
  </in_scope>
  <out_of_scope>
    - Adding new E2E tests
    - Changing test assertions
    - Modifying test coverage requirements
    - Performance optimization of tests
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/tests/fixtures/index.ts">
      export interface TestContext {
        prisma: PrismaService;
        tenant: Tenant;
        user: User;
        token: string;
      }

      /**
       * Create a complete test context with tenant, user, and auth token
       */
      export async function createTestContext(
        prisma: PrismaService,
        opts?: TestContextOptions,
      ): Promise&lt;TestContext&gt;;

      /**
       * Clean up all test data for a context
       */
      export async function cleanupTestContext(
        context: TestContext,
      ): Promise&lt;void&gt;;
    </signature>

    <signature file="apps/api/tests/fixtures/factories/parent.factory.ts">
      export interface ParentFactoryOptions {
        tenantId: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        preferredContact?: PreferredContact;
      }

      /**
       * Create a test parent with default values
       */
      export async function createParent(
        prisma: PrismaService,
        opts: ParentFactoryOptions,
      ): Promise&lt;Parent&gt;;

      /**
       * Create multiple test parents
       */
      export async function createParents(
        prisma: PrismaService,
        count: number,
        opts: ParentFactoryOptions,
      ): Promise&lt;Parent[]&gt;;
    </signature>
  </signatures>

  <constraints>
    - All test data must include tenantId for isolation
    - Unique identifiers must prevent collisions in parallel runs
    - Cleanup must handle foreign key constraints correctly
    - Factory defaults should be sensible and documented
    - Tests must pass in isolation and in parallel
  </constraints>

  <verification>
    - All E2E tests pass after refactoring
    - Test fixtures are reusable across test files
    - No inline data creation in test files
    - Cleanup runs reliably in afterAll
    - Tests can run in parallel without conflicts
    - No test data leaks between runs
  </verification>
</definition_of_done>

<pseudo_code>
Test Fixtures (apps/api/tests/fixtures/index.ts):

import { PrismaService } from '../../src/database/prisma/prisma.service';
import { createTenant, createUser, getAuthToken } from '../helpers';

export interface TestContext {
  prisma: PrismaService;
  tenant: { id: string; name: string };
  user: { id: string; email: string };
  token: string;
  cleanup: () => Promise<void>;
}

export interface TestContextOptions {
  tenantName?: string;
  userEmail?: string;
  userRole?: UserRole;
}

/**
 * Create a complete test context with tenant, user, and auth token
 */
export async function createTestContext(
  prisma: PrismaService,
  opts: TestContextOptions = {},
): Promise<TestContext> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Create tenant
  const tenant = await createTenant(prisma, {
    name: opts.tenantName || `Test Tenant ${uniqueId}`,
  });

  // Create user
  const user = await createUser(prisma, tenant.id, {
    email: opts.userEmail || `test-${uniqueId}@crechebooks.co.za`,
    role: opts.userRole || 'OWNER',
  });

  // Get auth token
  const token = await getAuthToken(user);

  // Create cleanup function
  const cleanup = async () => {
    await cleanupTestContext(prisma, tenant.id);
  };

  return { prisma, tenant, user, token, cleanup };
}

/**
 * Clean up all test data for a tenant
 * Order matters due to foreign key constraints
 */
export async function cleanupTestContext(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  // Delete in reverse order of dependencies
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.invoiceLine.deleteMany({
    where: { invoice: { tenantId } },
  });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.enrollment.deleteMany({ where: { tenantId } });
  await prisma.child.deleteMany({ where: { tenantId } });
  await prisma.parent.deleteMany({ where: { tenantId } });
  await prisma.feeStructure.deleteMany({ where: { tenantId } });
  await prisma.transaction.deleteMany({ where: { tenantId } });
  await prisma.bankConnection.deleteMany({ where: { tenantId } });
  await prisma.reconciliation.deleteMany({ where: { tenantId } });
  await prisma.sarsSubmission.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}

// Factory: Parent (apps/api/tests/fixtures/factories/parent.factory.ts)

export interface ParentFactoryOptions {
  tenantId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredContact?: PreferredContact;
}

export async function createParent(
  prisma: PrismaService,
  opts: ParentFactoryOptions,
): Promise<Parent> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return prisma.parent.create({
    data: {
      tenantId: opts.tenantId,
      firstName: opts.firstName || `Parent${uniqueId.slice(0, 5)}`,
      lastName: opts.lastName || 'Test',
      email: opts.email || `parent-${uniqueId}@test.crechebooks.co.za`,
      phone: opts.phone || '+27 11 123 4567',
      whatsapp: opts.whatsapp || '+27 11 123 4567',
      preferredContact: opts.preferredContact || 'EMAIL',
      isActive: true,
    },
  });
}

// Factory: Child (apps/api/tests/fixtures/factories/child.factory.ts)

export interface ChildFactoryOptions {
  tenantId: string;
  parentId: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
}

export async function createChild(
  prisma: PrismaService,
  opts: ChildFactoryOptions,
): Promise<Child> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return prisma.child.create({
    data: {
      tenantId: opts.tenantId,
      parentId: opts.parentId,
      firstName: opts.firstName || `Child${uniqueId.slice(0, 5)}`,
      lastName: opts.lastName || 'Test',
      dateOfBirth: opts.dateOfBirth || new Date('2020-01-15'),
      isActive: true,
    },
  });
}

// Factory: Fee Structure (apps/api/tests/fixtures/factories/fee-structure.factory.ts)

export async function createFeeStructure(
  prisma: PrismaService,
  opts: { tenantId: string; name?: string; amountCents?: number },
): Promise<FeeStructure> {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return prisma.feeStructure.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.name || `Fee Structure ${uniqueId.slice(0, 5)}`,
      amountCents: opts.amountCents || 500000, // R5,000.00
      billingCycle: 'MONTHLY',
      isActive: true,
    },
  });
}

// Usage in E2E test (apps/api/tests/e2e/billing-cycle.e2e.spec.ts):

import { createTestContext, TestContext } from '../fixtures';
import { createParent, createChild, createFeeStructure } from '../fixtures/factories';

describe('Billing Cycle E2E', () => {
  let context: TestContext;
  let parent: Parent;
  let child: Child;
  let feeStructure: FeeStructure;

  beforeAll(async () => {
    // Create test context with tenant and user
    context = await createTestContext(prisma);

    // Create test data using factories
    parent = await createParent(prisma, { tenantId: context.tenant.id });
    child = await createChild(prisma, {
      tenantId: context.tenant.id,
      parentId: parent.id,
    });
    feeStructure = await createFeeStructure(prisma, {
      tenantId: context.tenant.id,
    });
  });

  afterAll(async () => {
    // Clean up all test data
    await context.cleanup();
  });

  // Tests use context.token for authentication
  // Tests use parent, child, feeStructure for assertions
});
</pseudo_code>

<files_to_create>
  <file path="apps/api/tests/fixtures/index.ts">Main fixtures module with TestContext</file>
  <file path="apps/api/tests/fixtures/factories/parent.factory.ts">Parent factory</file>
  <file path="apps/api/tests/fixtures/factories/child.factory.ts">Child factory</file>
  <file path="apps/api/tests/fixtures/factories/fee-structure.factory.ts">FeeStructure factory</file>
  <file path="apps/api/tests/fixtures/factories/enrollment.factory.ts">Enrollment factory</file>
  <file path="apps/api/tests/fixtures/factories/invoice.factory.ts">Invoice factory</file>
  <file path="apps/api/tests/fixtures/factories/transaction.factory.ts">Transaction factory</file>
  <file path="apps/api/tests/fixtures/factories/index.ts">Factory exports</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/tests/e2e/billing-cycle.e2e.spec.ts">Refactor to use fixtures</file>
  <file path="apps/api/tests/e2e/transaction-flow.e2e.spec.ts">Refactor to use fixtures</file>
  <file path="apps/api/tests/e2e/reconciliation-flow.e2e.spec.ts">Refactor to use fixtures</file>
  <file path="apps/api/tests/e2e/payment-matching.e2e.spec.ts">Refactor to use fixtures</file>
  <file path="apps/api/tests/e2e/sars-submission.e2e.spec.ts">Refactor to use fixtures</file>
</files_to_modify>

<validation_criteria>
  <criterion>All E2E tests pass after refactoring</criterion>
  <criterion>Fixtures module exports TestContext</criterion>
  <criterion>Factory functions create valid entities</criterion>
  <criterion>Cleanup handles all entities correctly</criterion>
  <criterion>No inline data creation in test files</criterion>
  <criterion>Tests run successfully in parallel</criterion>
  <criterion>No test data remains after cleanup</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test:e2e -- billing-cycle</command>
  <command>npm run test:e2e -- transaction-flow</command>
  <command>npm run test:e2e -- reconciliation-flow</command>
  <command>npm run test:e2e -- payment-matching</command>
  <command>npm run test:e2e -- sars-submission</command>
  <command>npm run test:e2e</command>
</test_commands>

</task_spec>
