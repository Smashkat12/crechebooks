import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceController } from '../../../src/api/billing/invoice.controller';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { InvoiceGenerationService } from '../../../src/database/services/invoice-generation.service';
import { InvoiceDeliveryService } from '../../../src/database/services/invoice-delivery.service';
import { AdhocChargeService } from '../../../src/database/services/adhoc-charge.service';
import { InvoicePdfService } from '../../../src/database/services/invoice-pdf.service';
import type { IUser } from '../../../src/database/entities/user.entity';
import { UserRole } from '@prisma/client';
import {
  Parent,
  Child,
  Invoice,
  InvoiceStatus as PrismaInvoiceStatus,
  DeliveryMethod,
  DeliveryStatus,
  PreferredContact,
  Gender,
} from '@prisma/client';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';

describe('InvoiceController', () => {
  let controller: InvoiceController;
  let invoiceRepo: InvoiceRepository;
  let parentRepo: ParentRepository;
  let childRepo: ChildRepository;

  const mockUser: IUser = {
    id: 'user-123',
    tenantId: 'tenant-456',
    auth0Id: 'auth0|123',
    email: 'test@creche.co.za',
    name: 'Test User',
    role: UserRole.OWNER,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: 'tenant-456',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockParent: Parent = {
    id: 'parent-001',
    tenantId: 'tenant-456',
    xeroContactId: null,
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: null,
    whatsapp: null,
    preferredContact: PreferredContact.EMAIL,
    whatsappOptIn: false,
    smsOptIn: false,
    idNumber: null,
    address: null,
    notes: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockChild: Child = {
    id: 'child-001',
    tenantId: 'tenant-456',
    parentId: 'parent-001',
    firstName: 'Emma',
    lastName: 'Smith',
    dateOfBirth: new Date('2020-05-15'),
    gender: Gender.FEMALE,
    medicalNotes: null,
    emergencyContact: null,
    emergencyPhone: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockInvoice = {
    id: 'invoice-001',
    tenantId: 'tenant-456',
    xeroInvoiceId: null,
    invoiceNumber: 'INV-2025-0001',
    parentId: 'parent-001',
    childId: 'child-001',
    billingPeriodStart: new Date('2025-01-01'),
    billingPeriodEnd: new Date('2025-01-31'),
    issueDate: new Date('2025-02-01'),
    dueDate: new Date('2025-02-15'),
    subtotalCents: 500000,
    vatCents: 75000,
    vatRate: 15,
    totalCents: 575000,
    amountPaidCents: 200000,
    status: PrismaInvoiceStatus.SENT,
    deliveryMethod: DeliveryMethod.EMAIL,
    deliveryStatus: DeliveryStatus.DELIVERED,
    deliveryRetryCount: 0,
    deliveredAt: new Date('2025-02-01T10:00:00Z'),
    pdfUrl: null,
    notes: null,
    isDeleted: false,
    createdAt: new Date('2025-02-01T08:00:00Z'),
    updatedAt: new Date('2025-02-01T08:00:00Z'),
  } as unknown as Invoice;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoiceController],
      providers: [
        {
          provide: InvoiceRepository,
          useValue: {
            findByTenant: jest.fn(),
            findById: jest.fn(),
            findByIdWithLines: jest.fn(),
          },
        },
        {
          provide: ParentRepository,
          useValue: {
            findById: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ChildRepository,
          useValue: {
            findById: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: InvoiceGenerationService,
          useValue: {
            generateMonthlyInvoices: jest.fn(),
          },
        },
        {
          provide: InvoiceDeliveryService,
          useValue: {
            sendInvoices: jest.fn(),
          },
        },
        {
          provide: AdhocChargeService,
          useValue: {
            createAdhocCharge: jest.fn(),
            getAdhocCharges: jest.fn(),
          },
        },
        {
          provide: InvoicePdfService,
          useValue: {
            generateInvoicePdf: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InvoiceController>(InvoiceController);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);
    parentRepo = module.get<ParentRepository>(ParentRepository);
    childRepo = module.get<ChildRepository>(ChildRepository);
  });

  describe('listInvoices', () => {
    it('should return paginated invoices with default params', async () => {
      jest.spyOn(invoiceRepo, 'findByTenant').mockResolvedValue([mockInvoice]);
      jest.spyOn(parentRepo, 'findByIds').mockResolvedValue([mockParent]);
      jest.spyOn(childRepo, 'findByIds').mockResolvedValue([mockChild]);

      const result = await controller.listInvoices({}, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('invoice-001');
      expect(result.data[0].invoice_number).toBe('INV-2025-0001');
      expect(result.data[0].parent.name).toBe('John Smith');
      expect(result.data[0].child.name).toBe('Emma Smith');
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);

      expect(invoiceRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({ isDeleted: false }),
      );
    });

    it('should apply status filter', async () => {
      const findByTenantSpy = jest
        .spyOn(invoiceRepo, 'findByTenant')
        .mockResolvedValue([]);

      await controller.listInvoices({ status: InvoiceStatus.PAID }, mockUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          status: InvoiceStatus.PAID,
        }),
      );
    });

    it('should apply parent_id filter', async () => {
      const findByTenantSpy = jest
        .spyOn(invoiceRepo, 'findByTenant')
        .mockResolvedValue([]);

      await controller.listInvoices({ parent_id: 'parent-001' }, mockUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          parentId: 'parent-001',
        }),
      );
    });

    it('should apply child_id filter', async () => {
      const findByTenantSpy = jest
        .spyOn(invoiceRepo, 'findByTenant')
        .mockResolvedValue([]);

      await controller.listInvoices({ child_id: 'child-001' }, mockUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          childId: 'child-001',
        }),
      );
    });

    it('should apply date range filters', async () => {
      const invoice1 = {
        ...mockInvoice,
        id: 'invoice-001',
        issueDate: new Date('2025-01-15'),
      };
      const invoice2 = {
        ...mockInvoice,
        id: 'invoice-002',
        issueDate: new Date('2025-02-15'),
      };
      const invoice3 = {
        ...mockInvoice,
        id: 'invoice-003',
        issueDate: new Date('2024-12-15'),
      };

      jest
        .spyOn(invoiceRepo, 'findByTenant')
        .mockResolvedValue([invoice1, invoice2, invoice3]);
      jest.spyOn(parentRepo, 'findByIds').mockResolvedValue([mockParent]);
      jest.spyOn(childRepo, 'findByIds').mockResolvedValue([mockChild]);

      const result = await controller.listInvoices(
        {
          date_from: '2025-01-01',
          date_to: '2025-01-31',
        },
        mockUser,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('invoice-001');
    });

    it('should include parent and child summary in response', async () => {
      jest.spyOn(invoiceRepo, 'findByTenant').mockResolvedValue([mockInvoice]);
      jest.spyOn(parentRepo, 'findByIds').mockResolvedValue([mockParent]);
      jest.spyOn(childRepo, 'findByIds').mockResolvedValue([mockChild]);

      const result = await controller.listInvoices({}, mockUser);

      expect(result.data[0].parent).toEqual({
        id: 'parent-001',
        name: 'John Smith',
        email: 'john.smith@example.com',
      });
      expect(result.data[0].child).toEqual({
        id: 'child-001',
        name: 'Emma Smith',
      });
    });

    it('should convert cents to decimal amounts', async () => {
      jest.spyOn(invoiceRepo, 'findByTenant').mockResolvedValue([mockInvoice]);
      jest.spyOn(parentRepo, 'findByIds').mockResolvedValue([mockParent]);
      jest.spyOn(childRepo, 'findByIds').mockResolvedValue([mockChild]);

      const result = await controller.listInvoices({}, mockUser);

      expect(result.data[0].subtotal).toBe(5000.0);
      expect(result.data[0].vat).toBe(750.0);
      expect(result.data[0].total).toBe(5750.0);
      expect(result.data[0].amount_paid).toBe(2000.0);
      expect(result.data[0].balance_due).toBe(3750.0);
    });

    it('should enforce tenant isolation', async () => {
      const findByTenantSpy = jest
        .spyOn(invoiceRepo, 'findByTenant')
        .mockResolvedValue([]);

      const differentUser = { ...mockUser, tenantId: 'other-tenant' };
      await controller.listInvoices({}, differentUser);

      expect(findByTenantSpy).toHaveBeenCalledWith(
        'other-tenant',
        expect.any(Object),
      );
    });

    it('should format dates as YYYY-MM-DD strings', async () => {
      jest.spyOn(invoiceRepo, 'findByTenant').mockResolvedValue([mockInvoice]);
      jest.spyOn(parentRepo, 'findByIds').mockResolvedValue([mockParent]);
      jest.spyOn(childRepo, 'findByIds').mockResolvedValue([mockChild]);

      const result = await controller.listInvoices({}, mockUser);

      expect(result.data[0].billing_period_start).toBe('2025-01-01');
      expect(result.data[0].billing_period_end).toBe('2025-01-31');
      expect(result.data[0].issue_date).toBe('2025-02-01');
      expect(result.data[0].due_date).toBe('2025-02-15');
    });

    it('should apply pagination correctly', async () => {
      const invoices = Array.from({ length: 25 }, (_, i) => ({
        ...mockInvoice,
        id: `invoice-${i + 1}`,
        invoiceNumber: `INV-2025-${String(i + 1).padStart(4, '0')}`,
      }));

      jest.spyOn(invoiceRepo, 'findByTenant').mockResolvedValue(invoices);
      jest.spyOn(parentRepo, 'findByIds').mockResolvedValue([mockParent]);
      jest.spyOn(childRepo, 'findByIds').mockResolvedValue([mockChild]);

      const resultPage1 = await controller.listInvoices(
        { page: 1, limit: 10 },
        mockUser,
      );
      expect(resultPage1.data).toHaveLength(10);
      expect(resultPage1.meta.page).toBe(1);
      expect(resultPage1.meta.limit).toBe(10);
      expect(resultPage1.meta.total).toBe(25);
      expect(resultPage1.meta.totalPages).toBe(3);

      const resultPage2 = await controller.listInvoices(
        { page: 2, limit: 10 },
        mockUser,
      );
      expect(resultPage2.data).toHaveLength(10);
      expect(resultPage2.meta.page).toBe(2);

      const resultPage3 = await controller.listInvoices(
        { page: 3, limit: 10 },
        mockUser,
      );
      expect(resultPage3.data).toHaveLength(5);
      expect(resultPage3.meta.page).toBe(3);
    });
  });
});
