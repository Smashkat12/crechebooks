/**
 * InvoiceDeliveryService — staging-safety gate tests
 * AUDIT-WA-DELIVERY: Gate pushed down into sendInvoices so all callers
 * (scheduler, WA onboarding handler) get it for free.
 *
 * London-school TDD — all dependencies are mocked.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceDeliveryService } from './invoice-delivery.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ChildRepository } from '../repositories/child.repository';
import { AuditLogService } from './audit-log.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppProviderService } from '../../integrations/whatsapp/services/whatsapp-provider.service';
import { EmailTemplateService } from '../../common/services/email-template/email-template.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CommsGuardService } from '../../common/services/comms-guard/comms-guard.service';
import {
  DeliveryMethod,
  DeliveryStatus,
  InvoiceStatus,
} from '../entities/invoice.entity';
import { PreferredContact } from '../entities/parent.entity';

// ============================================
// Helpers
// ============================================

const TENANT_ID = 'tenant-abc';
const INVOICE_ID = 'inv-001';
const INVOICE_ID_2 = 'inv-002';

const buildDraftInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  tenantId: TENANT_ID,
  invoiceNumber: 'INV-2025-001',
  parentId: 'parent-1',
  childId: 'child-1',
  status: InvoiceStatus.DRAFT,
  totalCents: 150000,
  subtotalCents: 130000,
  vatCents: 20000,
  issueDate: new Date('2025-04-01'),
  dueDate: new Date('2025-04-30'),
  billingPeriodStart: new Date('2025-04-01'),
  billingPeriodEnd: new Date('2025-04-30'),
  deliveryMethod: DeliveryMethod.EMAIL,
  deliveryRetryCount: 0,
  ...overrides,
});

const buildParent = (overrides: Record<string, unknown> = {}) => ({
  id: 'parent-1',
  tenantId: TENANT_ID,
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  whatsapp: '+27821234567',
  preferredContact: PreferredContact.EMAIL,
  ...overrides,
});

const buildTenant = () => ({
  id: TENANT_ID,
  name: 'Test Creche',
  tradingName: 'Little Stars',
  email: 'admin@test.co.za',
  phone: '0211234567',
  bankName: null,
  bankAccountHolder: null,
  bankAccountNumber: null,
  bankBranchCode: null,
  bankAccountType: null,
  bankSwiftCode: null,
});

const buildChild = () => ({
  id: 'child-1',
  tenantId: TENANT_ID,
  firstName: 'Lily',
  lastName: 'Smith',
});

// ============================================
// buildModule factory
// ============================================

const buildModule = async (commsDisabled = false): Promise<TestingModule> => {
  const mockInvoiceRepo = {
    findById: jest.fn().mockResolvedValue(buildDraftInvoice()),
    update: jest.fn().mockResolvedValue(undefined),
    findByDeliveryStatus: jest.fn().mockResolvedValue([]),
    incrementDeliveryRetryCount: jest.fn().mockResolvedValue(undefined),
  };
  const mockInvoiceLineRepo = {
    findByInvoice: jest.fn().mockResolvedValue([]),
  };
  const mockParentRepo = {
    findById: jest.fn().mockResolvedValue(buildParent()),
  };
  const mockTenantRepo = {
    findById: jest.fn().mockResolvedValue(buildTenant()),
  };
  const mockChildRepo = {
    findById: jest.fn().mockResolvedValue(buildChild()),
  };
  const mockAuditLogService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };
  const mockEmailService = {
    sendEmailWithOptions: jest
      .fn()
      .mockResolvedValue({ messageId: 'msg-123', success: true }),
  };
  const mockEmailTemplateService = {
    renderInvoiceEmail: jest
      .fn()
      .mockReturnValue({ text: 'text', html: '<p>html</p>', subject: 'Inv' }),
  };
  const mockInvoicePdfService = {
    generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
  };
  const mockEventEmitter = {
    emit: jest.fn(),
  };
  const mockWAProviderService = {
    sendInvoiceNotification: jest
      .fn()
      .mockResolvedValue({ success: true, messageId: 'wamid-1' }),
  };
  const mockCommsGuard = {
    isDisabled: jest.fn().mockReturnValue(commsDisabled),
  };

  const module = await Test.createTestingModule({
    providers: [
      InvoiceDeliveryService,
      { provide: InvoiceRepository, useValue: mockInvoiceRepo },
      { provide: InvoiceLineRepository, useValue: mockInvoiceLineRepo },
      { provide: ParentRepository, useValue: mockParentRepo },
      { provide: TenantRepository, useValue: mockTenantRepo },
      { provide: ChildRepository, useValue: mockChildRepo },
      { provide: AuditLogService, useValue: mockAuditLogService },
      { provide: EmailService, useValue: mockEmailService },
      { provide: EmailTemplateService, useValue: mockEmailTemplateService },
      { provide: InvoicePdfService, useValue: mockInvoicePdfService },
      { provide: EventEmitter2, useValue: mockEventEmitter },
      { provide: WhatsAppProviderService, useValue: mockWAProviderService },
      { provide: CommsGuardService, useValue: mockCommsGuard },
    ],
  }).compile();

  return module;
};

// ============================================
// Tests
// ============================================

describe('InvoiceDeliveryService — sendInvoices staging-safety gate', () => {
  let service: InvoiceDeliveryService;

  afterEach(() => {
    delete process.env.APP_ENV;
    jest.clearAllMocks();
  });

  it('happy path (production): calls deliverInvoice and updates status to SENT', async () => {
    delete process.env.APP_ENV;
    const module = await buildModule(false);
    service = module.get<InvoiceDeliveryService>(InvoiceDeliveryService);

    const mockInvoiceRepo = module.get(InvoiceRepository) as any;
    mockInvoiceRepo.findById.mockResolvedValue(buildDraftInvoice());

    const result = await service.sendInvoices({
      tenantId: TENANT_ID,
      invoiceIds: [INVOICE_ID],
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    // repo.update called to mark SENT
    expect(mockInvoiceRepo.update).toHaveBeenCalledWith(
      INVOICE_ID,
      TENANT_ID,
      expect.objectContaining({ status: InvoiceStatus.SENT }),
    );
  });

  it('Layer 1 gate (APP_ENV=staging, COMMS_DISABLED not set): marks invoices SENT in DB without calling email/WA adapters', async () => {
    process.env.APP_ENV = 'staging';
    const module = await buildModule(false); // COMMS_DISABLED=false
    service = module.get<InvoiceDeliveryService>(InvoiceDeliveryService);

    const mockInvoiceRepo = module.get(InvoiceRepository) as any;
    const mockEmailService = module.get(EmailService) as any;
    const mockWAProviderService = module.get(WhatsAppProviderService) as any;
    const mockAuditLogService = module.get(AuditLogService) as any;

    mockInvoiceRepo.update.mockResolvedValue(undefined);

    const result = await service.sendInvoices({
      tenantId: TENANT_ID,
      invoiceIds: [INVOICE_ID, INVOICE_ID_2],
    });

    // Both invoices marked SENT
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);

    // Adapters must NOT be called
    expect(mockEmailService.sendEmailWithOptions).not.toHaveBeenCalled();
    expect(mockWAProviderService.sendInvoiceNotification).not.toHaveBeenCalled();

    // DB must be updated for each invoice
    expect(mockInvoiceRepo.update).toHaveBeenCalledWith(
      INVOICE_ID,
      TENANT_ID,
      expect.objectContaining({
        status: InvoiceStatus.SENT,
        deliveryStatus: DeliveryStatus.SENT,
        deliveredAt: expect.any(Date),
      }),
    );

    // Audit log must record suppression reason
    expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        afterValue: expect.objectContaining({
          suppressedReason: 'staging env / COMMS_DISABLED not set',
        }),
      }),
    );
  });

  it('Layer 2 gate (COMMS_DISABLED=true): proceeds to deliverInvoice — adapters handle suppression internally', async () => {
    delete process.env.APP_ENV; // not staging
    const module = await buildModule(true); // COMMS_DISABLED=true
    service = module.get<InvoiceDeliveryService>(InvoiceDeliveryService);

    const mockInvoiceRepo = module.get(InvoiceRepository) as any;
    const mockEmailService = module.get(EmailService) as any;

    mockInvoiceRepo.findById.mockResolvedValue(buildDraftInvoice());

    const result = await service.sendInvoices({
      tenantId: TENANT_ID,
      invoiceIds: [INVOICE_ID],
    });

    expect(result.sent).toBe(1);
    // Email adapter IS called (it mocks internally when COMMS_DISABLED)
    expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalled();
  });

  it('empty invoiceIds: returns zero counts without any work', async () => {
    delete process.env.APP_ENV;
    const module = await buildModule(false);
    service = module.get<InvoiceDeliveryService>(InvoiceDeliveryService);

    const result = await service.sendInvoices({
      tenantId: TENANT_ID,
      invoiceIds: [],
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
  });
});
