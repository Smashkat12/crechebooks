/**
 * VatService Integration Tests
 * TASK-SARS-011
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests actual VAT calculations with banker's rounding
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { VatService } from '../../../src/database/services/vat.service';
import {
  VatType,
  TransactionStatus,
  InvoiceStatus,
  ImportSource,
  TaxStatus,
  LineType,
} from '@prisma/client';
import { Tenant } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('VatService', () => {
  let service: VatService;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, VatService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<VatService>(VatService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create VAT-registered test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'VAT Test Creche',
        tradingName: 'VAT Test',
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789',
        addressLine1: '123 VAT Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `vat-test-${Date.now()}@test.co.za`,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('calculateOutputVat', () => {
    it('should calculate output VAT from invoices', async () => {
      // Create parent and child for invoice
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Parent',
          email: `parent-${Date.now()}@test.co.za`,
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Test',
          lastName: 'Child',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      // Create invoice: R1000 subtotal + R150 VAT = R1150 total
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-001',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 100000, // R1000
          vatCents: 15000, // R150 (15%)
          totalCents: 115000, // R1150
          status: InvoiceStatus.SENT,
        },
      });

      const result = await service.calculateOutputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.itemCount).toBe(1);
      expect(result.totalExcludingVatCents).toBe(100000);
      expect(result.vatAmountCents).toBe(15000);
      expect(result.totalIncludingVatCents).toBe(115000);
      expect(result.standardRatedCents).toBe(100000);
    });

    it('should exclude DRAFT and VOID invoices', async () => {
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Parent',
          email: `parent-${Date.now()}@test.co.za`,
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Test',
          lastName: 'Child',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      // Create DRAFT invoice (should be excluded)
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-DRAFT',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 50000,
          vatCents: 7500,
          totalCents: 57500,
          status: InvoiceStatus.DRAFT,
        },
      });

      // Create SENT invoice (should be included)
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-SENT',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 100000,
          vatCents: 15000,
          totalCents: 115000,
          status: InvoiceStatus.SENT,
        },
      });

      const result = await service.calculateOutputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.itemCount).toBe(1);
      expect(result.vatAmountCents).toBe(15000);
    });

    it('should filter by date range', async () => {
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Parent',
          email: `parent-${Date.now()}@test.co.za`,
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Test',
          lastName: 'Child',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      // Invoice in January
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-JAN',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 100000,
          vatCents: 15000,
          totalCents: 115000,
          status: InvoiceStatus.SENT,
        },
      });

      // Invoice in February (should be excluded)
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-FEB',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-02-01'),
          billingPeriodEnd: new Date('2025-02-28'),
          issueDate: new Date('2025-02-15'),
          dueDate: new Date('2025-02-22'),
          subtotalCents: 200000,
          vatCents: 30000,
          totalCents: 230000,
          status: InvoiceStatus.SENT,
        },
      });

      const result = await service.calculateOutputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.itemCount).toBe(1);
      expect(result.vatAmountCents).toBe(15000);
    });

    it('should throw error for invalid date range', async () => {
      await expect(
        service.calculateOutputVat(
          testTenant.id,
          new Date('2025-02-01'),
          new Date('2025-01-01'), // End before start
        ),
      ).rejects.toThrow('periodStart must be before periodEnd');
    });

    it('should throw error for missing tenantId', async () => {
      await expect(
        service.calculateOutputVat(
          '',
          new Date('2025-01-01'),
          new Date('2025-01-31'),
        ),
      ).rejects.toThrow('tenantId is required');
    });
  });

  describe('calculateInputVat', () => {
    it('should calculate input VAT from categorized transactions', async () => {
      // Create expense transaction with categorization
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Office Supplies',
          amountCents: 115000, // R1150 inclusive
          isCredit: false, // Expense
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: transaction.id,
          accountCode: '6100',
          accountName: 'Office Expenses',
          confidenceScore: 95,
          source: 'AI_AUTO',
          vatType: VatType.STANDARD,
          vatAmountCents: 15000, // R150 VAT
        },
      });

      const result = await service.calculateInputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.itemCount).toBe(1);
      expect(result.vatAmountCents).toBe(15000);
      expect(result.standardRatedCents).toBe(100000);
    });

    it('should extract VAT from inclusive amount when not specified', async () => {
      // Create expense transaction without explicit VAT amount
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Equipment Purchase',
          amountCents: 115000, // R1150 inclusive
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: transaction.id,
          accountCode: '7100',
          accountName: 'Equipment',
          confidenceScore: 90,
          source: 'AI_AUTO',
          vatType: VatType.STANDARD,
          // No vatAmountCents - should be extracted
        },
      });

      const result = await service.calculateInputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      // R115000 / 1.15 = R100000 exclusive
      // VAT = R115000 - R100000 = R15000
      expect(result.vatAmountCents).toBe(15000);
      expect(result.totalExcludingVatCents).toBe(100000);
    });

    it('should handle zero-rated transactions', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Export Goods',
          amountCents: 100000,
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: transaction.id,
          accountCode: '1200',
          accountName: 'Exports',
          confidenceScore: 95,
          source: 'AI_AUTO',
          vatType: VatType.ZERO_RATED,
          vatAmountCents: 0,
        },
      });

      const result = await service.calculateInputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.zeroRatedCents).toBe(100000);
      expect(result.vatAmountCents).toBe(0);
    });

    it('should handle exempt transactions', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Bank Charges',
          amountCents: 50000,
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: transaction.id,
          accountCode: '8100',
          accountName: 'Bank Charges',
          confidenceScore: 99,
          source: 'AI_AUTO',
          vatType: VatType.EXEMPT,
          vatAmountCents: 0,
        },
      });

      const result = await service.calculateInputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.exemptCents).toBe(50000);
      expect(result.vatAmountCents).toBe(0);
    });

    it('should only include expenses (isCredit = false)', async () => {
      // Create expense
      const expense = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Expense',
          amountCents: 115000,
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: expense.id,
          accountCode: '6100',
          accountName: 'Office Expenses',
          confidenceScore: 95,
          source: 'AI_AUTO',
          vatType: VatType.STANDARD,
          vatAmountCents: 15000,
        },
      });

      // Create income (should be excluded)
      const income = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-16'),
          description: 'Income',
          amountCents: 230000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.CATEGORIZED,
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: income.id,
          accountCode: '4000',
          accountName: 'Sales',
          confidenceScore: 95,
          source: 'AI_AUTO',
          vatType: VatType.STANDARD,
          vatAmountCents: 30000,
        },
      });

      const result = await service.calculateInputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.itemCount).toBe(1);
      expect(result.vatAmountCents).toBe(15000);
    });
  });

  describe('classifyVatType', () => {
    it('should classify zero-rated by account code', () => {
      const result = service.classifyVatType(
        '1200',
        'Some export item',
        '4123456789',
      );
      expect(result).toBe(VatType.ZERO_RATED);
    });

    it('should classify exempt by account code', () => {
      const result = service.classifyVatType('8100', 'Bank fees', '4123456789');
      expect(result).toBe(VatType.EXEMPT);
    });

    it('should classify as NO_VAT without supplier VAT number', () => {
      const result = service.classifyVatType('6100', 'Office supplies', '');
      expect(result).toBe(VatType.NO_VAT);
    });

    it('should classify as STANDARD with valid VAT number', () => {
      const result = service.classifyVatType(
        '6100',
        'Office supplies',
        '4123456789',
      );
      expect(result).toBe(VatType.STANDARD);
    });

    it('should detect zero-rated by keyword', () => {
      const result = service.classifyVatType(
        '9999',
        'Export to UK',
        '4123456789',
      );
      expect(result).toBe(VatType.ZERO_RATED);
    });

    it('should detect exempt by keyword', () => {
      const result = service.classifyVatType(
        '9999',
        'Bank charge monthly',
        '4123456789',
      );
      expect(result).toBe(VatType.EXEMPT);
    });
  });

  describe('validateVatDetails', () => {
    it('should error for expense > R5000 without VAT number', () => {
      const result = service.validateVatDetails({
        amountCents: 600000, // R6000
        isExpense: true,
        supplierVatNumber: '',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Supplier VAT number required for expenses exceeding R5,000',
      );
    });

    it('should pass for expense > R5000 with valid VAT number', () => {
      const result = service.validateVatDetails({
        amountCents: 600000, // R6000
        isExpense: true,
        supplierVatNumber: '4123456789',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn for expense > R2000 without supplier name', () => {
      const result = service.validateVatDetails({
        amountCents: 300000, // R3000
        isExpense: true,
        supplierName: '',
      });

      expect(result.warnings).toContain(
        'Supplier name recommended for expenses exceeding R2,000',
      );
    });

    it('should error for missing VAT on standard-rated invoice', () => {
      const result = service.validateVatDetails({
        amountCents: 100000,
        vatCents: 0,
        vatType: VatType.STANDARD,
        isExpense: false,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing VAT on standard-rated invoice');
    });

    it('should error for invalid VAT number format', () => {
      const result = service.validateVatDetails({
        amountCents: 100000,
        isExpense: true,
        supplierVatNumber: '12345', // Only 5 digits
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Invalid VAT number format (must be 10 digits)',
      );
    });
  });

  describe('getFlaggedItems', () => {
    it('should flag large expenses', async () => {
      // Create large expense
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Large Equipment Purchase',
          amountCents: 600000, // R6000 - above R5000 threshold
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.PENDING,
        },
      });

      const flagged = await service.getFlaggedItems(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(flagged.length).toBeGreaterThan(0);
      expect(flagged.some((f) => f.severity === 'ERROR')).toBe(true);
    });

    it('should flag invoices with mismatched totals', async () => {
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Parent',
          email: `parent-${Date.now()}@test.co.za`,
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Test',
          lastName: 'Child',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      // Create invoice with wrong total
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-WRONG',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 100000,
          vatCents: 15000,
          totalCents: 120000, // Wrong! Should be 115000
          status: InvoiceStatus.SENT,
        },
      });

      const flagged = await service.getFlaggedItems(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(
        flagged.some((f) => f.issue.includes('total does not equal')),
      ).toBe(true);
    });

    it('should warn about zero VAT invoices', async () => {
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Parent',
          email: `parent-${Date.now()}@test.co.za`,
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Test',
          lastName: 'Child',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      // Create invoice without VAT
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-NOVAT',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 100000,
          vatCents: 0,
          totalCents: 100000,
          status: InvoiceStatus.SENT,
        },
      });

      const flagged = await service.getFlaggedItems(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(
        flagged.some(
          (f) => f.severity === 'WARNING' && f.issue.includes('no VAT'),
        ),
      ).toBe(true);
    });
  });

  describe('VAT Calculation Accuracy', () => {
    it('should calculate exactly R150 VAT on R1000 exclusive', () => {
      const exclusive = new Decimal(100000); // R1000 in cents
      const vat = service.calculateVatFromExclusive(exclusive);

      expect(vat.toNumber()).toBe(15000); // R150 in cents
    });

    it("should apply banker's rounding correctly", () => {
      // R100.125 should round to R100.12 (round to even)
      const amount1 = new Decimal(10012.5);
      const rounded1 = amount1.round();
      expect(rounded1.toNumber()).toBe(10012); // Rounds down to even

      // R100.135 should round to R100.14 (round to even)
      const amount2 = new Decimal(10013.5);
      const rounded2 = amount2.round();
      expect(rounded2.toNumber()).toBe(10014); // Rounds up to even
    });

    it('should extract correct VAT from inclusive amount', () => {
      const inclusive = new Decimal(115000); // R1150 inclusive
      const vat = service.extractVatFromInclusive(inclusive);
      const exclusive = service.extractExclusiveFromInclusive(inclusive);

      // R1150 / 1.15 = R1000 exclusive
      expect(exclusive.toNumber()).toBe(100000);
      // VAT = R1150 - R1000 = R150
      expect(vat.toNumber()).toBe(15000);
    });

    it('should handle exact boundary amounts', () => {
      // Test R17712 (UIF cap) inclusive -> VAT extraction
      const inclusive = new Decimal(1771200); // R17712.00
      const exclusive = service.extractExclusiveFromInclusive(inclusive);
      const vat = service.extractVatFromInclusive(inclusive);

      // R17712 / 1.15 = R15401.73913...
      // Rounded = R15402 (154020 cents)
      expect(exclusive.toNumber()).toBe(1540174); // 15401.74 rounded
      expect(vat.toNumber()).toBe(231026); // Remainder
    });
  });

  describe('Tenant Isolation', () => {
    it('should not include invoices from other tenants', async () => {
      // Create second tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          taxStatus: TaxStatus.VAT_REGISTERED,
          vatNumber: '9876543210',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other-${Date.now()}@test.co.za`,
        },
      });

      // Create parent/child for each tenant
      const parent1 = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Parent',
          lastName: 'One',
          email: `parent1-${Date.now()}@test.co.za`,
        },
      });

      const child1 = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent1.id,
          firstName: 'Child',
          lastName: 'One',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      const parent2 = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Parent',
          lastName: 'Two',
          email: `parent2-${Date.now()}@test.co.za`,
        },
      });

      const child2 = await prisma.child.create({
        data: {
          tenantId: otherTenant.id,
          parentId: parent2.id,
          firstName: 'Child',
          lastName: 'Two',
          dateOfBirth: new Date('2020-01-01'),
        },
      });

      // Create invoice for test tenant
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-T1',
          parentId: parent1.id,
          childId: child1.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 100000,
          vatCents: 15000,
          totalCents: 115000,
          status: InvoiceStatus.SENT,
        },
      });

      // Create invoice for other tenant
      await prisma.invoice.create({
        data: {
          tenantId: otherTenant.id,
          invoiceNumber: 'INV-T2',
          parentId: parent2.id,
          childId: child2.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 200000,
          vatCents: 30000,
          totalCents: 230000,
          status: InvoiceStatus.SENT,
        },
      });

      // Query for test tenant only
      const result = await service.calculateOutputVat(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result.itemCount).toBe(1);
      expect(result.vatAmountCents).toBe(15000); // Only test tenant's invoice
    });
  });
});
