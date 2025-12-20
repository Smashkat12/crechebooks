import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { CreateInvoiceDto } from '../../../src/database/dto/invoice.dto';
import {
  InvoiceStatus,
  DeliveryMethod,
} from '../../../src/database/entities/invoice.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant, Parent, Child } from '@prisma/client';

describe('InvoiceRepository', () => {
  let repository: InvoiceRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let otherChild: Child;

  // Real test data - South African creche invoice
  const testInvoiceData: CreateInvoiceDto = {
    tenantId: '', // Will be set in beforeEach
    invoiceNumber: 'INV-2025-001',
    parentId: '', // Will be set in beforeEach
    childId: '', // Will be set in beforeEach
    billingPeriodStart: new Date('2025-01-01'),
    billingPeriodEnd: new Date('2025-01-31'),
    issueDate: new Date('2025-01-01'),
    dueDate: new Date('2025-01-07'),
    subtotalCents: 391304, // R3,913.04 excl VAT
    vatCents: 58696, // R586.96 VAT at 15%
    totalCents: 450000, // R4,500.00 incl VAT
    deliveryMethod: DeliveryMethod.EMAIL,
    notes: 'January 2025 school fees',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, InvoiceRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<InvoiceRepository>(InvoiceRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
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

    // Create another child for testing
    otherChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Sipho',
        lastName: 'Mbeki',
        dateOfBirth: new Date('2022-06-20'),
      },
    });

    // Update test data with created IDs
    testInvoiceData.tenantId = testTenant.id;
    testInvoiceData.parentId = testParent.id;
    testInvoiceData.childId = testChild.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create an invoice with all fields', async () => {
      const invoice = await repository.create(testInvoiceData);

      expect(invoice.id).toBeDefined();
      expect(invoice.tenantId).toBe(testTenant.id);
      expect(invoice.invoiceNumber).toBe('INV-2025-001');
      expect(invoice.parentId).toBe(testParent.id);
      expect(invoice.childId).toBe(testChild.id);
      expect(invoice.subtotalCents).toBe(391304);
      expect(invoice.vatCents).toBe(58696);
      expect(invoice.totalCents).toBe(450000);
      expect(invoice.amountPaidCents).toBe(0); // default
      expect(invoice.status).toBe(InvoiceStatus.DRAFT); // default
      expect(invoice.deliveryMethod).toBe(DeliveryMethod.EMAIL);
      expect(invoice.deliveryStatus).toBeNull();
      expect(invoice.notes).toBe('January 2025 school fees');
      expect(invoice.isDeleted).toBe(false);
      expect(invoice.createdAt).toBeInstanceOf(Date);
      expect(invoice.updatedAt).toBeInstanceOf(Date);
    });

    it('should create invoice with minimum required fields', async () => {
      const minimalData: CreateInvoiceDto = {
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
      };

      const invoice = await repository.create(minimalData);

      expect(invoice.id).toBeDefined();
      expect(invoice.vatCents).toBe(0); // default
      expect(invoice.amountPaidCents).toBe(0); // default
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice.deliveryMethod).toBeNull();
      expect(invoice.notes).toBeNull();
    });

    it('should throw ConflictException for duplicate invoice number', async () => {
      await repository.create(testInvoiceData);

      await expect(repository.create(testInvoiceData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for non-existent parent', async () => {
      const invalidData: CreateInvoiceDto = {
        ...testInvoiceData,
        parentId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent child', async () => {
      const invalidData: CreateInvoiceDto = {
        ...testInvoiceData,
        childId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateInvoiceDto = {
        ...testInvoiceData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should find invoice by id', async () => {
      const created = await repository.create(testInvoiceData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.invoiceNumber).toBe(testInvoiceData.invoiceNumber);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByIdWithLines', () => {
    it('should find invoice with lines', async () => {
      const created = await repository.create(testInvoiceData);

      // Add some lines
      await prisma.invoiceLine.createMany({
        data: [
          {
            invoiceId: created.id,
            description: 'Full Day Care - January 2025',
            quantity: 1,
            unitPriceCents: 450000,
            subtotalCents: 450000,
            totalCents: 450000,
            lineType: 'MONTHLY_FEE',
            sortOrder: 0,
          },
          {
            invoiceId: created.id,
            description: 'Registration Fee',
            quantity: 1,
            unitPriceCents: 50000,
            subtotalCents: 50000,
            totalCents: 50000,
            lineType: 'REGISTRATION',
            sortOrder: 1,
          },
        ],
      });

      const found = await repository.findByIdWithLines(created.id);

      expect(found).not.toBeNull();
      expect(found?.lines).toHaveLength(2);
      expect(found?.lines[0].sortOrder).toBe(0);
      expect(found?.lines[1].sortOrder).toBe(1);
    });
  });

  describe('findByTenant', () => {
    it('should return all invoices for tenant', async () => {
      await repository.create(testInvoiceData);
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
        childId: otherChild.id,
      });

      const invoices = await repository.findByTenant(testTenant.id, {});

      expect(invoices).toHaveLength(2);
    });

    it('should filter by parentId', async () => {
      await repository.create(testInvoiceData);

      const invoices = await repository.findByTenant(testTenant.id, {
        parentId: testParent.id,
      });

      expect(invoices).toHaveLength(1);
      expect(invoices[0].parentId).toBe(testParent.id);
    });

    it('should filter by childId', async () => {
      await repository.create(testInvoiceData);
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
        childId: otherChild.id,
      });

      const invoices = await repository.findByTenant(testTenant.id, {
        childId: testChild.id,
      });

      expect(invoices).toHaveLength(1);
      expect(invoices[0].childId).toBe(testChild.id);
    });

    it('should filter by status', async () => {
      const invoice1 = await repository.create(testInvoiceData);
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
      });

      // Update one to SENT
      await repository.update(invoice1.id, { status: InvoiceStatus.SENT });

      const sentInvoices = await repository.findByTenant(testTenant.id, {
        status: InvoiceStatus.SENT,
      });

      expect(sentInvoices).toHaveLength(1);
      expect(sentInvoices[0].status).toBe(InvoiceStatus.SENT);
    });

    it('should exclude deleted invoices by default', async () => {
      const invoice = await repository.create(testInvoiceData);
      await repository.softDelete(invoice.id);

      const invoices = await repository.findByTenant(testTenant.id, {});

      expect(invoices).toHaveLength(0);
    });

    it('should include deleted invoices when explicitly requested', async () => {
      const invoice = await repository.create(testInvoiceData);
      await repository.softDelete(invoice.id);

      const invoices = await repository.findByTenant(testTenant.id, {
        isDeleted: true,
      });

      expect(invoices).toHaveLength(1);
      expect(invoices[0].isDeleted).toBe(true);
    });

    it('should order by issueDate descending', async () => {
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-001',
        issueDate: new Date('2025-01-01'),
      });
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
        issueDate: new Date('2025-02-01'),
      });

      const invoices = await repository.findByTenant(testTenant.id, {});

      expect(invoices[0].invoiceNumber).toBe('INV-2025-002'); // February (newer)
      expect(invoices[1].invoiceNumber).toBe('INV-2025-001'); // January
    });
  });

  describe('findByInvoiceNumber', () => {
    it('should find invoice by invoice number', async () => {
      await repository.create(testInvoiceData);

      const found = await repository.findByInvoiceNumber(
        testTenant.id,
        'INV-2025-001',
      );

      expect(found).not.toBeNull();
      expect(found?.invoiceNumber).toBe('INV-2025-001');
    });

    it('should return null for non-existent invoice number', async () => {
      const found = await repository.findByInvoiceNumber(
        testTenant.id,
        'INV-NONEXISTENT',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByParent', () => {
    it('should return all invoices for a parent', async () => {
      await repository.create(testInvoiceData);
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
        childId: otherChild.id,
      });

      const invoices = await repository.findByParent(
        testTenant.id,
        testParent.id,
      );

      expect(invoices).toHaveLength(2);
    });
  });

  describe('findByChild', () => {
    it('should return all invoices for a child', async () => {
      await repository.create(testInvoiceData);
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
        billingPeriodStart: new Date('2025-02-01'),
        billingPeriodEnd: new Date('2025-02-28'),
        issueDate: new Date('2025-02-01'),
      });

      const invoices = await repository.findByChild(
        testTenant.id,
        testChild.id,
      );

      expect(invoices).toHaveLength(2);
    });

    it('should return empty array for child with no invoices', async () => {
      const invoices = await repository.findByChild(
        testTenant.id,
        otherChild.id,
      );
      expect(invoices).toHaveLength(0);
    });
  });

  describe('findByStatus', () => {
    it('should return invoices with specific status', async () => {
      const invoice1 = await repository.create(testInvoiceData);
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
      });

      // Update one to PAID
      await repository.update(invoice1.id, { status: InvoiceStatus.PAID });

      const paidInvoices = await repository.findByStatus(
        testTenant.id,
        InvoiceStatus.PAID,
      );

      expect(paidInvoices).toHaveLength(1);
      expect(paidInvoices[0].status).toBe(InvoiceStatus.PAID);
    });
  });

  describe('findOverdue', () => {
    it('should return invoices past due date that are not paid or void', async () => {
      // Create an overdue invoice (due date in the past)
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2024-001',
        dueDate: new Date('2024-01-07'), // Past due
      });

      // Create a current invoice (due date in the future)
      await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
        dueDate: new Date('2099-12-31'), // Future due
      });

      const overdueInvoices = await repository.findOverdue(testTenant.id);

      expect(overdueInvoices).toHaveLength(1);
      expect(overdueInvoices[0].invoiceNumber).toBe('INV-2024-001');
    });

    it('should not return paid invoices even if past due', async () => {
      const invoice = await repository.create({
        ...testInvoiceData,
        dueDate: new Date('2024-01-07'), // Past due
      });

      // Mark as paid
      await repository.update(invoice.id, { status: InvoiceStatus.PAID });

      const overdueInvoices = await repository.findOverdue(testTenant.id);

      expect(overdueInvoices).toHaveLength(0);
    });

    it('should not return void invoices even if past due', async () => {
      const invoice = await repository.create({
        ...testInvoiceData,
        dueDate: new Date('2024-01-07'), // Past due
      });

      // Mark as void
      await repository.update(invoice.id, { status: InvoiceStatus.VOID });

      const overdueInvoices = await repository.findOverdue(testTenant.id);

      expect(overdueInvoices).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update invoice fields', async () => {
      const created = await repository.create(testInvoiceData);

      const updated = await repository.update(created.id, {
        status: InvoiceStatus.SENT,
        notes: 'Updated notes',
        amountPaidCents: 100000,
      });

      expect(updated.status).toBe(InvoiceStatus.SENT);
      expect(updated.notes).toBe('Updated notes');
      expect(updated.amountPaidCents).toBe(100000);
      expect(updated.invoiceNumber).toBe('INV-2025-001'); // unchanged
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          notes: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate invoice number on update', async () => {
      await repository.create(testInvoiceData);
      const second = await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-002',
      });

      await expect(
        repository.update(second.id, { invoiceNumber: 'INV-2025-001' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow setting xeroInvoiceId', async () => {
      const created = await repository.create(testInvoiceData);

      const updated = await repository.update(created.id, {
        xeroInvoiceId: 'xero-inv-12345',
      });

      expect(updated.xeroInvoiceId).toBe('xero-inv-12345');
    });
  });

  describe('softDelete', () => {
    it('should soft delete an invoice', async () => {
      const created = await repository.create(testInvoiceData);
      expect(created.isDeleted).toBe(false);

      const deleted = await repository.softDelete(created.id);

      expect(deleted.isDeleted).toBe(true);
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      await expect(
        repository.softDelete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete existing invoice', async () => {
      const created = await repository.create(testInvoiceData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should cascade delete invoice lines', async () => {
      const created = await repository.create(testInvoiceData);

      // Add lines
      await prisma.invoiceLine.create({
        data: {
          invoiceId: created.id,
          description: 'Test Line',
          quantity: 1,
          unitPriceCents: 100000,
          subtotalCents: 100000,
          totalCents: 100000,
          lineType: 'MONTHLY_FEE',
        },
      });

      // Verify line exists
      const linesBefore = await prisma.invoiceLine.findMany({
        where: { invoiceId: created.id },
      });
      expect(linesBefore).toHaveLength(1);

      // Delete invoice
      await repository.delete(created.id);

      // Verify lines are also deleted
      const linesAfter = await prisma.invoiceLine.findMany({
        where: { invoiceId: created.id },
      });
      expect(linesAfter).toHaveLength(0);
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateDeliveryStatus', () => {
    it('should update delivery status', async () => {
      const created = await repository.create(testInvoiceData);

      const updated = await repository.updateDeliveryStatus(
        created.id,
        'SENT',
        new Date(),
      );

      expect(updated.deliveryStatus).toBe('SENT');
      expect(updated.deliveredAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      await expect(
        repository.updateDeliveryStatus(
          '00000000-0000-0000-0000-000000000000',
          'SENT',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordPayment', () => {
    it('should record partial payment', async () => {
      const created = await repository.create(testInvoiceData);

      const updated = await repository.recordPayment(created.id, 200000); // R2,000

      expect(updated.amountPaidCents).toBe(200000);
      expect(updated.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });

    it('should mark as paid when full amount received', async () => {
      const created = await repository.create(testInvoiceData);

      const updated = await repository.recordPayment(created.id, 450000); // Full amount

      expect(updated.amountPaidCents).toBe(450000);
      expect(updated.status).toBe(InvoiceStatus.PAID);
    });

    it('should handle overpayment', async () => {
      const created = await repository.create(testInvoiceData);

      const updated = await repository.recordPayment(created.id, 500000); // More than total

      expect(updated.amountPaidCents).toBe(500000);
      expect(updated.status).toBe(InvoiceStatus.PAID);
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      await expect(
        repository.recordPayment(
          '00000000-0000-0000-0000-000000000000',
          100000,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('date handling', () => {
    it('should store dates correctly (date only, no time)', async () => {
      const billingPeriodStart = new Date('2025-03-01');
      const billingPeriodEnd = new Date('2025-03-31');
      const issueDate = new Date('2025-03-01');
      const dueDate = new Date('2025-03-08');

      const created = await repository.create({
        ...testInvoiceData,
        invoiceNumber: 'INV-2025-003',
        billingPeriodStart,
        billingPeriodEnd,
        issueDate,
        dueDate,
      });

      // Dates should be stored correctly
      expect(created.billingPeriodStart.getFullYear()).toBe(2025);
      expect(created.billingPeriodStart.getMonth()).toBe(2); // March (0-indexed)
      expect(created.billingPeriodStart.getDate()).toBe(1);

      expect(created.billingPeriodEnd.getFullYear()).toBe(2025);
      expect(created.billingPeriodEnd.getMonth()).toBe(2);
      expect(created.billingPeriodEnd.getDate()).toBe(31);

      expect(created.issueDate.getFullYear()).toBe(2025);
      expect(created.issueDate.getMonth()).toBe(2);
      expect(created.issueDate.getDate()).toBe(1);

      expect(created.dueDate.getFullYear()).toBe(2025);
      expect(created.dueDate.getMonth()).toBe(2);
      expect(created.dueDate.getDate()).toBe(8);
    });
  });

  describe('status transitions', () => {
    it('should handle all status values', async () => {
      const invoice = await repository.create(testInvoiceData);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);

      // DRAFT -> SENT
      const sent = await repository.update(invoice.id, {
        status: InvoiceStatus.SENT,
      });
      expect(sent.status).toBe(InvoiceStatus.SENT);

      // SENT -> VIEWED
      const viewed = await repository.update(invoice.id, {
        status: InvoiceStatus.VIEWED,
      });
      expect(viewed.status).toBe(InvoiceStatus.VIEWED);

      // VIEWED -> OVERDUE
      const overdue = await repository.update(invoice.id, {
        status: InvoiceStatus.OVERDUE,
      });
      expect(overdue.status).toBe(InvoiceStatus.OVERDUE);

      // OVERDUE -> PARTIALLY_PAID
      const partial = await repository.update(invoice.id, {
        status: InvoiceStatus.PARTIALLY_PAID,
      });
      expect(partial.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      // PARTIALLY_PAID -> PAID
      const paid = await repository.update(invoice.id, {
        status: InvoiceStatus.PAID,
      });
      expect(paid.status).toBe(InvoiceStatus.PAID);
    });

    it('should allow VOID status', async () => {
      const invoice = await repository.create(testInvoiceData);

      const voided = await repository.update(invoice.id, {
        status: InvoiceStatus.VOID,
      });

      expect(voided.status).toBe(InvoiceStatus.VOID);
    });
  });

  describe('unique constraint on invoiceNumber per tenant', () => {
    it('should allow same invoice number in different tenants', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Rainbow Kids',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `test${Date.now()}@rainbowkids.co.za`,
        },
      });

      const otherParent = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@family.co.za',
        },
      });

      const otherChild2 = await prisma.child.create({
        data: {
          tenantId: otherTenant.id,
          parentId: otherParent.id,
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: new Date('2021-01-01'),
        },
      });

      // Create invoice in first tenant
      await repository.create(testInvoiceData);

      // Should be able to create invoice with same number in other tenant
      const invoice2 = await repository.create({
        ...testInvoiceData,
        tenantId: otherTenant.id,
        parentId: otherParent.id,
        childId: otherChild2.id,
        invoiceNumber: 'INV-2025-001', // Same number, different tenant
      });

      expect(invoice2.invoiceNumber).toBe('INV-2025-001');
    });
  });
});
