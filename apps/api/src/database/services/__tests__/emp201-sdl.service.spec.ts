/**
 * EMP201 SDL calculation unit tests — AUDIT-TAX-07
 *
 * Pure unit tests: Prisma aggregate is mocked so no running DB is required.
 * Covers the four required SDLA §4(b) cases:
 *   1. Above-threshold employer → SDL at 1%
 *   2. Below-threshold employer → SDL = 0
 *   3. Exactly R500,000 annual → SDL = 0 (exempt at boundary, SDLA §4(b))
 *   4. Seasonal employer → rolling 12 prevents overstatement vs month × 12
 */
import { Emp201Service } from '../emp201.service';
import { PayeService } from '../paye.service';
import { UifService } from '../uif.service';

/** Build a minimal Emp201Service with a mocked prisma.payroll.aggregate */
function makeService(rollingAnnualGrossCents: number): Emp201Service {
  const mockPrisma = {
    payroll: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { grossSalaryCents: rollingAnnualGrossCents },
      }),
    },
  };

  // PayeService and UifService are not exercised by calculateSdl
  return new Emp201Service(
    mockPrisma as any,
    {} as unknown as PayeService,
    {} as unknown as UifService,
  );
}

describe('Emp201Service.calculateSdl — SDLA §4(b) exemption (AUDIT-TAX-07)', () => {
  const TENANT_ID = 'tenant-test';
  const PERIOD = '2025-01';

  it('above-threshold employer: SDL applied at 1% of current month gross', async () => {
    // Rolling 12m = R720,000 (above R500k)
    const service = makeService(72_000_000);
    const result = await service.calculateSdl(TENANT_ID, PERIOD, 6_000_000);

    expect(result.sdlApplicable).toBe(true);
    expect(result.sdlCents).toBe(60_000); // 1% of R60,000
    expect(result.rollingAnnualGrossCents).toBe(72_000_000);
  });

  it('below-threshold employer (SDLA §4(b)): SDL = 0', async () => {
    // Rolling 12m = R30,000 — well below R500k
    const service = makeService(3_000_000);
    const result = await service.calculateSdl(TENANT_ID, PERIOD, 300_000);

    expect(result.sdlApplicable).toBe(false);
    expect(result.sdlCents).toBe(0);
    expect(result.rollingAnnualGrossCents).toBe(3_000_000);
  });

  it('boundary: exactly R500,000 annual — exempt per SDLA §4(b)', async () => {
    // SDLA §4(b) exemption threshold is strictly < R500k. At exactly R500k → still exempt.
    const service = makeService(50_000_000); // exactly R500,000
    const result = await service.calculateSdl(TENANT_ID, PERIOD, 50_000_000);

    expect(result.sdlApplicable).toBe(false);
    expect(result.sdlCents).toBe(0);
    expect(result.rollingAnnualGrossCents).toBe(50_000_000);
  });

  it('seasonal employer: rolling 12 prevents SDL overstatement vs month × 12', async () => {
    // Single high month R400,000 gross. Old code: R400k × 12 = R4.8M → SDL applied (wrong).
    // Rolling 12m actual = R400,000 < R500k → exempt (correct per SDLA §4(b)).
    const service = makeService(40_000_000); // rolling = R400,000
    const result = await service.calculateSdl(TENANT_ID, PERIOD, 40_000_000);

    expect(result.sdlApplicable).toBe(false);
    expect(result.sdlCents).toBe(0);
    expect(result.rollingAnnualGrossCents).toBe(40_000_000);
  });
});
