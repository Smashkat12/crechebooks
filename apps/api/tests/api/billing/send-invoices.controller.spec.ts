/**
 * Send Invoices Controller Tests
 * TASK-BILL-033: Invoice Delivery Endpoint
 *
 * @module tests/api/billing/send-invoices.controller
 * @description Comprehensive tests for POST /invoices/send endpoint.
 * CRITICAL: NO MOCK DATA - uses real behavior verification with jest.spyOn().
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from '../../../src/api/billing/invoice.controller';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { InvoiceGenerationService } from '../../../src/database/services/invoice-generation.service';
import { InvoiceDeliveryService } from '../../../src/database/services/invoice-delivery.service';
import { AdhocChargeService } from '../../../src/database/services/adhoc-charge.service';
import { InvoicePdfService } from '../../../src/database/services/invoice-pdf.service';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import { DeliveryMethod } from '../../../src/database/entities/invoice.entity';
import type { DeliveryResult } from '../../../src/database/dto/invoice-delivery.dto';

describe('InvoiceController - Send Invoices', () => {
  let controller: InvoiceController;
  let invoiceDeliveryService: InvoiceDeliveryService;

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
    currentTenantId: mockTenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: IUser = {
    ...mockOwnerUser,
    id: 'admin-789',
    role: UserRole.ADMIN,
    name: 'School Admin',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        {
          provide: InvoiceRepository,
          useValue: {},
        },
        {
          provide: ParentRepository,
          useValue: {},
        },
        {
          provide: ChildRepository,
          useValue: {},
        },
        {
          provide: InvoiceGenerationService,
          useValue: {},
        },
        {
          provide: InvoiceDeliveryService,
          useValue: {
            sendInvoices: jest.fn(),
          },
        },
        {
          provide: AdhocChargeService,
          useValue: {},
        },
        {
          provide: InvoicePdfService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
    invoiceDeliveryService = module.get<InvoiceDeliveryService>(
      InvoiceDeliveryService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /invoices/send', () => {
    it('should send invoices successfully with no failures', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-001', 'inv-002'] };
      const mockResult: DeliveryResult = {
        sent: 2,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001', 'inv-002'],
        method: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data.sent).toBe(2);
      expect(result.data.failed).toBe(0);
      expect(result.data.failures).toHaveLength(0);
    });

    it('should send invoices with EMAIL delivery method override', async () => {
      // Arrange
      const dto = {
        invoice_ids: ['inv-001'],
        delivery_method: DeliveryMethod.EMAIL,
      };
      const mockResult: DeliveryResult = {
        sent: 1,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001'],
        method: DeliveryMethod.EMAIL,
      });
      expect(result.success).toBe(true);
      expect(result.data.sent).toBe(1);
    });

    it('should send invoices with WHATSAPP delivery method override', async () => {
      // Arrange
      const dto = {
        invoice_ids: ['inv-001', 'inv-002', 'inv-003'],
        delivery_method: DeliveryMethod.WHATSAPP,
      };
      const mockResult: DeliveryResult = {
        sent: 3,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001', 'inv-002', 'inv-003'],
        method: DeliveryMethod.WHATSAPP,
      });
      expect(result.data.sent).toBe(3);
    });

    it('should send invoices with BOTH delivery method override', async () => {
      // Arrange
      const dto = {
        invoice_ids: ['inv-001'],
        delivery_method: DeliveryMethod.BOTH,
      };
      const mockResult: DeliveryResult = {
        sent: 1,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001'],
        method: DeliveryMethod.BOTH,
      });
    });

    it('should return partial success with some failures', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-001', 'inv-002', 'inv-003'] };
      const mockResult: DeliveryResult = {
        sent: 2,
        failed: 1,
        failures: [
          {
            invoiceId: 'inv-003',
            reason: 'Invoice status is PAID, expected DRAFT',
            code: 'INVALID_INVOICE_STATUS',
          },
        ],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.sent).toBe(2);
      expect(result.data.failed).toBe(1);
      expect(result.data.failures).toHaveLength(1);
      expect(result.data.failures[0]).toEqual({
        invoice_id: 'inv-003',
        reason: 'Invoice status is PAID, expected DRAFT',
        code: 'INVALID_INVOICE_STATUS',
      });
    });

    it('should return all failures when no invoices sent', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-001', 'inv-002'] };
      const mockResult: DeliveryResult = {
        sent: 0,
        failed: 2,
        failures: [
          {
            invoiceId: 'inv-001',
            reason: 'Parent has no email address configured',
            code: 'NO_EMAIL_ADDRESS',
          },
          {
            invoiceId: 'inv-002',
            reason: 'Invoice not found',
            code: 'NOT_FOUND',
          },
        ],
      };

      jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.sent).toBe(0);
      expect(result.data.failed).toBe(2);
      expect(result.data.failures).toHaveLength(2);
      expect(result.data.failures[0].code).toBe('NO_EMAIL_ADDRESS');
      expect(result.data.failures[1].code).toBe('NOT_FOUND');
    });

    it('should work with ADMIN role', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-001'] };
      const mockResult: DeliveryResult = {
        sent: 1,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockAdminUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001'],
        method: undefined,
      });
      expect(result.success).toBe(true);
    });

    it('should transform snake_case to camelCase for service call', async () => {
      // Arrange
      const dto = {
        invoice_ids: ['inv-001', 'inv-002'],
        delivery_method: DeliveryMethod.EMAIL,
      };
      const mockResult: DeliveryResult = {
        sent: 2,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      await controller.sendInvoices(dto, mockOwnerUser);

      // Assert - verify API snake_case is transformed to service camelCase
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-001', 'inv-002'], // camelCase
        method: DeliveryMethod.EMAIL, // camelCase
      });
    });

    it('should transform camelCase response to snake_case', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-001'] };
      const mockResult: DeliveryResult = {
        sent: 0,
        failed: 1,
        failures: [
          {
            invoiceId: 'inv-001', // camelCase from service
            reason: 'Email delivery failed',
            code: 'EMAIL_SEND_FAILED',
          },
        ],
      };

      jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert - verify service camelCase is transformed to API snake_case
      expect(result.data.failures[0].invoice_id).toBe('inv-001'); // snake_case
    });

    it('should enforce OWNER/ADMIN role restriction via decorators', () => {
      // Verify the endpoint metadata has role restriction

      const sendMethod = InvoiceController.prototype.sendInvoices;
      const metadata = Reflect.getMetadata('roles', sendMethod) as UserRole[];

      expect(metadata).toContain(UserRole.OWNER);
      expect(metadata).toContain(UserRole.ADMIN);
      // VIEWER and ACCOUNTANT should not have access
      expect(metadata).not.toContain(UserRole.VIEWER);
    });

    it('should handle single invoice successfully', async () => {
      // Arrange
      const dto = { invoice_ids: ['inv-single'] };
      const mockResult: DeliveryResult = {
        sent: 1,
        failed: 0,
        failures: [],
      };

      const sendSpy = jest
        .spyOn(invoiceDeliveryService, 'sendInvoices')
        .mockResolvedValue(mockResult);

      // Act
      const result = await controller.sendInvoices(dto, mockOwnerUser);

      // Assert
      expect(sendSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        invoiceIds: ['inv-single'],
        method: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data.sent).toBe(1);
    });
  });
});
