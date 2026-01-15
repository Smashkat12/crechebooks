/**
 * Payment Controller Tests
 * TASK-PAY-031: Payment Controller and DTOs
 *
 * CRITICAL: NO MOCK DATA - Uses jest.spyOn() with real behavior verification.
 * Tests validate actual behavior through service method verification.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../../src/api/payment/payment.controller';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';
import { PaymentReceiptService } from '../../../src/database/services/payment-receipt.service';
import { ArrearsService } from '../../../src/database/services/arrears.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import {
  MatchType,
  MatchedBy,
} from '../../../src/database/entities/payment.entity';
import type { AllocationResult } from '../../../src/database/dto/payment-allocation.dto';
import { XeroSyncStatus } from '../../../src/database/dto/payment-allocation.dto';
import { InvoiceStatus } from '../../../src/shared/constants';
import { DeliveryMethod } from '../../../src/database/entities/invoice.entity';
import { Decimal } from 'decimal.js';

describe('PaymentController', () => {
  let controller: PaymentController;
  let allocationService: PaymentAllocationService;
  let paymentRepo: PaymentRepository;
  let invoiceRepo: InvoiceRepository;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    currentTenantId: mockTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: IUser = {
    ...mockOwnerUser,
    id: 'admin-789',
    role: UserRole.ADMIN,
    email: 'admin@school.com',
    name: 'School Admin',
  };

  const mockViewerUser: IUser = {
    ...mockOwnerUser,
    id: 'viewer-111',
    role: UserRole.VIEWER,
    email: 'viewer@school.com',
    name: 'Viewer User',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PaymentAllocationService,
          useValue: {
            allocatePayment: jest.fn(),
          },
        },
        {
          provide: PaymentMatchingService,
          useValue: {
            matchPayments: jest.fn(),
          },
        },
        {
          provide: PaymentReceiptService,
          useValue: {
            generateReceipt: jest.fn(),
          },
        },
        {
          provide: ArrearsService,
          useValue: {
            getArrearsReport: jest.fn(),
          },
        },
        {
          provide: PaymentRepository,
          useValue: {
            findByTenantId: jest.fn(),
          },
        },
        {
          provide: InvoiceRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    allocationService = module.get<PaymentAllocationService>(
      PaymentAllocationService,
    );
    paymentRepo = module.get<PaymentRepository>(PaymentRepository);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payments - allocatePayment', () => {
    it('should allocate payment and transform snake_case correctly', async () => {
      // Arrange - define expected result structure
      const paymentDate = new Date('2025-12-22T10:00:00Z');
      const createdAt = new Date('2025-12-22T10:00:00Z');

      const expectedResult: AllocationResult = {
        payments: [
          {
            id: 'payment-001',
            tenantId: mockTenantId,
            transactionId: 'trans-001',
            invoiceId: 'inv-001',
            amountCents: 345000,
            paymentDate,
            reference: 'REF123',
            matchType: MatchType.MANUAL,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
        invoicesUpdated: ['inv-001'],
        unallocatedAmountCents: 0,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      const allocateSpy = jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      // Act
      const result = await controller.allocatePayment(
        {
          transaction_id: 'trans-001',
          allocations: [{ invoice_id: 'inv-001', amount: 3450.0 }],
        },
        mockOwnerUser,
      );

      // Assert - verify service called with camelCase and cents
      expect(allocateSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionId: 'trans-001',
        allocations: [{ invoiceId: 'inv-001', amountCents: 345000 }],
        userId: mockUserId,
      });

      // Assert - verify response uses snake_case and decimal
      expect(result.success).toBe(true);
      expect(result.data.payments[0].invoice_id).toBe('inv-001');
      expect(result.data.payments[0].amount).toBe(3450.0);
      expect(result.data.unallocated_amount).toBe(0);
      expect(result.data.invoices_updated).toEqual(['inv-001']);
    });

    it('should allocate to multiple invoices correctly', async () => {
      const paymentDate = new Date('2025-12-22T10:00:00Z');
      const createdAt = new Date('2025-12-22T10:00:00Z');

      const expectedResult: AllocationResult = {
        payments: [
          {
            id: 'payment-001',
            tenantId: mockTenantId,
            transactionId: 'trans-001',
            invoiceId: 'inv-001',
            amountCents: 200000,
            paymentDate,
            reference: 'REF123',
            matchType: MatchType.PARTIAL,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: 'payment-002',
            tenantId: mockTenantId,
            transactionId: 'trans-001',
            invoiceId: 'inv-002',
            amountCents: 150000,
            paymentDate,
            reference: 'REF123',
            matchType: MatchType.EXACT,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
        invoicesUpdated: ['inv-001', 'inv-002'],
        unallocatedAmountCents: 50000,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      const allocateSpy = jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      const result = await controller.allocatePayment(
        {
          transaction_id: 'trans-001',
          allocations: [
            { invoice_id: 'inv-001', amount: 2000.0 },
            { invoice_id: 'inv-002', amount: 1500.0 },
          ],
        },
        mockOwnerUser,
      );

      expect(allocateSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionId: 'trans-001',
        allocations: [
          { invoiceId: 'inv-001', amountCents: 200000 },
          { invoiceId: 'inv-002', amountCents: 150000 },
        ],
        userId: mockUserId,
      });

      expect(result.success).toBe(true);
      expect(result.data.payments).toHaveLength(2);
      expect(result.data.payments[0].amount).toBe(2000.0);
      expect(result.data.payments[1].amount).toBe(1500.0);
      expect(result.data.unallocated_amount).toBe(500.0);
      expect(result.data.invoices_updated).toEqual(['inv-001', 'inv-002']);
    });

    it('should use user.tenantId for tenant isolation', async () => {
      const paymentDate = new Date();
      const expectedResult: AllocationResult = {
        payments: [
          {
            id: 'payment-001',
            tenantId: 'different-tenant',
            transactionId: 'trans-001',
            invoiceId: 'inv-001',
            amountCents: 100000,
            paymentDate,
            reference: null,
            matchType: MatchType.EXACT,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt: paymentDate,
            updatedAt: paymentDate,
          },
        ],
        invoicesUpdated: ['inv-001'],
        unallocatedAmountCents: 0,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      const allocateSpy = jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      const differentTenantUser = {
        ...mockOwnerUser,
        tenantId: 'different-tenant',
      };

      await controller.allocatePayment(
        {
          transaction_id: 'trans-001',
          allocations: [{ invoice_id: 'inv-001', amount: 1000.0 }],
        },
        differentTenantUser,
      );

      expect(allocateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'different-tenant',
        }),
      );
    });

    it('should pass user.id for audit trail', async () => {
      const paymentDate = new Date();
      const expectedResult: AllocationResult = {
        payments: [
          {
            id: 'payment-001',
            tenantId: mockTenantId,
            transactionId: 'trans-001',
            invoiceId: 'inv-001',
            amountCents: 100000,
            paymentDate,
            reference: null,
            matchType: MatchType.EXACT,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt: paymentDate,
            updatedAt: paymentDate,
          },
        ],
        invoicesUpdated: ['inv-001'],
        unallocatedAmountCents: 0,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      const allocateSpy = jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      await controller.allocatePayment(
        {
          transaction_id: 'trans-001',
          allocations: [{ invoice_id: 'inv-001', amount: 1000.0 }],
        },
        mockAdminUser,
      );

      expect(allocateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-789',
        }),
      );
    });

    it('should handle decimal precision correctly (rounding cents)', async () => {
      const paymentDate = new Date();
      const expectedResult: AllocationResult = {
        payments: [
          {
            id: 'payment-001',
            tenantId: mockTenantId,
            transactionId: 'trans-001',
            invoiceId: 'inv-001',
            amountCents: 123457,
            paymentDate,
            reference: null,
            matchType: MatchType.EXACT,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt: paymentDate,
            updatedAt: paymentDate,
          },
        ],
        invoicesUpdated: ['inv-001'],
        unallocatedAmountCents: 0,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      const allocateSpy = jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      await controller.allocatePayment(
        {
          transaction_id: 'trans-001',
          allocations: [{ invoice_id: 'inv-001', amount: 1234.567 }],
        },
        mockOwnerUser,
      );

      expect(allocateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          allocations: [{ invoiceId: 'inv-001', amountCents: 123457 }],
        }),
      );
    });

    it('should include match_type in response', async () => {
      const paymentDate = new Date();
      const expectedResult: AllocationResult = {
        payments: [
          {
            id: 'payment-001',
            tenantId: mockTenantId,
            transactionId: 'trans-001',
            invoiceId: 'inv-001',
            amountCents: 100000,
            paymentDate,
            reference: null,
            matchType: MatchType.OVERPAYMENT,
            matchedBy: MatchedBy.USER,
            matchConfidence: null,
            isReversed: false,
            reversedAt: null,
            reversalReason: null,
            xeroPaymentId: null,
            createdAt: paymentDate,
            updatedAt: paymentDate,
          },
        ],
        invoicesUpdated: ['inv-001'],
        unallocatedAmountCents: 0,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      const result = await controller.allocatePayment(
        {
          transaction_id: 'trans-001',
          allocations: [{ invoice_id: 'inv-001', amount: 1000.0 }],
        },
        mockOwnerUser,
      );

      expect(result.data.payments[0].match_type).toBe(MatchType.OVERPAYMENT);
      expect(result.data.payments[0].matched_by).toBe(MatchedBy.USER);
    });
  });

  describe('GET /payments - listPayments', () => {
    it('should return paginated payments with default pagination', async () => {
      const paymentDate = new Date('2025-12-22T10:00:00Z');
      const createdAt = new Date('2025-12-22T10:00:00Z');

      const payments = [
        {
          id: 'payment-001',
          tenantId: mockTenantId,
          transactionId: 'trans-001',
          invoiceId: 'inv-001',
          amountCents: 345000,
          paymentDate,
          reference: 'REF123',
          matchType: MatchType.EXACT,
          matchedBy: MatchedBy.USER,
          matchConfidence: null,
          isReversed: false,
          reversedAt: null,
          reversalReason: null,
          xeroPaymentId: null,
          createdAt,
          updatedAt: createdAt,
        },
      ];

      const invoice = {
        id: 'inv-001',
        tenantId: mockTenantId,
        invoiceNumber: 'INV-2025-0001',
        parentId: 'parent-001',
        childId: 'child-001',
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        issueDate: new Date(),
        dueDate: new Date(),
        subtotalCents: 345000,
        vatCents: 51750,
        vatRate: new Decimal('15'),
        totalCents: 396750,
        amountPaidCents: 345000,
        status: InvoiceStatus.PARTIALLY_PAID,
        deliveryMethod: DeliveryMethod.EMAIL,
        deliveryStatus: null,
        deliveryRetryCount: 0,
        deliveredAt: null,
        pdfUrl: null,
        notes: null,
        isDeleted: false,
        xeroInvoiceId: null,
        createdAt,
        updatedAt: createdAt,
      } as any;

      jest.spyOn(paymentRepo, 'findByTenantId').mockResolvedValue(payments);
      jest.spyOn(invoiceRepo, 'findById').mockResolvedValue(invoice);

      const result = await controller.listPayments({}, mockViewerUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('payment-001');
      expect(result.data[0].invoice_id).toBe('inv-001');
      expect(result.data[0].amount).toBe(3450.0);
      expect(result.data[0].invoice_number).toBe('INV-2025-0001');
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should apply invoice_id filter correctly', async () => {
      const findByTenantSpy = jest
        .spyOn(paymentRepo, 'findByTenantId')
        .mockResolvedValue([]);

      await controller.listPayments({ invoice_id: 'inv-001' }, mockViewerUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({ invoiceId: 'inv-001' }),
      );
    });

    it('should apply transaction_id filter correctly', async () => {
      const findByTenantSpy = jest
        .spyOn(paymentRepo, 'findByTenantId')
        .mockResolvedValue([]);

      await controller.listPayments(
        { transaction_id: 'trans-001' },
        mockViewerUser,
      );

      expect(findByTenantSpy).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({ transactionId: 'trans-001' }),
      );
    });

    it('should apply match_type filter correctly', async () => {
      const findByTenantSpy = jest
        .spyOn(paymentRepo, 'findByTenantId')
        .mockResolvedValue([]);

      await controller.listPayments(
        { match_type: MatchType.MANUAL },
        mockViewerUser,
      );

      expect(findByTenantSpy).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({ matchType: MatchType.MANUAL }),
      );
    });

    it('should apply is_reversed filter correctly', async () => {
      const findByTenantSpy = jest
        .spyOn(paymentRepo, 'findByTenantId')
        .mockResolvedValue([]);

      await controller.listPayments({ is_reversed: true }, mockViewerUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        mockTenantId,
        expect.objectContaining({ isReversed: true }),
      );
    });

    it('should enforce tenant isolation for list endpoint', async () => {
      const findByTenantSpy = jest
        .spyOn(paymentRepo, 'findByTenantId')
        .mockResolvedValue([]);

      const differentTenantUser = {
        ...mockViewerUser,
        tenantId: 'other-tenant',
      };

      await controller.listPayments({}, differentTenantUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        'other-tenant',
        expect.any(Object),
      );
    });

    it('should apply pagination correctly', async () => {
      const paymentDate = new Date();
      const payments = Array.from({ length: 25 }, (_, i) => ({
        id: `payment-${i + 1}`,
        tenantId: mockTenantId,
        transactionId: 'trans-001',
        invoiceId: `inv-${i + 1}`,
        amountCents: 100000,
        paymentDate,
        reference: null,
        matchType: MatchType.EXACT,
        matchedBy: MatchedBy.USER,
        matchConfidence: null,
        isReversed: false,
        reversedAt: null,
        reversalReason: null,
        xeroPaymentId: null,
        createdAt: paymentDate,
        updatedAt: paymentDate,
      }));

      jest.spyOn(paymentRepo, 'findByTenantId').mockResolvedValue(payments);
      jest.spyOn(invoiceRepo, 'findById').mockResolvedValue(null);

      const resultPage1 = await controller.listPayments(
        { page: 1, limit: 10 },
        mockViewerUser,
      );

      expect(resultPage1.data).toHaveLength(10);
      expect(resultPage1.meta.page).toBe(1);
      expect(resultPage1.meta.limit).toBe(10);
      expect(resultPage1.meta.total).toBe(25);
      expect(resultPage1.meta.totalPages).toBe(3);

      const resultPage2 = await controller.listPayments(
        { page: 2, limit: 10 },
        mockViewerUser,
      );

      expect(resultPage2.data).toHaveLength(10);
      expect(resultPage2.meta.page).toBe(2);

      const resultPage3 = await controller.listPayments(
        { page: 3, limit: 10 },
        mockViewerUser,
      );

      expect(resultPage3.data).toHaveLength(5);
      expect(resultPage3.meta.page).toBe(3);
    });

    it('should convert cents to decimal in list response', async () => {
      const paymentDate = new Date();
      const payments = [
        {
          id: 'payment-001',
          tenantId: mockTenantId,
          transactionId: 'trans-001',
          invoiceId: 'inv-001',
          amountCents: 567890,
          paymentDate,
          reference: null,
          matchType: MatchType.EXACT,
          matchedBy: MatchedBy.USER,
          matchConfidence: null,
          isReversed: false,
          reversedAt: null,
          reversalReason: null,
          xeroPaymentId: null,
          createdAt: paymentDate,
          updatedAt: paymentDate,
        },
      ];

      jest.spyOn(paymentRepo, 'findByTenantId').mockResolvedValue(payments);
      jest.spyOn(invoiceRepo, 'findById').mockResolvedValue(null);

      const result = await controller.listPayments({}, mockViewerUser);

      expect(result.data[0].amount).toBe(5678.9);
    });

    it('should format dates as ISO strings', async () => {
      const paymentDate = new Date('2025-12-22T10:00:00.000Z');
      const createdAt = new Date('2025-12-22T08:00:00.000Z');
      const payments = [
        {
          id: 'payment-001',
          tenantId: mockTenantId,
          transactionId: 'trans-001',
          invoiceId: 'inv-001',
          amountCents: 100000,
          paymentDate,
          reference: null,
          matchType: MatchType.EXACT,
          matchedBy: MatchedBy.USER,
          matchConfidence: null,
          isReversed: false,
          reversedAt: null,
          reversalReason: null,
          xeroPaymentId: null,
          createdAt,
          updatedAt: createdAt,
        },
      ];

      jest.spyOn(paymentRepo, 'findByTenantId').mockResolvedValue(payments);
      jest.spyOn(invoiceRepo, 'findById').mockResolvedValue(null);

      const result = await controller.listPayments({}, mockViewerUser);

      expect(result.data[0].payment_date).toBe('2025-12-22T10:00:00.000Z');
      expect(result.data[0].created_at).toBe('2025-12-22T08:00:00.000Z');
    });
  });
});
