/**
 * Onboarding Controller Unit Tests
 * TASK-WA-014: WhatsApp Onboarding Admin Visibility
 *
 * Tests all 4 endpoints with mocked PrismaService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';

// ============================================
// Mock factories
// ============================================

const TENANT_ID = 'tenant-123';

const createMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  tenantId: TENANT_ID,
  auth0Id: 'auth0|123',
  email: 'admin@creche.co.za',
  name: 'Admin User',
  role: 'ADMIN' as const,
  isActive: true,
  lastLoginAt: null,
  currentTenantId: TENANT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockPrisma = () => ({
  whatsAppOnboardingSession: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  enrollment: {
    create: jest.fn(),
  },
});

const createMockSession = (overrides: Record<string, unknown> = {}) => ({
  id: 'session-1',
  tenantId: TENANT_ID,
  waId: '27821234567',
  currentStep: 'COMPLETE',
  status: 'COMPLETED',
  startedAt: new Date('2025-01-01'),
  completedAt: new Date('2025-01-01T01:00:00'),
  updatedAt: new Date('2025-01-01T01:00:00'),
  parentId: 'parent-1',
  collectedData: {},
  lastMessageAt: new Date(),
  parent: null,
  ...overrides,
});

// ============================================
// Tests
// ============================================

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // GET /whatsapp/onboarding/stats
  // ==========================================

  describe('getStats', () => {
    it('should return correct counts and conversion rate', async () => {
      mockPrisma.whatsAppOnboardingSession.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3) // inProgress
        .mockResolvedValueOnce(5) // completed
        .mockResolvedValueOnce(2); // abandoned

      const result = await controller.getStats(createMockUser());

      expect(result).toEqual({
        total: 10,
        inProgress: 3,
        completed: 5,
        abandoned: 2,
        conversionRate: 50,
      });

      // Verify tenant isolation
      expect(mockPrisma.whatsAppOnboardingSession.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
    });

    it('should return 0% conversion rate when no sessions exist', async () => {
      mockPrisma.whatsAppOnboardingSession.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await controller.getStats(createMockUser());

      expect(result.conversionRate).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should round conversion rate to nearest integer', async () => {
      mockPrisma.whatsAppOnboardingSession.count
        .mockResolvedValueOnce(3) // total
        .mockResolvedValueOnce(1) // inProgress
        .mockResolvedValueOnce(1) // completed
        .mockResolvedValueOnce(1); // abandoned

      const result = await controller.getStats(createMockUser());

      // 1/3 = 33.33... -> 33
      expect(result.conversionRate).toBe(33);
    });
  });

  // ==========================================
  // GET /whatsapp/onboarding
  // ==========================================

  describe('listSessions', () => {
    it('should list sessions with default pagination', async () => {
      const sessions = [
        createMockSession({ id: 'session-1' }),
        createMockSession({ id: 'session-2' }),
      ];
      mockPrisma.whatsAppOnboardingSession.findMany.mockResolvedValue(sessions);

      const result = await controller.listSessions(createMockUser(), {});

      expect(result).toHaveLength(2);
      expect(
        mockPrisma.whatsAppOnboardingSession.findMany,
      ).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        skip: 0,
        select: {
          id: true,
          waId: true,
          currentStep: true,
          status: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
          parentId: true,
        },
      });
    });

    it('should filter by status when provided', async () => {
      mockPrisma.whatsAppOnboardingSession.findMany.mockResolvedValue([]);

      await controller.listSessions(createMockUser(), {
        status: 'IN_PROGRESS',
      });

      expect(
        mockPrisma.whatsAppOnboardingSession.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, status: 'IN_PROGRESS' },
        }),
      );
    });

    it('should apply custom limit and offset', async () => {
      mockPrisma.whatsAppOnboardingSession.findMany.mockResolvedValue([]);

      await controller.listSessions(createMockUser(), {
        limit: 10,
        offset: 20,
      });

      expect(
        mockPrisma.whatsAppOnboardingSession.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  // ==========================================
  // GET /whatsapp/onboarding/:id
  // ==========================================

  describe('getSession', () => {
    it('should return session detail when found', async () => {
      const session = createMockSession({
        parent: { id: 'parent-1', firstName: 'Jane' },
      });
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(session);

      const result = await controller.getSession(createMockUser(), 'session-1');

      expect(result).toEqual(session);
      expect(
        mockPrisma.whatsAppOnboardingSession.findFirst,
      ).toHaveBeenCalledWith({
        where: { id: 'session-1', tenantId: TENANT_ID },
        include: { parent: true },
      });
    });

    it('should throw NotFoundException when session not found', async () => {
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(null);

      await expect(
        controller.getSession(createMockUser(), 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation (different tenant returns 404)', async () => {
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(null);

      await expect(
        controller.getSession(createMockUser(), 'session-other-tenant'),
      ).rejects.toThrow('Onboarding session not found');
    });
  });

  // ==========================================
  // POST /whatsapp/onboarding/:id/enroll
  // ==========================================

  describe('convertToEnrollment', () => {
    const enrollBody = {
      childId: 'child-1',
      feeStructureId: 'fee-1',
      startDate: '2025-02-01',
    };

    it('should create enrollment for completed session', async () => {
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(
        createMockSession({ status: 'COMPLETED', parentId: 'parent-1' }),
      );
      mockPrisma.enrollment.create.mockResolvedValue({
        id: 'enrollment-1',
      });

      const result = await controller.convertToEnrollment(
        createMockUser(),
        'session-1',
        enrollBody,
      );

      expect(result).toEqual({ enrollmentId: 'enrollment-1' });
      expect(mockPrisma.enrollment.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          childId: 'child-1',
          feeStructureId: 'fee-1',
          startDate: new Date('2025-02-01'),
          status: 'PENDING',
        },
      });
    });

    it('should throw NotFoundException when session is not completed', async () => {
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(null);

      await expect(
        controller.convertToEnrollment(
          createMockUser(),
          'session-in-progress',
          enrollBody,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when session not found', async () => {
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(null);

      await expect(
        controller.convertToEnrollment(
          createMockUser(),
          'nonexistent',
          enrollBody,
        ),
      ).rejects.toThrow('Completed onboarding session not found');
    });

    it('should query only COMPLETED status sessions', async () => {
      mockPrisma.whatsAppOnboardingSession.findFirst.mockResolvedValue(null);

      try {
        await controller.convertToEnrollment(
          createMockUser(),
          'session-1',
          enrollBody,
        );
      } catch {
        // Expected to throw
      }

      expect(
        mockPrisma.whatsAppOnboardingSession.findFirst,
      ).toHaveBeenCalledWith({
        where: { id: 'session-1', tenantId: TENANT_ID, status: 'COMPLETED' },
      });
    });
  });
});
