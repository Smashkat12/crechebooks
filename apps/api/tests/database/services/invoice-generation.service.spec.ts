/**
 * InvoiceGenerationService Integration Tests
 * TASK-BILL-012: Invoice Generation Service
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests invoice generation, VAT calculation, sibling discounts
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceGenerationService } from '../../../src/database/services/invoice-generation.service';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { ProRataService } from '../../../src/database/services/pro-rata.service';
import { CreditBalanceService } from '../../../src/database/services/credit-balance.service';
import { CreditNoteService } from '../../../src/database/services/credit-note.service';
import { InvoiceNumberService } from '../../../src/database/services/invoice-number.service';

/**
 * Mock XeroSyncService for tests
 * NOTE: This is a SERVICE mock for external API integration, not a DATA mock.
 * The Xero API requires real credentials which are not available in tests.
 * Invoice generation tests focus on the core logic, not Xero integration.
 */
const mockXeroSyncService = {
  createInvoiceDraft: async (): Promise<string | null> => null,
  syncTransactions: async () => ({
    totalProcessed: 0,
    synced: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }),
  pushToXero: async () => false,
  pullFromXero: async () => ({
    transactionsPulled: 0,
    duplicatesSkipped: 0,
    errors: [],
  }),
  syncChartOfAccounts: async () => ({
    accountsFetched: 0,
    newAccounts: [],
    errors: [],
  }),
  hasValidConnection: async () => false,
  mapVatToXeroTax: () => 'NONE',
  mapXeroTaxToVat: () => 'NO_VAT',
};
import {
  NotFoundException,
  ValidationException,
} from '../../../src/shared/exceptions';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';
import { LineType } from '../../../src/database/entities/invoice-line.entity';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';
import { FeeType } from '../../../src/database/entities/fee-structure.entity';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';
import { Decimal } from 'decimal.js';
import {
  Tenant,
  User,
  Parent,
  Child,
  FeeStructure,
  Enrollment,
} from '@prisma/client';
import { WelcomePackDeliveryService } from '../../../src/database/services/welcome-pack-delivery.service';
import { cleanDatabase } from '../../helpers/clean-database';

describe('InvoiceGenerationService', () => {
  let service: InvoiceGenerationService;
  let enrollmentService: EnrollmentService;
  let prisma: PrismaService;
  let invoiceRepo: InvoiceRepository;
  let invoiceLineRepo: InvoiceLineRepository;
  let tenantRepo: TenantRepository;

  // Test data
  let testTenant: Tenant;
  let testTenantVatRegistered: Tenant;
  let testUser: User;
  let testParent: Parent;
  let testParent2: Parent;
  let testChild1: Child;
  let testChild2: Child;
  let testChild3: Child;
  let testChild4: Child; // For parent2
  let testFeeStructure: FeeStructure;
  let testFeeStructure2: FeeStructure;
  let testEnrollment1: Enrollment;
  let testEnrollment2: Enrollment;
  let testEnrollment3: Enrollment;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        InvoiceGenerationService,
        InvoiceNumberService, // TASK-BILL-003: Required for atomic invoice number generation
        EnrollmentService,
        InvoiceRepository,
        InvoiceLineRepository,
        EnrollmentRepository,
        ChildRepository,
        FeeStructureRepository,
        ParentRepository,
        TenantRepository,
        AuditLogService,
        ProRataService,
        CreditBalanceService,
        CreditNoteService,
        // Mock XeroSyncService because it requires external Xero API credentials
        // This is a SERVICE mock for external integration, not a DATA mock
        { provide: XeroSyncService, useValue: mockXeroSyncService },
        { provide: WelcomePackDeliveryService, useValue: { deliverWelcomePack: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<InvoiceGenerationService>(InvoiceGenerationService);
    enrollmentService = module.get<EnrollmentService>(EnrollmentService);
    prisma = module.get<PrismaService>(PrismaService);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);
    invoiceLineRepo = module.get<InvoiceLineRepository>(InvoiceLineRepository);
    tenantRepo = module.get<TenantRepository>(TenantRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    const timestamp = Date.now();

    // Create test tenant (NOT VAT registered)
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Invoice Test Creche',
        addressLine1: '123 Invoice Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `invoice${timestamp}@test.co.za`,
        taxStatus: TaxStatus.NOT_REGISTERED,
        invoiceDayOfMonth: 1,
        invoiceDueDays: 7,
      },
    });

    // Create VAT registered tenant
    testTenantVatRegistered = await prisma.tenant.create({
      data: {
        name: 'VAT Registered Creche',
        addressLine1: '456 VAT Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27215559999',
        email: `vat${timestamp}@test.co.za`,
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4560000123',
        invoiceDayOfMonth: 15,
        invoiceDueDays: 14,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: `user${timestamp}@test.com`,
        auth0Id: `auth0|invoice${timestamp}`,
        name: 'Invoice Admin',
        role: 'ADMIN',
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Invoice',
        lastName: 'Parent',
        email: `parent${timestamp}@test.com`,
        phone: '0821234567',
        idNumber: '8501015800086',
      },
    });

    // Create second parent (for single child scenarios)
    testParent2 = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Second',
        lastName: 'Parent',
        email: `parent2${timestamp}@test.com`,
        phone: '0829999999',
        idNumber: '9001015800087',
      },
    });

    // Create 3 children for testParent (sibling discount scenarios)
    testChild1 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'First',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-15'),
      },
    });

    testChild2 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Second',
        lastName: 'Child',
        dateOfBirth: new Date('2021-03-20'),
      },
    });

    testChild3 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Third',
        lastName: 'Child',
        dateOfBirth: new Date('2022-06-10'),
      },
    });

    // Create child for parent2 (single child, no sibling discount)
    testChild4 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent2.id,
        firstName: 'Only',
        lastName: 'Child',
        dateOfBirth: new Date('2021-05-05'),
      },
    });

    // Create fee structures
    testFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Full Day Care',
        description: 'Standard full day care',
        feeType: FeeType.FULL_DAY,
        amountCents: 500000, // R5000
        effectiveFrom: new Date('2024-01-01'),
      },
    });

    testFeeStructure2 = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Half Day Care',
        description: 'Half day care',
        feeType: FeeType.HALF_DAY,
        amountCents: 300000, // R3000
        effectiveFrom: new Date('2024-01-01'),
      },
    });

    // Create enrollments (with staggered start dates for sibling discount ordering)
    testEnrollment1 = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild1.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2024-01-01'), // First enrolled
        status: EnrollmentStatus.ACTIVE,
      },
    });

    testEnrollment2 = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild2.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2024-02-01'), // Second enrolled
        status: EnrollmentStatus.ACTIVE,
      },
    });

    testEnrollment3 = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild3.id,
        feeStructureId: testFeeStructure2.id,
        startDate: new Date('2024-03-01'), // Third enrolled
        status: EnrollmentStatus.ACTIVE,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('calculateVAT', () => {
    it('should calculate 15% VAT correctly', () => {
      // R100 = 10000 cents -> VAT = 1500 cents
      expect(service.calculateVAT(10000)).toBe(1500);
    });

    it("should use banker's rounding (ROUND_HALF_EVEN) for VAT", () => {
      // R125.00 = 12500 cents -> VAT = 1875 cents (exact)
      expect(service.calculateVAT(12500)).toBe(1875);

      // R125.05 = 12505 cents -> VAT = 1875.75 -> rounds to 1876 (banker's)
      expect(service.calculateVAT(12505)).toBe(1876);

      // Test edge case: 5 rounds to even
      // R33.33 = 3333 cents -> VAT = 499.95 -> rounds to 500 (even)
      expect(service.calculateVAT(3333)).toBe(500);
    });

    it('should return 0 for 0 amount', () => {
      expect(service.calculateVAT(0)).toBe(0);
    });
  });

  describe('generateInvoiceNumber', () => {
    it('should generate first invoice number for year', async () => {
      const invoiceNumber = await service.generateInvoiceNumber(
        testTenant.id,
        2025,
      );
      expect(invoiceNumber).toBe('INV-2025-001');
    });

    it('should increment invoice number sequentially', async () => {
      // TASK-BILL-003: Use atomic counter service - generate first number
      const firstNumber = await service.generateInvoiceNumber(
        testTenant.id,
        2025,
      );
      expect(firstNumber).toBe('INV-2025-001');

      // Generate second number - should increment
      const secondNumber = await service.generateInvoiceNumber(
        testTenant.id,
        2025,
      );
      expect(secondNumber).toBe('INV-2025-002');
    });

    it('should reset numbering for new year', async () => {
      // Create invoice for 2024
      await invoiceRepo.create({
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2024-999',
        parentId: testParent.id,
        childId: testChild1.id,
        billingPeriodStart: new Date('2024-12-01'),
        billingPeriodEnd: new Date('2024-12-31'),
        issueDate: new Date('2024-12-01'),
        dueDate: new Date('2024-12-08'),
        subtotalCents: 500000,
        totalCents: 500000,
      });

      // New year should start at 001
      const invoiceNumber = await service.generateInvoiceNumber(
        testTenant.id,
        2025,
      );
      expect(invoiceNumber).toBe('INV-2025-001');
    });

    it('should handle invoice numbers with different tenants independently', async () => {
      // Create invoice for first tenant
      await invoiceRepo.create({
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2025-005',
        parentId: testParent.id,
        childId: testChild1.id,
        billingPeriodStart: new Date('2025-01-01'),
        billingPeriodEnd: new Date('2025-01-31'),
        issueDate: new Date('2025-01-01'),
        dueDate: new Date('2025-01-08'),
        subtotalCents: 500000,
        totalCents: 500000,
      });

      // Second tenant should start at 001
      const invoiceNumber = await service.generateInvoiceNumber(
        testTenantVatRegistered.id,
        2025,
      );
      expect(invoiceNumber).toBe('INV-2025-001');
    });
  });

  describe('generateMonthlyInvoices', () => {
    it('should throw ValidationException for invalid billing month format', async () => {
      await expect(
        service.generateMonthlyInvoices(
          testTenant.id,
          '2025/01', // Wrong format
          testUser.id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException for invalid month number', async () => {
      await expect(
        service.generateMonthlyInvoices(
          testTenant.id,
          '2025-13', // Invalid month
          testUser.id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        service.generateMonthlyInvoices(
          '00000000-0000-0000-0000-000000000000',
          '2025-01',
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty result when no active enrollments', async () => {
      // Delete all enrollments
      await prisma.enrollment.deleteMany({
        where: { tenantId: testTenant.id },
      });

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        '2025-01',
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(0);
      expect(result.invoices).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should generate invoices for all active enrollments', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(3);
      expect(result.invoices).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify invoice numbers
      const invoiceNumbers = result.invoices.map((i) => i.invoiceNumber);
      expect(invoiceNumbers).toContain(`INV-${currentYear}-001`);
      expect(invoiceNumbers).toContain(`INV-${currentYear}-002`);
      expect(invoiceNumbers).toContain(`INV-${currentYear}-003`);
    });

    it('should filter by childIds when provided', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
        [testChild1.id, testChild2.id], // Only first 2 children
      );

      expect(result.invoicesCreated).toBe(2);
      expect(result.invoices).toHaveLength(2);

      const childIds = result.invoices.map((i) => i.childId);
      expect(childIds).toContain(testChild1.id);
      expect(childIds).toContain(testChild2.id);
      expect(childIds).not.toContain(testChild3.id);
    });

    it('should prevent duplicate invoices for same billing period', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      // Generate first batch
      await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      // Try to generate again for same month
      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(0);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0].code).toBe('DUPLICATE_INVOICE');
    });

    it('should apply sibling discounts correctly for 3 children', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(3);

      // Find invoices in order
      const invoice1 = result.invoices.find((i) => i.childId === testChild1.id);
      const invoice2 = result.invoices.find((i) => i.childId === testChild2.id);
      const invoice3 = result.invoices.find((i) => i.childId === testChild3.id);

      expect(invoice1).toBeDefined();
      expect(invoice2).toBeDefined();
      expect(invoice3).toBeDefined();

      // Get invoice lines to verify discounts
      const lines1 = await invoiceLineRepo.findByInvoice(invoice1!.id);
      const lines2 = await invoiceLineRepo.findByInvoice(invoice2!.id);
      const lines3 = await invoiceLineRepo.findByInvoice(invoice3!.id);

      // First child: No discount (500000 cents)
      expect(lines1).toHaveLength(1);
      expect(lines1[0].subtotalCents).toBe(500000);

      // Second child: 10% discount on R5000 = R500 discount
      // Fee line + discount line
      expect(lines2).toHaveLength(2);
      expect(lines2[0].subtotalCents).toBe(500000); // Full fee
      expect(lines2[1].subtotalCents).toBe(-50000); // Discount (10% of 500000)
      expect(lines2[1].lineType).toBe(LineType.DISCOUNT);

      // Third child: 15% discount on R3000 = R450 discount
      expect(lines3).toHaveLength(2);
      expect(lines3[0].subtotalCents).toBe(300000); // Full fee (half day)
      expect(lines3[1].subtotalCents).toBe(-45000); // Discount (15% of 300000)
    });

    it('should NOT calculate VAT for non-VAT-registered tenant', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(3);

      // Check all invoices have 0 VAT
      for (const invoiceInfo of result.invoices) {
        const invoice = await invoiceRepo.findByIdWithLines(
          invoiceInfo.id,
          testTenant.id,
        );
        expect(invoice).toBeDefined();
        expect(invoice!.vatCents).toBe(0);

        for (const line of invoice!.lines) {
          expect(line.vatCents).toBe(0);
        }
      }
    });

    it('should set correct billing period dates', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      const invoice = await invoiceRepo.findById(
        result.invoices[0].id,
        testTenant.id,
      );
      expect(invoice).toBeDefined();

      // June billing period
      // Verify start is beginning of month and end is end of month
      const start = invoice!.billingPeriodStart;
      const end = invoice!.billingPeriodEnd;

      // Billing period dates should be set (regardless of timezone)
      expect(start.getFullYear()).toBe(currentYear);
      expect(end.getFullYear()).toBe(currentYear);

      // End date should be after start date
      expect(end.getTime()).toBeGreaterThan(start.getTime());

      // End date should be approximately 29-30 days after start
      const diffDays = Math.round(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBeGreaterThanOrEqual(28);
      expect(diffDays).toBeLessThanOrEqual(30);
    });

    it('should set status to DRAFT for all invoices', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      for (const invoiceInfo of result.invoices) {
        expect(invoiceInfo.status).toBe(InvoiceStatus.DRAFT);
      }
    });

    it('should use tenant invoice due days setting', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      const invoice = await invoiceRepo.findById(
        result.invoices[0].id,
        testTenant.id,
      );
      expect(invoice).toBeDefined();

      // Due date should be issue date + 7 days (testTenant.invoiceDueDays)
      const issueDate = new Date(invoice!.issueDate);
      const dueDate = new Date(invoice!.dueDate);
      const diffDays = Math.round(
        (dueDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(7);
    });

    it('should create audit log entries for generated invoices', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      // Check for batch audit log
      const batchLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenant.id,
          entityType: 'InvoiceBatch',
          entityId: billingMonth,
        },
      });
      expect(batchLog).toBeDefined();
      expect(batchLog!.action).toBe('CREATE');

      // Check for individual invoice audit logs
      const invoiceLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Invoice',
        },
      });
      expect(invoiceLogs.length).toBe(3);
    });
  });

  describe('VAT Registered Tenant', () => {
    let vatParent: Parent;
    let vatChild: Child;
    let vatFeeStructure: FeeStructure;

    beforeEach(async () => {
      // Create parent, child, fee structure and enrollment for VAT tenant
      vatParent = await prisma.parent.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          firstName: 'VAT',
          lastName: 'Parent',
          email: `vatparent${Date.now()}@test.com`,
          phone: '0821111111',
        },
      });

      vatChild = await prisma.child.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          parentId: vatParent.id,
          firstName: 'VAT',
          lastName: 'Child',
          dateOfBirth: new Date('2021-01-01'),
        },
      });

      vatFeeStructure = await prisma.feeStructure.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          name: 'VAT Full Day',
          feeType: FeeType.FULL_DAY,
          amountCents: 500000, // R5000 excl VAT
          effectiveFrom: new Date('2024-01-01'),
        },
      });

      await prisma.enrollment.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          childId: vatChild.id,
          feeStructureId: vatFeeStructure.id,
          startDate: new Date('2024-01-01'),
          status: EnrollmentStatus.ACTIVE,
        },
      });

      // Create user for VAT tenant
      await prisma.user.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          email: `vatuser${Date.now()}@test.com`,
          auth0Id: `auth0|vat${Date.now()}`,
          name: 'VAT Admin',
          role: 'ADMIN',
        },
      });
    });

    it('should calculate VAT for VAT-registered tenant', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenantVatRegistered.id,
        billingMonth,
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(1);

      const invoice = await invoiceRepo.findByIdWithLines(
        result.invoices[0].id,
        testTenantVatRegistered.id,
      );
      expect(invoice).toBeDefined();

      // Monthly fee line type (MONTHLY_FEE) is VAT EXEMPT for educational services
      // So NO VAT is charged on R5000 tuition fee
      // Per isVatApplicable() in invoice-line.entity.ts
      expect(invoice!.subtotalCents).toBe(500000);
      expect(invoice!.vatCents).toBe(0); // No VAT on educational services
      expect(invoice!.totalCents).toBe(500000);

      // Line item should NOT have VAT (educational service exemption)
      expect(invoice!.lines[0].subtotalCents).toBe(500000);
      expect(invoice!.lines[0].vatCents).toBe(0);
      expect(invoice!.lines[0].totalCents).toBe(500000);
    });

    it('should NOT calculate VAT on discount lines', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      // Add second child for sibling discount
      const vatChild2 = await prisma.child.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          parentId: vatParent.id,
          firstName: 'VAT',
          lastName: 'Sibling',
          dateOfBirth: new Date('2022-01-01'),
        },
      });

      await prisma.enrollment.create({
        data: {
          tenantId: testTenantVatRegistered.id,
          childId: vatChild2.id,
          feeStructureId: vatFeeStructure.id,
          startDate: new Date('2024-06-01'), // Later start = second child
          status: EnrollmentStatus.ACTIVE,
        },
      });

      const result = await service.generateMonthlyInvoices(
        testTenantVatRegistered.id,
        billingMonth,
        testUser.id,
      );

      expect(result.invoicesCreated).toBe(2);

      // Find second child's invoice
      const invoice2 = result.invoices.find((i) => i.childId === vatChild2.id);
      expect(invoice2).toBeDefined();

      const invoice = await invoiceRepo.findByIdWithLines(
        invoice2!.id,
        testTenantVatRegistered.id,
      );
      expect(invoice).toBeDefined();
      expect(invoice!.lines).toHaveLength(2);

      // Fee line does NOT have VAT (MONTHLY_FEE is VAT exempt for educational services)
      const feeLine = invoice!.lines.find(
        (l) => String(l.lineType) === String(LineType.MONTHLY_FEE),
      );
      expect(feeLine!.vatCents).toBe(0); // Educational services are VAT exempt

      // Discount line also has NO VAT (discounts never have VAT)
      const discountLine = invoice!.lines.find(
        (l) => String(l.lineType) === String(LineType.DISCOUNT),
      );
      expect(discountLine!.vatCents).toBe(0);
    });
  });

  describe('Single Child (No Sibling Discount)', () => {
    it('should generate invoice without sibling discount for single child', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      // Create enrollment for child4 (only child of parent2)
      await prisma.enrollment.create({
        data: {
          tenantId: testTenant.id,
          childId: testChild4.id,
          feeStructureId: testFeeStructure.id,
          startDate: new Date('2024-01-01'),
          status: EnrollmentStatus.ACTIVE,
        },
      });

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
        [testChild4.id], // Only this child
      );

      expect(result.invoicesCreated).toBe(1);

      const invoice = await invoiceRepo.findByIdWithLines(
        result.invoices[0].id,
        testTenant.id,
      );
      expect(invoice).toBeDefined();

      // Only one line (no discount)
      expect(invoice!.lines).toHaveLength(1);
      expect(invoice!.lines[0].lineType).toBe(LineType.MONTHLY_FEE);
      expect(invoice!.lines[0].subtotalCents).toBe(500000);
      expect(invoice!.totalCents).toBe(500000);
    });
  });

  describe('Custom Fee Override', () => {
    it('should use custom fee override when set on enrollment', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      // Update enrollment with custom fee
      await prisma.enrollment.update({
        where: { id: testEnrollment1.id },
        data: { customFeeOverrideCents: 450000 }, // R4500 custom rate
      });

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
        [testChild1.id],
      );

      expect(result.invoicesCreated).toBe(1);

      const invoice = await invoiceRepo.findByIdWithLines(
        result.invoices[0].id,
        testTenant.id,
      );
      expect(invoice).toBeDefined();
      expect(invoice!.lines[0].unitPriceCents).toBe(450000);
      expect(invoice!.subtotalCents).toBe(450000);
    });
  });

  describe('buildXeroLineItems', () => {
    it('should format invoice lines for Xero', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      // Generate an invoice first
      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
        [testChild1.id],
      );

      const xeroLines = await service.buildXeroLineItems(result.invoices[0].id);

      expect(xeroLines).toHaveLength(1);
      expect(xeroLines[0].description).toBe('Full Day Care');
      expect(xeroLines[0].quantity).toBe(1);
      expect(xeroLines[0].unitAmount).toBe(5000); // R5000 (cents to rand)
      expect(xeroLines[0].accountCode).toBe('4000');
      expect(xeroLines[0].taxType).toBe('NONE'); // Non-VAT registered tenant
    });
  });

  describe('Error Handling', () => {
    it('should record errors for already-invoiced children without failing', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      // Generate invoices first
      await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      // Try again - should get errors for duplicates
      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      // All should be recorded as errors but method shouldn't throw
      expect(result.invoicesCreated).toBe(0);
      expect(result.errors.length).toBe(3);
      expect(result.errors.every((e) => e.code === 'DUPLICATE_INVOICE')).toBe(
        true,
      );
    });

    it('should aggregate total amount correctly across all invoices', async () => {
      // Use current year to match issueDate (which is set to today's date)
      const currentYear = new Date().getFullYear();
      const billingMonth = `${currentYear}-06`;

      const result = await service.generateMonthlyInvoices(
        testTenant.id,
        billingMonth,
        testUser.id,
      );

      // Calculate expected total
      const actualTotal = result.invoices.reduce(
        (sum, inv) => sum + inv.totalCents,
        0,
      );
      expect(result.totalAmountCents).toBe(actualTotal);
    });
  });
});
