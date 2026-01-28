/**
 * InvoiceSchedulerProcessor Integration Tests
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 * Only external services (Redis/BullMQ) are mocked as they require running infrastructure
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceSchedulerProcessor } from '../../../src/scheduler/processors/invoice-scheduler.processor';
import { InvoiceGenerationService } from '../../../src/database/services/invoice-generation.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { ProRataService } from '../../../src/database/services/pro-rata.service';
import { CreditBalanceService } from '../../../src/database/services/credit-balance.service';
import { CreditNoteService } from '../../../src/database/services/credit-note.service';
import { InvoiceNumberService } from '../../../src/database/services/invoice-number.service';
import { WelcomePackDeliveryService } from '../../../src/database/services/welcome-pack-delivery.service';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';
import { FeeType } from '../../../src/database/entities/fee-structure.entity';
import {
  Tenant,
  Parent,
  Child,
  FeeStructure,
  Enrollment,
} from '@prisma/client';

/**
 * Mock XeroSyncService - external API integration
 * NOTE: This is a SERVICE mock for external API, not a DATA mock.
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

/**
 * Mock BullMQ Job for processor tests
 * NOTE: This is an INFRASTRUCTURE mock for BullMQ, not a DATA mock
 */
const createMockJob = (data: any) => ({
  id: `test-job-${Date.now()}`,
  data,
  progress: jest.fn(),
  moveToFailed: jest.fn(),
  moveToCompleted: jest.fn(),
  log: jest.fn(),
});

describe('InvoiceSchedulerProcessor Integration Tests', () => {
  let processor: InvoiceSchedulerProcessor;
  let invoiceGenerationService: InvoiceGenerationService;
  let prisma: PrismaService;
  let invoiceRepo: InvoiceRepository;

  // Test data
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild1: Child;
  let testChild2: Child;
  let testFeeStructure: FeeStructure;
  let testEnrollment1: Enrollment;
  let testEnrollment2: Enrollment;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        InvoiceSchedulerProcessor,
        InvoiceGenerationService,
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
        InvoiceNumberService,
        {
          provide: WelcomePackDeliveryService,
          useValue: {
            deliverWelcomePack: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: XeroSyncService, useValue: mockXeroSyncService },
      ],
    }).compile();

    processor = module.get<InvoiceSchedulerProcessor>(
      InvoiceSchedulerProcessor,
    );
    invoiceGenerationService = module.get<InvoiceGenerationService>(
      InvoiceGenerationService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function setupTestData() {
    // Clean up any stale data from previous runs
    const existingTenant = await prisma.tenant.findUnique({
      where: { email: 'scheduler@test.co.za' },
    });
    if (existingTenant) {
      await prisma.invoiceLine.deleteMany({
        where: { invoice: { tenantId: existingTenant.id } },
      });
      await prisma.invoice.deleteMany({
        where: { tenantId: existingTenant.id },
      });
      await prisma.enrollment.deleteMany({
        where: { tenantId: existingTenant.id },
      });
      await prisma.feeStructure.deleteMany({
        where: { tenantId: existingTenant.id },
      });
      await prisma.child.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.parent.deleteMany({
        where: { tenantId: existingTenant.id },
      });
      await prisma.auditLog.deleteMany({
        where: { tenantId: existingTenant.id },
      });
      await prisma.tenant.delete({ where: { id: existingTenant.id } });
    }

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche Scheduler',
        email: 'scheduler@test.co.za',
        phone: '0211234567',
        addressLine1: '456 Test Avenue',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
        taxStatus: TaxStatus.NOT_REGISTERED,
        invoiceDueDays: 7,
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Parent',
        email: 'john.parent@test.co.za',
        phone: '0821234567',
        preferredContact: 'EMAIL',
      },
    });

    // Create test children
    testChild1 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Child',
        lastName: 'One',
        dateOfBirth: new Date('2020-01-15'),
      },
    });

    testChild2 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Child',
        lastName: 'Two',
        dateOfBirth: new Date('2022-06-20'),
      },
    });

    // Create fee structure
    testFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Standard Full Day',
        feeType: FeeType.FULL_DAY,
        amountCents: 350000, // R3,500
        vatInclusive: false,
        effectiveFrom: new Date('2024-01-01'),
      },
    });

    // Create active enrollments
    testEnrollment1 = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild1.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2024-01-01'),
        status: EnrollmentStatus.ACTIVE,
        siblingDiscountApplied: false,
      },
    });

    testEnrollment2 = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild2.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2024-01-01'),
        status: EnrollmentStatus.ACTIVE,
        siblingDiscountApplied: true,
      },
    });
  }

  async function cleanupTestData() {
    // Clean up in reverse order of creation
    await prisma.invoiceLine.deleteMany({
      where: { invoice: { tenantId: testTenant.id } },
    });
    await prisma.invoice.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.enrollment.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.feeStructure.deleteMany({
      where: { tenantId: testTenant.id },
    });
    await prisma.child.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.parent.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
  }

  describe('processJob with real database', () => {
    beforeEach(async () => {
      // Clear any invoices from previous tests
      await prisma.invoiceLine.deleteMany({
        where: { invoice: { tenantId: testTenant.id } },
      });
      await prisma.invoice.deleteMany({ where: { tenantId: testTenant.id } });
    });

    it('should generate invoices for active enrollments using real database', async () => {
      const billingMonth = '2025-02';
      const mockJob = createMockJob({
        tenantId: testTenant.id,
        billingMonth,
        triggeredBy: 'manual',
        scheduledAt: new Date(),
        dryRun: false,
      });

      await processor.processJob(mockJob as any);

      // Verify real invoices were created in database
      const createdInvoices = await prisma.invoice.findMany({
        where: { tenantId: testTenant.id },
        include: { lines: true },
      });

      expect(createdInvoices.length).toBe(2); // One for each child

      // Verify invoice details
      const invoice1 = createdInvoices.find((i) => i.childId === testChild1.id);
      const invoice2 = createdInvoices.find((i) => i.childId === testChild2.id);

      expect(invoice1).toBeDefined();
      expect(invoice1!.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice1!.totalCents).toBe(350000); // R3,500

      expect(invoice2).toBeDefined();
      // Child 2 has sibling discount applied at enrollment level
      expect(invoice2!.status).toBe(InvoiceStatus.DRAFT);

      // Verify job progress was called
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should handle dry run mode without creating invoices', async () => {
      const billingMonth = '2025-03';
      const mockJob = createMockJob({
        tenantId: testTenant.id,
        billingMonth,
        triggeredBy: 'manual',
        scheduledAt: new Date(),
        dryRun: true,
      });

      await processor.processJob(mockJob as any);

      // Verify NO invoices were created
      const invoices = await prisma.invoice.findMany({
        where: { tenantId: testTenant.id },
      });

      expect(invoices.length).toBe(0);
    });

    it('should skip duplicate invoices for same billing period', async () => {
      const billingMonth = '2025-04';

      // First run - should create invoices
      const mockJob1 = createMockJob({
        tenantId: testTenant.id,
        billingMonth,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        dryRun: false,
      });

      await processor.processJob(mockJob1 as any);

      const firstRunInvoices = await prisma.invoice.findMany({
        where: { tenantId: testTenant.id },
      });
      expect(firstRunInvoices.length).toBe(2);

      // Second run - should skip (duplicates)
      const mockJob2 = createMockJob({
        tenantId: testTenant.id,
        billingMonth,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        dryRun: false,
      });

      await processor.processJob(mockJob2 as any);

      // Should still only have 2 invoices (no duplicates)
      const secondRunInvoices = await prisma.invoice.findMany({
        where: { tenantId: testTenant.id },
      });
      expect(secondRunInvoices.length).toBe(2);
    });

    it('should handle tenant with no active enrollments', async () => {
      // Create a tenant with no enrollments
      const emptyTenant = await prisma.tenant.create({
        data: {
          name: 'Empty Creche',
          email: 'empty@test.co.za',
          phone: '0311234567',
          addressLine1: '789 Empty Road',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postalCode: '4000',
          taxStatus: TaxStatus.NOT_REGISTERED,
        },
      });

      try {
        const mockJob = createMockJob({
          tenantId: emptyTenant.id,
          billingMonth: '2025-05',
          triggeredBy: 'cron',
          scheduledAt: new Date(),
          dryRun: false,
        });

        await processor.processJob(mockJob as any);

        // Should complete successfully with 0 invoices
        const invoices = await prisma.invoice.findMany({
          where: { tenantId: emptyTenant.id },
        });
        expect(invoices.length).toBe(0);
        expect(mockJob.progress).toHaveBeenCalledWith(100);
      } finally {
        // Cleanup
        await prisma.tenant.delete({ where: { id: emptyTenant.id } });
      }
    });
  });

  describe('batch processing with real database', () => {
    it('should process enrollments in batches of 10', async () => {
      // Create 15 additional children/enrollments to test batching
      const additionalChildren: Child[] = [];
      const additionalEnrollments: Enrollment[] = [];

      try {
        for (let i = 0; i < 15; i++) {
          const child = await prisma.child.create({
            data: {
              tenantId: testTenant.id,
              parentId: testParent.id,
              firstName: `BatchChild${i}`,
              lastName: 'Test',
              dateOfBirth: new Date('2021-01-01'),
            },
          });
          additionalChildren.push(child);

          const enrollment = await prisma.enrollment.create({
            data: {
              tenantId: testTenant.id,
              childId: child.id,
              feeStructureId: testFeeStructure.id,
              startDate: new Date('2024-01-01'),
              status: EnrollmentStatus.ACTIVE,
              siblingDiscountApplied: false,
            },
          });
          additionalEnrollments.push(enrollment);
        }

        const mockJob = createMockJob({
          tenantId: testTenant.id,
          billingMonth: '2025-06',
          triggeredBy: 'cron',
          scheduledAt: new Date(),
          dryRun: false,
        });

        await processor.processJob(mockJob as any);

        // Should create 17 invoices total (2 original + 15 new)
        const invoices = await prisma.invoice.findMany({
          where: { tenantId: testTenant.id },
        });
        expect(invoices.length).toBe(17);

        // Progress should have been called multiple times (batch updates)
        expect(mockJob.progress.mock.calls.length).toBeGreaterThan(1);
      } finally {
        // Cleanup additional test data
        for (const enrollment of additionalEnrollments) {
          await prisma.invoiceLine.deleteMany({
            where: { invoice: { childId: enrollment.childId } },
          });
          await prisma.invoice.deleteMany({
            where: { childId: enrollment.childId },
          });
          await prisma.enrollment.delete({ where: { id: enrollment.id } });
        }
        for (const child of additionalChildren) {
          await prisma.child.delete({ where: { id: child.id } });
        }
      }
    });
  });
});
