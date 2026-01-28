/**
 * Invoice Ad-Hoc Charges Tests
 * TASK-BILL-017: Ad-Hoc Charges in Monthly Invoice Generation
 *
 * @module database/services/__tests__/invoice-adhoc
 * @description Tests for ad-hoc charge inclusion in invoice generation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceGenerationService } from '../invoice-generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { InvoiceLineRepository } from '../../repositories/invoice-line.repository';
import { TenantRepository } from '../../repositories/tenant.repository';
import { ParentRepository } from '../../repositories/parent.repository';
import { EnrollmentService } from '../enrollment.service';
import { AuditLogService } from '../audit-log.service';
import { XeroSyncService } from '../xero-sync.service';
import { ProRataService } from '../pro-rata.service';
import { CreditBalanceService } from '../credit-balance.service';
import { InvoiceNumberService } from '../invoice-number.service';
import { LineType } from '../../entities/invoice-line.entity';

describe('InvoiceGenerationService - Ad-Hoc Charges', () => {
  let service: InvoiceGenerationService;
  let prisma: jest.Mocked<PrismaService>;
  let invoiceRepo: jest.Mocked<InvoiceRepository>;
  let invoiceLineRepo: jest.Mocked<InvoiceLineRepository>;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let enrollmentService: jest.Mocked<EnrollmentService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const TENANT_ID = 'tenant-123';
  const CHILD_ID = 'child-456';
  const PARENT_ID = 'parent-789';
  const USER_ID = 'user-001';

  beforeEach(async () => {
    const defaultInvoice = {
      id: 'invoice-001',
      tenantId: TENANT_ID,
      invoiceNumber: 'INV-2025-001',
      parentId: PARENT_ID,
      childId: CHILD_ID,
      subtotalCents: 0,
      vatCents: 0,
      totalCents: 0,
      status: 'DRAFT',
      amountPaidCents: 0,
      xeroInvoiceId: null,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockInvoice = {
      create: jest.fn().mockResolvedValue(defaultInvoice),
      update: jest.fn().mockResolvedValue(defaultInvoice),
      findMany: jest.fn(),
    };
    const mockInvoiceLine = {
      create: jest.fn().mockImplementation(async (data: any) => ({
        id: `line-${Date.now()}`,
        ...data.data,
        createdAt: new Date(),
      })),
    };
    const mockAdHocCharge = {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    };
    const mockTx = {
      invoice: mockInvoice,
      invoiceLine: mockInvoiceLine,
      adHocCharge: mockAdHocCharge,
    };
    const mockPrisma = {
      enrollment: {
        findMany: jest.fn(),
      },
      invoice: mockInvoice,
      invoiceLine: mockInvoiceLine,
      adHocCharge: mockAdHocCharge,
      $queryRaw: jest.fn().mockResolvedValue([{ pg_try_advisory_lock: true }]),
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockTx);
        }
        return cb;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceGenerationService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: InvoiceRepository,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findByBillingPeriod: jest.fn(),
            findLastInvoiceForYear: jest.fn(),
          },
        },
        {
          provide: InvoiceLineRepository,
          useValue: {
            create: jest.fn(),
            findByInvoice: jest.fn(),
          },
        },
        {
          provide: TenantRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: ParentRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: EnrollmentService,
          useValue: {
            applySiblingDiscount: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logCreate: jest.fn(),
          },
        },
        {
          provide: XeroSyncService,
          useValue: {
            createInvoiceDraft: jest.fn(),
          },
        },
        {
          provide: ProRataService,
          useValue: {
            calculateProRata: jest.fn(),
          },
        },
        {
          provide: CreditBalanceService,
          useValue: {
            getAvailableCredit: jest.fn().mockResolvedValue(0),
            applyCredit: jest.fn(),
            getCreditSummary: jest.fn().mockResolvedValue({
              totalCreditCents: 0,
              availableCreditCents: 0,
              appliedCreditCents: 0,
              creditCount: 0,
            }),
          },
        },
        {
          provide: InvoiceNumberService,
          useValue: {
            generateNextNumber: jest.fn().mockResolvedValue('INV-2025-001'),
          },
        },
      ],
    }).compile();

    service = module.get<InvoiceGenerationService>(InvoiceGenerationService);
    prisma = module.get(PrismaService);
    invoiceRepo = module.get(InvoiceRepository);
    invoiceLineRepo = module.get(InvoiceLineRepository);
    tenantRepo = module.get(TenantRepository);
    enrollmentService = module.get(EnrollmentService);
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ad-hoc charges integration', () => {
    const billingMonth = '2025-01';
    const billingPeriodStart = new Date('2025-01-01');
    const billingPeriodEnd = new Date('2025-01-31');

    const mockEnrollment = {
      id: 'enrollment-001',
      tenantId: TENANT_ID,
      childId: CHILD_ID,
      feeStructureId: 'fee-001',
      startDate: new Date('2024-01-01'),
      endDate: null,
      status: 'ACTIVE',
      siblingDiscountApplied: false,
      customFeeOverrideCents: null,
      child: {
        id: CHILD_ID,
        parentId: PARENT_ID,
        firstName: 'John',
        lastName: 'Doe',
      },
      feeStructure: {
        id: 'fee-001',
        name: 'Monthly Fee - Standard',
        amountCents: 500000, // R5000.00
        vatInclusive: false,
      },
    };

    const mockAdHocCharges = [
      {
        id: 'adhoc-001',
        tenantId: TENANT_ID,
        childId: CHILD_ID,
        description: 'Field Trip - Zoo Visit',
        amountCents: 15000, // R150.00
        chargeDate: new Date('2025-01-15'),
        invoicedAt: null,
        invoiceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'adhoc-002',
        tenantId: TENANT_ID,
        childId: CHILD_ID,
        description: 'Late Pickup Fee',
        amountCents: 5000, // R50.00
        chargeDate: new Date('2025-01-20'),
        invoicedAt: null,
        invoiceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    beforeEach(() => {
      // Setup default mocks
      tenantRepo.findById.mockResolvedValue({
        id: TENANT_ID,
        name: 'Test Creche',
        taxStatus: 'VAT_REGISTERED',
        invoiceDueDays: 7,
      } as any);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      invoiceRepo.findByBillingPeriod.mockResolvedValue(null);
      invoiceRepo.findLastInvoiceForYear.mockResolvedValue(null);

      invoiceRepo.create.mockResolvedValue({
        id: 'invoice-001',
        tenantId: TENANT_ID,
        invoiceNumber: 'INV-2025-001',
        parentId: PARENT_ID,
        childId: CHILD_ID,
        billingPeriodStart,
        billingPeriodEnd,
        issueDate: new Date(),
        dueDate: new Date(),
        subtotalCents: 0,
        vatCents: 0,
        totalCents: 0,
        status: 'DRAFT',
        amountPaidCents: 0,
        xeroInvoiceId: null,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      enrollmentService.applySiblingDiscount.mockResolvedValue(new Map());

      invoiceLineRepo.create.mockImplementation(async (data: any) => ({
        id: `line-${Date.now()}`,
        ...data,
        createdAt: new Date(),
      }));

      invoiceLineRepo.findByInvoice.mockResolvedValue([]);
    });

    it('should include ad-hoc charges in invoice generation', async () => {
      // Arrange
      (prisma.adHocCharge.findMany as jest.Mock).mockResolvedValue(
        mockAdHocCharges,
      );
      (prisma.adHocCharge.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 520000, // 500000 + 15000 + 5000
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      const result = await service.generateMonthlyInvoices(
        TENANT_ID,
        billingMonth,
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(1);

      // Should query for ad-hoc charges
      expect(prisma.adHocCharge.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          childId: CHILD_ID,
          invoicedAt: null,
          chargeDate: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        orderBy: { chargeDate: 'asc' },
      });

      // Should create line items including ad-hoc charges via $transaction
      // Line 1: Monthly fee, Line 2: Field Trip, Line 3: Late Fee
      // Note: createInvoiceAtomic uses tx.invoiceLine.create (Prisma-level), not invoiceLineRepo.create
      const txInvoiceLineCreate = (prisma as any).invoiceLine.create;
      expect(txInvoiceLineCreate).toHaveBeenCalledTimes(3);

      // Verify ad-hoc line items (Prisma calls use { data: {...} } wrapper)
      const lineItemCalls = txInvoiceLineCreate.mock.calls;

      // Second call should be field trip
      expect(lineItemCalls[1][0].data).toMatchObject({
        description: 'Field Trip - Zoo Visit',
        unitPriceCents: 15000,
        lineType: LineType.AD_HOC,
      });

      // Third call should be late fee
      expect(lineItemCalls[2][0].data).toMatchObject({
        description: 'Late Pickup Fee',
        unitPriceCents: 5000,
        lineType: LineType.AD_HOC,
      });
    });

    it('should mark ad-hoc charges as invoiced after creation', async () => {
      // Arrange
      (prisma.adHocCharge.findMany as jest.Mock).mockResolvedValue(
        mockAdHocCharges,
      );
      (prisma.adHocCharge.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 520000,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, billingMonth, USER_ID);

      // Assert - charges should be marked as invoiced
      expect(prisma.adHocCharge.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['adhoc-001', 'adhoc-002'] },
        },
        data: {
          invoicedAt: expect.any(Date),
          invoiceId: 'invoice-001',
        },
      });
    });

    it('should not include already-invoiced charges', async () => {
      // Arrange - return empty array (no pending charges)
      (prisma.adHocCharge.findMany as jest.Mock).mockResolvedValue([]);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 500000, // Only monthly fee
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      const result = await service.generateMonthlyInvoices(
        TENANT_ID,
        billingMonth,
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(1);
      // Only monthly fee line item (created via tx.invoiceLine.create inside $transaction)
      expect((prisma as any).invoiceLine.create).toHaveBeenCalledTimes(1);
      // Ad-hoc charges are now marked inside the $transaction, but there were none
      // so updateMany should still not be called for ad-hoc marking
      expect((prisma as any).adHocCharge.updateMany).not.toHaveBeenCalled();
    });

    it('should only include charges within billing period', async () => {
      // Arrange - charge from different month
      const chargeFromDifferentMonth = {
        id: 'adhoc-outside',
        tenantId: TENANT_ID,
        childId: CHILD_ID,
        description: 'December Charge',
        amountCents: 10000,
        chargeDate: new Date('2024-12-15'), // Outside billing period
        invoicedAt: null,
        invoiceId: null,
      };

      // Mock should filter by date - this charge shouldn't be returned
      (prisma.adHocCharge.findMany as jest.Mock).mockResolvedValue([]); // Filtered out by date

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 500000,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, billingMonth, USER_ID);

      // Assert - query should have correct date filters
      // Note: Use expect.any(Date) because exact dates depend on timezone
      expect(prisma.adHocCharge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chargeDate: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
            invoicedAt: null,
          }),
        }),
      );
    });

    it('should handle multiple children with ad-hoc charges', async () => {
      // Arrange - two children
      const child2 = {
        ...mockEnrollment,
        id: 'enrollment-002',
        childId: 'child-002',
        child: {
          id: 'child-002',
          parentId: 'parent-002',
          firstName: 'Jane',
          lastName: 'Smith',
        },
      };

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
        child2,
      ]);

      // First child has charges, second doesn't
      (prisma.adHocCharge.findMany as jest.Mock)
        .mockResolvedValueOnce(mockAdHocCharges)
        .mockResolvedValueOnce([]);

      (prisma.adHocCharge.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 520000,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      invoiceRepo.create.mockImplementation(async (data: any) => ({
        id: `invoice-${data.childId}`,
        ...data,
        invoiceNumber: 'INV-2025-001',
        totalCents: 0,
        status: 'DRAFT',
        xeroInvoiceId: null,
      }));

      // Act
      const result = await service.generateMonthlyInvoices(
        TENANT_ID,
        billingMonth,
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(2);
      expect(prisma.adHocCharge.findMany).toHaveBeenCalledTimes(2);
      // Only first child's charges should be marked
      expect(prisma.adHocCharge.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('AD_HOC LineType VAT handling', () => {
    it('should apply VAT to AD_HOC line items for VAT registered tenant', async () => {
      // Arrange
      tenantRepo.findById.mockResolvedValue({
        id: TENANT_ID,
        name: 'Test Creche',
        taxStatus: 'VAT_REGISTERED',
        invoiceDueDays: 7,
      } as any);

      const mockEnrollment = {
        id: 'enrollment-001',
        tenantId: TENANT_ID,
        childId: CHILD_ID,
        feeStructureId: 'fee-001',
        startDate: new Date('2024-01-01'),
        endDate: null,
        status: 'ACTIVE',
        siblingDiscountApplied: false,
        customFeeOverrideCents: null,
        child: {
          id: CHILD_ID,
          parentId: PARENT_ID,
          firstName: 'Test',
          lastName: 'Child',
        },
        feeStructure: {
          id: 'fee-001',
          name: 'Monthly Fee',
          amountCents: 500000,
          vatInclusive: false,
        },
      };

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      const adHocCharge = {
        id: 'adhoc-001',
        tenantId: TENANT_ID,
        childId: CHILD_ID,
        description: 'Books',
        amountCents: 10000, // R100.00
        chargeDate: new Date('2025-01-15'),
        invoicedAt: null,
        invoiceId: null,
      };

      (prisma.adHocCharge.findMany as jest.Mock).mockResolvedValue([
        adHocCharge,
      ]);
      (prisma.adHocCharge.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      invoiceRepo.findByBillingPeriod.mockResolvedValue(null);
      invoiceRepo.findLastInvoiceForYear.mockResolvedValue(null);
      invoiceRepo.create.mockResolvedValue({
        id: 'invoice-001',
        tenantId: TENANT_ID,
        invoiceNumber: 'INV-2025-001',
        totalCents: 0,
        status: 'DRAFT',
      } as any);

      enrollmentService.applySiblingDiscount.mockResolvedValue(new Map());

      // The $transaction mock uses prisma.invoiceLine.create (tx.invoiceLine.create)
      // Override it to track VAT application on AD_HOC lines
      let vatApplied = false;
      const txInvoiceLineCreate = (prisma as any).invoiceLine.create as jest.Mock;
      txInvoiceLineCreate.mockImplementation(async (args: any) => {
        const data = args.data;
        if (data.lineType === LineType.AD_HOC && data.vatCents > 0) {
          vatApplied = true;
        }
        return {
          id: `line-${Date.now()}`,
          ...data,
          createdAt: new Date(),
        };
      });

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 511500, // 500000 + 10000 + 1500 VAT
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', 'user-001');

      // Assert - VAT should be applied to AD_HOC
      expect(vatApplied).toBe(true);
    });
  });
});
