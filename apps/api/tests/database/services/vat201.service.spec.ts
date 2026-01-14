/**
 * Vat201Service Integration Tests
 * TASK-SARS-014
 *
 * Tests VAT201 generation with real database
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { VatService } from '../../../src/database/services/vat.service';
import { Vat201Service } from '../../../src/database/services/vat201.service';
import {
  TaxStatus,
  InvoiceStatus,
  TransactionStatus,
  ImportSource,
  VatType,
  SubmissionStatus,
} from '@prisma/client';
import { Tenant } from '@prisma/client';

describe('Vat201Service', () => {
  let service: Vat201Service;
  let vatService: VatService;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, VatService, Vat201Service],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    vatService = module.get<VatService>(VatService);
    service = module.get<Vat201Service>(Vat201Service);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.sarsSubmission.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
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

    // Create VAT-registered test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'VAT201 Test Creche',
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789',
        addressLine1: '123 VAT Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `vat201-test-${Date.now()}@test.co.za`,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateVat201', () => {
    it('should generate VAT201 with output and input VAT', async () => {
      // Create parent and child for invoices
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

      // Create invoice (output VAT): R10,000 + R1,500 VAT = R11,500
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-001',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 1000000, // R10,000
          vatCents: 150000, // R1,500
          totalCents: 1150000, // R11,500
          status: InvoiceStatus.SENT,
        },
      });

      // Create expense transaction (input VAT): R5,500 inclusive
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Office Supplies',
          amountCents: 550000, // R5,500 inclusive
          isCredit: false,
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
          vatAmountCents: 71739, // R717.39 (R5500/1.15 * 0.15)
        },
      });

      // Generate VAT201
      const submission = await service.generateVat201({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(submission).toBeDefined();
      expect(submission.submissionType).toBe('VAT201');
      expect(submission.status).toBe(SubmissionStatus.DRAFT);
      expect(submission.outputVatCents).toBe(150000); // R1,500
      expect(submission.inputVatCents).toBe(71739); // R717.39
      // Net VAT = R1,500 - R717.39 = R782.61
      expect(submission.netVatCents).toBe(150000 - 71739);
    });

    it('should handle refund scenario (input > output)', async () => {
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

      // Small invoice (output VAT): R3,000 + R450 VAT
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-002',
          parentId: parent.id,
          childId: child.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-01-22'),
          subtotalCents: 300000,
          vatCents: 45000,
          totalCents: 345000,
          status: InvoiceStatus.SENT,
        },
      });

      // Large expense (input VAT): R8,000 inclusive
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Equipment Purchase',
          amountCents: 800000,
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
          confidenceScore: 95,
          source: 'AI_AUTO',
          vatType: VatType.STANDARD,
          vatAmountCents: 104348, // R8000/1.15 * 0.15
        },
      });

      const submission = await service.generateVat201({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      // Output VAT: R450, Input VAT: R1,043.48
      // Net: R450 - R1043.48 = -R593.48 (refund)
      expect(submission.netVatCents).toBeLessThan(0);

      const documentData = submission.documentData as any;
      expect(documentData.isRefundDue).toBe(true);
      expect(documentData.isDueToSars).toBe(false);
    });

    it('should throw error for non-VAT registered tenant', async () => {
      // Create non-VAT tenant
      const nonVatTenant = await prisma.tenant.create({
        data: {
          name: 'Non-VAT Creche',
          taxStatus: TaxStatus.NOT_REGISTERED,
          addressLine1: '456 Test Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `nonvat-${Date.now()}@test.co.za`,
        },
      });

      await expect(
        service.generateVat201({
          tenantId: nonVatTenant.id,
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
        }),
      ).rejects.toThrow('VAT201 generation requires VAT registration');
    });

    it('should throw error for tenant without VAT number', async () => {
      // Update tenant to remove VAT number
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: { vatNumber: null },
      });

      await expect(
        service.generateVat201({
          tenantId: testTenant.id,
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
        }),
      ).rejects.toThrow('VAT number is required');
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(
        service.generateVat201({
          tenantId: 'non-existent-id',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
        }),
      ).rejects.toThrow('not found');
    });

    it('should include flagged items in document', async () => {
      // Create large expense without VAT number (should be flagged)
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2025-01-15'),
          description: 'Large Equipment',
          amountCents: 600000, // R6,000 - above R5,000 threshold
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: TransactionStatus.PENDING,
        },
      });

      const submission = await service.generateVat201({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      const documentData = submission.documentData as any;
      expect(documentData.flaggedItems.length).toBeGreaterThan(0);
    });
  });

  describe('populateFields', () => {
    it('should populate all fields correctly', () => {
      const outputVat = {
        totalExcludingVatCents: 1000000,
        vatAmountCents: 150000,
        totalIncludingVatCents: 1150000,
        standardRatedCents: 1000000,
        zeroRatedCents: 0,
        exemptCents: 0,
        itemCount: 1,
      };

      const inputVat = {
        totalExcludingVatCents: 500000,
        vatAmountCents: 75000,
        totalIncludingVatCents: 575000,
        standardRatedCents: 500000,
        zeroRatedCents: 0,
        exemptCents: 0,
        itemCount: 1,
      };

      const fields = service.populateFields(outputVat, inputVat);

      expect(fields.field1OutputStandardCents).toBe(1000000);
      expect(fields.field4TotalOutputCents).toBe(150000);
      expect(fields.field5InputTaxCents).toBe(75000);
      expect(fields.field19TotalDueCents).toBe(75000); // 150000 - 75000
    });
  });

  describe('validateSubmission', () => {
    it('should pass validation for valid document', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        vatNumber: '4123456789',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        fields: {} as any,
        netVatCents: 100000,
        isDueToSars: true,
        isRefundDue: false,
        flaggedItems: [],
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for invalid VAT number', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        vatNumber: '12345', // Too short
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        fields: {} as any,
        netVatCents: 100000,
        isDueToSars: true,
        isRefundDue: false,
        flaggedItems: [],
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Invalid VAT number format (must be 10 digits)',
      );
    });

    it('should fail validation for invalid period', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        vatNumber: '4123456789',
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-01-31'), // Before start
        fields: {} as any,
        netVatCents: 100000,
        isDueToSars: true,
        isRefundDue: false,
        flaggedItems: [],
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Invalid period: start date must be before end date',
      );
    });

    it('should warn for large VAT amounts', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        vatNumber: '4123456789',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        fields: {} as any,
        netVatCents: 200000000, // R2,000,000
        isDueToSars: true,
        isRefundDue: false,
        flaggedItems: [],
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.warnings.some((w) => w.includes('R1,000,000'))).toBe(true);
    });
  });

  describe('calculateNetVat', () => {
    it('should calculate net VAT as output - input', () => {
      const fields = {
        field4TotalOutputCents: 150000,
        field5InputTaxCents: 50000,
      } as any;

      expect(service.calculateNetVat(fields)).toBe(100000);
    });

    it('should return negative for refund scenario', () => {
      const fields = {
        field4TotalOutputCents: 50000,
        field5InputTaxCents: 150000,
      } as any;

      expect(service.calculateNetVat(fields)).toBe(-100000);
    });
  });
});
