/**
 * PaymentAttachmentsService
 *
 * Owns all logic for proof-of-payment file management:
 *  - Pre-signed upload URL generation (browser-direct upload to S3)
 *  - Registration of uploaded objects (with S3 existence check)
 *  - Admin review workflow (PENDING → APPROVED | REJECTED)
 *  - Payment linking / unlinking
 *  - Presigned download URL generation (TTL 5 min)
 *  - Delete (parent: PENDING only; admin: any)
 *
 * Cross-tenant safety:
 *  StorageService.assertTenantOwnsKey enforces the key prefix.
 *  This service additionally rejects keys whose tenant segment doesn't
 *  match the request tenantId before any S3 call is made.
 *
 * TODO(future): When an attachment is APPROVED, pipe through OCR + the
 *  PaymentMatchingService at apps/api/src/database/services/payment-matching.service.ts
 *  for fuzzy matching to unallocated bank transactions.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaymentAttachmentStatus, PaymentAttachmentKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { StorageService } from '../../integrations/storage/storage.service';
import { StorageKind } from '../../integrations/storage/storage.types';
import {
  PresignUploadDto,
  MAX_FILE_SIZE_BYTES,
} from './dto/presign-upload.dto';
import { RegisterAttachmentDto } from './dto/register-attachment.dto';
import { ReviewAttachmentDto } from './dto/review-attachment.dto';
import { LinkPaymentDto } from './dto/link-payment.dto';
import type {
  PaymentAttachmentResponseDto,
  AdminAttachmentListFilters,
} from './dto/payment-attachment-response.dto';

/** Max rows returned by admin list */
const ADMIN_LIST_CAP = 200;
/** Max rows returned by admin pending queue */
const ADMIN_PENDING_CAP = 100;
/** Parent list default lookback window */
const PARENT_LOOKBACK_DAYS = 90;
/** Presigned download TTL */
const DOWNLOAD_TTL_SECONDS = 300; // 5 min

/** Key prefix shape for cross-tenant guard */
const buildExpectedPrefix = (tenantId: string) =>
  `tenants/${tenantId}/proof-of-payments/`;

function toResponseDto(
  row: Record<string, unknown>,
): PaymentAttachmentResponseDto {
  return {
    id: row.id as string,
    tenantId: row.tenantId as string,
    paymentId: (row.paymentId as string | null) ?? null,
    parentId: (row.parentId as string | null) ?? null,
    kind: row.kind as PaymentAttachmentKind,
    filename: row.filename as string,
    contentType: row.contentType as string,
    fileSize: row.fileSize as number,
    note: (row.note as string | null) ?? null,
    reviewStatus: row.reviewStatus as PaymentAttachmentStatus,
    uploadedAt: (row.uploadedAt as Date).toISOString(),
    reviewedAt: row.reviewedAt ? (row.reviewedAt as Date).toISOString() : null,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
    parent: row.parent as PaymentAttachmentResponseDto['parent'],
    payment: row.payment as PaymentAttachmentResponseDto['payment'],
    uploadedBy: row.uploadedBy as PaymentAttachmentResponseDto['uploadedBy'],
    reviewedBy: row.reviewedBy as PaymentAttachmentResponseDto['reviewedBy'],
  };
}

@Injectable()
export class PaymentAttachmentsService {
  private readonly logger = new Logger(PaymentAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // Parent — presign upload URL
  // ---------------------------------------------------------------------------

  async presignUpload(
    tenantId: string,
    dto: PresignUploadDto,
  ): Promise<{ uploadUrl: string; key: string; expiresAt: string }> {
    const result = await this.storage.createPresignedUploadUrl(
      tenantId,
      StorageKind.ProofOfPayment,
      dto.filename,
      {
        contentType: dto.contentType,
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        ttlSeconds: 900, // 15 min
      },
    );

    this.logger.log(
      `presignUpload: tenantId=${tenantId} key=${result.key} contentType=${dto.contentType}`,
    );

    return {
      uploadUrl: result.url,
      key: result.key,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Parent — register uploaded attachment
  // ---------------------------------------------------------------------------

  async register(
    tenantId: string,
    parentId: string,
    dto: RegisterAttachmentDto,
  ): Promise<PaymentAttachmentResponseDto> {
    // Cross-tenant key guard
    const expectedPrefix = buildExpectedPrefix(tenantId);
    if (!dto.s3Key.startsWith(expectedPrefix)) {
      this.logger.warn(
        `Cross-tenant key rejected: tenantId=${tenantId} key=${dto.s3Key}`,
      );
      throw new ForbiddenException(
        'The supplied S3 key does not belong to this tenant',
      );
    }

    // Verify parent belongs to tenant
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      throw new ForbiddenException('Parent not found in tenant');
    }

    // Verify object actually exists in S3
    const exists = await this.storage.objectExists(
      tenantId,
      StorageKind.ProofOfPayment,
      dto.s3Key,
    );
    if (!exists) {
      throw new UnprocessableEntityException(
        'The uploaded file was not found in storage. Complete the S3 upload before registering.',
      );
    }

    const attachment = await this.prisma.paymentAttachment.create({
      data: {
        tenantId,
        parentId,
        uploadedById: null, // parent upload — no staff user
        kind: PaymentAttachmentKind.PROOF_OF_PAYMENT,
        s3Key: dto.s3Key,
        filename: dto.filename.slice(0, 200),
        contentType: dto.contentType,
        fileSize: dto.fileSize,
        note: dto.note ?? null,
        reviewStatus: PaymentAttachmentStatus.PENDING,
      },
    });

    await this.auditLog.logCreate({
      tenantId,
      entityType: 'PaymentAttachment',
      entityId: attachment.id,
      afterValue: {
        s3Key: attachment.s3Key,
        filename: attachment.filename,
        parentId,
        reviewStatus: PaymentAttachmentStatus.PENDING,
      },
    });

    this.logger.log(
      `register: created attachment=${attachment.id} tenantId=${tenantId} parentId=${parentId}`,
    );

    return toResponseDto(attachment as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Parent — list own attachments
  // ---------------------------------------------------------------------------

  async listForParent(
    tenantId: string,
    parentId: string,
    paymentId?: string,
  ): Promise<PaymentAttachmentResponseDto[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PARENT_LOOKBACK_DAYS);

    const rows = await this.prisma.paymentAttachment.findMany({
      where: {
        tenantId,
        parentId,
        uploadedAt: { gte: cutoff },
        ...(paymentId ? { paymentId } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return rows.map((r) =>
      toResponseDto(r as unknown as Record<string, unknown>),
    );
  }

  // ---------------------------------------------------------------------------
  // Parent — single attachment (verifies ownership)
  // ---------------------------------------------------------------------------

  async getForParent(
    tenantId: string,
    parentId: string,
    id: string,
  ): Promise<PaymentAttachmentResponseDto> {
    const row = await this.prisma.paymentAttachment.findFirst({
      where: { id, tenantId },
    });
    if (!row) {
      throw new NotFoundException(`PaymentAttachment ${id} not found`);
    }
    if (row.parentId !== parentId) {
      throw new ForbiddenException('You do not own this attachment');
    }
    return toResponseDto(row as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Parent — presigned download URL
  // ---------------------------------------------------------------------------

  /**
   * Internal helper: fetch raw s3Key for download.
   * Avoids leaking the key in the public response DTO.
   */
  private async getRawRow(tenantId: string, id: string) {
    const row = await this.prisma.paymentAttachment.findFirst({
      where: { id, tenantId },
      select: { id: true, s3Key: true, parentId: true, reviewStatus: true },
    });
    if (!row) {
      throw new NotFoundException(`PaymentAttachment ${id} not found`);
    }
    return row;
  }

  async downloadUrlForParentById(
    tenantId: string,
    parentId: string,
    id: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const row = await this.getRawRow(tenantId, id);
    if (row.parentId !== parentId) {
      throw new ForbiddenException('You do not own this attachment');
    }
    const url = await this.storage.createPresignedDownloadUrl(
      tenantId,
      StorageKind.ProofOfPayment,
      row.s3Key,
      DOWNLOAD_TTL_SECONDS,
    );
    const expiresAt = new Date(
      Date.now() + DOWNLOAD_TTL_SECONDS * 1000,
    ).toISOString();
    return { url, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // Parent — delete (PENDING only)
  // ---------------------------------------------------------------------------

  async deleteForParent(
    tenantId: string,
    parentId: string,
    id: string,
  ): Promise<void> {
    const row = await this.getRawRow(tenantId, id);
    if (row.parentId !== parentId) {
      throw new ForbiddenException('You do not own this attachment');
    }
    if (row.reviewStatus !== PaymentAttachmentStatus.PENDING) {
      throw new BadRequestException(
        'Attachment can only be deleted while in PENDING status. Once reviewed, contact your administrator.',
      );
    }

    await this.prisma.paymentAttachment.delete({ where: { id } });

    await this.auditLog.logDelete({
      tenantId,
      entityType: 'PaymentAttachment',
      entityId: id,
      beforeValue: { id, reviewStatus: row.reviewStatus, parentId },
    });

    // NOTE(janitor): S3 object is intentionally NOT deleted here. Admins may
    // need to inspect rejected/deleted files. A janitor cron to purge S3 objects
    // for deleted PENDING attachments older than 30 days is a follow-up task.

    this.logger.log(
      `deleteForParent: deleted attachment=${id} tenantId=${tenantId} parentId=${parentId}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Admin — list with filters
  // ---------------------------------------------------------------------------

  async listForAdmin(
    tenantId: string,
    filters: AdminAttachmentListFilters,
  ): Promise<PaymentAttachmentResponseDto[]> {
    const where: Record<string, unknown> = { tenantId };

    if (filters.paymentId) where.paymentId = filters.paymentId;
    if (filters.parentId) where.parentId = filters.parentId;
    if (filters.status) where.reviewStatus = filters.status;

    if (filters.from || filters.to) {
      where.uploadedAt = {};
      if (filters.from) {
        (where.uploadedAt as Record<string, Date>).gte = new Date(filters.from);
      }
      if (filters.to) {
        (where.uploadedAt as Record<string, Date>).lte = new Date(filters.to);
      }
    }

    const rows = await this.prisma.paymentAttachment.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      take: ADMIN_LIST_CAP,
      include: {
        parent: { select: { id: true, firstName: true, lastName: true } },
        payment: {
          select: {
            id: true,
            amountCents: true,
            paymentDate: true,
            reference: true,
          },
        },
      },
    });

    return rows.map((r) =>
      toResponseDto(r as unknown as Record<string, unknown>),
    );
  }

  // ---------------------------------------------------------------------------
  // Admin — pending queue
  // ---------------------------------------------------------------------------

  async listPendingForAdmin(
    tenantId: string,
  ): Promise<PaymentAttachmentResponseDto[]> {
    const rows = await this.prisma.paymentAttachment.findMany({
      where: { tenantId, reviewStatus: PaymentAttachmentStatus.PENDING },
      orderBy: { uploadedAt: 'asc' }, // oldest first for review queue
      take: ADMIN_PENDING_CAP,
      include: {
        parent: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return rows.map((r) =>
      toResponseDto(r as unknown as Record<string, unknown>),
    );
  }

  // ---------------------------------------------------------------------------
  // Admin — single detail with all joins
  // ---------------------------------------------------------------------------

  async getForAdmin(
    tenantId: string,
    id: string,
  ): Promise<PaymentAttachmentResponseDto> {
    const row = await this.prisma.paymentAttachment.findFirst({
      where: { id, tenantId },
      include: {
        parent: { select: { id: true, firstName: true, lastName: true } },
        payment: {
          select: {
            id: true,
            amountCents: true,
            paymentDate: true,
            reference: true,
          },
        },
        uploadedBy: { select: { id: true, email: true } },
        reviewedBy: { select: { id: true, email: true } },
      },
    });
    if (!row) {
      throw new NotFoundException(`PaymentAttachment ${id} not found`);
    }
    return toResponseDto(row as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Admin — presigned download URL (access-logged)
  // ---------------------------------------------------------------------------

  async downloadUrlForAdmin(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const row = await this.getRawRow(tenantId, id);

    const url = await this.storage.createPresignedDownloadUrl(
      tenantId,
      StorageKind.ProofOfPayment,
      row.s3Key,
      DOWNLOAD_TTL_SECONDS,
    );

    // Audit every admin download of a sensitive file (logged as UPDATE with no field change)
    await this.auditLog.logAction({
      tenantId,
      userId,
      entityType: 'PaymentAttachment',
      entityId: id,
      action: AuditAction.UPDATE,
      changeSummary: 'Admin generated presigned download URL',
    });

    const expiresAt = new Date(
      Date.now() + DOWNLOAD_TTL_SECONDS * 1000,
    ).toISOString();
    return { url, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // Admin — review (PENDING → APPROVED | REJECTED)
  // ---------------------------------------------------------------------------

  async review(
    tenantId: string,
    reviewerId: string,
    id: string,
    dto: ReviewAttachmentDto,
  ): Promise<PaymentAttachmentResponseDto> {
    const before = await this.prisma.paymentAttachment.findFirst({
      where: { id, tenantId },
    });
    if (!before) {
      throw new NotFoundException(`PaymentAttachment ${id} not found`);
    }
    if (before.reviewStatus !== PaymentAttachmentStatus.PENDING) {
      throw new BadRequestException(
        `Attachment is already ${before.reviewStatus}. Only PENDING attachments can be reviewed.`,
      );
    }

    const after = await this.prisma.paymentAttachment.update({
      where: { id },
      data: {
        reviewStatus: dto.status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        note: dto.reviewNote ?? before.note,
      },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId: reviewerId,
      entityType: 'PaymentAttachment',
      entityId: id,
      beforeValue: { reviewStatus: before.reviewStatus },
      afterValue: {
        reviewStatus: after.reviewStatus,
        reviewedById: reviewerId,
        reviewNote: dto.reviewNote,
      },
      changeSummary: `Review: ${before.reviewStatus} → ${after.reviewStatus}`,
    });

    this.logger.log(
      `review: attachment=${id} tenantId=${tenantId} reviewer=${reviewerId} status=${after.reviewStatus}`,
    );

    return toResponseDto(after as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Admin — link payment (idempotent)
  // ---------------------------------------------------------------------------

  async linkPayment(
    tenantId: string,
    userId: string,
    id: string,
    dto: LinkPaymentDto,
  ): Promise<PaymentAttachmentResponseDto> {
    const attachment = await this.prisma.paymentAttachment.findFirst({
      where: { id, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException(`PaymentAttachment ${id} not found`);
    }

    // Verify payment belongs to tenant
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, tenantId },
      select: { id: true },
    });
    if (!payment) {
      throw new NotFoundException(
        `Payment ${dto.paymentId} not found in tenant`,
      );
    }

    // Idempotent: if already linked to same payment, return current state
    if (attachment.paymentId === dto.paymentId) {
      return toResponseDto(attachment as unknown as Record<string, unknown>);
    }

    const updated = await this.prisma.paymentAttachment.update({
      where: { id },
      data: { paymentId: dto.paymentId },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'PaymentAttachment',
      entityId: id,
      beforeValue: { paymentId: attachment.paymentId },
      afterValue: { paymentId: dto.paymentId },
      changeSummary: 'Linked to payment',
    });

    return toResponseDto(updated as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Admin — unlink payment
  // ---------------------------------------------------------------------------

  async unlinkPayment(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<PaymentAttachmentResponseDto> {
    const attachment = await this.prisma.paymentAttachment.findFirst({
      where: { id, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException(`PaymentAttachment ${id} not found`);
    }

    const prevPaymentId = attachment.paymentId;

    const updated = await this.prisma.paymentAttachment.update({
      where: { id },
      data: { paymentId: null },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'PaymentAttachment',
      entityId: id,
      beforeValue: { paymentId: prevPaymentId },
      afterValue: { paymentId: null },
      changeSummary: 'Unlinked from payment',
    });

    return toResponseDto(updated as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Admin — admin-side register (on behalf of parent)
  // ---------------------------------------------------------------------------

  async adminRegister(
    tenantId: string,
    adminUserId: string,
    parentId: string,
    dto: RegisterAttachmentDto,
  ): Promise<PaymentAttachmentResponseDto> {
    // Cross-tenant key guard
    const expectedPrefix = buildExpectedPrefix(tenantId);
    if (!dto.s3Key.startsWith(expectedPrefix)) {
      throw new ForbiddenException(
        'The supplied S3 key does not belong to this tenant',
      );
    }

    // Verify parent belongs to tenant
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      throw new NotFoundException(`Parent ${parentId} not found in tenant`);
    }

    // Verify object exists in S3
    const exists = await this.storage.objectExists(
      tenantId,
      StorageKind.ProofOfPayment,
      dto.s3Key,
    );
    if (!exists) {
      throw new UnprocessableEntityException(
        'The uploaded file was not found in storage.',
      );
    }

    const attachment = await this.prisma.paymentAttachment.create({
      data: {
        tenantId,
        parentId,
        uploadedById: adminUserId,
        kind: PaymentAttachmentKind.PROOF_OF_PAYMENT,
        s3Key: dto.s3Key,
        filename: dto.filename.slice(0, 200),
        contentType: dto.contentType,
        fileSize: dto.fileSize,
        note: dto.note ?? null,
        reviewStatus: PaymentAttachmentStatus.PENDING,
      },
    });

    await this.auditLog.logCreate({
      tenantId,
      userId: adminUserId,
      entityType: 'PaymentAttachment',
      entityId: attachment.id,
      afterValue: {
        s3Key: attachment.s3Key,
        filename: attachment.filename,
        parentId,
        uploadedByAdmin: adminUserId,
        reviewStatus: PaymentAttachmentStatus.PENDING,
      },
    });

    return toResponseDto(attachment as unknown as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Admin — hard delete (any status, deletes from S3)
  // ---------------------------------------------------------------------------

  async adminDelete(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<void> {
    const row = await this.getRawRow(tenantId, id);

    // Delete from S3
    await this.storage.deleteObject(
      tenantId,
      StorageKind.ProofOfPayment,
      row.s3Key,
    );

    await this.prisma.paymentAttachment.delete({ where: { id } });

    await this.auditLog.logDelete({
      tenantId,
      userId,
      entityType: 'PaymentAttachment',
      entityId: id,
      beforeValue: { id, s3Key: row.s3Key, reviewStatus: row.reviewStatus },
    });

    this.logger.log(
      `adminDelete: deleted attachment=${id} tenantId=${tenantId} userId=${userId}`,
    );
  }
}
