/**
 * ParentPortalController.getStatementDetail — unit tests
 *
 * The controller delegates math to StatementGenerationService.computeLiveLedger
 * (the same authority used by the admin live ledger endpoint). These tests
 * verify the controller wiring: that the right period is requested, response
 * shape is correct, and credit-balance lines from the service are surfaced.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, type CanActivate } from '@nestjs/common';
import { ParentPortalController } from '../parent-portal.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ParentOnboardingService } from '../../../database/services/parent-onboarding.service';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { InvoicePdfService } from '../../../database/services/invoice-pdf.service';
import { StatementPdfService } from '../../../database/services/statement-pdf.service';
import { PaymentReceiptService } from '../../../database/services/payment-receipt.service';
import { StatementDeliveryService } from '../../../database/services/statement-delivery.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { ParentAuthGuard } from '../../auth/guards/parent-auth.guard';
import { ParentAccountService } from '../../../database/services/parent-account.service';
import { StatementGenerationService } from '../../../database/services/statement-generation.service';

const TENANT_ID = 'tenant-aaa';
const PARENT_ID = 'parent-111';

const PARENT_SESSION = {
  id: 'parent-session-1',
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
  parent: {
    id: PARENT_ID,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    tenantId: TENANT_ID,
  },
};

const PARENT_ROW = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
};

function makeInvoiceLine(overrides: Partial<{
  id: string;
  date: Date;
  description: string;
  referenceNumber: string;
  debitCents: number;
}> = {}) {
  return {
    date: new Date('2026-04-05T10:00:00.000Z'),
    description: 'Tommy Doe – April 2026',
    lineType: 'INVOICE' as const,
    referenceNumber: 'INV-001',
    referenceId: 'inv-1',
    debitCents: 100000,
    creditCents: 0,
    balanceCents: 100000,
    sortOrder: 1,
    ...overrides,
  };
}

function makePaymentLine(overrides: Partial<{
  id: string;
  date: Date;
  creditCents: number;
}> = {}) {
  return {
    date: new Date('2026-04-10T10:00:00.000Z'),
    description: 'Payment received - Invoice INV-001',
    lineType: 'PAYMENT' as const,
    referenceNumber: 'REF-001',
    referenceId: 'pay-1',
    debitCents: 0,
    creditCents: 50000,
    balanceCents: 50000,
    sortOrder: 2,
    ...overrides,
  };
}

function makeCreditLine(overrides: Partial<{
  referenceId: string;
  description: string;
  creditCents: number;
}> = {}) {
  return {
    date: new Date('2026-04-12T09:00:00.000Z'),
    description: 'Credit note for April adjustment',
    lineType: 'CREDIT_NOTE' as const,
    referenceNumber: 'CB-12345',
    referenceId: 'cb-001',
    debitCents: 0,
    creditCents: 20000,
    balanceCents: 80000,
    sortOrder: 3,
    ...overrides,
  };
}

function makeOpeningLine() {
  return {
    date: new Date('2026-04-01T00:00:00.000Z'),
    description: 'Opening Balance',
    lineType: 'OPENING_BALANCE' as const,
    referenceNumber: undefined,
    referenceId: undefined,
    debitCents: 0,
    creditCents: 0,
    balanceCents: 0,
    sortOrder: 0,
  };
}

function makeClosingLine(balanceCents: number) {
  return {
    date: new Date('2026-04-30T23:59:59.999Z'),
    description: 'Closing Balance',
    lineType: 'CLOSING_BALANCE' as const,
    referenceNumber: undefined,
    referenceId: undefined,
    debitCents: balanceCents >= 0 ? balanceCents : 0,
    creditCents: balanceCents < 0 ? Math.abs(balanceCents) : 0,
    balanceCents,
    sortOrder: 999,
  };
}

const mockParentAuthGuard: CanActivate = { canActivate: () => true };

describe('ParentPortalController — getStatementDetail (consolidated to LiveLedger)', () => {
  let controller: ParentPortalController;
  let computeLiveLedger: jest.Mock;

  async function buildController(opts: {
    parent?: typeof PARENT_ROW | null;
    ledger?: any;
  } = {}) {
    const prismaMock = {
      parent: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.parent === undefined ? PARENT_ROW : opts.parent),
      },
    };
    computeLiveLedger = jest.fn().mockResolvedValue(opts.ledger);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentPortalController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: ParentOnboardingService, useValue: {} },
        { provide: ParentPortalChildService, useValue: {} },
        { provide: InvoicePdfService, useValue: {} },
        { provide: StatementPdfService, useValue: {} },
        { provide: PaymentReceiptService, useValue: {} },
        { provide: StatementDeliveryService, useValue: {} },
        { provide: AuditLogService, useValue: { logAction: jest.fn() } },
        { provide: ParentAccountService, useValue: { calculateOpeningBalance: jest.fn() } },
        {
          provide: StatementGenerationService,
          useValue: { computeLiveLedger },
        },
      ],
    })
      .overrideGuard(ParentAuthGuard)
      .useValue(mockParentAuthGuard)
      .compile();

    return module.get<ParentPortalController>(ParentPortalController);
  }

  describe('when there are no credit balances', () => {
    beforeEach(async () => {
      controller = await buildController({
        ledger: {
          tenantId: TENANT_ID,
          parentId: PARENT_ID,
          periodStart: new Date('2026-04-01'),
          periodEnd: new Date('2026-04-30T23:59:59.999Z'),
          openingBalanceCents: 0,
          totalChargesCents: 100000,
          totalPaymentsCents: 50000,
          totalCreditsCents: 0,
          closingBalanceCents: 50000,
          lines: [
            makeOpeningLine(),
            makeInvoiceLine(),
            makePaymentLine(),
            makeClosingLine(50000),
          ],
        },
      });
    });

    it('returns totalCredits = 0', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.totalCredits).toBe(0);
    });

    it('contains no credit-type transaction rows', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const creditRows = result.transactions.filter((t) => t.type === 'credit');
      expect(creditRows).toHaveLength(0);
    });

    it('computes netMovement as invoiced minus paid', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.netMovement).toBe(500);
    });
  });

  describe('when there is one credit balance', () => {
    beforeEach(async () => {
      controller = await buildController({
        ledger: {
          tenantId: TENANT_ID,
          parentId: PARENT_ID,
          periodStart: new Date('2026-04-01'),
          periodEnd: new Date('2026-04-30T23:59:59.999Z'),
          openingBalanceCents: 0,
          totalChargesCents: 100000,
          totalPaymentsCents: 0,
          totalCreditsCents: 20000,
          closingBalanceCents: 80000,
          lines: [
            makeOpeningLine(),
            makeInvoiceLine(),
            makeCreditLine(),
            makeClosingLine(80000),
          ],
        },
      });
    });

    it('returns totalCredits matching the credit amount', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.totalCredits).toBe(200);
    });

    it('includes a credit-type transaction row from the ledger', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const creditRows = result.transactions.filter((t) => t.type === 'credit');
      expect(creditRows).toHaveLength(1);
      expect(creditRows[0].credit).toBe(200);
      expect(creditRows[0].debit).toBeNull();
    });

    it('forwards the credit description', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const creditRow = result.transactions.find((t) => t.type === 'credit');
      expect(creditRow?.description).toContain('Credit note for April adjustment');
    });

    it('reduces netMovement by the credit amount', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.netMovement).toBe(800);
    });

    it('closingBalance reflects credit reduction', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.closingBalance).toBe(800);
    });
  });

  describe('when there are multiple credit balances', () => {
    beforeEach(async () => {
      controller = await buildController({
        ledger: {
          tenantId: TENANT_ID,
          parentId: PARENT_ID,
          periodStart: new Date('2026-04-01'),
          periodEnd: new Date('2026-04-30T23:59:59.999Z'),
          openingBalanceCents: 0,
          totalChargesCents: 100000,
          totalPaymentsCents: 50000,
          totalCreditsCents: 15000,
          closingBalanceCents: 35000,
          lines: [
            makeOpeningLine(),
            makeInvoiceLine(),
            makeCreditLine({
              referenceId: 'cb-001',
              description: 'Credit - OVERPAYMENT',
              creditCents: 10000,
            }),
            makePaymentLine(),
            makeCreditLine({
              referenceId: 'cb-002',
              description: 'Credit note adjustment',
              creditCents: 5000,
            }),
            makeClosingLine(35000),
          ],
        },
      });
    });

    it('sums all credit balances into totalCredits', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.totalCredits).toBe(150);
    });

    it('produces two credit-type transaction rows', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const creditRows = result.transactions.filter((t) => t.type === 'credit');
      expect(creditRows).toHaveLength(2);
    });

    it('computes netMovement: invoiced − paid − credits', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.netMovement).toBe(350);
    });
  });

  describe('period boundaries', () => {
    it('passes whole-month period (start of month → end of month) to computeLiveLedger', async () => {
      controller = await buildController({
        ledger: {
          tenantId: TENANT_ID,
          parentId: PARENT_ID,
          periodStart: new Date('2026-04-01'),
          periodEnd: new Date('2026-04-30T23:59:59.999Z'),
          openingBalanceCents: 0,
          totalChargesCents: 0,
          totalPaymentsCents: 0,
          totalCreditsCents: 0,
          closingBalanceCents: 0,
          lines: [makeOpeningLine(), makeClosingLine(0)],
        },
      });

      await controller.getStatementDetail(PARENT_SESSION, '2026', '4');

      expect(computeLiveLedger).toHaveBeenCalledTimes(1);
      const call = computeLiveLedger.mock.calls[0][0];
      expect(call.tenantId).toBe(TENANT_ID);
      expect(call.parentId).toBe(PARENT_ID);
      expect(call.periodStart.getMonth()).toBe(3); // April (0-indexed)
      expect(call.periodStart.getDate()).toBe(1);
      // End-of-month is last day of April (30)
      expect(call.periodEnd.getMonth()).toBe(3);
      expect(call.periodEnd.getDate()).toBe(30);
    });
  });

  describe('when parent is not found', () => {
    it('throws NotFoundException', async () => {
      const ctrl = await buildController({ parent: null });
      await expect(
        ctrl.getStatementDetail(PARENT_SESSION, '2026', '4'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
