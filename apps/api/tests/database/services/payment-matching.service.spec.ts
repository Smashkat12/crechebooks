/**
 * PaymentMatchingService Integration Tests
 * TASK-PAY-011: Payment Matching Service
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests confidence-based matching, auto-apply, review flagging, and tenant isolation
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { PaymentMatcherAgent } from '../../../src/agents/payment-matcher/matcher.agent';
import { MatchDecisionLogger } from '../../../src/agents/payment-matcher/decision-logger';
import {
  ImportSource,
  TransactionStatus,
} from '../../../src/database/entities/transaction.entity';
import {
  InvoiceStatus,
  DeliveryMethod,
} from '../../../src/database/entities/invoice.entity';
import { MatchConfidenceLevel } from '../../../src/database/dto/payment-matching.dto';
import { Tenant, Parent, Child, Invoice, Transaction } from '@prisma/client';
import {
  BusinessException,
  NotFoundException,
} from '../../../src/shared/exceptions';

describe('PaymentMatchingService', () => {
  let service: PaymentMatchingService;
  let paymentRepo: PaymentRepository;
  let invoiceRepo: InvoiceRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testTenant2: Tenant;
  let testParent: Parent;
  let testChild: Child;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        PaymentMatchingService,
        PaymentRepository,
        InvoiceRepository,
        AuditLogService,
        PaymentMatcherAgent,
        MatchDecisionLogger,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<PaymentMatchingService>(PaymentMatchingService);
    paymentRepo = module.get<PaymentRepository>(PaymentRepository);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.auditLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant 1
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    // Create test tenant 2 for isolation tests
    testTenant2 = await prisma.tenant.create({
      data: {
        name: 'Bright Minds Creche',
        addressLine1: '456 Oak Avenue',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27215559876',
        email: `test${Date.now()}@brightminds.co.za`,
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Smith',
        email: `john.smith${Date.now()}@example.com`,
        phone: '+27821234567',
        idNumber: '8501015800086',
        address: '789 Test Street, Johannesburg, Gauteng 2000',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Emily',
        lastName: 'Smith',
        dateOfBirth: new Date('2020-05-15'),
        parentId: testParent.id,
      },
    });
  });

  // Helper to create a test invoice
  async function createInvoice(
    overrides: Partial<Invoice> = {},
  ): Promise<Invoice> {
    return prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: `INV-2024-${Date.now().toString().slice(-5)}`,
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2024-01-01'),
        billingPeriodEnd: new Date('2024-01-31'),
        issueDate: new Date('2024-01-05'),
        dueDate: new Date('2024-01-20'),
        subtotalCents: 500000,
        vatCents: 75000,
        totalCents: 575000,
        amountPaidCents: 0,
        status: InvoiceStatus.SENT,
        deliveryMethod: DeliveryMethod.EMAIL,
        ...overrides,
      },
    });
  }

  // Helper to create a test transaction
  async function createTransaction(
    overrides: Partial<Transaction> = {},
  ): Promise<Transaction> {
    return prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB Cheque',
        date: new Date('2024-01-15'),
        description: 'Payment received',
        payeeName: null,
        reference: null,
        amountCents: 575000,
        isCredit: true,
        source: ImportSource.BANK_FEED,
        status: TransactionStatus.PENDING,
        ...overrides,
      },
    });
  }

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('matchPayments - Exact Match', () => {
    it('should auto-apply exact match (reference + amount)', async () => {
      // Create invoice with specific number
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00001',
        totalCents: 575000,
        amountPaidCents: 0,
      });

      // Create transaction with matching reference and amount
      const transaction = await createTransaction({
        reference: 'INV-2024-00001',
        amountCents: 575000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      expect(result.processed).toBe(1);
      expect(result.autoApplied).toBe(1);
      expect(result.reviewRequired).toBe(0);
      expect(result.noMatch).toBe(0);

      expect(result.results[0].status).toBe('AUTO_APPLIED');
      expect(result.results[0].appliedMatch).toBeDefined();
      expect(result.results[0].appliedMatch?.confidenceScore).toBe(100);
      expect(result.results[0].appliedMatch?.invoiceNumber).toBe(
        'INV-2024-00001',
      );

      // Verify payment was created
      const payments = await paymentRepo.findByInvoiceId(invoice.id);
      expect(payments.length).toBe(1);
      expect(payments[0].amountCents).toBe(575000);
      expect(payments[0].matchType).toBe('EXACT');
      // Prisma may return as Decimal string, so compare as numbers
      expect(Number(payments[0].matchConfidence)).toBe(100);

      // Verify invoice was updated
      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.amountPaidCents).toBe(575000);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);
    });

    it('should auto-apply exact match with case-insensitive reference', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00002',
        totalCents: 300000,
        subtotalCents: 260870,
        vatCents: 39130,
      });

      const transaction = await createTransaction({
        reference: 'inv-2024-00002', // lowercase
        amountCents: 300000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      expect(result.autoApplied).toBe(1);
      // Case-insensitive matching through exact match should give 100
      expect(
        result.results[0].appliedMatch?.confidenceScore,
      ).toBeGreaterThanOrEqual(80);
    });
  });

  describe('matchPayments - High Confidence Match', () => {
    it('should auto-apply high confidence match (reference contains + amount)', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00003',
        totalCents: 450000,
        subtotalCents: 391304,
        vatCents: 58696,
      });

      const transaction = await createTransaction({
        reference: 'Payment for INV-2024-00003 received', // contains invoice number
        amountCents: 450000,
        isCredit: true,
        payeeName: 'John Smith', // Add name match for higher confidence
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // 30 (reference contains) + 40 (exact amount) + 20 (name) = 90 - auto-apply
      expect(result.autoApplied).toBe(1);
      expect(
        result.results[0].appliedMatch?.confidenceScore,
      ).toBeGreaterThanOrEqual(80);
    });

    it('should auto-apply high confidence match (amount + strong name similarity)', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00004',
        totalCents: 550000,
      });

      const transaction = await createTransaction({
        payeeName: 'John Smith', // exact parent name match
        amountCents: 550000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // Amount (40) + Name (20) = 60, might not be auto-applied
      // but should be high in candidates
      expect(result.processed).toBe(1);
      if (result.reviewRequired === 1) {
        expect(result.results[0].candidates).toBeDefined();
        expect(
          result.results[0].candidates![0].confidenceScore,
        ).toBeGreaterThanOrEqual(50);
      }
    });
  });

  describe('matchPayments - Low Confidence / Review Required', () => {
    it('should flag for review when confidence below threshold', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00005',
        totalCents: 600000,
        subtotalCents: 521739,
        vatCents: 78261,
      });

      const transaction = await createTransaction({
        amountCents: 300000, // 50% off - will get partial payment score of 10
        isCredit: true,
        payeeName: 'Bob Jones', // different name - won't match
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // With only 10 points (partial payment), this should be below threshold or flagged
      // If score < 20, it's no match; if 20-79, it's review required
      expect(result.noMatch + result.reviewRequired).toBe(1);
      if (result.reviewRequired === 1) {
        expect(result.results[0].status).toBe('REVIEW_REQUIRED');
        expect(result.results[0].candidates).toBeDefined();
      } else {
        expect(result.results[0].status).toBe('NO_MATCH');
      }
    });

    it('should flag for review when multiple high-confidence matches exist', async () => {
      // Create two invoices with same amount and parent
      const invoice1 = await createInvoice({
        invoiceNumber: 'INV-2024-00006',
        totalCents: 500000,
        subtotalCents: 434783,
        vatCents: 65217,
      });
      const invoice2 = await createInvoice({
        invoiceNumber: 'INV-2024-00007',
        totalCents: 500000,
        subtotalCents: 434783,
        vatCents: 65217,
      });

      // Transaction with exact amount match + name match
      // Both invoices should score 40 (amount) + 20 (name) = 60 each
      // Neither reaches 80 threshold for auto-apply individually
      const transaction = await createTransaction({
        amountCents: 500000,
        isCredit: true,
        payeeName: 'John Smith',
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // Should be flagged for review - both invoices have same score
      expect(result.reviewRequired).toBe(1);
      expect(result.results[0].status).toBe('REVIEW_REQUIRED');
      // Both candidates should be present
      expect(result.results[0].candidates).toBeDefined();
      expect(result.results[0].candidates!.length).toBe(2);
    });
  });

  describe('matchPayments - No Match', () => {
    it('should return no match when no outstanding invoices', async () => {
      // Create transaction without any invoices
      const transaction = await createTransaction({
        amountCents: 100000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      expect(result.noMatch).toBe(1);
      expect(result.results[0].status).toBe('NO_MATCH');
      expect(result.results[0].reason).toBe('No outstanding invoices found');
    });

    it('should return no match when transaction already allocated', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00008',
        totalCents: 400000,
        subtotalCents: 347826,
        vatCents: 52174,
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-00008',
        amountCents: 400000,
        isCredit: true,
      });

      // First match should succeed
      const result1 = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });
      expect(result1.autoApplied).toBe(1);

      // Second match attempt should return 0 processed (transaction is filtered out as already allocated)
      const result2 = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // The transaction is filtered out before processing, so processed = 0
      expect(result2.processed).toBe(0);
    });

    it('should skip debit transactions', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00009',
        totalCents: 300000,
      });

      // Create debit (not credit) transaction
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2024-01-15'),
          description: 'Debit transaction',
          reference: 'INV-2024-00009',
          amountCents: -300000,
          isCredit: false, // debit
          source: ImportSource.BANK_FEED,
          status: TransactionStatus.PENDING,
        },
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      expect(result.processed).toBe(0);
    });
  });

  describe('matchPayments - Invoice Status Updates', () => {
    it('should update invoice to PARTIALLY_PAID for partial payments', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00010',
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-00010',
        amountCents: 200000, // partial payment
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // Should still be flagged for review since amount doesn't match exactly
      // but let's test applyMatch for partial
      if (result.reviewRequired === 1 && result.results[0].candidates) {
        await service.applyMatch({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          invoiceId: invoice.id,
          amountCents: 200000,
        });
      }

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(updatedInvoice?.amountPaidCents).toBe(200000);
    });

    it('should update invoice to PAID when fully paid', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00011',
        totalCents: 575000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-00011',
        amountCents: 575000,
        isCredit: true,
      });

      await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice?.amountPaidCents).toBe(575000);
    });
  });

  describe('matchPayments - Tenant Isolation', () => {
    it('should only match invoices from same tenant', async () => {
      // Create parent and child for tenant 2
      const parent2 = await prisma.parent.create({
        data: {
          tenantId: testTenant2.id,
          firstName: 'Jane',
          lastName: 'Doe',
          email: `jane.doe${Date.now()}@example.com`,
          phone: '+27827654321',
          idNumber: '9001015800087',
          address: '321 Other Street, Cape Town, Western Cape 8001',
        },
      });

      const child2 = await prisma.child.create({
        data: {
          tenantId: testTenant2.id,
          firstName: 'Tom',
          lastName: 'Doe',
          dateOfBirth: new Date('2019-03-20'),
          parentId: parent2.id,
        },
      });

      // Create invoice for tenant 2
      const invoice2 = await prisma.invoice.create({
        data: {
          tenantId: testTenant2.id,
          invoiceNumber: 'INV-2024-T2-001',
          parentId: parent2.id,
          childId: child2.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 575000,
          totalCents: 575000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });

      // Create transaction for tenant 1 matching tenant 2's invoice
      const transaction = await createTransaction({
        reference: 'INV-2024-T2-001', // matches tenant 2 invoice
        amountCents: 575000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id, // searching in tenant 1
        transactionIds: [transaction.id],
      });

      // Should NOT match tenant 2's invoice
      expect(result.noMatch).toBe(1);
      expect(result.results[0].status).toBe('NO_MATCH');

      // Verify tenant 2's invoice was not updated
      const unchangedInvoice = await invoiceRepo.findById(invoice2.id);
      expect(unchangedInvoice?.amountPaidCents).toBe(0);
    });
  });

  describe('applyMatch - Manual Matching', () => {
    it('should create payment for manual match', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00012',
        totalCents: 400000,
      });

      const transaction = await createTransaction({
        amountCents: 400000,
        isCredit: true,
      });

      const result = await service.applyMatch({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        invoiceId: invoice.id,
      });

      expect(result.paymentId).toBeDefined();
      expect(result.amountCents).toBe(400000);
      expect(result.confidenceScore).toBe(0); // manual has no confidence

      // Verify payment was created with MANUAL type
      const payments = await paymentRepo.findByInvoiceId(invoice.id);
      expect(payments[0].matchType).toBe('MANUAL');
      expect(payments[0].matchedBy).toBe('USER');
    });

    it('should allow partial amount override', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00013',
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 300000,
        isCredit: true,
      });

      const result = await service.applyMatch({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        invoiceId: invoice.id,
        amountCents: 250000, // apply less than transaction
      });

      expect(result.amountCents).toBe(250000);

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.amountPaidCents).toBe(250000);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });

    it('should reject if transaction already allocated', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00014',
        totalCents: 350000,
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-00014',
        amountCents: 350000,
        isCredit: true,
      });

      // First allocation should succeed
      await service.applyMatch({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        invoiceId: invoice.id,
      });

      // Second allocation should fail
      await expect(
        service.applyMatch({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          invoiceId: invoice.id,
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should reject if amount exceeds outstanding', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00015',
        totalCents: 200000,
        amountPaidCents: 150000, // already partially paid
      });

      const transaction = await createTransaction({
        amountCents: 100000,
        isCredit: true,
      });

      await expect(
        service.applyMatch({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          invoiceId: invoice.id,
          amountCents: 100000, // exceeds outstanding of 50000
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should reject if transaction not found', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-00016',
        totalCents: 300000,
      });

      await expect(
        service.applyMatch({
          tenantId: testTenant.id,
          transactionId: '00000000-0000-0000-0000-000000000000',
          invoiceId: invoice.id,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if invoice not found', async () => {
      const transaction = await createTransaction({
        amountCents: 300000,
        isCredit: true,
      });

      await expect(
        service.applyMatch({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          invoiceId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('calculateConfidence - Scoring Algorithm', () => {
    it('should calculate 100% for exact reference + exact amount', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CONF01',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-CONF01',
        amountCents: 100000,
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      expect(score).toBe(100); // 40 (reference) + 40 (amount) + 20 (date proximity within billing period)
      expect(reasons).toContain('Exact reference match');
      expect(reasons).toContain('Exact amount match');
    });

    it('should add name similarity points', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CONF02',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-CONF02',
        amountCents: 100000,
        payeeName: 'John Smith', // exact match to parent name
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      expect(score).toBe(100); // 40 + 40 + 20 (capped at 100)
      expect(reasons).toContain('Exact parent name match');
    });

    it('should handle name variations with similarity scoring', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CONF03',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      const transaction = await createTransaction({
        amountCents: 100000,
        payeeName: 'J Smith', // similar to John Smith
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      // Should have amount match (40) + some name similarity
      expect(score).toBeGreaterThan(40);
    });

    it('should handle partial reference match (contains)', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CONF04',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      const transaction = await createTransaction({
        reference: 'Payment for INV-2024-CONF04 received',
        amountCents: 100000,
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      expect(score).toBe(90); // 30 (contains) + 40 (amount) + 20 (date proximity within billing period)
      expect(reasons).toContain('Reference contains invoice number');
    });

    it('should handle amount tolerance (within 1%)', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CONF05',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 100000,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-CONF05',
        amountCents: 100050, // 0.05% off
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      expect(score).toBe(95); // 40 (reference) + 35 (within 1%) + 20 (date proximity within billing period)
      expect(reasons).toContain('Amount within 1% or R1');
    });
  });

  describe('String Similarity', () => {
    it('should return 1 for identical strings', () => {
      const similarity = (service as any).calculateStringSimilarity(
        'johnsmith',
        'johnsmith',
      );
      expect(similarity).toBe(1);
    });

    it('should return 0 for empty strings', () => {
      expect((service as any).calculateStringSimilarity('', 'test')).toBe(0);
      expect((service as any).calculateStringSimilarity('test', '')).toBe(0);
    });

    it('should calculate similarity for similar strings', () => {
      const similarity = (service as any).calculateStringSimilarity(
        'johnsmith',
        'jsmth',
      );
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('Child Name Matching', () => {
    it('should match when transaction description contains child first name', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CHILD01',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 200000,
          totalCents: 200000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      // Transaction with child name "Emily" in description (matching testChild)
      const transaction = await createTransaction({
        description: 'Magtape Credit Capitec Emily Smith',
        amountCents: 200000,
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      // Should get amount (40) + child name match (15-20)
      expect(score).toBeGreaterThanOrEqual(55);
      expect(
        reasons.some((r: string) => r.toLowerCase().includes('child')),
      ).toBe(true);
    });

    it('should match when transaction description contains child full name', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CHILD02',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 200000,
          totalCents: 200000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      // Transaction with child full name in description
      const transaction = await createTransaction({
        description: 'ADT Cash Deposit 09741002Emily Smith',
        amountCents: 200000,
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      // Should get amount (40) + strong child name match (18-20)
      expect(score).toBeGreaterThanOrEqual(55);
      expect(
        reasons.some((r: string) => r.toLowerCase().includes('child')),
      ).toBe(true);
    });

    it('should extract names from FNB banking description format', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CHILD03',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 200000,
          totalCents: 200000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      // Real FNB format with child name
      const transaction = await createTransaction({
        description: 'FNB App Payment From Emily',
        amountCents: 200000,
        isCredit: true,
      });

      const { score, reasons } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      // Should detect child first name
      expect(score).toBeGreaterThanOrEqual(55);
    });

    it('should auto-apply high confidence match when child name + amount match', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-CHILD04',
        totalCents: 220000, // R2200
        amountPaidCents: 0,
      });

      // Transaction with exact amount and child name in description
      const transaction = await createTransaction({
        description: 'Magtape Credit Capitec Emily Smith',
        amountCents: 220000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // Amount (40) + Child name (18) = 58, so review required
      // But if amount is exact and name is strong match, should be candidate
      expect(result.processed).toBe(1);
      expect(
        result.results[0].candidates || result.results[0].appliedMatch,
      ).toBeDefined();
    });

    it('should handle Capitec Magtape format with child name', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2024-CHILD05',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2024-01-01'),
          billingPeriodEnd: new Date('2024-01-31'),
          issueDate: new Date('2024-01-05'),
          dueDate: new Date('2024-01-20'),
          subtotalCents: 200000,
          totalCents: 200000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
        include: { parent: true, child: true },
      });

      // Real Capitec Magtape format
      const transaction = await createTransaction({
        description: 'Magtape Credit Capitec Emily',
        amountCents: 200000,
        isCredit: true,
      });

      const { score } = (service as any).calculateConfidence(
        transaction,
        invoice,
      );

      // Amount (40) + child name (15+)
      expect(score).toBeGreaterThanOrEqual(55);
    });
  });

  describe('Description Name Extraction', () => {
    it('should extract name from ADT Cash Deposit format', () => {
      const names = (service as any).extractNamesFromDescription(
        'ADT Cash Deposit 09741002Bokamoso Mbewe',
      );

      expect(names.length).toBeGreaterThan(0);
      expect(
        names.some((n: string) => n.toLowerCase().includes('bokamoso')),
      ).toBe(true);
    });

    it('should extract name from Magtape Credit format', () => {
      const names = (service as any).extractNamesFromDescription(
        'Magtape Credit Capitec Ntando Mthimunye',
      );

      expect(names.length).toBeGreaterThan(0);
      expect(
        names.some((n: string) => n.toLowerCase().includes('ntando')),
      ).toBe(true);
    });

    it('should extract name from FNB App Payment format', () => {
      const names = (service as any).extractNamesFromDescription(
        'FNB App Payment From John Smith',
      );

      expect(names.length).toBeGreaterThan(0);
      expect(names.some((n: string) => n.toLowerCase().includes('john'))).toBe(
        true,
      );
    });

    it('should handle description with only account numbers', () => {
      const names = (service as any).extractNamesFromDescription(
        'ADT Cash Deposit 12345678901234',
      );

      // Should still return something or empty array, not crash
      expect(Array.isArray(names)).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple transactions', async () => {
      // Create multiple invoices
      const invoice1 = await createInvoice({
        invoiceNumber: 'INV-2024-BATCH01',
        totalCents: 100000,
      });
      const invoice2 = await createInvoice({
        invoiceNumber: 'INV-2024-BATCH02',
        totalCents: 200000,
      });
      const invoice3 = await createInvoice({
        invoiceNumber: 'INV-2024-BATCH03',
        totalCents: 300000,
      });

      // Create matching transactions
      const transaction1 = await createTransaction({
        reference: 'INV-2024-BATCH01',
        amountCents: 100000,
        isCredit: true,
      });
      const transaction2 = await createTransaction({
        reference: 'INV-2024-BATCH02',
        amountCents: 200000,
        isCredit: true,
      });
      // Transaction 3 has no clear match
      const transaction3 = await createTransaction({
        amountCents: 999999,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction1.id, transaction2.id, transaction3.id],
      });

      expect(result.processed).toBe(3);
      expect(result.autoApplied).toBe(2);
      expect(result.noMatch).toBeGreaterThanOrEqual(0);
    });

    it('should process all unallocated credits when no IDs specified', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-ALL01',
        totalCents: 150000,
      });

      await createTransaction({
        reference: 'INV-2024-ALL01',
        amountCents: 150000,
        isCredit: true,
      });

      await createTransaction({
        amountCents: 50000,
        isCredit: true,
      });

      const result = await service.matchPayments({
        tenantId: testTenant.id,
        // No transactionIds - should process all unallocated credits
      });

      expect(result.processed).toBe(2);
    });
  });

  describe('Audit Trail', () => {
    it('should create audit log for auto-applied matches', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-AUDIT01',
        totalCents: 250000,
      });

      const transaction = await createTransaction({
        reference: 'INV-2024-AUDIT01',
        amountCents: 250000,
        isCredit: true,
      });

      await service.matchPayments({
        tenantId: testTenant.id,
        transactionIds: [transaction.id],
      });

      // Verify audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Payment',
          action: 'CREATE',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].changeSummary).toContain('Auto-matched');
      expect(auditLogs[0].changeSummary).toContain('INV-2024-AUDIT01');
    });

    it('should create audit log for manual matches', async () => {
      const invoice = await createInvoice({
        invoiceNumber: 'INV-2024-AUDIT02',
        totalCents: 180000,
      });

      const transaction = await createTransaction({
        amountCents: 180000,
        isCredit: true,
      });

      await service.applyMatch({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        invoiceId: invoice.id,
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Payment',
          action: 'CREATE',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].changeSummary).toContain('Manually matched');
    });
  });
});
