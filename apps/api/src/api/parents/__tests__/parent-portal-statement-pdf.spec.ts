/**
 * ParentPortalController.downloadStatementPdf — unit tests
 *
 * Coverage:
 *  1. Happy path — statement row exists and belongs to this parent → PDF buffer sent
 *  2. Statement row not found (no DB row for that period) → 404
 *  3. Statement belongs to a different parent → 404 (no existence leak)
 *  4. Statement belongs to a different tenant → 404
 *  5. PDF service throws → 500
 *  6. Invalid year/month params → NotFoundException
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
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
const STATEMENT_ID = 'stmt-xyz';
const STATEMENT_NUMBER = 'STMT-2026-001';

const PARENT_SESSION: ParentSession = {
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
};

const STATEMENT_ROW = {
  id: STATEMENT_ID,
  statementNumber: STATEMENT_NUMBER,
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
};

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake statement pdf');

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

function buildModule(
  prismaStatementRow: object | null,
  statementPdfImpl: Partial<StatementPdfService> = {},
) {
  const mockPrisma = {
    statement: {
      findFirst: jest.fn().mockResolvedValue(prismaStatementRow),
    },
  };

  const mockStatementPdfService = {
    generatePdf: jest.fn().mockResolvedValue(PDF_BUFFER),
    ...statementPdfImpl,
  };

  return Test.createTestingModule({
    controllers: [ParentPortalController],
    providers: [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ParentOnboardingService, useValue: {} },
      { provide: ParentPortalChildService, useValue: {} },
      { provide: InvoicePdfService, useValue: {} },
      { provide: StatementPdfService, useValue: mockStatementPdfService },
      { provide: PaymentReceiptService, useValue: {} },
    ],
  })
    .overrideGuard(ParentAuthGuard)
    .useValue(mockParentAuthGuard)
    .compile();
}

describe('ParentPortalController — downloadStatementPdf', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1. Happy path
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the statement belongs to the authenticated parent', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(STATEMENT_ROW);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadStatementPdf(PARENT_SESSION, '2026', '5', res);
    });

    afterEach(() => module.close());

    it('sets Content-Type to application/pdf', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
    });

    it('sets Content-Disposition with the statement number filename', () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${STATEMENT_NUMBER}.pdf"`,
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

    it('does not respond with an error status', () => {
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.status).not.toHaveBeenCalledWith(501);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Statement DB row not found for this period
  // ────────────────────────────────────────────────────────────────────────────
  describe('when no statement row exists for the requested period', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadStatementPdf(PARENT_SESSION, '2026', '5', res);
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
  // 3. Statement belongs to a different parent (findFirst returns null because
  //    parentId is in the WHERE clause)
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the statement belongs to a different parent', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadStatementPdf(PARENT_SESSION, '2026', '5', res);
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
  // 4. Statement belongs to a different tenant
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the statement belongs to a different tenant', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadStatementPdf(PARENT_SESSION, '2026', '5', res);
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
      module = await buildModule(STATEMENT_ROW, {
        generatePdf: jest
          .fn()
          .mockRejectedValue(new Error('pdfkit internal error')),
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
      await controller.downloadStatementPdf(PARENT_SESSION, '2026', '5', res);
    });

    afterEach(() => module.close());

    it('returns 500', () => {
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('does not stream a PDF', () => {
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Invalid year/month params
  // ────────────────────────────────────────────────────────────────────────────
  describe('when year or month params are invalid', () => {
    let controller: ParentPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule(null);
      controller = module.get<ParentPortalController>(ParentPortalController);
      res = buildMockRes();
    });

    afterEach(() => module.close());

    it('throws NotFoundException for month=0', async () => {
      await expect(
        controller.downloadStatementPdf(PARENT_SESSION, '2026', '0', res),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for month=13', async () => {
      await expect(
        controller.downloadStatementPdf(PARENT_SESSION, '2026', '13', res),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-numeric year', async () => {
      await expect(
        controller.downloadStatementPdf(PARENT_SESSION, 'abc', '5', res),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
