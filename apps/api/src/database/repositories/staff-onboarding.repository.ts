/**
 * Staff Onboarding Repository
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Repository for managing staff onboarding data including:
 * - Staff documents (upload, verify, reject)
 * - Onboarding workflows
 * - Checklist items
 * - Dashboard statistics
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  StaffDocument,
  StaffOnboarding,
  OnboardingChecklistItem,
} from '@prisma/client';
import {
  DocumentType,
  DocumentStatus,
  OnboardingStatus,
  ChecklistItemStatus,
  DEFAULT_ONBOARDING_CHECKLIST,
} from '../entities/staff-onboarding.entity';
import {
  CreateStaffDocumentDto,
  UpdateStaffDocumentDto,
  StaffDocumentFilterDto,
  InitiateOnboardingDto,
  UpdateOnboardingStatusDto,
  OnboardingFilterDto,
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
  OnboardingProgress,
} from '../dto/staff-onboarding.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class StaffOnboardingRepository {
  private readonly logger = new Logger(StaffOnboardingRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Staff Onboarding Methods
  // ============================================

  /**
   * Create a new onboarding record for a staff member
   * @throws ConflictException if onboarding already exists for staff
   * @throws NotFoundException if staff or tenant doesn't exist
   */
  async createOnboarding(
    tenantId: string,
    dto: InitiateOnboardingDto,
  ): Promise<StaffOnboarding> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Create the onboarding record
        const onboarding = await tx.staffOnboarding.create({
          data: {
            tenantId,
            staffId: dto.staffId,
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            notes: dto.notes ?? null,
          },
        });

        // Create default checklist items if requested
        if (dto.useDefaultChecklist !== false) {
          const checklistItems = DEFAULT_ONBOARDING_CHECKLIST.map((item) => ({
            onboardingId: onboarding.id,
            itemKey: item.itemKey,
            title: item.title,
            description: item.description ?? null,
            category: item.category,
            isRequired: item.isRequired,
            sortOrder: item.sortOrder,
            status: 'NOT_STARTED' as ChecklistItemStatus,
          }));

          await tx.onboardingChecklistItem.createMany({
            data: checklistItems,
          });
        }

        return onboarding;
      });
    } catch (error) {
      this.logger.error(
        `Failed to create onboarding for staff ${dto.staffId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Onboarding already exists for staff '${dto.staffId}'`,
            { staffId: dto.staffId },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Staff', dto.staffId);
        }
      }
      throw new DatabaseException(
        'createOnboarding',
        'Failed to create onboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find onboarding by ID
   */
  async findOnboardingById(id: string): Promise<StaffOnboarding | null> {
    try {
      return await this.prisma.staffOnboarding.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find onboarding by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOnboardingById',
        'Failed to find onboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find onboarding by staff ID
   */
  async findOnboardingByStaffId(
    staffId: string,
  ): Promise<StaffOnboarding | null> {
    try {
      return await this.prisma.staffOnboarding.findUnique({
        where: { staffId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find onboarding for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOnboardingByStaffId',
        'Failed to find onboarding by staff ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all onboardings for a tenant with optional filters
   */
  async findOnboardingsByTenant(
    tenantId: string,
    filter?: OnboardingFilterDto,
  ): Promise<StaffOnboarding[]> {
    try {
      const where: Prisma.StaffOnboardingWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.startedAfter) {
        where.startedAt = { gte: filter.startedAfter };
      }
      if (filter?.startedBefore) {
        where.startedAt = {
          ...(where.startedAt as Prisma.DateTimeNullableFilter),
          lte: filter.startedBefore,
        };
      }

      return await this.prisma.staffOnboarding.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find onboardings for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOnboardingsByTenant',
        'Failed to find onboardings',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update onboarding status
   * @throws NotFoundException if onboarding doesn't exist
   */
  async updateOnboarding(
    id: string,
    data: Prisma.StaffOnboardingUpdateInput,
  ): Promise<StaffOnboarding> {
    try {
      return await this.prisma.staffOnboarding.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('StaffOnboarding', id);
      }
      this.logger.error(
        `Failed to update onboarding: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateOnboarding',
        'Failed to update onboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update onboarding status with transition validation
   */
  async updateOnboardingStatus(
    id: string,
    dto: UpdateOnboardingStatusDto,
  ): Promise<StaffOnboarding> {
    const updateData: Prisma.StaffOnboardingUpdateInput = {
      status: dto.status,
      notes: dto.notes,
    };

    if (String(dto.status) === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    return this.updateOnboarding(id, updateData);
  }

  // ============================================
  // Checklist Item Methods
  // ============================================

  /**
   * Create a checklist item
   */
  async createChecklistItem(
    onboardingId: string,
    dto: CreateChecklistItemDto,
  ): Promise<OnboardingChecklistItem> {
    try {
      return await this.prisma.onboardingChecklistItem.create({
        data: {
          onboardingId,
          itemKey: dto.itemKey,
          title: dto.title,
          description: dto.description ?? null,
          category: dto.category,
          isRequired: dto.isRequired ?? true,
          sortOrder: dto.sortOrder ?? 0,
          status: 'NOT_STARTED',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create checklist item for onboarding ${onboardingId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Checklist item '${dto.itemKey}' already exists for this onboarding`,
            { itemKey: dto.itemKey, onboardingId },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('StaffOnboarding', onboardingId);
        }
      }
      throw new DatabaseException(
        'createChecklistItem',
        'Failed to create checklist item',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create multiple checklist items
   */
  async createManyChecklistItems(
    onboardingId: string,
    items: CreateChecklistItemDto[],
  ): Promise<number> {
    try {
      const data = items.map((item) => ({
        onboardingId,
        itemKey: item.itemKey,
        title: item.title,
        description: item.description ?? null,
        category: item.category,
        isRequired: item.isRequired ?? true,
        sortOrder: item.sortOrder ?? 0,
        status: 'NOT_STARTED' as ChecklistItemStatus,
      }));

      const result = await this.prisma.onboardingChecklistItem.createMany({
        data,
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to create checklist items for onboarding ${onboardingId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'createManyChecklistItems',
        'Failed to create checklist items',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find checklist items by onboarding ID
   */
  async findChecklistItemsByOnboarding(
    onboardingId: string,
  ): Promise<OnboardingChecklistItem[]> {
    try {
      return await this.prisma.onboardingChecklistItem.findMany({
        where: { onboardingId },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find checklist items for onboarding: ${onboardingId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findChecklistItemsByOnboarding',
        'Failed to find checklist items',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a checklist item
   * @throws NotFoundException if item doesn't exist
   */
  async updateChecklistItem(
    id: string,
    dto: UpdateChecklistItemDto,
  ): Promise<OnboardingChecklistItem> {
    try {
      const updateData: Prisma.OnboardingChecklistItemUpdateInput = {};

      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.description !== undefined)
        updateData.description = dto.description;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.isRequired !== undefined) updateData.isRequired = dto.isRequired;
      if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      return await this.prisma.onboardingChecklistItem.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('OnboardingChecklistItem', id);
      }
      this.logger.error(
        `Failed to update checklist item: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateChecklistItem',
        'Failed to update checklist item',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Complete a checklist item
   */
  async completeChecklistItem(
    id: string,
    completedBy: string,
    notes?: string,
  ): Promise<OnboardingChecklistItem> {
    return this.updateChecklistItem(id, {
      status: ChecklistItemStatus.COMPLETED,
      notes,
    });
  }

  // ============================================
  // Document Methods
  // ============================================

  /**
   * Create a document record
   */
  async createDocument(
    tenantId: string,
    dto: CreateStaffDocumentDto,
  ): Promise<StaffDocument> {
    try {
      return await this.prisma.staffDocument.create({
        data: {
          tenantId,
          staffId: dto.staffId,
          documentType: dto.documentType,
          fileName: dto.fileName,
          fileUrl: dto.fileUrl,
          fileSize: dto.fileSize,
          mimeType: dto.mimeType,
          status: 'UPLOADED',
          expiryDate: dto.expiryDate ?? null,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create document for staff ${dto.staffId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Staff', dto.staffId);
      }
      throw new DatabaseException(
        'createDocument',
        'Failed to create document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find document by ID
   */
  async findDocumentById(id: string): Promise<StaffDocument | null> {
    try {
      return await this.prisma.staffDocument.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find document by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findDocumentById',
        'Failed to find document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find documents by staff ID with optional filters
   */
  async findDocumentsByStaff(
    staffId: string,
    filter?: StaffDocumentFilterDto,
  ): Promise<StaffDocument[]> {
    try {
      const where: Prisma.StaffDocumentWhereInput = { staffId };

      if (filter?.documentType) {
        where.documentType = filter.documentType;
      }
      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.expired !== undefined) {
        if (filter.expired) {
          where.expiryDate = { lt: new Date() };
        } else {
          where.OR = [
            { expiryDate: null },
            { expiryDate: { gte: new Date() } },
          ];
        }
      }

      return await this.prisma.staffDocument.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find documents for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findDocumentsByStaff',
        'Failed to find documents',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find documents by tenant with optional filters
   */
  async findDocumentsByTenant(
    tenantId: string,
    filter?: StaffDocumentFilterDto,
  ): Promise<StaffDocument[]> {
    try {
      const where: Prisma.StaffDocumentWhereInput = { tenantId };

      if (filter?.documentType) {
        where.documentType = filter.documentType;
      }
      if (filter?.status) {
        where.status = filter.status;
      }

      return await this.prisma.staffDocument.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find documents for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findDocumentsByTenant',
        'Failed to find documents',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a document
   * @throws NotFoundException if document doesn't exist
   */
  async updateDocument(
    id: string,
    dto: UpdateStaffDocumentDto,
  ): Promise<StaffDocument> {
    try {
      const updateData: Prisma.StaffDocumentUpdateInput = {};

      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.rejectionReason !== undefined)
        updateData.rejectionReason = dto.rejectionReason;
      if (dto.notes !== undefined) updateData.notes = dto.notes;
      if (dto.expiryDate !== undefined) updateData.expiryDate = dto.expiryDate;

      return await this.prisma.staffDocument.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('StaffDocument', id);
      }
      this.logger.error(
        `Failed to update document: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateDocument',
        'Failed to update document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Verify a document
   */
  async verifyDocument(
    id: string,
    verifiedBy: string,
    notes?: string,
  ): Promise<StaffDocument> {
    try {
      return await this.prisma.staffDocument.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedBy,
          notes,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('StaffDocument', id);
      }
      this.logger.error(
        `Failed to verify document: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'verifyDocument',
        'Failed to verify document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Reject a document
   */
  async rejectDocument(
    id: string,
    rejectionReason: string,
    notes?: string,
  ): Promise<StaffDocument> {
    try {
      return await this.prisma.staffDocument.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason,
          notes,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('StaffDocument', id);
      }
      this.logger.error(
        `Failed to reject document: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'rejectDocument',
        'Failed to reject document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a document
   * @throws NotFoundException if document doesn't exist
   */
  async deleteDocument(id: string): Promise<void> {
    try {
      await this.prisma.staffDocument.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('StaffDocument', id);
      }
      this.logger.error(
        `Failed to delete document: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteDocument',
        'Failed to delete document',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // Dashboard & Statistics Methods
  // ============================================

  /**
   * Get onboarding statistics for a tenant
   */
  async getOnboardingStats(tenantId: string): Promise<{
    total: number;
    notStarted: number;
    inProgress: number;
    documentsPending: number;
    verificationPending: number;
    completed: number;
    cancelled: number;
  }> {
    try {
      const [
        total,
        notStarted,
        inProgress,
        documentsPending,
        verificationPending,
        completed,
        cancelled,
      ] = await Promise.all([
        this.prisma.staffOnboarding.count({ where: { tenantId } }),
        this.prisma.staffOnboarding.count({
          where: { tenantId, status: 'NOT_STARTED' },
        }),
        this.prisma.staffOnboarding.count({
          where: { tenantId, status: 'IN_PROGRESS' },
        }),
        this.prisma.staffOnboarding.count({
          where: { tenantId, status: 'DOCUMENTS_PENDING' },
        }),
        this.prisma.staffOnboarding.count({
          where: { tenantId, status: 'VERIFICATION_PENDING' },
        }),
        this.prisma.staffOnboarding.count({
          where: { tenantId, status: 'COMPLETED' },
        }),
        this.prisma.staffOnboarding.count({
          where: { tenantId, status: 'CANCELLED' },
        }),
      ]);

      return {
        total,
        notStarted,
        inProgress,
        documentsPending,
        verificationPending,
        completed,
        cancelled,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get onboarding stats for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getOnboardingStats',
        'Failed to get onboarding statistics',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate onboarding progress for a single onboarding
   */
  async calculateProgress(onboardingId: string): Promise<OnboardingProgress> {
    try {
      const items = await this.findChecklistItemsByOnboarding(onboardingId);

      const totalItems = items.length;
      const completedItems = items.filter(
        (i) => i.status === 'COMPLETED',
      ).length;
      const requiredItems = items.filter((i) => i.isRequired).length;
      const completedRequiredItems = items.filter(
        (i) => i.isRequired && i.status === 'COMPLETED',
      ).length;

      // Group by category
      const byCategory: Record<
        string,
        { total: number; completed: number; percentComplete: number }
      > = {};

      for (const item of items) {
        if (!byCategory[item.category]) {
          byCategory[item.category] = {
            total: 0,
            completed: 0,
            percentComplete: 0,
          };
        }
        byCategory[item.category].total++;
        if (item.status === 'COMPLETED') {
          byCategory[item.category].completed++;
        }
      }

      // Calculate percentages
      for (const category of Object.keys(byCategory)) {
        const cat = byCategory[category];
        cat.percentComplete =
          cat.total > 0 ? Math.round((cat.completed / cat.total) * 100) : 0;
      }

      return {
        totalItems,
        completedItems,
        requiredItems,
        completedRequiredItems,
        percentComplete:
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        requiredPercentComplete:
          requiredItems > 0
            ? Math.round((completedRequiredItems / requiredItems) * 100)
            : 0,
        byCategory,
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate progress for onboarding: ${onboardingId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'calculateProgress',
        'Failed to calculate onboarding progress',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find documents expiring within a given number of days
   */
  async findExpiringDocuments(
    tenantId: string,
    daysAhead: number,
  ): Promise<StaffDocument[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      return await this.prisma.staffDocument.findMany({
        where: {
          tenantId,
          status: 'VERIFIED',
          expiryDate: {
            lte: futureDate,
            gte: new Date(),
          },
        },
        orderBy: { expiryDate: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find expiring documents for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findExpiringDocuments',
        'Failed to find expiring documents',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pending documents requiring verification
   */
  async findPendingDocuments(tenantId: string): Promise<StaffDocument[]> {
    try {
      return await this.prisma.staffDocument.findMany({
        where: {
          tenantId,
          status: 'UPLOADED',
        },
        orderBy: { uploadedAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending documents for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPendingDocuments',
        'Failed to find pending documents',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get recent onboardings with staff details
   */
  async getRecentOnboardings(
    tenantId: string,
    limit: number = 10,
  ): Promise<
    Array<StaffOnboarding & { staff: { firstName: string; lastName: string } }>
  > {
    try {
      return await this.prisma.staffOnboarding.findMany({
        where: { tenantId },
        include: {
          staff: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to get recent onboardings for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getRecentOnboardings',
        'Failed to get recent onboardings',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
