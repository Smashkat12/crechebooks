/**
 * Invoice Pro-Rata Integration Tests
 * TASK-BILL-036: Auto Pro-rata Integration in Invoice Generation
 *
 * @module database/services/__tests__/invoice-prorata
 * @description Tests for automatic pro-rata calculation during invoice generation.
 * Verifies mid-month enrollment, mid-month withdrawal, and full-month scenarios.
 */

import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
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

describe('InvoiceGenerationService - Pro-Rata Integration (TASK-BILL-036)', () => {
  let service: InvoiceGenerationService;
  let prisma: jest.Mocked<PrismaService>;
  let invoiceRepo: jest.Mocked<InvoiceRepository>;
  let invoiceLineRepo: jest.Mocked<InvoiceLineRepository>;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let enrollmentService: jest.Mocked<EnrollmentService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let proRataService: jest.Mocked<ProRataService>;

  const TENANT_ID = 'tenant-123';
  const CHILD_ID = 'child-456';
  const PARENT_ID = 'parent-789';
  const USER_ID = 'user-001';
  const MONTHLY_FEE_CENTS = 500000; // R5000.00

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
      findMany: jest.fn().mockResolvedValue([]),
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
    proRataService = module.get(ProRataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to create a mock enrollment with specified dates
   */
  const createMockEnrollment = (
    startDate: Date,
    endDate: Date | null = null,
  ) => ({
    id: 'enrollment-001',
    tenantId: TENANT_ID,
    childId: CHILD_ID,
    feeStructureId: 'fee-001',
    startDate,
    endDate,
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
      amountCents: MONTHLY_FEE_CENTS,
      vatInclusive: false,
    },
  });

  /**
   * Setup common mocks for invoice generation
   */
  const setupCommonMocks = () => {
    tenantRepo.findById.mockResolvedValue({
      id: TENANT_ID,
      name: 'Test Creche',
      taxStatus: 'NOT_REGISTERED',
      invoiceDueDays: 7,
      closureDates: [],
    } as any);

    invoiceRepo.findByBillingPeriod.mockResolvedValue(null);
    invoiceRepo.findLastInvoiceForYear.mockResolvedValue(null);

    invoiceRepo.create.mockResolvedValue({
      id: 'invoice-001',
      tenantId: TENANT_ID,
      invoiceNumber: 'INV-2025-001',
      parentId: PARENT_ID,
      childId: CHILD_ID,
      billingPeriodStart: new Date('2025-01-01'),
      billingPeriodEnd: new Date('2025-01-31'),
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
  };

  describe('Mid-month enrollment start triggers pro-rata', () => {
    it('should apply pro-rata when enrollment starts mid-month (15th Jan)', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2025-01-15'); // Mid-month start
      const mockEnrollment = createMockEnrollment(enrollmentStartDate, null);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // Pro-rata calculation: 15 Jan - 31 Jan = 13 school days out of ~22
      // Approx: 500000 * (13/22) = ~295,455 cents
      const proRataAmount = 295455;
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      const result = await service.generateMonthlyInvoices(
        TENANT_ID,
        '2025-01',
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(1);

      // ProRataService should be called with correct dates
      expect(proRataService.calculateProRata).toHaveBeenCalledWith(
        MONTHLY_FEE_CENTS,
        expect.any(Date), // effectiveStart (Jan 15)
        expect.any(Date), // effectiveEnd (Jan 31)
        TENANT_ID,
      );

      // Verify the dates passed to calculateProRata
      const [feeCents, startDate, endDate] =
        proRataService.calculateProRata.mock.calls[0];
      expect(feeCents).toBe(MONTHLY_FEE_CENTS);
      expect(startDate.getDate()).toBe(15);
      expect(endDate.getDate()).toBe(31);

      // Line item should have pro-rata amount and description
      // Line items created inside $transaction via tx.invoiceLine.create
      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(proRataAmount);
      expect(lineItemCall.description).toContain('Pro-rata');
      expect(lineItemCall.description).toContain('15 Jan');
      expect(lineItemCall.description).toContain('31 Jan');
      expect(lineItemCall.lineType).toBe(LineType.MONTHLY_FEE);
    });

    it('should apply pro-rata for enrollment starting on last week of month', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2025-01-27'); // Last week
      const mockEnrollment = createMockEnrollment(enrollmentStartDate, null);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // Pro-rata: 27 Jan - 31 Jan = ~3 school days
      const proRataAmount = 68182; // Approx 500000 * (3/22)
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).toHaveBeenCalled();
      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(proRataAmount);
      expect(lineItemCall.description).toContain('27 Jan');
    });
  });

  describe('Mid-month withdrawal triggers pro-rata', () => {
    it('should apply pro-rata when enrollment ends mid-month (15th Jan)', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2024-01-01'); // Full month ago
      const enrollmentEndDate = new Date('2025-01-15'); // Mid-month withdrawal
      const mockEnrollment = createMockEnrollment(
        enrollmentStartDate,
        enrollmentEndDate,
      );

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // Pro-rata: 1 Jan - 15 Jan = ~11 school days
      const proRataAmount = 250000; // Approx 500000 * (11/22)
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      const result = await service.generateMonthlyInvoices(
        TENANT_ID,
        '2025-01',
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(1);

      // ProRataService should be called with correct dates
      expect(proRataService.calculateProRata).toHaveBeenCalled();

      // Verify the dates passed - should be billing period start to enrollment end
      const [, startDate, endDate] =
        proRataService.calculateProRata.mock.calls[0];
      expect(startDate.getDate()).toBe(1); // Billing period start
      expect(endDate.getDate()).toBe(15); // Enrollment end

      // Line item should have pro-rata description (created inside $transaction)
      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(proRataAmount);
      expect(lineItemCall.description).toContain('Pro-rata');
      expect(lineItemCall.description).toContain('1 Jan');
      expect(lineItemCall.description).toContain('15 Jan');
    });

    it('should apply pro-rata for enrollment ending on first week of month', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2024-01-01');
      const enrollmentEndDate = new Date('2025-01-03'); // Withdrawal on 3rd
      const mockEnrollment = createMockEnrollment(
        enrollmentStartDate,
        enrollmentEndDate,
      );

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // Pro-rata: 1 Jan - 3 Jan = ~2 school days
      const proRataAmount = 45455; // Approx 500000 * (2/22)
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).toHaveBeenCalled();
      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(proRataAmount);
      expect(lineItemCall.description).toContain('3 Jan');
    });
  });

  describe('Full-month enrollment uses full fee', () => {
    it('should NOT apply pro-rata for full month enrollment', async () => {
      // Arrange
      setupCommonMocks();

      // Enrollment started before billing period - full month
      const enrollmentStartDate = new Date('2024-01-01');
      const mockEnrollment = createMockEnrollment(enrollmentStartDate, null);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: MONTHLY_FEE_CENTS,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      const result = await service.generateMonthlyInvoices(
        TENANT_ID,
        '2025-01',
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(1);

      // ProRataService should NOT be called for full month
      expect(proRataService.calculateProRata).not.toHaveBeenCalled();

      // Line item should have full monthly fee (created inside $transaction)
      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(MONTHLY_FEE_CENTS);
      expect(lineItemCall.description).toBe('Monthly Fee - Standard');
      expect(lineItemCall.description).not.toContain('Pro-rata');
    });

    it('should NOT apply pro-rata when enrollment starts on first day of billing month', async () => {
      // Arrange
      setupCommonMocks();

      // Enrollment starts exactly on billing period start
      const enrollmentStartDate = new Date('2025-01-01');
      const mockEnrollment = createMockEnrollment(enrollmentStartDate, null);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: MONTHLY_FEE_CENTS,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).not.toHaveBeenCalled();

      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(MONTHLY_FEE_CENTS);
      expect(lineItemCall.description).not.toContain('Pro-rata');
    });

    it('should NOT apply pro-rata when enrollment ends on last day of billing month', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2024-01-01');
      const enrollmentEndDate = new Date('2025-01-31'); // Last day of month
      const mockEnrollment = createMockEnrollment(
        enrollmentStartDate,
        enrollmentEndDate,
      );

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: MONTHLY_FEE_CENTS,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).not.toHaveBeenCalled();

      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(MONTHLY_FEE_CENTS);
    });
  });

  describe('Combined mid-month start and end', () => {
    it('should apply pro-rata for both mid-month start AND end', async () => {
      // Arrange
      setupCommonMocks();

      // Enrollment from 10th to 20th of the month
      const enrollmentStartDate = new Date('2025-01-10');
      const enrollmentEndDate = new Date('2025-01-20');
      const mockEnrollment = createMockEnrollment(
        enrollmentStartDate,
        enrollmentEndDate,
      );

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // Pro-rata: 10 Jan - 20 Jan = ~8 school days
      const proRataAmount = 181818; // Approx 500000 * (8/22)
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).toHaveBeenCalled();

      const [, startDate, endDate] =
        proRataService.calculateProRata.mock.calls[0];
      expect(startDate.getDate()).toBe(10);
      expect(endDate.getDate()).toBe(20);

      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.description).toContain('10 Jan');
      expect(lineItemCall.description).toContain('20 Jan');
    });
  });

  describe('Pro-rata with sibling discount', () => {
    it('should apply sibling discount to pro-rated amount, not full fee', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2025-01-15'); // Mid-month
      const mockEnrollment = createMockEnrollment(enrollmentStartDate, null);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // 10% sibling discount - must return proper Decimal objects
      const siblingDiscountMap = new Map<string, Decimal>();
      siblingDiscountMap.set(CHILD_ID, new Decimal(10));
      enrollmentService.applySiblingDiscount.mockResolvedValue(
        siblingDiscountMap,
      );

      // Pro-rata amount: R2954.55
      const proRataAmount = 295455;
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount - 29546, // After 10% discount
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert - should create two line items (inside $transaction)
      const txLineCreate = (prisma as any).invoiceLine.create;
      expect(txLineCreate).toHaveBeenCalledTimes(2);

      // First line: Pro-rata monthly fee
      const feeLineCall = txLineCreate.mock.calls[0][0].data;
      expect(feeLineCall.unitPriceCents).toBe(proRataAmount);
      expect(feeLineCall.lineType).toBe(LineType.MONTHLY_FEE);

      // Second line: Discount (10% of pro-rata, not full fee)
      const discountLineCall = txLineCreate.mock.calls[1][0].data;
      expect(discountLineCall.lineType).toBe(LineType.DISCOUNT);

      // Discount should be 10% of pro-rata amount (295455 * 0.10 = 29546 with banker's rounding)
      // NOT 10% of full fee (500000 * 0.10 = 50000)
      expect(discountLineCall.unitPriceCents).toBe(-29546);
      expect(discountLineCall.description).toContain('Sibling Discount');
    });
  });

  describe('Pro-rata with custom fee override', () => {
    it('should apply pro-rata to custom fee override', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2025-01-15'); // Mid-month
      const mockEnrollment = {
        ...createMockEnrollment(enrollmentStartDate, null),
        customFeeOverrideCents: 600000, // R6000 custom fee
      };

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      // Pro-rata on custom fee
      const proRataAmount = 354545; // Approx 600000 * (13/22)
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      // Should call calculateProRata with custom fee, not standard fee
      expect(proRataService.calculateProRata).toHaveBeenCalledWith(
        600000, // Custom fee
        expect.any(Date),
        expect.any(Date),
        TENANT_ID,
      );

      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.unitPriceCents).toBe(proRataAmount);
    });
  });

  describe('Edge cases', () => {
    it('should handle enrollment starting and ending within same billing period', async () => {
      // Arrange
      setupCommonMocks();

      // Child enrolled and withdrew in same month
      const enrollmentStartDate = new Date('2025-01-05');
      const enrollmentEndDate = new Date('2025-01-15');
      const mockEnrollment = createMockEnrollment(
        enrollmentStartDate,
        enrollmentEndDate,
      );

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      const proRataAmount = 227273; // Short period
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-01', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).toHaveBeenCalled();

      const [, startDate, endDate] =
        proRataService.calculateProRata.mock.calls[0];
      expect(startDate.getDate()).toBe(5);
      expect(endDate.getDate()).toBe(15);
    });

    it('should handle February billing period correctly', async () => {
      // Arrange
      setupCommonMocks();

      const enrollmentStartDate = new Date('2025-02-15'); // Mid-Feb
      const mockEnrollment = createMockEnrollment(enrollmentStartDate, null);

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        mockEnrollment,
      ]);

      const proRataAmount = 250000;
      proRataService.calculateProRata.mockResolvedValue(proRataAmount);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: proRataAmount,
        status: 'DRAFT',
        xeroInvoiceId: null,
      } as any);

      // Act
      await service.generateMonthlyInvoices(TENANT_ID, '2025-02', USER_ID);

      // Assert
      expect(proRataService.calculateProRata).toHaveBeenCalled();

      const txLineCreate = (prisma as any).invoiceLine.create;
      const lineItemCall = txLineCreate.mock.calls[0][0].data;
      expect(lineItemCall.description).toContain('Feb');
      expect(lineItemCall.description).toContain('15 Feb');
      expect(lineItemCall.description).toContain('28 Feb');
    });

    it('should handle multiple children with different pro-rata scenarios', async () => {
      // Arrange
      setupCommonMocks();

      // Child 1: Full month
      const enrollment1 = createMockEnrollment(new Date('2024-01-01'), null);

      // Child 2: Mid-month start
      const enrollment2 = {
        ...createMockEnrollment(new Date('2025-01-15'), null),
        id: 'enrollment-002',
        childId: 'child-002',
        child: {
          id: 'child-002',
          parentId: 'parent-002',
          firstName: 'Jane',
          lastName: 'Doe',
        },
      };

      (prisma.enrollment.findMany as jest.Mock).mockResolvedValue([
        enrollment1,
        enrollment2,
      ]);

      // Child 2 gets pro-rata
      proRataService.calculateProRata.mockResolvedValue(295455);

      invoiceRepo.findById.mockResolvedValue({
        id: 'invoice-001',
        invoiceNumber: 'INV-2025-001',
        totalCents: 500000,
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
        '2025-01',
        USER_ID,
      );

      // Assert
      expect(result.invoicesCreated).toBe(2);

      // ProRataService should only be called once (for child 2)
      expect(proRataService.calculateProRata).toHaveBeenCalledTimes(1);

      // First invoice (full month) - no pro-rata (created inside $transaction)
      const txLineCreate = (prisma as any).invoiceLine.create;
      const firstInvoiceLineCall = txLineCreate.mock.calls[0][0].data;
      expect(firstInvoiceLineCall.unitPriceCents).toBe(MONTHLY_FEE_CENTS);
      expect(firstInvoiceLineCall.description).not.toContain('Pro-rata');

      // Second invoice (mid-month) - with pro-rata
      const secondInvoiceLineCall = txLineCreate.mock.calls[1][0].data;
      expect(secondInvoiceLineCall.unitPriceCents).toBe(295455);
      expect(secondInvoiceLineCall.description).toContain('Pro-rata');
    });
  });
});
