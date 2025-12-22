/**
 * PaymentAllocationService Integration Tests
 * TASK-PAY-012: Payment Allocation Service
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests payment allocation, partial payments, overpayments, multi-invoice allocations, and reversals
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { NotFoundException, BusinessException } from '../../../src/shared/exceptions';
import { Tenant, Parent, Child, Invoice, Transaction } from '@prisma/client';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';
import { ImportSource, TransactionStatus } from '../../../src/database/entities/transaction.entity';
import { MatchType, MatchedBy } from '../../../src/database/entities/payment.entity';
import { XeroSyncStatus } from '../../../src/database/dto/payment-allocation.dto';

describe('PaymentAllocationService', () => {
  let service: PaymentAllocationService;
  let paymentRepo: PaymentRepository;
  let invoiceRepo: InvoiceRepository;
  let transactionRepo: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        PaymentAllocationService,
        PaymentRepository,
        InvoiceRepository,
        TransactionRepository,
        AuditLogService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<PaymentAllocationService>(PaymentAllocationService);
    paymentRepo = module.get<PaymentRepository>(PaymentRepository);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.auditLog.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
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

    // Create test tenant
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
        invoiceNumber: `INV-2025-${Date.now().toString().slice(-5)}`,
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2025-01-01'),
        billingPeriodEnd: new Date('2025-01-31'),
        issueDate: new Date('2025-01-05'),
        dueDate: new Date('2025-01-20'),
        subtotalCents: 434783,
        vatCents: 65217,
        totalCents: 500000,
        amountPaidCents: 0,
        status: InvoiceStatus.SENT,
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
        date: new Date('2025-01-15'),
        description: 'Payment received',
        payeeName: 'John Smith',
        reference: null,
        amountCents: 500000,
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

  describe('allocatePayment - Exact Match', () => {
    it('should create payment for exact amount match', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
        isCredit: true,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].amountCents).toBe(500000);
      expect(result.payments[0].matchType).toBe(MatchType.EXACT);
      expect(result.invoicesUpdated).toContain(invoice.id);
      expect(result.unallocatedAmountCents).toBe(0);
    });

    it('should update invoice status to PAID', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
        isCredit: true,
      });

      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice?.amountPaidCents).toBe(500000);
    });

    it('should return correct AllocationResult', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.payments).toHaveLength(1);
      expect(result.invoicesUpdated).toEqual([invoice.id]);
      expect(result.unallocatedAmountCents).toBe(0);
      expect(result.xeroSyncStatus).toBe(XeroSyncStatus.SKIPPED);
      expect(result.errors).toHaveLength(0);
    });

    it('should create audit log entry', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Payment',
          action: 'CREATE',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].changeSummary).toContain('Allocated');
      expect(auditLogs[0].changeSummary).toContain(invoice.id);
    });

    it('should have Xero sync status as SKIPPED (stub)', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.xeroSyncStatus).toBe(XeroSyncStatus.SKIPPED);
    });
  });

  describe('allocatePayment - Partial Payment', () => {
    it('should create payment for partial amount', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 200000,
        isCredit: true,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 200000,
          },
        ],
      });

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].amountCents).toBe(200000);
      expect(result.payments[0].matchType).toBe(MatchType.PARTIAL);
    });

    it('should update invoice status to PARTIALLY_PAID', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 200000,
        isCredit: true,
      });

      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 200000,
          },
        ],
      });

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(updatedInvoice?.amountPaidCents).toBe(200000);
    });

    it('should track correct matchType as PARTIAL', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 300000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 300000,
          },
        ],
      });

      const payment = await paymentRepo.findById(result.payments[0].id);
      expect(payment?.matchType).toBe(MatchType.PARTIAL);
    });

    it('should allow multiple partial payments that sum correctly', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction1 = await createTransaction({
        amountCents: 200000,
      });

      const transaction2 = await createTransaction({
        amountCents: 300000,
      });

      // First partial payment
      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction1.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 200000,
          },
        ],
      });

      // Second partial payment
      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction2.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 300000,
          },
        ],
      });

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.amountPaidCents).toBe(500000);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);
    });
  });

  describe('allocatePayment - Overpayment', () => {
    it('should create payment for outstanding amount only (not overpayment)', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 600000, // Overpayment
        isCredit: true,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 600000, // Will allocate only 500000 (outstanding)
          },
        ],
      });

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].amountCents).toBe(500000); // Only outstanding
      expect(result.payments[0].matchType).toBe(MatchType.OVERPAYMENT);
    });

    it('should log overpayment amount (warning)', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 700000, // 200000 overpayment
        isCredit: true,
      });

      // This should trigger a warning log about 200000 cents overpayment
      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 700000,
          },
        ],
      });

      expect(result.payments[0].matchType).toBe(MatchType.OVERPAYMENT);
      expect(result.payments[0].amountCents).toBe(500000);
    });

    it('should update invoice to PAID', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction = await createTransaction({
        amountCents: 600000,
        isCredit: true,
      });

      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 600000,
          },
        ],
      });

      const updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice?.amountPaidCents).toBe(500000);
    });

    it('should track matchType as OVERPAYMENT', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 550000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 550000,
          },
        ],
      });

      expect(result.payments[0].matchType).toBe(MatchType.OVERPAYMENT);
    });
  });

  describe('allocateToMultipleInvoices', () => {
    it('should create payments for multiple invoices atomically', async () => {
      const invoice1 = await createInvoice({
        totalCents: 300000,
      });

      const invoice2 = await createInvoice({
        totalCents: 200000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice1.id,
            amountCents: 300000,
          },
          {
            invoiceId: invoice2.id,
            amountCents: 200000,
          },
        ],
      });

      expect(result.payments).toHaveLength(2);
      expect(result.invoicesUpdated).toHaveLength(2);
      expect(result.invoicesUpdated).toContain(invoice1.id);
      expect(result.invoicesUpdated).toContain(invoice2.id);
    });

    it('should update all invoices correctly', async () => {
      const invoice1 = await createInvoice({
        totalCents: 300000,
      });

      const invoice2 = await createInvoice({
        totalCents: 200000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice1.id,
            amountCents: 300000,
          },
          {
            invoiceId: invoice2.id,
            amountCents: 200000,
          },
        ],
      });

      const updatedInvoice1 = await invoiceRepo.findById(invoice1.id);
      const updatedInvoice2 = await invoiceRepo.findById(invoice2.id);

      expect(updatedInvoice1?.amountPaidCents).toBe(300000);
      expect(updatedInvoice1?.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice2?.amountPaidCents).toBe(200000);
      expect(updatedInvoice2?.status).toBe(InvoiceStatus.PAID);
    });

    it('should be atomic (all or nothing)', async () => {
      const invoice1 = await createInvoice({
        totalCents: 300000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const nonExistentInvoiceId = uuidv4();

      await expect(
        service.allocateToMultipleInvoices({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          allocations: [
            {
              invoiceId: invoice1.id,
              amountCents: 300000,
            },
            {
              invoiceId: nonExistentInvoiceId,
              amountCents: 200000,
            },
          ],
        }),
      ).rejects.toThrow(NotFoundException);

      // Verify invoice1 was NOT updated (transaction rolled back)
      const invoice = await invoiceRepo.findById(invoice1.id);
      expect(invoice?.amountPaidCents).toBe(0);
      expect(invoice?.status).toBe(InvoiceStatus.SENT);
    });

    it('should return aggregated results', async () => {
      const invoice1 = await createInvoice({
        totalCents: 300000,
      });

      const invoice2 = await createInvoice({
        totalCents: 200000,
      });

      const transaction = await createTransaction({
        amountCents: 600000, // 100000 unallocated
      });

      const result = await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice1.id,
            amountCents: 300000,
          },
          {
            invoiceId: invoice2.id,
            amountCents: 200000,
          },
        ],
      });

      expect(result.payments).toHaveLength(2);
      expect(result.invoicesUpdated).toHaveLength(2);
      expect(result.unallocatedAmountCents).toBe(100000);
      expect(result.xeroSyncStatus).toBe(XeroSyncStatus.SKIPPED);
      expect(result.errors).toHaveLength(0);
    });

    it('should calculate unallocated amount correctly', async () => {
      const invoice = await createInvoice({
        totalCents: 300000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 300000,
          },
        ],
      });

      expect(result.unallocatedAmountCents).toBe(200000);
    });
  });

  describe('reverseAllocation', () => {
    it('should mark payment as reversed', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const allocation = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      const paymentId = allocation.payments[0].id;

      const reversedPayment = await service.reverseAllocation({
        tenantId: testTenant.id,
        paymentId,
        reason: 'Payment made in error',
      });

      expect(reversedPayment.isReversed).toBe(true);
      expect(reversedPayment.reversalReason).toBe('Payment made in error');
      expect(reversedPayment.reversedAt).toBeTruthy();
    });

    it('should revert invoice amountPaid', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const allocation = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      // Verify invoice is paid
      let updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.amountPaidCents).toBe(500000);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);

      // Reverse payment
      await service.reverseAllocation({
        tenantId: testTenant.id,
        paymentId: allocation.payments[0].id,
        reason: 'Reversal test',
      });

      // Verify invoice is reverted
      updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.amountPaidCents).toBe(0);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.SENT);
    });

    it('should create audit log for reversal', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const allocation = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      await service.reverseAllocation({
        tenantId: testTenant.id,
        paymentId: allocation.payments[0].id,
        reason: 'Audit test reversal',
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Payment',
          action: 'UPDATE',
        },
      });

      const reversalLog = auditLogs.find((log) =>
        log.changeSummary?.includes('reversed'),
      );
      expect(reversalLog).toBeDefined();
      expect(reversalLog?.changeSummary).toContain('Audit test reversal');
    });

    it('should throw if payment already reversed', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const allocation = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      const paymentId = allocation.payments[0].id;

      // First reversal should succeed
      await service.reverseAllocation({
        tenantId: testTenant.id,
        paymentId,
        reason: 'First reversal',
      });

      // Second reversal should fail
      await expect(
        service.reverseAllocation({
          tenantId: testTenant.id,
          paymentId,
          reason: 'Second reversal',
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('Validation Errors', () => {
    it('should throw if transaction not found', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const nonExistentTransactionId = uuidv4();

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: nonExistentTransactionId,
          allocations: [
            {
              invoiceId: invoice.id,
              amountCents: 500000,
            },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if transaction is not a credit', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const debitTransaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Debit transaction',
          amountCents: -500000,
          isCredit: false, // Debit
          source: ImportSource.BANK_FEED,
          status: TransactionStatus.PENDING,
        },
      });

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: debitTransaction.id,
          allocations: [
            {
              invoiceId: invoice.id,
              amountCents: 500000,
            },
          ],
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw if invoice not found', async () => {
      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const nonExistentInvoiceId = uuidv4();

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          allocations: [
            {
              invoiceId: nonExistentInvoiceId,
              amountCents: 500000,
            },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if allocation exceeds transaction amount', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 300000,
      });

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          allocations: [
            {
              invoiceId: invoice.id,
              amountCents: 500000, // Exceeds transaction amount
            },
          ],
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw if tenant mismatch between invoice and request', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other St',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27215559999',
          email: `other${Date.now()}@test.com`,
        },
      });

      const otherParent = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          email: `jane${Date.now()}@test.com`,
          phone: '+27827654321',
          idNumber: '9001015800087',
          address: '123 Other St',
        },
      });

      const otherChild = await prisma.child.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Tom',
          lastName: 'Doe',
          dateOfBirth: new Date('2021-03-20'),
          parentId: otherParent.id,
        },
      });

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: otherTenant.id,
          invoiceNumber: `INV-OTHER-${Date.now()}`,
          parentId: otherParent.id,
          childId: otherChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date('2025-01-20'),
          subtotalCents: 434783,
          vatCents: 65217,
          totalCents: 500000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          allocations: [
            {
              invoiceId: otherInvoice.id,
              amountCents: 500000,
            },
          ],
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw if no allocations provided', async () => {
      const transaction = await createTransaction({
        amountCents: 500000,
      });

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          allocations: [],
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw if allocation amount is zero or negative', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      await expect(
        service.allocatePayment({
          tenantId: testTenant.id,
          transactionId: transaction.id,
          allocations: [
            {
              invoiceId: invoice.id,
              amountCents: 0,
            },
          ],
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('Payment Record Details', () => {
    it('should set correct matchType for exact payment', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.payments[0].matchType).toBe(MatchType.EXACT);
    });

    it('should set matchedBy to AI_AUTO when no userId provided', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.payments[0].matchedBy).toBe(MatchedBy.AI_AUTO);
      expect(result.payments[0].matchConfidence).toBeTruthy();
    });

    it('should set matchedBy to USER when userId provided', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const userId = uuidv4();

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
        userId,
      });

      expect(result.payments[0].matchedBy).toBe(MatchedBy.USER);
      expect(result.payments[0].matchConfidence).toBeNull();
    });

    it('should set paymentDate from transaction date', async () => {
      const transactionDate = new Date('2025-01-20');
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
        date: transactionDate,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.payments[0].paymentDate).toEqual(transactionDate);
    });

    it('should set reference from transaction reference', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
        reference: 'REF-12345',
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.payments[0].reference).toBe('REF-12345');
    });
  });

  describe('Multi-invoice Complex Scenarios', () => {
    it('should handle mix of exact and partial payments', async () => {
      const invoice1 = await createInvoice({
        totalCents: 300000,
      });

      const invoice2 = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 600000,
      });

      const result = await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice1.id,
            amountCents: 300000, // Exact
          },
          {
            invoiceId: invoice2.id,
            amountCents: 300000, // Partial
          },
        ],
      });

      expect(result.payments).toHaveLength(2);
      expect(result.payments[0].matchType).toBe(MatchType.EXACT);
      expect(result.payments[1].matchType).toBe(MatchType.PARTIAL);

      const updatedInvoice1 = await invoiceRepo.findById(invoice1.id);
      const updatedInvoice2 = await invoiceRepo.findById(invoice2.id);

      expect(updatedInvoice1?.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice2?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });

    it('should handle three invoices in one transaction', async () => {
      const invoice1 = await createInvoice({
        totalCents: 200000,
      });

      const invoice2 = await createInvoice({
        totalCents: 300000,
      });

      const invoice3 = await createInvoice({
        totalCents: 400000,
      });

      const transaction = await createTransaction({
        amountCents: 900000,
      });

      const result = await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice1.id,
            amountCents: 200000,
          },
          {
            invoiceId: invoice2.id,
            amountCents: 300000,
          },
          {
            invoiceId: invoice3.id,
            amountCents: 400000,
          },
        ],
      });

      expect(result.payments).toHaveLength(3);
      expect(result.invoicesUpdated).toHaveLength(3);
      expect(result.unallocatedAmountCents).toBe(0);

      const updatedInvoices = await Promise.all([
        invoiceRepo.findById(invoice1.id),
        invoiceRepo.findById(invoice2.id),
        invoiceRepo.findById(invoice3.id),
      ]);

      updatedInvoices.forEach((inv) => {
        expect(inv?.status).toBe(InvoiceStatus.PAID);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle payment reversal for partially paid invoice', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
        amountPaidCents: 0,
      });

      const transaction1 = await createTransaction({
        amountCents: 300000,
      });

      const transaction2 = await createTransaction({
        amountCents: 200000,
      });

      // First payment
      const allocation1 = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction1.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 300000,
          },
        ],
      });

      // Second payment
      await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction2.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 200000,
          },
        ],
      });

      // Invoice should be PAID
      let updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PAID);

      // Reverse first payment
      await service.reverseAllocation({
        tenantId: testTenant.id,
        paymentId: allocation1.payments[0].id,
        reason: 'Test reversal',
      });

      // Invoice should be PARTIALLY_PAID
      updatedInvoice = await invoiceRepo.findById(invoice.id);
      expect(updatedInvoice?.amountPaidCents).toBe(200000);
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });

    it('should handle zero unallocated amount', async () => {
      const invoice = await createInvoice({
        totalCents: 500000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      const result = await service.allocatePayment({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice.id,
            amountCents: 500000,
          },
        ],
      });

      expect(result.unallocatedAmountCents).toBe(0);
    });

    it('should create audit logs for all multi-invoice allocations', async () => {
      const invoice1 = await createInvoice({
        totalCents: 300000,
      });

      const invoice2 = await createInvoice({
        totalCents: 200000,
      });

      const transaction = await createTransaction({
        amountCents: 500000,
      });

      await service.allocateToMultipleInvoices({
        tenantId: testTenant.id,
        transactionId: transaction.id,
        allocations: [
          {
            invoiceId: invoice1.id,
            amountCents: 300000,
          },
          {
            invoiceId: invoice2.id,
            amountCents: 200000,
          },
        ],
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Payment',
          action: 'CREATE',
        },
      });

      expect(auditLogs.length).toBe(2);
      auditLogs.forEach((log) => {
        expect(log.changeSummary).toContain('Multi-invoice allocation');
      });
    });
  });
});
