/**
 * PaymentAttachmentsService — unit tests
 *
 * Coverage:
 *  1.  presignUpload — happy path returns { uploadUrl, key, expiresAt }
 *  2.  register — happy path: object exists → creates row + audit CREATE
 *  3.  register — cross-tenant key → ForbiddenException
 *  4.  register — object not in S3 → UnprocessableEntityException
 *  5.  getForParent — parent owns attachment → returns row
 *  6.  getForParent — parent does not own → ForbiddenException
 *  7.  downloadUrlForParentById — parent owns → returns { url, expiresAt }
 *  8.  deleteForParent — PENDING → hard-deletes + audit DELETE (no S3 delete)
 *  9.  deleteForParent — APPROVED → BadRequestException
 * 10.  deleteForParent — other parent → ForbiddenException
 * 11.  review — PENDING → APPROVED: stamps reviewedById, reviewedAt + logUpdate
 * 12.  review — PENDING → REJECTED: same pattern
 * 13.  review — already APPROVED → BadRequestException
 * 14.  linkPayment — happy path → sets paymentId + logUpdate
 * 15.  linkPayment — idempotent: same paymentId already set → no update
 * 16.  linkPayment — payment not in tenant → NotFoundException
 * 17.  unlinkPayment — clears paymentId + logUpdate
 * 18.  adminDelete — deletes S3 object + DB row + logDelete
 * 19.  adminRegister — cross-tenant key → ForbiddenException
 * 20.  listForAdmin — applies filters (status, paymentId)
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaymentAttachmentStatus, PaymentAttachmentKind } from '@prisma/client';
import { PaymentAttachmentsService } from './payment-attachments.service';
import { PaymentAttachmentMatcherService } from './payment-attachment-matcher.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { StorageService } from '../../integrations/storage/storage.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const PARENT_A = 'parent-a-uuid';
const PARENT_B = 'parent-b-uuid';
const ADMIN_ID = 'admin-uuid';
const ATTACHMENT_ID = 'attach-uuid-1';
const PAYMENT_ID = 'payment-uuid-1';
const GOOD_KEY = `tenants/${TENANT_A}/proof-of-payments/uuid-file.pdf`;
const BAD_KEY = `tenants/${TENANT_B}/proof-of-payments/uuid-file.pdf`;

function makeAttachment(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: ATTACHMENT_ID,
    tenantId: TENANT_A,
    paymentId: null,
    parentId: PARENT_A,
    uploadedById: null,
    kind: PaymentAttachmentKind.PROOF_OF_PAYMENT,
    s3Key: GOOD_KEY,
    filename: 'proof.pdf',
    contentType: 'application/pdf',
    fileSize: 102400,
    note: null,
    reviewStatus: PaymentAttachmentStatus.PENDING,
    uploadedAt: new Date('2026-04-01T10:00:00Z'),
    reviewedAt: null,
    reviewedById: null,
    createdAt: new Date('2026-04-01T10:00:00Z'),
    updatedAt: new Date('2026-04-01T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
function buildPrismaMock() {
  return {
    paymentAttachment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    parent: {
      findFirst: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
    },
  };
}

function buildAuditMock() {
  return {
    logCreate: jest.fn().mockResolvedValue({}),
    logUpdate: jest.fn().mockResolvedValue({}),
    logDelete: jest.fn().mockResolvedValue({}),
    logAction: jest.fn().mockResolvedValue({}),
  };
}

function buildStorageMock() {
  return {
    createPresignedUploadUrl: jest.fn(),
    createPresignedDownloadUrl: jest.fn(),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    objectExists: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PaymentAttachmentsService', () => {
  let service: PaymentAttachmentsService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let audit: ReturnType<typeof buildAuditMock>;
  let storage: ReturnType<typeof buildStorageMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    audit = buildAuditMock();
    storage = buildStorageMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentAttachmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
        { provide: StorageService, useValue: storage },
        {
          provide: PaymentAttachmentMatcherService,
          useValue: { extractAndMatch: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<PaymentAttachmentsService>(PaymentAttachmentsService);
  });

  // -------------------------------------------------------------------------
  // 1. presignUpload — happy path
  // -------------------------------------------------------------------------
  it('presignUpload — returns uploadUrl, key, expiresAt', async () => {
    const fakeResult = {
      url: 'https://s3.example.com/presigned',
      key: GOOD_KEY,
      expiresAt: new Date('2026-04-01T10:15:00Z'),
    };
    storage.createPresignedUploadUrl.mockResolvedValue(fakeResult);

    const result = await service.presignUpload(TENANT_A, {
      filename: 'proof.pdf',
      contentType: 'application/pdf',
      fileSize: 102400,
    });

    expect(result.uploadUrl).toBe(fakeResult.url);
    expect(result.key).toBe(GOOD_KEY);
    expect(result.expiresAt).toBe(fakeResult.expiresAt.toISOString());
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(
      TENANT_A,
      'proof-of-payments',
      'proof.pdf',
      expect.objectContaining({ contentType: 'application/pdf' }),
    );
  });

  // -------------------------------------------------------------------------
  // 2. register — happy path
  // -------------------------------------------------------------------------
  it('register — creates row when object exists', async () => {
    const attachment = makeAttachment();
    prisma.parent.findFirst.mockResolvedValue({ id: PARENT_A });
    storage.objectExists.mockResolvedValue(true);
    prisma.paymentAttachment.create.mockResolvedValue(attachment);

    const result = await service.register(TENANT_A, PARENT_A, {
      s3Key: GOOD_KEY,
      filename: 'proof.pdf',
      contentType: 'application/pdf',
      fileSize: 102400,
    });

    expect(result.id).toBe(ATTACHMENT_ID);
    expect(result.reviewStatus).toBe(PaymentAttachmentStatus.PENDING);
    expect(audit.logCreate).toHaveBeenCalledTimes(1);
    expect(prisma.paymentAttachment.create).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 3. register — cross-tenant key → ForbiddenException
  // -------------------------------------------------------------------------
  it('register — cross-tenant key is rejected', async () => {
    await expect(
      service.register(TENANT_A, PARENT_A, {
        s3Key: BAD_KEY,
        filename: 'proof.pdf',
        contentType: 'application/pdf',
        fileSize: 102400,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.paymentAttachment.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. register — object not in S3 → UnprocessableEntityException
  // -------------------------------------------------------------------------
  it('register — object not found in S3 is rejected', async () => {
    prisma.parent.findFirst.mockResolvedValue({ id: PARENT_A });
    storage.objectExists.mockResolvedValue(false);

    await expect(
      service.register(TENANT_A, PARENT_A, {
        s3Key: GOOD_KEY,
        filename: 'proof.pdf',
        contentType: 'application/pdf',
        fileSize: 102400,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // -------------------------------------------------------------------------
  // 5. getForParent — owner gets row
  // -------------------------------------------------------------------------
  it('getForParent — parent owns attachment → returns dto', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(makeAttachment());

    const result = await service.getForParent(
      TENANT_A,
      PARENT_A,
      ATTACHMENT_ID,
    );

    expect(result.id).toBe(ATTACHMENT_ID);
    expect(result.parentId).toBe(PARENT_A);
  });

  // -------------------------------------------------------------------------
  // 6. getForParent — different parent → ForbiddenException
  // -------------------------------------------------------------------------
  it('getForParent — other parent is rejected', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(makeAttachment());

    await expect(
      service.getForParent(TENANT_A, PARENT_B, ATTACHMENT_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------------------
  // 7. downloadUrlForParentById — parent owns → url
  // -------------------------------------------------------------------------
  it('downloadUrlForParentById — parent gets presigned url', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(
      makeAttachment({ s3Key: GOOD_KEY, parentId: PARENT_A }),
    );
    storage.createPresignedDownloadUrl.mockResolvedValue(
      'https://dl.example.com/signed',
    );

    const result = await service.downloadUrlForParentById(
      TENANT_A,
      PARENT_A,
      ATTACHMENT_ID,
    );

    expect(result.url).toBe('https://dl.example.com/signed');
    expect(result.expiresAt).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 8. deleteForParent — PENDING → hard deletes
  // -------------------------------------------------------------------------
  it('deleteForParent — PENDING attachment is deleted', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        parentId: PARENT_A,
        reviewStatus: PaymentAttachmentStatus.PENDING,
      }),
    );
    prisma.paymentAttachment.delete.mockResolvedValue({});

    await service.deleteForParent(TENANT_A, PARENT_A, ATTACHMENT_ID);

    expect(prisma.paymentAttachment.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
    expect(audit.logDelete).toHaveBeenCalledTimes(1);
    // S3 object is intentionally NOT deleted
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. deleteForParent — APPROVED → BadRequestException
  // -------------------------------------------------------------------------
  it('deleteForParent — APPROVED attachment cannot be deleted by parent', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        parentId: PARENT_A,
        reviewStatus: PaymentAttachmentStatus.APPROVED,
      }),
    );

    await expect(
      service.deleteForParent(TENANT_A, PARENT_A, ATTACHMENT_ID),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.paymentAttachment.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 10. deleteForParent — other parent → ForbiddenException
  // -------------------------------------------------------------------------
  it('deleteForParent — other parent cannot delete', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(
      makeAttachment({
        parentId: PARENT_A,
        reviewStatus: PaymentAttachmentStatus.PENDING,
      }),
    );

    await expect(
      service.deleteForParent(TENANT_A, PARENT_B, ATTACHMENT_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  // -------------------------------------------------------------------------
  // 11. review — PENDING → APPROVED
  // -------------------------------------------------------------------------
  it('review — PENDING to APPROVED stamps reviewer and logs update', async () => {
    const before = makeAttachment({
      reviewStatus: PaymentAttachmentStatus.PENDING,
    });
    const after = makeAttachment({
      reviewStatus: PaymentAttachmentStatus.APPROVED,
      reviewedById: ADMIN_ID,
      reviewedAt: new Date(),
    });
    prisma.paymentAttachment.findFirst.mockResolvedValue(before);
    prisma.paymentAttachment.update.mockResolvedValue(after);

    const result = await service.review(TENANT_A, ADMIN_ID, ATTACHMENT_ID, {
      status: PaymentAttachmentStatus.APPROVED,
    });

    expect(result.reviewStatus).toBe(PaymentAttachmentStatus.APPROVED);
    expect(audit.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSummary: 'Review: PENDING → APPROVED',
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 12. review — PENDING → REJECTED
  // -------------------------------------------------------------------------
  it('review — PENDING to REJECTED', async () => {
    const before = makeAttachment({
      reviewStatus: PaymentAttachmentStatus.PENDING,
    });
    const after = makeAttachment({
      reviewStatus: PaymentAttachmentStatus.REJECTED,
      reviewedById: ADMIN_ID,
      reviewedAt: new Date(),
    });
    prisma.paymentAttachment.findFirst.mockResolvedValue(before);
    prisma.paymentAttachment.update.mockResolvedValue(after);

    const result = await service.review(TENANT_A, ADMIN_ID, ATTACHMENT_ID, {
      status: PaymentAttachmentStatus.REJECTED,
      reviewNote: 'Amount does not match',
    });

    expect(result.reviewStatus).toBe(PaymentAttachmentStatus.REJECTED);
    expect(audit.logUpdate).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 13. review — already APPROVED → BadRequestException
  // -------------------------------------------------------------------------
  it('review — already APPROVED cannot be reviewed again', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(
      makeAttachment({ reviewStatus: PaymentAttachmentStatus.APPROVED }),
    );

    await expect(
      service.review(TENANT_A, ADMIN_ID, ATTACHMENT_ID, {
        status: PaymentAttachmentStatus.REJECTED,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // -------------------------------------------------------------------------
  // 14. linkPayment — happy path
  // -------------------------------------------------------------------------
  it('linkPayment — links to payment and logs update', async () => {
    const attachment = makeAttachment({ paymentId: null });
    const updated = makeAttachment({ paymentId: PAYMENT_ID });
    prisma.paymentAttachment.findFirst.mockResolvedValue(attachment);
    prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID });
    prisma.paymentAttachment.update.mockResolvedValue(updated);

    const result = await service.linkPayment(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
      {
        paymentId: PAYMENT_ID,
      },
    );

    expect(result.paymentId).toBe(PAYMENT_ID);
    expect(audit.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ changeSummary: 'Linked to payment' }),
    );
  });

  // -------------------------------------------------------------------------
  // 15. linkPayment — idempotent
  // -------------------------------------------------------------------------
  it('linkPayment — already linked to same payment is idempotent', async () => {
    const attachment = makeAttachment({ paymentId: PAYMENT_ID });
    prisma.paymentAttachment.findFirst.mockResolvedValue(attachment);
    prisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID });

    const result = await service.linkPayment(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
      {
        paymentId: PAYMENT_ID,
      },
    );

    expect(result.paymentId).toBe(PAYMENT_ID);
    expect(prisma.paymentAttachment.update).not.toHaveBeenCalled();
    expect(audit.logUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 16. linkPayment — payment not in tenant → NotFoundException
  // -------------------------------------------------------------------------
  it('linkPayment — payment not in tenant is rejected', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(makeAttachment());
    prisma.payment.findFirst.mockResolvedValue(null); // not found

    await expect(
      service.linkPayment(TENANT_A, ADMIN_ID, ATTACHMENT_ID, {
        paymentId: PAYMENT_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // -------------------------------------------------------------------------
  // 17. unlinkPayment — clears paymentId
  // -------------------------------------------------------------------------
  it('unlinkPayment — clears paymentId and logs update', async () => {
    const attachment = makeAttachment({ paymentId: PAYMENT_ID });
    const updated = makeAttachment({ paymentId: null });
    prisma.paymentAttachment.findFirst.mockResolvedValue(attachment);
    prisma.paymentAttachment.update.mockResolvedValue(updated);

    const result = await service.unlinkPayment(
      TENANT_A,
      ADMIN_ID,
      ATTACHMENT_ID,
    );

    expect(result.paymentId).toBeNull();
    expect(audit.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ changeSummary: 'Unlinked from payment' }),
    );
  });

  // -------------------------------------------------------------------------
  // 18. adminDelete — deletes S3 + DB + audit
  // -------------------------------------------------------------------------
  it('adminDelete — deletes S3 object, DB row, and logs delete', async () => {
    prisma.paymentAttachment.findFirst.mockResolvedValue(
      makeAttachment({ s3Key: GOOD_KEY }),
    );
    prisma.paymentAttachment.delete.mockResolvedValue({});

    await service.adminDelete(TENANT_A, ADMIN_ID, ATTACHMENT_ID);

    expect(storage.deleteObject).toHaveBeenCalledWith(
      TENANT_A,
      'proof-of-payments',
      GOOD_KEY,
    );
    expect(prisma.paymentAttachment.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
    expect(audit.logDelete).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 19. adminRegister — cross-tenant key → ForbiddenException
  // -------------------------------------------------------------------------
  it('adminRegister — cross-tenant key is rejected', async () => {
    await expect(
      service.adminRegister(TENANT_A, ADMIN_ID, PARENT_A, {
        s3Key: BAD_KEY,
        filename: 'proof.pdf',
        contentType: 'application/pdf',
        fileSize: 102400,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.paymentAttachment.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 20. listForAdmin — passes filter object
  // -------------------------------------------------------------------------
  it('listForAdmin — applies paymentId and status filters', async () => {
    prisma.paymentAttachment.findMany.mockResolvedValue([makeAttachment()]);

    const result = await service.listForAdmin(TENANT_A, {
      paymentId: PAYMENT_ID,
      status: PaymentAttachmentStatus.PENDING,
    });

    expect(result).toHaveLength(1);
    expect(prisma.paymentAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          paymentId: PAYMENT_ID,
          reviewStatus: PaymentAttachmentStatus.PENDING,
        }),
      }),
    );
  });
});
