/**
 * Arrears Dashboard Controller Tests
 * TASK-PAY-033: Arrears Dashboard Endpoint
 *
 * Tests for GET /payments/arrears endpoint.
 * Uses jest.spyOn() for service verification - NO MOCK DATA.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../../src/api/payment/payment.controller';
import { ArrearsService } from '../../../src/database/services/arrears.service';
import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type {
  ArrearsReport,
  DebtorSummary,
  ArrearsInvoice,
} from '../../../src/database/dto/arrears.dto';

describe('PaymentController - getArrearsReport', () => {
  let controller: PaymentController;
  let arrearsService: ArrearsService;

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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: IUser = {
    id: 'admin-789',
    tenantId: mockTenantId,
    auth0Id: 'auth0|admin789',
    email: 'admin@school.com',
    role: UserRole.ADMIN,
    name: 'School Admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAccountantUser: IUser = {
    id: 'accountant-111',
    tenantId: mockTenantId,
    auth0Id: 'auth0|accountant111',
    email: 'accountant@school.com',
    role: UserRole.ACCOUNTANT,
    name: 'Accountant User',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: ArrearsService,
          useValue: { getArrearsReport: jest.fn() },
        },
        {
          provide: PaymentMatchingService,
          useValue: { matchPayments: jest.fn() },
        },
        {
          provide: PaymentAllocationService,
          useValue: { allocatePayment: jest.fn() },
        },
        {
          provide: PaymentRepository,
          useValue: { findByTenantId: jest.fn() },
        },
        {
          provide: InvoiceRepository,
          useValue: { findById: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    arrearsService = module.get<ArrearsService>(ArrearsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /payments/arrears', () => {
    it('should call service and transform snake_case response correctly', async () => {
      // Arrange
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 1200000, // R12,000
          totalInvoices: 15,
          aging: {
            currentCents: 250000,
            days30Cents: 500000,
            days60Cents: 300000,
            days90PlusCents: 150000,
          },
        },
        topDebtors: [
          {
            parentId: 'parent-001',
            parentName: 'John Smith',
            parentEmail: 'john@example.com',
            parentPhone: '+27123456789',
            totalOutstandingCents: 500000,
            oldestInvoiceDate: new Date('2025-01-15'),
            invoiceCount: 3,
            maxDaysOverdue: 45,
          },
        ],
        invoices: [
          {
            invoiceId: 'inv-001',
            invoiceNumber: 'INV-2025-0001',
            parentId: 'parent-001',
            parentName: 'John Smith',
            childId: 'child-001',
            childName: 'Emma Smith',
            issueDate: new Date('2025-01-01'),
            dueDate: new Date('2025-01-15'),
            totalCents: 345000,
            amountPaidCents: 100000,
            outstandingCents: 245000,
            daysOverdue: 30,
            agingBucket: '30' as const,
          },
        ],
        generatedAt: new Date('2025-12-22T10:00:00.000Z'),
      };

      const reportSpy = jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      // Act
      const result = await controller.getArrearsReport({}, mockOwnerUser);

      // Assert - service called with correct parameters
      expect(reportSpy).toHaveBeenCalledWith(mockTenantId, {
        dateFrom: undefined,
        dateTo: undefined,
        parentId: undefined,
        minAmountCents: undefined,
      });

      // Assert - response uses snake_case and decimal amounts
      expect(result.success).toBe(true);
      expect(result.data.summary.total_outstanding).toBe(12000); // cents -> decimal
      expect(result.data.summary.total_invoices).toBe(15);
      expect(result.data.summary.aging.current).toBe(2500);
      expect(result.data.summary.aging.days_30).toBe(5000);
      expect(result.data.top_debtors[0].parent_id).toBe('parent-001');
      expect(result.data.top_debtors[0].total_outstanding).toBe(5000);
      expect(result.data.invoices[0].invoice_id).toBe('inv-001');
      expect(result.data.invoices[0].outstanding).toBe(2450);
    });

    it('should transform query filters from snake_case to camelCase', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 0,
          totalInvoices: 0,
          aging: {
            currentCents: 0,
            days30Cents: 0,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      const reportSpy = jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-12-31');

      await controller.getArrearsReport(
        {
          date_from: dateFrom,
          date_to: dateTo,
          parent_id: 'parent-001',
          min_amount: 100.0, // decimal
        },
        mockOwnerUser,
      );

      expect(reportSpy).toHaveBeenCalledWith(mockTenantId, {
        dateFrom,
        dateTo,
        parentId: 'parent-001',
        minAmountCents: 10000, // decimal -> cents
      });
    });

    it('should enforce tenant isolation via user context', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 0,
          totalInvoices: 0,
          aging: {
            currentCents: 0,
            days30Cents: 0,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      const reportSpy = jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const differentTenantUser = {
        ...mockOwnerUser,
        tenantId: 'different-tenant',
      };

      await controller.getArrearsReport({}, differentTenantUser);

      expect(reportSpy).toHaveBeenCalledWith(
        'different-tenant',
        expect.any(Object),
      );
    });

    it('should return empty arrays when no arrears exist', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 0,
          totalInvoices: 0,
          aging: {
            currentCents: 0,
            days30Cents: 0,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport({}, mockOwnerUser);

      expect(result.success).toBe(true);
      expect(result.data.summary.total_outstanding).toBe(0);
      expect(result.data.top_debtors).toHaveLength(0);
      expect(result.data.invoices).toHaveLength(0);
    });

    it('should format dates as YYYY-MM-DD strings', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 100000,
          totalInvoices: 1,
          aging: {
            currentCents: 100000,
            days30Cents: 0,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: [
          {
            parentId: 'parent-001',
            parentName: 'John Smith',
            parentEmail: 'john@example.com',
            parentPhone: '+27123456789',
            totalOutstandingCents: 100000,
            oldestInvoiceDate: new Date('2025-06-15T14:30:00.000Z'),
            invoiceCount: 1,
            maxDaysOverdue: 5,
          },
        ],
        invoices: [
          {
            invoiceId: 'inv-001',
            invoiceNumber: 'INV-2025-0001',
            parentId: 'parent-001',
            parentName: 'John Smith',
            childId: 'child-001',
            childName: 'Emma Smith',
            issueDate: new Date('2025-06-01T10:00:00.000Z'),
            dueDate: new Date('2025-06-15T10:00:00.000Z'),
            totalCents: 100000,
            amountPaidCents: 0,
            outstandingCents: 100000,
            daysOverdue: 5,
            agingBucket: 'current' as const,
          },
        ],
        generatedAt: new Date('2025-12-22T10:00:00.000Z'),
      };

      jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport({}, mockOwnerUser);

      expect(result.data.top_debtors[0].oldest_invoice_date).toBe('2025-06-15');
      expect(result.data.invoices[0].issue_date).toBe('2025-06-01');
      expect(result.data.invoices[0].due_date).toBe('2025-06-15');
      expect(result.data.generated_at).toBe('2025-12-22T10:00:00.000Z');
    });

    it('should apply debtor_limit to top_debtors', async () => {
      const mockDebtors: DebtorSummary[] = Array.from(
        { length: 20 },
        (_, i) => ({
          parentId: `parent-${i + 1}`,
          parentName: `Parent ${i + 1}`,
          parentEmail: `parent${i + 1}@example.com`,
          parentPhone: null,
          totalOutstandingCents: 100000 * (20 - i),
          oldestInvoiceDate: new Date('2025-01-15'),
          invoiceCount: 1,
          maxDaysOverdue: 30,
        }),
      );

      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 2100000,
          totalInvoices: 20,
          aging: {
            currentCents: 0,
            days30Cents: 2100000,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: mockDebtors,
        invoices: [],
        generatedAt: new Date(),
      };

      jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport(
        { debtor_limit: 5 },
        mockOwnerUser,
      );

      expect(result.data.top_debtors).toHaveLength(5);
      expect(result.data.top_debtors[0].parent_id).toBe('parent-1');
    });

    it('should use default debtor_limit of 10 when not specified', async () => {
      const mockDebtors: DebtorSummary[] = Array.from(
        { length: 15 },
        (_, i) => ({
          parentId: `parent-${i + 1}`,
          parentName: `Parent ${i + 1}`,
          parentEmail: null,
          parentPhone: null,
          totalOutstandingCents: 100000,
          oldestInvoiceDate: new Date('2025-01-15'),
          invoiceCount: 1,
          maxDaysOverdue: 30,
        }),
      );

      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 1500000,
          totalInvoices: 15,
          aging: {
            currentCents: 0,
            days30Cents: 1500000,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: mockDebtors,
        invoices: [],
        generatedAt: new Date(),
      };

      jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport({}, mockOwnerUser);

      expect(result.data.top_debtors).toHaveLength(10);
    });

    it('should propagate service errors without catching', async () => {
      const serviceError = new Error('Database connection failed');
      jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockRejectedValue(serviceError);

      await expect(
        controller.getArrearsReport({}, mockOwnerUser),
      ).rejects.toThrow('Database connection failed');
    });

    it('should work for ADMIN users same as OWNER', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 100000,
          totalInvoices: 1,
          aging: {
            currentCents: 100000,
            days30Cents: 0,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      const reportSpy = jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport({}, mockAdminUser);

      expect(reportSpy).toHaveBeenCalledWith(mockTenantId, expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should work for ACCOUNTANT users', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 100000,
          totalInvoices: 1,
          aging: {
            currentCents: 100000,
            days30Cents: 0,
            days60Cents: 0,
            days90PlusCents: 0,
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      const reportSpy = jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport({}, mockAccountantUser);

      expect(reportSpy).toHaveBeenCalledWith(mockTenantId, expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should correctly transform all aging bucket values', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 1000000,
          totalInvoices: 4,
          aging: {
            currentCents: 250000, // R2,500
            days30Cents: 300000, // R3,000
            days60Cents: 200000, // R2,000
            days90PlusCents: 250000, // R2,500
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport({}, mockOwnerUser);

      expect(result.data.summary.aging.current).toBe(2500);
      expect(result.data.summary.aging.days_30).toBe(3000);
      expect(result.data.summary.aging.days_60).toBe(2000);
      expect(result.data.summary.aging.days_90_plus).toBe(2500);
    });
  });
});
