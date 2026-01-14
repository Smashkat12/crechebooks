/**
 * SimplePay Bulk Operations Service Tests
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SimplePayBulkService } from '../../../src/integrations/simplepay/simplepay-bulk.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { BulkOperationLogRepository } from '../../../src/database/repositories/bulk-operation-log.repository';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { EncryptionService } from '../../../src/shared/services/encryption.service';
import {
  BulkOperationType,
  BulkOperationStatus,
  BonusType,
} from '../../../src/database/entities/bulk-operation-log.entity';
import { Tenant } from '@prisma/client';

describe('SimplePayBulkService', () => {
  let service: SimplePayBulkService;
  let prisma: PrismaService;
  let bulkOperationRepo: BulkOperationLogRepository;
  let apiClient: SimplePayApiClient;
  let tenant: Tenant;

  // Mock SimplePay bulk_input response
  const mockBulkInputResponse = {
    bulk_input: {
      processed: 3,
      successful: 2,
      failed: 1,
      results: [
        { index: 0, id: 'sp-1', success: true },
        { index: 1, id: 'sp-2', success: true },
        { index: 2, success: false, error: 'Invalid employee' },
      ],
      errors: [{ index: 2, error: 'Invalid employee', field: 'employee_id' }],
      warnings: [],
    },
  };

  const mockSuccessResponse = {
    bulk_input: {
      processed: 2,
      successful: 2,
      failed: 0,
      results: [
        { index: 0, id: 'sp-1', success: true },
        { index: 1, id: 'sp-2', success: true },
      ],
      errors: [],
      warnings: [],
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        PrismaService,
        BulkOperationLogRepository,
        SimplePayRepository,
        EncryptionService,
        ConfigService,
        {
          provide: SimplePayApiClient,
          useValue: {
            initializeForTenant: jest.fn().mockResolvedValue(undefined),
            getClientId: jest.fn().mockReturnValue('123'),
            post: jest.fn().mockResolvedValue(mockSuccessResponse),
            patch: jest.fn().mockResolvedValue({}),
          },
        },
        SimplePayBulkService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    bulkOperationRepo = module.get<BulkOperationLogRepository>(
      BulkOperationLogRepository,
    );
    apiClient = module.get<SimplePayApiClient>(SimplePayApiClient);
    service = module.get<SimplePayBulkService>(SimplePayBulkService);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Clean database in FK order
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.profileMappingSync.deleteMany({});
    await prisma.servicePeriodSync.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staffOffboarding.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Daycare',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('processBulkInput', () => {
    it('should process generic bulk input', async () => {
      const request = {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'BONUS',
            value: 5000,
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            itemCode: 'BONUS',
            value: 3000,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.processBulkInput(tenant.id, request);

      expect(result).toBeDefined();
      expect(result.operationType).toBe(BulkOperationType.GENERIC_INPUT);
      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
      expect(result.totalEntities).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(apiClient.post).toHaveBeenCalled();
    });

    it('should create operation log', async () => {
      const request = {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'DEDUCTION',
            value: 1000,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.processBulkInput(tenant.id, request);

      const log = await bulkOperationRepo.findById(result.operationId);
      expect(log).toBeDefined();
      expect(log?.operationType).toBe(BulkOperationType.GENERIC_INPUT);
      expect(log?.status).toBe(BulkOperationStatus.COMPLETED);
      expect(log?.executedBy).toBe('admin@test.com');
    });

    it('should handle partial failure', async () => {
      (apiClient.post as jest.Mock).mockResolvedValueOnce(
        mockBulkInputResponse,
      );

      const request = {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'BONUS',
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            itemCode: 'BONUS',
          },
          {
            employeeId: 'emp-3',
            simplePayEmployeeId: 'sp-3',
            itemCode: 'BONUS',
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.processBulkInput(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.PARTIAL_FAILURE);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle API error', async () => {
      (apiClient.post as jest.Mock).mockRejectedValueOnce(
        new Error('API connection failed'),
      );

      const request = {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'BONUS',
          },
        ],
        executedBy: 'admin@test.com',
      };

      await expect(
        service.processBulkInput(tenant.id, request),
      ).rejects.toThrow('API connection failed');

      // Check that the operation log was marked as failed
      const { data: logs } = await bulkOperationRepo.findByTenant(tenant.id);
      expect(logs[0].status).toBe(BulkOperationStatus.FAILED);
    });
  });

  describe('bulkAdjustSalaries', () => {
    it('should process salary adjustments with new salary', async () => {
      const request = {
        adjustments: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            newSalaryCents: 2500000, // R25,000
            effectiveDate: new Date('2026-02-01'),
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            newSalaryCents: 3000000, // R30,000
            effectiveDate: new Date('2026-02-01'),
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkAdjustSalaries(tenant.id, request);

      expect(result.operationType).toBe(BulkOperationType.SALARY_ADJUSTMENT);
      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
      expect(result.successCount).toBe(2);
    });

    it('should process percentage adjustments', async () => {
      const request = {
        adjustments: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            adjustmentPercentage: 5, // 5% increase
            effectiveDate: new Date('2026-02-01'),
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkAdjustSalaries(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);

      // Verify the API was called with the percentage
      expect(apiClient.post).toHaveBeenCalled();
      const postCall = (apiClient.post as jest.Mock).mock.calls[0];
      expect(postCall[1].entities[0].value).toBe(5);
    });

    it('should validate that only one adjustment type is specified', async () => {
      const request = {
        adjustments: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            newSalaryCents: 2500000,
            adjustmentPercentage: 5, // Both specified - should fail validation
            effectiveDate: new Date('2026-02-01'),
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkAdjustSalaries(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.FAILED);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('VALIDATION_ERROR');
    });

    it('should validate that at least one adjustment type is specified', async () => {
      const request = {
        adjustments: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            effectiveDate: new Date('2026-02-01'),
            // No adjustment specified
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkAdjustSalaries(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.FAILED);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('distributeBonuses', () => {
    it('should distribute annual bonuses', async () => {
      const request = {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 1000000, // R10,000
            bonusType: BonusType.ANNUAL,
            description: 'Annual bonus 2025',
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            amountCents: 800000, // R8,000
            bonusType: BonusType.ANNUAL,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.distributeBonuses(tenant.id, request);

      expect(result.operationType).toBe(BulkOperationType.BONUS_DISTRIBUTION);
      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
      expect(result.successCount).toBe(2);
    });

    it('should distribute 13th cheque bonuses', async () => {
      const request = {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 2500000, // R25,000
            bonusType: BonusType.THIRTEENTH_CHEQUE,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.distributeBonuses(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);

      // Verify correct item code was used
      const postCall = (apiClient.post as jest.Mock).mock.calls[0];
      expect(postCall[1].entities[0].item_code).toBe('13THC');
    });

    it('should distribute performance bonuses', async () => {
      const request = {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 500000, // R5,000
            bonusType: BonusType.PERFORMANCE,
            description: 'Q4 Performance bonus',
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.distributeBonuses(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
    });

    it('should validate bonus amount is positive', async () => {
      const request = {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 0, // Invalid - must be > 0
            bonusType: BonusType.ANNUAL,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.distributeBonuses(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.FAILED);
      expect(result.errors[0].errorCode).toBe('VALIDATION_ERROR');
    });

    it('should target specific payslip', async () => {
      const request = {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 500000,
            bonusType: BonusType.DISCRETIONARY,
            payslipId: 'payslip-123',
          },
        ],
        payslipId: 'payslip-default', // Default payslip
        executedBy: 'admin@test.com',
      };

      const result = await service.distributeBonuses(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);

      // Verify payslip ID was included
      const postCall = (apiClient.post as jest.Mock).mock.calls[0];
      expect(postCall[1].entities[0].payslip_id).toBe('payslip-123');
    });
  });

  describe('setupBulkDeductions', () => {
    it('should setup recurring deductions', async () => {
      const request = {
        deductions: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            deductionCode: 'LOAN',
            deductionName: 'Car Loan',
            amountCents: 150000, // R1,500
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            isRecurring: true,
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            deductionCode: 'MED',
            deductionName: 'Medical Aid',
            amountCents: 200000, // R2,000
            startDate: new Date('2026-01-01'),
            isRecurring: true,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.setupBulkDeductions(tenant.id, request);

      expect(result.operationType).toBe(BulkOperationType.DEDUCTION_SETUP);
      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
      expect(result.successCount).toBe(2);
    });

    it('should setup percentage-based deductions', async () => {
      const request = {
        deductions: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            deductionCode: 'PENSION',
            deductionName: 'Pension Fund',
            percentage: 7.5, // 7.5%
            startDate: new Date('2026-01-01'),
            isRecurring: true,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.setupBulkDeductions(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);

      // Verify percentage was passed
      const postCall = (apiClient.post as jest.Mock).mock.calls[0];
      expect(postCall[1].entities[0].value).toBe(7.5);
    });

    it('should validate that either amount or percentage is specified', async () => {
      const request = {
        deductions: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            deductionCode: 'LOAN',
            deductionName: 'Loan',
            startDate: new Date('2026-01-01'),
            isRecurring: true,
            // Neither amount nor percentage
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.setupBulkDeductions(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.FAILED);
      expect(result.errors[0].errorCode).toBe('VALIDATION_ERROR');
    });

    it('should validate that only one of amount or percentage is specified', async () => {
      const request = {
        deductions: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            deductionCode: 'LOAN',
            deductionName: 'Loan',
            amountCents: 100000,
            percentage: 5, // Both specified
            startDate: new Date('2026-01-01'),
            isRecurring: true,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.setupBulkDeductions(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.FAILED);
    });

    it('should validate end date is after start date', async () => {
      const request = {
        deductions: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            deductionCode: 'LOAN',
            deductionName: 'Loan',
            amountCents: 100000,
            startDate: new Date('2026-06-01'),
            endDate: new Date('2026-01-01'), // Before start
            isRecurring: true,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.setupBulkDeductions(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.FAILED);
      expect(result.errors[0].field).toBe('endDate');
    });
  });

  describe('bulkUpdateEmployees', () => {
    it('should update employee contact details', async () => {
      const request = {
        updates: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            updates: {
              email: 'newemail@example.com',
              mobile: '+27821234567',
            },
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            updates: {
              email: 'another@example.com',
            },
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkUpdateEmployees(tenant.id, request);

      expect(result.operationType).toBe(BulkOperationType.EMPLOYEE_UPDATE);
      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
      expect(result.successCount).toBe(2);
      expect(apiClient.patch).toHaveBeenCalledTimes(2);
    });

    it('should update employee banking details', async () => {
      const request = {
        updates: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            updates: {
              bankAccountNumber: '1234567890',
              bankBranchCode: '250655',
              bankAccountType: 'Savings',
            },
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkUpdateEmployees(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);

      // Verify bank account payload
      const patchCall = (apiClient.patch as jest.Mock).mock.calls[0];
      expect(patchCall[1].employee.bank_account).toBeDefined();
      expect(patchCall[1].employee.bank_account.account_number).toBe(
        '1234567890',
      );
    });

    it('should handle partial failure in updates', async () => {
      (apiClient.patch as jest.Mock)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Invalid employee ID'));

      const request = {
        updates: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            updates: { email: 'valid@example.com' },
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'invalid-id',
            updates: { email: 'invalid@example.com' },
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkUpdateEmployees(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.PARTIAL_FAILURE);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should process in batches to respect rate limits', async () => {
      // Create request with 15 updates (should be 2 batches of 10)
      const updates = Array.from({ length: 15 }, (_, i) => ({
        employeeId: `emp-${i}`,
        simplePayEmployeeId: `sp-${i}`,
        updates: { email: `emp${i}@example.com` },
      }));

      const request = {
        updates,
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkUpdateEmployees(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
      expect(result.successCount).toBe(15);
      expect(apiClient.patch).toHaveBeenCalledTimes(15);
    });
  });

  describe('getOperationHistory', () => {
    beforeEach(async () => {
      // Create some operations
      await service.processBulkInput(tenant.id, {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'BONUS',
          },
        ],
        executedBy: 'admin@test.com',
      });

      await service.distributeBonuses(tenant.id, {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 100000,
            bonusType: BonusType.ANNUAL,
          },
        ],
        executedBy: 'admin@test.com',
      });
    });

    it('should return operation history', async () => {
      const { data, total } = await service.getOperationHistory(tenant.id);

      expect(data).toHaveLength(2);
      expect(total).toBe(2);
    });

    it('should filter by operation type', async () => {
      const { data, total } = await service.getOperationHistory(tenant.id, {
        operationType: BulkOperationType.BONUS_DISTRIBUTION,
      });

      expect(data).toHaveLength(1);
      expect(total).toBe(1);
      expect(data[0].operationType).toBe(BulkOperationType.BONUS_DISTRIBUTION);
    });
  });

  describe('getOperationLog', () => {
    it('should return specific operation log', async () => {
      const result = await service.processBulkInput(tenant.id, {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'BONUS',
          },
        ],
        executedBy: 'admin@test.com',
      });

      const log = await service.getOperationLog(result.operationId);

      expect(log).toBeDefined();
      expect(log.id).toBe(result.operationId);
    });
  });

  describe('getOperationStats', () => {
    beforeEach(async () => {
      // Create operations of different types
      await service.processBulkInput(tenant.id, {
        entities: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            itemCode: 'BONUS',
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            itemCode: 'BONUS',
          },
        ],
        executedBy: 'admin@test.com',
      });

      await service.distributeBonuses(tenant.id, {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 100000,
            bonusType: BonusType.ANNUAL,
          },
          {
            employeeId: 'emp-2',
            simplePayEmployeeId: 'sp-2',
            amountCents: 150000,
            bonusType: BonusType.ANNUAL,
          },
        ],
        executedBy: 'admin@test.com',
      });
    });

    it('should return operation statistics', async () => {
      const stats = await service.getOperationStats(tenant.id);

      expect(stats.totalOperations).toBe(2);
      expect(stats.totalEntitiesProcessed).toBe(4);
      expect(stats.totalSuccessful).toBeGreaterThanOrEqual(4);
      expect(stats.byOperationType[BulkOperationType.GENERIC_INPUT]).toBe(1);
      expect(stats.byOperationType[BulkOperationType.BONUS_DISTRIBUTION]).toBe(
        1,
      );
    });
  });

  describe('API call reduction', () => {
    it('should reduce API calls for bulk operations vs individual calls', async () => {
      // Simulate 100 employee bonuses
      const bonuses = Array.from({ length: 100 }, (_, i) => ({
        employeeId: `emp-${i}`,
        simplePayEmployeeId: `sp-${i}`,
        amountCents: 100000,
        bonusType: BonusType.ANNUAL,
      }));

      const request = {
        bonuses,
        executedBy: 'admin@test.com',
      };

      await service.distributeBonuses(tenant.id, request);

      // With bulk API: 1 call
      // Without bulk API: 100 calls
      // Reduction: 99%
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('South African Payroll Context', () => {
    it('should handle ZAR amounts in cents correctly', async () => {
      const request = {
        bonuses: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            amountCents: 1523475, // R15,234.75
            bonusType: BonusType.ANNUAL,
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.distributeBonuses(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);

      // Verify amount was converted to rands for API
      const postCall = (apiClient.post as jest.Mock).mock.calls[0];
      expect(postCall[1].entities[0].value).toBe(15234.75);
    });

    it('should handle negative salary adjustments', async () => {
      const request = {
        adjustments: [
          {
            employeeId: 'emp-1',
            simplePayEmployeeId: 'sp-1',
            adjustmentPercentage: -10, // 10% decrease
            effectiveDate: new Date('2026-02-01'),
          },
        ],
        executedBy: 'admin@test.com',
      };

      const result = await service.bulkAdjustSalaries(tenant.id, request);

      expect(result.status).toBe(BulkOperationStatus.COMPLETED);
    });
  });
});
