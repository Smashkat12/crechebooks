/**
 * SimplePay Webhook Controller Tests
 * TASK-SPAY-009: SimplePay Webhook Handler
 * TASK-SEC-102: Unified Webhook Signature Validation
 *
 * Note: Signature verification is tested separately in webhook-signature.guard.spec.ts
 * These tests focus on the controller logic after signature validation passes.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SimplePayWebhookController } from '../../../src/integrations/simplepay/simplepay-webhook.controller';
import { SimplePayWebhookService } from '../../../src/integrations/simplepay/simplepay-webhook.service';
import { WebhookSignatureGuard } from '../../../src/webhooks/guards/webhook-signature.guard';
import type { SimplePayWebhookPayload } from '../../../src/integrations/simplepay/dto/simplepay-webhook.dto';

describe('SimplePayWebhookController', () => {
  let controller: SimplePayWebhookController;
  let webhookService: jest.Mocked<SimplePayWebhookService>;

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
    const mockWebhookService = {
      verifySignature: jest.fn(),
      isAlreadyProcessed: jest.fn(),
      logWebhook: jest.fn(),
      resolveTenantId: jest.fn(),
      processWebhook: jest.fn(),
    };

    // Mock ConfigService to provide webhook secret
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') {
          return 'test-secret';
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimplePayWebhookController],
      providers: [
        { provide: SimplePayWebhookService, useValue: mockWebhookService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Reflector, useValue: new Reflector() },
        WebhookSignatureGuard,
      ],
    })
      // Override the guard to bypass signature verification in these tests
      // Signature verification is tested in webhook-signature.guard.spec.ts
      .overrideGuard(WebhookSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SimplePayWebhookController>(
      SimplePayWebhookController,
    );
    webhookService = module.get(SimplePayWebhookService);
  });

  describe('handleWebhook', () => {
    const createMockRequest = (body: SimplePayWebhookPayload) => ({
      rawBody: Buffer.from(JSON.stringify(body)),
    });

    it('should process valid webhook and return acknowledgment', async () => {
      const payload: SimplePayWebhookPayload = {
        event: 'payrun.completed',
        delivery_id: deliveryId,
        timestamp: new Date().toISOString(),
        client_id: clientId,
        data: {},
      };

      webhookService.isAlreadyProcessed.mockResolvedValue(false);
      webhookService.resolveTenantId.mockResolvedValue(tenantId);
      webhookService.logWebhook.mockResolvedValue(mockWebhookLog);
      webhookService.processWebhook.mockResolvedValue();

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result).toEqual({
        received: true,
        webhookLogId: mockWebhookLog.id,
      });
      expect(webhookService.logWebhook).toHaveBeenCalledWith(payload, tenantId);
    });

    it('should return early for duplicate webhooks', async () => {
      const payload: SimplePayWebhookPayload = {
        event: 'payrun.completed',
        delivery_id: deliveryId,
        timestamp: new Date().toISOString(),
        client_id: clientId,
        data: {},
      };

      webhookService.isAlreadyProcessed.mockResolvedValue(true);

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result).toEqual({
        received: true,
        processed: true,
      });
      expect(webhookService.logWebhook).not.toHaveBeenCalled();
    });

    it('should handle webhooks without tenant mapping', async () => {
      const payload: SimplePayWebhookPayload = {
        event: 'payrun.completed',
        delivery_id: deliveryId,
        timestamp: new Date().toISOString(),
        client_id: 'unknown-client',
        data: {},
      };

      webhookService.isAlreadyProcessed.mockResolvedValue(false);
      webhookService.resolveTenantId.mockResolvedValue(null);
      webhookService.logWebhook.mockResolvedValue({
        ...mockWebhookLog,
        tenantId: null,
      });
      webhookService.processWebhook.mockResolvedValue();

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result).toEqual({
        received: true,
        webhookLogId: mockWebhookLog.id,
      });
      expect(webhookService.logWebhook).toHaveBeenCalledWith(
        payload,
        undefined,
      );
    });

    it('should process payrun.completed events', async () => {
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

      webhookService.isAlreadyProcessed.mockResolvedValue(false);
      webhookService.resolveTenantId.mockResolvedValue(tenantId);
      webhookService.logWebhook.mockResolvedValue(mockWebhookLog);
      webhookService.processWebhook.mockResolvedValue();

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result.received).toBe(true);
      expect(webhookService.logWebhook).toHaveBeenCalled();
    });

    it('should process payslip.created events', async () => {
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

      webhookService.isAlreadyProcessed.mockResolvedValue(false);
      webhookService.resolveTenantId.mockResolvedValue(tenantId);
      webhookService.logWebhook.mockResolvedValue({
        ...mockWebhookLog,
        eventType: 'payslip.created',
      });
      webhookService.processWebhook.mockResolvedValue();

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result.received).toBe(true);
    });

    it('should process employee.updated events', async () => {
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

      webhookService.isAlreadyProcessed.mockResolvedValue(false);
      webhookService.resolveTenantId.mockResolvedValue(tenantId);
      webhookService.logWebhook.mockResolvedValue({
        ...mockWebhookLog,
        eventType: 'employee.updated',
      });
      webhookService.processWebhook.mockResolvedValue();

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result.received).toBe(true);
    });

    it('should process employee.terminated events', async () => {
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

      webhookService.isAlreadyProcessed.mockResolvedValue(false);
      webhookService.resolveTenantId.mockResolvedValue(tenantId);
      webhookService.logWebhook.mockResolvedValue({
        ...mockWebhookLog,
        eventType: 'employee.terminated',
      });
      webhookService.processWebhook.mockResolvedValue();

      const result = await controller.handleWebhook(
        createMockRequest(payload) as any,
        payload,
      );

      expect(result.received).toBe(true);
    });
  });
});
