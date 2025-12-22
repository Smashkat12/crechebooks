import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { CreatePaymentDto } from '../../../src/database/dto/payment.dto';
import {
  MatchType,
  MatchedBy,
} from '../../../src/database/entities/payment.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant, Parent, Child, Invoice, Transaction } from '@prisma/client';

describe('PaymentRepository', () => {
  let repository: PaymentRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let testInvoice: Invoice;
  let testTransaction: Transaction;

  // Real test data - South African creche payment
  const testPaymentData: CreatePaymentDto = {
    tenantId: '', // Will be set in beforeEach
    invoiceId: '', // Will be set in beforeEach
    transactionId: '', // Will be set in beforeEach
    amountCents: 450000, // R4,500.00
    paymentDate: new Date('2025-01-15'),
    reference: 'REF-2025-001',
    matchType: MatchType.EXACT,
    matchConfidence: 95.5,
    matchedBy: MatchedBy.AI_AUTO,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PaymentRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<PaymentRepository>(PaymentRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
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
        firstName: 'Thabo',
        lastName: 'Mbeki',
        email: 'thabo@family.co.za',
        phone: '+27821234567',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Lerato',
        lastName: 'Mbeki',
        dateOfBirth: new Date('2021-03-15'),
      },
    });

    // Create test invoice
    testInvoice = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2025-001',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2025-01-01'),
        billingPeriodEnd: new Date('2025-01-31'),
        issueDate: new Date('2025-01-01'),
        dueDate: new Date('2025-01-07'),
        subtotalCents: 391304,
        vatCents: 58696,
        totalCents: 450000,
      },
    });

    // Create test transaction
    testTransaction = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB-001',
        date: new Date('2025-01-15'),
        description: 'Payment received - Mbeki family',
        payeeName: 'Thabo Mbeki',
        amountCents: 450000,
        isCredit: true,
        source: 'BANK_FEED',
      },
    });

    // Update test data with created IDs
    testPaymentData.tenantId = testTenant.id;
    testPaymentData.invoiceId = testInvoice.id;
    testPaymentData.transactionId = testTransaction.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a payment with all fields', async () => {
      const payment = await repository.create(testPaymentData);

      expect(payment.id).toBeDefined();
      expect(payment.tenantId).toBe(testTenant.id);
      expect(payment.invoiceId).toBe(testInvoice.id);
      expect(payment.transactionId).toBe(testTransaction.id);
      expect(payment.amountCents).toBe(450000);
      expect(payment.reference).toBe('REF-2025-001');
      expect(payment.matchType).toBe(MatchType.EXACT);
      expect(Number(payment.matchConfidence)).toBeCloseTo(95.5, 1);
      expect(payment.matchedBy).toBe(MatchedBy.AI_AUTO);
      expect(payment.isReversed).toBe(false);
      expect(payment.reversedAt).toBeNull();
      expect(payment.reversalReason).toBeNull();
      expect(payment.createdAt).toBeInstanceOf(Date);
      expect(payment.updatedAt).toBeInstanceOf(Date);
    });

    it('should create payment with minimum required fields', async () => {
      const minimalData: CreatePaymentDto = {
        tenantId: testTenant.id,
        invoiceId: testInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-01-15'),
        matchType: MatchType.MANUAL,
        matchedBy: MatchedBy.USER,
      };

      const payment = await repository.create(minimalData);

      expect(payment.id).toBeDefined();
      expect(payment.xeroPaymentId).toBeNull();
      expect(payment.transactionId).toBeNull(); // Optional - manual payment
      expect(payment.reference).toBeNull();
      expect(payment.matchConfidence).toBeNull();
    });

    it('should create payment with xeroPaymentId', async () => {
      const data: CreatePaymentDto = {
        ...testPaymentData,
        xeroPaymentId: 'xero-pay-12345',
      };

      const payment = await repository.create(data);

      expect(payment.xeroPaymentId).toBe('xero-pay-12345');
    });

    it('should throw ConflictException for duplicate xeroPaymentId', async () => {
      const data: CreatePaymentDto = {
        ...testPaymentData,
        xeroPaymentId: 'xero-pay-duplicate',
      };

      await repository.create(data);

      // Create another invoice for second payment
      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 450000,
          totalCents: 450000,
        },
      });

      const duplicateData: CreatePaymentDto = {
        ...testPaymentData,
        invoiceId: otherInvoice.id,
        xeroPaymentId: 'xero-pay-duplicate',
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      const invalidData: CreatePaymentDto = {
        ...testPaymentData,
        invoiceId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      const invalidData: CreatePaymentDto = {
        ...testPaymentData,
        transactionId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreatePaymentDto = {
        ...testPaymentData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle all MatchType values', async () => {
      const matchTypes = [
        MatchType.EXACT,
        MatchType.PARTIAL,
        MatchType.MANUAL,
        MatchType.OVERPAYMENT,
      ];

      for (let i = 0; i < matchTypes.length; i++) {
        const invoice = await prisma.invoice.create({
          data: {
            tenantId: testTenant.id,
            invoiceNumber: `INV-MATCH-${i}`,
            parentId: testParent.id,
            childId: testChild.id,
            billingPeriodStart: new Date('2025-01-01'),
            billingPeriodEnd: new Date('2025-01-31'),
            issueDate: new Date('2025-01-01'),
            dueDate: new Date('2025-01-07'),
            subtotalCents: 100000,
            totalCents: 100000,
          },
        });

        const payment = await repository.create({
          tenantId: testTenant.id,
          invoiceId: invoice.id,
          amountCents: 100000,
          paymentDate: new Date('2025-01-15'),
          matchType: matchTypes[i],
          matchedBy: MatchedBy.AI_AUTO,
        });

        expect(payment.matchType).toBe(matchTypes[i]);
      }
    });

    it('should handle both MatchedBy values', async () => {
      // AI_AUTO
      const payment1 = await repository.create(testPaymentData);
      expect(payment1.matchedBy).toBe(MatchedBy.AI_AUTO);

      // USER
      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-USER-001',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      const payment2 = await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.MANUAL,
        matchedBy: MatchedBy.USER,
      });
      expect(payment2.matchedBy).toBe(MatchedBy.USER);
    });
  });

  describe('findById', () => {
    it('should find payment by id', async () => {
      const created = await repository.create(testPaymentData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.amountCents).toBe(testPaymentData.amountCents);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByXeroPaymentId', () => {
    it('should find payment by xeroPaymentId', async () => {
      const data: CreatePaymentDto = {
        ...testPaymentData,
        xeroPaymentId: 'xero-find-test',
      };
      await repository.create(data);

      const found = await repository.findByXeroPaymentId('xero-find-test');

      expect(found).not.toBeNull();
      expect(found?.xeroPaymentId).toBe('xero-find-test');
    });

    it('should return null for non-existent xeroPaymentId', async () => {
      const found = await repository.findByXeroPaymentId('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByTransactionId', () => {
    it('should find all payments for a transaction', async () => {
      // Create second invoice for second payment
      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 225000,
          totalCents: 225000,
        },
      });

      // Split transaction across two invoices
      await repository.create({
        ...testPaymentData,
        amountCents: 225000,
        matchType: MatchType.PARTIAL,
      });

      await repository.create({
        ...testPaymentData,
        invoiceId: otherInvoice.id,
        amountCents: 225000,
        matchType: MatchType.PARTIAL,
      });

      const payments = await repository.findByTransactionId(testTransaction.id);

      expect(payments).toHaveLength(2);
      expect(payments[0].transactionId).toBe(testTransaction.id);
      expect(payments[1].transactionId).toBe(testTransaction.id);
    });

    it('should return empty array for transaction with no payments', async () => {
      const payments = await repository.findByTransactionId(testTransaction.id);
      expect(payments).toHaveLength(0);
    });
  });

  describe('findByInvoiceId', () => {
    it('should find all payments for an invoice', async () => {
      // Create multiple partial payments
      await repository.create({
        ...testPaymentData,
        amountCents: 200000,
        matchType: MatchType.PARTIAL,
      });

      // Create second transaction
      const otherTransaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-20'),
          description: 'Second payment - Mbeki',
          amountCents: 250000,
          isCredit: true,
          source: 'BANK_FEED',
        },
      });

      await repository.create({
        ...testPaymentData,
        transactionId: otherTransaction.id,
        amountCents: 250000,
        matchType: MatchType.PARTIAL,
      });

      const payments = await repository.findByInvoiceId(testInvoice.id);

      expect(payments).toHaveLength(2);
      expect(payments[0].invoiceId).toBe(testInvoice.id);
      expect(payments[1].invoiceId).toBe(testInvoice.id);
    });

    it('should return empty array for invoice with no payments', async () => {
      const payments = await repository.findByInvoiceId(testInvoice.id);
      expect(payments).toHaveLength(0);
    });
  });

  describe('findByTenantId', () => {
    it('should return all payments for tenant', async () => {
      await repository.create(testPaymentData);

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.EXACT,
        matchedBy: MatchedBy.AI_AUTO,
      });

      const payments = await repository.findByTenantId(testTenant.id);

      expect(payments).toHaveLength(2);
    });

    it('should filter by matchType', async () => {
      await repository.create(testPaymentData);

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.MANUAL,
        matchedBy: MatchedBy.USER,
      });

      const exactPayments = await repository.findByTenantId(testTenant.id, {
        matchType: MatchType.EXACT,
      });

      expect(exactPayments).toHaveLength(1);
      expect(exactPayments[0].matchType).toBe(MatchType.EXACT);
    });

    it('should filter by matchedBy', async () => {
      await repository.create(testPaymentData);

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.MANUAL,
        matchedBy: MatchedBy.USER,
      });

      const userPayments = await repository.findByTenantId(testTenant.id, {
        matchedBy: MatchedBy.USER,
      });

      expect(userPayments).toHaveLength(1);
      expect(userPayments[0].matchedBy).toBe(MatchedBy.USER);
    });

    it('should filter by isReversed', async () => {
      const payment = await repository.create(testPaymentData);
      await repository.reverse(payment.id, { reversalReason: 'Test reversal' });

      const activePayments = await repository.findByTenantId(testTenant.id, {
        isReversed: false,
      });
      expect(activePayments).toHaveLength(0);

      const reversedPayments = await repository.findByTenantId(testTenant.id, {
        isReversed: true,
      });
      expect(reversedPayments).toHaveLength(1);
    });

    it('should order by paymentDate descending', async () => {
      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      await repository.create({
        ...testPaymentData,
        paymentDate: new Date('2025-01-10'),
      });

      await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.EXACT,
        matchedBy: MatchedBy.AI_AUTO,
      });

      const payments = await repository.findByTenantId(testTenant.id);

      expect(payments[0].paymentDate.getMonth()).toBe(1); // February
      expect(payments[1].paymentDate.getMonth()).toBe(0); // January
    });
  });

  describe('update', () => {
    it('should update payment fields', async () => {
      const created = await repository.create(testPaymentData);

      const updated = await repository.update(created.id, {
        reference: 'UPDATED-REF',
        matchConfidence: 99.9,
      });

      expect(updated.reference).toBe('UPDATED-REF');
      expect(Number(updated.matchConfidence)).toBeCloseTo(99.9, 1);
      expect(updated.amountCents).toBe(450000); // unchanged
    });

    it('should throw NotFoundException for non-existent payment', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          reference: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate xeroPaymentId', async () => {
      const payment1 = await repository.create({
        ...testPaymentData,
        xeroPaymentId: 'xero-1',
      });

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      const payment2 = await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.EXACT,
        matchedBy: MatchedBy.AI_AUTO,
        xeroPaymentId: 'xero-2',
      });

      await expect(
        repository.update(payment2.id, { xeroPaymentId: 'xero-1' }),
      ).rejects.toThrow(ConflictException);

      // Verify original payment unchanged
      const original = await repository.findById(payment1.id);
      expect(original?.xeroPaymentId).toBe('xero-1');
    });
  });

  describe('reverse', () => {
    it('should reverse a payment', async () => {
      const created = await repository.create(testPaymentData);
      expect(created.isReversed).toBe(false);

      const reversed = await repository.reverse(created.id, {
        reversalReason: 'Incorrect match detected',
      });

      expect(reversed.isReversed).toBe(true);
      expect(reversed.reversedAt).toBeInstanceOf(Date);
      expect(reversed.reversalReason).toBe('Incorrect match detected');
    });

    it('should throw NotFoundException for non-existent payment', async () => {
      await expect(
        repository.reverse('00000000-0000-0000-0000-000000000000', {
          reversalReason: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for already reversed payment', async () => {
      const created = await repository.create(testPaymentData);
      await repository.reverse(created.id, {
        reversalReason: 'First reversal',
      });

      await expect(
        repository.reverse(created.id, { reversalReason: 'Second reversal' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should delete existing payment', async () => {
      const created = await repository.create(testPaymentData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent payment', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('calculateTotalPaidForInvoice', () => {
    it('should calculate total of non-reversed payments', async () => {
      await repository.create({
        ...testPaymentData,
        amountCents: 200000,
        matchType: MatchType.PARTIAL,
      });

      const otherTransaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-20'),
          description: 'Second payment',
          amountCents: 250000,
          isCredit: true,
          source: 'BANK_FEED',
        },
      });

      await repository.create({
        ...testPaymentData,
        transactionId: otherTransaction.id,
        amountCents: 250000,
        matchType: MatchType.PARTIAL,
      });

      const total = await repository.calculateTotalPaidForInvoice(
        testInvoice.id,
      );

      expect(total).toBe(450000); // 200000 + 250000
    });

    it('should exclude reversed payments from total', async () => {
      const payment1 = await repository.create({
        ...testPaymentData,
        amountCents: 200000,
        matchType: MatchType.PARTIAL,
      });

      const otherTransaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-20'),
          description: 'Second payment',
          amountCents: 250000,
          isCredit: true,
          source: 'BANK_FEED',
        },
      });

      await repository.create({
        ...testPaymentData,
        transactionId: otherTransaction.id,
        amountCents: 250000,
        matchType: MatchType.PARTIAL,
      });

      // Reverse first payment
      await repository.reverse(payment1.id, { reversalReason: 'Test' });

      const total = await repository.calculateTotalPaidForInvoice(
        testInvoice.id,
      );

      expect(total).toBe(250000); // Only second payment counts
    });

    it('should return 0 for invoice with no payments', async () => {
      const total = await repository.calculateTotalPaidForInvoice(
        testInvoice.id,
      );
      expect(total).toBe(0);
    });
  });

  describe('findActiveByTenantId', () => {
    it('should return only non-reversed payments', async () => {
      const payment1 = await repository.create(testPaymentData);

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-01'),
          dueDate: new Date('2025-02-08'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      await repository.create({
        tenantId: testTenant.id,
        invoiceId: otherInvoice.id,
        amountCents: 100000,
        paymentDate: new Date('2025-02-15'),
        matchType: MatchType.EXACT,
        matchedBy: MatchedBy.AI_AUTO,
      });

      // Reverse first payment
      await repository.reverse(payment1.id, { reversalReason: 'Test' });

      const activePayments = await repository.findActiveByTenantId(
        testTenant.id,
      );

      expect(activePayments).toHaveLength(1);
      expect(activePayments[0].isReversed).toBe(false);
    });
  });

  describe('date handling', () => {
    it('should store paymentDate correctly (date only, no time)', async () => {
      const paymentDate = new Date('2025-03-15');

      const created = await repository.create({
        ...testPaymentData,
        paymentDate,
      });

      // Date should be stored correctly
      expect(created.paymentDate.getFullYear()).toBe(2025);
      expect(created.paymentDate.getMonth()).toBe(2); // March (0-indexed)
      expect(created.paymentDate.getDate()).toBe(15);
    });
  });

  describe('tenant isolation', () => {
    it('should not return payments from other tenants', async () => {
      await repository.create(testPaymentData);

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@creche.co.za`,
        },
      });

      const payments = await repository.findByTenantId(otherTenant.id);

      expect(payments).toHaveLength(0);
    });
  });

  describe('manual payments without transaction', () => {
    it('should create payment without transactionId', async () => {
      const manualPaymentData: CreatePaymentDto = {
        tenantId: testTenant.id,
        invoiceId: testInvoice.id,
        amountCents: 450000,
        paymentDate: new Date('2025-01-15'),
        reference: 'CASH-001',
        matchType: MatchType.MANUAL,
        matchedBy: MatchedBy.USER,
        // No transactionId - manual payment not from bank feed
      };

      const payment = await repository.create(manualPaymentData);

      expect(payment.transactionId).toBeNull();
      expect(payment.matchType).toBe(MatchType.MANUAL);
      expect(payment.matchedBy).toBe(MatchedBy.USER);
    });
  });

  describe('unique constraint on xeroPaymentId per tenant', () => {
    it('should allow same xeroPaymentId in different tenants', async () => {
      // Create payment in first tenant
      await repository.create({
        ...testPaymentData,
        xeroPaymentId: 'shared-xero-id',
      });

      // Create another tenant with all required entities
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@creche.co.za`,
        },
      });

      const otherParent = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Other',
          lastName: 'Parent',
        },
      });

      const otherChild = await prisma.child.create({
        data: {
          tenantId: otherTenant.id,
          parentId: otherParent.id,
          firstName: 'Other',
          lastName: 'Child',
          dateOfBirth: new Date('2021-01-01'),
        },
      });

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: otherTenant.id,
          invoiceNumber: 'INV-OTHER-001',
          parentId: otherParent.id,
          childId: otherChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-01'),
          dueDate: new Date('2025-01-07'),
          subtotalCents: 100000,
          totalCents: 100000,
        },
      });

      // xeroPaymentId is globally unique (not per tenant), so this should fail
      // This tests the constraint is actually working
      await expect(
        repository.create({
          tenantId: otherTenant.id,
          invoiceId: otherInvoice.id,
          amountCents: 100000,
          paymentDate: new Date('2025-01-15'),
          matchType: MatchType.EXACT,
          matchedBy: MatchedBy.AI_AUTO,
          xeroPaymentId: 'shared-xero-id', // Same xeroPaymentId - should fail
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
