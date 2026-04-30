/**
 * createInvoice (ad-hoc path) — counter-in-transaction tests
 * AUDIT-BILL-07 follow-up
 *
 * Verifies that generateNextNumber() is called INSIDE the prisma.$transaction
 * callback so that a failed INSERT rolls back the counter UPDATE, preventing
 * invoice number gaps.
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

describe('InvoiceGenerationService.createInvoice — counter in transaction (AUDIT-BILL-07)', () => {
  let service: InvoiceGenerationService;
  let invoiceNumberService: jest.Mocked<InvoiceNumberService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const TENANT_ID = 'tenant-abc';
  const CHILD_ID = 'child-001';
  const PARENT_ID = 'parent-001';
  const USER_ID = 'user-001';
  const BILLING_PERIOD_START = new Date('2025-03-01T00:00:00.000Z');
  const BILLING_PERIOD_END = new Date('2025-03-31T00:00:00.000Z');

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
      firstName: 'Jane',
      lastName: 'Smith',
    },
    feeStructure: {
      id: 'fee-001',
      name: 'Monthly Fee',
      amountCents: 350000,
      vatInclusive: false,
    },
  } as any;

  const mockCreatedInvoice = {
    id: 'invoice-001',
    tenantId: TENANT_ID,
    invoiceNumber: 'INV-2025-042',
    parentId: PARENT_ID,
    childId: CHILD_ID,
    billingPeriodStart: BILLING_PERIOD_START,
    billingPeriodEnd: BILLING_PERIOD_END,
    issueDate: new Date('2025-03-01T12:00:00.000Z'),
    dueDate: new Date('2025-03-31T12:00:00.000Z'),
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

  // Captures whether generateNextNumber was called during the transaction callback
  let generateNextNumberCalledDuringTx: boolean;

  function buildModule(txInvoiceCreateImpl: () => Promise<any>) {
    generateNextNumberCalledDuringTx = false;

    const generateNextNumberMock = jest
      .fn()
      .mockImplementation(async (_tenantId: string, _year: number, tx: any) => {
        // The tx arg is truthy only when called inside prisma.$transaction
        if (tx !== undefined) {
          generateNextNumberCalledDuringTx = true;
        }
        return 'INV-2025-042';
      });

    // prisma.$transaction executes the callback immediately with a mock tx client
    const mockTxInvoice = {
      create: jest.fn().mockImplementation(txInvoiceCreateImpl),
    };
    const mockTxClient = { invoice: mockTxInvoice };

    const mockPrisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: any) => cb(mockTxClient)),
    };

    return {
      mockPrisma,
      mockTxInvoice,
      generateNextNumberMock,
    };
  }

  describe('on success', () => {
    let mockPrisma: any;
    let mockTxInvoice: any;
    let generateNextNumberMock: jest.Mock;

    beforeEach(async () => {
      const built = buildModule(() => Promise.resolve(mockCreatedInvoice));
      mockPrisma = built.mockPrisma;
      mockTxInvoice = built.mockTxInvoice;
      generateNextNumberMock = built.generateNextNumberMock;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InvoiceGenerationService,
          { provide: PrismaService, useValue: mockPrisma },
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
            useValue: { create: jest.fn(), findByInvoice: jest.fn() },
          },
          { provide: TenantRepository, useValue: { findById: jest.fn() } },
          { provide: ParentRepository, useValue: { findById: jest.fn() } },
          {
            provide: EnrollmentService,
            useValue: { applySiblingDiscount: jest.fn() },
          },
          {
            provide: AuditLogService,
            useValue: { logCreate: jest.fn().mockResolvedValue(undefined) },
          },
          {
            provide: XeroSyncService,
            useValue: { createInvoiceDraft: jest.fn() },
          },
          {
            provide: ProRataService,
            useValue: { calculateProRata: jest.fn() },
          },
          {
            provide: CreditBalanceService,
            useValue: {
              getAvailableCredit: jest.fn().mockResolvedValue(0),
              applyCreditToInvoice: jest.fn(),
            },
          },
          {
            provide: InvoiceNumberService,
            useValue: { generateNextNumber: generateNextNumberMock },
          },
        ],
      }).compile();

      service = module.get<InvoiceGenerationService>(InvoiceGenerationService);
      auditLogService = module.get(AuditLogService);
      invoiceNumberService = module.get(InvoiceNumberService);
    });

    it('calls generateNextNumber inside the transaction callback', async () => {
      await service.createInvoice(
        TENANT_ID,
        mockEnrollment,
        BILLING_PERIOD_START,
        BILLING_PERIOD_END,
        USER_ID,
      );

      expect(generateNextNumberCalledDuringTx).toBe(true);
    });

    it('returns the created invoice with the generated number', async () => {
      const invoice = await service.createInvoice(
        TENANT_ID,
        mockEnrollment,
        BILLING_PERIOD_START,
        BILLING_PERIOD_END,
        USER_ID,
      );

      expect(invoice.invoiceNumber).toBe('INV-2025-042');
      expect(invoice.id).toBe('invoice-001');
    });

    it('inserts the row via tx.invoice.create (not the repo)', async () => {
      await service.createInvoice(
        TENANT_ID,
        mockEnrollment,
        BILLING_PERIOD_START,
        BILLING_PERIOD_END,
        USER_ID,
      );

      expect(mockTxInvoice.create).toHaveBeenCalledTimes(1);
      expect(mockTxInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            invoiceNumber: 'INV-2025-042',
            childId: CHILD_ID,
          }),
        }),
      );
    });

    it('writes the audit log after the transaction completes', async () => {
      await service.createInvoice(
        TENANT_ID,
        mockEnrollment,
        BILLING_PERIOD_START,
        BILLING_PERIOD_END,
        USER_ID,
      );

      expect(auditLogService.logCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Invoice',
          entityId: 'invoice-001',
          afterValue: expect.objectContaining({
            invoiceNumber: 'INV-2025-042',
          }),
        }),
      );
    });
  });

  describe('on insert failure', () => {
    let generateNextNumberMock: jest.Mock;

    beforeEach(async () => {
      // tx.invoice.create rejects — simulates a DB constraint violation
      const built = buildModule(() =>
        Promise.reject(new Error('unique constraint violation')),
      );
      generateNextNumberMock = built.generateNextNumberMock;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InvoiceGenerationService,
          { provide: PrismaService, useValue: built.mockPrisma },
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
            useValue: { create: jest.fn(), findByInvoice: jest.fn() },
          },
          { provide: TenantRepository, useValue: { findById: jest.fn() } },
          { provide: ParentRepository, useValue: { findById: jest.fn() } },
          {
            provide: EnrollmentService,
            useValue: { applySiblingDiscount: jest.fn() },
          },
          {
            provide: AuditLogService,
            useValue: { logCreate: jest.fn().mockResolvedValue(undefined) },
          },
          {
            provide: XeroSyncService,
            useValue: { createInvoiceDraft: jest.fn() },
          },
          {
            provide: ProRataService,
            useValue: { calculateProRata: jest.fn() },
          },
          {
            provide: CreditBalanceService,
            useValue: {
              getAvailableCredit: jest.fn().mockResolvedValue(0),
              applyCreditToInvoice: jest.fn(),
            },
          },
          {
            provide: InvoiceNumberService,
            useValue: { generateNextNumber: generateNextNumberMock },
          },
        ],
      }).compile();

      service = module.get<InvoiceGenerationService>(InvoiceGenerationService);
    });

    it('propagates the insert error', async () => {
      await expect(
        service.createInvoice(
          TENANT_ID,
          mockEnrollment,
          BILLING_PERIOD_START,
          BILLING_PERIOD_END,
          USER_ID,
        ),
      ).rejects.toThrow('unique constraint violation');
    });

    it('counter call was made inside the tx (rollback will undo it)', async () => {
      // generateNextNumber was called (counter was touched) but because the
      // tx.invoice.create threw, prisma rolls the entire transaction back —
      // including the counter UPDATE. We assert that the call happened inside
      // the tx callback (tx arg truthy) so the rollback semantics apply.
      await expect(
        service.createInvoice(
          TENANT_ID,
          mockEnrollment,
          BILLING_PERIOD_START,
          BILLING_PERIOD_END,
          USER_ID,
        ),
      ).rejects.toThrow();

      // generateNextNumber was invoked with a tx client (not standalone)
      expect(generateNextNumberCalledDuringTx).toBe(true);
    });
  });
});
