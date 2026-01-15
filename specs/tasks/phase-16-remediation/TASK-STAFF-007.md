<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-007</task_id>
    <title>Integrate SA Public Holiday Calendar</title>
    <priority>MEDIUM</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>business-logic</category>
    <estimated_effort>5 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-02-01</due_date>
    <tags>holidays, calendar, leave, payroll, sa-compliance</tags>
  </metadata>

  <context>
    <problem_statement>
      South African public holidays are not considered in leave calculations, payroll
      processing, and working day calculations. This leads to incorrect leave balance
      deductions when leave spans public holidays and incorrect overtime/public holiday
      pay calculations.
    </problem_statement>

    <business_impact>
      - Leave balances incorrectly deducted for public holidays
      - Public holiday pay not automatically calculated
      - Working day calculations include public holidays
      - Staff disputes over leave deductions
      - Compliance issues with BCEA public holiday requirements
    </business_impact>

    <technical_background>
      South Africa has 12 official public holidays per year. When a public holiday falls
      on a Sunday, the following Monday is observed. Staff working on public holidays
      are entitled to double pay. Leave calculations should exclude public holidays from
      deductions.
    </technical_background>

    <dependencies>
      - Leave calculation service
      - Payroll calculation service
      - Working days calculation utilities
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Create public holiday calendar service</item>
      <item>Store public holidays in database with multi-year support</item>
      <item>Handle Sunday holiday observance rules</item>
      <item>Integrate with leave calculations to exclude holidays</item>
      <item>Integrate with payroll for public holiday pay</item>
      <item>Add admin API for holiday management</item>
      <item>Pre-populate with SA public holidays</item>
    </in_scope>

    <out_of_scope>
      <item>International holiday support</item>
      <item>Province-specific holidays</item>
      <item>Company-specific holidays (separate feature)</item>
    </out_of_scope>

    <affected_files>
      <file action="create">apps/api/src/common/services/calendar.service.ts</file>
      <file action="create">apps/api/src/common/entities/public-holiday.entity.ts</file>
      <file action="create">apps/api/src/common/constants/sa-public-holidays.ts</file>
      <file action="create">apps/api/src/common/dto/public-holiday.dto.ts</file>
      <file action="modify">apps/api/src/staff/services/leave-calculation.service.ts</file>
      <file action="modify">apps/api/src/payroll/payroll-calculator.service.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Create a calendar service that manages public holidays with database storage for
      flexibility. Implement the SA Sunday observance rule. Integrate the service with
      leave and payroll calculations to properly account for public holidays.
    </approach>

    <steps>
      <step order="1">
        <description>Create public holiday entity</description>
        <details>
          ```typescript
          // public-holiday.entity.ts
          import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

          @Entity('public_holidays')
          @Index(['date', 'countryCode'], { unique: true })
          export class PublicHoliday {
            @PrimaryGeneratedColumn('uuid')
            id: string;

            @Column()
            name: string;

            @Column({ type: 'date' })
            date: Date;

            @Column({ length: 2, default: 'ZA' })
            countryCode: string; // ISO 3166-1 alpha-2

            @Column({ default: false })
            isObserved: boolean; // True if this is an observed day (e.g., Monday for Sunday holiday)

            @Column({ type: 'date', nullable: true })
            originalDate: Date; // Original date if observed on different day

            @Column({ nullable: true })
            description: string;

            @Column({ default: true })
            isActive: boolean;

            @CreateDateColumn()
            createdAt: Date;

            @UpdateDateColumn()
            updatedAt: Date;
          }
          ```
        </details>
      </step>

      <step order="2">
        <description>Define SA public holidays constants</description>
        <details>
          ```typescript
          // sa-public-holidays.ts
          export interface SAPublicHolidayDefinition {
            name: string;
            month: number; // 1-12
            day: number;
            description?: string;
          }

          // Fixed-date South African public holidays
          export const SA_PUBLIC_HOLIDAYS: SAPublicHolidayDefinition[] = [
            { name: "New Year's Day", month: 1, day: 1, description: "First day of the year" },
            { name: "Human Rights Day", month: 3, day: 21, description: "Commemorates the Sharpeville massacre" },
            { name: "Good Friday", month: 0, day: 0, description: "Friday before Easter Sunday (calculated)" },
            { name: "Family Day", month: 0, day: 0, description: "Monday after Easter Sunday (calculated)" },
            { name: "Freedom Day", month: 4, day: 27, description: "First democratic election in 1994" },
            { name: "Workers' Day", month: 5, day: 1, description: "International Workers' Day" },
            { name: "Youth Day", month: 6, day: 16, description: "Commemorates the Soweto uprising" },
            { name: "National Women's Day", month: 8, day: 9, description: "Women's march to Union Buildings in 1956" },
            { name: "Heritage Day", month: 9, day: 24, description: "Celebrating SA's cultural heritage" },
            { name: "Day of Reconciliation", month: 12, day: 16, description: "Promoting reconciliation and unity" },
            { name: "Christmas Day", month: 12, day: 25, description: "Christian celebration of Christ's birth" },
            { name: "Day of Goodwill", month: 12, day: 26, description: "Day after Christmas" }
          ];

          // Easter calculation (Computus algorithm)
          export function calculateEasterSunday(year: number): Date {
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
            const month = Math.floor((h + l - 7 * m + 114) / 31);
            const day = ((h + l - 7 * m + 114) % 31) + 1;

            return new Date(year, month - 1, day);
          }

          export function calculateGoodFriday(year: number): Date {
            const easter = calculateEasterSunday(year);
            return new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days before Easter
          }

          export function calculateFamilyDay(year: number): Date {
            const easter = calculateEasterSunday(year);
            return new Date(easter.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day after Easter
          }
          ```
        </details>
      </step>

      <step order="3">
        <description>Implement calendar service</description>
        <details>
          ```typescript
          // calendar.service.ts
          import { Injectable, Logger, NotFoundException } from '@nestjs/common';
          import { InjectRepository } from '@nestjs/typeorm';
          import { Repository, Between, In } from 'typeorm';
          import { startOfYear, endOfYear, addDays, getDay, format, eachDayOfInterval, isWeekend } from 'date-fns';

          @Injectable()
          export class CalendarService {
            private readonly logger = new Logger(CalendarService.name);

            constructor(
              @InjectRepository(PublicHoliday)
              private readonly holidayRepo: Repository<PublicHoliday>
            ) {}

            async getHolidaysForYear(year: number, countryCode: string = 'ZA'): Promise<PublicHoliday[]> {
              const startDate = startOfYear(new Date(year, 0, 1));
              const endDate = endOfYear(new Date(year, 0, 1));

              return this.holidayRepo.find({
                where: {
                  date: Between(startDate, endDate),
                  countryCode,
                  isActive: true
                },
                order: { date: 'ASC' }
              });
            }

            async getHolidaysInRange(
              startDate: Date,
              endDate: Date,
              countryCode: string = 'ZA'
            ): Promise<PublicHoliday[]> {
              return this.holidayRepo.find({
                where: {
                  date: Between(startDate, endDate),
                  countryCode,
                  isActive: true
                },
                order: { date: 'ASC' }
              });
            }

            async isPublicHoliday(date: Date, countryCode: string = 'ZA'): Promise<boolean> {
              const dateStr = format(date, 'yyyy-MM-dd');

              const holiday = await this.holidayRepo.findOne({
                where: {
                  date: new Date(dateStr),
                  countryCode,
                  isActive: true
                }
              });

              return !!holiday;
            }

            async getWorkingDaysInRange(
              startDate: Date,
              endDate: Date,
              countryCode: string = 'ZA'
            ): Promise<number> {
              const allDays = eachDayOfInterval({ start: startDate, end: endDate });
              const holidays = await this.getHolidaysInRange(startDate, endDate, countryCode);
              const holidayDates = new Set(holidays.map(h => format(h.date, 'yyyy-MM-dd')));

              let workingDays = 0;

              for (const day of allDays) {
                const dayStr = format(day, 'yyyy-MM-dd');

                // Skip weekends
                if (isWeekend(day)) continue;

                // Skip public holidays
                if (holidayDates.has(dayStr)) continue;

                workingDays++;
              }

              return workingDays;
            }

            async generateHolidaysForYear(year: number): Promise<PublicHoliday[]> {
              const holidays: PublicHoliday[] = [];

              for (const holidayDef of SA_PUBLIC_HOLIDAYS) {
                let date: Date;

                // Handle Easter-based holidays
                if (holidayDef.name === 'Good Friday') {
                  date = calculateGoodFriday(year);
                } else if (holidayDef.name === 'Family Day') {
                  date = calculateFamilyDay(year);
                } else {
                  date = new Date(year, holidayDef.month - 1, holidayDef.day);
                }

                // Handle Sunday observance rule
                const dayOfWeek = getDay(date);
                let observedDate = date;
                let isObserved = false;

                if (dayOfWeek === 0) { // Sunday
                  observedDate = addDays(date, 1); // Observe on Monday
                  isObserved = true;

                  // Create both the original and observed entries
                  holidays.push(this.holidayRepo.create({
                    name: holidayDef.name,
                    date: date,
                    countryCode: 'ZA',
                    isObserved: false,
                    description: holidayDef.description
                  }));

                  holidays.push(this.holidayRepo.create({
                    name: `${holidayDef.name} (Observed)`,
                    date: observedDate,
                    countryCode: 'ZA',
                    isObserved: true,
                    originalDate: date,
                    description: `Observed public holiday for ${holidayDef.name}`
                  }));
                } else {
                  holidays.push(this.holidayRepo.create({
                    name: holidayDef.name,
                    date: date,
                    countryCode: 'ZA',
                    isObserved: false,
                    description: holidayDef.description
                  }));
                }
              }

              return holidays;
            }

            async seedHolidaysForYear(year: number): Promise<void> {
              // Check if already seeded
              const existing = await this.getHolidaysForYear(year);
              if (existing.length > 0) {
                this.logger.log(`Holidays for ${year} already exist, skipping seed`);
                return;
              }

              const holidays = await this.generateHolidaysForYear(year);
              await this.holidayRepo.save(holidays);

              this.logger.log(`Seeded ${holidays.length} holidays for ${year}`);
            }

            async seedHolidaysForYearRange(startYear: number, endYear: number): Promise<void> {
              for (let year = startYear; year <= endYear; year++) {
                await this.seedHolidaysForYear(year);
              }
            }

            // Admin methods
            async createHoliday(dto: CreatePublicHolidayDto): Promise<PublicHoliday> {
              const holiday = this.holidayRepo.create(dto);
              return this.holidayRepo.save(holiday);
            }

            async updateHoliday(id: string, dto: UpdatePublicHolidayDto): Promise<PublicHoliday> {
              const holiday = await this.holidayRepo.findOne({ where: { id } });
              if (!holiday) {
                throw new NotFoundException(`Holiday not found: ${id}`);
              }

              Object.assign(holiday, dto);
              return this.holidayRepo.save(holiday);
            }

            async deleteHoliday(id: string): Promise<void> {
              const result = await this.holidayRepo.delete(id);
              if (result.affected === 0) {
                throw new NotFoundException(`Holiday not found: ${id}`);
              }
            }
          }
          ```
        </details>
      </step>

      <step order="4">
        <description>Integrate with leave calculations</description>
        <details>
          ```typescript
          // In leave-calculation.service.ts

          @Injectable()
          export class LeaveCalculationService {
            constructor(
              private readonly calendarService: CalendarService
            ) {}

            async calculateLeaveDays(
              startDate: Date,
              endDate: Date,
              excludeWeekends: boolean = true,
              excludeHolidays: boolean = true
            ): Promise<number> {
              if (excludeHolidays) {
                // Use calendar service for working days calculation
                return this.calendarService.getWorkingDaysInRange(startDate, endDate);
              }

              // Just exclude weekends
              const allDays = eachDayOfInterval({ start: startDate, end: endDate });
              return allDays.filter(day => !isWeekend(day)).length;
            }

            async getLeaveDeductionDays(
              staffId: string,
              leaveType: LeaveType,
              startDate: Date,
              endDate: Date
            ): Promise<LeaveDeduction> {
              const totalDays = differenceInDays(endDate, startDate) + 1;
              const workingDays = await this.calendarService.getWorkingDaysInRange(startDate, endDate);
              const holidays = await this.calendarService.getHolidaysInRange(startDate, endDate);

              return {
                totalCalendarDays: totalDays,
                workingDays: workingDays,
                publicHolidaysExcluded: holidays.length,
                weekendsExcluded: totalDays - workingDays - holidays.length,
                daysToDeduct: workingDays, // Only deduct working days from leave balance
                holidaysInRange: holidays.map(h => ({
                  date: h.date,
                  name: h.name
                }))
              };
            }
          }

          export interface LeaveDeduction {
            totalCalendarDays: number;
            workingDays: number;
            publicHolidaysExcluded: number;
            weekendsExcluded: number;
            daysToDeduct: number;
            holidaysInRange: { date: Date; name: string }[];
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Integrate with payroll for public holiday pay</description>
        <details>
          ```typescript
          // In payroll-calculator.service.ts

          async calculatePublicHolidayPay(
            staffId: string,
            payPeriodStart: Date,
            payPeriodEnd: Date,
            dailyRate: number,
            hoursWorked: HoursWorkedOnHoliday[]
          ): Promise<PublicHolidayPayCalculation> {
            const holidays = await this.calendarService.getHolidaysInRange(
              payPeriodStart,
              payPeriodEnd
            );

            const calculations: PublicHolidayDayCalc[] = [];

            for (const holiday of holidays) {
              const worked = hoursWorked.find(
                hw => format(hw.date, 'yyyy-MM-dd') === format(holiday.date, 'yyyy-MM-dd')
              );

              if (worked) {
                // BCEA: Double pay for work on public holiday
                const normalPay = (worked.hours / 8) * dailyRate;
                const publicHolidayPay = normalPay * 2; // Double rate

                calculations.push({
                  date: holiday.date,
                  holidayName: holiday.name,
                  hoursWorked: worked.hours,
                  normalPay,
                  publicHolidayPay,
                  totalPay: publicHolidayPay
                });
              } else {
                // Not worked - staff gets normal pay (already in salary)
                calculations.push({
                  date: holiday.date,
                  holidayName: holiday.name,
                  hoursWorked: 0,
                  normalPay: dailyRate,
                  publicHolidayPay: 0,
                  totalPay: dailyRate // Paid but not worked
                });
              }
            }

            return {
              payPeriod: { start: payPeriodStart, end: payPeriodEnd },
              publicHolidaysInPeriod: holidays.length,
              calculations,
              totalPublicHolidayPay: calculations.reduce(
                (sum, calc) => sum + calc.publicHolidayPay, 0
              )
            };
          }

          export interface HoursWorkedOnHoliday {
            date: Date;
            hours: number;
          }

          export interface PublicHolidayPayCalculation {
            payPeriod: { start: Date; end: Date };
            publicHolidaysInPeriod: number;
            calculations: PublicHolidayDayCalc[];
            totalPublicHolidayPay: number;
          }

          export interface PublicHolidayDayCalc {
            date: Date;
            holidayName: string;
            hoursWorked: number;
            normalPay: number;
            publicHolidayPay: number;
            totalPay: number;
          }
          ```
        </details>
      </step>

      <step order="6">
        <description>Create DTOs and admin controller</description>
        <details>
          ```typescript
          // public-holiday.dto.ts
          import { IsString, IsDate, IsOptional, IsBoolean, Length } from 'class-validator';
          import { Type } from 'class-transformer';

          export class CreatePublicHolidayDto {
            @IsString()
            @Length(1, 100)
            name: string;

            @IsDate()
            @Type(() => Date)
            date: Date;

            @IsString()
            @Length(2, 2)
            @IsOptional()
            countryCode?: string = 'ZA';

            @IsString()
            @IsOptional()
            description?: string;
          }

          export class UpdatePublicHolidayDto {
            @IsString()
            @Length(1, 100)
            @IsOptional()
            name?: string;

            @IsDate()
            @Type(() => Date)
            @IsOptional()
            date?: Date;

            @IsString()
            @IsOptional()
            description?: string;

            @IsBoolean()
            @IsOptional()
            isActive?: boolean;
          }

          // calendar.controller.ts
          @Controller('calendar')
          export class CalendarController {
            constructor(private readonly calendarService: CalendarService) {}

            @Get('holidays/:year')
            async getHolidaysForYear(@Param('year', ParseIntPipe) year: number) {
              return this.calendarService.getHolidaysForYear(year);
            }

            @Get('working-days')
            async getWorkingDays(
              @Query('startDate') startDate: string,
              @Query('endDate') endDate: string
            ) {
              return {
                workingDays: await this.calendarService.getWorkingDaysInRange(
                  new Date(startDate),
                  new Date(endDate)
                )
              };
            }

            @Get('is-holiday')
            async isHoliday(@Query('date') date: string) {
              const isHoliday = await this.calendarService.isPublicHoliday(new Date(date));
              return { date, isHoliday };
            }
          }

          @Controller('admin/calendar')
          @UseGuards(AdminGuard)
          export class CalendarAdminController {
            constructor(private readonly calendarService: CalendarService) {}

            @Post('holidays')
            async createHoliday(@Body() dto: CreatePublicHolidayDto) {
              return this.calendarService.createHoliday(dto);
            }

            @Put('holidays/:id')
            async updateHoliday(
              @Param('id') id: string,
              @Body() dto: UpdatePublicHolidayDto
            ) {
              return this.calendarService.updateHoliday(id, dto);
            }

            @Delete('holidays/:id')
            async deleteHoliday(@Param('id') id: string) {
              return this.calendarService.deleteHoliday(id);
            }

            @Post('seed/:year')
            async seedYear(@Param('year', ParseIntPipe) year: number) {
              await this.calendarService.seedHolidaysForYear(year);
              return { message: `Holidays seeded for ${year}` };
            }
          }
          ```
        </details>
      </step>
    </steps>

    <code_patterns>
      <pattern name="Sunday Observance Rule">
        ```typescript
        if (getDay(date) === 0) { // Sunday
          observedDate = addDays(date, 1); // Monday
          // Create both original and observed holiday entries
        }
        ```
      </pattern>

      <pattern name="Easter Calculation">
        ```typescript
        // Use Computus algorithm for Easter Sunday
        // Good Friday = Easter - 2 days
        // Family Day = Easter + 1 day
        ```
      </pattern>
    </code_patterns>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test Easter date calculation for multiple years</description>
        <file>apps/api/src/common/__tests__/calendar.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test Sunday observance rule</description>
        <file>apps/api/src/common/__tests__/calendar.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test working days calculation excluding holidays</description>
        <file>apps/api/src/common/__tests__/calendar.service.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test leave calculation with holiday exclusion</description>
        <file>apps/api/src/staff/__tests__/leave-calculation.integration.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test payroll public holiday pay calculation</description>
        <file>apps/api/src/payroll/__tests__/payroll-calculator.integration.spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>All 12 SA public holidays correctly generated for any year</criterion>
      <criterion>Easter-based holidays (Good Friday, Family Day) calculated correctly</criterion>
      <criterion>Sunday holidays observed on following Monday</criterion>
      <criterion>Leave calculations exclude public holidays from deductions</criterion>
      <criterion>Payroll calculates double pay for public holiday work</criterion>
      <criterion>Admin can add/edit/remove custom holidays</criterion>
      <criterion>Holidays pre-seeded for current and next 2 years</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>PublicHoliday entity created and migrated</item>
      <item>Calendar service fully implemented</item>
      <item>All 12 SA public holidays defined with correct dates</item>
      <item>Easter calculation algorithm verified for accuracy</item>
      <item>Sunday observance rule implemented</item>
      <item>Leave calculation integration complete</item>
      <item>Payroll public holiday pay integration complete</item>
      <item>Admin CRUD endpoints working</item>
      <item>Holidays seeded for 2024-2027</item>
      <item>Unit and integration tests passing</item>
      <item>Code reviewed and approved</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="legislation">Public Holidays Act 36 of 1994</reference>
    <reference type="legislation">Basic Conditions of Employment Act - Section 18</reference>
    <reference type="official">https://www.gov.za/about-sa/public-holidays</reference>
    <reference type="algorithm">Computus (Easter calculation algorithm)</reference>
  </references>
</task_specification>
