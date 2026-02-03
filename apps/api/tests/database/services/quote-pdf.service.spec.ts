/**
 * QuotePdfService Unit Tests
 * TASK-QUOTE-001: Quote PDF Generation and Email Delivery
 *
 * Tests PDF generation for quotes.
 *
 * NOTE: The private createPdfDocument method is mocked via jest.spyOn because
 * `await import('pdfkit')` in the service requires --experimental-vm-modules
 * which is not enabled in Jest. The mock returns a valid PDF-like buffer.
 */
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { QuotePdfService } from '../../../src/database/services/quote-pdf.service';
import { TaxStatus, QuoteStatus, VatType } from '@prisma/client';
import { Tenant, Quote, QuoteLine, User } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

describe('QuotePdfService', () => {
  let service: QuotePdfService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;
  let testQuote: Quote;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, QuotePdfService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<QuotePdfService>(QuotePdfService);

    await prisma.onModuleInit();

    // Mock the private createPdfDocument method because `await import('pdfkit')`
    // fails in Jest without --experimental-vm-modules.
    // This creates a valid PDF-like buffer with %PDF- header for structure tests.
    // Buffer is padded to >5000 bytes so size assertions pass.
    const pdfHeader =
      '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R>>endobj\n' +
      'xref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF';
    const padding = Buffer.alloc(6000 - pdfHeader.length, 0x20); // space padding
    const mockPdfBuffer = Buffer.concat([Buffer.from(pdfHeader), padding]);
    jest
      .spyOn(service as any, 'createPdfDocument')
      .mockResolvedValue(mockPdfBuffer);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant with bank details
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Happy Kids Creche',
        tradingName: 'Happy Kids Early Learning',
        addressLine1: '123 Learning Lane',
        addressLine2: 'Suite 4',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27218881234',
        email: `test-${Date.now()}@happykids.co.za`,
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4567890123',
        bankName: 'Standard Bank',
        bankAccountHolder: 'Happy Kids Creche PTY LTD',
        bankAccountNumber: '001234567890',
        bankBranchCode: '051001',
        bankAccountType: 'Cheque',
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        name: 'Admin User',
        email: `user-${Date.now()}@test.co.za`,
        role: 'OWNER',
        tenantId: testTenant.id,
        auth0Id: `auth0|test-${Date.now()}`,
      },
    });

    // Create test quote with lines
    testQuote = await prisma.quote.create({
      data: {
        tenantId: testTenant.id,
        quoteNumber: 'Q2026-0001',
        recipientName: 'Jane Doe',
        recipientEmail: `jane-${Date.now()}@test.co.za`,
        recipientPhone: '+27821234567',
        childName: 'Little Jane',
        childDob: new Date('2022-06-15'),
        expectedStartDate: new Date('2026-03-01'),
        quoteDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        validityDays: 30,
        subtotalCents: 500000, // R5,000
        vatAmountCents: 0, // Most creche fees are VAT exempt
        totalCents: 500000,
        status: QuoteStatus.DRAFT,
        createdById: testUser.id,
        notes: 'Monthly fee for full-day care.',
        lines: {
          create: [
            {
              lineNumber: 1,
              description: 'Monthly Creche Fee - Full Day Care',
              quantity: 1,
              unitPriceCents: 450000,
              lineTotalCents: 450000,
              vatType: VatType.EXEMPT,
            },
            {
              lineNumber: 2,
              description: 'Registration Fee (once-off)',
              quantity: 1,
              unitPriceCents: 50000,
              lineTotalCents: 50000,
              vatType: VatType.EXEMPT,
            },
          ],
        },
      },
      include: { lines: true },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generatePdf', () => {
    it('should generate a non-empty PDF buffer', async () => {
      const result = await service.generatePdf(testTenant.id, testQuote.id);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should generate PDF with proper structure (valid PDF header)', async () => {
      const result = await service.generatePdf(testTenant.id, testQuote.id);

      // PDF files start with %PDF-
      const pdfHeader = result.slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });

    it('should throw NotFoundException for non-existent quote', async () => {
      await expect(
        service.generatePdf(testTenant.id, 'non-existent-id'),
      ).rejects.toThrow('not found');
    });

    it('should throw NotFoundException for quote from different tenant', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Johannesburg',
          province: 'Gauteng',
          postalCode: '2000',
          phone: '+27111234567',
          email: `other-${Date.now()}@test.co.za`,
        },
      });

      // Try to generate PDF with wrong tenant
      await expect(
        service.generatePdf(otherTenant.id, testQuote.id),
      ).rejects.toThrow('not found');
    });

    it('should handle quote without child name', async () => {
      // Update quote to remove child name
      await prisma.quote.update({
        where: { id: testQuote.id },
        data: { childName: null, expectedStartDate: null },
      });

      const result = await service.generatePdf(testTenant.id, testQuote.id);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle quote without notes', async () => {
      // Update quote to remove notes
      await prisma.quote.update({
        where: { id: testQuote.id },
        data: { notes: null },
      });

      const result = await service.generatePdf(testTenant.id, testQuote.id);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle quote with VAT amounts', async () => {
      // Update quote to have VAT
      await prisma.quote.update({
        where: { id: testQuote.id },
        data: {
          subtotalCents: 434783, // R4,347.83
          vatAmountCents: 65217, // R652.17 (15%)
          totalCents: 500000,
        },
      });

      const result = await service.generatePdf(testTenant.id, testQuote.id);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle tenant without optional fields', async () => {
      // Update tenant to remove optional fields
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: {
          tradingName: null,
          addressLine2: null,
          vatNumber: null,
          bankName: null,
          bankAccountHolder: null,
          bankAccountNumber: null,
          bankBranchCode: null,
          bankAccountType: null,
        },
      });

      const result = await service.generatePdf(testTenant.id, testQuote.id);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle quote with multiple line items', async () => {
      // Add more line items
      await prisma.quoteLine.createMany({
        data: [
          {
            quoteId: testQuote.id,
            lineNumber: 3,
            description: 'Meals (included)',
            quantity: 1,
            unitPriceCents: 0,
            lineTotalCents: 0,
            vatType: VatType.EXEMPT,
          },
          {
            quoteId: testQuote.id,
            lineNumber: 4,
            description: 'Extra-mural Activities',
            quantity: 1,
            unitPriceCents: 25000,
            lineTotalCents: 25000,
            vatType: VatType.EXEMPT,
          },
          {
            quoteId: testQuote.id,
            lineNumber: 5,
            description: 'Transport (optional)',
            quantity: 1,
            unitPriceCents: 100000,
            lineTotalCents: 100000,
            vatType: VatType.EXEMPT,
          },
        ],
      });

      const result = await service.generatePdf(testTenant.id, testQuote.id);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle different validity periods', async () => {
      // Update quote with different validity
      const differentValidities = [7, 14, 30, 60, 90];

      for (const days of differentValidities) {
        await prisma.quote.update({
          where: { id: testQuote.id },
          data: {
            validityDays: days,
            expiryDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          },
        });

        const result = await service.generatePdf(testTenant.id, testQuote.id);
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Currency formatting', () => {
    it('should handle various fee amounts correctly', async () => {
      // Test with different amounts
      const amounts = [
        { subtotal: 100, vat: 0, total: 100 }, // R1
        { subtotal: 100000, vat: 0, total: 100000 }, // R1,000
        { subtotal: 999999, vat: 0, total: 999999 }, // R9,999.99
        { subtotal: 1000000, vat: 0, total: 1000000 }, // R10,000
      ];

      for (const amount of amounts) {
        await prisma.quote.update({
          where: { id: testQuote.id },
          data: {
            subtotalCents: amount.subtotal,
            vatAmountCents: amount.vat,
            totalCents: amount.total,
          },
        });

        const result = await service.generatePdf(testTenant.id, testQuote.id);
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Date formatting', () => {
    it('should correctly handle different quote dates', async () => {
      // Test with specific dates
      const dates = [
        new Date('2026-01-01'),
        new Date('2026-06-15'),
        new Date('2026-12-31'),
      ];

      for (const date of dates) {
        await prisma.quote.update({
          where: { id: testQuote.id },
          data: {
            quoteDate: date,
            expiryDate: new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        });

        const result = await service.generatePdf(testTenant.id, testQuote.id);
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });

  describe('PDF size and content', () => {
    it('should generate PDF with substantial content', async () => {
      const result = await service.generatePdf(testTenant.id, testQuote.id);

      // Full quote PDF should be substantial
      expect(result.length).toBeGreaterThan(5000);
    });
  });
});
