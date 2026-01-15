/**
 * Time Tracking Service Tests
 * TASK-STAFF-005: Fix Time Tracking
 *
 * Tests for:
 * - Clock in/out functionality
 * - Multiple shifts per day
 * - Hours calculation
 * - Late arrivals and early departures
 * - Timesheet generation
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  TimeTrackingService,
  TimeEntryStatus,
  IWorkSchedule,
} from '../../../src/database/services/time-tracking.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';

describe('TimeTrackingService', () => {
  let service: TimeTrackingService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockStaff = {
    id: 'staff-001',
    tenantId: 'tenant-001',
    firstName: 'John',
    lastName: 'Doe',
    isActive: true,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      staff: {
        findFirst: jest.fn().mockResolvedValue(mockStaff),
        findMany: jest.fn().mockResolvedValue([mockStaff]),
      },
    };

    const mockAuditLogService = {
      logCreate: jest.fn(),
      logUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeTrackingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<TimeTrackingService>(TimeTrackingService);
    prisma = module.get(PrismaService);
    auditLogService = module.get(AuditLogService);

    // Clear entries before each test
    service.clearAllEntries();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('clockIn', () => {
    it('should create a new time entry on clock in', async () => {
      const clockInTime = new Date('2024-06-15T08:00:00');

      const result = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: clockInTime },
        'admin-001',
      );

      expect(result.id).toBeDefined();
      expect(result.staffId).toBe(mockStaff.id);
      expect(result.clockIn).toEqual(clockInTime);
      expect(result.clockOut).toBeNull();
      expect(result.status).toBe(TimeEntryStatus.ACTIVE);
      expect(result.shiftNumber).toBe(1);
    });

    it('should track late arrival', async () => {
      // Set work schedule starting at 8:00
      service.setWorkSchedule(mockStaff.id, [
        {
          staffId: mockStaff.id,
          dayOfWeek: 6, // Saturday
          startTime: '08:00',
          endTime: '17:00',
          isWorkDay: true,
          breakMinutes: 60,
        },
      ]);

      const lateClockIn = new Date('2024-06-15T08:30:00'); // 30 minutes late
      // Note: June 15, 2024 is a Saturday (day 6)

      const result = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: lateClockIn },
        'admin-001',
      );

      expect(result.isLateArrival).toBe(true);
      expect(result.lateMinutes).toBe(30);
    });

    it('should prevent duplicate clock in', async () => {
      await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id },
        'admin-001',
      );

      await expect(
        service.clockIn('tenant-001', { staffId: mockStaff.id }, 'admin-001'),
      ).rejects.toThrow('already clocked in');
    });

    it('should support multiple shifts per day', async () => {
      // First shift
      const entry1 = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T06:00:00') },
        'admin-001',
      );
      await service.clockOut(
        'tenant-001',
        { entryId: entry1.id, timestamp: new Date('2024-06-15T10:00:00') },
        'admin-001',
      );

      // Second shift
      const entry2 = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T14:00:00') },
        'admin-001',
      );

      expect(entry1.shiftNumber).toBe(1);
      expect(entry2.shiftNumber).toBe(2);
    });

    it('should throw error for non-existent staff', async () => {
      (prisma.staff.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.clockIn('tenant-001', { staffId: 'non-existent' }, 'admin-001'),
      ).rejects.toThrow('Staff');
    });
  });

  describe('clockOut', () => {
    it('should complete time entry on clock out', async () => {
      const clockInTime = new Date('2024-06-15T08:00:00');
      const clockOutTime = new Date('2024-06-15T17:00:00');

      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: clockInTime },
        'admin-001',
      );

      const result = await service.clockOut(
        'tenant-001',
        { entryId: entry.id, timestamp: clockOutTime },
        'admin-001',
      );

      expect(result.clockOut).toEqual(clockOutTime);
      expect(result.status).toBe(TimeEntryStatus.COMPLETED);
      expect(result.hoursWorked).toBe(9); // 9 hours
    });

    it('should calculate hours with break deduction', async () => {
      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T08:00:00') },
        'admin-001',
      );

      const result = await service.clockOut(
        'tenant-001',
        {
          entryId: entry.id,
          timestamp: new Date('2024-06-15T17:00:00'),
          breakMinutes: 60,
        },
        'admin-001',
      );

      expect(result.hoursWorked).toBe(8); // 9 hours - 1 hour break
      expect(result.breakMinutes).toBe(60);
    });

    it('should track early departure', async () => {
      service.setWorkSchedule(mockStaff.id, [
        {
          staffId: mockStaff.id,
          dayOfWeek: 6,
          startTime: '08:00',
          endTime: '17:00',
          isWorkDay: true,
          breakMinutes: 60,
        },
      ]);

      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T08:00:00') },
        'admin-001',
      );

      const result = await service.clockOut(
        'tenant-001',
        { entryId: entry.id, timestamp: new Date('2024-06-15T16:00:00') },
        'admin-001',
      );

      expect(result.isEarlyDeparture).toBe(true);
      expect(result.earlyMinutes).toBe(60);
    });

    it('should throw error for non-existent entry', async () => {
      await expect(
        service.clockOut(
          'tenant-001',
          { entryId: 'non-existent' },
          'admin-001',
        ),
      ).rejects.toThrow('TimeEntry');
    });

    it('should throw error if clock out before clock in', async () => {
      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T17:00:00') },
        'admin-001',
      );

      await expect(
        service.clockOut(
          'tenant-001',
          { entryId: entry.id, timestamp: new Date('2024-06-15T08:00:00') },
          'admin-001',
        ),
      ).rejects.toThrow('Clock out time must be after clock in');
    });
  });

  describe('calculateHoursWorked', () => {
    it('should calculate hours correctly', () => {
      const clockIn = new Date('2024-06-15T08:00:00');
      const clockOut = new Date('2024-06-15T17:00:00');

      const result = service.calculateHoursWorked(clockIn, clockOut, 0);

      expect(result).toBe(9);
    });

    it('should subtract break time', () => {
      const clockIn = new Date('2024-06-15T08:00:00');
      const clockOut = new Date('2024-06-15T17:00:00');

      const result = service.calculateHoursWorked(clockIn, clockOut, 60);

      expect(result).toBe(8);
    });

    it('should handle partial hours', () => {
      const clockIn = new Date('2024-06-15T08:00:00');
      const clockOut = new Date('2024-06-15T12:30:00');

      const result = service.calculateHoursWorked(clockIn, clockOut, 30);

      expect(result).toBe(4); // 4.5 hours - 0.5 hour break
    });
  });

  describe('checkLateArrival', () => {
    it('should detect late arrival', () => {
      const schedule: IWorkSchedule = {
        staffId: mockStaff.id,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '17:00',
        isWorkDay: true,
        breakMinutes: 60,
      };

      const result = service.checkLateArrival(
        new Date('2024-06-15T08:15:00'),
        schedule,
      );

      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(15);
    });

    it('should not flag early arrival as late', () => {
      const schedule: IWorkSchedule = {
        staffId: mockStaff.id,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '17:00',
        isWorkDay: true,
        breakMinutes: 60,
      };

      const result = service.checkLateArrival(
        new Date('2024-06-15T07:45:00'),
        schedule,
      );

      expect(result.isLate).toBe(false);
      expect(result.lateMinutes).toBe(0);
    });

    it('should handle non-work days', () => {
      const schedule: IWorkSchedule = {
        staffId: mockStaff.id,
        dayOfWeek: 0, // Sunday
        startTime: '08:00',
        endTime: '17:00',
        isWorkDay: false,
        breakMinutes: 0,
      };

      const result = service.checkLateArrival(
        new Date('2024-06-15T10:00:00'),
        schedule,
      );

      expect(result.isLate).toBe(false);
    });
  });

  describe('checkEarlyDeparture', () => {
    it('should detect early departure', () => {
      const schedule: IWorkSchedule = {
        staffId: mockStaff.id,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '17:00',
        isWorkDay: true,
        breakMinutes: 60,
      };

      const result = service.checkEarlyDeparture(
        new Date('2024-06-15T16:30:00'),
        schedule,
      );

      expect(result.isEarly).toBe(true);
      expect(result.earlyMinutes).toBe(30);
    });

    it('should not flag late departure as early', () => {
      const schedule: IWorkSchedule = {
        staffId: mockStaff.id,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '17:00',
        isWorkDay: true,
        breakMinutes: 60,
      };

      const result = service.checkEarlyDeparture(
        new Date('2024-06-15T17:30:00'),
        schedule,
      );

      expect(result.isEarly).toBe(false);
      expect(result.earlyMinutes).toBe(0);
    });
  });

  describe('getDailyTimesheet', () => {
    it('should return daily timesheet with all entries', async () => {
      // Clock in and out
      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T08:00:00') },
        'admin-001',
      );
      await service.clockOut(
        'tenant-001',
        {
          entryId: entry.id,
          timestamp: new Date('2024-06-15T17:00:00'),
          breakMinutes: 60,
        },
        'admin-001',
      );

      const result = await service.getDailyTimesheet(
        'tenant-001',
        mockStaff.id,
        new Date('2024-06-15'),
      );

      expect(result.staffId).toBe(mockStaff.id);
      expect(result.entries.length).toBe(1);
      expect(result.totalHoursWorked).toBe(8);
      expect(result.totalBreakMinutes).toBe(60);
    });

    it('should calculate variance from scheduled hours', async () => {
      service.setWorkSchedule(mockStaff.id, [
        {
          staffId: mockStaff.id,
          dayOfWeek: 6, // Saturday
          startTime: '08:00',
          endTime: '17:00',
          isWorkDay: true,
          breakMinutes: 60,
        },
      ]);

      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T08:00:00') },
        'admin-001',
      );
      await service.clockOut(
        'tenant-001',
        {
          entryId: entry.id,
          timestamp: new Date('2024-06-15T19:00:00'), // 2 hours overtime
          breakMinutes: 60,
        },
        'admin-001',
      );

      const result = await service.getDailyTimesheet(
        'tenant-001',
        mockStaff.id,
        new Date('2024-06-15'),
      );

      expect(result.variance).toBe(2); // 2 hours overtime
    });
  });

  describe('getWeeklyTimesheet', () => {
    it('should aggregate daily timesheets for the week', async () => {
      // Create entries for multiple days within the same week
      // June 9, 2024 is Sunday (start of week), June 15 is Saturday (end of week)
      const days = [10, 11, 12]; // Mon, Tue, Wed - all within week of June 9-15

      for (const day of days) {
        const entry = await service.clockIn(
          'tenant-001',
          {
            staffId: mockStaff.id,
            timestamp: new Date(`2024-06-${day}T08:00:00`),
          },
          'admin-001',
        );
        await service.clockOut(
          'tenant-001',
          {
            entryId: entry.id,
            timestamp: new Date(`2024-06-${day}T17:00:00`),
            breakMinutes: 60,
          },
          'admin-001',
        );
      }

      const result = await service.getWeeklyTimesheet(
        'tenant-001',
        mockStaff.id,
        new Date('2024-06-10'), // Any date within the week
      );

      expect(result.dailyTimesheets.length).toBe(7);
      expect(result.totalHoursWorked).toBe(24); // 3 days * 8 hours
    });
  });

  describe('adjustTimeEntry', () => {
    it('should allow adjustment of time entry', async () => {
      const entry = await service.clockIn(
        'tenant-001',
        { staffId: mockStaff.id, timestamp: new Date('2024-06-15T08:30:00') },
        'admin-001',
      );
      await service.clockOut(
        'tenant-001',
        { entryId: entry.id, timestamp: new Date('2024-06-15T17:00:00') },
        'admin-001',
      );

      const result = await service.adjustTimeEntry(
        'tenant-001',
        entry.id,
        {
          clockIn: new Date('2024-06-15T08:00:00'), // Correct clock in
          notes: 'Adjusted due to system error',
        },
        'admin-001',
      );

      expect(result.clockIn).toEqual(new Date('2024-06-15T08:00:00'));
      expect(result.status).toBe(TimeEntryStatus.ADJUSTED);
      expect(result.hoursWorked).toBe(9);
    });
  });
});
