/**
 * E2E Billing Cycle Flow Tests
 * TASK-INT-002: Complete integration test for billing cycle
 *
 * CRITICAL: Uses real database and real services - NO MOCKS except for delivery services
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { JwtStrategy } from '../../src/api/auth/strategies/jwt.strategy';
import {
  createTestTenant,
  createTestUser,
  getAuthToken,
  TestTenant,
  TestUser,
  TestJwtStrategy,
} from '../helpers';
import Decimal from 'decimal.js';

// Helper types for test data
interface TestParent {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface TestChild {
  id: string;
  firstName: string;
  lastName: string;
  parentId: string;
}

interface TestFeeStructure {
  id: string;
  name: string;
  amountCents: number;
}

interface TestEnrollment {
  id: string;
  childId: string;
  feeStructureId: string;
  startDate: Date;
}

/**
 * Helper: Create a test parent
 */
async function createTestParent(
  prisma: PrismaService,
  tenantId: string,
  opts: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
  } = {},
): Promise<TestParent> {
  const uniqueId =
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const parent = await prisma.parent.create({
    data: {
      tenantId,
      firstName: opts.firstName || `Parent${uniqueId}`,
      lastName: opts.lastName || `Test`,
      email: opts.email || `parent-${uniqueId}@test.crechebooks.co.za`,
      phone: opts.phone || '+27 11 123 4567',
      whatsapp: opts.whatsapp || '+27 11 123 4567',
      preferredContact: 'EMAIL',
      isActive: true,
    },
  });

  return {
    id: parent.id,
    email: parent.email!,
    firstName: parent.firstName,
    lastName: parent.lastName,
  };
}

/**
 * Helper: Create a test child
 */
async function createTestChild(
  prisma: PrismaService,
  tenantId: string,
  parentId: string,
  opts: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: Date;
  } = {},
): Promise<TestChild> {
  const uniqueId =
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const child = await prisma.child.create({
    data: {
      tenantId,
      parentId,
      firstName: opts.firstName || `Child${uniqueId}`,
      lastName: opts.lastName || `Test`,
      dateOfBirth: opts.dateOfBirth || new Date('2020-01-01'),
      isActive: true,
    },
  });

  return {
    id: child.id,
    firstName: child.firstName,
    lastName: child.lastName,
    parentId: child.parentId,
  };
}

/**
 * Helper: Create a test fee structure
 */
async function createTestFeeStructure(
  prisma: PrismaService,
  tenantId: string,
  opts: {
    name?: string;
    amountCents?: number;
    vatInclusive?: boolean;
  } = {},
): Promise<TestFeeStructure> {
  const uniqueId =
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const feeStructure = await prisma.feeStructure.create({
    data: {
      tenantId,
      name: opts.name || `Fee-${uniqueId}`,
      feeType: 'FULL_DAY',
      amountCents: opts.amountCents || 300000, // Default R3,000
      vatInclusive: opts.vatInclusive ?? false,
      effectiveFrom: new Date('2025-01-01'),
      isActive: true,
    },
  });

  return {
    id: feeStructure.id,
    name: feeStructure.name,
    amountCents: feeStructure.amountCents,
  };
}

/**
 * Helper: Create a test enrollment
 */
async function createTestEnrollment(
  prisma: PrismaService,
  tenantId: string,
  childId: string,
  feeStructureId: string,
  opts: {
    startDate?: Date;
    endDate?: Date;
    customFeeOverrideCents?: number;
  } = {},
): Promise<TestEnrollment> {
  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId,
      childId,
      feeStructureId,
      startDate: opts.startDate || new Date('2025-01-01'),
      endDate: opts.endDate || null,
      status: 'ACTIVE',
      siblingDiscountApplied: false,
      customFeeOverrideCents: opts.customFeeOverrideCents || null,
    },
  });

  return {
    id: enrollment.id,
    childId: enrollment.childId,
    feeStructureId: enrollment.feeStructureId,
    startDate: enrollment.startDate,
  };
}

/**
 * Helper: Calculate expected pro-rata amount
 */
function calculateProRataAmount(
  monthlyAmountCents: number,
  startDay: number,
  daysInMonth: number,
): number {
  const monthlyAmount = new Decimal(monthlyAmountCents).div(100);
  const daysEnrolled = daysInMonth - startDay + 1;
  const proRata = monthlyAmount.mul(daysEnrolled).div(daysInMonth);
  return Math.round(proRata.mul(100).toNumber());
}

/**
 * Helper: Calculate expected sibling discount
 * (Currently unused but kept for future reference)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateSiblingDiscountAmount(
  baseAmountCents: number,
  siblingOrder: number,
): number {
  if (siblingOrder === 1) return 0; // First child: no discount
  if (siblingOrder === 2) {
    // Second child: 10% discount
    return Math.round(baseAmountCents * 0.1);
  }
  // Third+ child: 15% discount
  return Math.round(baseAmountCents * 0.15);
}

/**
 * Helper: Calculate expected VAT
 */
function calculateVAT(subtotalCents: number, vatRate: number = 0.15): number {
  const subtotal = new Decimal(subtotalCents).div(100);
  const vat = subtotal.mul(vatRate);
  return Math.round(vat.mul(100).toNumber());
}

/**
 * Helper: Cleanup billing test data
 */
async function cleanupBillingTestData(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  // Delete in order respecting foreign keys
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

describe('E2E: Billing Cycle Flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let testTenant: TestTenant;
  let testUser: TestUser;

  // Test data holders
  let testParent1: TestParent;
  let testParent2: TestParent;
  const testChildren: TestChild[] = [];
  let testFeeStructure: TestFeeStructure;
  let generatedInvoiceIds: string[] = [];

  beforeAll(async () => {
    // Create NestJS app with TestJwtStrategy override
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtStrategy)
      .useClass(TestJwtStrategy)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Create test tenant and user
    testTenant = await createTestTenant(prisma);
    testUser = await createTestUser(prisma, testTenant.id);
    authToken = getAuthToken(testUser);
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Cleanup in reverse order of creation
    if (testTenant?.id) {
      await cleanupBillingTestData(prisma, testTenant.id);
    }
    await app?.close();
  }, 30000);

  describe('Setup: Child Enrollment', () => {
    it('should create parent and children with enrollments', async () => {
      // 1. Create fee structure
      testFeeStructure = await createTestFeeStructure(prisma, testTenant.id, {
        name: 'Full Day Care',
        amountCents: 300000, // R3,000
        vatInclusive: false,
      });

      expect(testFeeStructure.id).toBeDefined();
      expect(testFeeStructure.amountCents).toBe(300000);

      // 2. Create parent with 3 children (for sibling discount testing)
      testParent1 = await createTestParent(prisma, testTenant.id, {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.crechebooks.co.za',
      });

      expect(testParent1.id).toBeDefined();

      // 3. Create 3 children
      for (let i = 1; i <= 3; i++) {
        const child = await createTestChild(
          prisma,
          testTenant.id,
          testParent1.id,
          {
            firstName: `Child${i}`,
            lastName: 'Doe',
          },
        );
        testChildren.push(child);

        // Enroll child
        await createTestEnrollment(
          prisma,
          testTenant.id,
          child.id,
          testFeeStructure.id,
          {
            startDate: new Date('2025-01-01'),
          },
        );
      }

      expect(testChildren.length).toBe(3);
    });

    it('should verify enrollments via API', async () => {
      const response = await request(app.getHttpServer())
        .get('/children')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Invoice Generation', () => {
    it('should generate monthly invoices with correct amounts', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-01',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.invoices_created).toBeGreaterThanOrEqual(3);

      // Store invoice IDs
      generatedInvoiceIds = response.body.data.invoices.map(
        (inv: any) => inv.id,
      );
      expect(generatedInvoiceIds.length).toBeGreaterThanOrEqual(3);
    });

    it('should calculate sibling discounts correctly', async () => {
      // Get all invoices for parent
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ parent_id: testParent1.id, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(3);

      const invoices = response.body.data;

      // First child: full amount (R3,000)
      const child1Invoice = invoices.find((inv: any) =>
        inv.child.name.includes('Child1'),
      );
      expect(child1Invoice).toBeDefined();
      // Subtotal should be R3,000
      expect(child1Invoice.subtotal).toBe(3000);

      // Second child: 10% discount (R3,000 - R300 = R2,700)
      const child2Invoice = invoices.find((inv: any) =>
        inv.child.name.includes('Child2'),
      );
      expect(child2Invoice).toBeDefined();
      expect(child2Invoice.subtotal).toBe(2700);

      // Third child: 15% discount (R3,000 - R450 = R2,550)
      const child3Invoice = invoices.find((inv: any) =>
        inv.child.name.includes('Child3'),
      );
      expect(child3Invoice).toBeDefined();
      expect(child3Invoice.subtotal).toBe(2550);
    });

    it('should calculate VAT at 15% correctly', async () => {
      // Update tenant to be VAT registered
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: { vatRegistered: true, vatNumber: 'TEST-VAT-123' },
      });

      // Generate new invoices for February
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-02',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.invoices_created).toBeGreaterThanOrEqual(3);

      // Get invoices and verify VAT
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          parent_id: testParent1.id,
          date_from: '2025-02-01',
          limit: 10,
        });

      const invoices = invoicesResponse.body.data;

      for (const invoice of invoices) {
        const expectedVAT = calculateVAT(Math.round(invoice.subtotal * 100));
        const actualVAT = Math.round(invoice.vat * 100);

        // Allow 1 cent rounding difference
        expect(Math.abs(actualVAT - expectedVAT)).toBeLessThanOrEqual(1);

        // Verify total = subtotal + vat
        const expectedTotal = Math.round(invoice.subtotal * 100) + actualVAT;
        const actualTotal = Math.round(invoice.total * 100);
        expect(Math.abs(actualTotal - expectedTotal)).toBeLessThanOrEqual(1);
      }
    });

    it('should prevent duplicate invoices for same billing period', async () => {
      // Try to generate invoices for January again
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-01',
        });

      expect(response.status).toBe(201);
      // Should skip duplicates
      expect(response.body.data.invoices_created).toBe(0);
    });

    it('should reject future month invoice generation', async () => {
      // Try to generate invoices for next year
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureMonth = `${futureDate.getFullYear()}-${String(
        futureDate.getMonth() + 1,
      ).padStart(2, '0')}`;

      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: futureMonth,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Pro-rata Calculation', () => {
    it('should calculate pro-rata for mid-month enrollment', async () => {
      // Create new parent and child
      testParent2 = await createTestParent(prisma, testTenant.id, {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@test.crechebooks.co.za',
      });

      const midMonthChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent2.id,
        {
          firstName: 'ProRata',
          lastName: 'Child',
        },
      );

      // Enroll starting mid-month (Jan 15)
      await createTestEnrollment(
        prisma,
        testTenant.id,
        midMonthChild.id,
        testFeeStructure.id,
        {
          startDate: new Date('2025-01-15'),
        },
      );

      // Generate invoices for January
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-01',
          child_ids: [midMonthChild.id],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.invoices_created).toBe(1);

      // Get the invoice
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ child_id: midMonthChild.id, limit: 1 });

      const invoice = invoicesResponse.body.data[0];
      expect(invoice).toBeDefined();

      // Calculate expected pro-rata: R3,000 × (17/31) = R1,645.16
      const expectedProRata = calculateProRataAmount(300000, 15, 31);
      const actualProRata = Math.round(invoice.subtotal * 100);

      // Allow 1 cent rounding difference
      expect(Math.abs(actualProRata - expectedProRata)).toBeLessThanOrEqual(1);
    });

    it('should handle enrollment on last day of month', async () => {
      const lastDayChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent2.id,
        {
          firstName: 'LastDay',
          lastName: 'Child',
        },
      );

      // Enroll on last day of January (31st)
      await createTestEnrollment(
        prisma,
        testTenant.id,
        lastDayChild.id,
        testFeeStructure.id,
        {
          startDate: new Date('2025-01-31'),
        },
      );

      // Generate invoice
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-01',
          child_ids: [lastDayChild.id],
        });

      expect(response.status).toBe(201);

      // Get invoice
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ child_id: lastDayChild.id, limit: 1 });

      const invoice = invoicesResponse.body.data[0];

      // Pro-rata for 1 day: R3,000 × (1/31) = R96.77
      const expectedProRata = calculateProRataAmount(300000, 31, 31);
      const actualProRata = Math.round(invoice.subtotal * 100);

      expect(Math.abs(actualProRata - expectedProRata)).toBeLessThanOrEqual(1);
    });
  });

  describe('Custom Fee Override', () => {
    it('should use custom fee override instead of standard fee', async () => {
      // Create child with custom fee override
      const customChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent2.id,
        {
          firstName: 'Custom',
          lastName: 'Fee',
        },
      );

      // Enroll with custom fee: R2,500
      await createTestEnrollment(
        prisma,
        testTenant.id,
        customChild.id,
        testFeeStructure.id,
        {
          startDate: new Date('2025-03-01'),
          customFeeOverrideCents: 250000, // R2,500
        },
      );

      // Generate invoices for March
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-03',
          child_ids: [customChild.id],
        });

      expect(response.status).toBe(201);

      // Verify invoice uses custom fee
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ child_id: customChild.id, limit: 1 });

      const invoice = invoicesResponse.body.data[0];
      expect(invoice.subtotal).toBe(2500); // R2,500
    });
  });

  describe('Invoice Delivery', () => {
    it('should send invoices via email', async () => {
      // Get first 3 invoices (January invoices)
      const invoiceIdsToSend = generatedInvoiceIds.slice(0, 3);

      const response = await request(app.getHttpServer())
        .post('/invoices/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_ids: invoiceIdsToSend,
          delivery_method: 'EMAIL',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sent).toBeGreaterThanOrEqual(1);
      expect(response.body.data.failed).toBeLessThanOrEqual(2);
    });

    it('should update invoice status after sending', async () => {
      // Check that invoices moved from DRAFT to SENT
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'SENT', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      // Verify delivery status
      const sentInvoice = response.body.data[0];
      expect(sentInvoice.delivery_status).toBe('SENT');
    });

    it('should handle partial delivery failures gracefully', async () => {
      // Create parent with invalid email
      const badParent = await createTestParent(prisma, testTenant.id, {
        email: 'invalid-email-format',
      });

      const badChild = await createTestChild(
        prisma,
        testTenant.id,
        badParent.id,
      );

      await createTestEnrollment(
        prisma,
        testTenant.id,
        badChild.id,
        testFeeStructure.id,
        {
          startDate: new Date('2025-04-01'),
        },
      );

      // Generate invoice
      const genResponse = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-04',
          child_ids: [badChild.id],
        });

      const badInvoiceId = genResponse.body.data.invoices[0].id;

      // Try to send (should fail but not throw)
      const sendResponse = await request(app.getHttpServer())
        .post('/invoices/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_ids: [badInvoiceId],
          delivery_method: 'EMAIL',
        });

      expect(sendResponse.status).toBe(200);
      expect(sendResponse.body.success).toBe(true);
      // Should track failure
      if (sendResponse.body.data.failed > 0) {
        expect(sendResponse.body.data.failures).toBeDefined();
        expect(sendResponse.body.data.failures.length).toBeGreaterThan(0);
      }
    });
  });

  describe('VAT Registration Toggle', () => {
    it('should not include VAT for non-VAT registered tenant', async () => {
      // Set tenant as non-VAT registered
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: { vatRegistered: false, vatNumber: null },
      });

      // Create new enrollment for May
      const noVatChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent1.id,
        {
          firstName: 'NoVAT',
          lastName: 'Child',
        },
      );

      await createTestEnrollment(
        prisma,
        testTenant.id,
        noVatChild.id,
        testFeeStructure.id,
        {
          startDate: new Date('2025-05-01'),
        },
      );

      // Generate invoice
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-05',
          child_ids: [noVatChild.id],
        });

      expect(response.status).toBe(201);

      // Get invoice
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ child_id: noVatChild.id, limit: 1 });

      const invoice = invoicesResponse.body.data[0];
      expect(invoice.vat).toBe(0);
      expect(invoice.total).toBe(invoice.subtotal);
    });

    it('should include VAT for VAT registered tenant', async () => {
      // Set tenant as VAT registered
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: { vatRegistered: true, vatNumber: 'VAT-TEST-456' },
      });

      // Create new enrollment for June
      const vatChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent1.id,
        {
          firstName: 'WithVAT',
          lastName: 'Child',
        },
      );

      await createTestEnrollment(
        prisma,
        testTenant.id,
        vatChild.id,
        testFeeStructure.id,
        {
          startDate: new Date('2025-06-01'),
        },
      );

      // Generate invoice
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-06',
          child_ids: [vatChild.id],
        });

      expect(response.status).toBe(201);

      // Get invoice
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ child_id: vatChild.id, limit: 1 });

      const invoice = invoicesResponse.body.data[0];
      expect(invoice.vat).toBeGreaterThan(0);

      // VAT should be 15% of subtotal
      const expectedVAT = calculateVAT(Math.round(invoice.subtotal * 100));
      const actualVAT = Math.round(invoice.vat * 100);
      expect(Math.abs(actualVAT - expectedVAT)).toBeLessThanOrEqual(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle child with no active enrollment', async () => {
      // Create child without enrollment
      const unenrolledChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent2.id,
        {
          firstName: 'Unenrolled',
          lastName: 'Child',
        },
      );

      // Try to generate invoice (should skip)
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-07',
          child_ids: [unenrolledChild.id],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.invoices_created).toBe(0);
      expect(response.body.data.errors.length).toBeGreaterThan(0);
    });

    it('should handle zero-amount invoices correctly', async () => {
      // Create fee structure with zero amount
      const zeroFee = await createTestFeeStructure(prisma, testTenant.id, {
        name: 'Free Care',
        amountCents: 0,
      });

      const freeChild = await createTestChild(
        prisma,
        testTenant.id,
        testParent2.id,
        {
          firstName: 'Free',
          lastName: 'Child',
        },
      );

      await createTestEnrollment(
        prisma,
        testTenant.id,
        freeChild.id,
        zeroFee.id,
        {
          startDate: new Date('2025-08-01'),
        },
      );

      // Generate invoice
      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          billing_month: '2025-08',
          child_ids: [freeChild.id],
        });

      expect(response.status).toBe(201);

      // Get invoice
      const invoicesResponse = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ child_id: freeChild.id, limit: 1 });

      const invoice = invoicesResponse.body.data[0];
      expect(invoice.subtotal).toBe(0);
      expect(invoice.vat).toBe(0);
      expect(invoice.total).toBe(0);
    });

    it('should validate invoice IDs in send request', async () => {
      // Try to send with invalid UUID
      const response = await request(app.getHttpServer())
        .post('/invoices/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_ids: ['not-a-uuid'],
          delivery_method: 'EMAIL',
        });

      expect(response.status).toBe(400);
    });

    it('should validate delivery method', async () => {
      const response = await request(app.getHttpServer())
        .post('/invoices/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_ids: generatedInvoiceIds.slice(0, 1),
          delivery_method: 'INVALID',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Pagination and Filtering', () => {
    it('should paginate invoice list', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 2 });

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBeLessThanOrEqual(2);
      expect(page1.body.meta.page).toBe(1);
      expect(page1.body.meta.limit).toBe(2);

      if (page1.body.meta.totalPages > 1) {
        const page2 = await request(app.getHttpServer())
          .get('/invoices')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 2, limit: 2 });

        expect(page2.status).toBe(200);
        expect(page2.body.meta.page).toBe(2);
      }
    });

    it('should filter invoices by parent', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ parent_id: testParent1.id, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);

      // All invoices should belong to testParent1
      for (const invoice of response.body.data) {
        expect(invoice.parent.id).toBe(testParent1.id);
      }
    });

    it('should filter invoices by date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          date_from: '2025-01-01',
          date_to: '2025-01-31',
          limit: 20,
        });

      expect(response.status).toBe(200);

      // All invoices should be in January 2025
      for (const invoice of response.body.data) {
        const issueDate = new Date(invoice.issue_date);
        expect(issueDate.getMonth()).toBe(0); // January = 0
        expect(issueDate.getFullYear()).toBe(2025);
      }
    });

    it('should filter invoices by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'DRAFT', limit: 20 });

      expect(response.status).toBe(200);

      // All invoices should be DRAFT
      for (const invoice of response.body.data) {
        expect(invoice.status).toBe('DRAFT');
      }
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app.getHttpServer()).get('/invoices');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/invoices')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should reject invoice generation for non-admin users', async () => {
      // Create a viewer user
      const viewerUser = await createTestUser(prisma, testTenant.id, {
        role: 'VIEWER',
      });
      const viewerToken = getAuthToken(viewerUser);

      const response = await request(app.getHttpServer())
        .post('/invoices/generate')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          billing_month: '2025-09',
        });

      expect(response.status).toBe(403);
    });

    it('should reject invoice sending for non-admin users', async () => {
      const viewerUser = await createTestUser(prisma, testTenant.id, {
        role: 'VIEWER',
      });
      const viewerToken = getAuthToken(viewerUser);

      const response = await request(app.getHttpServer())
        .post('/invoices/send')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          invoice_ids: generatedInvoiceIds.slice(0, 1),
          delivery_method: 'EMAIL',
        });

      expect(response.status).toBe(403);
    });
  });
});
