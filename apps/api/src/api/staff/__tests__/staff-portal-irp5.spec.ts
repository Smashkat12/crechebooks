/**
 * StaffPortalController — IRP5 endpoints unit tests
 *
 * Coverage:
 *  1. GET /staff-portal/documents/irp5 — happy path: returns list of available tax years
 *  2. GET /staff-portal/documents/irp5 — with taxYear filter
 *  3. GET /staff-portal/documents/irp5/:id/pdf — happy path: PDF buffer streamed correctly
 *  4. GET /staff-portal/documents/irp5/:id/pdf — 404 when ID format is wrong (not irp5-YYYY)
 *  5. GET /staff-portal/documents/irp5/:id/pdf — 404 when no payslip data exists for year
 *  6. Tenant + staff ownership: getYearAggregate is called with session tenantId + staffId
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { StaffPortalController } from '../staff-portal.controller';
import { Irp5PortalService } from '../irp5-portal.service';
import { Irp5PdfService } from '../irp5-pdf.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StaffOnboardingService } from '../../../database/services/staff-onboarding.service';
import { StaffDocumentService } from '../../../database/services/staff-document.service';
import { SimplePayPayslipService } from '../../../integrations/simplepay/simplepay-payslip.service';
import { SimplePayLeaveService } from '../../../integrations/simplepay/simplepay-leave.service';
import { SimplePayRepository } from '../../../database/repositories/simplepay.repository';
import { LeaveRequestRepository } from '../../../database/repositories/leave-request.repository';
import { StorageService } from '../../../integrations/storage/storage.service';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard';
import type { StaffSessionInfo } from '../../auth/decorators/current-staff.decorator';
import type { IRP5ListResponseDto } from '../dto/staff-profile.dto';
import { IRP5Status } from '../dto/staff-profile.dto';
import type { Irp5YearAggregate } from '../irp5-portal.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-aaa';
const STAFF_ID = 'staff-test-bbb';

const MOCK_SESSION: StaffSessionInfo = {
  staffId: STAFF_ID,
  tenantId: TENANT_ID,
  staff: { email: 'staff@test.com' } as StaffSessionInfo['staff'],
} as StaffSessionInfo;

const MOCK_AGG: Irp5YearAggregate = {
  taxYear: 2026,
  taxYearPeriod: '2025/2026',
  startDate: new Date(2025, 2, 1),
  endDate: new Date(2026, 1, 28),
  periodCount: 12,
  totalGrossCents: 36_000_000, // R360,000
  totalPayeCents: 3_600_000, // R36,000 (PAYE code 3696)
  totalUifEmployeeCents: 72_000,
  totalUifEmployerCents: 72_000,
  totalNetCents: 32_328_000,
  isComplete: true,
  staffId: STAFF_ID,
  tenantId: TENANT_ID,
};

const MOCK_DOCUMENT = {
  id: 'irp5-2026',
  taxYear: 2026,
  taxYearPeriod: '2025/2026',
  status: IRP5Status.AVAILABLE,
  availableDate: new Date(2026, 2, 1),
  referenceNumber: 'IRP5/2025-2026/STAFF-TE',
};

const MOCK_LIST_RESPONSE: IRP5ListResponseDto = {
  data: [MOCK_DOCUMENT],
  total: 1,
  availableYears: [2026],
};

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake irp5 content');

// ---------------------------------------------------------------------------
// Guard stub
// ---------------------------------------------------------------------------

const passthroughGuard: CanActivate = { canActivate: () => true };

// ---------------------------------------------------------------------------
// Mock response helper (mirrors parent-portal-invoice-pdf.spec.ts pattern)
// ---------------------------------------------------------------------------

function buildMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as unknown as import('express').Response & typeof res;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

function buildModule(
  irp5PortalOverride: Partial<Irp5PortalService> = {},
  irp5PdfOverride: Partial<Irp5PdfService> = {},
) {
  const mockIrp5PortalService = {
    listForStaff: jest.fn().mockResolvedValue(MOCK_LIST_RESPONSE),
    getYearAggregate: jest.fn().mockResolvedValue(MOCK_AGG),
    ...irp5PortalOverride,
  };

  const mockIrp5PdfService = {
    generatePdf: jest.fn().mockResolvedValue(PDF_BUFFER),
    ...irp5PdfOverride,
  };

  return Test.createTestingModule({
    controllers: [StaffPortalController],
    providers: [
      { provide: Irp5PortalService, useValue: mockIrp5PortalService },
      { provide: Irp5PdfService, useValue: mockIrp5PdfService },
      { provide: PrismaService, useValue: {} },
      { provide: StaffOnboardingService, useValue: {} },
      { provide: StaffDocumentService, useValue: {} },
      { provide: SimplePayPayslipService, useValue: {} },
      { provide: SimplePayLeaveService, useValue: {} },
      { provide: SimplePayRepository, useValue: {} },
      { provide: LeaveRequestRepository, useValue: {} },
      { provide: StorageService, useValue: {} },
    ],
  })
    .overrideGuard(StaffAuthGuard)
    .useValue(passthroughGuard)
    .compile();
}

// ===========================================================================
// GET /staff-portal/documents/irp5
// ===========================================================================

describe('StaffPortalController — getIRP5Documents', () => {
  let controller: StaffPortalController;
  let module: TestingModule;
  let mockPortalService: {
    listForStaff: jest.Mock;
    getYearAggregate: jest.Mock;
  };

  beforeEach(async () => {
    module = await buildModule();
    controller = module.get<StaffPortalController>(StaffPortalController);
    mockPortalService = module.get(Irp5PortalService);
  });

  afterEach(() => module.close());

  // ─── 1. Happy path: returns list ───────────────────────────────────────────
  describe('happy path — returns available tax years', () => {
    it('calls listForStaff with tenantId and staffId from session', async () => {
      await controller.getIRP5Documents(MOCK_SESSION);
      expect(mockPortalService.listForStaff).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
      );
    });

    it('returns the full list when no taxYear filter is supplied', async () => {
      const result = await controller.getIRP5Documents(MOCK_SESSION);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.availableYears).toEqual([2026]);
    });

    it('returns document with AVAILABLE status', async () => {
      const result = await controller.getIRP5Documents(MOCK_SESSION);
      expect(result.data[0].status).toBe(IRP5Status.AVAILABLE);
    });
  });

  // ─── 2. taxYear filter ─────────────────────────────────────────────────────
  describe('with taxYear query filter', () => {
    it('narrows to matching year when filter matches', async () => {
      const result = await controller.getIRP5Documents(MOCK_SESSION, '2026');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].taxYear).toBe(2026);
    });

    it('returns empty data array when filter matches no year', async () => {
      const result = await controller.getIRP5Documents(MOCK_SESSION, '2020');
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('ignores non-numeric taxYear param and returns full list', async () => {
      const result = await controller.getIRP5Documents(MOCK_SESSION, 'bogus');
      // Non-numeric — parseInt returns NaN, filter skipped, full list returned
      expect(result.data).toHaveLength(1);
    });
  });
});

// ===========================================================================
// GET /staff-portal/documents/irp5/:id/pdf
// ===========================================================================

describe('StaffPortalController — downloadIRP5Pdf', () => {
  // ─── 3. Happy path ─────────────────────────────────────────────────────────
  describe('happy path — PDF buffer streamed with correct headers', () => {
    let controller: StaffPortalController;
    let res: ReturnType<typeof buildMockRes>;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule();
      controller = module.get<StaffPortalController>(StaffPortalController);
      res = buildMockRes();
      await controller.downloadIRP5Pdf(MOCK_SESSION, 'irp5-2026', res);
    });

    afterEach(() => module.close());

    it('calls getYearAggregate with tenantId, staffId, taxYear (ownership scoped)', () => {
      const svc = module.get(Irp5PortalService);
      expect(svc.getYearAggregate).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        2026,
      );
    });

    it('sets Content-Type to application/pdf', () => {
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
    });

    it('sets Content-Disposition with correct filename', () => {
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': expect.stringContaining('IRP5-2025-2026.pdf'),
        }),
      );
    });

    it('sends the PDF buffer', () => {
      expect(res.send).toHaveBeenCalledWith(PDF_BUFFER);
    });
  });

  // ─── 4. 404 — wrong ID format ──────────────────────────────────────────────
  describe('when ID format is wrong (not irp5-YYYY)', () => {
    let controller: StaffPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule();
      controller = module.get<StaffPortalController>(StaffPortalController);
    });

    afterEach(() => module.close());

    it('throws NotFoundException for malformed ID', async () => {
      const res = buildMockRes();
      await expect(
        controller.downloadIRP5Pdf(MOCK_SESSION, 'badformat', res),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for partial format (irp5-20x6)', async () => {
      const res = buildMockRes();
      await expect(
        controller.downloadIRP5Pdf(MOCK_SESSION, 'irp5-20x6', res),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── 5. 404 — no payslip data ──────────────────────────────────────────────
  describe('when no payslip data exists for the requested year', () => {
    let controller: StaffPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule({
        getYearAggregate: jest
          .fn()
          .mockRejectedValue(
            new NotFoundException('No payslip data found for tax year 2019'),
          ),
      });
      controller = module.get<StaffPortalController>(StaffPortalController);
    });

    afterEach(() => module.close());

    it('propagates NotFoundException when service finds no payslips', async () => {
      const res = buildMockRes();
      await expect(
        controller.downloadIRP5Pdf(MOCK_SESSION, 'irp5-2019', res),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── 6. Tenant + staff ownership guard ────────────────────────────────────
  describe('tenant and staff ownership', () => {
    it('always passes tenantId and staffId from session to getYearAggregate', async () => {
      const module = await buildModule();
      const controller = module.get<StaffPortalController>(
        StaffPortalController,
      );
      const svc = module.get(Irp5PortalService);
      const res = buildMockRes();

      await controller.downloadIRP5Pdf(MOCK_SESSION, 'irp5-2026', res);

      expect(svc.getYearAggregate).toHaveBeenCalledWith(
        TENANT_ID, // must be from session, not request param
        STAFF_ID, // must be from session
        2026,
      );

      await module.close();
    });
  });
});
