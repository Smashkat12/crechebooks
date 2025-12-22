/**
 * E2E Payment Matching Flow Tests
 * TASK-INT-003: Complete integration test for payment matching and allocation
 *
 * CRITICAL: Uses real database and real services - NO MOCKS
 * Tests the full payment lifecycle:
 * - AI-powered payment matching (80%+ auto-apply threshold)
 * - Manual payment allocation (single and split payments)
 * - Arrears reporting with aging buckets
 * - Edge cases and error handling
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
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

interface TestInvoice {
  id: string;
  invoiceNumber: string;
  parentId: string;
  childId: string;
  totalCents: number;
  status: string;
  dueDate: Date;
}

interface TestTransaction {
  id: string;
  amountCents: number;
  reference: string | null;
  payeeName: string | null;
  isCredit: boolean;
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
      phone: '+27 11 123 4567',
      whatsapp: '+27 11 123 4567',
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
      dateOfBirth: new Date('2020-01-01'),
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
 * Helper: Create a test invoice with SENT status
 */
async function createTestInvoice(
  prisma: PrismaService,
  tenantId: string,
  parentId: string,
  childId: string,
  opts: {
    totalCents?: number;
    status?: string;
    invoiceNumber?: string;
    dueDate?: Date;
    amountPaidCents?: number;
    billingPeriodStart?: Date;
    billingPeriodEnd?: Date;
  } = {},
): Promise<TestInvoice> {
  // Use crypto.randomUUID for truly unique IDs in rapid test execution
  const uniqueId = crypto.randomUUID().replace(/-/g, '').substring(0, 12);

  const totalCents = opts.totalCents || 345000; // Default R3,450.00
  const subtotalCents = Math.round(totalCents / 1.15); // Subtract 15% VAT
  const vatCents = totalCents - subtotalCents;

  // Default billing period is January 2025
  const billingPeriodStart = opts.billingPeriodStart || new Date('2025-01-01');
  const billingPeriodEnd = opts.billingPeriodEnd || new Date('2025-01-31');

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      parentId,
      childId,
      invoiceNumber:
        opts.invoiceNumber ||
        `INV-2025-${uniqueId.substring(0, 6).toUpperCase()}`,
      issueDate: new Date('2025-01-01'),
      dueDate: opts.dueDate || new Date('2025-01-15'),
      billingPeriodStart,
      billingPeriodEnd,
      subtotalCents,
      vatCents,
      totalCents,
      amountPaidCents: opts.amountPaidCents || 0,
      status: opts.status || 'SENT',
      deliveryStatus: 'SENT',
    },
  });

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    parentId: invoice.parentId,
    childId: invoice.childId,
    totalCents: invoice.totalCents,
    status: invoice.status,
    dueDate: invoice.dueDate,
  };
}

/**
 * Helper: Create a test credit transaction (incoming payment)
 */
async function createTestCreditTransaction(
  prisma: PrismaService,
  tenantId: string,
  opts: {
    amountCents?: number;
    reference?: string;
    payeeName?: string;
    date?: Date;
  } = {},
): Promise<TestTransaction> {
  const transaction = await prisma.transaction.create({
    data: {
      tenantId,
      bankAccount: 'TEST-BANK-001',
      date: opts.date || new Date('2025-01-20'),
      description: 'Test credit payment',
      payeeName: opts.payeeName || null,
      reference: opts.reference || null,
      amountCents: opts.amountCents || 345000, // Default R3,450.00
      isCredit: true,
      source: 'MANUAL',
      status: 'PENDING',
      isReconciled: false,
    },
  });

  return {
    id: transaction.id,
    amountCents: transaction.amountCents,
    reference: transaction.reference,
    payeeName: transaction.payeeName,
    isCredit: transaction.isCredit,
  };
}

/**
 * Helper: Cleanup payment test data
 */
async function cleanupPaymentTestData(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  // Delete in order respecting foreign keys
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.transaction.deleteMany({ where: { tenantId } });
  await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.child.deleteMany({ where: { tenantId } });
  await prisma.parent.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
}

describe('E2E: Payment Matching Flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let testTenant: TestTenant;
  let testUser: TestUser;

  // Test data holders
  let testParent1: TestParent;
  let testParent2: TestParent;
  let testChild1: TestChild;
  let testChild2: TestChild;
  let testChild3: TestChild;

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

    // Create test parents and children
    testParent1 = await createTestParent(prisma, testTenant.id, {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@test.crechebooks.co.za',
    });

    testParent2 = await createTestParent(prisma, testTenant.id, {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@test.crechebooks.co.za',
    });

    testChild1 = await createTestChild(prisma, testTenant.id, testParent1.id, {
      firstName: 'Alice',
      lastName: 'Smith',
    });

    testChild2 = await createTestChild(prisma, testTenant.id, testParent1.id, {
      firstName: 'Bob',
      lastName: 'Smith',
    });

    testChild3 = await createTestChild(prisma, testTenant.id, testParent2.id, {
      firstName: 'Charlie',
      lastName: 'Doe',
    });
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // Cleanup in reverse order of creation
    if (testTenant?.id) {
      await cleanupPaymentTestData(prisma, testTenant.id);
    }
    await app?.close();
  }, 30000);

  describe('AI Payment Matching', () => {
    it('should auto-apply exact reference matches at 100% confidence', async () => {
      // Create invoice with known invoice number
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          invoiceNumber: 'INV-2025-0001',
          totalCents: 345000, // R3,450.00
        },
      );

      // Create transaction with exact reference match
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 345000,
          reference: 'INV-2025-0001',
          payeeName: 'SMITH J',
        },
      );

      // Trigger AI matching
      const response = await request(app.getHttpServer())
        .post('/payments/match')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.auto_applied).toBe(1);
      expect(response.body.data.summary.requires_review).toBe(0);
      expect(response.body.data.auto_matched.length).toBe(1);

      const match = response.body.data.auto_matched[0];
      expect(match.invoice_id).toBe(invoice.id);
      expect(match.transaction_id).toBe(transaction.id);
      expect(match.confidence_level).toBe('EXACT');
      expect(match.confidence_score).toBe(100);

      // Verify invoice updated
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      expect(updatedInvoice?.amountPaidCents).toBe(345000);
      expect(updatedInvoice?.status).toBe('PAID');
    });

    it('should auto-apply parent name + amount match at 90% confidence', async () => {
      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 250000, // R2,500.00
        },
      );

      // Create transaction with matching parent name and exact amount
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 250000,
          reference: 'PAYMENT',
          payeeName: 'SMITH JOHN', // Matches parent name
        },
      );

      // Trigger AI matching
      const response = await request(app.getHttpServer())
        .post('/payments/match')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_ids: [transaction.id],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.summary.auto_applied).toBe(1);

      const match = response.body.data.auto_matched[0];
      expect(match.invoice_id).toBe(invoice.id);
      expect(match.confidence_score).toBeGreaterThanOrEqual(80);
      expect(match.confidence_level).toMatch(/HIGH|EXACT/);
    });

    it('should flag low confidence matches for review (< 80%)', async () => {
      // Create invoice
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent2.id,
        testChild3.id,
        {
          totalCents: 400000, // R4,000.00
        },
      );

      // Create transaction with only partial amount match (no name or reference)
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 380000, // R3,800 - within 5% of R4,000
          reference: 'RANDOM-REF',
          payeeName: 'UNKNOWN PAYER',
        },
      );

      // Trigger AI matching
      const response = await request(app.getHttpServer())
        .post('/payments/match')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_ids: [transaction.id],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.summary.requires_review).toBeGreaterThan(0);
      expect(response.body.data.review_required.length).toBeGreaterThan(0);

      const review = response.body.data.review_required[0];
      expect(review.transaction_id).toBe(transaction.id);
      expect(review.suggested_matches.length).toBeGreaterThan(0);
    });

    it('should handle multiple outstanding invoices for same parent', async () => {
      // Create 3 outstanding invoices for same parent
      const invoice1 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 300000, // R3,000
        },
      );

      const invoice2 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 300000, // R3,000
        },
      );

      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild2.id,
        {
          totalCents: 200000, // R2,000
        },
      );

      // Create payment that could match multiple invoices
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 300000, // Matches invoice1 and invoice2 exactly
          reference: 'BULK PAYMENT',
          payeeName: 'SMITH JOHN',
        },
      );

      // Trigger AI matching
      const response = await request(app.getHttpServer())
        .post('/payments/match')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_ids: [transaction.id],
        });

      expect(response.status).toBe(200);

      // Should either auto-match one or require review due to ambiguity
      if (response.body.data.summary.auto_applied === 1) {
        // Auto-matched to one invoice
        const match = response.body.data.auto_matched[0];
        expect([invoice1.id, invoice2.id]).toContain(match.invoice_id);
      } else {
        // Flagged for review with multiple suggestions
        expect(response.body.data.summary.requires_review).toBe(1);
        const review = response.body.data.review_required[0];
        expect(review.suggested_matches.length).toBeGreaterThan(1);
      }
    });

    it('should return no_match when transaction cannot be matched', async () => {
      // Create transaction with no matching invoice
      // Use a date far from any billing periods to avoid date proximity matching
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 999999, // R9,999.99 - unusual amount
          reference: 'UNMATCHABLE-REF-XYZ',
          payeeName: 'COMPLETELY UNKNOWN PERSON',
          date: new Date('2024-06-15'), // Far from Jan 2025 billing periods
        },
      );

      // Trigger AI matching
      const response = await request(app.getHttpServer())
        .post('/payments/match')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_ids: [transaction.id],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.summary.no_match).toBeGreaterThan(0);
    });
  });

  describe('Manual Payment Allocation', () => {
    it('should allocate full payment to single invoice (status -> PAID)', async () => {
      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 500000, // R5,000
          status: 'SENT',
        },
      );

      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 500000,
        },
      );

      // Manually allocate full payment
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [
            {
              invoice_id: invoice.id,
              amount: 5000.0, // R5,000 in decimal format
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payments.length).toBe(1);
      expect(response.body.data.unallocated_amount).toBe(0);
      expect(response.body.data.invoices_updated).toContain(invoice.id);

      // Verify invoice status updated to PAID
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      expect(updatedInvoice?.status).toBe('PAID');
      expect(updatedInvoice?.amountPaidCents).toBe(500000);
    });

    it('should allocate partial payment to single invoice (status -> PARTIALLY_PAID)', async () => {
      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 600000, // R6,000
          status: 'SENT',
        },
      );

      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 300000, // R3,000 - partial payment
        },
      );

      // Manually allocate partial payment
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [
            {
              invoice_id: invoice.id,
              amount: 3000.0, // R3,000 in decimal format
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.unallocated_amount).toBe(0);

      // Verify invoice status updated to PARTIALLY_PAID
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      expect(updatedInvoice?.status).toBe('PARTIALLY_PAID');
      expect(updatedInvoice?.amountPaidCents).toBe(300000);
    });

    it('should split payment across multiple invoices', async () => {
      // Create 3 invoices
      const invoice1 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 300000, // R3,000
        },
      );

      const invoice2 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 250000, // R2,500
        },
      );

      const splitInvoice3 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild2.id,
        {
          totalCents: 200000, // R2,000
        },
      );

      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 750000, // R7,500 total
        },
      );

      // Split payment across all 3 invoices
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [
            { invoice_id: invoice1.id, amount: 3000.0 }, // R3,000
            { invoice_id: invoice2.id, amount: 2500.0 }, // R2,500
            { invoice_id: splitInvoice3.id, amount: 2000.0 }, // R2,000
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.payments.length).toBe(3);
      expect(response.body.data.invoices_updated.length).toBe(3);
      expect(response.body.data.unallocated_amount).toBe(0);

      // Verify all invoices updated
      const updated1 = await prisma.invoice.findUnique({
        where: { id: invoice1.id },
      });
      const updated2 = await prisma.invoice.findUnique({
        where: { id: invoice2.id },
      });
      const updated3 = await prisma.invoice.findUnique({
        where: { id: splitInvoice3.id },
      });

      expect(updated1?.status).toBe('PAID');
      expect(updated2?.status).toBe('PAID');
      expect(updated3?.status).toBe('PAID');
    });

    it('should return unallocated amount when payment exceeds invoice', async () => {
      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 300000, // R3,000
        },
      );

      // Create transaction (overpayment)
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 500000, // R5,000
        },
      );

      // Allocate only invoice amount
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [
            { invoice_id: invoice.id, amount: 3000.0 }, // R3,000
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.unallocated_amount).toBe(2000.0); // R2,000 remaining

      // Verify invoice paid in full
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });
      expect(updatedInvoice?.status).toBe('PAID');
      expect(updatedInvoice?.amountPaidCents).toBe(300000);
    });

    it('should reject allocation exceeding transaction amount (400 error)', async () => {
      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 800000, // R8,000
        },
      );

      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 500000, // R5,000
        },
      );

      // Try to allocate more than transaction amount
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [
            { invoice_id: invoice.id, amount: 8000.0 }, // R8,000 > R5,000
          ],
        });

      // BusinessException returns 422 (Unprocessable Entity) for business rule violations
      expect(response.status).toBe(422);
    });
  });

  describe('Arrears Reporting', () => {
    it('should calculate aging buckets correctly', async () => {
      const now = new Date();

      // Create invoices with different aging
      // Current (0-7 days overdue)
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 100000, // R1,000
          dueDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          status: 'SENT',
        },
      );

      // 30 days bucket (8-30 days overdue)
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 200000, // R2,000
          dueDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
          status: 'SENT',
        },
      );

      // 60 days bucket (31-60 days overdue)
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild2.id,
        {
          totalCents: 300000, // R3,000
          dueDate: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
          status: 'SENT',
        },
      );

      // 90+ days bucket (61+ days overdue)
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent2.id,
        testChild3.id,
        {
          totalCents: 400000, // R4,000
          dueDate: new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000), // 95 days ago
          status: 'SENT',
        },
      );

      // Get arrears report
      const response = await request(app.getHttpServer())
        .get('/payments/arrears')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const summary = response.body.data.summary;
      expect(summary.total_outstanding).toBeGreaterThan(0);
      expect(summary.total_invoices).toBeGreaterThanOrEqual(4);

      // Verify aging buckets are populated
      expect(summary.aging.current).toBeGreaterThan(0);
      expect(summary.aging.days_30).toBeGreaterThan(0);
      expect(summary.aging.days_60).toBeGreaterThan(0);
      expect(summary.aging.days_90_plus).toBeGreaterThan(0);
    });

    it('should rank top debtors by outstanding amount', async () => {
      // Create multiple invoices for different parents
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 500000, // R5,000
          status: 'SENT',
        },
      );

      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent2.id,
        testChild3.id,
        {
          totalCents: 300000, // R3,000
          status: 'SENT',
        },
      );

      // Get arrears report
      const response = await request(app.getHttpServer())
        .get('/payments/arrears')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      const topDebtors = response.body.data.top_debtors;
      expect(topDebtors.length).toBeGreaterThan(0);

      // Verify sorted by total_outstanding descending
      for (let i = 0; i < topDebtors.length - 1; i++) {
        expect(topDebtors[i].total_outstanding).toBeGreaterThanOrEqual(
          topDebtors[i + 1].total_outstanding,
        );
      }

      // Verify debtor details are present
      expect(topDebtors[0]).toHaveProperty('parent_id');
      expect(topDebtors[0]).toHaveProperty('parent_name');
      expect(topDebtors[0]).toHaveProperty('email');
      expect(topDebtors[0]).toHaveProperty('total_outstanding');
      expect(topDebtors[0]).toHaveProperty('invoice_count');
    });

    it('should filter by parent_id', async () => {
      // Get arrears for specific parent
      const response = await request(app.getHttpServer())
        .get('/payments/arrears')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ parent_id: testParent1.id });

      expect(response.status).toBe(200);

      const invoices = response.body.data.invoices;

      // All returned invoices should belong to testParent1
      for (const invoice of invoices) {
        expect(invoice.parent_id).toBe(testParent1.id);
      }
    });

    it('should filter by min_amount', async () => {
      // Create invoices with various amounts
      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 50000, // R500
          status: 'SENT',
        },
      );

      await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 150000, // R1,500
          status: 'SENT',
        },
      );

      // Get arrears with minimum R1,000
      const response = await request(app.getHttpServer())
        .get('/payments/arrears')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ min_amount: 1000.0 });

      expect(response.status).toBe(200);

      const invoices = response.body.data.invoices;

      // All returned invoices should have outstanding >= R1,000
      for (const invoice of invoices) {
        expect(invoice.outstanding).toBeGreaterThanOrEqual(1000.0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should reject allocation to already-paid invoice', async () => {
      // Create invoice and mark as paid
      const paidInvoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 300000,
          status: 'PAID',
          amountPaidCents: 300000,
        },
      );

      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 300000,
        },
      );

      // Try to allocate to already-paid invoice
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [{ invoice_id: paidInvoice.id, amount: 3000.0 }],
        });

      // Should fail because invoice is already paid (returns 422 for business rule violation)
      expect(response.status).toBe(422);
    });

    it('should reject double allocation of same transaction', async () => {
      // Create invoice
      const invoice1 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 200000,
        },
      );

      const invoice2 = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 200000,
        },
      );

      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 200000,
        },
      );

      // First allocation - should succeed
      const response1 = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [{ invoice_id: invoice1.id, amount: 2000.0 }],
        });

      expect(response1.status).toBe(201);

      // Second allocation of same transaction - should fail because transaction already allocated
      const response2 = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [{ invoice_id: invoice2.id, amount: 2000.0 }],
        });

      // BusinessException returns 422 for business rule violations
      expect(response2.status).toBe(422);
    });

    it('should handle zero-amount transactions', async () => {
      // Create zero-amount transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 0,
        },
      );

      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 100000,
        },
      );

      // Try to allocate zero amount
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [{ invoice_id: invoice.id, amount: 0.0 }],
        });

      // Should fail validation
      expect(response.status).toBe(400);
    });

    it('should validate transaction is a credit', async () => {
      // Create debit transaction (not a credit)
      const debitTransaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'TEST-BANK-001',
          date: new Date(),
          description: 'Test debit',
          amountCents: -100000, // Negative = debit
          isCredit: false,
          source: 'MANUAL',
          status: 'PENDING',
          isReconciled: false,
        },
      });

      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 100000,
        },
      );

      // Try to allocate debit to invoice
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: debitTransaction.id,
          allocations: [{ invoice_id: invoice.id, amount: 1000.0 }],
        });

      // Should fail because transaction is not a credit (returns 422 for business rule violation)
      expect(response.status).toBe(422);
    });

    it('should handle invalid invoice ID in allocation', async () => {
      // Create transaction
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        {
          amountCents: 100000,
        },
      );

      // Try to allocate to non-existent invoice
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [
            {
              invoice_id: '00000000-0000-0000-0000-000000000000',
              amount: 1000.0,
            },
          ],
        });

      expect(response.status).toBe(404);
    });

    it('should handle invalid transaction ID', async () => {
      // Create invoice
      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        {
          totalCents: 100000,
        },
      );

      // Try to allocate with non-existent transaction
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transaction_id: '00000000-0000-0000-0000-000000000000',
          allocations: [{ invoice_id: invoice.id, amount: 1000.0 }],
        });

      expect(response.status).toBe(404);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app.getHttpServer()).get(
        '/payments/arrears',
      );

      expect(response.status).toBe(401);
    });

    it('should reject payment allocation for non-admin users', async () => {
      // Create viewer user
      const viewerUser = await createTestUser(prisma, testTenant.id, {
        role: 'VIEWER',
      });
      const viewerToken = getAuthToken(viewerUser);

      // Create transaction and invoice
      const transaction = await createTestCreditTransaction(
        prisma,
        testTenant.id,
        { amountCents: 100000 },
      );

      const invoice = await createTestInvoice(
        prisma,
        testTenant.id,
        testParent1.id,
        testChild1.id,
        { totalCents: 100000 },
      );

      // Try to allocate payment as viewer
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          transaction_id: transaction.id,
          allocations: [{ invoice_id: invoice.id, amount: 1000.0 }],
        });

      expect(response.status).toBe(403);
    });

    it('should allow payment matching for admin users', async () => {
      // Admin should be able to trigger matching
      const response = await request(app.getHttpServer())
        .post('/payments/match')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(200);
    });

    it('should allow arrears viewing for accountant users', async () => {
      // Create accountant user
      const accountantUser = await createTestUser(prisma, testTenant.id, {
        role: 'ACCOUNTANT',
      });
      const accountantToken = getAuthToken(accountantUser);

      // Accountant should be able to view arrears
      const response = await request(app.getHttpServer())
        .get('/payments/arrears')
        .set('Authorization', `Bearer ${accountantToken}`);

      expect(response.status).toBe(200);
    });
  });
});
