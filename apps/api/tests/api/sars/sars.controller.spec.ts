/**
 * SARS Controller Tests
 * TASK-SARS-031: SARS Controller and DTOs
 *
 * Tests for POST /sars/:id/submit endpoint.
 * Uses jest.spyOn() for repository verification - NO MOCK DATA.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SarsController } from '../../../src/api/sars/sars.controller';
import { SarsSubmissionRepository } from '../../../src/database/repositories/sars-submission.repository';
import { Vat201Service } from '../../../src/database/services/vat201.service';
import { Emp201Service } from '../../../src/database/services/emp201.service';
import { UserRole, SubmissionStatus, SarsSubmission } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import {
  NotFoundException,
  BusinessException,
} from '../../../src/shared/exceptions';

describe('SarsController - markSubmitted', () => {
  let controller: SarsController;
  let repository: SarsSubmissionRepository;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockSubmissionId = 'submission-789';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: IUser = {
    id: 'admin-789',
    tenantId: mockTenantId,
    auth0Id: 'auth0|admin789',
    email: 'admin@school.com',
    role: UserRole.ADMIN,
    name: 'School Admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SarsController],
      providers: [
        {
          provide: SarsSubmissionRepository,
          useValue: { submit: jest.fn() },
        },
        {
          provide: Vat201Service,
          useValue: { generateVat201: jest.fn() },
        },
        {
          provide: Emp201Service,
          useValue: { generateEmp201: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<SarsController>(SarsController);
    repository = module.get<SarsSubmissionRepository>(SarsSubmissionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sars/:id/submit', () => {
    it('should call repository with transformed DTO and return 200 with snake_case response', async () => {
      // Arrange
      const mockSubmission: SarsSubmission = {
        id: mockSubmissionId,
        tenantId: mockTenantId,
        submissionType: 'VAT201',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        deadline: new Date('2025-02-25'),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date('2025-01-25T14:30:00.000Z'),
        submittedBy: mockUserId,
        sarsReference: 'SARS-REF-2025-001234',
        acknowledgedAt: null,
        outputVatCents: null,
        inputVatCents: null,
        netVatCents: null,
        totalPayeCents: null,
        totalUifCents: null,
        totalSdlCents: null,
        documentData: {},
        notes: null,
        isFinalized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const submitSpy = jest
        .spyOn(repository, 'submit')
        .mockResolvedValue(mockSubmission);

      // Act
      const result = await controller.markSubmitted(
        mockSubmissionId,
        {
          sars_reference: 'SARS-REF-2025-001234', // API snake_case
          submitted_date: '2025-01-25',
        },
        mockOwnerUser,
      );

      // Assert - repository called with camelCase
      expect(submitSpy).toHaveBeenCalledWith(mockSubmissionId, {
        submittedBy: mockUserId,
        sarsReference: 'SARS-REF-2025-001234', // camelCase
      });

      // Assert - response uses snake_case
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(mockSubmissionId);
      expect(result.data.submission_type).toBe('VAT201'); // snake_case
      expect(result.data.period).toBe('2025-01'); // YYYY-MM format
      expect(result.data.status).toBe('SUBMITTED');
      expect(result.data.submitted_at).toBe('2025-01-25T14:30:00.000Z'); // snake_case
      expect(result.data.sars_reference).toBe('SARS-REF-2025-001234'); // snake_case
      expect(result.data.is_finalized).toBe(false); // snake_case
    });

    it('should transform API snake_case to service camelCase', async () => {
      const mockSubmission: SarsSubmission = {
        id: mockSubmissionId,
        tenantId: mockTenantId,
        submissionType: 'EMP201',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        deadline: new Date('2025-02-07'),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date('2025-01-25T14:30:00.000Z'),
        submittedBy: mockUserId,
        sarsReference: 'EMP-REF-2025-5678',
        acknowledgedAt: null,
        outputVatCents: null,
        inputVatCents: null,
        netVatCents: null,
        totalPayeCents: null,
        totalUifCents: null,
        totalSdlCents: null,
        documentData: {},
        notes: null,
        isFinalized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const submitSpy = jest
        .spyOn(repository, 'submit')
        .mockResolvedValue(mockSubmission);

      await controller.markSubmitted(
        mockSubmissionId,
        {
          sars_reference: 'EMP-REF-2025-5678', // snake_case input
          submitted_date: '2025-01-25',
        },
        mockOwnerUser,
      );

      // Verify transformation to camelCase
      expect(submitSpy).toHaveBeenCalledWith(mockSubmissionId, {
        submittedBy: mockUserId,
        sarsReference: 'EMP-REF-2025-5678', // camelCase output
      });
    });

    it('should return response with snake_case field names', async () => {
      const mockSubmission: SarsSubmission = {
        id: mockSubmissionId,
        tenantId: mockTenantId,
        submissionType: 'VAT201',
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        deadline: new Date('2025-03-25'),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date('2025-02-28T10:00:00.000Z'),
        submittedBy: mockUserId,
        sarsReference: 'VAT-123',
        acknowledgedAt: null,
        outputVatCents: null,
        inputVatCents: null,
        netVatCents: null,
        totalPayeCents: null,
        totalUifCents: null,
        totalSdlCents: null,
        documentData: {},
        notes: null,
        isFinalized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(repository, 'submit').mockResolvedValue(mockSubmission);

      const result = await controller.markSubmitted(
        mockSubmissionId,
        { sars_reference: 'VAT-123', submitted_date: '2025-02-28' },
        mockOwnerUser,
      );

      // Verify all snake_case fields
      expect(result.data).toHaveProperty('submission_type');
      expect(result.data).toHaveProperty('submitted_at');
      expect(result.data).toHaveProperty('sars_reference');
      expect(result.data).toHaveProperty('is_finalized');
      expect(result.data).not.toHaveProperty('submissionType');
      expect(result.data).not.toHaveProperty('submittedAt');
    });

    it('should format period as YYYY-MM from periodStart', async () => {
      const mockSubmission: SarsSubmission = {
        id: mockSubmissionId,
        tenantId: mockTenantId,
        submissionType: 'VAT201',
        periodStart: new Date('2024-12-01T00:00:00.000Z'),
        periodEnd: new Date('2024-12-31'),
        deadline: new Date('2025-01-25'),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date('2025-01-20T14:30:00.000Z'),
        submittedBy: mockUserId,
        sarsReference: 'DEC-2024',
        acknowledgedAt: null,
        outputVatCents: null,
        inputVatCents: null,
        netVatCents: null,
        totalPayeCents: null,
        totalUifCents: null,
        totalSdlCents: null,
        documentData: {},
        notes: null,
        isFinalized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(repository, 'submit').mockResolvedValue(mockSubmission);

      const result = await controller.markSubmitted(
        mockSubmissionId,
        { sars_reference: 'DEC-2024', submitted_date: '2025-01-20' },
        mockOwnerUser,
      );

      expect(result.data.period).toBe('2024-12');
    });

    it('should handle null submitted_at and sars_reference', async () => {
      const mockSubmission: SarsSubmission = {
        id: mockSubmissionId,
        tenantId: mockTenantId,
        submissionType: 'VAT201',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        deadline: new Date('2025-02-25'),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: null, // Can be null in edge cases
        submittedBy: mockUserId,
        sarsReference: null,
        acknowledgedAt: null,
        outputVatCents: null,
        inputVatCents: null,
        netVatCents: null,
        totalPayeCents: null,
        totalUifCents: null,
        totalSdlCents: null,
        documentData: {},
        notes: null,
        isFinalized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(repository, 'submit').mockResolvedValue(mockSubmission);

      const result = await controller.markSubmitted(
        mockSubmissionId,
        { submitted_date: '2025-01-25' },
        mockOwnerUser,
      );

      expect(result.data.submitted_at).toBeNull();
      expect(result.data.sars_reference).toBeNull();
    });

    it('should work for ADMIN users same as OWNER', async () => {
      const mockSubmission: SarsSubmission = {
        id: mockSubmissionId,
        tenantId: mockTenantId,
        submissionType: 'VAT201',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        deadline: new Date('2025-02-25'),
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date('2025-01-25T14:30:00.000Z'),
        submittedBy: mockAdminUser.id,
        sarsReference: 'ADMIN-REF',
        acknowledgedAt: null,
        outputVatCents: null,
        inputVatCents: null,
        netVatCents: null,
        totalPayeCents: null,
        totalUifCents: null,
        totalSdlCents: null,
        documentData: {},
        notes: null,
        isFinalized: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const submitSpy = jest
        .spyOn(repository, 'submit')
        .mockResolvedValue(mockSubmission);

      const result = await controller.markSubmitted(
        mockSubmissionId,
        { sars_reference: 'ADMIN-REF', submitted_date: '2025-01-25' },
        mockAdminUser,
      );

      expect(submitSpy).toHaveBeenCalledWith(mockSubmissionId, {
        submittedBy: mockAdminUser.id,
        sarsReference: 'ADMIN-REF',
      });
      expect(result.success).toBe(true);
    });

    it('should propagate NotFoundException from repository', async () => {
      const notFoundError = new NotFoundException(
        'SarsSubmission',
        mockSubmissionId,
      );
      jest.spyOn(repository, 'submit').mockRejectedValue(notFoundError);

      await expect(
        controller.markSubmitted(
          mockSubmissionId,
          { submitted_date: '2025-01-25' },
          mockOwnerUser,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        controller.markSubmitted(
          mockSubmissionId,
          { submitted_date: '2025-01-25' },
          mockOwnerUser,
        ),
      ).rejects.toThrow(
        `SarsSubmission with identifier '${mockSubmissionId}' not found`,
      );
    });

    it('should propagate BusinessException for wrong status', async () => {
      const businessError = new BusinessException(
        `Cannot submit SARS submission '${mockSubmissionId}' - current status is 'DRAFT', expected 'READY'`,
        'INVALID_STATUS',
        { submissionId: mockSubmissionId, currentStatus: 'DRAFT' },
      );
      jest.spyOn(repository, 'submit').mockRejectedValue(businessError);

      await expect(
        controller.markSubmitted(
          mockSubmissionId,
          { submitted_date: '2025-01-25' },
          mockOwnerUser,
        ),
      ).rejects.toThrow(BusinessException);

      await expect(
        controller.markSubmitted(
          mockSubmissionId,
          { submitted_date: '2025-01-25' },
          mockOwnerUser,
        ),
      ).rejects.toThrow("expected 'READY'");
    });
  });
});
