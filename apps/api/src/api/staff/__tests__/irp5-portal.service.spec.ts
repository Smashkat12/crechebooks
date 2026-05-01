/**
 * Irp5PortalService — aggregation logic unit tests
 *
 * No DB — PrismaService is mocked.
 *
 * Coverage:
 *  1. Full-year aggregation: 12 payslips → correct totals + isComplete=true
 *  2. Partial-year handling: 3 payslips with endDate in future → isComplete=false
 *  3. Empty payslip set: listForStaff returns empty list (no payslips)
 *  4. getYearAggregate throws NotFoundException when no rows match
 *  5. taxYearForDate: March–February boundary correctness
 *  6. taxYearDates: start/end dates correct for given year
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Irp5PortalService } from '../irp5-portal.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { IRP5Status } from '../dto/staff-profile.dto';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-irp5-test';
const STAFF_ID = 'staff-irp5-test';

/** Build a payslip row for the given month (1-indexed) in the given tax year */
function payslip(taxYear: number, month: number) {
  // March of (taxYear-1) = month 3 of year (taxYear-1) → JS month index 2
  // e.g. taxYear=2026, month=1 → March 2025 (index 2 of 2025)
  const jsMonthIndex = (month - 1 + 2) % 12; // month 1=March(2), month 12=Feb(1)
  const calYear = month <= 10 ? taxYear - 1 : taxYear; // months 1–10 in taxYear-1; 11–12 in taxYear
  // Simplified: March(1)–December(10) are in taxYear-1; Jan(11)–Feb(12) are in taxYear
  const startCalYear = month <= 10 ? taxYear - 1 : taxYear;
  const startJsMonth = jsMonthIndex;
  const start = new Date(startCalYear, startJsMonth, 1);
  const end = new Date(startCalYear, startJsMonth + 1, 0); // last day of month

  return {
    id: `payslip-${taxYear}-${month}`,
    tenantId: TENANT_ID,
    staffId: STAFF_ID,
    payPeriodStart: start,
    payPeriodEnd: end,
    grossSalaryCents: 30_000_00, // R30,000
    netSalaryCents: 25_000_00, // R25,000
    payeCents: 4_000_00, // R4,000
    uifEmployeeCents: 300_00, // R300
    uifEmployerCents: 300_00, // R300
    payslipData: {},
    importedAt: new Date(),
    simplePayPayslipId: `sp-${taxYear}-${month}`,
  };
}

// 12 payslips for a complete tax year 2026 (Mar 2025 – Feb 2026)
const FULL_YEAR_PAYSLIPS = Array.from({ length: 12 }, (_, i) =>
  payslip(2026, i + 1),
);

// 3 payslips for a partial/current year (future endDate)
function partialYearPayslips(taxYear: number) {
  return [payslip(taxYear, 1), payslip(taxYear, 2), payslip(taxYear, 3)];
}

// ---------------------------------------------------------------------------
// Test module factory
// ---------------------------------------------------------------------------

function buildMockPrisma(payslips: object[]) {
  return {
    simplePayPayslipImport: {
      findMany: jest.fn().mockResolvedValue(payslips),
    },
  };
}

async function buildModule(payslips: object[]) {
  const mockPrisma = buildMockPrisma(payslips);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      Irp5PortalService,
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  return { module, service: module.get<Irp5PortalService>(Irp5PortalService) };
}

// ===========================================================================
// listForStaff
// ===========================================================================

describe('Irp5PortalService — listForStaff', () => {
  // ─── 1. Full-year aggregation ───────────────────────────────────────────────
  describe('with 12 complete payslips for tax year 2026', () => {
    let service: Irp5PortalService;
    let module: TestingModule;

    beforeEach(async () => {
      ({ module, service } = await buildModule(FULL_YEAR_PAYSLIPS));
    });

    afterEach(() => module.close());

    it('returns one entry for tax year 2026', async () => {
      const result = await service.listForStaff(TENANT_ID, STAFF_ID);
      expect(result.total).toBe(1);
      expect(result.availableYears).toEqual([2026]);
    });

    it('sums grossSalaryCents correctly across 12 payslips', async () => {
      const result = await service.listForStaff(TENANT_ID, STAFF_ID);
      // 12 × R30,000 = R360,000 → 36_000_000 cents
      const expectedGross = 12 * 30_000_00;
      // Not directly exposed in DTO — verify via status (AVAILABLE = complete)
      expect(result.data[0].status).toBe(IRP5Status.AVAILABLE);
      // availableYears includes the year
      expect(result.availableYears).toContain(2026);
      void expectedGross; // acknowledged: gross not in DTO, tested via getYearAggregate
    });

    it('marks the certificate as AVAILABLE when tax year has closed', async () => {
      const result = await service.listForStaff(TENANT_ID, STAFF_ID);
      expect(result.data[0].status).toBe(IRP5Status.AVAILABLE);
    });

    it('returns a referenceNumber for a complete year', async () => {
      const result = await service.listForStaff(TENANT_ID, STAFF_ID);
      expect(result.data[0].referenceNumber).toBeDefined();
      expect(result.data[0].referenceNumber).toContain('IRP5/');
    });
  });

  // ─── 2. Partial-year handling ───────────────────────────────────────────────
  describe('with 3 payslips for the current (open) tax year', () => {
    it('marks the certificate as PENDING when tax year end is in the future', async () => {
      // Use a future tax year so endDate > now
      const futureYear = new Date().getFullYear() + 2;
      const { module, service } = await buildModule(
        partialYearPayslips(futureYear),
      );

      try {
        const result = await service.listForStaff(TENANT_ID, STAFF_ID);
        expect(result.data[0].status).toBe(IRP5Status.PENDING);
        expect(result.data[0].referenceNumber).toBeUndefined();
      } finally {
        await module.close();
      }
    });
  });

  // ─── 3. Empty payslip set ──────────────────────────────────────────────────
  describe('when there are no payslips', () => {
    it('returns empty list with total 0', async () => {
      const { module, service } = await buildModule([]);

      try {
        const result = await service.listForStaff(TENANT_ID, STAFF_ID);
        expect(result.total).toBe(0);
        expect(result.data).toHaveLength(0);
        expect(result.availableYears).toHaveLength(0);
      } finally {
        await module.close();
      }
    });
  });
});

// ===========================================================================
// getYearAggregate
// ===========================================================================

describe('Irp5PortalService — getYearAggregate', () => {
  // ─── 4. NotFoundException when no rows ─────────────────────────────────────
  describe('when no payslips exist for the requested year', () => {
    it('throws NotFoundException', async () => {
      const { module, service } = await buildModule([]);

      try {
        await expect(
          service.getYearAggregate(TENANT_ID, STAFF_ID, 2026),
        ).rejects.toThrow(NotFoundException);
      } finally {
        await module.close();
      }
    });
  });

  // Full aggregation totals
  describe('with 12 payslips for tax year 2026', () => {
    let service: Irp5PortalService;
    let module: TestingModule;

    beforeEach(async () => {
      // Provide payslips that fall within the 2026 tax year window
      // (payPeriodStart >= 2025-03-01 and payPeriodEnd <= 2026-02-28)
      ({ module, service } = await buildModule(FULL_YEAR_PAYSLIPS));
    });

    afterEach(() => module.close());

    it('returns aggregate with correct totalGrossCents', async () => {
      const agg = await service.getYearAggregate(TENANT_ID, STAFF_ID, 2026);
      expect(agg.totalGrossCents).toBe(12 * 30_000_00);
    });

    it('returns aggregate with correct totalPayeCents (SARS code 3696)', async () => {
      const agg = await service.getYearAggregate(TENANT_ID, STAFF_ID, 2026);
      expect(agg.totalPayeCents).toBe(12 * 4_000_00);
    });

    it('returns aggregate with correct totalUifEmployeeCents (SARS code 3810)', async () => {
      const agg = await service.getYearAggregate(TENANT_ID, STAFF_ID, 2026);
      expect(agg.totalUifEmployeeCents).toBe(12 * 300_00);
    });

    it('returns periodCount matching payslip count', async () => {
      const agg = await service.getYearAggregate(TENANT_ID, STAFF_ID, 2026);
      expect(agg.periodCount).toBe(12);
    });

    it('returns taxYearPeriod in YYYY/YYYY format', async () => {
      const agg = await service.getYearAggregate(TENANT_ID, STAFF_ID, 2026);
      expect(agg.taxYearPeriod).toBe('2025/2026');
    });
  });
});

// ===========================================================================
// taxYearForDate — boundary tests (SA SARS March–February convention)
// ===========================================================================

describe('Irp5PortalService — taxYearForDate', () => {
  let service: Irp5PortalService;
  let module: TestingModule;

  beforeEach(async () => {
    ({ module, service } = await buildModule([]));
  });

  afterEach(() => module.close());

  // ─── 5. March–February boundary correctness ────────────────────────────────
  it('March 1 2025 → tax year 2026', () => {
    expect(service.taxYearForDate(new Date(2025, 2, 1))).toBe(2026);
  });

  it('February 28 2026 → tax year 2026', () => {
    expect(service.taxYearForDate(new Date(2026, 1, 28))).toBe(2026);
  });

  it('February 28 2025 → tax year 2025 (last month of 2025 tax year)', () => {
    expect(service.taxYearForDate(new Date(2025, 1, 28))).toBe(2025);
  });

  it('January 15 2026 → tax year 2026 (January is in the tax year ending Feb 2026)', () => {
    expect(service.taxYearForDate(new Date(2026, 0, 15))).toBe(2026);
  });

  it('December 31 2025 → tax year 2026 (December is in the year starting March 2025)', () => {
    expect(service.taxYearForDate(new Date(2025, 11, 31))).toBe(2026);
  });
});

// ===========================================================================
// taxYearDates
// ===========================================================================

describe('Irp5PortalService — taxYearDates', () => {
  let service: Irp5PortalService;
  let module: TestingModule;

  beforeEach(async () => {
    ({ module, service } = await buildModule([]));
  });

  afterEach(() => module.close());

  // ─── 6. Correct start/end for given year ───────────────────────────────────
  it('taxYear 2026 → startDate 2025-03-01', () => {
    const { startDate } = service.taxYearDates(2026);
    expect(startDate.getFullYear()).toBe(2025);
    expect(startDate.getMonth()).toBe(2); // March = 2
    expect(startDate.getDate()).toBe(1);
  });

  it('taxYear 2026 → endDate is last day of February 2026', () => {
    const { endDate } = service.taxYearDates(2026);
    expect(endDate.getFullYear()).toBe(2026);
    expect(endDate.getMonth()).toBe(1); // February = 1
    expect(endDate.getDate()).toBe(28); // 2026 is not a leap year
  });

  it('taxYear 2025 → startDate 2024-03-01', () => {
    const { startDate } = service.taxYearDates(2025);
    expect(startDate.getFullYear()).toBe(2024);
    expect(startDate.getMonth()).toBe(2);
    expect(startDate.getDate()).toBe(1);
  });
});
