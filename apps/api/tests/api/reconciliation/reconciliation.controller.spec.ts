/**
 * Reconciliation Controller Tests
 * TASK-RECON-031: Reconciliation Controller
 *
 * Tests for POST /reconciliation endpoint.
 * Uses jest.spyOn() for service verification - NO MOCK DATA.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationController } from '../../../src/api/reconciliation/reconciliation.controller';
import { ReconciliationService } from '../../../src/database/services/reconciliation.service';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import { FinancialReportService } from '../../../src/database/services/financial-report.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { ReconcileResult } from '../../../src/database/dto/reconciliation-service.dto';
import { BusinessException, ConflictException } from '../../../src/shared/exceptions';

describe('ReconciliationController - reconcile', () => {
  let controller: ReconciliationController;
  let service: ReconciliationService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

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

  const mockAccountantUser: IUser = {
    id: 'accountant-101',
    tenantId: mockTenantId,
    auth0Id: 'auth0|accountant101',
    email: 'accountant@school.com',
    role: UserRole.ACCOUNTANT,
    name: 'School Accountant',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReconciliationController],
      providers: [
        {
          provide: ReconciliationService,
          useValue: { reconcile: jest.fn() },
        },
        {
          provide: ReconciliationRepository,
          useValue: {},
        },
        {
          provide: FinancialReportService,
          useValue: { generateIncomeStatement: jest.fn() },
        },
        {
          provide: InvoiceRepository,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<ReconciliationController>(ReconciliationController);
    service = module.get<ReconciliationService>(ReconciliationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /reconciliation', () => {
    it('should call service with transformed DTO and return 201 with snake_case response', async () => {
      // Arrange
      const mockResult: ReconcileResult = {
        id: 'recon-123',
        status: 'RECONCILED',
        openingBalanceCents: 5000000, // R50,000
        closingBalanceCents: 6250000, // R62,500
        calculatedBalanceCents: 6250000,
        discrepancyCents: 0,
        matchedCount: 45,
        unmatchedCount: 0,
      };

      const reconcileSpy = jest
        .spyOn(service, 'reconcile')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.reconcile(
        {
          bank_account: 'FNB Business Current',
          period_start: '2025-01-01',
          period_end: '2025-01-31',
          opening_balance: 50000.00,
          closing_balance: 62500.00,
        },
        mockOwnerUser,
      );

      // Assert - service called with camelCase and cents
      expect(reconcileSpy).toHaveBeenCalledWith(
        {
          tenantId: mockTenantId,
          bankAccount: 'FNB Business Current',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 5000000,
          closingBalanceCents: 6250000,
        },
        mockUserId,
      );

      // Assert - response uses snake_case and Rands
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('recon-123');
      expect(result.data.status).toBe('RECONCILED');
      expect(result.data.bank_account).toBe('FNB Business Current');
      expect(result.data.opening_balance).toBe(50000.00);
      expect(result.data.closing_balance).toBe(62500.00);
      expect(result.data.matched_count).toBe(45);
    });

    it('should transform API snake_case (bank_account) to service camelCase (bankAccount)', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-456',
        status: 'RECONCILED',
        openingBalanceCents: 1000000,
        closingBalanceCents: 1500000,
        calculatedBalanceCents: 1500000,
        discrepancyCents: 0,
        matchedCount: 10,
        unmatchedCount: 0,
      };

      const reconcileSpy = jest
        .spyOn(service, 'reconcile')
        .mockResolvedValue(mockResult);

      await controller.reconcile(
        {
          bank_account: 'Standard Bank Business', // snake_case input
          period_start: '2025-02-01',
          period_end: '2025-02-28',
          opening_balance: 10000.00,
          closing_balance: 15000.00,
        },
        mockOwnerUser,
      );

      // Verify transformation to camelCase
      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bankAccount: 'Standard Bank Business', // camelCase output
        }),
        expect.any(String),
      );
    });

    it('should transform Rands to cents for service (opening_balance * 100)', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-789',
        status: 'RECONCILED',
        openingBalanceCents: 12345600, // R123,456.00
        closingBalanceCents: 15678900, // R156,789.00
        calculatedBalanceCents: 15678900,
        discrepancyCents: 0,
        matchedCount: 20,
        unmatchedCount: 0,
      };

      const reconcileSpy = jest
        .spyOn(service, 'reconcile')
        .mockResolvedValue(mockResult);

      await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-03-01',
          period_end: '2025-03-31',
          opening_balance: 123456.00, // Rands
          closing_balance: 156789.00, // Rands
        },
        mockOwnerUser,
      );

      // Verify Rands to cents conversion (* 100)
      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          openingBalanceCents: 12345600, // cents
          closingBalanceCents: 15678900, // cents
        }),
        expect.any(String),
      );
    });

    it('should convert cents to Rands in response (divide by 100)', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-abc',
        status: 'RECONCILED',
        openingBalanceCents: 5000050, // R50,000.50
        closingBalanceCents: 6250075, // R62,500.75
        calculatedBalanceCents: 6250075,
        discrepancyCents: 0,
        matchedCount: 30,
        unmatchedCount: 0,
      };

      jest.spyOn(service, 'reconcile').mockResolvedValue(mockResult);

      const result = await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-04-01',
          period_end: '2025-04-30',
          opening_balance: 50000.50,
          closing_balance: 62500.75,
        },
        mockOwnerUser,
      );

      // Verify cents to Rands conversion (/ 100)
      expect(result.data.opening_balance).toBe(50000.50);
      expect(result.data.closing_balance).toBe(62500.75);
      expect(result.data.calculated_balance).toBe(62500.75);
      expect(result.data.discrepancy).toBe(0);
    });

    it('should return response with snake_case field names', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-def',
        status: 'RECONCILED',
        openingBalanceCents: 1000000,
        closingBalanceCents: 1200000,
        calculatedBalanceCents: 1200000,
        discrepancyCents: 0,
        matchedCount: 25,
        unmatchedCount: 0,
      };

      jest.spyOn(service, 'reconcile').mockResolvedValue(mockResult);

      const result = await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-05-01',
          period_end: '2025-05-31',
          opening_balance: 10000.00,
          closing_balance: 12000.00,
        },
        mockOwnerUser,
      );

      // Verify all snake_case fields
      expect(result.data).toHaveProperty('bank_account');
      expect(result.data).toHaveProperty('period_start');
      expect(result.data).toHaveProperty('period_end');
      expect(result.data).toHaveProperty('opening_balance');
      expect(result.data).toHaveProperty('closing_balance');
      expect(result.data).toHaveProperty('calculated_balance');
      expect(result.data).toHaveProperty('matched_count');
      expect(result.data).toHaveProperty('unmatched_count');
      // Verify camelCase NOT present
      expect(result.data).not.toHaveProperty('bankAccount');
      expect(result.data).not.toHaveProperty('periodStart');
      expect(result.data).not.toHaveProperty('openingBalance');
    });

    it('should return status RECONCILED when discrepancy is 0', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-ghi',
        status: 'RECONCILED',
        openingBalanceCents: 5000000,
        closingBalanceCents: 6000000,
        calculatedBalanceCents: 6000000,
        discrepancyCents: 0, // No discrepancy
        matchedCount: 50,
        unmatchedCount: 0,
      };

      jest.spyOn(service, 'reconcile').mockResolvedValue(mockResult);

      const result = await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-06-01',
          period_end: '2025-06-30',
          opening_balance: 50000.00,
          closing_balance: 60000.00,
        },
        mockOwnerUser,
      );

      expect(result.data.status).toBe('RECONCILED');
      expect(result.data.discrepancy).toBe(0);
    });

    it('should return status DISCREPANCY when discrepancy != 0', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-jkl',
        status: 'DISCREPANCY',
        openingBalanceCents: 5000000,
        closingBalanceCents: 6000000,
        calculatedBalanceCents: 5950000, // R59,500 vs R60,000 closing
        discrepancyCents: 5000, // R50 discrepancy
        matchedCount: 48,
        unmatchedCount: 2,
      };

      jest.spyOn(service, 'reconcile').mockResolvedValue(mockResult);

      const result = await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-07-01',
          period_end: '2025-07-31',
          opening_balance: 50000.00,
          closing_balance: 60000.00,
        },
        mockOwnerUser,
      );

      expect(result.data.status).toBe('DISCREPANCY');
      expect(result.data.discrepancy).toBe(50.00); // R50
      expect(result.data.unmatched_count).toBe(2);
    });

    it('should work for ADMIN users same as OWNER', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-mno',
        status: 'RECONCILED',
        openingBalanceCents: 2000000,
        closingBalanceCents: 2500000,
        calculatedBalanceCents: 2500000,
        discrepancyCents: 0,
        matchedCount: 15,
        unmatchedCount: 0,
      };

      const reconcileSpy = jest
        .spyOn(service, 'reconcile')
        .mockResolvedValue(mockResult);

      const result = await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-08-01',
          period_end: '2025-08-31',
          opening_balance: 20000.00,
          closing_balance: 25000.00,
        },
        mockAdminUser,
      );

      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
        }),
        mockAdminUser.id,
      );
      expect(result.success).toBe(true);
    });

    it('should work for ACCOUNTANT role', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-pqr',
        status: 'RECONCILED',
        openingBalanceCents: 3000000,
        closingBalanceCents: 3500000,
        calculatedBalanceCents: 3500000,
        discrepancyCents: 0,
        matchedCount: 20,
        unmatchedCount: 0,
      };

      const reconcileSpy = jest
        .spyOn(service, 'reconcile')
        .mockResolvedValue(mockResult);

      const result = await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-09-01',
          period_end: '2025-09-30',
          opening_balance: 30000.00,
          closing_balance: 35000.00,
        },
        mockAccountantUser,
      );

      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
        }),
        mockAccountantUser.id,
      );
      expect(result.success).toBe(true);
    });

    it('should propagate BusinessException when period_end before period_start', async () => {
      const businessError = new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        { periodStart: '2025-12-31', periodEnd: '2025-01-01' },
      );
      jest.spyOn(service, 'reconcile').mockRejectedValue(businessError);

      await expect(
        controller.reconcile(
          {
            bank_account: 'FNB',
            period_start: '2025-12-31',
            period_end: '2025-01-01', // End before start
            opening_balance: 10000.00,
            closing_balance: 15000.00,
          },
          mockOwnerUser,
        ),
      ).rejects.toThrow(BusinessException);

      await expect(
        controller.reconcile(
          {
            bank_account: 'FNB',
            period_start: '2025-12-31',
            period_end: '2025-01-01',
            opening_balance: 10000.00,
            closing_balance: 15000.00,
          },
          mockOwnerUser,
        ),
      ).rejects.toThrow('Period start must be before period end');
    });

    it('should propagate ConflictException when period already reconciled', async () => {
      const conflictError = new ConflictException(
        'Period already reconciled for bank account FNB Business Current',
        { periodStart: '2025-01-01', status: 'RECONCILED' },
      );
      jest.spyOn(service, 'reconcile').mockRejectedValue(conflictError);

      await expect(
        controller.reconcile(
          {
            bank_account: 'FNB Business Current',
            period_start: '2025-01-01',
            period_end: '2025-01-31',
            opening_balance: 50000.00,
            closing_balance: 62500.00,
          },
          mockOwnerUser,
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        controller.reconcile(
          {
            bank_account: 'FNB Business Current',
            period_start: '2025-01-01',
            period_end: '2025-01-31',
            opening_balance: 50000.00,
            closing_balance: 62500.00,
          },
          mockOwnerUser,
        ),
      ).rejects.toThrow('Period already reconciled');
    });

    it('should correctly round fractional Rands to cents', async () => {
      const mockResult: ReconcileResult = {
        id: 'recon-stu',
        status: 'RECONCILED',
        openingBalanceCents: 1234568, // Rounded from 12345.678
        closingBalanceCents: 5678912, // Rounded from 56789.123
        calculatedBalanceCents: 5678912,
        discrepancyCents: 0,
        matchedCount: 5,
        unmatchedCount: 0,
      };

      const reconcileSpy = jest
        .spyOn(service, 'reconcile')
        .mockResolvedValue(mockResult);

      await controller.reconcile(
        {
          bank_account: 'FNB',
          period_start: '2025-10-01',
          period_end: '2025-10-31',
          opening_balance: 12345.678, // Fractional
          closing_balance: 56789.123, // Fractional
        },
        mockOwnerUser,
      );

      // Verify Math.round is applied (* 100)
      expect(reconcileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          openingBalanceCents: 1234568, // 12345.678 * 100 = 1234567.8 → 1234568
          closingBalanceCents: 5678912, // 56789.123 * 100 = 5678912.3 → 5678912
        }),
        expect.any(String),
      );
    });
  });
});
