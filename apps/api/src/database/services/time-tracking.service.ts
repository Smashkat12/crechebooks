/**
 * Time Tracking Service
 * TASK-STAFF-005: Fix Time Tracking
 *
 * Implements comprehensive time tracking including:
 * - Clock-in/clock-out tracking
 * - Multiple shifts per day support
 * - Daily/weekly hours calculation
 * - Late arrivals and early departures tracking
 * - Timesheet report generation
 *
 * All times stored in UTC, converted to local timezone for display
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// Time tracking constants
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

export interface ITimeEntry {
  id: string;
  staffId: string;
  date: Date;
  clockIn: Date;
  clockOut: Date | null;
  breakMinutes: number;
  hoursWorked: number;
  isLateArrival: boolean;
  lateMinutes: number;
  isEarlyDeparture: boolean;
  earlyMinutes: number;
  shiftNumber: number;
  notes: string | null;
  status: TimeEntryStatus;
}

export enum TimeEntryStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ADJUSTED = 'ADJUSTED',
  VOID = 'VOID',
}

export interface IWorkSchedule {
  staffId: string;
  dayOfWeek: number; // 0-6, Sunday-Saturday
  startTime: string; // HH:mm format
  endTime: string;
  isWorkDay: boolean;
  breakMinutes: number;
}

export interface IClockInRequest {
  staffId: string;
  timestamp?: Date;
  notes?: string;
  location?: { latitude: number; longitude: number };
}

export interface IClockOutRequest {
  entryId: string;
  timestamp?: Date;
  breakMinutes?: number;
  notes?: string;
}

export interface IDailyTimesheet {
  date: Date;
  staffId: string;
  staffName: string;
  entries: ITimeEntry[];
  totalHoursWorked: number;
  totalBreakMinutes: number;
  scheduledHours: number;
  variance: number; // Positive = overtime, negative = undertime
  lateArrivals: number;
  earlyDepartures: number;
}

export interface IWeeklyTimesheet {
  weekStart: Date;
  weekEnd: Date;
  staffId: string;
  staffName: string;
  dailyTimesheets: IDailyTimesheet[];
  totalHoursWorked: number;
  totalBreakMinutes: number;
  scheduledHours: number;
  variance: number;
  totalLateArrivals: number;
  totalEarlyDepartures: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
}

export interface ITimesheetFilter {
  staffId?: string;
  fromDate: Date;
  toDate: Date;
  status?: TimeEntryStatus;
}

// In-memory storage for time entries (would be database in production)
const timeEntries: Map<string, ITimeEntry> = new Map();
const workSchedules: Map<string, IWorkSchedule[]> = new Map();

@Injectable()
export class TimeTrackingService {
  private readonly logger = new Logger(TimeTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Clock in a staff member
   * Creates a new time entry for the current shift
   */
  async clockIn(
    tenantId: string,
    request: IClockInRequest,
    userId: string,
  ): Promise<ITimeEntry> {
    this.logger.log(`Clock in for staff ${request.staffId}`);

    // Validate staff exists
    const staff = await this.prisma.staff.findFirst({
      where: { id: request.staffId, tenantId, isActive: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff', request.staffId);
    }

    // Check for existing active entry (not clocked out)
    const activeEntry = this.getActiveEntry(request.staffId);
    if (activeEntry) {
      throw new ConflictException('Staff member is already clocked in', {
        staffId: request.staffId,
        activeEntryId: activeEntry.id,
      });
    }

    const clockInTime = request.timestamp || new Date();
    const today = new Date(clockInTime);
    today.setHours(0, 0, 0, 0);

    // Get shift number for today
    const todayEntries = this.getEntriesForDate(request.staffId, today);
    const shiftNumber = todayEntries.length + 1;

    // Check for late arrival
    const schedule = this.getScheduleForDay(
      request.staffId,
      clockInTime.getDay(),
    );
    const { isLate, lateMinutes } = this.checkLateArrival(
      clockInTime,
      schedule,
    );

    const entry: ITimeEntry = {
      id: this.generateId(),
      staffId: request.staffId,
      date: today,
      clockIn: clockInTime,
      clockOut: null,
      breakMinutes: 0,
      hoursWorked: 0,
      isLateArrival: isLate,
      lateMinutes,
      isEarlyDeparture: false,
      earlyMinutes: 0,
      shiftNumber,
      notes: request.notes || null,
      status: TimeEntryStatus.ACTIVE,
    };

    timeEntries.set(entry.id, entry);

    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'TimeEntry',
      entityId: entry.id,
      afterValue: {
        staffId: request.staffId,
        clockIn: clockInTime,
        shiftNumber,
        isLateArrival: isLate,
        lateMinutes,
      },
    });

    return entry;
  }

  /**
   * Clock out a staff member
   * Completes the current time entry
   */
  async clockOut(
    tenantId: string,
    request: IClockOutRequest,
    userId: string,
  ): Promise<ITimeEntry> {
    this.logger.log(`Clock out for entry ${request.entryId}`);

    const entry = timeEntries.get(request.entryId);
    if (!entry) {
      throw new NotFoundException('TimeEntry', request.entryId);
    }

    if (entry.status !== TimeEntryStatus.ACTIVE) {
      throw new BusinessException(
        'Time entry is not active',
        'ENTRY_NOT_ACTIVE',
        { entryId: request.entryId, status: entry.status },
      );
    }

    const clockOutTime = request.timestamp || new Date();

    // Validate clock out is after clock in
    if (clockOutTime <= entry.clockIn) {
      throw new ValidationException(
        'Clock out time must be after clock in time',
        [
          {
            field: 'timestamp',
            message: 'Clock out time must be after clock in time',
          },
        ],
      );
    }

    // Calculate hours worked
    const breakMinutes = request.breakMinutes || entry.breakMinutes;
    const hoursWorked = this.calculateHoursWorked(
      entry.clockIn,
      clockOutTime,
      breakMinutes,
    );

    // Check for early departure
    const schedule = this.getScheduleForDay(
      entry.staffId,
      entry.clockIn.getDay(),
    );
    const { isEarly, earlyMinutes } = this.checkEarlyDeparture(
      clockOutTime,
      schedule,
    );

    const beforeValue = { ...entry };

    entry.clockOut = clockOutTime;
    entry.breakMinutes = breakMinutes;
    entry.hoursWorked = hoursWorked;
    entry.isEarlyDeparture = isEarly;
    entry.earlyMinutes = earlyMinutes;
    entry.status = TimeEntryStatus.COMPLETED;
    if (request.notes) {
      entry.notes = request.notes;
    }

    timeEntries.set(entry.id, entry);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'TimeEntry',
      entityId: entry.id,
      beforeValue,
      afterValue: {
        clockOut: clockOutTime,
        hoursWorked,
        breakMinutes,
        isEarlyDeparture: isEarly,
        earlyMinutes,
      },
    });

    return entry;
  }

  /**
   * Calculate hours worked between clock in and clock out
   */
  calculateHoursWorked(
    clockIn: Date,
    clockOut: Date,
    breakMinutes: number,
  ): number {
    const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60);
    const workedMinutes = totalMinutes - breakMinutes;
    return new Decimal(workedMinutes)
      .div(MINUTES_PER_HOUR)
      .toDecimalPlaces(2)
      .toNumber();
  }

  /**
   * Check if clock in time is late based on schedule
   */
  checkLateArrival(
    clockIn: Date,
    schedule: IWorkSchedule | null,
  ): { isLate: boolean; lateMinutes: number } {
    if (!schedule || !schedule.isWorkDay) {
      return { isLate: false, lateMinutes: 0 };
    }

    const scheduledStart = this.parseTimeToDate(schedule.startTime, clockIn);
    if (clockIn > scheduledStart) {
      const lateMinutes = Math.ceil(
        (clockIn.getTime() - scheduledStart.getTime()) / (1000 * 60),
      );
      return { isLate: true, lateMinutes };
    }

    return { isLate: false, lateMinutes: 0 };
  }

  /**
   * Check if clock out time is early based on schedule
   */
  checkEarlyDeparture(
    clockOut: Date,
    schedule: IWorkSchedule | null,
  ): { isEarly: boolean; earlyMinutes: number } {
    if (!schedule || !schedule.isWorkDay) {
      return { isEarly: false, earlyMinutes: 0 };
    }

    const scheduledEnd = this.parseTimeToDate(schedule.endTime, clockOut);
    if (clockOut < scheduledEnd) {
      const earlyMinutes = Math.ceil(
        (scheduledEnd.getTime() - clockOut.getTime()) / (1000 * 60),
      );
      return { isEarly: true, earlyMinutes };
    }

    return { isEarly: false, earlyMinutes: 0 };
  }

  /**
   * Get daily timesheet for a staff member
   */
  async getDailyTimesheet(
    tenantId: string,
    staffId: string,
    date: Date,
  ): Promise<IDailyTimesheet> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const entries = this.getEntriesForDate(staffId, targetDate);
    const schedule = this.getScheduleForDay(staffId, targetDate.getDay());

    const totalHoursWorked = entries.reduce((sum, e) => sum + e.hoursWorked, 0);
    const totalBreakMinutes = entries.reduce(
      (sum, e) => sum + e.breakMinutes,
      0,
    );
    const scheduledHours = schedule?.isWorkDay
      ? this.calculateScheduledHours(schedule)
      : 0;

    return {
      date: targetDate,
      staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      entries,
      totalHoursWorked: new Decimal(totalHoursWorked)
        .toDecimalPlaces(2)
        .toNumber(),
      totalBreakMinutes,
      scheduledHours,
      variance: new Decimal(totalHoursWorked)
        .minus(scheduledHours)
        .toDecimalPlaces(2)
        .toNumber(),
      lateArrivals: entries.filter((e) => e.isLateArrival).length,
      earlyDepartures: entries.filter((e) => e.isEarlyDeparture).length,
    };
  }

  /**
   * Get weekly timesheet for a staff member
   */
  async getWeeklyTimesheet(
    tenantId: string,
    staffId: string,
    weekStart: Date,
  ): Promise<IWeeklyTimesheet> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    // Normalize to start of week (Sunday)
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const dailyTimesheets: IDailyTimesheet[] = [];
    let totalHoursWorked = 0;
    let totalBreakMinutes = 0;
    let scheduledHours = 0;
    let totalLateArrivals = 0;
    let totalEarlyDepartures = 0;
    let totalLateMinutes = 0;
    let totalEarlyMinutes = 0;

    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(currentDate.getDate() + i);

      const daily = await this.getDailyTimesheet(
        tenantId,
        staffId,
        currentDate,
      );
      dailyTimesheets.push(daily);

      totalHoursWorked += daily.totalHoursWorked;
      totalBreakMinutes += daily.totalBreakMinutes;
      scheduledHours += daily.scheduledHours;
      totalLateArrivals += daily.lateArrivals;
      totalEarlyDepartures += daily.earlyDepartures;
      totalLateMinutes += daily.entries.reduce(
        (sum, e) => sum + e.lateMinutes,
        0,
      );
      totalEarlyMinutes += daily.entries.reduce(
        (sum, e) => sum + e.earlyMinutes,
        0,
      );
    }

    return {
      weekStart: start,
      weekEnd: end,
      staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      dailyTimesheets,
      totalHoursWorked: new Decimal(totalHoursWorked)
        .toDecimalPlaces(2)
        .toNumber(),
      totalBreakMinutes,
      scheduledHours,
      variance: new Decimal(totalHoursWorked)
        .minus(scheduledHours)
        .toDecimalPlaces(2)
        .toNumber(),
      totalLateArrivals,
      totalEarlyDepartures,
      totalLateMinutes,
      totalEarlyMinutes,
    };
  }

  /**
   * Generate timesheet report for multiple staff
   */
  async generateTimesheetReport(
    tenantId: string,
    filter: ITimesheetFilter,
  ): Promise<IWeeklyTimesheet[]> {
    const staffList = filter.staffId
      ? [
          await this.prisma.staff.findFirst({
            where: { id: filter.staffId, tenantId },
          }),
        ]
      : await this.prisma.staff.findMany({
          where: { tenantId, isActive: true },
        });

    const reports: IWeeklyTimesheet[] = [];

    for (const staff of staffList) {
      if (!staff) continue;

      const weekStart = new Date(filter.fromDate);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const report = await this.getWeeklyTimesheet(
        tenantId,
        staff.id,
        weekStart,
      );
      reports.push(report);
    }

    return reports;
  }

  /**
   * Adjust a time entry (for corrections)
   */
  async adjustTimeEntry(
    tenantId: string,
    entryId: string,
    adjustments: {
      clockIn?: Date;
      clockOut?: Date;
      breakMinutes?: number;
      notes?: string;
    },
    userId: string,
  ): Promise<ITimeEntry> {
    const entry = timeEntries.get(entryId);
    if (!entry) {
      throw new NotFoundException('TimeEntry', entryId);
    }

    const beforeValue = { ...entry };

    if (adjustments.clockIn) {
      entry.clockIn = adjustments.clockIn;
    }
    if (adjustments.clockOut) {
      entry.clockOut = adjustments.clockOut;
    }
    if (adjustments.breakMinutes !== undefined) {
      entry.breakMinutes = adjustments.breakMinutes;
    }
    if (adjustments.notes) {
      entry.notes = adjustments.notes;
    }

    // Recalculate hours if both times are set
    if (entry.clockIn && entry.clockOut) {
      entry.hoursWorked = this.calculateHoursWorked(
        entry.clockIn,
        entry.clockOut,
        entry.breakMinutes,
      );
    }

    entry.status = TimeEntryStatus.ADJUSTED;
    timeEntries.set(entry.id, entry);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'TimeEntry',
      entityId: entry.id,
      beforeValue: beforeValue as unknown as Prisma.InputJsonValue,
      afterValue: entry as unknown as Prisma.InputJsonValue,
      changeSummary: 'Time entry adjusted',
    });

    return entry;
  }

  /**
   * Set work schedule for a staff member
   */
  setWorkSchedule(staffId: string, schedules: IWorkSchedule[]): void {
    workSchedules.set(staffId, schedules);
  }

  /**
   * Get work schedule for a specific day
   */
  getScheduleForDay(staffId: string, dayOfWeek: number): IWorkSchedule | null {
    const schedules = workSchedules.get(staffId);
    if (!schedules) {
      // Default schedule: Monday-Friday, 8am-5pm
      return {
        staffId,
        dayOfWeek,
        startTime: '08:00',
        endTime: '17:00',
        isWorkDay: dayOfWeek >= 1 && dayOfWeek <= 5,
        breakMinutes: 60,
      };
    }
    return schedules.find((s) => s.dayOfWeek === dayOfWeek) || null;
  }

  /**
   * Get active (not clocked out) entry for staff
   */
  private getActiveEntry(staffId: string): ITimeEntry | null {
    for (const entry of timeEntries.values()) {
      if (
        entry.staffId === staffId &&
        entry.status === TimeEntryStatus.ACTIVE
      ) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Get entries for a specific date
   */
  private getEntriesForDate(staffId: string, date: Date): ITimeEntry[] {
    const entries: ITimeEntry[] = [];
    const targetDate = date.toDateString();

    for (const entry of timeEntries.values()) {
      if (
        entry.staffId === staffId &&
        entry.date.toDateString() === targetDate &&
        entry.status !== TimeEntryStatus.VOID
      ) {
        entries.push(entry);
      }
    }

    return entries.sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());
  }

  /**
   * Parse time string (HH:mm) to Date
   */
  private parseTimeToDate(timeStr: string, referenceDate: Date): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(referenceDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  /**
   * Calculate scheduled hours from schedule
   */
  private calculateScheduledHours(schedule: IWorkSchedule): number {
    const start = this.parseTimeToDate(schedule.startTime, new Date());
    const end = this.parseTimeToDate(schedule.endTime, new Date());
    const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    const workedMinutes = totalMinutes - schedule.breakMinutes;
    return new Decimal(workedMinutes)
      .div(MINUTES_PER_HOUR)
      .toDecimalPlaces(2)
      .toNumber();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `te_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Clear all entries (for testing)
   */
  clearAllEntries(): void {
    timeEntries.clear();
    workSchedules.clear();
  }
}
