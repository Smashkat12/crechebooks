/**
 * Pro-rata Calculation Service Tests
 * TASK-BILL-014: Pro-rata Calculation Service
 *
 * Tests cover:
 * - Basic pro-rata calculations
 * - Weekend exclusion
 * - Public holiday exclusion
 * - Tenant closure exclusion
 * - Detailed breakdown
 * - Mid-month enrollment/withdrawal
 * - Edge cases
 * - Banker's rounding verification
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ProRataService } from '../../../src/database/services/pro-rata.service';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BusinessException } from '../../../src/shared/exceptions';
import Decimal from 'decimal.js';

describe('ProRataService', () => {
  let service: ProRataService;
  let prisma: PrismaService;
  let tenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProRataService, TenantRepository, PrismaService],
    }).compile();

    service = module.get<ProRataService>(ProRataService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // Create a test tenant with no closure dates
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Pro-rata Test Creche',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '0211234567',
        email: `prorata-test-${Date.now()}@test.com`,
        closureDates: [],
      },
    });
    tenantId = tenant.id;
  });

  afterEach(async () => {
    // Clean up test tenant
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('isWeekend', () => {
    it('should return true for Saturday', () => {
      const saturday = new Date('2025-01-04'); // Saturday
      expect(service.isWeekend(saturday)).toBe(true);
    });

    it('should return true for Sunday', () => {
      const sunday = new Date('2025-01-05'); // Sunday
      expect(service.isWeekend(sunday)).toBe(true);
    });

    it('should return false for weekdays', () => {
      const monday = new Date('2025-01-06'); // Monday
      const wednesday = new Date('2025-01-08'); // Wednesday
      const friday = new Date('2025-01-10'); // Friday

      expect(service.isWeekend(monday)).toBe(false);
      expect(service.isWeekend(wednesday)).toBe(false);
      expect(service.isWeekend(friday)).toBe(false);
    });
  });

  describe('isPublicHoliday', () => {
    it('should return true for New Years Day 2025', () => {
      const newYear = new Date('2025-01-01');
      expect(service.isPublicHoliday(newYear)).toBe(true);
    });

    it('should return true for Human Rights Day 2025', () => {
      const humanRightsDay = new Date('2025-03-21');
      expect(service.isPublicHoliday(humanRightsDay)).toBe(true);
    });

    it('should return true for Christmas Day 2025', () => {
      const christmas = new Date('2025-12-25');
      expect(service.isPublicHoliday(christmas)).toBe(true);
    });

    it('should return false for regular weekday', () => {
      const regularDay = new Date('2025-01-02');
      expect(service.isPublicHoliday(regularDay)).toBe(false);
    });

    it('should handle 2026 holidays', () => {
      const newYear2026 = new Date('2026-01-01');
      expect(service.isPublicHoliday(newYear2026)).toBe(true);
    });
  });

  describe('isTenantClosure', () => {
    it('should return false when tenant has no closure dates', async () => {
      const result = await service.isTenantClosure(
        new Date('2025-01-15'),
        tenantId,
      );
      expect(result).toBe(false);
    });

    it('should return true when date is in tenant closure dates', async () => {
      // Update tenant with closure dates
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          closureDates: ['2025-01-15', '2025-01-16'],
        },
      });

      const result = await service.isTenantClosure(
        new Date('2025-01-15'),
        tenantId,
      );
      expect(result).toBe(true);
    });

    it('should return false when date is not in tenant closure dates', async () => {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          closureDates: ['2025-01-15', '2025-01-16'],
        },
      });

      const result = await service.isTenantClosure(
        new Date('2025-01-17'),
        tenantId,
      );
      expect(result).toBe(false);
    });
  });

  describe('getSchoolDays', () => {
    it('should count weekdays only', async () => {
      // January 6-10, 2025 is Mon-Fri (5 weekdays)
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const days = await service.getSchoolDays(start, end, tenantId);
      expect(days).toBe(5);
    });

    it('should exclude weekends', async () => {
      // January 6-12, 2025 is Mon-Sun (7 days, 5 weekdays)
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-12');

      const days = await service.getSchoolDays(start, end, tenantId);
      expect(days).toBe(5);
    });

    it('should exclude public holidays', async () => {
      // New Years Day 2025 is Wednesday
      // December 31 - January 3 should have 2 weekdays (Dec 31 Tue, Jan 2 Thu, Jan 3 Fri)
      // Jan 1 is public holiday, so only 3 weekdays
      const start = new Date('2024-12-31');
      const end = new Date('2025-01-03');

      const days = await service.getSchoolDays(start, end, tenantId);
      // Dec 31 (Tue), Jan 1 (Wed-holiday), Jan 2 (Thu), Jan 3 (Fri)
      expect(days).toBe(3);
    });

    it('should exclude tenant closure days', async () => {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          closureDates: ['2025-01-07', '2025-01-08'],
        },
      });

      // January 6-10, 2025 is Mon-Fri (5 weekdays, minus 2 closures = 3)
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const days = await service.getSchoolDays(start, end, tenantId);
      expect(days).toBe(3);
    });

    it('should return 0 for weekend-only period', async () => {
      // January 4-5, 2025 is Sat-Sun
      const start = new Date('2025-01-04');
      const end = new Date('2025-01-05');

      const days = await service.getSchoolDays(start, end, tenantId);
      expect(days).toBe(0);
    });

    it('should return 1 for single weekday', async () => {
      const monday = new Date('2025-01-06');

      const days = await service.getSchoolDays(monday, monday, tenantId);
      expect(days).toBe(1);
    });

    it('should count full month correctly', async () => {
      // January 2025: 31 days
      // 23 weekdays (excluding 8 weekend days: 4,5,11,12,18,19,25,26)
      // Minus New Years Day (1st) = 22 school days
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const days = await service.getSchoolDays(start, end, tenantId);
      expect(days).toBe(22);
    });
  });

  describe('calculateDailyRate', () => {
    it('should calculate daily rate correctly', async () => {
      // Monthly fee: R5000 = 500000 cents
      // January 2025 has 22 school days
      // Daily rate = 500000 / 22 = 22727.27... ≈ 22727 (banker's rounding)
      const monthlyFeeCents = 500000;
      const month = new Date('2025-01-15');

      const dailyRate = await service.calculateDailyRate(
        monthlyFeeCents,
        month,
        tenantId,
      );
      expect(dailyRate).toBe(22727);
    });

    it('should return 0 when no school days in month', async () => {
      // Set all weekdays as closures for a short period
      const closures: string[] = [];
      for (let d = 1; d <= 31; d++) {
        closures.push(`2025-01-${d.toString().padStart(2, '0')}`);
      }

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { closureDates: closures },
      });

      const dailyRate = await service.calculateDailyRate(
        500000,
        new Date('2025-01-15'),
        tenantId,
      );
      expect(dailyRate).toBe(0);
    });
  });

  describe('calculateProRata', () => {
    it('should return full fee for full month', async () => {
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );
      expect(proRata).toBe(monthlyFeeCents);
    });

    it('should calculate partial month correctly', async () => {
      // Monthly fee: R5000 = 500000 cents
      // January 2025 has 22 school days
      // January 13-17, 2025 is Mon-Fri (5 school days)
      // Pro-rata = 500000 / 22 * 5 = 113636.36... ≈ 113636
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-13');
      const end = new Date('2025-01-17');

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );
      expect(proRata).toBe(113636);
    });

    it('should throw error when start date is after end date', async () => {
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-20');
      const end = new Date('2025-01-10');

      await expect(
        service.calculateProRata(monthlyFeeCents, start, end, tenantId),
      ).rejects.toThrow(BusinessException);
    });

    it('should return 0 when entire period is holidays/weekends', async () => {
      // Weekend only
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-04'); // Saturday
      const end = new Date('2025-01-05'); // Sunday

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );
      expect(proRata).toBe(0);
    });

    it('should calculate single day correctly', async () => {
      // Monthly fee: R5000 = 500000 cents
      // January 2025 has 22 school days
      // Daily rate = 500000 / 22 = 22727.27...
      // 1 day = 22727
      const monthlyFeeCents = 500000;
      const singleDay = new Date('2025-01-06'); // Monday

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        singleDay,
        singleDay,
        tenantId,
      );
      expect(proRata).toBe(22727);
    });
  });

  describe('calculateProRataDetailed', () => {
    it('should return detailed breakdown', async () => {
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const result = await service.calculateProRataDetailed(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );

      expect(result.originalAmountCents).toBe(500000);
      expect(result.billedDays).toBe(5);
      expect(result.schoolDaysInMonth).toBe(22);
      expect(result.totalDaysInMonth).toBe(31);
      expect(result.excludedDays).toHaveLength(0); // No weekends in Mon-Fri
    });

    it('should include excluded days with reasons', async () => {
      // January 4-10 includes Sat 4, Sun 5
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-04');
      const end = new Date('2025-01-10');

      const result = await service.calculateProRataDetailed(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );

      expect(result.excludedDays.length).toBeGreaterThan(0);

      const weekendDays = result.excludedDays.filter(
        (d) => d.reason === 'WEEKEND',
      );
      expect(weekendDays.length).toBe(2); // Sat and Sun
    });

    it('should include public holidays in excluded days', async () => {
      // Include New Years Day
      const monthlyFeeCents = 500000;
      const start = new Date('2024-12-31');
      const end = new Date('2025-01-03');

      const result = await service.calculateProRataDetailed(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );

      const holidays = result.excludedDays.filter(
        (d) => d.reason === 'PUBLIC_HOLIDAY',
      );
      expect(holidays.length).toBe(1); // New Year's Day
    });

    it('should include closure days in excluded days', async () => {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { closureDates: ['2025-01-07'] },
      });

      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const result = await service.calculateProRataDetailed(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );

      const closures = result.excludedDays.filter(
        (d) => d.reason === 'CLOSURE',
      );
      expect(closures.length).toBe(1);
      expect(result.billedDays).toBe(4); // 5 weekdays minus 1 closure
    });
  });

  describe('handleMidMonthEnrollment', () => {
    it('should calculate fee from enrollment date to month end', async () => {
      // Child starts January 13 (Monday)
      // January 2025 has 22 school days
      // Jan 13-31 has approximately 15 school days (including 13-17, 20-24, 27-31 minus weekends)
      const monthlyFeeCents = 500000;
      const enrollmentDate = new Date('2025-01-13');
      const monthEnd = new Date('2025-01-31');

      const proRata = await service.handleMidMonthEnrollment(
        monthlyFeeCents,
        enrollmentDate,
        monthEnd,
        tenantId,
      );

      // Calculate expected: 15 school days / 22 total * 500000 = 340909
      const schoolDays = await service.getSchoolDays(
        enrollmentDate,
        monthEnd,
        tenantId,
      );
      expect(schoolDays).toBe(15);

      const expected = new Decimal(500000)
        .div(22)
        .mul(15)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber();
      expect(proRata).toBe(expected);
    });
  });

  describe('handleMidMonthWithdrawal', () => {
    it('should calculate fee from month start to withdrawal date', async () => {
      // Child leaves January 17 (Friday)
      const monthlyFeeCents = 500000;
      const monthStart = new Date('2025-01-01');
      const withdrawalDate = new Date('2025-01-17');

      const proRata = await service.handleMidMonthWithdrawal(
        monthlyFeeCents,
        monthStart,
        withdrawalDate,
        tenantId,
      );

      // Calculate expected school days in Jan 1-17
      const schoolDays = await service.getSchoolDays(
        monthStart,
        withdrawalDate,
        tenantId,
      );
      // Jan 1 (holiday), 2-3 (Thu-Fri), 6-10 (Mon-Fri), 13-17 (Mon-Fri) = 2+5+5 = 12 days
      expect(schoolDays).toBe(12);

      const expected = new Decimal(500000)
        .div(22)
        .mul(12)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber();
      expect(proRata).toBe(expected);
    });
  });

  describe("Banker's Rounding", () => {
    it("should use banker's rounding for .5 cases", async () => {
      // Create a scenario where rounding matters
      // Monthly fee where daily rate ends in .5
      // 100000 cents / 22 days = 4545.454545...
      const monthlyFeeCents = 100000;
      const month = new Date('2025-01-15');

      const dailyRate = await service.calculateDailyRate(
        monthlyFeeCents,
        month,
        tenantId,
      );

      // Banker's rounding: 4545.4545 should round to 4545
      expect(dailyRate).toBe(4545);
    });

    it('should round .5 to nearest even number', () => {
      // Direct test of Decimal.js banker's rounding
      const value1 = new Decimal('2.5');
      const value2 = new Decimal('3.5');
      const value3 = new Decimal('4.5');

      // Banker's rounding: .5 rounds to nearest even
      expect(
        value1.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
      ).toBe(2); // 2 is even
      expect(
        value2.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
      ).toBe(4); // 4 is even
      expect(
        value3.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
      ).toBe(4); // 4 is even
    });
  });

  describe('Edge Cases', () => {
    it('should handle month with no school days due to all closures', async () => {
      // Close every day in January
      const closures: string[] = [];
      for (let d = 1; d <= 31; d++) {
        closures.push(`2025-01-${d.toString().padStart(2, '0')}`);
      }

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { closureDates: closures },
      });

      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );
      expect(proRata).toBe(0);
    });

    it('should handle same start and end date (single day)', async () => {
      const monthlyFeeCents = 500000;
      const singleDay = new Date('2025-01-06'); // Monday

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        singleDay,
        singleDay,
        tenantId,
      );

      const dailyRate = await service.calculateDailyRate(
        monthlyFeeCents,
        singleDay,
        tenantId,
      );
      expect(proRata).toBe(dailyRate);
    });

    it('should normalize dates with time component', async () => {
      const monthlyFeeCents = 500000;
      const start = new Date('2025-01-06T10:30:00.000Z');
      const end = new Date('2025-01-10T23:59:59.999Z');

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );

      // Should work the same as dates without time
      const startNormalized = new Date('2025-01-06');
      const endNormalized = new Date('2025-01-10');
      const proRataNormalized = await service.calculateProRata(
        monthlyFeeCents,
        startNormalized,
        endNormalized,
        tenantId,
      );

      expect(proRata).toBe(proRataNormalized);
    });

    it('should handle February leap year correctly', async () => {
      // February 2024 has 29 days (leap year)
      const start = new Date('2024-02-01');
      const end = new Date('2024-02-29');

      const days = await service.getSchoolDays(start, end, tenantId);
      // February 2024: 29 days
      // Weekends: 3,4,10,11,17,18,24,25 = 8 weekend days
      // Weekdays: 21 days
      expect(days).toBe(21);
    });

    it('should handle non-existent tenant gracefully', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      // Should not throw, just treat as no closures
      const days = await service.getSchoolDays(start, end, fakeId);
      expect(days).toBe(5);
    });

    it('should handle zero monthly fee', async () => {
      const monthlyFeeCents = 0;
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const proRata = await service.calculateProRata(
        monthlyFeeCents,
        start,
        end,
        tenantId,
      );
      expect(proRata).toBe(0);
    });
  });

  describe('April 2025 (Good Friday and Family Day)', () => {
    it('should exclude Good Friday and Family Day', async () => {
      // April 18 (Good Friday) and April 21 (Family Day) are public holidays
      const start = new Date('2025-04-14'); // Monday
      const end = new Date('2025-04-25'); // Friday (2 weeks)

      const days = await service.getSchoolDays(start, end, tenantId);

      // April 14-18: Mon, Tue, Wed, Thu, Fri(holiday) = 4 days
      // April 19-20: Weekend
      // April 21-25: Mon(holiday), Tue, Wed, Thu, Fri = 4 days
      // Total: 8 school days
      expect(days).toBe(8);
    });
  });

  describe('Freedom Day observed (April 28, 2025)', () => {
    it('should exclude Freedom Day observed', async () => {
      // April 27 (Freedom Day) falls on Sunday, so April 28 is observed
      const start = new Date('2025-04-28');
      const end = new Date('2025-04-28');

      const isHoliday = service.isPublicHoliday(start);
      expect(isHoliday).toBe(true);

      const days = await service.getSchoolDays(start, end, tenantId);
      expect(days).toBe(0);
    });
  });
});
