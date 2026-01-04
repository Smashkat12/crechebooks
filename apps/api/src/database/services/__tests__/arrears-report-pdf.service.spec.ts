/**
 * Arrears Report PDF Service Tests
 * TASK-PAY-017: Arrears Report PDF Export
 *
 * @description Tests for PDF generation of arrears reports with real database operations.
 * NO MOCK DATA - Uses actual database operations with test data.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ArrearsReportPdfService } from '../arrears-report-pdf.service';
import { ArrearsService } from '../arrears.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { PaymentRepository } from '../../repositories/payment.repository';
import { ParentRepository } from '../../repositories/parent.repository';
import { ChildRepository } from '../../repositories/child.repository';
import { NotFoundException } from '../../../shared/exceptions';

describe('ArrearsReportPdfService', () => {
  let service: ArrearsReportPdfService;
  let arrearsService: ArrearsService;
  let prisma: PrismaService;

  // Test data IDs
  let testTenantId: string;
  let testParentId: string;
  let testChildId: string;
  const testInvoiceIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [
        ArrearsReportPdfService,
        ArrearsService,
        PrismaService,
        TenantRepository,
        InvoiceRepository,
        PaymentRepository,
        ParentRepository,
        ChildRepository,
      ],
    }).compile();

    service = module.get<ArrearsReportPdfService>(ArrearsReportPdfService);
    arrearsService = module.get<ArrearsService>(ArrearsService);
    prisma = module.get<PrismaService>(PrismaService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  /**
   * Setup test data in database
   */
  async function setupTestData(): Promise<void> {
    const timestamp = Date.now();

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        id: `test-tenant-${timestamp}`,
        name: 'Test Creche Ltd',
        tradingName: 'Happy Kids Daycare',
        vatNumber: '4123456789',
        registrationNumber: '2023/123456/07',
        addressLine1: '123 Main Street',
        addressLine2: 'Suite 100',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2001',
        phone: '+27 11 123 4567',
        email: `test-arrears-${timestamp}@testcreche.co.za`,
        taxStatus: 'VAT_REGISTERED',
      },
    });
    testTenantId = tenant.id;

    // Create parent
    const parent = await prisma.parent.create({
      data: {
        tenantId: testTenantId,
        firstName: 'John',
        lastName: 'Debtor',
        email: `john.debtor-${timestamp}@example.com`,
        phone: '+27 82 123 4567',
        idNumber: '8001015009087',
        address: '456 Oak Avenue, Sandton, 2196',
        isActive: true,
      },
    });
    testParentId = parent.id;

    // Create child
    const child = await prisma.child.create({
      data: {
        tenantId: testTenantId,
        parentId: testParentId,
        firstName: 'Emma',
        lastName: 'Debtor',
        dateOfBirth: new Date('2020-03-15'),
        medicalNotes: 'None',
        isActive: true,
      },
    });
    testChildId = child.id;

    // Create overdue invoices
    const today = new Date();
    const overdueInvoices = [
      { daysOverdue: 5, totalCents: 150000, paidCents: 0 },
      { daysOverdue: 15, totalCents: 200000, paidCents: 50000 },
      { daysOverdue: 45, totalCents: 180000, paidCents: 0 },
      { daysOverdue: 75, totalCents: 250000, paidCents: 100000 },
    ];

    for (const [index, inv] of overdueInvoices.entries()) {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() - inv.daysOverdue);

      const issueDate = new Date(dueDate);
      issueDate.setDate(issueDate.getDate() - 7);

      const billingStart = new Date(issueDate);
      billingStart.setDate(1);

      const billingEnd = new Date(billingStart);
      billingEnd.setMonth(billingEnd.getMonth() + 1);
      billingEnd.setDate(0);

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenantId,
          parentId: testParentId,
          childId: testChildId,
          invoiceNumber: `INV-TEST-${timestamp}-${index}`,
          issueDate,
          dueDate,
          billingPeriodStart: billingStart,
          billingPeriodEnd: billingEnd,
          subtotalCents: Math.floor(inv.totalCents / 1.15),
          vatCents: inv.totalCents - Math.floor(inv.totalCents / 1.15),
          totalCents: inv.totalCents,
          amountPaidCents: inv.paidCents,
          status: inv.paidCents === 0 ? 'OVERDUE' : 'PARTIALLY_PAID',
          notes: null,
          isDeleted: false,
        },
      });

      testInvoiceIds.push(invoice.id);

      await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          description: `Monthly Fee - ${billingStart.toISOString().slice(0, 7)}`,
          quantity: 1,
          unitPriceCents: Math.floor(inv.totalCents / 1.15),
          discountCents: 0,
          subtotalCents: Math.floor(inv.totalCents / 1.15),
          vatCents: inv.totalCents - Math.floor(inv.totalCents / 1.15),
          totalCents: inv.totalCents,
          lineType: 'MONTHLY_FEE',
          sortOrder: 1,
        },
      });
    }
  }

  /**
   * Cleanup test data from database
   */
  async function cleanupTestData(): Promise<void> {
    try {
      if (testInvoiceIds.length > 0) {
        await prisma.invoiceLine.deleteMany({
          where: { invoiceId: { in: testInvoiceIds } },
        });
        await prisma.invoice.deleteMany({
          where: { id: { in: testInvoiceIds } },
        });
      }
      if (testChildId) {
        await prisma.child
          .delete({ where: { id: testChildId } })
          .catch(() => {});
      }
      if (testParentId) {
        await prisma.parent
          .delete({ where: { id: testParentId } })
          .catch(() => {});
      }
      if (testTenantId) {
        await prisma.tenant
          .delete({ where: { id: testTenantId } })
          .catch(() => {});
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  describe('PDF generation', () => {
    it('should generate a valid PDF buffer', async () => {
      const pdfBuffer = await service.generatePdf(testTenantId);

      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate PDF with correct magic bytes (%PDF)', async () => {
      const pdfBuffer = await service.generatePdf(testTenantId);

      // PDF files start with %PDF
      const header = pdfBuffer.slice(0, 4).toString('ascii');
      expect(header).toBe('%PDF');
    });

    it('should generate PDF with EOF marker', async () => {
      const pdfBuffer = await service.generatePdf(testTenantId);
      const content = pdfBuffer.toString('ascii');

      // PDF files end with %%EOF
      expect(content).toContain('%%EOF');
    });

    it('should generate PDF with filters applied', async () => {
      const filters = {
        minAmountCents: 100000, // R1,000 minimum
      };

      const pdfBuffer = await service.generatePdf(testTenantId, filters);

      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate PDF with top debtors section', async () => {
      const options = {
        includeTopDebtors: true,
        topDebtorsLimit: 5,
      };

      const pdfBuffer = await service.generatePdf(testTenantId, options);

      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate PDF with detailed invoice breakdown', async () => {
      const options = {
        includeDetailedInvoices: true,
      };

      const pdfBuffer = await service.generatePdf(testTenantId, options);

      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException for invalid tenant', async () => {
      await expect(service.generatePdf('invalid-tenant-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PDF structure', () => {
    it('should generate PDF with reasonable file size', async () => {
      const pdfBuffer = await service.generatePdf(testTenantId);

      // PDF should be at least 1KB and less than 5MB
      expect(pdfBuffer.length).toBeGreaterThan(1024);
      expect(pdfBuffer.length).toBeLessThan(5 * 1024 * 1024);
    });

    it('should include PDF version 1.3 or higher', async () => {
      const pdfBuffer = await service.generatePdf(testTenantId);
      const header = pdfBuffer.slice(0, 8).toString('ascii');

      // Check for PDF-1.X version
      expect(header).toMatch(/%PDF-1\.[3-9]/);
    });
  });

  describe('performance', () => {
    it('should generate PDF within 5 seconds', async () => {
      const startTime = Date.now();
      await service.generatePdf(testTenantId);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });

    it('should generate PDF with all options within 10 seconds', async () => {
      const options = {
        includeTopDebtors: true,
        topDebtorsLimit: 10,
        includeDetailedInvoices: true,
      };

      const startTime = Date.now();
      await service.generatePdf(testTenantId, options);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
    });
  });

  describe('empty data handling', () => {
    it('should handle tenant with no arrears gracefully', async () => {
      const timestamp = Date.now();

      // Create a tenant with no invoices
      const emptyTenant = await prisma.tenant.create({
        data: {
          id: `empty-tenant-${timestamp}`,
          name: 'Empty Tenant',
          tradingName: 'No Arrears',
          addressLine1: '789 Test St',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27 21 123 4567',
          email: `empty-${timestamp}@test.co.za`,
          taxStatus: 'NOT_REGISTERED',
        },
      });

      try {
        const pdfBuffer = await service.generatePdf(emptyTenant.id);

        expect(pdfBuffer).toBeDefined();
        expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
        expect(pdfBuffer.length).toBeGreaterThan(0);
      } finally {
        // Cleanup
        await prisma.tenant.delete({ where: { id: emptyTenant.id } });
      }
    });
  });
});
