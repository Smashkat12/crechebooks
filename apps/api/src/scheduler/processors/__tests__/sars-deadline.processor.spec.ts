/**
 * SARS Deadline Processor Tests
 * TASK-SARS-017: SARS Deadline Reminder System
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SarsDeadlineProcessor } from '../sars-deadline.processor';
import { SarsDeadlineService } from '../../../sars/sars-deadline.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  DEFAULT_REMINDER_DAYS,
  SARS_DEADLINE_CALENDAR,
  getVat201Frequency,
} from '../../../sars/types/deadline.types';

describe('SarsDeadlineProcessor', () => {
  let processor: SarsDeadlineProcessor;
  let mockDeadlineService: any;
  let mockAuditLogService: any;
  let mockPrisma: any;

  const tenantId = 'tenant-123';

  beforeEach(async () => {
    mockDeadlineService = {
      getUpcomingDeadlines: jest.fn(),
      shouldSendReminder: jest.fn(),
      getReminderPreferences: jest.fn(),
      recordReminderSent: jest.fn(),
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    mockPrisma = {
      tenant: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SarsDeadlineProcessor,
        { provide: SarsDeadlineService, useValue: mockDeadlineService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<SarsDeadlineProcessor>(SarsDeadlineProcessor);
  });

  describe('processJob', () => {
    const mockJob = {
      id: 'job-123',
      data: {
        tenantId,
        triggeredBy: 'cron' as const,
        scheduledAt: new Date(),
      },
      progress: jest.fn(),
    };

    it('should process upcoming deadlines', async () => {
      const deadline = {
        type: 'VAT201' as const,
        deadline: new Date(),
        daysRemaining: 7,
        period: '2024-01',
        isSubmitted: false,
      };

      mockDeadlineService.getUpcomingDeadlines.mockResolvedValue([deadline]);
      mockDeadlineService.shouldSendReminder.mockResolvedValue(true);
      mockDeadlineService.getReminderPreferences.mockResolvedValue({
        reminderDays: [...DEFAULT_REMINDER_DAYS],
        channels: ['email'],
        recipientEmails: ['test@example.com'],
        enabled: true,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'test@example.com',
      });

      await processor.processJob(mockJob as any);

      expect(mockDeadlineService.getUpcomingDeadlines).toHaveBeenCalledWith(
        tenantId,
        30,
      );
      expect(mockDeadlineService.shouldSendReminder).toHaveBeenCalled();
    });

    it('should skip deadlines that have been submitted', async () => {
      const deadline = {
        type: 'VAT201' as const,
        deadline: new Date(),
        daysRemaining: 7,
        period: '2024-01',
        isSubmitted: true,
        submittedAt: new Date(),
      };

      mockDeadlineService.getUpcomingDeadlines.mockResolvedValue([deadline]);
      mockDeadlineService.shouldSendReminder.mockResolvedValue(false);

      await processor.processJob(mockJob as any);

      expect(mockDeadlineService.recordReminderSent).not.toHaveBeenCalled();
    });

    it('should handle no upcoming deadlines', async () => {
      mockDeadlineService.getUpcomingDeadlines.mockResolvedValue([]);

      await processor.processJob(mockJob as any);

      expect(mockDeadlineService.shouldSendReminder).not.toHaveBeenCalled();
    });

    it('should send reminders for multiple deadline types', async () => {
      const deadlines = [
        {
          type: 'VAT201' as const,
          deadline: new Date(),
          daysRemaining: 7,
          period: '2024-01',
          isSubmitted: false,
        },
        {
          type: 'EMP201' as const,
          deadline: new Date(),
          daysRemaining: 3,
          period: '2024-01',
          isSubmitted: false,
        },
      ];

      mockDeadlineService.getUpcomingDeadlines.mockResolvedValue(deadlines);
      mockDeadlineService.shouldSendReminder.mockResolvedValue(true);
      mockDeadlineService.getReminderPreferences.mockResolvedValue({
        reminderDays: [...DEFAULT_REMINDER_DAYS],
        channels: ['email'],
        recipientEmails: ['test@example.com'],
        enabled: true,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'test@example.com',
      });

      await processor.processJob(mockJob as any);

      expect(mockDeadlineService.shouldSendReminder).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SarsDeadlineService', () => {
  // Import separately to avoid circular dependency in tests

  /* eslint-disable @typescript-eslint/no-require-imports */
  const {
    SarsDeadlineService,
  } = require('../../../sars/sars-deadline.service');

  const {
    SARS_DEADLINE_CALENDAR,
    DEFAULT_REMINDER_DAYS,
  } = require('../../../sars/types/deadline.types');
  /* eslint-enable @typescript-eslint/no-require-imports */

  describe('getNextDeadline', () => {
    it('should calculate VAT201 deadline correctly', () => {
      const service = new SarsDeadlineService({} as any);

      // Reference: January 15, 2024
      const ref = new Date(2024, 0, 15);
      const deadline = service.getNextDeadline('VAT201', ref);

      // VAT201 is due 25th of following month
      // For January, deadline is January 25 (not passed yet)
      expect(deadline.getDate()).toBe(25);
    });

    it('should calculate EMP201 deadline correctly', () => {
      const service = new SarsDeadlineService({} as any);

      // Reference: January 15, 2024
      const ref = new Date(2024, 0, 15);
      const deadline = service.getNextDeadline('EMP201', ref);

      // EMP201 is due 7th of following month
      // For January 15, next deadline is Feb 7 (already passed Jan 7)
      expect(deadline.getDate()).toBe(7);
    });

    it('should calculate EMP501 deadline correctly (EMP501 §2 — annual reconciliation May 31)', () => {
      const service = new SarsDeadlineService({} as any);

      // Reference: January 15, 2024
      const ref = new Date(2024, 0, 15);
      const deadline = service.getNextDeadline('EMP501', ref);

      // EMP501 annual reconciliation is due end of May
      expect(deadline.getMonth()).toBe(4); // May
      expect(deadline.getDate()).toBe(31);
    });

    it('should roll over EMP501 to next year if past May 31 deadline', () => {
      const service = new SarsDeadlineService({} as any);

      // Reference: June 15, 2024 (after May 31 interim deadline)
      const ref = new Date(2024, 5, 15);
      const deadline = service.getNextDeadline('EMP501', ref);

      // Should be May 31, 2025
      expect(deadline.getFullYear()).toBe(2025);
      expect(deadline.getMonth()).toBe(4);
      expect(deadline.getDate()).toBe(31);
    });
  });

  describe('DEFAULT_REMINDER_DAYS', () => {
    it('should have correct reminder intervals', () => {
      expect(DEFAULT_REMINDER_DAYS).toContain(30);
      expect(DEFAULT_REMINDER_DAYS).toContain(14);
      expect(DEFAULT_REMINDER_DAYS).toContain(7);
      expect(DEFAULT_REMINDER_DAYS).toContain(3);
      expect(DEFAULT_REMINDER_DAYS).toContain(1);
      expect(DEFAULT_REMINDER_DAYS.length).toBe(5);
    });
  });

  describe('SARS_DEADLINE_CALENDAR', () => {
    it('should have VAT201 due on 25th with BIMONTHLY default frequency (Cat A/B)', () => {
      expect(SARS_DEADLINE_CALENDAR.VAT201.dayOfMonth).toBe(25);
      // Frequency reflects Cat A/B (most common). Per-tenant resolution: use getVat201Frequency().
      expect(SARS_DEADLINE_CALENDAR.VAT201.frequency).toBe('BIMONTHLY');
    });

    it('should have EMP201 due on 7th', () => {
      expect(SARS_DEADLINE_CALENDAR.EMP201.dayOfMonth).toBe(7);
      expect(SARS_DEADLINE_CALENDAR.EMP201.frequency).toBe('MONTHLY');
    });

    it('should have EMP501 due on May 31 (annual reconciliation — EMP501 §2)', () => {
      expect(SARS_DEADLINE_CALENDAR.EMP501.dayOfMonth).toBe(31);
      expect(SARS_DEADLINE_CALENDAR.EMP501.monthOfYear).toBe(4); // May
      expect(SARS_DEADLINE_CALENDAR.EMP501.frequency).toBe('ANNUAL');
    });
  });

  describe('getVat201Frequency (VAT Act 89/1991 §27–28)', () => {
    it('returns BIMONTHLY for Cat A', () => {
      expect(getVat201Frequency('A')).toBe('BIMONTHLY');
    });

    it('returns BIMONTHLY for Cat B', () => {
      expect(getVat201Frequency('B')).toBe('BIMONTHLY');
    });

    it('returns MONTHLY for Cat C', () => {
      expect(getVat201Frequency('C')).toBe('MONTHLY');
    });

    it('returns BIANNUAL for Cat D', () => {
      expect(getVat201Frequency('D')).toBe('BIANNUAL');
    });

    it('returns ANNUAL for Cat E', () => {
      expect(getVat201Frequency('E')).toBe('ANNUAL');
    });

    it('returns QUADMONTHLY for Cat F', () => {
      expect(getVat201Frequency('F')).toBe('QUADMONTHLY');
    });

    it('returns null for null/undefined (not registered)', () => {
      expect(getVat201Frequency(null)).toBeNull();
      expect(getVat201Frequency(undefined)).toBeNull();
    });
  });
});
