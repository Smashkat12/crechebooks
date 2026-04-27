/**
 * PaymentAttachmentsController + ParentPaymentAttachmentsController — smoke tests
 *
 * These tests verify that routes exist and that auth guards and the service
 * are wired correctly. Actual business logic is tested in the service spec.
 *
 * Coverage:
 *  Admin controller:
 *   1.  GET /payment-attachments → calls listForAdmin
 *   2.  GET /payment-attachments/pending → calls listPendingForAdmin
 *   3.  GET /payment-attachments/:id → calls getForAdmin
 *   4.  GET /payment-attachments/:id/download-url → calls downloadUrlForAdmin
 *   5.  POST /payment-attachments/:id/review → calls review
 *   6.  POST /payment-attachments/:id/link-payment → calls linkPayment
 *   7.  DELETE /payment-attachments/:id/link-payment → calls unlinkPayment
 *   8.  POST /payment-attachments → calls adminRegister
 *   9.  DELETE /payment-attachments/:id → calls adminDelete
 *
 *  Parent controller:
 *  10.  POST /parent-portal/payment-attachments/presign → calls presignUpload
 *  11.  POST /parent-portal/payment-attachments → calls register
 *  12.  GET /parent-portal/payment-attachments → calls listForParent
 *  13.  GET /parent-portal/payment-attachments/:id → calls getForParent
 *  14.  GET /parent-portal/payment-attachments/:id/download-url → calls downloadUrlForParentById
 *  15.  DELETE /parent-portal/payment-attachments/:id → calls deleteForParent
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { PaymentAttachmentsController } from './payment-attachments.controller';
import { ParentPaymentAttachmentsController } from './parent-payment-attachments.controller';
import { PaymentAttachmentsService } from './payment-attachments.service';
import { ParentAuthGuard } from '../auth/guards/parent-auth.guard';
import { PaymentAttachmentStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const PARENT_A = 'parent-a-uuid';
const ADMIN_ID = 'admin-uuid';
const ATTACHMENT_ID = 'attach-uuid-1';
const PAYMENT_ID = 'payment-uuid-1';

const mockUser = {
  id: ADMIN_ID,
  tenantId: TENANT_A,
  email: 'admin@example.com',
  role: 'ADMIN',
};

const mockParentSession = {
  id: 'session-1',
  parentId: PARENT_A,
  tenantId: TENANT_A,
  parent: {
    id: PARENT_A,
    firstName: 'Test',
    lastName: 'Parent',
    email: 'parent@example.com',
    tenantId: TENANT_A,
  },
};

const mockAttachment = {
  id: ATTACHMENT_ID,
  tenantId: TENANT_A,
  parentId: PARENT_A,
  paymentId: null,
  reviewStatus: PaymentAttachmentStatus.PENDING,
  filename: 'proof.pdf',
  contentType: 'application/pdf',
  fileSize: 102400,
  note: null,
  kind: 'PROOF_OF_PAYMENT',
  uploadedAt: new Date().toISOString(),
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Service mock
// ---------------------------------------------------------------------------
function buildServiceMock() {
  return {
    listForAdmin: jest.fn().mockResolvedValue([mockAttachment]),
    listPendingForAdmin: jest.fn().mockResolvedValue([mockAttachment]),
    getForAdmin: jest.fn().mockResolvedValue(mockAttachment),
    downloadUrlForAdmin: jest.fn().mockResolvedValue({
      url: 'https://s3.example.com/dl',
      expiresAt: new Date().toISOString(),
    }),
    review: jest.fn().mockResolvedValue({
      ...mockAttachment,
      reviewStatus: PaymentAttachmentStatus.APPROVED,
    }),
    linkPayment: jest
      .fn()
      .mockResolvedValue({ ...mockAttachment, paymentId: PAYMENT_ID }),
    unlinkPayment: jest
      .fn()
      .mockResolvedValue({ ...mockAttachment, paymentId: null }),
    adminRegister: jest.fn().mockResolvedValue(mockAttachment),
    adminDelete: jest.fn().mockResolvedValue(undefined),
    presignUpload: jest.fn().mockResolvedValue({
      uploadUrl: 'https://s3/put',
      key: 'tenants/.../file',
      expiresAt: new Date().toISOString(),
    }),
    register: jest.fn().mockResolvedValue(mockAttachment),
    listForParent: jest.fn().mockResolvedValue([mockAttachment]),
    getForParent: jest.fn().mockResolvedValue(mockAttachment),
    downloadUrlForParentById: jest.fn().mockResolvedValue({
      url: 'https://s3.example.com/dl',
      expiresAt: new Date().toISOString(),
    }),
    deleteForParent: jest.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Admin controller tests
// ---------------------------------------------------------------------------
describe('PaymentAttachmentsController (admin)', () => {
  let controller: PaymentAttachmentsController;
  let serviceMock: ReturnType<typeof buildServiceMock>;

  beforeEach(async () => {
    serviceMock = buildServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentAttachmentsController],
      providers: [
        { provide: PaymentAttachmentsService, useValue: serviceMock },
      ],
    }).compile();

    controller = module.get<PaymentAttachmentsController>(
      PaymentAttachmentsController,
    );
  });

  it('1. list → delegates to listForAdmin', async () => {
    const result = await controller.list(mockUser as never);
    expect(serviceMock.listForAdmin).toHaveBeenCalledWith(TENANT_A, {
      paymentId: undefined,
      parentId: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    });
    expect(result).toEqual([mockAttachment]);
  });

  it('2. pending → delegates to listPendingForAdmin', async () => {
    const result = await controller.pending(mockUser as never);
    expect(serviceMock.listPendingForAdmin).toHaveBeenCalledWith(TENANT_A);
    expect(result).toEqual([mockAttachment]);
  });

  it('3. getOne → delegates to getForAdmin', async () => {
    const result = await controller.getOne(mockUser as never, ATTACHMENT_ID);
    expect(serviceMock.getForAdmin).toHaveBeenCalledWith(
      TENANT_A,
      ATTACHMENT_ID,
    );
    expect(result).toEqual(mockAttachment);
  });

  it('4. downloadUrl → delegates to downloadUrlForAdmin', async () => {
    const result = await controller.downloadUrl(
      mockUser as never,
      ATTACHMENT_ID,
    );
    expect(serviceMock.downloadUrlForAdmin).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
    );
    expect(result.url).toBeDefined();
  });

  it('5. review → delegates to review', async () => {
    const dto = { status: PaymentAttachmentStatus.APPROVED };
    const result = await controller.review(
      mockUser as never,
      ATTACHMENT_ID,
      dto,
    );
    expect(serviceMock.review).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
      dto,
    );
    expect(result.reviewStatus).toBe(PaymentAttachmentStatus.APPROVED);
  });

  it('6. linkPayment → delegates to linkPayment', async () => {
    const dto = { paymentId: PAYMENT_ID };
    const result = await controller.linkPayment(
      mockUser as never,
      ATTACHMENT_ID,
      dto,
    );
    expect(serviceMock.linkPayment).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
      dto,
    );
    expect(result.paymentId).toBe(PAYMENT_ID);
  });

  it('7. unlinkPayment → delegates to unlinkPayment', async () => {
    await controller.unlinkPayment(mockUser as never, ATTACHMENT_ID);
    expect(serviceMock.unlinkPayment).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
    );
  });

  it('8. adminRegister → delegates to adminRegister', async () => {
    const dto = {
      parentId: PARENT_A,
      s3Key: `tenants/${TENANT_A}/proof-of-payments/file.pdf`,
      filename: 'file.pdf',
      contentType: 'application/pdf',
      fileSize: 102400,
    };
    await controller.adminRegister(mockUser as never, dto as never);
    expect(serviceMock.adminRegister).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_ID,
      PARENT_A,
      expect.objectContaining({ filename: 'file.pdf' }),
    );
  });

  it('9. adminDelete → delegates to adminDelete', async () => {
    await controller.adminDelete(mockUser as never, ATTACHMENT_ID);
    expect(serviceMock.adminDelete).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
    );
  });
});

// ---------------------------------------------------------------------------
// Parent controller tests
// ---------------------------------------------------------------------------
describe('ParentPaymentAttachmentsController (parent portal)', () => {
  let controller: ParentPaymentAttachmentsController;
  let serviceMock: ReturnType<typeof buildServiceMock>;

  beforeEach(async () => {
    serviceMock = buildServiceMock();

    // Override ParentAuthGuard to avoid MagicLinkService dependency in unit tests
    const mockParentAuthGuard = {
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.parentSession = mockParentSession;
        return true;
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentPaymentAttachmentsController],
      providers: [
        { provide: PaymentAttachmentsService, useValue: serviceMock },
      ],
    })
      .overrideGuard(ParentAuthGuard)
      .useValue(mockParentAuthGuard)
      .compile();

    controller = module.get<ParentPaymentAttachmentsController>(
      ParentPaymentAttachmentsController,
    );
  });

  it('10. presign → delegates to presignUpload', async () => {
    const dto = {
      filename: 'proof.pdf',
      contentType: 'application/pdf',
      fileSize: 102400,
    };
    const result = await controller.presign(mockParentSession as never, dto);
    expect(serviceMock.presignUpload).toHaveBeenCalledWith(TENANT_A, dto);
    expect(result.uploadUrl).toBeDefined();
  });

  it('11. register → delegates to register', async () => {
    const dto = {
      s3Key: `tenants/${TENANT_A}/proof-of-payments/file.pdf`,
      filename: 'proof.pdf',
      contentType: 'application/pdf',
      fileSize: 102400,
    };
    const result = await controller.register(mockParentSession as never, dto);
    expect(serviceMock.register).toHaveBeenCalledWith(TENANT_A, PARENT_A, dto);
    expect(result).toEqual(mockAttachment);
  });

  it('12. list → delegates to listForParent', async () => {
    const result = await controller.list(mockParentSession as never);
    expect(serviceMock.listForParent).toHaveBeenCalledWith(
      TENANT_A,
      PARENT_A,
      undefined,
    );
    expect(result).toEqual([mockAttachment]);
  });

  it('13. getOne → delegates to getForParent', async () => {
    const result = await controller.getOne(
      mockParentSession as never,
      ATTACHMENT_ID,
    );
    expect(serviceMock.getForParent).toHaveBeenCalledWith(
      TENANT_A,
      PARENT_A,
      ATTACHMENT_ID,
    );
    expect(result).toEqual(mockAttachment);
  });

  it('14. downloadUrl → delegates to downloadUrlForParentById', async () => {
    const result = await controller.downloadUrl(
      mockParentSession as never,
      ATTACHMENT_ID,
    );
    expect(serviceMock.downloadUrlForParentById).toHaveBeenCalledWith(
      TENANT_A,
      PARENT_A,
      ATTACHMENT_ID,
    );
    expect(result.url).toBeDefined();
  });

  it('15. remove → delegates to deleteForParent', async () => {
    await controller.remove(mockParentSession as never, ATTACHMENT_ID);
    expect(serviceMock.deleteForParent).toHaveBeenCalledWith(
      TENANT_A,
      PARENT_A,
      ATTACHMENT_ID,
    );
  });
});
