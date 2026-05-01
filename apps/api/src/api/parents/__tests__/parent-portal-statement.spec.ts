/**
 * ParentPortalController.getStatementDetail — unit tests
 *
 * Focus: credit-balance integration in the monthly statement.
 *
 * Coverage:
 *  1. No credit balances → totalCredits = 0, no credit transaction rows
 *  2. Single credit balance → totalCredits reflects amount, credit row present
 *  3. Multiple credit balances → totalCredits is the sum; netMovement accounts for them
 *  4. Credits reduce the running balance (closingBalance includes credit reduction)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, type CanActivate } from '@nestjs/common';
import { ParentPortalController } from '../parent-portal.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ParentOnboardingService } from '../../../database/services/parent-onboarding.service';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { ParentAuthGuard } from '../../auth/guards/parent-auth.guard';

const TENANT_ID = 'tenant-aaa';
const PARENT_ID = 'parent-111';

const PARENT_SESSION = {
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
};

const PARENT_ROW = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
};

function buildMockPrisma(overrides: {
  parentRow?: typeof PARENT_ROW | null;
  priorInvoices?: { totalCents: number; amountPaidCents: number }[];
  invoices?: object[];
  payments?: object[];
  creditBalances?: object[];
}) {
  const resolvedParent =
    'parentRow' in overrides ? overrides.parentRow : PARENT_ROW;
  return {
    parent: {
      findUnique: jest.fn().mockResolvedValue(resolvedParent),
    },
    invoice: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(overrides.priorInvoices ?? [])
        .mockResolvedValueOnce(overrides.invoices ?? []),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue(overrides.payments ?? []),
    },
    creditBalance: {
      findMany: jest.fn().mockResolvedValue(overrides.creditBalances ?? []),
    },
  };
}

const mockParentAuthGuard: CanActivate = { canActivate: () => true };

describe('ParentPortalController — getStatementDetail credit-balance integration', () => {
  let controller: ParentPortalController;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  async function buildController(
    prismaOverride: ReturnType<typeof buildMockPrisma>,
  ) {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentPortalController],
      providers: [
        { provide: PrismaService, useValue: prismaOverride },
        { provide: ParentOnboardingService, useValue: {} },
        { provide: ParentPortalChildService, useValue: {} },
      ],
    })
      .overrideGuard(ParentAuthGuard)
      .useValue(mockParentAuthGuard)
      .compile();

    return module.get<ParentPortalController>(ParentPortalController);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. No credit balances
  // ──────────────────────────────────────────────────────────────────────────
  describe('when there are no credit balances', () => {
    beforeEach(async () => {
      mockPrisma = buildMockPrisma({
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            totalCents: 100000,
            createdAt: new Date('2026-04-05T10:00:00.000Z'),
            child: { firstName: 'Tommy', lastName: 'Doe' },
          },
        ],
        payments: [
          {
            id: 'pay-1',
            amountCents: 50000,
            paymentDate: new Date('2026-04-10T10:00:00.000Z'),
            matchType: 'EFT',
            reference: 'REF-001',
          },
        ],
        creditBalances: [],
      });
      controller = await buildController(mockPrisma);
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
      // totalInvoiced=1000, totalPaid=500, totalCredits=0 → netMovement=500
      expect(result.netMovement).toBe(500);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Single credit balance
  // ──────────────────────────────────────────────────────────────────────────
  describe('when there is one credit balance', () => {
    const CREDIT_ID = 'cb-001';
    const CREDIT_AMOUNT_CENTS = 20000; // R200

    beforeEach(async () => {
      mockPrisma = buildMockPrisma({
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            totalCents: 100000,
            createdAt: new Date('2026-04-05T10:00:00.000Z'),
            child: { firstName: 'Tommy', lastName: 'Doe' },
          },
        ],
        payments: [],
        creditBalances: [
          {
            id: CREDIT_ID,
            amountCents: CREDIT_AMOUNT_CENTS,
            sourceType: 'CREDIT_NOTE',
            description: 'Credit note for April adjustment',
            createdAt: new Date('2026-04-12T09:00:00.000Z'),
          },
        ],
      });
      controller = await buildController(mockPrisma);
    });

    it('returns totalCredits matching the credit amount', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      expect(result.totalCredits).toBe(200); // 20000 cents / 100
    });

    it('includes a credit-type transaction row', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const creditRows = result.transactions.filter((t) => t.type === 'credit');
      expect(creditRows).toHaveLength(1);
      expect(creditRows[0].id).toBe(CREDIT_ID);
      expect(creditRows[0].credit).toBe(200);
      expect(creditRows[0].debit).toBeNull();
    });

    it('uses the credit description from the DB row', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const creditRow = result.transactions.find((t) => t.type === 'credit');
      expect(creditRow?.description).toBe('Credit note for April adjustment');
    });

    it('reduces netMovement by the credit amount', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      // totalInvoiced=1000, totalPaid=0, totalCredits=200 → netMovement=800
      expect(result.netMovement).toBe(800);
    });

    it('credits reduce closingBalance', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      // openingBalance=0, +invoice 1000, -credit 200 → closing=800
      expect(result.closingBalance).toBe(800);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Multiple credit balances — totalCredits is their sum
  // ──────────────────────────────────────────────────────────────────────────
  describe('when there are multiple credit balances', () => {
    beforeEach(async () => {
      mockPrisma = buildMockPrisma({
        invoices: [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            totalCents: 100000,
            createdAt: new Date('2026-04-05T10:00:00.000Z'),
            child: { firstName: 'Tommy', lastName: 'Doe' },
          },
        ],
        payments: [
          {
            id: 'pay-1',
            amountCents: 50000,
            paymentDate: new Date('2026-04-10T10:00:00.000Z'),
            matchType: 'EFT',
            reference: 'REF-001',
          },
        ],
        creditBalances: [
          {
            id: 'cb-001',
            amountCents: 10000, // R100
            sourceType: 'OVERPAYMENT',
            description: null,
            createdAt: new Date('2026-04-08T09:00:00.000Z'),
          },
          {
            id: 'cb-002',
            amountCents: 5000, // R50
            sourceType: 'CREDIT_NOTE',
            description: 'Credit note adjustment',
            createdAt: new Date('2026-04-15T11:00:00.000Z'),
          },
        ],
      });
      controller = await buildController(mockPrisma);
    });

    it('sums all credit balances into totalCredits', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      // 10000 + 5000 = 15000 cents = R150
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

    it('falls back to formatted sourceType when description is null', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      const overpaymentRow = result.transactions.find((t) => t.id === 'cb-001');
      // sourceType OVERPAYMENT → 'Credit - OVERPAYMENT'
      expect(overpaymentRow?.description).toBe('Credit - OVERPAYMENT');
    });

    it('computes netMovement: invoiced − paid − credits', async () => {
      const result = await controller.getStatementDetail(
        PARENT_SESSION,
        '2026',
        '4',
      );
      // 1000 - 500 - 150 = 350
      expect(result.netMovement).toBe(350);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Parent not found → NotFoundException
  // ──────────────────────────────────────────────────────────────────────────
  describe('when parent is not found', () => {
    it('throws NotFoundException', async () => {
      const prisma = buildMockPrisma({ parentRow: null });
      const ctrl = await buildController(prisma);
      await expect(
        ctrl.getStatementDetail(PARENT_SESSION, '2026', '4'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
