/**
 * Staff Document Service
 * TASK-STAFF-001: Staff Document Management
 *
 * Responsibilities:
 * - Upload documents for staff verification
 * - Verify and reject documents
 * - Track document expiry
 * - Manage document lifecycle
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOnboardingRepository } from '../repositories/staff-onboarding.repository';
import { AuditLogService } from './audit-log.service';
import {
  DocumentType,
  DocumentStatus,
} from '../entities/staff-onboarding.entity';
import {
  CreateStaffDocumentDto,
  VerifyDocumentDto,
  RejectDocumentDto,
  StaffDocumentFilterDto,
  DocumentExpiryWarning,
} from '../dto/staff-onboarding.dto';
import {
  NotFoundException,
  ValidationException,
} from '../../shared/exceptions';
import { StaffDocument } from '@prisma/client';

@Injectable()
export class StaffDocumentService {
  private readonly logger = new Logger(StaffDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingRepo: StaffOnboardingRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Upload a new document for a staff member
   */
  async uploadDocument(
    tenantId: string,
    dto: CreateStaffDocumentDto,
    userId: string,
  ): Promise<StaffDocument> {
    this.logger.log(
      `Uploading document ${dto.documentType} for staff ${dto.staffId}`,
    );

    // Verify staff exists
    const staff = await this.prisma.staff.findFirst({
      where: { id: dto.staffId, tenantId },
    });
    if (!staff) {
      throw new NotFoundException('Staff', dto.staffId);
    }

    const document = await this.onboardingRepo.createDocument(tenantId, dto);

    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'StaffDocument',
      entityId: document.id,
      afterValue: {
        documentType: dto.documentType,
        staffId: dto.staffId,
        fileName: dto.fileName,
      },
    });

    return document;
  }

  /**
   * Verify a document (mark as approved)
   */
  async verifyDocument(
    documentId: string,
    dto: VerifyDocumentDto,
    tenantId: string,
  ): Promise<StaffDocument> {
    this.logger.log(`Verifying document ${documentId}`);

    const document = await this.onboardingRepo.findDocumentById(documentId);
    if (!document) {
      throw new NotFoundException('Document', documentId);
    }

    // Ensure document belongs to tenant
    if (document.tenantId !== tenantId) {
      throw new NotFoundException('Document', documentId);
    }

    // Validate document status transition
    if (document.status === 'VERIFIED') {
      throw new ValidationException('Document is already verified', [
        { field: 'status', message: 'Document has already been verified' },
      ]);
    }

    const updated = await this.onboardingRepo.verifyDocument(
      documentId,
      dto.verifiedBy,
      dto.notes,
    );

    await this.auditLogService.logUpdate({
      tenantId,
      userId: dto.verifiedBy,
      entityType: 'StaffDocument',
      entityId: documentId,
      beforeValue: { status: document.status },
      afterValue: { status: 'VERIFIED', verifiedBy: dto.verifiedBy },
    });

    return updated;
  }

  /**
   * Reject a document with reason
   */
  async rejectDocument(
    documentId: string,
    dto: RejectDocumentDto,
    tenantId: string,
    userId: string,
  ): Promise<StaffDocument> {
    this.logger.log(`Rejecting document ${documentId}`);

    const document = await this.onboardingRepo.findDocumentById(documentId);
    if (!document) {
      throw new NotFoundException('Document', documentId);
    }

    // Ensure document belongs to tenant
    if (document.tenantId !== tenantId) {
      throw new NotFoundException('Document', documentId);
    }

    // Cannot reject already verified documents
    if (document.status === 'VERIFIED') {
      throw new ValidationException('Cannot reject a verified document', [
        { field: 'status', message: 'Document has already been verified' },
      ]);
    }

    const updated = await this.onboardingRepo.rejectDocument(
      documentId,
      dto.rejectionReason,
      dto.notes,
    );

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'StaffDocument',
      entityId: documentId,
      beforeValue: { status: document.status },
      afterValue: {
        status: 'REJECTED',
        rejectionReason: dto.rejectionReason,
      },
    });

    return updated;
  }

  /**
   * Get a document by ID
   */
  async getDocumentById(
    documentId: string,
    tenantId: string,
  ): Promise<StaffDocument> {
    const document = await this.onboardingRepo.findDocumentById(documentId);
    if (!document || document.tenantId !== tenantId) {
      throw new NotFoundException('Document', documentId);
    }
    return document;
  }

  /**
   * Get all documents for a staff member
   */
  async getDocumentsByStaff(
    staffId: string,
    filter?: StaffDocumentFilterDto,
  ): Promise<StaffDocument[]> {
    return this.onboardingRepo.findDocumentsByStaff(staffId, filter);
  }

  /**
   * Get documents by tenant with filters
   */
  async getDocumentsByTenant(
    tenantId: string,
    filter?: StaffDocumentFilterDto,
  ): Promise<StaffDocument[]> {
    return this.onboardingRepo.findDocumentsByTenant(tenantId, filter);
  }

  /**
   * Get pending documents requiring verification
   */
  async getPendingDocuments(tenantId: string): Promise<StaffDocument[]> {
    return this.onboardingRepo.findPendingDocuments(tenantId);
  }

  /**
   * Get documents expiring within specified days
   */
  async getExpiringDocuments(
    tenantId: string,
    daysAhead: number = 30,
  ): Promise<DocumentExpiryWarning[]> {
    const documents = await this.onboardingRepo.findExpiringDocuments(
      tenantId,
      daysAhead,
    );

    // Enrich with staff names and calculate days until expiry
    const warnings = await Promise.all(
      documents.map(async (doc) => {
        const staff = await this.prisma.staff.findUnique({
          where: { id: doc.staffId },
          select: { firstName: true, lastName: true },
        });

        const daysUntilExpiry = doc.expiryDate
          ? Math.ceil(
              (doc.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )
          : 0;

        return {
          documentId: doc.id,
          staffId: doc.staffId,
          staffName: staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown',
          documentType: doc.documentType as DocumentType,
          expiryDate: doc.expiryDate!,
          daysUntilExpiry,
        };
      }),
    );

    return warnings;
  }

  /**
   * Get expired documents
   */
  async getExpiredDocuments(tenantId: string): Promise<StaffDocument[]> {
    return this.prisma.staffDocument.findMany({
      where: {
        tenantId,
        status: 'VERIFIED',
        expiryDate: {
          lt: new Date(),
        },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  /**
   * Update document expiry date
   */
  async updateExpiryDate(
    documentId: string,
    expiryDate: Date,
    tenantId: string,
    userId: string,
  ): Promise<StaffDocument> {
    const document = await this.onboardingRepo.findDocumentById(documentId);
    if (!document || document.tenantId !== tenantId) {
      throw new NotFoundException('Document', documentId);
    }

    const updated = await this.onboardingRepo.updateDocument(documentId, {
      expiryDate,
    });

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'StaffDocument',
      entityId: documentId,
      beforeValue: { expiryDate: document.expiryDate },
      afterValue: { expiryDate },
    });

    return updated;
  }

  /**
   * Delete a document
   */
  async deleteDocument(
    documentId: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const document = await this.onboardingRepo.findDocumentById(documentId);
    if (!document || document.tenantId !== tenantId) {
      throw new NotFoundException('Document', documentId);
    }

    await this.onboardingRepo.deleteDocument(documentId);

    await this.auditLogService.logDelete({
      tenantId,
      userId,
      entityType: 'StaffDocument',
      entityId: documentId,
      beforeValue: {
        documentType: document.documentType,
        fileName: document.fileName,
        staffId: document.staffId,
      },
    });
  }

  /**
   * Get document statistics for a tenant
   */
  async getDocumentStats(tenantId: string): Promise<{
    total: number;
    pending: number;
    verified: number;
    rejected: number;
    expired: number;
    expiringWithin30Days: number;
  }> {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const [total, pending, verified, rejected, expired, expiringWithin30Days] =
      await Promise.all([
        this.prisma.staffDocument.count({ where: { tenantId } }),
        this.prisma.staffDocument.count({
          where: { tenantId, status: 'UPLOADED' },
        }),
        this.prisma.staffDocument.count({
          where: { tenantId, status: 'VERIFIED' },
        }),
        this.prisma.staffDocument.count({
          where: { tenantId, status: 'REJECTED' },
        }),
        this.prisma.staffDocument.count({
          where: {
            tenantId,
            status: 'VERIFIED',
            expiryDate: { lt: now },
          },
        }),
        this.prisma.staffDocument.count({
          where: {
            tenantId,
            status: 'VERIFIED',
            expiryDate: {
              gte: now,
              lte: thirtyDaysFromNow,
            },
          },
        }),
      ]);

    return {
      total,
      pending,
      verified,
      rejected,
      expired,
      expiringWithin30Days,
    };
  }
}
