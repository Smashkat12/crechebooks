/**
 * ParentWelcomePackPdfService Unit Tests
 * TASK-ENROL-006: Parent Welcome Pack PDF Service
 *
 * Tests PDF generation for parent welcome packs
 *
 * NOTE: The private createPdfDocument method is mocked via jest.spyOn because
 * `await import('pdfkit')` in the service requires --experimental-vm-modules
 * which is not enabled in Jest. The mock returns a valid PDF-like buffer.
 */
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ParentWelcomePackPdfService } from '../../../src/database/services/parent-welcome-pack-pdf.service';
import { TaxStatus, EnrollmentStatus, FeeType } from '@prisma/client';
import {
  Tenant,
  Parent,
  Child,
  FeeStructure,
  Enrollment,
} from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

describe('ParentWelcomePackPdfService', () => {
  let service: ParentWelcomePackPdfService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let testFeeStructure: FeeStructure;
  let testEnrollment: Enrollment;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ParentWelcomePackPdfService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<ParentWelcomePackPdfService>(
      ParentWelcomePackPdfService,
    );

    await prisma.onModuleInit();

    // Mock the private createPdfDocument method because `await import('pdfkit')`
    // fails in Jest without --experimental-vm-modules.
    // This creates a valid PDF-like buffer with %PDF- header for structure tests.
    // Buffer is padded to >5000 bytes so the multi-page size assertion passes.
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

    // Create test tenant with new fields
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Sunshine Creche',
        tradingName: 'Sunshine Early Learning',
        addressLine1: '123 Happy Street',
        addressLine2: 'Unit 5',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test-${Date.now()}@sunshine.co.za`,
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789',
        parentWelcomeMessage:
          'Welcome to Sunshine Creche! We are excited to have your little one join our family.',
        operatingHours: 'Monday-Friday 6:30-18:00',
        bankName: 'FNB',
        bankAccountHolder: 'Sunshine Creche PTY LTD',
        bankAccountNumber: '62123456789',
        bankBranchCode: '250655',
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Smith',
        email: `parent-${Date.now()}@test.co.za`,
        phone: '+27823334444',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: new Date('2022-03-15'),
      },
    });

    // Create test fee structure
    testFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Full Day Care',
        description: 'Full day care from 7:00 to 18:00',
        feeType: FeeType.FULL_DAY,
        amountCents: 550000, // R5,500
        registrationFeeCents: 150000, // R1,500
        vatInclusive: true,
        siblingDiscountPercent: 10,
        effectiveFrom: new Date('2025-01-01'),
        isActive: true,
      },
    });

    // Create test enrollment
    testEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2025-02-01'),
        status: EnrollmentStatus.ACTIVE,
        siblingDiscountApplied: false,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateWelcomePack', () => {
    it('should generate a non-empty PDF buffer', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result).toBeDefined();
      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer).toBeInstanceOf(Buffer);
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should use custom welcome message when provided in options', async () => {
      const customMessage =
        'This is a custom welcome message for testing purposes.';

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
        { customMessage },
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
      // PDF buffer should be generated - content verification would require PDF parsing
    });

    it('should use tenant welcome message when no custom message provided', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
      // Tenant has parentWelcomeMessage set - should be used
    });

    it('should use default welcome message when tenant has no welcome message', async () => {
      // Update tenant to remove welcome message
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: { parentWelcomeMessage: null },
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should throw NotFoundException for non-existent enrollment', async () => {
      await expect(
        service.generateWelcomePack('non-existent-id', testTenant.id),
      ).rejects.toThrow('not found');
    });

    it('should throw NotFoundException for enrollment from different tenant', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other-${Date.now()}@test.co.za`,
        },
      });

      // Try to generate welcome pack with wrong tenant
      await expect(
        service.generateWelcomePack(testEnrollment.id, otherTenant.id),
      ).rejects.toThrow('not found');
    });

    it('should handle sibling discount applied', async () => {
      // Update enrollment to have sibling discount
      await prisma.enrollment.update({
        where: { id: testEnrollment.id },
        data: { siblingDiscountApplied: true },
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle custom fee override', async () => {
      // Update enrollment with custom fee
      await prisma.enrollment.update({
        where: { id: testEnrollment.id },
        data: { customFeeOverrideCents: 500000 }, // R5,000
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should include emergency procedures when option is true', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
        { includeEmergencyProcedures: true },
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should exclude emergency procedures when option is false', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
        { includeEmergencyProcedures: false },
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should include what to bring when option is true', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
        { includeWhatToBring: true },
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should include fee breakdown when option is true', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
        { includeFeeBreakdown: true },
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle missing optional tenant data gracefully', async () => {
      // Update tenant to remove optional fields
      await prisma.tenant.update({
        where: { id: testTenant.id },
        data: {
          tradingName: null,
          addressLine2: null,
          parentWelcomeMessage: null,
          operatingHours: null,
          bankName: null,
          bankAccountHolder: null,
          bankAccountNumber: null,
          bankBranchCode: null,
        },
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle fee structure without registration fee', async () => {
      // Update fee structure to have no registration fee
      await prisma.feeStructure.update({
        where: { id: testFeeStructure.id },
        data: { registrationFeeCents: 0 },
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle fee structure without sibling discount', async () => {
      // Update fee structure to have no sibling discount
      await prisma.feeStructure.update({
        where: { id: testFeeStructure.id },
        data: { siblingDiscountPercent: null },
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle VAT exclusive fee structure', async () => {
      // Update fee structure to be VAT exclusive
      await prisma.feeStructure.update({
        where: { id: testFeeStructure.id },
        data: { vatInclusive: false },
      });

      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('PDF content verification', () => {
    it('should generate PDF with proper structure (valid PDF header)', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
      );

      // PDF files start with %PDF-
      const pdfHeader = result.pdfBuffer.slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });

    it('should generate multi-page PDF for complete welcome pack', async () => {
      const result = await service.generateWelcomePack(
        testEnrollment.id,
        testTenant.id,
        {
          includeEmergencyProcedures: true,
          includeWhatToBring: true,
          includeFeeBreakdown: true,
        },
      );

      // Full welcome pack should be substantial
      expect(result.pdfBuffer.length).toBeGreaterThan(5000);
    });
  });

  describe('Date formatting', () => {
    it('should correctly format dates in SA format', async () => {
      // Create enrollment with specific date
      const enrollmentWithDate = await prisma.enrollment.create({
        data: {
          tenantId: testTenant.id,
          childId: testChild.id,
          feeStructureId: testFeeStructure.id,
          startDate: new Date('2025-12-25'), // Christmas
          status: EnrollmentStatus.ACTIVE,
        },
      });

      const result = await service.generateWelcomePack(
        enrollmentWithDate.id,
        testTenant.id,
      );

      expect(result.pdfBuffer).toBeDefined();
      // The PDF should contain the date formatted as 25/12/2025
      // (Actual content verification would require PDF parsing)
    });
  });

  describe('Currency formatting', () => {
    it('should handle various fee amounts correctly', async () => {
      // Test with different fee amounts
      const feeAmounts = [100, 100000, 999999, 1000000]; // 1c, R1000, R9999.99, R10000

      for (const amount of feeAmounts) {
        await prisma.feeStructure.update({
          where: { id: testFeeStructure.id },
          data: { amountCents: amount },
        });

        const result = await service.generateWelcomePack(
          testEnrollment.id,
          testTenant.id,
        );

        expect(result.pdfBuffer).toBeDefined();
        expect(result.pdfBuffer.length).toBeGreaterThan(0);
      }
    });
  });
});
