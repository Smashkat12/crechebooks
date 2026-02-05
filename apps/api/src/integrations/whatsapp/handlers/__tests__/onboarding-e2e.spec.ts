/**
 * Onboarding End-to-End Integration Tests
 * TASK-WA-014: WhatsApp Onboarding Admin Visibility & Tests
 *
 * Exercises the full handler logic end-to-end with mock services,
 * covering the complete 16-step flow, validation edge cases,
 * multi-child flow, and session resume.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingConversationHandler } from '../onboarding-conversation.handler';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { TwilioContentService } from '../../services/twilio-content.service';

// ============================================
// Mock factories
// ============================================

const TENANT_ID = 'tenant-e2e';
const WA_ID = '27821234567';
const SESSION_ID = 'session-e2e-1';

const mockTenant = {
  id: TENANT_ID,
  name: 'E2E Creche',
  tradingName: 'Sunshine Kids',
  phone: '0211234567',
};

/**
 * Stateful session mock that tracks step transitions and collected data.
 * Simulates Prisma upsert/update behavior for a single session.
 */
class SessionState {
  private session: Record<string, unknown> | null = null;

  reset(): void {
    this.session = null;
  }

  get current(): Record<string, unknown> | null {
    return this.session;
  }

  create(data: Record<string, unknown>): Record<string, unknown> {
    this.session = {
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
      ...data,
    };
    return this.session;
  }

  update(data: Record<string, unknown>): Record<string, unknown> {
    if (this.session) {
      this.session = { ...this.session, ...data };
    }
    return this.session!;
  }
}

function buildMocks(state: SessionState) {
  const sentMessages: Array<{ to: string; body: string }> = [];
  const sentQuickReplies: Array<{
    to: string;
    body: string;
    buttons: unknown[];
  }> = [];
  const sentListPickers: Array<{
    to: string;
    body: string;
    items: unknown[];
  }> = [];

  const mockPrisma = {
    whatsAppOnboardingSession: {
      findUnique: jest.fn().mockImplementation(() => {
        return Promise.resolve(state.current ? { ...state.current } : null);
      }),
      findFirst: jest.fn().mockImplementation(() => {
        return Promise.resolve(state.current ? { ...state.current } : null);
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        return Promise.resolve(state.create(data));
      }),
      update: jest.fn().mockImplementation(({ data }: any) => {
        return Promise.resolve(state.update(data));
      }),
    },
    parent: {
      create: jest.fn().mockResolvedValue({ id: 'parent-e2e-1' }),
      findFirst: jest.fn(),
    },
    child: {
      create: jest.fn().mockResolvedValue({ id: 'child-e2e-1' }),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ email: 'admin@creche.co.za', name: 'Admin' }]),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(mockTenant),
      findFirst: jest.fn().mockResolvedValue(mockTenant),
    },
  };

  const mockContentService = {
    sendSessionMessage: jest
      .fn()
      .mockImplementation((to: string, body: string) => {
        sentMessages.push({ to, body });
        return Promise.resolve({ success: true });
      }),
    sendSessionQuickReply: jest
      .fn()
      .mockImplementation((to: string, body: string, buttons: unknown[]) => {
        sentQuickReplies.push({ to, body, buttons });
        return Promise.resolve({ success: true });
      }),
    sendMediaMessage: jest.fn().mockResolvedValue({ success: true }),
    sendContentMessage: jest.fn().mockResolvedValue({ success: true }),
    sendListPicker: jest
      .fn()
      .mockImplementation(
        (to: string, body: string, _buttonText: string, items: unknown[]) => {
          sentListPickers.push({ to, body, items });
          return Promise.resolve({ success: true });
        },
      ),
  };

  return {
    mockPrisma,
    mockContentService,
    sentMessages,
    sentQuickReplies,
    sentListPickers,
  };
}

// ============================================
// Tests
// ============================================

describe('Onboarding E2E Integration', () => {
  let handler: OnboardingConversationHandler;
  let state: SessionState;
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(async () => {
    state = new SessionState();
    mocks = buildMocks(state);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingConversationHandler,
        { provide: PrismaService, useValue: mocks.mockPrisma },
        { provide: TwilioContentService, useValue: mocks.mockContentService },
      ],
    }).compile();

    handler = module.get<OnboardingConversationHandler>(
      OnboardingConversationHandler,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    state.reset();
  });

  // ==========================================
  // Full 16-step flow
  // ==========================================

  describe('Full registration flow (single child)', () => {
    it('should complete the full 16-step flow successfully', async () => {
      const year = new Date().getFullYear() - 3;

      // Step 1 & 2: WELCOME + auto-advance to CONSENT
      await handler.handleMessage(WA_ID, TENANT_ID, 'register');
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Sunshine Kids'),
        TENANT_ID,
      );
      expect(
        mocks.mockContentService.sendSessionQuickReply,
      ).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('consent'),
        expect.any(Array),
        TENANT_ID,
      );

      // Step 3: CONSENT - Accept
      await handler.handleMessage(WA_ID, TENANT_ID, 'accept');

      // Step 4: PARENT_NAME
      await handler.handleMessage(WA_ID, TENANT_ID, 'Jane');

      // Step 5: PARENT_SURNAME
      await handler.handleMessage(WA_ID, TENANT_ID, 'Smith');

      // Step 6: PARENT_EMAIL
      await handler.handleMessage(WA_ID, TENANT_ID, 'jane@example.com');

      // Step 7: PARENT_ID_NUMBER (skip)
      await handler.handleMessage(WA_ID, TENANT_ID, 'skip');

      // Step 8: CHILD_NAME
      await handler.handleMessage(WA_ID, TENANT_ID, 'Lily');

      // Step 9: CHILD_DOB
      await handler.handleMessage(WA_ID, TENANT_ID, `15/06/${year}`);

      // Step 10: CHILD_ALLERGIES
      await handler.handleMessage(WA_ID, TENANT_ID, 'Peanuts');

      // Step 11: CHILD_ANOTHER - Continue (no more children)
      await handler.handleMessage(WA_ID, TENANT_ID, 'child_continue');

      // Step 12: EMERGENCY_CONTACT_NAME
      await handler.handleMessage(WA_ID, TENANT_ID, 'John Smith');

      // Step 13: EMERGENCY_CONTACT_PHONE
      await handler.handleMessage(WA_ID, TENANT_ID, '0829876543');

      // Step 14: EMERGENCY_CONTACT_RELATION
      await handler.handleMessage(WA_ID, TENANT_ID, 'parent');

      // Step 15: ID_DOCUMENT (skip)
      await handler.handleMessage(WA_ID, TENANT_ID, 'skip');

      // Step 16: FEE_AGREEMENT
      await handler.handleMessage(WA_ID, TENANT_ID, 'agree');

      // Step 17: COMMUNICATION_PREFS
      await handler.handleMessage(WA_ID, TENANT_ID, 'both');

      // Step 18: CONFIRMATION
      await handler.handleMessage(WA_ID, TENANT_ID, 'confirm');

      // Verify: Parent was created
      expect(mocks.mockPrisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          phone: WA_ID,
          whatsapp: WA_ID,
          whatsappOptIn: true,
          preferredContact: 'BOTH',
        }),
      });

      // Verify: Child was created
      expect(mocks.mockPrisma.child.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          parentId: 'parent-e2e-1',
          firstName: 'Lily',
          lastName: 'Smith',
          medicalNotes: 'Peanuts',
          emergencyContact: 'John Smith',
          emergencyPhone: '+27829876543',
        }),
      });

      // Verify: Session marked COMPLETED
      const updateCalls =
        mocks.mockPrisma.whatsAppOnboardingSession.update.mock.calls;
      const completedCall = updateCalls.find(
        (call: any) => call[0]?.data?.status === 'COMPLETED',
      );
      expect(completedCall).toBeDefined();

      // Verify: Confirmation message sent with tenant name
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Registration complete'),
        TENANT_ID,
      );

      // TASK-WA-014: Verify admin notification was attempted
      expect(mocks.mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          role: { in: ['ADMIN', 'OWNER'] },
          isActive: true,
        },
        select: { email: true, name: true },
      });
    });
  });

  // ==========================================
  // Validation edge cases
  // ==========================================

  describe('Validation edge cases', () => {
    beforeEach(async () => {
      // Start a session at PARENT_EMAIL step
      state.create({
        currentStep: 'PARENT_EMAIL',
        collectedData: {
          parent: { firstName: 'Jane', surname: 'Smith', phone: WA_ID },
          popiaConsent: true,
        },
      });
    });

    it('should reject invalid email and stay on same step', async () => {
      await handler.handleMessage(WA_ID, TENANT_ID, 'not-an-email');

      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('valid email'),
        TENANT_ID,
      );
      // Step should not have advanced
      expect(state.current?.currentStep).toBe('PARENT_EMAIL');
    });

    it('should reject invalid SA ID number', async () => {
      state.update({
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

      await handler.handleMessage(WA_ID, TENANT_ID, '1234567890123');

      // Should show error about invalid SA ID
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Invalid SA ID'),
        TENANT_ID,
      );
    });

    it('should reject future date of birth', async () => {
      const futureYear = new Date().getFullYear() + 1;
      state.update({
        currentStep: 'CHILD_DOB',
        collectedData: {
          children: [{ firstName: 'Lily' }],
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, `01/01/${futureYear}`);

      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('future'),
        TENANT_ID,
      );
    });

    it('should reject child older than 7 years', async () => {
      const oldYear = new Date().getFullYear() - 10;
      state.update({
        currentStep: 'CHILD_DOB',
        collectedData: {
          children: [{ firstName: 'Lily' }],
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, `01/01/${oldYear}`);

      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('7 years'),
        TENANT_ID,
      );
    });

    it('should reject invalid phone number for emergency contact', async () => {
      state.update({
        currentStep: 'EMERGENCY_CONTACT_PHONE',
        collectedData: {
          emergencyContact: { name: 'John Smith' },
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, '12345');

      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('valid SA phone'),
        TENANT_ID,
      );
    });

    it('should reject non-image media for ID document', async () => {
      state.update({
        currentStep: 'ID_DOCUMENT',
        collectedData: {},
      });

      await handler.handleMessage(
        WA_ID,
        TENANT_ID,
        '',
        'https://example.com/doc.pdf',
        'application/pdf',
      );

      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('photo'),
        TENANT_ID,
      );
    });
  });

  // ==========================================
  // Multi-child flow
  // ==========================================

  describe('Multi-child flow (2 children)', () => {
    it('should register two children through the CHILD_ANOTHER loop', async () => {
      const year = new Date().getFullYear() - 3;

      // Start fresh session
      await handler.handleMessage(WA_ID, TENANT_ID, 'register');

      // Consent
      await handler.handleMessage(WA_ID, TENANT_ID, 'accept');

      // Parent details
      await handler.handleMessage(WA_ID, TENANT_ID, 'Jane');
      await handler.handleMessage(WA_ID, TENANT_ID, 'Smith');
      await handler.handleMessage(WA_ID, TENANT_ID, 'jane@example.com');
      await handler.handleMessage(WA_ID, TENANT_ID, 'skip');

      // First child
      await handler.handleMessage(WA_ID, TENANT_ID, 'Lily');
      await handler.handleMessage(WA_ID, TENANT_ID, `15/06/${year}`);
      await handler.handleMessage(WA_ID, TENANT_ID, 'None');

      // CHILD_ANOTHER -> Add Another
      await handler.handleMessage(WA_ID, TENANT_ID, 'child_add_another');

      // Second child
      await handler.handleMessage(WA_ID, TENANT_ID, 'Max');
      await handler.handleMessage(WA_ID, TENANT_ID, `01/03/${year}`);
      await handler.handleMessage(WA_ID, TENANT_ID, 'Dairy');

      // CHILD_ANOTHER -> Continue
      await handler.handleMessage(WA_ID, TENANT_ID, 'child_continue');

      // Emergency contact
      await handler.handleMessage(WA_ID, TENANT_ID, 'John Smith');
      await handler.handleMessage(WA_ID, TENANT_ID, '0829876543');
      await handler.handleMessage(WA_ID, TENANT_ID, 'grandparent');

      // ID document skip
      await handler.handleMessage(WA_ID, TENANT_ID, 'skip');

      // Fee agreement
      await handler.handleMessage(WA_ID, TENANT_ID, 'agree');

      // Communication prefs
      await handler.handleMessage(WA_ID, TENANT_ID, 'whatsapp only');

      // Confirm
      await handler.handleMessage(WA_ID, TENANT_ID, 'confirm');

      // Verify: child.create called twice (once per child)
      expect(mocks.mockPrisma.child.create).toHaveBeenCalledTimes(2);

      // First child
      expect(mocks.mockPrisma.child.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Lily',
          medicalNotes: undefined, // "None" mapped to undefined
        }),
      });

      // Second child
      expect(mocks.mockPrisma.child.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Max',
          medicalNotes: 'Dairy',
        }),
      });

      // Verify: WhatsApp-only comms preference
      expect(mocks.mockPrisma.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          preferredContact: 'WHATSAPP',
        }),
      });
    });
  });

  // ==========================================
  // Session resume
  // ==========================================

  describe('Session resume (onboard_resume)', () => {
    it('should re-send the prompt for the current step on resume', async () => {
      state.create({
        currentStep: 'PARENT_EMAIL',
        collectedData: {
          parent: { firstName: 'Jane', surname: 'Smith', phone: WA_ID },
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'onboard_resume');

      // Should send the email prompt
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('email'),
        TENANT_ID,
      );
    });

    it('should allow restart from onboard_restart and begin fresh', async () => {
      state.create({
        currentStep: 'CHILD_DOB',
        collectedData: {
          parent: { firstName: 'Jane', surname: 'Smith' },
          children: [{ firstName: 'Lily' }],
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'onboard_restart');

      // Should send welcome message again
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Welcome'),
        TENANT_ID,
      );
    });

    it('should abandon session on onboard_cancel and send cancellation', async () => {
      state.create({
        currentStep: 'PARENT_NAME',
        collectedData: {},
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'onboard_cancel');

      expect(
        mocks.mockPrisma.whatsAppOnboardingSession.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ABANDONED',
          }),
        }),
      );
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('cancelled'),
        TENANT_ID,
      );
    });
  });

  // ==========================================
  // TASK-WA-013: Edit flow from confirmation
  // ==========================================

  describe('Edit flow from confirmation', () => {
    it('should redirect to PARENT_NAME when edit_parent selected', async () => {
      state.create({
        currentStep: 'CONFIRMATION',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
          emergencyContact: {
            name: 'John',
            phone: '+27829876543',
            relationship: 'parent',
          },
          communicationPrefs: { whatsapp: true, email: true },
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'edit_parent');

      // Should advance to PARENT_NAME step
      expect(
        mocks.mockPrisma.whatsAppOnboardingSession.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'PARENT_NAME',
          }),
        }),
      );
    });

    it('should redirect to CHILD_NAME when edit_child selected', async () => {
      state.create({
        currentStep: 'CONFIRMATION',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
          emergencyContact: {
            name: 'John',
            phone: '+27829876543',
            relationship: 'parent',
          },
          communicationPrefs: { whatsapp: true, email: true },
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'edit_child');

      expect(
        mocks.mockPrisma.whatsAppOnboardingSession.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: 'CHILD_NAME',
          }),
        }),
      );
    });

    it('should show list picker when "edit" selected at confirmation', async () => {
      state.create({
        currentStep: 'CONFIRMATION',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
          emergencyContact: {
            name: 'John',
            phone: '+27829876543',
            relationship: 'parent',
          },
          communicationPrefs: { whatsapp: true, email: true },
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'confirm_edit');

      expect(mocks.mockContentService.sendListPicker).toHaveBeenCalledWith(
        WA_ID,
        'What would you like to edit?',
        'Select Section',
        expect.arrayContaining([
          expect.objectContaining({ id: 'edit_parent' }),
          expect.objectContaining({ id: 'edit_child' }),
          expect.objectContaining({ id: 'edit_emergency' }),
        ]),
        TENANT_ID,
      );
    });
  });

  // ==========================================
  // TASK-WA-014: Admin notification on completion
  // ==========================================

  describe('Admin notification on completion', () => {
    it('should query admin users after successful completion', async () => {
      state.create({
        currentStep: 'CONFIRMATION',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
          emergencyContact: {
            name: 'John',
            phone: '+27829876543',
            relationship: 'parent',
          },
          popiaConsent: true,
          feeAcknowledged: true,
          communicationPrefs: { whatsapp: true, email: true },
        },
      });

      await handler.handleMessage(WA_ID, TENANT_ID, 'confirm');

      expect(mocks.mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          role: { in: ['ADMIN', 'OWNER'] },
          isActive: true,
        },
        select: { email: true, name: true },
      });
    });

    it('should not fail completion if admin notification throws', async () => {
      mocks.mockPrisma.user.findMany.mockRejectedValue(
        new Error('User table error'),
      );

      state.create({
        currentStep: 'CONFIRMATION',
        collectedData: {
          parent: {
            firstName: 'Jane',
            surname: 'Smith',
            email: 'jane@example.com',
            phone: WA_ID,
          },
          children: [{ firstName: 'Lily', dateOfBirth: '2023-06-15' }],
          emergencyContact: {
            name: 'John',
            phone: '+27829876543',
            relationship: 'parent',
          },
          popiaConsent: true,
          feeAcknowledged: true,
          communicationPrefs: { whatsapp: true, email: true },
        },
      });

      // Should not throw - admin notification failure is caught
      await handler.handleMessage(WA_ID, TENANT_ID, 'confirm');

      // Parent should still have been created
      expect(mocks.mockPrisma.parent.create).toHaveBeenCalled();
      // Confirmation message should still have been sent
      expect(mocks.mockContentService.sendSessionMessage).toHaveBeenCalledWith(
        WA_ID,
        expect.stringContaining('Registration complete'),
        TENANT_ID,
      );
    });
  });
});
