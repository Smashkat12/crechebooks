<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-SARS-004</task_id>
    <title>Add Public Holiday Deadline Handling</title>
    <priority>LOW</priority>
    <severity>LOW</severity>
    <category>feature-enhancement</category>
    <estimated_effort>3-4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>
      <tag>sars</tag>
      <tag>deadlines</tag>
      <tag>public-holidays</tag>
      <tag>calendar</tag>
      <tag>south-africa</tag>
    </tags>
  </metadata>

  <context>
    <issue_description>
      The SARS deadline calculation service does not account for South African public holidays.
      When a submission deadline falls on a public holiday, it should be adjusted to the next
      business day per SARS rules.
    </issue_description>

    <current_behavior>
      Deadline calculations only consider weekends when adjusting dates. If a deadline falls
      on a public holiday that is not a weekend, the deadline is not adjusted.
    </current_behavior>

    <expected_behavior>
      Deadline calculations should check against South African public holidays and adjust
      to the next business day when a deadline falls on a public holiday or weekend.
    </expected_behavior>

    <affected_files>
      <file>apps/api/src/sars/deadline.service.ts</file>
      <file>apps/api/src/calendar/ (new service)</file>
    </affected_files>

    <sa_public_holidays>
      <holiday name="New Year's Day" date="January 1" />
      <holiday name="Human Rights Day" date="March 21" />
      <holiday name="Good Friday" date="Variable (Friday before Easter)" />
      <holiday name="Family Day" date="Variable (Monday after Easter)" />
      <holiday name="Freedom Day" date="April 27" />
      <holiday name="Workers' Day" date="May 1" />
      <holiday name="Youth Day" date="June 16" />
      <holiday name="National Women's Day" date="August 9" />
      <holiday name="Heritage Day" date="September 24" />
      <holiday name="Day of Reconciliation" date="December 16" />
      <holiday name="Christmas Day" date="December 25" />
      <holiday name="Day of Goodwill" date="December 26" />
    </sa_public_holidays>

    <sars_deadline_rule>
      When a deadline falls on a Saturday, Sunday, or public holiday, the deadline is
      moved to the next business day. If multiple consecutive non-business days occur,
      the deadline moves to the first business day after.
    </sars_deadline_rule>
  </context>

  <scope>
    <in_scope>
      <item>Create calendar service for SA public holidays</item>
      <item>Integrate holiday checking into deadline calculations</item>
      <item>Handle movable holidays (Easter-based)</item>
      <item>Handle substitute holidays (when holiday falls on Sunday)</item>
      <item>Support multi-year holiday data</item>
    </in_scope>

    <out_of_scope>
      <item>Company-specific holidays</item>
      <item>Provincial holidays</item>
      <item>External calendar API integration</item>
      <item>Holiday calendar management UI</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Create a dedicated calendar service that provides South African public holiday data
      and business day calculations. This service will be injected into the deadline
      service to enhance deadline calculations.
    </approach>

    <steps>
      <step order="1">
        <description>Create public holiday data provider</description>
        <details>
          Define holiday data structure and populate with SA public holidays
        </details>
        <code_example>
// apps/api/src/calendar/sa-holidays.data.ts
import { addDays, getYear } from 'date-fns';

export interface PublicHoliday {
  name: string;
  date: Date;
  isMovable: boolean;
  substituteDate?: Date; // When original falls on Sunday
}

/**
 * Calculate Easter Sunday for a given year using Anonymous Gregorian algorithm
 */
function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month, day);
}

/**
 * Generate SA public holidays for a given year
 */
export function getSAPublicHolidays(year: number): PublicHoliday[] {
  const easterSunday = calculateEasterSunday(year);
  const goodFriday = addDays(easterSunday, -2);
  const familyDay = addDays(easterSunday, 1);

  const fixedHolidays: Array<{ name: string; month: number; day: number }> = [
    { name: "New Year's Day", month: 0, day: 1 },
    { name: 'Human Rights Day', month: 2, day: 21 },
    { name: 'Freedom Day', month: 3, day: 27 },
    { name: "Workers' Day", month: 4, day: 1 },
    { name: 'Youth Day', month: 5, day: 16 },
    { name: "National Women's Day", month: 7, day: 9 },
    { name: 'Heritage Day', month: 8, day: 24 },
    { name: 'Day of Reconciliation', month: 11, day: 16 },
    { name: 'Christmas Day', month: 11, day: 25 },
    { name: 'Day of Goodwill', month: 11, day: 26 },
  ];

  const holidays: PublicHoliday[] = fixedHolidays.map(h => {
    const date = new Date(year, h.month, h.day);
    const isSunday = date.getDay() === 0;

    return {
      name: h.name,
      date,
      isMovable: false,
      substituteDate: isSunday ? addDays(date, 1) : undefined,
    };
  });

  // Add movable holidays (Easter-based)
  holidays.push(
    { name: 'Good Friday', date: goodFriday, isMovable: true },
    { name: 'Family Day', date: familyDay, isMovable: true },
  );

  return holidays;
}
        </code_example>
      </step>

      <step order="2">
        <description>Create calendar service</description>
        <details>
          Implement service with methods for checking business days and holidays
        </details>
        <code_example>
// apps/api/src/calendar/calendar.service.ts
import { Injectable } from '@nestjs/common';
import {
  isWeekend,
  isSameDay,
  addDays,
  getYear,
  format
} from 'date-fns';
import { getSAPublicHolidays, PublicHoliday } from './sa-holidays.data';

@Injectable()
export class CalendarService {
  private holidayCache = new Map<number, PublicHoliday[]>();

  /**
   * Get all public holidays for a year (with caching)
   */
  getHolidaysForYear(year: number): PublicHoliday[] {
    if (!this.holidayCache.has(year)) {
      this.holidayCache.set(year, getSAPublicHolidays(year));
    }
    return this.holidayCache.get(year)!;
  }

  /**
   * Check if a date is a SA public holiday
   */
  isPublicHoliday(date: Date): boolean {
    const year = getYear(date);
    const holidays = this.getHolidaysForYear(year);

    return holidays.some(holiday =>
      isSameDay(date, holiday.date) ||
      (holiday.substituteDate && isSameDay(date, holiday.substituteDate))
    );
  }

  /**
   * Check if a date is a business day (not weekend, not holiday)
   */
  isBusinessDay(date: Date): boolean {
    return !isWeekend(date) && !this.isPublicHoliday(date);
  }

  /**
   * Get the next business day from a given date
   */
  getNextBusinessDay(date: Date): Date {
    let nextDay = date;

    while (!this.isBusinessDay(nextDay)) {
      nextDay = addDays(nextDay, 1);
    }

    return nextDay;
  }

  /**
   * Adjust a deadline to the next business day if needed
   */
  adjustDeadlineForHolidays(deadline: Date): Date {
    if (this.isBusinessDay(deadline)) {
      return deadline;
    }
    return this.getNextBusinessDay(deadline);
  }

  /**
   * Get holiday name if date is a holiday
   */
  getHolidayName(date: Date): string | null {
    const year = getYear(date);
    const holidays = this.getHolidaysForYear(year);

    const holiday = holidays.find(h =>
      isSameDay(date, h.date) ||
      (h.substituteDate && isSameDay(date, h.substituteDate))
    );

    return holiday?.name ?? null;
  }
}
        </code_example>
      </step>

      <step order="3">
        <description>Update deadline service to use calendar service</description>
        <details>
          Inject calendar service and use it for deadline adjustments
        </details>
        <code_example>
// apps/api/src/sars/deadline.service.ts (updated)
import { Injectable } from '@nestjs/common';
import { addMonths, setDate, format } from 'date-fns';
import { CalendarService } from '../calendar/calendar.service';

@Injectable()
export class DeadlineService {
  constructor(private readonly calendarService: CalendarService) {}

  /**
   * Calculate VAT201 submission deadline for a tax period
   * Deadline: Last business day of month following tax period
   */
  calculateVat201Deadline(taxPeriod: string): Date {
    const year = parseInt(taxPeriod.substring(0, 4));
    const month = parseInt(taxPeriod.substring(4, 6)) - 1;

    // Deadline is end of following month
    const periodEnd = new Date(year, month + 1, 0); // Last day of period month
    const deadlineMonth = addMonths(periodEnd, 1);
    const lastDayOfDeadlineMonth = new Date(
      deadlineMonth.getFullYear(),
      deadlineMonth.getMonth() + 1,
      0
    );

    // Adjust for weekends and holidays
    return this.calendarService.adjustDeadlineForHolidays(lastDayOfDeadlineMonth);
  }

  /**
   * Calculate EMP201 submission deadline
   * Deadline: 7th of month following tax period (adjusted for non-business days)
   */
  calculateEmp201Deadline(taxPeriod: string): Date {
    const year = parseInt(taxPeriod.substring(0, 4));
    const month = parseInt(taxPeriod.substring(4, 6)) - 1;

    // Deadline is 7th of following month
    const deadline = new Date(year, month + 1, 7);

    // Adjust for weekends and holidays
    return this.calendarService.adjustDeadlineForHolidays(deadline);
  }

  /**
   * Get deadline with explanation if adjusted
   */
  getDeadlineWithExplanation(
    submissionType: 'VAT201' | 'EMP201',
    taxPeriod: string,
  ): { deadline: Date; adjusted: boolean; reason?: string } {
    const calculator = submissionType === 'VAT201'
      ? this.calculateVat201Deadline.bind(this)
      : this.calculateEmp201Deadline.bind(this);

    // Calculate original deadline without adjustment
    const originalDeadline = this.calculateOriginalDeadline(submissionType, taxPeriod);
    const adjustedDeadline = calculator(taxPeriod);

    if (isSameDay(originalDeadline, adjustedDeadline)) {
      return { deadline: adjustedDeadline, adjusted: false };
    }

    const holidayName = this.calendarService.getHolidayName(originalDeadline);
    const reason = holidayName
      ? `Adjusted from ${format(originalDeadline, 'yyyy-MM-dd')} (${holidayName})`
      : `Adjusted from ${format(originalDeadline, 'yyyy-MM-dd')} (weekend)`;

    return { deadline: adjustedDeadline, adjusted: true, reason };
  }
}
        </code_example>
      </step>

      <step order="4">
        <description>Create calendar module</description>
        <details>
          Register calendar service as a NestJS module
        </details>
        <code_example>
// apps/api/src/calendar/calendar.module.ts
import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Module({
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
        </code_example>
      </step>

      <step order="5">
        <description>Add comprehensive tests</description>
        <details>
          Test holiday calculations, business day logic, and deadline adjustments
        </details>
      </step>
    </steps>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should identify December 25 as public holiday</name>
        <type>unit</type>
        <expected_result>isPublicHoliday returns true for Christmas</expected_result>
      </test_case>
      <test_case>
        <name>Should calculate Easter correctly for 2024</name>
        <type>unit</type>
        <expected_result>Easter Sunday is March 31, 2024</expected_result>
      </test_case>
      <test_case>
        <name>Should handle substitute holidays (Sunday shift)</name>
        <type>unit</type>
        <expected_result>Monday after Sunday holiday is also non-business</expected_result>
      </test_case>
      <test_case>
        <name>Should adjust deadline falling on Christmas</name>
        <type>integration</type>
        <expected_result>Deadline moves to December 27 (or next business day)</expected_result>
      </test_case>
      <test_case>
        <name>Should not adjust deadline on regular business day</name>
        <type>unit</type>
        <expected_result>Deadline unchanged when on business day</expected_result>
      </test_case>
      <test_case>
        <name>Should handle consecutive non-business days</name>
        <type>integration</type>
        <expected_result>Deadline moves past all non-business days</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Check deadline for period ending December with Christmas adjustment</step>
      <step>Verify Good Friday/Easter Monday handling for April period</step>
      <step>Test deadline calculation for period with substitute holiday</step>
      <step>Verify multi-year holiday caching works correctly</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criterion>Calendar service created with SA public holidays</criterion>
    <criterion>Easter calculation algorithm implemented correctly</criterion>
    <criterion>Substitute holiday logic (Sunday shift) implemented</criterion>
    <criterion>Deadline service integrated with calendar service</criterion>
    <criterion>Business day calculation accounts for both weekends and holidays</criterion>
    <criterion>Unit tests cover all 12 SA public holidays</criterion>
    <criterion>Integration tests verify deadline adjustments</criterion>
    <criterion>Holiday data accurate for 2024-2030</criterion>
    <criterion>Code review approved</criterion>
  </definition_of_done>
</task_specification>
