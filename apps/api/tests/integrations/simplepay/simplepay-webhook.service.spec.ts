/**
 * SimplePay Webhook Service Tests
 * TASK-SPAY-009: SimplePay Webhook Handler
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SimplePayWebhookService } from '../../../src/integrations/simplepay/simplepay-webhook.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { SimplePayPayslipService } from '../../../src/integrations/simplepay/simplepay-payslip.service';
import { SimplePayEmployeeService } from '../../../src/integrations/simplepay/simplepay-employee.service';
import type { SimplePayWebhookPayload } from '../../../src/integrations/simplepay/dto/simplepay-webhook.dto';

describe('SimplePayWebhookService', () => {
  let service: SimplePayWebhookService;
  let prismaService: jest.Mocked<PrismaService>;
  let configService: jest.Mocked<ConfigService>;
  let simplePayRepo: jest.Mocked<SimplePayRepository>;
  let payslipService: jest.Mocked<SimplePayPayslipService>;
  let employeeService: jest.Mocked<SimplePayEmployeeService>;

  const webhookSecret = 'test-webhook-secret';
  const tenantId = 'tenant-123';
  const clientId = 'client-456';
  const deliveryId = 'delivery-789';

  const mockWebhookLog = {
    id: 'webhook-log-123',
    tenantId,
    source: 'simplepay',
    eventType: 'payrun.completed',
    deliveryId,
    payload: {},
    processed: false,
    processedAt: null,
    error: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    // Create mock services
    const mockPrismaService = {
      webhookLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      simplePayConnection: {
        findFirst: jest.fn(),
      },
      staff: {
        update: jest.fn(),
      },
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(webhookSecret),
    };

    const mockSimplePayRepo = {
      findEmployeeMappingBySimplePayIdOnly: jest.fn(),
      updateEmployeeMappingSyncStatus: jest.fn(),
    };

    const mockPayslipService = {
      importAllPayslips: jest.fn(),
      importPayslips: jest.fn(),
    };

    const mockEmployeeService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePayWebhookService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SimplePayRepository, useValue: mockSimplePayRepo },
        { provide: SimplePayPayslipService, useValue: mockPayslipService },
        { provide: SimplePayEmployeeService, useValue: mockEmployeeService },
      ],
    }).compile();

    service = module.get<SimplePayWebhookService>(SimplePayWebhookService);
    prismaService = module.get(PrismaService);
    configService = module.get(ConfigService);
    simplePayRepo = module.get(SimplePayRepository);
    payslipService = module.get(SimplePayPayslipService);
    employeeService = module.get(SimplePayEmployeeService);

    // Default config mock
    configService.get.mockReturnValue(webhookSecret);
  });

  describe('verifySignature', () => {
    it('should return true for valid signature', () => {
      const rawBody = JSON.stringify({ event: 'test' });
      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const result = service.verifySignature(rawBody, validSignature);

      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const rawBody = JSON.stringify({ event: 'test' });
      const invalidSignature = 'invalid-signature';

      const result = service.verifySignature(rawBody, invalidSignature);

      expect(result).toBe(false);
    });

    it('should return false for missing signature', () => {
      const rawBody = JSON.stringify({ event: 'test' });

      const result = service.verifySignature(rawBody, '');

      expect(result).toBe(false);
    });

    it('should throw error when webhook secret not configured', () => {
      configService.get.mockReturnValue(undefined);

      // Create a new instance without the secret
      const serviceWithoutSecret = new SimplePayWebhookService(
        prismaService as any,
        { get: () => undefined } as any,
        simplePayRepo as any,
        payslipService as any,
        employeeService as any,
      );

      expect(() => {
        serviceWithoutSecret.verifySignature('body', 'signature');
      }).toThrow('SIMPLEPAY_WEBHOOK_SECRET not configured');
    });
  });

  describe('isAlreadyProcessed', () => {
    it('should return true if webhook already exists', async () => {
      (prismaService.webhookLog.findUnique as jest.Mock).mockResolvedValue(
        mockWebhookLog,
      );

      const result = await service.isAlreadyProcessed(deliveryId);

      expect(result).toBe(true);
      expect(prismaService.webhookLog.findUnique).toHaveBeenCalledWith({
        where: {
          source_deliveryId: {
            source: 'simplepay',
            deliveryId,
          },
        },
      });
    });

    it('should return false if webhook does not exist', async () => {
      (prismaService.webhookLog.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.isAlreadyProcessed(deliveryId);

      expect(result).toBe(false);
    });
  });

  describe('logWebhook', () => {
    it('should create webhook log entry', async () => {
      const payload: SimplePayWebhookPayload = {
        event: 'payrun.completed',
        delivery_id: deliveryId,
        timestamp: new Date().toISOString(),
        client_id: clientId,
        data: {},
      };

      (prismaService.webhookLog.create as jest.Mock).mockResolvedValue(
        mockWebhookLog,
      );

      const result = await service.logWebhook(payload, tenantId);

      expect(result).toEqual(mockWebhookLog);
      expect(prismaService.webhookLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          source: 'simplepay',
          eventType: 'payrun.completed',
          deliveryId,
          payload,
          processed: false,
        },
      });
    });
  });

  describe('resolveTenantId', () => {
    it('should return tenant ID if connection exists', async () => {
      (
        prismaService.simplePayConnection.findFirst as jest.Mock
      ).mockResolvedValue({
        tenantId,
      });

      const result = await service.resolveTenantId(clientId);

      expect(result).toBe(tenantId);
      expect(prismaService.simplePayConnection.findFirst).toHaveBeenCalledWith({
        where: {
          clientId,
          isActive: true,
        },
        select: {
          tenantId: true,
        },
      });
    });

    it('should return null if no connection exists', async () => {
      (
        prismaService.simplePayConnection.findFirst as jest.Mock
      ).mockResolvedValue(null);

      const result = await service.resolveTenantId(clientId);

      expect(result).toBeNull();
    });
  });

  describe('processWebhook', () => {
    describe('payrun.completed event', () => {
      it('should import payslips for completed pay run', async () => {
        const payload: SimplePayWebhookPayload = {
          event: 'payrun.completed',
          delivery_id: deliveryId,
          timestamp: new Date().toISOString(),
          client_id: clientId,
          data: {
            payrun_id: 'payrun-123',
            wave_id: 1,
            wave_name: 'Monthly',
            period_start: '2024-01-01',
            period_end: '2024-01-31',
            pay_date: '2024-01-25',
            employee_count: 10,
            status: 'completed',
            totals: {
              gross: 100000,
              net: 75000,
              paye: 20000,
              uif_employee: 1000,
              uif_employer: 1000,
              sdl: 1000,
            },
          },
        };

        payslipService.importAllPayslips.mockResolvedValue({
          imported: 10,
          skipped: 0,
          errors: [],
        });

        await service.processWebhook(mockWebhookLog.id, payload, tenantId);

        expect(payslipService.importAllPayslips).toHaveBeenCalledWith(
          tenantId,
          new Date('2024-01-01'),
          new Date('2024-01-31'),
        );
        expect(prismaService.webhookLog.update).toHaveBeenCalledWith({
          where: { id: mockWebhookLog.id },
          data: {
            processed: true,
            processedAt: expect.any(Date),
            error: null,
          },
        });
      });
    });

    describe('payslip.created event', () => {
      it('should import single payslip', async () => {
        const payload: SimplePayWebhookPayload = {
          event: 'payslip.created',
          delivery_id: deliveryId,
          timestamp: new Date().toISOString(),
          client_id: clientId,
          data: {
            payslip_id: 'payslip-123',
            employee_id: 'emp-456',
            payrun_id: 'payrun-123',
            period_start: '2024-01-01',
            period_end: '2024-01-31',
            gross: 10000,
            net: 7500,
            paye: 2000,
            uif_employee: 100,
            uif_employer: 100,
          },
        };

        simplePayRepo.findEmployeeMappingBySimplePayIdOnly.mockResolvedValue({
          id: 'mapping-123',
          tenantId,
          staffId: 'staff-789',
          simplePayEmployeeId: 'emp-456',
          syncStatus: 'SYNCED',
          lastSyncAt: new Date(),
          lastSyncError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        payslipService.importPayslips.mockResolvedValue([
          {
            id: 'import-123',
            tenantId,
            staffId: 'staff-789',
            simplePayPayslipId: 'payslip-123',
            payPeriodStart: new Date('2024-01-01'),
            payPeriodEnd: new Date('2024-01-31'),
            grossSalaryCents: 1000000,
            netSalaryCents: 750000,
            payeCents: 200000,
            uifEmployeeCents: 10000,
            uifEmployerCents: 10000,
            payslipData: {},
            importedAt: new Date(),
          },
        ]);

        await service.processWebhook(mockWebhookLog.id, payload, tenantId);

        expect(
          simplePayRepo.findEmployeeMappingBySimplePayIdOnly,
        ).toHaveBeenCalledWith('emp-456');
        expect(payslipService.importPayslips).toHaveBeenCalledWith(
          tenantId,
          'staff-789',
          new Date('2024-01-01'),
          new Date('2024-01-31'),
        );
      });

      it('should log warning if no mapping found', async () => {
        const payload: SimplePayWebhookPayload = {
          event: 'payslip.created',
          delivery_id: deliveryId,
          timestamp: new Date().toISOString(),
          client_id: clientId,
          data: {
            payslip_id: 'payslip-123',
            employee_id: 'unknown-emp',
            payrun_id: 'payrun-123',
            period_start: '2024-01-01',
            period_end: '2024-01-31',
            gross: 10000,
            net: 7500,
            paye: 2000,
            uif_employee: 100,
            uif_employer: 100,
          },
        };

        simplePayRepo.findEmployeeMappingBySimplePayIdOnly.mockResolvedValue(
          null,
        );

        await service.processWebhook(mockWebhookLog.id, payload, tenantId);

        expect(payslipService.importPayslips).not.toHaveBeenCalled();
      });
    });

    describe('employee.updated event', () => {
      it('should mark employee as out of sync', async () => {
        const payload: SimplePayWebhookPayload = {
          event: 'employee.updated',
          delivery_id: deliveryId,
          timestamp: new Date().toISOString(),
          client_id: clientId,
          data: {
            employee_id: 'emp-456',
            fields_changed: ['salary', 'bank_account'],
          },
        };

        simplePayRepo.findEmployeeMappingBySimplePayIdOnly.mockResolvedValue({
          id: 'mapping-123',
          tenantId,
          staffId: 'staff-789',
          simplePayEmployeeId: 'emp-456',
          syncStatus: 'SYNCED',
          lastSyncAt: new Date(),
          lastSyncError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        simplePayRepo.updateEmployeeMappingSyncStatus.mockResolvedValue({
          id: 'mapping-123',
          tenantId,
          staffId: 'staff-789',
          simplePayEmployeeId: 'emp-456',
          syncStatus: 'OUT_OF_SYNC',
          lastSyncAt: new Date(),
          lastSyncError: 'Employee updated in SimplePay: salary, bank_account',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await service.processWebhook(mockWebhookLog.id, payload, tenantId);

        expect(
          simplePayRepo.updateEmployeeMappingSyncStatus,
        ).toHaveBeenCalledWith(
          'staff-789',
          'OUT_OF_SYNC',
          'Employee updated in SimplePay: salary, bank_account',
        );
      });
    });

    describe('employee.terminated event', () => {
      it('should mark staff as terminated', async () => {
        const payload: SimplePayWebhookPayload = {
          event: 'employee.terminated',
          delivery_id: deliveryId,
          timestamp: new Date().toISOString(),
          client_id: clientId,
          data: {
            employee_id: 'emp-456',
            termination_date: '2024-02-28',
            termination_code: '1',
            termination_reason: 'Resignation',
          },
        };

        simplePayRepo.findEmployeeMappingBySimplePayIdOnly.mockResolvedValue({
          id: 'mapping-123',
          tenantId,
          staffId: 'staff-789',
          simplePayEmployeeId: 'emp-456',
          syncStatus: 'SYNCED',
          lastSyncAt: new Date(),
          lastSyncError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await service.processWebhook(mockWebhookLog.id, payload, tenantId);

        expect(prismaService.staff.update).toHaveBeenCalledWith({
          where: { id: 'staff-789' },
          data: {
            endDate: new Date('2024-02-28'),
            isActive: false,
          },
        });

        expect(
          simplePayRepo.updateEmployeeMappingSyncStatus,
        ).toHaveBeenCalledWith('staff-789', 'SYNCED', null);
      });
    });

    it('should skip processing if no tenant found', async () => {
      const payload: SimplePayWebhookPayload = {
        event: 'payrun.completed',
        delivery_id: deliveryId,
        timestamp: new Date().toISOString(),
        client_id: 'unknown-client',
        data: {},
      };

      await service.processWebhook(mockWebhookLog.id, payload, null);

      expect(payslipService.importAllPayslips).not.toHaveBeenCalled();
      expect(prismaService.webhookLog.update).toHaveBeenCalledWith({
        where: { id: mockWebhookLog.id },
        data: {
          processed: true,
          processedAt: expect.any(Date),
          error: null,
        },
      });
    });

    it('should record error if processing fails', async () => {
      const payload: SimplePayWebhookPayload = {
        event: 'payrun.completed',
        delivery_id: deliveryId,
        timestamp: new Date().toISOString(),
        client_id: clientId,
        data: {
          payrun_id: 'payrun-123',
          wave_id: 1,
          wave_name: 'Monthly',
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          pay_date: '2024-01-25',
          employee_count: 10,
          status: 'completed',
          totals: {},
        },
      };

      const error = new Error('Import failed');
      payslipService.importAllPayslips.mockRejectedValue(error);

      await service.processWebhook(mockWebhookLog.id, payload, tenantId);

      expect(prismaService.webhookLog.update).toHaveBeenCalledWith({
        where: { id: mockWebhookLog.id },
        data: {
          processed: true,
          processedAt: expect.any(Date),
          error: 'Import failed',
        },
      });
    });
  });

  describe('getPendingWebhooks', () => {
    it('should return unprocessed webhooks', async () => {
      const pendingWebhooks = [mockWebhookLog];
      (prismaService.webhookLog.findMany as jest.Mock).mockResolvedValue(
        pendingWebhooks,
      );

      const result = await service.getPendingWebhooks(100);

      expect(result).toEqual(pendingWebhooks);
      expect(prismaService.webhookLog.findMany).toHaveBeenCalledWith({
        where: {
          source: 'simplepay',
          processed: false,
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 100,
      });
    });
  });
});
