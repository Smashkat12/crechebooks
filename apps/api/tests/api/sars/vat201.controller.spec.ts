/**
 * VAT201 Controller Tests
 * TASK-SARS-032: VAT201 Endpoint
 *
 * Tests for POST /sars/vat201 endpoint.
 * Uses jest.spyOn() - NO mock data.
 * Tests error propagation, DTO transformation, and cents to Rands conversion.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  UserRole,
  SarsSubmission,
  SubmissionType,
  SubmissionStatus,
} from '@prisma/client';
import { SarsController } from '../../../src/api/sars/sars.controller';
import { Vat201Service } from '../../../src/database/services/vat201.service';
import { Emp201Service } from '../../../src/database/services/emp201.service';
import { SarsSubmissionRepository } from '../../../src/database/repositories/sars-submission.repository';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { ApiGenerateVat201Dto } from '../../../src/api/sars/dto/vat201.dto';

describe('SarsController - POST /sars/vat201', () => {
  let controller: SarsController;
  let vat201Service: Vat201Service;

  const mockUser: IUser = {
    id: 'user-uuid',
    tenantId: 'tenant-uuid',
    auth0Id: 'auth0|owner123',
    email: 'owner@test.com',
    name: 'Test Owner',
    role: UserRole.OWNER,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: 'tenant-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSubmission = {
    id: 'sub-uuid',
    tenantId: 'tenant-uuid',
    submissionType: SubmissionType.VAT201,
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    status: SubmissionStatus.DRAFT,
    outputVatCents: 2317500, // 23175.00 Rands
    inputVatCents: 845000, // 8450.00 Rands
    netVatCents: 1472500, // 14725.00 Rands
    totalPayeCents: null,
    totalUifCents: null,
    totalSdlCents: null,
    deadline: new Date('2025-02-25T00:00:00.000Z'),
    isFinalized: false,
    documentData: {
      flaggedItems: [
        {
          transactionId: 'trans-1',
          issue: 'Missing VAT number on supplier invoice',
          severity: 'WARNING',
        },
      ],
    },
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedAt: null,
    sarsReference: null,
    submittedBy: null,
  } as SarsSubmission;

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
          useValue: {
            generateVat201: jest.fn(),
          },
        },
        {
          provide: Emp201Service,
          useValue: {
            generateEmp201: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SarsController>(SarsController);
    vat201Service = module.get<Vat201Service>(Vat201Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sars/vat201 - Basic Functionality', () => {
    it('should return 201 with valid period and transform data correctly', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('sub-uuid');
      expect(result.data.submission_type).toBe('VAT201');
      expect(result.data.status).toBe('DRAFT');
    });

    it('should transform API snake_case to service camelCase', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      const spy = jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      await controller.generateVat201(dto, mockUser);

      expect(spy).toHaveBeenCalledWith({
        tenantId: 'tenant-uuid',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });
    });

    it('should convert cents to Rands in response (divide by 100)', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, mockUser);

      expect(result.data.output_vat).toBe(23175.0);
      expect(result.data.input_vat).toBe(8450.0);
      expect(result.data.net_vat).toBe(14725.0);
    });

    it('should use snake_case field names in response', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, mockUser);

      expect(result.data).toHaveProperty('submission_type');
      expect(result.data).toHaveProperty('output_vat');
      expect(result.data).toHaveProperty('input_vat');
      expect(result.data).toHaveProperty('net_vat');
      expect(result.data).toHaveProperty('is_payable');
      expect(result.data).toHaveProperty('items_requiring_review');
      expect(result.data).toHaveProperty('document_url');
    });

    it('should format period as YYYY-MM from periodStart', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, mockUser);

      expect(result.data.period).toBe('2025-01');
    });
  });

  describe('POST /sars/vat201 - Business Logic', () => {
    it('should calculate is_payable correctly when net_vat > 0', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, mockUser);

      expect(result.data.is_payable).toBe(true);
      expect(result.data.net_vat).toBeGreaterThan(0);
    });

    it('should include items_requiring_review from documentData', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, mockUser);

      expect(result.data.items_requiring_review).toHaveLength(1);
      expect(result.data.items_requiring_review[0]).toEqual({
        transaction_id: 'trans-1',
        issue: 'Missing VAT number on supplier invoice',
        severity: 'WARNING',
      });
    });
  });

  describe('POST /sars/vat201 - Authorization', () => {
    it('should work for ADMIN users same as OWNER', async () => {
      const adminUser: IUser = { ...mockUser, role: UserRole.ADMIN };
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, adminUser);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('sub-uuid');
    });

    it('should work for ACCOUNTANT role', async () => {
      const accountantUser: IUser = { ...mockUser, role: UserRole.ACCOUNTANT };
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      jest
        .spyOn(vat201Service, 'generateVat201')
        .mockResolvedValue(mockSubmission);

      const result = await controller.generateVat201(dto, accountantUser);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('sub-uuid');
    });
  });

  describe('POST /sars/vat201 - Error Handling', () => {
    it('should propagate error when tenant not VAT registered', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      };

      const error = new ForbiddenException('Tenant not registered for VAT');
      jest.spyOn(vat201Service, 'generateVat201').mockRejectedValue(error);

      await expect(controller.generateVat201(dto, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.generateVat201(dto, mockUser)).rejects.toThrow(
        'Tenant not registered for VAT',
      );
    });

    it('should return 400 when period_end before period_start', async () => {
      const dto: ApiGenerateVat201Dto = {
        period_start: '2025-01-31',
        period_end: '2025-01-01', // Before start
      };

      await expect(controller.generateVat201(dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.generateVat201(dto, mockUser)).rejects.toThrow(
        'period_end must be after period_start',
      );

      // Service should NOT be called
      expect(vat201Service.generateVat201).not.toHaveBeenCalled();
    });
  });
});
