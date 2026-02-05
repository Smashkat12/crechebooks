/**
 * Onboarding Conversation Handler Tests
 * TASK-WA-012: WhatsApp Conversational Onboarding
 *
 * London-school TDD with full mocking of dependencies.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingConversationHandler } from './onboarding-conversation.handler';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TwilioContentService } from '../services/twilio-content.service';
import {
  validateSAID,
  validateEmail,
  validatePhone,
  validateDOB,
  validateName,
} from '../types/onboarding.types';

// ============================================
// Mock factories
// ============================================

const createMockPrisma = () => ({
  whatsAppOnboardingSession: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  parent: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  child: {
    create: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
});

const createMockContentService = () => ({
  sendSessionMessage: jest.fn().mockResolvedValue({ success: true }),
  sendSessionQuickReply: jest.fn().mockResolvedValue({ success: true }),
  sendMediaMessage: jest.fn().mockResolvedValue({ success: true }),
  sendContentMessage: jest.fn().mockResolvedValue({ success: true }),
  sendListPicker: jest.fn().mockResolvedValue({ success: true }),
});

const TENANT_ID = 'tenant-123';
const WA_ID = '27821234567';
const SESSION_ID = 'session-abc';

const mockTenant = {
  id: TENANT_ID,
  name: 'Test Creche',
  tradingName: 'Little Stars Creche',
  phone: '0211234567',
};

const createSession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  tenantId: TENANT_ID,
  waId: WA_ID,
  currentStep: 'WELCOME',
  status: 'IN_PROGRESS',
  collectedData: {},
  lastMessageAt: new Date(),
  startedAt: new Date(),
  completedAt: null,
  parentId: null,
  ...overrides,
});

// ============================================
// Validation function tests
// ============================================

describe('Validation Functions', () => {
  describe('validateSAID', () => {
    it('should accept a valid SA ID number', () => {
      // Valid SA ID with correct Luhn check digit
      const result = validateSAID('8801015009080');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('8801015009080');
    });

    it('should reject ID with wrong length', () => {
      const result = validateSAID('12345');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('13 digits');
    });

    it('should reject ID with invalid Luhn check digit', () => {
      // Same base as valid ID but wrong check digit (1 instead of 0)
      const result = validateSAID('8801015009081');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid SA ID');
    });

    it('should accept "skip" as valid', () => {
      const result = validateSAID('skip');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('skip');
    });

    it('should accept "Skip" case-insensitively', () => {
      const result = validateSAID('Skip');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('skip');
    });

    it('should reject non-numeric characters', () => {
      const result = validateSAID('88010150090ab');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should accept a valid email', () => {
      const result = validateEmail('parent@example.com');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('parent@example.com');
    });

    it('should normalize email to lowercase', () => {
      const result = validateEmail('Parent@Example.COM');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('parent@example.com');
    });

    it('should reject email without @', () => {
      const result = validateEmail('notanemail');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid email');
    });

    it('should reject email without domain', () => {
      const result = validateEmail('user@');
      expect(result.valid).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = validateEmail('  user@example.com  ');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('user@example.com');
    });
  });

  describe('validatePhone', () => {
    it('should accept a valid SA mobile number starting with 0', () => {
      const result = validatePhone('0821234567');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('+27821234567');
    });

    it('should accept a valid SA number starting with +27', () => {
      const result = validatePhone('+27821234567');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('+27821234567');
    });

    it('should strip spaces and dashes', () => {
      const result = validatePhone('082 123 4567');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('+27821234567');
    });

    it('should reject numbers that are too short', () => {
      const result = validatePhone('08212345');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid SA phone');
    });

    it('should reject numbers that are too long', () => {
      const result = validatePhone('08212345678');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDOB', () => {
    it('should accept a valid date in DD/MM/YYYY format', () => {
      const year = new Date().getFullYear() - 3;
      const result = validateDOB(`15/06/${year}`);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(`${year}-06-15`);
    });

    it('should reject a future date', () => {
      const futureYear = new Date().getFullYear() + 1;
      const result = validateDOB(`01/01/${futureYear}`);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject a child older than 7', () => {
      const year = new Date().getFullYear() - 10;
      const result = validateDOB(`01/01/${year}`);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('7 years');
    });

    it('should accept different date separators', () => {
      const year = new Date().getFullYear() - 2;
      const result = validateDOB(`01-06-${year}`);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = validateDOB('not-a-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DD/MM/YYYY');
    });

    it('should reject invalid calendar date (Feb 30)', () => {
      const year = new Date().getFullYear() - 1;
      const result = validateDOB(`30/02/${year}`);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateName', () => {
    it('should accept a valid name', () => {
      const result = validateName('John');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('John');
    });

    it('should trim whitespace', () => {
      const result = validateName('  Jane  ');
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('Jane');
    });

    it('should reject empty string', () => {
      const result = validateName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should reject names longer than 100 characters', () => {
      const result = validateName('A'.repeat(101));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('100');
    });
  });
});

// ============================================
// OnboardingConversationHandler tests
// ============================================

describe('OnboardingConversationHandler', () => {
  let handler: OnboardingConversationHandler;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockContentService: ReturnType<typeof createMockContentService>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockContentService = createMockContentService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingConversationHandler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TwilioContentService, useValue: mockContentService },
      ],
    }).compile();

    handler = module.get<OnboardingConversationHandler>(
      OnboardingConversationHandler,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // shouldHandle tests
  // ==========================================

  describe('shouldHandle', () => {
    it('should return true for trigger keyword "register"', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'I want to register my child',
      );
      expect(result).toBe(true);
    });

    it('should return true for trigger keyword "enroll"', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'How do I enroll?',
      );
      expect(result).toBe(true);
    });

    it('should return true for trigger keyword "sign up"', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'I want to sign up',
      );
      expect(result).toBe(true);
    });

    it('should return true for trigger keyword "signup"', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'Signup please',
      );
      expect(result).toBe(true);
    });

    it('should return true for trigger keyword "join"', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'Can I join?',
      );
      expect(result).toBe(true);
    });

    it('should return true when active IN_PROGRESS session exists', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        createSession({ status: 'IN_PROGRESS' }),
      );

      const result = await handler.shouldHandle(WA_ID, TENANT_ID, 'hello');
      expect(result).toBe(true);
    });

    it('should return false for unrelated messages with no active session', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'What is the weather?',
      );
      expect(result).toBe(false);
    });

    it('should return false when session exists but is COMPLETED', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      const result = await handler.shouldHandle(WA_ID, TENANT_ID, 'hello');
      expect(result).toBe(false);
    });

    it('should return false when session exists but is ABANDONED', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        createSession({ status: 'ABANDONED' }),
      );

      const result = await handler.shouldHandle(WA_ID, TENANT_ID, 'hello');
      expect(result).toBe(false);
    });

    it('should be case-insensitive for trigger keywords', async () => {
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);

      const result = await handler.shouldHandle(
        WA_ID,
        TENANT_ID,
        'REGISTER please',
      );
      expect(result).toBe(true);
    });
  });

  // ==========================================
  // handleMessage tests
  // ==========================================

  describe('handleMessage', () => {
    it('should create a new session when none exists', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);
      mockPrisma.whatsAppOnboardingSession.create.mockResolvedValue(
        createSession(),
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CONSENT' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'register');

      expect(mockPrisma.whatsAppOnboardingSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            waId: WA_ID,
          }),
        }),
      );
    });

    it('should send welcome message on WELCOME step', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(null);
      mockPrisma.whatsAppOnboardingSession.create.mockResolvedValue(
        createSession({ currentStep: 'WELCOME' }),
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CONSENT' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'register');

      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Little Stars Creche'),
        TENANT_ID,
      );
    });

    it('should handle re-engagement: onboard_cancel', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        createSession({ currentStep: 'PARENT_NAME' }),
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'ABANDONED' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'onboard_cancel');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ABANDONED',
          }),
        }),
      );
      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('cancelled'),
        TENANT_ID,
      );
    });

    it('should handle re-engagement: onboard_restart', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        createSession({ currentStep: 'PARENT_EMAIL' }),
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'WELCOME', collectedData: {} }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'onboard_restart');

      // Should reset to WELCOME step
      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'WELCOME',
            collectedData: {},
          }),
        }),
      );
    });

    it('should handle re-engagement: onboard_resume', async () => {
      const session = createSession({
        currentStep: 'PARENT_EMAIL',
        collectedData: { parent: { firstName: 'Jane' } },
      });
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(session);

      await handler.handleMessage(WA_ID, TENANT_ID, 'onboard_resume');

      // Should re-send prompt for PARENT_EMAIL step
      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('email'),
        TENANT_ID,
      );
    });

    it('should not process if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await handler.handleMessage(WA_ID, TENANT_ID, 'register');

      expect(
        mockPrisma.whatsAppOnboardingSession.findUnique,
      ).not.toHaveBeenCalled();
      expect(mockContentService.sendSessionMessage).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Step transition tests
  // ==========================================

  describe('Step transitions', () => {
    beforeEach(() => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    });

    it('should advance from CONSENT (accept) to PARENT_NAME', async () => {
      const session = createSession({ currentStep: 'CONSENT' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'PARENT_NAME' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'accept');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'PARENT_NAME',
          }),
        }),
      );
    });

    it('should abandon session on CONSENT decline', async () => {
      const session = createSession({ currentStep: 'CONSENT' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'ABANDONED' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'decline');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ABANDONED',
          }),
        }),
      );
    });

    it('should advance from PARENT_NAME to PARENT_SURNAME', async () => {
      const session = createSession({ currentStep: 'PARENT_NAME' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'PARENT_SURNAME' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'Jane');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'PARENT_SURNAME',
          }),
        }),
      );
    });

    it('should store parent first name in collected data', async () => {
      const session = createSession({ currentStep: 'PARENT_NAME' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'PARENT_SURNAME' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'Jane');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collectedData: expect.objectContaining({
              parent: expect.objectContaining({
                firstName: 'Jane',
              }),
            }),
          }),
        }),
      );
    });

    it('should advance from PARENT_SURNAME to PARENT_EMAIL', async () => {
      const session = createSession({
        currentStep: 'PARENT_SURNAME',
        collectedData: { parent: { firstName: 'Jane', phone: WA_ID } },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'PARENT_EMAIL' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'Smith');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'PARENT_EMAIL',
          }),
        }),
      );
    });

    it('should reject invalid email and not advance', async () => {
      const session = createSession({ currentStep: 'PARENT_EMAIL' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(session);

      await handler.handleMessage(WA_ID, TENANT_ID, 'not-an-email');

      // Should send error message, not advance step
      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('valid email'),
        TENANT_ID,
      );
    });

    it('should advance from PARENT_EMAIL to PARENT_ID_NUMBER', async () => {
      const session = createSession({
        currentStep: 'PARENT_EMAIL',
        collectedData: {
          parent: { firstName: 'Jane', surname: 'Smith', phone: WA_ID },
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'PARENT_ID_NUMBER' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'jane@example.com');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'PARENT_ID_NUMBER',
          }),
        }),
      );
    });

    it('should skip ID number and advance to CHILD_NAME', async () => {
      const session = createSession({
        currentStep: 'PARENT_ID_NUMBER',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CHILD_NAME' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'skip');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'CHILD_NAME',
          }),
        }),
      );
    });

    it('should advance from CHILD_NAME to CHILD_DOB', async () => {
      const session = createSession({
        currentStep: 'CHILD_NAME',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CHILD_DOB' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'Lily');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'CHILD_DOB',
          }),
        }),
      );
    });

    it('should reject invalid DOB and not advance', async () => {
      const session = createSession({
        currentStep: 'CHILD_DOB',
        collectedData: { children: [{ firstName: 'Lily' }] },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(session);

      await handler.handleMessage(WA_ID, TENANT_ID, 'invalid');

      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('DD/MM/YYYY'),
        TENANT_ID,
      );
    });

    it('should advance from CHILD_DOB to CHILD_ALLERGIES', async () => {
      const year = new Date().getFullYear() - 3;
      const session = createSession({
        currentStep: 'CHILD_DOB',
        collectedData: { children: [{ firstName: 'Lily' }] },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CHILD_ALLERGIES' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, `15/06/${year}`);

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'CHILD_ALLERGIES',
          }),
        }),
      );
    });

    it('should advance from CHILD_ALLERGIES to CHILD_ANOTHER with quick reply', async () => {
      // TASK-WA-013: CHILD_ANOTHER now sends a quick reply instead of auto-advancing
      const session = createSession({
        currentStep: 'CHILD_ALLERGIES',
        collectedData: {
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CHILD_ANOTHER' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'None');

      // Should update step to CHILD_ANOTHER
      const updateCalls =
        mockPrisma.whatsAppOnboardingSession.update.mock.calls;
      const childAnotherUpdate = updateCalls.find(
        (call: any) => call[0]?.data?.currentStep === 'CHILD_ANOTHER',
      );
      expect(childAnotherUpdate).toBeDefined();

      // Should send quick reply asking about another child
      expect(mockContentService.sendSessionQuickReply).toHaveBeenCalledWith(
        WA_ID,
        'Would you like to register another child?',
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Add Another',
            id: 'child_add_another',
          }),
          expect.objectContaining({ title: 'Continue', id: 'child_continue' }),
        ]),
        TENANT_ID,
      );
    });

    it('should advance from CHILD_ANOTHER (continue) to EMERGENCY_CONTACT_NAME', async () => {
      // TASK-WA-013: Multi-child loop - "Continue" advances to emergency contact
      const session = createSession({
        currentStep: 'CHILD_ANOTHER',
        collectedData: {
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'EMERGENCY_CONTACT_NAME' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'child_continue');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'EMERGENCY_CONTACT_NAME',
          }),
        }),
      );
    });

    it('should loop back to CHILD_NAME from CHILD_ANOTHER when adding another child', async () => {
      // TASK-WA-013: Multi-child loop - "Add Another" loops back to CHILD_NAME
      const session = createSession({
        currentStep: 'CHILD_ANOTHER',
        collectedData: {
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CHILD_NAME' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'child_add_another');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'CHILD_NAME',
          }),
        }),
      );
    });

    it('should advance from EMERGENCY_CONTACT_NAME to EMERGENCY_CONTACT_PHONE', async () => {
      const session = createSession({
        currentStep: 'EMERGENCY_CONTACT_NAME',
        collectedData: {
          parent: { firstName: 'Jane', surname: 'Smith' },
          children: [{ firstName: 'Lily' }],
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'EMERGENCY_CONTACT_PHONE' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'John Smith');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'EMERGENCY_CONTACT_PHONE',
          }),
        }),
      );
    });

    it('should reject invalid phone number for emergency contact', async () => {
      const session = createSession({
        currentStep: 'EMERGENCY_CONTACT_PHONE',
        collectedData: { emergencyContact: { name: 'John Smith' } },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(session);

      await handler.handleMessage(WA_ID, TENANT_ID, '12345');

      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('valid SA phone'),
        TENANT_ID,
      );
    });

    it('should advance from EMERGENCY_CONTACT_PHONE to EMERGENCY_CONTACT_RELATION', async () => {
      const session = createSession({
        currentStep: 'EMERGENCY_CONTACT_PHONE',
        collectedData: { emergencyContact: { name: 'John Smith' } },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'EMERGENCY_CONTACT_RELATION' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, '0821234567');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'EMERGENCY_CONTACT_RELATION',
          }),
        }),
      );
    });

    it('should advance from EMERGENCY_CONTACT_RELATION to ID_DOCUMENT', async () => {
      const session = createSession({
        currentStep: 'EMERGENCY_CONTACT_RELATION',
        collectedData: {
          emergencyContact: { name: 'John Smith', phone: '+27821234567' },
        },
      });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'ID_DOCUMENT' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'parent');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'ID_DOCUMENT',
          }),
        }),
      );
    });

    it('should advance from ID_DOCUMENT (skip) to FEE_AGREEMENT', async () => {
      const session = createSession({ currentStep: 'ID_DOCUMENT' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'FEE_AGREEMENT' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'skip');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'FEE_AGREEMENT',
          }),
        }),
      );
    });

    it('should advance from FEE_AGREEMENT (agree) to COMMUNICATION_PREFS', async () => {
      const session = createSession({ currentStep: 'FEE_AGREEMENT' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'COMMUNICATION_PREFS' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'agree');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'COMMUNICATION_PREFS',
          }),
        }),
      );
    });

    it('should abandon session on FEE_AGREEMENT decline', async () => {
      const session = createSession({ currentStep: 'FEE_AGREEMENT' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'ABANDONED' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'decline');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ABANDONED',
          }),
        }),
      );
    });

    it('should advance from COMMUNICATION_PREFS to CONFIRMATION', async () => {
      const session = createSession({ currentStep: 'COMMUNICATION_PREFS' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CONFIRMATION' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'both');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'CONFIRMATION',
          }),
        }),
      );
    });

    it('should set correct communication prefs for "whatsapp only"', async () => {
      const session = createSession({ currentStep: 'COMMUNICATION_PREFS' });
      mockPrisma.whatsAppOnboardingSession.findUnique.mockResolvedValue(
        session,
      );
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ currentStep: 'CONFIRMATION' }),
      );

      await handler.handleMessage(WA_ID, TENANT_ID, 'whatsapp only');

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collectedData: expect.objectContaining({
              communicationPrefs: { whatsapp: true, email: false },
            }),
          }),
        }),
      );
    });
  });

  // ==========================================
  // completeOnboarding tests
  // ==========================================

  describe('completeOnboarding', () => {
    const fullData = {
      parent: {
        firstName: 'Jane',
        surname: 'Smith',
        email: 'jane@example.com',
        idNumber: '8801015009080',
        phone: WA_ID,
      },
      children: [
        {
          firstName: 'Lily',
          dateOfBirth: '2023-06-15',
          allergies: 'Peanuts',
        },
      ],
      emergencyContact: {
        name: 'John Smith',
        phone: '+27829876543',
        relationship: 'parent',
      },
      popiaConsent: true,
      popiaConsentAt: '2025-01-01T00:00:00.000Z',
      feeAcknowledged: true,
      communicationPrefs: {
        whatsapp: true,
        email: true,
      },
    };

    beforeEach(() => {
      mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    });

    it('should create Parent record with correct fields', async () => {
      mockPrisma.parent.create.mockResolvedValue({
        id: 'parent-1',
        ...fullData.parent,
      });
      mockPrisma.child.create.mockResolvedValue({ id: 'child-1' });
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      await handler.completeOnboarding(
        SESSION_ID,
        fullData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockPrisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          phone: WA_ID,
          whatsapp: WA_ID,
          idNumber: '8801015009080',
          whatsappOptIn: true,
          preferredContact: 'BOTH',
        }),
      });
    });

    it('should create Child record with parent surname as lastName', async () => {
      const parentRecord = { id: 'parent-1', ...fullData.parent };
      mockPrisma.parent.create.mockResolvedValue(parentRecord);
      mockPrisma.child.create.mockResolvedValue({ id: 'child-1' });
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      await handler.completeOnboarding(
        SESSION_ID,
        fullData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockPrisma.child.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          parentId: 'parent-1',
          firstName: 'Lily',
          lastName: 'Smith',
          dateOfBirth: new Date('2023-06-15'),
          medicalNotes: 'Peanuts',
          emergencyContact: 'John Smith',
          emergencyPhone: '+27829876543',
        }),
      });
    });

    it('should mark session as COMPLETED with parentId', async () => {
      mockPrisma.parent.create.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.child.create.mockResolvedValue({ id: 'child-1' });
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      await handler.completeOnboarding(
        SESSION_ID,
        fullData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockPrisma.whatsAppOnboardingSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SESSION_ID },
          data: expect.objectContaining({
            status: 'COMPLETED',
            parentId: 'parent-1',
            currentStep: 'COMPLETE',
          }),
        }),
      );
    });

    it('should send confirmation message with tenant name', async () => {
      mockPrisma.parent.create.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.child.create.mockResolvedValue({ id: 'child-1' });
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      await handler.completeOnboarding(
        SESSION_ID,
        fullData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Little Stars Creche'),
        TENANT_ID,
      );
    });

    it('should send error message if parent creation fails', async () => {
      mockPrisma.parent.create.mockRejectedValue(new Error('DB error'));

      await handler.completeOnboarding(
        SESSION_ID,
        fullData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('something went wrong'),
        TENANT_ID,
      );
    });

    it('should set preferredContact to WHATSAPP when only whatsapp selected', async () => {
      const whatsappOnlyData = {
        ...fullData,
        communicationPrefs: { whatsapp: true, email: false },
      };
      mockPrisma.parent.create.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.child.create.mockResolvedValue({ id: 'child-1' });
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      await handler.completeOnboarding(
        SESSION_ID,
        whatsappOnlyData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockPrisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          preferredContact: 'WHATSAPP',
        }),
      });
    });

    it('should set preferredContact to EMAIL when only email selected', async () => {
      const emailOnlyData = {
        ...fullData,
        communicationPrefs: { whatsapp: false, email: true },
      };
      mockPrisma.parent.create.mockResolvedValue({ id: 'parent-1' });
      mockPrisma.child.create.mockResolvedValue({ id: 'child-1' });
      mockPrisma.whatsAppOnboardingSession.update.mockResolvedValue(
        createSession({ status: 'COMPLETED' }),
      );

      await handler.completeOnboarding(
        SESSION_ID,
        emailOnlyData,
        TENANT_ID,
        WA_ID,
        'Little Stars Creche',
      );

      expect(mockPrisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          preferredContact: 'EMAIL',
        }),
      });
    });
  });
});
