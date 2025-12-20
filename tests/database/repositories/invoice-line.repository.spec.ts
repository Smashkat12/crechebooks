import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { CreateInvoiceLineDto } from '../../../src/database/dto/invoice-line.dto';
import { LineType } from '../../../src/database/entities/invoice-line.entity';
import { NotFoundException } from '../../../src/shared/exceptions';
import { Tenant, Parent, Child, Invoice } from '@prisma/client';

describe('InvoiceLineRepository', () => {
  let repository: InvoiceLineRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let testInvoice: Invoice;

  // Real test data - South African creche invoice line
  const testLineData: CreateInvoiceLineDto = {
    invoiceId: '', // Will be set in beforeEach
    description: 'Full Day Care - January 2025',
    quantity: 1,
    unitPriceCents: 450000, // R4,500.00
    discountCents: 0,
    subtotalCents: 450000,
    vatCents: 0, // VAT exempt for childcare
    totalCents: 450000,
    lineType: LineType.MONTHLY_FEE,
    accountCode: '4100',
    sortOrder: 0,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, InvoiceLineRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<InvoiceLineRepository>(InvoiceLineRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
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
        subtotalCents: 450000,
        vatCents: 0,
        totalCents: 450000,
      },
    });

    // Update test data with created invoice ID
    testLineData.invoiceId = testInvoice.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create an invoice line with all fields', async () => {
      const line = await repository.create(testLineData);

      expect(line.id).toBeDefined();
      expect(line.invoiceId).toBe(testInvoice.id);
      expect(line.description).toBe('Full Day Care - January 2025');
      expect(Number(line.quantity)).toBe(1);
      expect(line.unitPriceCents).toBe(450000);
      expect(line.discountCents).toBe(0);
      expect(line.subtotalCents).toBe(450000);
      expect(line.vatCents).toBe(0);
      expect(line.totalCents).toBe(450000);
      expect(line.lineType).toBe(LineType.MONTHLY_FEE);
      expect(line.accountCode).toBe('4100');
      expect(line.sortOrder).toBe(0);
      expect(line.createdAt).toBeInstanceOf(Date);
    });

    it('should create line with minimum required fields', async () => {
      const minimalData: CreateInvoiceLineDto = {
        invoiceId: testInvoice.id,
        description: 'Basic Line',
        unitPriceCents: 100000,
        subtotalCents: 100000,
        totalCents: 100000,
        lineType: LineType.EXTRA,
      };

      const line = await repository.create(minimalData);

      expect(line.id).toBeDefined();
      expect(Number(line.quantity)).toBe(1); // default
      expect(line.discountCents).toBe(0); // default
      expect(line.vatCents).toBe(0); // default
      expect(line.accountCode).toBeNull(); // default
      expect(line.sortOrder).toBe(0); // default
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      const invalidData: CreateInvoiceLineDto = {
        ...testLineData,
        invoiceId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle decimal quantities', async () => {
      const data: CreateInvoiceLineDto = {
        ...testLineData,
        quantity: 2.5, // 2.5 hours
        lineType: LineType.EXTRA,
      };

      const line = await repository.create(data);

      expect(Number(line.quantity)).toBeCloseTo(2.5, 2);
    });

    it('should handle all line types', async () => {
      // REGISTRATION
      const reg = await repository.create({
        ...testLineData,
        description: 'Registration Fee',
        lineType: LineType.REGISTRATION,
      });
      expect(reg.lineType).toBe(LineType.REGISTRATION);

      // EXTRA
      const extra = await repository.create({
        ...testLineData,
        description: 'Extra Hour',
        lineType: LineType.EXTRA,
      });
      expect(extra.lineType).toBe(LineType.EXTRA);

      // DISCOUNT
      const discount = await repository.create({
        ...testLineData,
        description: 'Sibling Discount',
        lineType: LineType.DISCOUNT,
        unitPriceCents: -45000, // Negative for discount
        subtotalCents: -45000,
        totalCents: -45000,
      });
      expect(discount.lineType).toBe(LineType.DISCOUNT);

      // CREDIT
      const credit = await repository.create({
        ...testLineData,
        description: 'Credit from previous month',
        lineType: LineType.CREDIT,
        unitPriceCents: -100000, // Negative for credit
        subtotalCents: -100000,
        totalCents: -100000,
      });
      expect(credit.lineType).toBe(LineType.CREDIT);
    });
  });

  describe('createMany', () => {
    it('should create multiple lines in a batch', async () => {
      const lines = [
        {
          description: 'Full Day Care - January 2025',
          unitPriceCents: 450000,
          subtotalCents: 450000,
          totalCents: 450000,
          lineType: LineType.MONTHLY_FEE,
        },
        {
          description: 'Registration Fee',
          unitPriceCents: 50000,
          subtotalCents: 50000,
          totalCents: 50000,
          lineType: LineType.REGISTRATION,
        },
        {
          description: 'Sibling Discount 10%',
          unitPriceCents: -45000,
          subtotalCents: -45000,
          totalCents: -45000,
          lineType: LineType.DISCOUNT,
        },
      ];

      const result = await repository.createMany(testInvoice.id, lines);

      expect(result.count).toBe(3);

      // Verify lines were created
      const createdLines = await repository.findByInvoice(testInvoice.id);
      expect(createdLines).toHaveLength(3);
    });

    it('should auto-assign sortOrder based on index', async () => {
      const lines = [
        {
          description: 'Line A',
          unitPriceCents: 100000,
          subtotalCents: 100000,
          totalCents: 100000,
          lineType: LineType.MONTHLY_FEE,
        },
        {
          description: 'Line B',
          unitPriceCents: 200000,
          subtotalCents: 200000,
          totalCents: 200000,
          lineType: LineType.EXTRA,
        },
      ];

      await repository.createMany(testInvoice.id, lines);

      const createdLines = await repository.findByInvoice(testInvoice.id);
      expect(createdLines[0].sortOrder).toBe(0);
      expect(createdLines[1].sortOrder).toBe(1);
    });

    it('should throw NotFoundException for non-existent invoice', async () => {
      const lines = [
        {
          description: 'Line A',
          unitPriceCents: 100000,
          subtotalCents: 100000,
          totalCents: 100000,
          lineType: LineType.MONTHLY_FEE,
        },
      ];

      await expect(
        repository.createMany('00000000-0000-0000-0000-000000000000', lines),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find line by id', async () => {
      const created = await repository.create(testLineData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.description).toBe(testLineData.description);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByInvoice', () => {
    it('should return all lines for an invoice ordered by sortOrder', async () => {
      // Create lines with explicit sortOrder
      await repository.create({
        ...testLineData,
        description: 'Line C',
        sortOrder: 2,
      });
      await repository.create({
        ...testLineData,
        description: 'Line A',
        sortOrder: 0,
      });
      await repository.create({
        ...testLineData,
        description: 'Line B',
        sortOrder: 1,
      });

      const lines = await repository.findByInvoice(testInvoice.id);

      expect(lines).toHaveLength(3);
      expect(lines[0].description).toBe('Line A');
      expect(lines[1].description).toBe('Line B');
      expect(lines[2].description).toBe('Line C');
    });

    it('should return empty array for invoice with no lines', async () => {
      const lines = await repository.findByInvoice(testInvoice.id);
      expect(lines).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update line fields', async () => {
      const created = await repository.create(testLineData);

      const updated = await repository.update(created.id, {
        description: 'Updated Description',
        unitPriceCents: 500000,
        discountCents: 50000,
        subtotalCents: 450000,
        totalCents: 450000,
      });

      expect(updated.description).toBe('Updated Description');
      expect(updated.unitPriceCents).toBe(500000);
      expect(updated.discountCents).toBe(50000);
      expect(updated.subtotalCents).toBe(450000);
      expect(updated.totalCents).toBe(450000);
      expect(updated.lineType).toBe(LineType.MONTHLY_FEE); // unchanged
    });

    it('should throw NotFoundException for non-existent line', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          description: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow changing line type', async () => {
      const created = await repository.create(testLineData);

      const updated = await repository.update(created.id, {
        lineType: LineType.EXTRA,
      });

      expect(updated.lineType).toBe(LineType.EXTRA);
    });

    it('should allow updating sortOrder', async () => {
      const created = await repository.create(testLineData);

      const updated = await repository.update(created.id, {
        sortOrder: 5,
      });

      expect(updated.sortOrder).toBe(5);
    });
  });

  describe('delete', () => {
    it('should delete existing line', async () => {
      const created = await repository.create(testLineData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent line', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteByInvoice', () => {
    it('should delete all lines for an invoice', async () => {
      await repository.create(testLineData);
      await repository.create({
        ...testLineData,
        description: 'Line 2',
      });
      await repository.create({
        ...testLineData,
        description: 'Line 3',
      });

      // Verify lines exist
      const linesBefore = await repository.findByInvoice(testInvoice.id);
      expect(linesBefore).toHaveLength(3);

      // Delete all lines
      const result = await repository.deleteByInvoice(testInvoice.id);

      expect(result.count).toBe(3);

      // Verify lines are deleted
      const linesAfter = await repository.findByInvoice(testInvoice.id);
      expect(linesAfter).toHaveLength(0);
    });

    it('should return 0 for invoice with no lines', async () => {
      const result = await repository.deleteByInvoice(testInvoice.id);
      expect(result.count).toBe(0);
    });
  });

  describe('reorderLines', () => {
    it('should reorder lines', async () => {
      const line1 = await repository.create({
        ...testLineData,
        description: 'Line A',
        sortOrder: 0,
      });
      const line2 = await repository.create({
        ...testLineData,
        description: 'Line B',
        sortOrder: 1,
      });
      const line3 = await repository.create({
        ...testLineData,
        description: 'Line C',
        sortOrder: 2,
      });

      // Reorder: C -> 0, A -> 1, B -> 2
      await repository.reorderLines([
        { id: line3.id, sortOrder: 0 },
        { id: line1.id, sortOrder: 1 },
        { id: line2.id, sortOrder: 2 },
      ]);

      const lines = await repository.findByInvoice(testInvoice.id);

      expect(lines[0].description).toBe('Line C');
      expect(lines[1].description).toBe('Line A');
      expect(lines[2].description).toBe('Line B');
    });

    it('should throw NotFoundException for non-existent line', async () => {
      await expect(
        repository.reorderLines([
          { id: '00000000-0000-0000-0000-000000000000', sortOrder: 0 },
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cascade delete from invoice', () => {
    it('should be deleted when invoice is deleted', async () => {
      const line = await repository.create(testLineData);

      // Verify line exists
      const lineBefore = await repository.findById(line.id);
      expect(lineBefore).not.toBeNull();

      // Delete invoice
      await prisma.invoice.delete({
        where: { id: testInvoice.id },
      });

      // Verify line is also deleted (cascade)
      const lineAfter = await repository.findById(line.id);
      expect(lineAfter).toBeNull();
    });

    it('should delete multiple lines when invoice is deleted', async () => {
      await repository.create(testLineData);
      await repository.create({
        ...testLineData,
        description: 'Line 2',
      });

      // Verify lines exist
      const linesBefore = await repository.findByInvoice(testInvoice.id);
      expect(linesBefore).toHaveLength(2);

      // Delete invoice
      await prisma.invoice.delete({
        where: { id: testInvoice.id },
      });

      // Both lines should be gone
      const allLines = await prisma.invoiceLine.findMany({});
      expect(allLines).toHaveLength(0);
    });
  });

  describe('financial calculations', () => {
    it('should handle VAT calculation correctly', async () => {
      // Create line with VAT (15%)
      const line = await repository.create({
        invoiceId: testInvoice.id,
        description: 'Item with VAT',
        quantity: 1,
        unitPriceCents: 100000, // R1,000.00 excl
        subtotalCents: 100000,
        vatCents: 15000, // R150.00 VAT
        totalCents: 115000, // R1,150.00 incl
        lineType: LineType.EXTRA,
      });

      expect(line.subtotalCents).toBe(100000);
      expect(line.vatCents).toBe(15000);
      expect(line.totalCents).toBe(115000);
    });

    it('should handle discount correctly', async () => {
      // Create line with discount
      const line = await repository.create({
        invoiceId: testInvoice.id,
        description: 'Sibling Discount',
        quantity: 1,
        unitPriceCents: 45000, // R450.00 discount
        discountCents: 0, // Not used for this type
        subtotalCents: -45000, // Negative subtotal for discount
        totalCents: -45000, // Negative total
        lineType: LineType.DISCOUNT,
      });

      expect(line.subtotalCents).toBe(-45000);
      expect(line.totalCents).toBe(-45000);
      expect(line.lineType).toBe(LineType.DISCOUNT);
    });

    it('should handle quantity calculations', async () => {
      // 2 hours at R50/hour
      const line = await repository.create({
        invoiceId: testInvoice.id,
        description: 'Extra Hours',
        quantity: 2,
        unitPriceCents: 5000, // R50.00 per hour
        subtotalCents: 10000, // 2 * R50.00 = R100.00
        totalCents: 10000,
        lineType: LineType.EXTRA,
      });

      expect(Number(line.quantity)).toBe(2);
      expect(line.unitPriceCents).toBe(5000);
      expect(line.subtotalCents).toBe(10000);
    });
  });

  describe('decimal precision', () => {
    it('should handle quantity with decimal precision', async () => {
      const line = await repository.create({
        ...testLineData,
        quantity: 1.75, // 1.75 hours
      });

      expect(Number(line.quantity)).toBeCloseTo(1.75, 2);
    });
  });
});
