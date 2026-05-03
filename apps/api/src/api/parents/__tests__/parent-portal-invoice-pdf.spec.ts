/**
 * ParentPortalController.downloadInvoicePdf — unit tests
 *
 * Coverage:
 *  1. Happy path — invoice belongs to parent → PDF buffer streamed with correct headers
 *  2. Invoice not found (no row) → 404
 *  3. Invoice belongs to different parent (ownership mismatch) → 404 (don't leak existence)
 *  4. Invoice belongs to different tenant → 404
 *  5. PDF service throws → 500
 */

import { Test, TestingModule } from '@nestjs/testing';
import type { CanActivate } from '@nestjs/common';
import { ParentPortalController } from '../parent-portal.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ParentOnboardingService } from '../../../database/services/parent-onboarding.service';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { InvoicePdfService } from '../../../database/services/invoice-pdf.service';
import { ParentAuthGuard } from '../../auth/guards/parent-auth.guard';
import type { ParentSession } from '../../auth/decorators/current-parent.decorator';

const TENANT_ID = 'tenant-aaa';
const PARENT_ID = 'parent-111';
const INVOICE_ID = 'inv-abc';
const INVOICE_NUMBER = 'INV-2026-001';

const PARENT_SESSION: ParentSession = {
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
};

const INVOICE_ROW = {
  id: INVOICE_ID,
  invoiceNumber: INVOICE_NUMBER,
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
  isDeleted: false,
};

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake pdf content');

const mockParentAuthGuard: CanActivate = { canActivate: () => true };

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as unknown as import('express').Response & typeof res;
}

function buildModule(
  prismaInvoiceRow: object | null,
  pdfServiceImpl: Partial<InvoicePdfService> = {},
) {
  const mockPrisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(prismaInvoiceRow),
    },
  };

  const mockInvoicePdfService = {
    generatePdf: jest.fn().mockResolvedValue(PDF_BUFFER),
    ...pdfServiceImpl,
  };

  return Test.createTestingModule({
    controllers: [ParentPortalController],
    providers: [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ParentOnboardingService, useValue: {} },
      { provide: ParentPortalChildService, useValue: {} },
      { provide: InvoicePdfService, useValue: mockInvoicePdfService },
    ],
  })
    .overrideGuard(ParentAuthGuard)
    .useValue(mockParentAuthGuard)
    .compile();
}

describe('ParentPortalController — downloadInvoicePdf', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1. Happy path
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the invoice belongs to the authenticated parent', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(INVOICE_ROW);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadInvoicePdf(PARENT_SESSION, INVOICE_ID, res);
    });

    afterEach(() => module.close());

    it('sets Content-Type to application/pdf', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
    });

    it('sets Content-Disposition with the invoice number filename', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${INVOICE_NUMBER}.pdf"`,
      );
    });

    it('sets Content-Length to the buffer length', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        PDF_BUFFER.length,
      );
    });

    it('sends the PDF buffer', () => {
      expect(res.send).toHaveBeenCalledWith(PDF_BUFFER);
    });

    it('does not call res.status with an error code', () => {
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.status).not.toHaveBeenCalledWith(501);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Invoice not found
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the invoice does not exist', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadInvoicePdf(PARENT_SESSION, 'nonexistent', res);
    });

    afterEach(() => module.close());

    it('returns 404', () => {
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('does not stream a PDF', () => {
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Invoice belongs to a different parent (Prisma findFirst returns null
  //    because parentId is part of the WHERE clause)
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the invoice belongs to a different parent', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      // findFirst with parentId='parent-111' returns null when row has parentId='parent-999'
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadInvoicePdf(PARENT_SESSION, INVOICE_ID, res);
    });

    afterEach(() => module.close());

    it('returns 404 (no existence leak)', () => {
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('does not stream a PDF', () => {
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Invoice belongs to a different tenant
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the invoice belongs to a different tenant', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      // findFirst with tenantId='tenant-aaa' returns null when row has tenantId='tenant-zzz'
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadInvoicePdf(PARENT_SESSION, INVOICE_ID, res);
    });

    afterEach(() => module.close());

    it('returns 404 (tenant isolation)', () => {
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. PDF service throws
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the PDF service throws', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(INVOICE_ROW, {
        generatePdf: jest
          .fn()
          .mockRejectedValue(new Error('pdfkit internal error')),
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadInvoicePdf(PARENT_SESSION, INVOICE_ID, res);
    });

    afterEach(() => module.close());

    it('returns 500', () => {
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('does not stream a PDF', () => {
      expect(res.send).not.toHaveBeenCalled();
    });
  });
});
