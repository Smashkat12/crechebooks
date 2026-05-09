/**
 * ParentPortalController.downloadPaymentReceipt — unit tests
 * ParentPortalController.getPaymentDetail (hasReceipt field) — unit tests
 *
 * Coverage:
 *  1. Happy path — payment belongs to parent → StreamableFile returned with correct headers
 *  2. Payment not found (no row) → NotFoundException
 *  3. Payment belongs to different parent → NotFoundException (no existence leak)
 *  4. Payment belongs to different tenant → NotFoundException
 *  5. Receipt service throws → propagates (unhandled, NestJS turns into 500)
 *  6. getPaymentDetail: hasReceipt=true when paymentReceipt row exists
 *  7. getPaymentDetail: hasReceipt=false when no paymentReceipt row
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, StreamableFile } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { Readable } from 'stream';
import { ParentPortalController } from '../parent-portal.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ParentOnboardingService } from '../../../database/services/parent-onboarding.service';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { InvoicePdfService } from '../../../database/services/invoice-pdf.service';
import { StatementPdfService } from '../../../database/services/statement-pdf.service';
import { PaymentReceiptService } from '../../../database/services/payment-receipt.service';
import { ParentAuthGuard } from '../../auth/guards/parent-auth.guard';
import type { ParentSession } from '../../auth/decorators/current-parent.decorator';

const TENANT_ID = 'tenant-aaa';
const PARENT_ID = 'parent-111';
const PAYMENT_ID = 'pay-abc';
const RECEIPT_NUMBER = 'REC-2026-00001';
const S3_KEY = `${TENANT_ID}/payment-receipts/${RECEIPT_NUMBER}.pdf`;

const PARENT_SESSION: ParentSession = {
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
};

const PAYMENT_ROW = {
  id: PAYMENT_ID,
  amountCents: 150000,
  paymentDate: new Date('2026-05-01'),
  reference: 'EFT-001',
  matchType: 'EFT',
  deletedAt: null,
  tenantId: TENANT_ID,
  invoice: {
    id: 'inv-abc',
    invoiceNumber: 'INV-2026-001',
    totalCents: 150000,
    parentId: PARENT_ID,
    child: { firstName: 'Alice', lastName: 'Smith' },
  },
  // Prisma relation name on Payment model is `receipt` (PaymentReceipt?)
  receipt: null,
};

const RECEIPT_RESULT = {
  receiptNumber: RECEIPT_NUMBER,
  s3Key: S3_KEY,
  downloadUrl: 'https://s3.example.com/receipt.pdf',
  cached: false,
};

const mockParentAuthGuard: CanActivate = { canActivate: () => true };

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
  return res as unknown as import('express').Response & typeof res;
}

function makeFakeStream(): Readable {
  return Readable.from(Buffer.from('%PDF-1.4 fake receipt'));
}

function buildModule(
  prismaPaymentRow: object | null,
  receiptServiceImpl: Partial<PaymentReceiptService> = {},
) {
  const mockPrisma = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(prismaPaymentRow),
    },
  };

  const mockReceiptService = {
    getOrGenerateReceipt: jest.fn().mockResolvedValue(RECEIPT_RESULT),
    streamReceipt: jest.fn().mockResolvedValue(makeFakeStream()),
    ...receiptServiceImpl,
  };

  return Test.createTestingModule({
    controllers: [ParentPortalController],
    providers: [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ParentOnboardingService, useValue: {} },
      { provide: ParentPortalChildService, useValue: {} },
      { provide: InvoicePdfService, useValue: {} },
      { provide: StatementPdfService, useValue: {} },
      { provide: PaymentReceiptService, useValue: mockReceiptService },
    ],
  })
    .overrideGuard(ParentAuthGuard)
    .useValue(mockParentAuthGuard)
    .compile();
}

describe('ParentPortalController — downloadPaymentReceipt', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1. Happy path
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the payment belongs to the authenticated parent', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let result: StreamableFile;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(PAYMENT_ROW);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      result = await controller.downloadPaymentReceipt(
        PARENT_SESSION,
        PAYMENT_ID,
        res,
      );
    });

    afterEach(() => module.close());

    it('returns a StreamableFile', () => {
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('sets Content-Type to application/pdf', () => {
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
    });

    it('sets Content-Disposition with the receipt number filename', () => {
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': `attachment; filename="${RECEIPT_NUMBER}.pdf"`,
        }),
      );
    });

    it('does not call res.status with an error code', () => {
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.status).not.toHaveBeenCalledWith(501);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Payment not found
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the payment does not exist', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
    });

    afterEach(() => module.close());

    it('throws NotFoundException', async () => {
      await expect(
        controller.downloadPaymentReceipt(PARENT_SESSION, 'nonexistent', res),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Payment belongs to a different parent
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the payment belongs to a different parent', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      // findFirst returns null because parentId in WHERE doesn't match
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
    });

    afterEach(() => module.close());

    it('throws NotFoundException (no existence leak)', async () => {
      await expect(
        controller.downloadPaymentReceipt(PARENT_SESSION, PAYMENT_ID, res),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Payment belongs to a different tenant
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the payment belongs to a different tenant', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
    });

    afterEach(() => module.close());

    it('throws NotFoundException (tenant isolation)', async () => {
      await expect(
        controller.downloadPaymentReceipt(PARENT_SESSION, PAYMENT_ID, res),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Receipt service throws
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the receipt service throws', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(PAYMENT_ROW, {
        getOrGenerateReceipt: jest
          .fn()
          .mockRejectedValue(new Error('S3 unavailable')),
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
    });

    afterEach(() => module.close());

    it('propagates the error', async () => {
      await expect(
        controller.downloadPaymentReceipt(PARENT_SESSION, PAYMENT_ID, res),
      ).rejects.toThrow('S3 unavailable');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// getPaymentDetail — hasReceipt field
// ────────────────────────────────────────────────────────────────────────────
describe('ParentPortalController — getPaymentDetail hasReceipt', () => {
  // Helper to build module with a specific payment row for getPaymentDetail
  function buildDetailModule(paymentRow: object | null) {
    const mockPrisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(paymentRow),
      },
    };

    return Test.createTestingModule({
      controllers: [ParentPortalController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ParentOnboardingService, useValue: {} },
        { provide: ParentPortalChildService, useValue: {} },
        { provide: InvoicePdfService, useValue: {} },
        { provide: StatementPdfService, useValue: {} },
        { provide: PaymentReceiptService, useValue: {} },
      ],
    })
      .overrideGuard(ParentAuthGuard)
      .useValue(mockParentAuthGuard)
      .compile();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. hasReceipt=true when paymentReceipt row present
  // ──────────────────────────────────────────────────────────────────────────
  describe('when a receipt record exists for the payment', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      const rowWithReceipt = {
        ...PAYMENT_ROW,
        receipt: { paymentId: PAYMENT_ID },
      };
      module = await buildDetailModule(rowWithReceipt);
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('returns hasReceipt=true', async () => {
      const result = await controller.getPaymentDetail(
        PARENT_SESSION,
        PAYMENT_ID,
      );
      expect(result.hasReceipt).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. hasReceipt=false when no receipt record
  // ──────────────────────────────────────────────────────────────────────────
  describe('when no receipt record exists for the payment', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildDetailModule(PAYMENT_ROW); // paymentReceipt: null
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('returns hasReceipt=false', async () => {
      const result = await controller.getPaymentDetail(
        PARENT_SESSION,
        PAYMENT_ID,
      );
      expect(result.hasReceipt).toBe(false);
    });
  });
});
