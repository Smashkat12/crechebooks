import { resolveLedgerPeriod } from './ledger-period';

describe('resolveLedgerPeriod', () => {
  it('defaults period_end to today and period_start to 3 months earlier', () => {
    const now = new Date('2025-06-15T12:00:00.000Z');
    const { periodStart, periodEnd } = resolveLedgerPeriod(
      undefined,
      undefined,
      now,
    );

    // periodEnd is end-of-day for the supplied "now"
    expect(periodEnd.getFullYear()).toBe(2025);
    expect(periodEnd.getMonth()).toBe(5); // June
    expect(periodEnd.getHours()).toBe(23);
    expect(periodEnd.getMinutes()).toBe(59);

    // periodStart is start-of-day, 3 months earlier
    expect(periodStart.getFullYear()).toBe(2025);
    expect(periodStart.getMonth()).toBe(2); // March
    expect(periodStart.getHours()).toBe(0);
  });

  it('honors explicit period_start and period_end', () => {
    const { periodStart, periodEnd } = resolveLedgerPeriod(
      '2024-01-01',
      '2024-01-31',
    );
    expect(periodStart.getFullYear()).toBe(2024);
    expect(periodStart.getMonth()).toBe(0);
    expect(periodEnd.getFullYear()).toBe(2024);
    expect(periodEnd.getMonth()).toBe(0);
    expect(periodEnd.getHours()).toBe(23);
  });

  it('uses explicit period_end with default period_start (3 months prior)', () => {
    const { periodStart, periodEnd } = resolveLedgerPeriod(
      undefined,
      '2024-11-15',
    );
    expect(periodEnd.getMonth()).toBe(10); // November
    expect(periodStart.getMonth()).toBe(7); // August
    expect(periodStart.getFullYear()).toBe(2024);
  });
});
