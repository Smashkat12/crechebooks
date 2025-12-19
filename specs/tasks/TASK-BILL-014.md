<task_spec id="TASK-BILL-014" version="1.0">

<metadata>
  <title>Pro-rata Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>23</sequence>
  <implements>
    <requirement_ref>REQ-BILL-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the ProRataService which calculates pro-rated fees for children
who start or end their enrollment mid-month. The service accounts for school
holidays (public holidays and creche closure days) when calculating the number
of billable days in a period. All calculations use Decimal.js with banker's
rounding to ensure accuracy and consistency. The daily rate is calculated as
monthly_fee / school_days_in_month, then multiplied by actual attendance days.
</context>

<input_context_files>
  <file purpose="requirements">specs/requirements/billing.md#REQ-BILL-010</file>
  <file purpose="data_model">specs/technical/data-models.md#Enrollment</file>
  <file purpose="tenant_entity">src/database/entities/tenant.entity.ts</file>
  <file purpose="holiday_reference">South African public holidays calendar</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-012 in progress (InvoiceGenerationService needs this)</check>
  <check>Decimal.js installed and configured</check>
  <check>Tenant entity with holiday settings available</check>
  <check>Date manipulation utilities available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create ProRataService in src/core/billing/
    - Implement calculateProRata method
    - Implement getSchoolDays method (excludes weekends and holidays)
    - Implement calculateDailyRate method
    - Implement handleMidMonthEnrollment helper
    - Implement handleMidMonthWithdrawal helper
    - South African public holiday calendar integration
    - Tenant-specific closure days configuration
    - Weekend exclusion (Saturday, Sunday)
    - All calculations using Decimal.js with banker's rounding
    - Unit tests for various scenarios
  </in_scope>
  <out_of_scope>
    - Holiday calendar management UI
    - Tenant closure day configuration UI
    - Historical holiday data storage (use hardcoded/config for 2025-2026)
    - Partial day calculations (e.g., half-day start)
    - API endpoints
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/billing/pro-rata.service.ts">
      import { Injectable } from '@nestjs/common';
      import { TenantRepository } from '../../database/repositories/tenant.repository';
      import Decimal from 'decimal.js';

      // Configure Decimal.js for banker's rounding
      Decimal.set({
        precision: 20,
        rounding: Decimal.ROUND_HALF_EVEN  // Banker's rounding
      });

      export interface ProRataCalculation {
        originalAmountCents: number;
        proRataAmountCents: number;
        dailyRateCents: number;
        totalDaysInMonth: number;
        schoolDaysInMonth: number;
        billedDays: number;
        startDate: Date;
        endDate: Date;
        excludedDays: Array&lt;{
          date: Date;
          reason: 'WEEKEND' | 'PUBLIC_HOLIDAY' | 'CLOSURE';
        }&gt;;
      }

      @Injectable()
      export class ProRataService {
        constructor(
          private readonly tenantRepo: TenantRepository,
        ) {}

        /**
         * Calculate pro-rata amount for partial month enrollment
         * @param monthlyFeeCents Monthly fee in cents (integer)
         * @param startDate First attendance date (inclusive)
         * @param endDate Last attendance date (inclusive)
         * @param tenantId For tenant-specific holiday/closure settings
         * @returns Pro-rated amount in cents with banker's rounding
         */
        async calculateProRata(
          monthlyFeeCents: number,
          startDate: Date,
          endDate: Date,
          tenantId: string,
        ): Promise&lt;number&gt;;

        /**
         * Calculate pro-rata with detailed breakdown
         * Useful for debugging and displaying calculation details
         */
        async calculateProRataDetailed(
          monthlyFeeCents: number,
          startDate: Date,
          endDate: Date,
          tenantId: string,
        ): Promise&lt;ProRataCalculation&gt;;

        /**
         * Get number of school days in period (excludes weekends and holidays)
         * @param startDate Period start (inclusive)
         * @param endDate Period end (inclusive)
         * @param tenantId For tenant-specific closure days
         * @returns Count of billable days
         */
        async getSchoolDays(
          startDate: Date,
          endDate: Date,
          tenantId: string,
        ): Promise&lt;number&gt;;

        /**
         * Calculate daily rate from monthly fee
         * Uses school days in month as denominator
         * @returns Daily rate in cents with banker's rounding
         */
        async calculateDailyRate(
          monthlyFeeCents: number,
          month: Date,
          tenantId: string,
        ): Promise&lt;number&gt;;

        /**
         * Handle mid-month enrollment (start date after month start)
         */
        async handleMidMonthEnrollment(
          monthlyFeeCents: number,
          enrollmentDate: Date,
          monthEnd: Date,
          tenantId: string,
        ): Promise&lt;number&gt;;

        /**
         * Handle mid-month withdrawal (end date before month end)
         */
        async handleMidMonthWithdrawal(
          monthlyFeeCents: number,
          monthStart: Date,
          withdrawalDate: Date,
          tenantId: string,
        ): Promise&lt;number&gt;;

        /**
         * Check if date is a public holiday (South African calendar)
         */
        isPublicHoliday(date: Date): boolean;

        /**
         * Check if date is a tenant closure day
         */
        async isTenantClosure(date: Date, tenantId: string): Promise&lt;boolean&gt;;

        /**
         * Check if date is a weekend (Saturday or Sunday)
         */
        isWeekend(date: Date): boolean;
      }
    </signature>

    <signature file="src/core/billing/constants/public-holidays.ts">
      /**
       * South African public holidays 2025-2026
       * Source: https://www.gov.za/about-sa/public-holidays
       */
      export const PUBLIC_HOLIDAYS_2025: Date[] = [
        new Date('2025-01-01'),  // New Year's Day
        new Date('2025-03-21'),  // Human Rights Day
        new Date('2025-04-18'),  // Good Friday
        new Date('2025-04-21'),  // Family Day
        new Date('2025-04-27'),  // Freedom Day
        new Date('2025-05-01'),  // Workers' Day
        new Date('2025-06-16'),  // Youth Day
        new Date('2025-08-09'),  // National Women's Day
        new Date('2025-09-24'),  // Heritage Day
        new Date('2025-12-16'),  // Day of Reconciliation
        new Date('2025-12-25'),  // Christmas Day
        new Date('2025-12-26'),  // Day of Goodwill
      ];

      export const PUBLIC_HOLIDAYS_2026: Date[] = [
        new Date('2026-01-01'),  // New Year's Day
        new Date('2026-03-21'),  // Human Rights Day
        new Date('2026-04-03'),  // Good Friday
        new Date('2026-04-06'),  // Family Day
        new Date('2026-04-27'),  // Freedom Day
        new Date('2026-05-01'),  // Workers' Day
        new Date('2026-06-16'),  // Youth Day
        new Date('2026-08-09'),  // National Women's Day
        new Date('2026-09-24'),  // Heritage Day
        new Date('2026-12-16'),  // Day of Reconciliation
        new Date('2026-12-25'),  // Christmas Day
        new Date('2026-12-26'),  // Day of Goodwill
      ];

      export function getPublicHolidays(year: number): Date[] {
        if (year === 2025) return PUBLIC_HOLIDAYS_2025;
        if (year === 2026) return PUBLIC_HOLIDAYS_2026;
        return [];  // Future: fetch from database or API
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL calculations
    - Must use banker's rounding (ROUND_HALF_EVEN) consistently
    - Must convert to cents (integer) only at final step
    - Must exclude weekends (Saturday=6, Sunday=0) from school days
    - Must exclude South African public holidays from school days
    - Must exclude tenant-specific closure days from school days
    - Daily rate = monthly_fee / school_days_in_full_month
    - Pro-rata amount = daily_rate * billed_school_days
    - Start and end dates are INCLUSIVE
    - Must handle month boundaries correctly
    - Must validate startDate <= endDate
    - Must handle edge cases (e.g., entire month is holidays)
    - Must NOT use 'any' type anywhere
    - Date comparisons must ignore time component
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass
    - calculateProRata uses banker's rounding
    - getSchoolDays excludes weekends correctly
    - getSchoolDays excludes public holidays correctly
    - getSchoolDays excludes tenant closures correctly
    - calculateDailyRate divides by school days (not calendar days)
    - handleMidMonthEnrollment calculates from start date to month end
    - handleMidMonthWithdrawal calculates from month start to end date
    - Edge case: Full month returns full fee
    - Edge case: Single day calculates one day's rate
    - Edge case: All weekends/holidays handled correctly
    - Detailed calculation shows correct breakdown
  </verification>
</definition_of_done>

<pseudo_code>
ProRataService (src/core/billing/pro-rata.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN  // Banker's rounding
    })

  async calculateProRata(monthlyFeeCents, startDate, endDate, tenantId):
    // Validate dates
    if (startDate > endDate) {
      throw new Error('Start date must be before or equal to end date')
    }

    // Get month boundaries
    monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)

    // Get school days in full month
    schoolDaysInMonth = await this.getSchoolDays(monthStart, monthEnd, tenantId)

    if (schoolDaysInMonth === 0) {
      // Edge case: entire month is holidays/weekends
      return 0
    }

    // Calculate daily rate using Decimal.js
    monthlyFee = new Decimal(monthlyFeeCents)
    dailyRate = monthlyFee.div(schoolDaysInMonth)

    // Get school days in billed period
    billedDays = await this.getSchoolDays(startDate, endDate, tenantId)

    // Calculate pro-rata amount
    proRataAmount = dailyRate.mul(billedDays)

    // Round to integer cents using banker's rounding
    proRataCents = proRataAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()

    return proRataCents

  async calculateProRataDetailed(monthlyFeeCents, startDate, endDate, tenantId):
    // Normalize dates to remove time component
    normalizedStart = new Date(startDate)
    normalizedStart.setHours(0, 0, 0, 0)
    normalizedEnd = new Date(endDate)
    normalizedEnd.setHours(0, 0, 0, 0)

    // Get month boundaries
    monthStart = new Date(normalizedStart.getFullYear(), normalizedStart.getMonth(), 1)
    monthEnd = new Date(normalizedStart.getFullYear(), normalizedStart.getMonth() + 1, 0)

    // Get total days in month
    totalDaysInMonth = monthEnd.getDate()

    // Get school days in full month
    schoolDaysInMonth = await this.getSchoolDays(monthStart, monthEnd, tenantId)

    // Calculate daily rate
    monthlyFee = new Decimal(monthlyFeeCents)
    dailyRate = monthlyFee.div(schoolDaysInMonth)
    dailyRateCents = dailyRate.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()

    // Get excluded days in billed period
    excludedDays = []
    currentDate = new Date(normalizedStart)

    while (currentDate <= normalizedEnd) {
      if (this.isWeekend(currentDate)) {
        excludedDays.push({
          date: new Date(currentDate),
          reason: 'WEEKEND'
        })
      } else if (this.isPublicHoliday(currentDate)) {
        excludedDays.push({
          date: new Date(currentDate),
          reason: 'PUBLIC_HOLIDAY'
        })
      } else if (await this.isTenantClosure(currentDate, tenantId)) {
        excludedDays.push({
          date: new Date(currentDate),
          reason: 'CLOSURE'
        })
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Get billed school days
    billedDays = await this.getSchoolDays(normalizedStart, normalizedEnd, tenantId)

    // Calculate pro-rata amount
    proRataAmount = dailyRate.mul(billedDays)
    proRataCents = proRataAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()

    return {
      originalAmountCents: monthlyFeeCents,
      proRataAmountCents: proRataCents,
      dailyRateCents: dailyRateCents,
      totalDaysInMonth: totalDaysInMonth,
      schoolDaysInMonth: schoolDaysInMonth,
      billedDays: billedDays,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      excludedDays: excludedDays
    }

  async getSchoolDays(startDate, endDate, tenantId):
    // Normalize dates
    normalizedStart = new Date(startDate)
    normalizedStart.setHours(0, 0, 0, 0)
    normalizedEnd = new Date(endDate)
    normalizedEnd.setHours(0, 0, 0, 0)

    schoolDays = 0
    currentDate = new Date(normalizedStart)

    while (currentDate <= normalizedEnd) {
      // Check if this is a school day
      isSchoolDay = true

      if (this.isWeekend(currentDate)) {
        isSchoolDay = false
      } else if (this.isPublicHoliday(currentDate)) {
        isSchoolDay = false
      } else if (await this.isTenantClosure(currentDate, tenantId)) {
        isSchoolDay = false
      }

      if (isSchoolDay) {
        schoolDays++
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return schoolDays

  async calculateDailyRate(monthlyFeeCents, month, tenantId):
    // Get month boundaries
    monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
    monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)

    // Get school days in month
    schoolDays = await this.getSchoolDays(monthStart, monthEnd, tenantId)

    if (schoolDays === 0) {
      return 0
    }

    // Calculate daily rate with Decimal.js
    monthlyFee = new Decimal(monthlyFeeCents)
    dailyRate = monthlyFee.div(schoolDays)

    // Round to integer cents
    dailyRateCents = dailyRate.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()

    return dailyRateCents

  async handleMidMonthEnrollment(monthlyFeeCents, enrollmentDate, monthEnd, tenantId):
    // Calculate from enrollment date to month end
    return await this.calculateProRata(
      monthlyFeeCents,
      enrollmentDate,
      monthEnd,
      tenantId
    )

  async handleMidMonthWithdrawal(monthlyFeeCents, monthStart, withdrawalDate, tenantId):
    // Calculate from month start to withdrawal date
    return await this.calculateProRata(
      monthlyFeeCents,
      monthStart,
      withdrawalDate,
      tenantId
    )

  isPublicHoliday(date):
    // Normalize date to remove time
    normalized = new Date(date)
    normalized.setHours(0, 0, 0, 0)

    // Get public holidays for year
    year = normalized.getFullYear()
    holidays = getPublicHolidays(year)

    // Check if date matches any holiday
    for (holiday in holidays) {
      holidayNormalized = new Date(holiday)
      holidayNormalized.setHours(0, 0, 0, 0)

      if (normalized.getTime() === holidayNormalized.getTime()) {
        return true
      }
    }

    return false

  async isTenantClosure(date, tenantId):
    // Get tenant closure dates from database
    tenant = await tenantRepo.findById(tenantId)

    if (!tenant.closureDates || tenant.closureDates.length === 0) {
      return false
    }

    // Normalize date
    normalized = new Date(date)
    normalized.setHours(0, 0, 0, 0)

    // Check if date matches any closure
    for (closure in tenant.closureDates) {
      closureNormalized = new Date(closure)
      closureNormalized.setHours(0, 0, 0, 0)

      if (normalized.getTime() === closureNormalized.getTime()) {
        return true
      }
    }

    return false

  isWeekend(date):
    // 0 = Sunday, 6 = Saturday
    dayOfWeek = date.getDay()
    return dayOfWeek === 0 || dayOfWeek === 6

Public Holidays Constants (src/core/billing/constants/public-holidays.ts):

  // South African public holidays for 2025
  PUBLIC_HOLIDAYS_2025 = [
    new Date('2025-01-01'),  // New Year's Day
    new Date('2025-03-21'),  // Human Rights Day
    new Date('2025-04-18'),  // Good Friday
    new Date('2025-04-21'),  // Family Day
    new Date('2025-04-27'),  // Freedom Day
    new Date('2025-05-01'),  // Workers' Day
    new Date('2025-06-16'),  // Youth Day
    new Date('2025-08-09'),  // National Women's Day
    new Date('2025-09-24'),  // Heritage Day
    new Date('2025-12-16'),  // Day of Reconciliation
    new Date('2025-12-25'),  // Christmas Day
    new Date('2025-12-26'),  // Day of Goodwill
  ]

  // Similar for 2026

  function getPublicHolidays(year):
    if (year === 2025) return PUBLIC_HOLIDAYS_2025
    if (year === 2026) return PUBLIC_HOLIDAYS_2026
    return []  // Future: fetch from database
</pseudo_code>

<files_to_create>
  <file path="src/core/billing/pro-rata.service.ts">ProRataService with all methods</file>
  <file path="src/core/billing/constants/public-holidays.ts">South African public holidays calendar</file>
  <file path="tests/core/billing/pro-rata.service.spec.ts">Unit tests for pro-rata calculations</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/billing/billing.module.ts">Import and export ProRataService</file>
  <file path="src/database/entities/tenant.entity.ts">Add closureDates field if not present</file>
  <file path="prisma/schema.prisma">Add closureDates to Tenant model if not present</file>
</files_to_modify>

<validation_criteria>
  <criterion>ProRataService compiles without TypeScript errors</criterion>
  <criterion>All calculations use Decimal.js with banker's rounding</criterion>
  <criterion>calculateProRata returns correct amount for partial month</criterion>
  <criterion>getSchoolDays excludes weekends (Saturday, Sunday)</criterion>
  <criterion>getSchoolDays excludes South African public holidays</criterion>
  <criterion>getSchoolDays excludes tenant closure days</criterion>
  <criterion>calculateDailyRate divides by school days, not calendar days</criterion>
  <criterion>Full month enrollment returns full monthly fee</criterion>
  <criterion>Single day enrollment calculates one daily rate</criterion>
  <criterion>Mid-month start calculates correctly</criterion>
  <criterion>Mid-month end calculates correctly</criterion>
  <criterion>Edge case: All holidays/weekends returns 0</criterion>
  <criterion>Date comparisons ignore time component</criterion>
  <criterion>calculateProRataDetailed provides accurate breakdown</criterion>
  <criterion>All unit tests pass with >90% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- pro-rata.service.spec.ts</command>
  <command>npm run test:cov -- pro-rata.service.spec.ts</command>
</test_commands>

</task_spec>
