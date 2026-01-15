/**
 * UI19DeadlineService Unit Tests
 * TASK-STAFF-006: Enforce UI-19 14-Day Deadline
 *
 * Tests UI-19 deadline tracking including:
 * - 14-day deadline calculation
 * - Overdue detection
 * - Warning period detection (7 days)
 * - Enforcement modes (warn, block, log)
 * - Alert generation with severity levels
 * - Late submission handling
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UI19DeadlineService } from '../../../src/database/services/ui19-deadline.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  UI19Type,
  UI19Status,
  UI19_DEFAULTS,
  UI19_CONFIG_KEYS,
} from '../../../src/database/constants/ui19.constants';

describe('UI19DeadlineService', () => {
  let service: UI19DeadlineService;
  let prisma: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;

  // Mock data
  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockStaff = {
    id: 'staff-789',
    tenantId: mockTenantId,
    firstName: 'John',
    lastName: 'Doe',
    startDate: new Date('2026-01-01'),
    endDate: null,
  };

  const createMockSubmission = (overrides: Partial<any> = {}) => ({
    id: 'submission-123',
    staffId: mockStaff.id,
    tenantId: mockTenantId,
    type: UI19Type.COMMENCEMENT,
    eventDate: new Date('2026-01-01'),
    dueDate: new Date('2026-01-15'),
    status: UI19Status.PENDING,
    submittedAt: null,
    submittedBy: null,
    referenceNumber: null,
    lateReason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    staff: mockStaff,
    ...overrides,
  });

  beforeAll(async () => {
    const mockPrisma = {
      ui19Submission: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.DEADLINE_DAYS:
            return UI19_DEFAULTS.deadlineDays;
          case UI19_CONFIG_KEYS.WARNING_DAYS:
            return UI19_DEFAULTS.warningDays;
          case UI19_CONFIG_KEYS.ENFORCEMENT_MODE:
            return UI19_DEFAULTS.enforcementMode;
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UI19DeadlineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<UI19DeadlineService>(UI19DeadlineService);
    prisma = module.get(PrismaService);
    configService = module.get(ConfigService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = service.getConfig();

      expect(config.deadlineDays).toBe(14);
      expect(config.warningDays).toBe(7);
      expect(config.enforcementMode).toBe('warn');
    });

    it('should use custom configuration from ConfigService', () => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.DEADLINE_DAYS:
            return 21;
          case UI19_CONFIG_KEYS.WARNING_DAYS:
            return 10;
          case UI19_CONFIG_KEYS.ENFORCEMENT_MODE:
            return 'block';
          default:
            return undefined;
        }
      });

      const config = service.getConfig();

      expect(config.deadlineDays).toBe(21);
      expect(config.warningDays).toBe(10);
      expect(config.enforcementMode).toBe('block');
    });
  });

  describe('calculateDueDate', () => {
    beforeEach(() => {
      // Reset to default config
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.DEADLINE_DAYS:
            return 14;
          default:
            return undefined;
        }
      });
    });

    it('should calculate due date 14 days from event date', () => {
      const eventDate = new Date('2026-01-01');
      const dueDate = service.calculateDueDate(eventDate);

      expect(dueDate.getFullYear()).toBe(2026);
      expect(dueDate.getMonth()).toBe(0); // January
      expect(dueDate.getDate()).toBe(15);
    });

    it('should handle month boundary correctly', () => {
      const eventDate = new Date('2026-01-25');
      const dueDate = service.calculateDueDate(eventDate);

      expect(dueDate.getMonth()).toBe(1); // February
      expect(dueDate.getDate()).toBe(8);
    });

    it('should handle year boundary correctly', () => {
      const eventDate = new Date('2025-12-25');
      const dueDate = service.calculateDueDate(eventDate);

      expect(dueDate.getFullYear()).toBe(2026);
      expect(dueDate.getMonth()).toBe(0); // January
      expect(dueDate.getDate()).toBe(8);
    });

    it('should set time to start of day', () => {
      const eventDate = new Date('2026-01-01T15:30:00');
      const dueDate = service.calculateDueDate(eventDate);

      expect(dueDate.getHours()).toBe(0);
      expect(dueDate.getMinutes()).toBe(0);
      expect(dueDate.getSeconds()).toBe(0);
    });
  });

  describe('getDaysRemaining', () => {
    it('should return positive days when before deadline', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 7);

      const days = service.getDaysRemaining(dueDate);

      expect(days).toBe(7);
    });

    it('should return 0 on due date', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const days = service.getDaysRemaining(today);

      expect(days).toBe(0);
    });

    it('should return negative days when past deadline', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() - 3);

      const days = service.getDaysRemaining(dueDate);

      expect(days).toBe(-3);
    });

    it('should return 1 for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const days = service.getDaysRemaining(tomorrow);

      expect(days).toBe(1);
    });
  });

  describe('isOverdue', () => {
    it('should return true when past deadline', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() - 1);

      expect(service.isOverdue(dueDate)).toBe(true);
    });

    it('should return false on due date', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(service.isOverdue(today)).toBe(false);
    });

    it('should return false when before deadline', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 5);

      expect(service.isOverdue(dueDate)).toBe(false);
    });
  });

  describe('isApproachingDeadline', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.WARNING_DAYS:
            return 7;
          default:
            return undefined;
        }
      });
    });

    it('should return true when within warning period (1-7 days)', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 5);

      expect(service.isApproachingDeadline(dueDate)).toBe(true);
    });

    it('should return true at exactly warning days', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 7);

      expect(service.isApproachingDeadline(dueDate)).toBe(true);
    });

    it('should return false when overdue', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() - 1);

      expect(service.isApproachingDeadline(dueDate)).toBe(false);
    });

    it('should return false when more than warning days away', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 10);

      expect(service.isApproachingDeadline(dueDate)).toBe(false);
    });

    it('should return false on exact due date (0 days remaining)', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      expect(service.isApproachingDeadline(today)).toBe(false);
    });
  });

  describe('getAlertSeverity', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.WARNING_DAYS:
            return 7;
          default:
            return undefined;
        }
      });
    });

    it('should return critical when overdue', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() - 1);

      expect(service.getAlertSeverity(dueDate)).toBe('critical');
    });

    it('should return warning when approaching deadline', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 5);

      expect(service.getAlertSeverity(dueDate)).toBe('warning');
    });

    it('should return info when not urgent', () => {
      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 10);

      expect(service.getAlertSeverity(dueDate)).toBe('info');
    });
  });

  describe('createCommencementSubmission', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.DEADLINE_DAYS:
            return 14;
          default:
            return undefined;
        }
      });
    });

    it('should create commencement submission with correct due date', async () => {
      const expectedDueDate = service.calculateDueDate(mockStaff.startDate);

      prisma.ui19Submission.findFirst.mockResolvedValue(null);
      prisma.ui19Submission.create.mockResolvedValue(
        createMockSubmission({
          type: UI19Type.COMMENCEMENT,
          eventDate: mockStaff.startDate,
          dueDate: expectedDueDate,
        }),
      );

      const result = await service.createCommencementSubmission(mockStaff);

      expect(prisma.ui19Submission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: mockStaff.id,
          tenantId: mockStaff.tenantId,
          type: UI19Type.COMMENCEMENT,
          eventDate: mockStaff.startDate,
          status: UI19Status.PENDING,
        }),
      });
      expect(result.type).toBe(UI19Type.COMMENCEMENT);
    });

    it('should not create duplicate submission', async () => {
      const existingSubmission = createMockSubmission();
      prisma.ui19Submission.findFirst.mockResolvedValue(existingSubmission);

      const result = await service.createCommencementSubmission(mockStaff);

      expect(prisma.ui19Submission.create).not.toHaveBeenCalled();
      expect(result.id).toBe(existingSubmission.id);
    });

    it('should include notes when provided', async () => {
      prisma.ui19Submission.findFirst.mockResolvedValue(null);
      prisma.ui19Submission.create.mockResolvedValue(
        createMockSubmission({ notes: 'Test note' }),
      );

      await service.createCommencementSubmission(mockStaff, {
        notes: 'Test note',
      });

      expect(prisma.ui19Submission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notes: 'Test note',
        }),
      });
    });
  });

  describe('createTerminationSubmission', () => {
    it('should create termination submission with correct due date', async () => {
      const endDate = new Date('2026-03-31');
      const expectedDueDate = service.calculateDueDate(endDate);

      prisma.ui19Submission.findFirst.mockResolvedValue(null);
      prisma.ui19Submission.create.mockResolvedValue(
        createMockSubmission({
          type: UI19Type.TERMINATION,
          eventDate: endDate,
          dueDate: expectedDueDate,
        }),
      );

      const result = await service.createTerminationSubmission(
        mockStaff,
        endDate,
      );

      expect(prisma.ui19Submission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staffId: mockStaff.id,
          type: UI19Type.TERMINATION,
          eventDate: endDate,
          status: UI19Status.PENDING,
        }),
      });
      expect(result.type).toBe(UI19Type.TERMINATION);
    });
  });

  describe('submitUI19', () => {
    describe('on-time submission', () => {
      it('should mark as SUBMITTED when before deadline', async () => {
        const futureDueDate = new Date();
        futureDueDate.setDate(futureDueDate.getDate() + 5);

        const mockSubmission = createMockSubmission({ dueDate: futureDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          status: UI19Status.SUBMITTED,
          submittedAt: new Date(),
          submittedBy: mockUserId,
        });

        const result = await service.submitUI19('submission-123', mockUserId);

        expect(prisma.ui19Submission.update).toHaveBeenCalledWith({
          where: { id: 'submission-123' },
          data: expect.objectContaining({
            status: UI19Status.SUBMITTED,
            submittedBy: mockUserId,
          }),
        });
        expect(result.status).toBe(UI19Status.SUBMITTED);
      });

      it('should include reference number when provided', async () => {
        const futureDueDate = new Date();
        futureDueDate.setDate(futureDueDate.getDate() + 5);

        const mockSubmission = createMockSubmission({ dueDate: futureDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          referenceNumber: 'REF-001',
        });

        await service.submitUI19('submission-123', mockUserId, {
          referenceNumber: 'REF-001',
        });

        expect(prisma.ui19Submission.update).toHaveBeenCalledWith({
          where: { id: 'submission-123' },
          data: expect.objectContaining({
            referenceNumber: 'REF-001',
          }),
        });
      });
    });

    describe('late submission', () => {
      it('should mark as LATE_SUBMITTED when past deadline', async () => {
        const pastDueDate = new Date();
        pastDueDate.setDate(pastDueDate.getDate() - 3);

        const mockSubmission = createMockSubmission({ dueDate: pastDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          status: UI19Status.LATE_SUBMITTED,
        });

        // Reset to warn mode
        configService.get.mockImplementation((key: string) => {
          if (key === UI19_CONFIG_KEYS.ENFORCEMENT_MODE) return 'warn';
          return undefined;
        });

        const result = await service.submitUI19('submission-123', mockUserId);

        expect(result.status).toBe(UI19Status.LATE_SUBMITTED);
      });

      it('should include late reason when provided', async () => {
        const pastDueDate = new Date();
        pastDueDate.setDate(pastDueDate.getDate() - 3);

        const mockSubmission = createMockSubmission({ dueDate: pastDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          status: UI19Status.LATE_SUBMITTED,
          lateReason: 'Staff was on leave',
        });

        await service.submitUI19('submission-123', mockUserId, {
          lateReason: 'Staff was on leave',
        });

        expect(prisma.ui19Submission.update).toHaveBeenCalledWith({
          where: { id: 'submission-123' },
          data: expect.objectContaining({
            lateReason: 'Staff was on leave',
          }),
        });
      });
    });

    describe('enforcement modes', () => {
      it('should throw error in block mode when late without reason', async () => {
        const pastDueDate = new Date();
        pastDueDate.setDate(pastDueDate.getDate() - 3);

        const mockSubmission = createMockSubmission({ dueDate: pastDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);

        configService.get.mockImplementation((key: string) => {
          if (key === UI19_CONFIG_KEYS.ENFORCEMENT_MODE) return 'block';
          return undefined;
        });

        await expect(
          service.submitUI19('submission-123', mockUserId),
        ).rejects.toThrow(BadRequestException);
      });

      it('should allow late submission in block mode with reason', async () => {
        const pastDueDate = new Date();
        pastDueDate.setDate(pastDueDate.getDate() - 3);

        const mockSubmission = createMockSubmission({ dueDate: pastDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          status: UI19Status.LATE_SUBMITTED,
        });

        configService.get.mockImplementation((key: string) => {
          if (key === UI19_CONFIG_KEYS.ENFORCEMENT_MODE) return 'block';
          return undefined;
        });

        const result = await service.submitUI19('submission-123', mockUserId, {
          lateReason: 'System was down',
        });

        expect(result.status).toBe(UI19Status.LATE_SUBMITTED);
      });

      it('should allow late submission in warn mode without reason', async () => {
        const pastDueDate = new Date();
        pastDueDate.setDate(pastDueDate.getDate() - 3);

        const mockSubmission = createMockSubmission({ dueDate: pastDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          status: UI19Status.LATE_SUBMITTED,
        });

        configService.get.mockImplementation((key: string) => {
          if (key === UI19_CONFIG_KEYS.ENFORCEMENT_MODE) return 'warn';
          return undefined;
        });

        const result = await service.submitUI19('submission-123', mockUserId);

        expect(result.status).toBe(UI19Status.LATE_SUBMITTED);
      });

      it('should allow late submission in log mode without reason', async () => {
        const pastDueDate = new Date();
        pastDueDate.setDate(pastDueDate.getDate() - 3);

        const mockSubmission = createMockSubmission({ dueDate: pastDueDate });
        prisma.ui19Submission.findUnique.mockResolvedValue(mockSubmission);
        prisma.ui19Submission.update.mockResolvedValue({
          ...mockSubmission,
          status: UI19Status.LATE_SUBMITTED,
        });

        configService.get.mockImplementation((key: string) => {
          if (key === UI19_CONFIG_KEYS.ENFORCEMENT_MODE) return 'log';
          return undefined;
        });

        const result = await service.submitUI19('submission-123', mockUserId);

        expect(result.status).toBe(UI19Status.LATE_SUBMITTED);
      });
    });

    it('should throw NotFoundException when submission not found', async () => {
      prisma.ui19Submission.findUnique.mockResolvedValue(null);

      await expect(
        service.submitUI19('invalid-id', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPendingSubmissions', () => {
    it('should return pending submissions for tenant', async () => {
      const mockSubmissions = [
        createMockSubmission({ status: UI19Status.PENDING }),
        createMockSubmission({
          id: 'submission-456',
          status: UI19Status.OVERDUE,
        }),
      ];

      prisma.ui19Submission.findMany.mockResolvedValue(mockSubmissions);

      const result = await service.getPendingSubmissions(mockTenantId);

      expect(prisma.ui19Submission.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          status: { in: [UI19Status.PENDING, UI19Status.OVERDUE] },
        },
        include: { staff: true },
        orderBy: { dueDate: 'asc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should filter by type when provided', async () => {
      prisma.ui19Submission.findMany.mockResolvedValue([]);

      await service.getPendingSubmissions(mockTenantId, {
        type: UI19Type.TERMINATION,
      });

      expect(prisma.ui19Submission.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          type: UI19Type.TERMINATION,
        }),
        include: { staff: true },
        orderBy: { dueDate: 'asc' },
      });
    });
  });

  describe('getOverdueSubmissions', () => {
    it('should return only overdue pending submissions', async () => {
      const overdueSubmission = createMockSubmission({
        status: UI19Status.PENDING,
        dueDate: new Date('2025-01-01'),
      });

      prisma.ui19Submission.findMany.mockResolvedValue([overdueSubmission]);

      const result = await service.getOverdueSubmissions(mockTenantId);

      expect(prisma.ui19Submission.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          status: UI19Status.PENDING,
          dueDate: { lt: expect.any(Date) },
        },
        include: { staff: true },
        orderBy: { dueDate: 'asc' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('updateOverdueStatuses', () => {
    it('should update pending submissions past due to OVERDUE', async () => {
      prisma.ui19Submission.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.updateOverdueStatuses(mockTenantId);

      expect(prisma.ui19Submission.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          status: UI19Status.PENDING,
          dueDate: { lt: expect.any(Date) },
        },
        data: {
          status: UI19Status.OVERDUE,
        },
      });
      expect(count).toBe(3);
    });
  });

  describe('getDashboardAlerts', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        switch (key) {
          case UI19_CONFIG_KEYS.WARNING_DAYS:
            return 7;
          default:
            return undefined;
        }
      });
    });

    it('should return alerts sorted by severity', async () => {
      const now = new Date();

      const overdueDueDate = new Date(now);
      overdueDueDate.setDate(overdueDueDate.getDate() - 5);

      const warningDueDate = new Date(now);
      warningDueDate.setDate(warningDueDate.getDate() + 3);

      const infoDueDate = new Date(now);
      infoDueDate.setDate(infoDueDate.getDate() + 10);

      const mockSubmissions = [
        createMockSubmission({
          id: 'info',
          dueDate: infoDueDate,
          status: UI19Status.PENDING,
        }),
        createMockSubmission({
          id: 'overdue',
          dueDate: overdueDueDate,
          status: UI19Status.OVERDUE,
        }),
        createMockSubmission({
          id: 'warning',
          dueDate: warningDueDate,
          status: UI19Status.PENDING,
        }),
      ];

      prisma.ui19Submission.findMany.mockResolvedValue(mockSubmissions);

      const alerts = await service.getDashboardAlerts(mockTenantId);

      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].submissionId).toBe('overdue');
      expect(alerts[1].severity).toBe('warning');
      expect(alerts[1].submissionId).toBe('warning');
      expect(alerts[2].severity).toBe('info');
      expect(alerts[2].submissionId).toBe('info');
    });

    it('should include correct alert properties', async () => {
      const futureDueDate = new Date();
      futureDueDate.setDate(futureDueDate.getDate() + 10);

      const mockSubmission = createMockSubmission({
        dueDate: futureDueDate,
        type: UI19Type.COMMENCEMENT,
      });

      prisma.ui19Submission.findMany.mockResolvedValue([mockSubmission]);

      const alerts = await service.getDashboardAlerts(mockTenantId);

      expect(alerts[0]).toEqual(
        expect.objectContaining({
          submissionId: mockSubmission.id,
          staffId: mockSubmission.staffId,
          staffName: `${mockStaff.firstName} ${mockStaff.lastName}`,
          type: UI19Type.COMMENCEMENT,
          isOverdue: false,
          isApproaching: false,
          severity: 'info',
        }),
      );
    });
  });

  describe('getStatistics', () => {
    it('should return accurate statistics', async () => {
      prisma.ui19Submission.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(5) // submitted
        .mockResolvedValueOnce(1) // lateSubmitted
        .mockResolvedValueOnce(1); // overdue

      const stats = await service.getStatistics(mockTenantId);

      expect(stats.total).toBe(10);
      expect(stats.pending).toBe(3);
      expect(stats.submitted).toBe(5);
      expect(stats.lateSubmitted).toBe(1);
      expect(stats.overdue).toBe(1);
      expect(stats.onTimeRate).toBeCloseTo(83.33, 1); // 5 out of 6 completed on time
    });

    it('should return 100% on-time rate when no completed submissions', async () => {
      prisma.ui19Submission.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(0) // submitted
        .mockResolvedValueOnce(0) // lateSubmitted
        .mockResolvedValueOnce(0); // overdue

      const stats = await service.getStatistics(mockTenantId);

      expect(stats.onTimeRate).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    describe('14-day calculation edge cases', () => {
      it('should handle February correctly', () => {
        const eventDate = new Date('2026-02-20');
        const dueDate = service.calculateDueDate(eventDate);

        expect(dueDate.getMonth()).toBe(2); // March
        expect(dueDate.getDate()).toBe(6);
      });

      it('should handle leap year February', () => {
        const eventDate = new Date('2024-02-20'); // 2024 is leap year
        const dueDate = service.calculateDueDate(eventDate);

        expect(dueDate.getMonth()).toBe(2); // March
        expect(dueDate.getDate()).toBe(5); // 29 days in Feb, so 5th March
      });

      it('should handle end of month', () => {
        const eventDate = new Date('2026-01-31');
        const dueDate = service.calculateDueDate(eventDate);

        expect(dueDate.getMonth()).toBe(1); // February
        expect(dueDate.getDate()).toBe(14);
      });
    });

    describe('days remaining edge cases', () => {
      it('should handle negative days correctly', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 10);

        const days = service.getDaysRemaining(pastDate);

        expect(days).toBe(-10);
      });

      it('should handle large future dates', () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 365);

        const days = service.getDaysRemaining(futureDate);

        expect(days).toBeGreaterThanOrEqual(364);
        expect(days).toBeLessThanOrEqual(366);
      });
    });
  });
});
