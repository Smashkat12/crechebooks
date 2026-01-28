/**
 * WelcomePackDeliveryService Integration Tests
 * TASK-ENROL-008: Welcome Pack Delivery Integration
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 * Only external services (Email) are mocked as they require real API credentials
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  WelcomePackDeliveryService,
  WelcomePackDeliveryResult,
} from '../../../src/database/services/welcome-pack-delivery.service';
import { ParentWelcomePackPdfService } from '../../../src/database/services/parent-welcome-pack-pdf.service';
import { EmailTemplateService } from '../../../src/common/services/email-template/email-template.service';
import { EmailService } from '../../../src/integrations/email/email.service';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';
import {
  Tenant,
  Parent,
  Child,
  FeeStructure,
  Enrollment,
} from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

/**
 * Mock EmailTemplateService - template rendering requires filesystem templates
 * that are not available in the test environment.
 * NOTE: This is a SERVICE mock for infrastructure dependency, not a DATA mock.
 */
const createMockEmailTemplateService = () => ({
  renderWelcomePackEmail: jest.fn().mockImplementation((data: any) => ({
    text: `Welcome ${data.childName} to ${data.tenantName}! Starting ${data.startDate}. Fee: R${(data.monthlyFeeCents / 100).toFixed(2)}.`,
    html: `<p>Welcome ${data.childName} to ${data.tenantName}!</p>`,
    subject: `Welcome Pack - ${data.childName} - ${data.tenantName}`,
  })),
  onModuleInit: jest.fn(),
});

/**
 * Mock EmailService - external SMTP/Mailgun integration
 * NOTE: This is a SERVICE mock for external API, not a DATA mock.
 */
const createMockEmailService = () => ({
  sendEmailWithOptions: jest.fn().mockResolvedValue({
    messageId: 'test-msg-123',
    status: 'sent',
  }),
  sendEmail: jest.fn().mockResolvedValue({
    messageId: 'test-msg-123',
    status: 'sent',
  }),
  isValidEmail: jest.fn().mockReturnValue(true),
  isConfigured: jest.fn().mockReturnValue(true),
});

/**
 * Mock ParentWelcomePackPdfService - generates PDF
 * We mock this to avoid PDF generation overhead in tests
 */
const createMockPdfService = () => ({
  generateWelcomePack: jest.fn().mockResolvedValue({
    pdfBuffer: Buffer.from('mock-pdf-content'),
    generatedAt: new Date(),
  }),
});

describe('WelcomePackDeliveryService', () => {
  let service: WelcomePackDeliveryService;
  let prisma: PrismaService;
  let enrollmentRepo: EnrollmentRepository;
  let mockEmailService: ReturnType<typeof createMockEmailService>;
  let mockPdfService: ReturnType<typeof createMockPdfService>;
  let mockEmailTemplateService: ReturnType<typeof createMockEmailTemplateService>;

  // Test data
  let testTenant: Tenant;
  let testParentWithEmail: Parent;
  let testParentNoEmail: Parent;
  let testChild1: Child;
  let testChild2: Child;
  let testFeeStructure: FeeStructure;
  let testEnrollment: Enrollment;
  let testEnrollmentNoEmail: Enrollment;

  beforeAll(async () => {
    mockEmailService = createMockEmailService();
    mockPdfService = createMockPdfService();
    mockEmailTemplateService = createMockEmailTemplateService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        WelcomePackDeliveryService,
        // Mock EmailTemplateService - requires filesystem templates not available in tests
        { provide: EmailTemplateService, useValue: mockEmailTemplateService },
        EnrollmentRepository,
        ChildRepository,
        ParentRepository,
        FeeStructureRepository,
        TenantRepository,
        // Mock external services
        { provide: EmailService, useValue: mockEmailService },
        { provide: ParentWelcomePackPdfService, useValue: mockPdfService },
      ],
    }).compile();

    service = module.get<WelcomePackDeliveryService>(
      WelcomePackDeliveryService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    enrollmentRepo = module.get<EnrollmentRepository>(EnrollmentRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockEmailService.sendEmailWithOptions.mockResolvedValue({
      messageId: 'test-msg-123',
      status: 'sent',
    });
    mockPdfService.generateWelcomePack.mockResolvedValue({
      pdfBuffer: Buffer.from('mock-pdf-content'),
      generatedAt: new Date(),
    });

    await cleanDatabase(prisma);

    const timestamp = Date.now();

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Welcome Pack Test Creche',
        tradingName: 'Little Stars Academy',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `welcomepack${timestamp}@test.co.za`,
        taxStatus: TaxStatus.NOT_REGISTERED,
        invoiceDayOfMonth: 1,
        invoiceDueDays: 7,
      },
    });

    // Create test parent with email
    testParentWithEmail = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Doe',
        email: `johndoe${timestamp}@test.com`,
        phone: '0821234567',
      },
    });

    // Create test parent without email
    testParentNoEmail = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Jane',
        lastName: 'NoEmail',
        phone: '0829876543',
        // No email set
      },
    });

    // Create test children
    testChild1 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParentWithEmail.id,
        firstName: 'Little',
        lastName: 'Star',
        dateOfBirth: new Date('2020-05-15'),
      },
    });

    testChild2 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParentNoEmail.id,
        firstName: 'No',
        lastName: 'Contact',
        dateOfBirth: new Date('2020-08-20'),
      },
    });

    // Create test fee structure
    testFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Full Day Care',
        feeType: 'FULL_DAY',
        amountCents: 350000, // R3,500
        registrationFeeCents: 50000, // R500
        effectiveFrom: new Date('2025-01-01'),
        vatInclusive: true,
      },
    });

    // Create test enrollment with email-enabled parent
    testEnrollment = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild1.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2025-06-01'),
        status: EnrollmentStatus.ACTIVE,
      },
    });

    // Create test enrollment with no-email parent
    testEnrollmentNoEmail = await prisma.enrollment.create({
      data: {
        tenantId: testTenant.id,
        childId: testChild2.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2025-06-01'),
        status: EnrollmentStatus.ACTIVE,
      },
    });
  });

  describe('sendWelcomePack', () => {
    it('should send email with PDF attachment on success', async () => {
      const result = await service.sendWelcomePack(
        testTenant.id,
        testEnrollment.id,
      );

      expect(result.success).toBe(true);
      expect(result.sentAt).toBeInstanceOf(Date);
      expect(result.recipientEmail).toBe(testParentWithEmail.email);
      expect(result.error).toBeUndefined();

      // Verify PDF was generated
      expect(mockPdfService.generateWelcomePack).toHaveBeenCalledWith(
        testEnrollment.id,
        testTenant.id,
      );

      // Verify email was sent with attachment
      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledTimes(1);
      const emailCall = mockEmailService.sendEmailWithOptions.mock.calls[0][0];
      expect(emailCall.to).toBe(testParentWithEmail.email);
      expect(emailCall.attachments).toHaveLength(1);
      expect(emailCall.attachments[0].filename).toContain('Welcome_Pack');
      expect(emailCall.attachments[0].contentType).toBe('application/pdf');
    });

    it('should update welcomePackSentAt on success', async () => {
      const result = await service.sendWelcomePack(
        testTenant.id,
        testEnrollment.id,
      );

      expect(result.success).toBe(true);

      // Verify enrollment was updated
      const updatedEnrollment = await enrollmentRepo.findById(
        testEnrollment.id,
        testTenant.id,
      );
      expect(updatedEnrollment?.welcomePackSentAt).toBeTruthy();
      expect(updatedEnrollment?.welcomePackSentAt).toEqual(result.sentAt);
    });

    it('should return error when email service fails (does not throw)', async () => {
      mockEmailService.sendEmailWithOptions.mockRejectedValueOnce(
        new Error('SMTP connection failed'),
      );

      const result = await service.sendWelcomePack(
        testTenant.id,
        testEnrollment.id,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP connection failed');
      expect(result.sentAt).toBeUndefined();
      expect(result.recipientEmail).toBeUndefined();

      // Verify welcomePackSentAt was NOT updated
      const enrollment = await enrollmentRepo.findById(
        testEnrollment.id,
        testTenant.id,
      );
      expect(enrollment?.welcomePackSentAt).toBeNull();
    });

    it('should handle missing parent email gracefully', async () => {
      const result = await service.sendWelcomePack(
        testTenant.id,
        testEnrollmentNoEmail.id,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('no email address');

      // Email should not have been called
      expect(mockEmailService.sendEmailWithOptions).not.toHaveBeenCalled();
    });

    it('should handle non-existent enrollment', async () => {
      const result = await service.sendWelcomePack(
        testTenant.id,
        'non-existent-enrollment-id',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle enrollment from different tenant', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '999 Other Street',
          city: 'Other City',
          province: 'Other Province',
          postalCode: '9999',
          phone: '+27999999999',
          email: `other${Date.now()}@test.co.za`,
          taxStatus: TaxStatus.NOT_REGISTERED,
        },
      });

      // Try to access testEnrollment with wrong tenant
      const result = await service.sendWelcomePack(
        otherTenant.id,
        testEnrollment.id,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should include correct child name in email subject', async () => {
      await service.sendWelcomePack(testTenant.id, testEnrollment.id);

      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledTimes(1);
      const emailCall = mockEmailService.sendEmailWithOptions.mock.calls[0][0];

      // Subject should contain child's name
      expect(emailCall.subject).toContain('Little Star');
    });

    it('should include tags and custom variables for tracking', async () => {
      await service.sendWelcomePack(testTenant.id, testEnrollment.id);

      const emailCall = mockEmailService.sendEmailWithOptions.mock.calls[0][0];

      expect(emailCall.tags).toContain('welcome-pack');
      expect(emailCall.tags).toContain('enrollment');
      expect(emailCall.customVariables).toBeDefined();
      expect(emailCall.customVariables.enrollmentId).toBe(testEnrollment.id);
      expect(emailCall.customVariables.childId).toBe(testChild1.id);
      expect(emailCall.customVariables.parentId).toBe(testParentWithEmail.id);
    });

    it('should handle PDF generation failure', async () => {
      mockPdfService.generateWelcomePack.mockRejectedValueOnce(
        new Error('PDF generation failed'),
      );

      const result = await service.sendWelcomePack(
        testTenant.id,
        testEnrollment.id,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF generation failed');

      // Email should not have been sent
      expect(mockEmailService.sendEmailWithOptions).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should allow resending welcome pack (updates timestamp)', async () => {
      // First send
      const result1 = await service.sendWelcomePack(
        testTenant.id,
        testEnrollment.id,
      );
      expect(result1.success).toBe(true);

      const enrollment1 = await enrollmentRepo.findById(
        testEnrollment.id,
        testTenant.id,
      );
      const firstSentAt = enrollment1?.welcomePackSentAt;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second send (resend)
      const result2 = await service.sendWelcomePack(
        testTenant.id,
        testEnrollment.id,
      );
      expect(result2.success).toBe(true);

      const enrollment2 = await enrollmentRepo.findById(
        testEnrollment.id,
        testTenant.id,
      );
      const secondSentAt = enrollment2?.welcomePackSentAt;

      // Timestamp should be updated
      expect(secondSentAt).not.toEqual(firstSentAt);

      // Email should have been called twice
      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledTimes(2);
    });
  });
});
