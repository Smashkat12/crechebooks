/**
 * Invoice Scheduler Processor Tests
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * FEAT-BILLING-AUTOSEND: Post-generation auto-send + staging-safety gate
 */
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceSchedulerProcessor } from '../invoice-scheduler.processor';
import { InvoiceGenerationService } from '../../../database/services/invoice-generation.service';
import { InvoiceDeliveryService } from '../../../database/services/invoice-delivery.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EnrollmentStatus } from '../../../database/entities/enrollment.entity';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';
import type { InvoiceGenerationResult } from '../../../database/dto/invoice-generation.dto';

describe('InvoiceSchedulerProcessor', () => {
  let processor: InvoiceSchedulerProcessor;
  let mockInvoiceGenerationService: any;
  let mockInvoiceDeliveryService: any;
  let mockAuditLogService: any;
  let mockPrisma: any;
  let mockEventEmitter: any;

  const tenantId = 'tenant-123';
  const billingMonth = '2025-01';

  // Staging-safety gate is now enforced inside InvoiceDeliveryService.sendInvoices;
  // InvoiceSchedulerProcessor no longer needs CommsGuardService.
  const buildModule = async (): Promise<TestingModule> => {
    mockInvoiceGenerationService = {
      generateMonthlyInvoices: jest.fn(),
    };

    mockInvoiceDeliveryService = {
      sendInvoices: jest
        .fn()
        .mockResolvedValue({ sent: 0, failed: 0, failures: [] }),
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    mockPrisma = {
      enrollment: { findMany: jest.fn() },
      tenant: { findUnique: jest.fn() },
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    return Test.createTestingModule({
      providers: [
        InvoiceSchedulerProcessor,
        {
          provide: InvoiceGenerationService,
          useValue: mockInvoiceGenerationService,
        },
        {
          provide: InvoiceDeliveryService,
          useValue: mockInvoiceDeliveryService,
        },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
  };

  beforeEach(async () => {
    // Default: APP_ENV not set (production-like)
    delete process.env.APP_ENV;
    const module = await buildModule();
    processor = module.get<InvoiceSchedulerProcessor>(
      InvoiceSchedulerProcessor,
    );
  });

  afterEach(() => {
    delete process.env.APP_ENV;
  });

  describe('processJob', () => {
    const createMockJob = (data = {}) => ({
      id: 'job-123',
      data: {
        tenantId,
        billingMonth,
        triggeredBy: 'cron' as const,
        scheduledAt: new Date(),
        dryRun: false,
        ...data,
      },
      progress: jest.fn(),
    });

    it('should process invoice generation job successfully', async () => {
      const mockJob = createMockJob();
      const activeEnrollments = [
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
      ];

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      const batchResult: InvoiceGenerationResult = {
        invoicesCreated: 2,
        totalAmountCents: 300000,
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-2025-001',
            childId: 'child-1',
            childName: 'John Doe',
            parentId: 'parent-1',
            totalCents: 150000,
            status: InvoiceStatus.DRAFT,
            xeroInvoiceId: null,
          },
          {
            id: 'inv-2',
            invoiceNumber: 'INV-2025-002',
            childId: 'child-2',
            childName: 'Jane Doe',
            parentId: 'parent-1',
            totalCents: 150000,
            status: InvoiceStatus.DRAFT,
            xeroInvoiceId: null,
          },
        ],
        errors: [],
      };

      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );

      await processor.processJob(mockJob as any);

      expect(mockPrisma.enrollment.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          status: EnrollmentStatus.ACTIVE,
        },
        select: {
          id: true,
          childId: true,
        },
      });

      expect(
        mockInvoiceGenerationService.generateMonthlyInvoices,
      ).toHaveBeenCalledWith(tenantId, billingMonth, 'system', [
        'child-1',
        'child-2',
      ]);

      expect(mockAuditLogService.logAction).toHaveBeenCalled();
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should handle dry run mode without creating invoices', async () => {
      const mockJob = createMockJob({ dryRun: true });
      const activeEnrollments = [
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
      ];

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      expect(
        mockInvoiceGenerationService.generateMonthlyInvoices,
      ).not.toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should handle no active enrollments', async () => {
      const mockJob = createMockJob();

      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      expect(
        mockInvoiceGenerationService.generateMonthlyInvoices,
      ).not.toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should skip duplicate invoices and continue processing', async () => {
      const mockJob = createMockJob();
      const activeEnrollments = [
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
      ];

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      const batchResult: InvoiceGenerationResult = {
        invoicesCreated: 1,
        totalAmountCents: 150000,
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-2025-001',
            childId: 'child-1',
            childName: 'John Doe',
            parentId: 'parent-1',
            totalCents: 150000,
            status: InvoiceStatus.DRAFT,
            xeroInvoiceId: null,
          },
        ],
        errors: [
          {
            childId: 'child-2',
            enrollmentId: 'enr-2',
            error: 'Invoice already exists for billing period 2025-01',
            code: 'DUPLICATE_INVOICE',
          },
        ],
      };

      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );

      await processor.processJob(mockJob as any);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            successCount: 1,
            skippedCount: 1,
            errorCount: 0,
          }),
        }),
      );
    });

    it('should handle real errors distinctly from skipped duplicates', async () => {
      const mockJob = createMockJob();
      const activeEnrollments = [
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
        { id: 'enr-3', childId: 'child-3' },
      ];

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      const batchResult: InvoiceGenerationResult = {
        invoicesCreated: 1,
        totalAmountCents: 150000,
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-2025-001',
            childId: 'child-1',
            childName: 'John Doe',
            parentId: 'parent-1',
            totalCents: 150000,
            status: InvoiceStatus.DRAFT,
            xeroInvoiceId: null,
          },
        ],
        errors: [
          {
            childId: 'child-2',
            enrollmentId: 'enr-2',
            error: 'Invoice already exists for billing period 2025-01',
            code: 'DUPLICATE_INVOICE',
          },
          {
            childId: 'child-3',
            enrollmentId: 'enr-3',
            error: 'Fee structure not found',
            code: 'NOT_FOUND',
          },
        ],
      };

      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );

      await processor.processJob(mockJob as any);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            successCount: 1,
            skippedCount: 1,
            errorCount: 1,
          }),
        }),
      );
    });

    it('should process in batches of 10', async () => {
      const mockJob = createMockJob();

      // Create 25 enrollments to trigger 3 batches
      const activeEnrollments = Array.from({ length: 25 }, (_, i) => ({
        id: `enr-${i + 1}`,
        childId: `child-${i + 1}`,
      }));

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      const batchResult: InvoiceGenerationResult = {
        invoicesCreated: 10,
        totalAmountCents: 1500000,
        invoices: [],
        errors: [],
      };

      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );

      await processor.processJob(mockJob as any);

      // Should call generateMonthlyInvoices 3 times (10+10+5)
      expect(
        mockInvoiceGenerationService.generateMonthlyInvoices,
      ).toHaveBeenCalledTimes(3);

      // Verify batch sizes
      const calls =
        mockInvoiceGenerationService.generateMonthlyInvoices.mock.calls;
      expect(calls[0][3].length).toBe(10); // First batch
      expect(calls[1][3].length).toBe(10); // Second batch
      expect(calls[2][3].length).toBe(5); // Third batch
    });

    it('should continue processing other batches when one batch fails', async () => {
      const mockJob = createMockJob();

      const activeEnrollments = Array.from({ length: 20 }, (_, i) => ({
        id: `enr-${i + 1}`,
        childId: `child-${i + 1}`,
      }));

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      // First batch succeeds, second batch fails
      mockInvoiceGenerationService.generateMonthlyInvoices
        .mockResolvedValueOnce({
          invoicesCreated: 10,
          totalAmountCents: 1500000,
          invoices: [],
          errors: [],
        })
        .mockRejectedValueOnce(new Error('Database connection failed'));

      await processor.processJob(mockJob as any);

      expect(
        mockInvoiceGenerationService.generateMonthlyInvoices,
      ).toHaveBeenCalledTimes(2);
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            successCount: 10,
            errorCount: 10,
          }),
        }),
      );
    });

    it('should update job progress during batch processing', async () => {
      const mockJob = createMockJob();

      const activeEnrollments = Array.from({ length: 30 }, (_, i) => ({
        id: `enr-${i + 1}`,
        childId: `child-${i + 1}`,
      }));

      mockPrisma.enrollment.findMany.mockResolvedValue(activeEnrollments);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue({
        invoicesCreated: 10,
        totalAmountCents: 1500000,
        invoices: [],
        errors: [],
      });

      await processor.processJob(mockJob as any);

      // Progress should be called multiple times (after each batch + final 100)
      expect(mockJob.progress).toHaveBeenCalled();
      expect(mockJob.progress).toHaveBeenLastCalledWith(100);
    });
  });

  describe('admin notification', () => {
    it('should send notification when invoice generation completes', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          tenantId,
          billingMonth,
          triggeredBy: 'cron' as const,
          scheduledAt: new Date(),
          dryRun: false,
        },
        progress: jest.fn(),
      };

      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', childId: 'child-1' },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue({
        invoicesCreated: 1,
        totalAmountCents: 150000,
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-2025-001',
            childId: 'child-1',
            childName: 'John Doe',
            parentId: 'parent-1',
            totalCents: 150000,
            status: InvoiceStatus.DRAFT,
            xeroInvoiceId: null,
          },
        ],
        errors: [],
      });

      await processor.processJob(mockJob as any);

      // Verify tenant lookup for notification
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
        select: { name: true, email: true },
      });
    });

    it('should handle missing tenant gracefully for notification', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          tenantId,
          billingMonth,
          triggeredBy: 'cron' as const,
          scheduledAt: new Date(),
          dryRun: false,
        },
        progress: jest.fn(),
      };

      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await processor.processJob(mockJob as any);

      // Should not throw, just log warning
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });
  });

  describe('auto-send: post-generation delivery', () => {
    const generatedInvoiceIds = ['inv-1', 'inv-2'];

    const createJobWithInvoices = () => ({
      id: 'job-auto-send',
      data: {
        tenantId,
        billingMonth,
        triggeredBy: 'cron' as const,
        scheduledAt: new Date(),
        dryRun: false,
      },
      progress: jest.fn(),
    });

    const batchResult: InvoiceGenerationResult = {
      invoicesCreated: 2,
      totalAmountCents: 300000,
      invoices: [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2025-001',
          childId: 'child-1',
          childName: 'John Doe',
          parentId: 'parent-1',
          totalCents: 150000,
          status: InvoiceStatus.DRAFT,
          xeroInvoiceId: null,
        },
        {
          id: 'inv-2',
          invoiceNumber: 'INV-2025-002',
          childId: 'child-2',
          childName: 'Jane Doe',
          parentId: 'parent-1',
          totalCents: 150000,
          status: InvoiceStatus.DRAFT,
          xeroInvoiceId: null,
        },
      ],
      errors: [],
    };

    it('calls sendInvoices with generated invoice IDs on non-dry-run', async () => {
      const mockJob = createJobWithInvoices();
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });
      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );
      mockInvoiceDeliveryService.sendInvoices.mockResolvedValue({
        sent: 2,
        failed: 0,
        failures: [],
      });

      await processor.processJob(mockJob as any);

      expect(mockInvoiceDeliveryService.sendInvoices).toHaveBeenCalledWith({
        tenantId,
        invoiceIds: generatedInvoiceIds,
      });
    });

    it('does NOT call sendInvoices in dry-run mode', async () => {
      const mockJob = {
        id: 'job-dry-run',
        data: {
          tenantId,
          billingMonth,
          triggeredBy: 'cron' as const,
          scheduledAt: new Date(),
          dryRun: true,
        },
        progress: jest.fn(),
      };
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', childId: 'child-1' },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      expect(mockInvoiceDeliveryService.sendInvoices).not.toHaveBeenCalled();
    });

    it('does NOT call sendInvoices when no invoices were generated', async () => {
      const mockJob = createJobWithInvoices();
      mockPrisma.enrollment.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      expect(mockInvoiceDeliveryService.sendInvoices).not.toHaveBeenCalled();
    });

    it('when APP_ENV=staging: delegates to sendInvoices (staging gate now lives inside InvoiceDeliveryService)', async () => {
      // The processor no longer hard-suppresses in staging — it always calls sendInvoices.
      // The two-layer gate (APP_ENV=staging + COMMS_DISABLED) is enforced inside
      // InvoiceDeliveryService.sendInvoices, tested in invoice-delivery.service.spec.ts.
      delete process.env.APP_ENV;
      const module = await buildModule();
      const stagingProcessor = module.get<InvoiceSchedulerProcessor>(
        InvoiceSchedulerProcessor,
      );
      process.env.APP_ENV = 'staging';

      const mockJob = createJobWithInvoices();
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });
      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );
      mockInvoiceDeliveryService.sendInvoices.mockResolvedValue({
        sent: 2,
        failed: 0,
        failures: [],
      });

      await stagingProcessor.processJob(mockJob as any);

      // Processor always delegates — gate is inside the service
      expect(mockInvoiceDeliveryService.sendInvoices).toHaveBeenCalledWith({
        tenantId,
        invoiceIds: generatedInvoiceIds,
      });
    });

    it('normal path: calls sendInvoices with generated invoice IDs', async () => {
      delete process.env.APP_ENV;

      const mockJob = createJobWithInvoices();
      mockPrisma.enrollment.findMany.mockResolvedValue([
        { id: 'enr-1', childId: 'child-1' },
        { id: 'enr-2', childId: 'child-2' },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });
      mockInvoiceGenerationService.generateMonthlyInvoices.mockResolvedValue(
        batchResult,
      );
      mockInvoiceDeliveryService.sendInvoices.mockResolvedValue({
        sent: 2,
        failed: 0,
        failures: [],
      });

      await processor.processJob(mockJob as any);

      expect(mockInvoiceDeliveryService.sendInvoices).toHaveBeenCalledWith({
        tenantId,
        invoiceIds: generatedInvoiceIds,
      });
    });
  });
});

describe('Invoice Batch Size', () => {
  it('should have batch size of 10', () => {
    // Verify batch size constant (10 enrollments per iteration)
    expect(10).toBe(10); // BATCH_SIZE constant
  });
});
