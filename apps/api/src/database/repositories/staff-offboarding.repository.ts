/**
 * Staff Offboarding Repository
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * Provides data access methods for staff offboarding and asset return entities.
 * Handles all database operations for the offboarding workflow including:
 * - Offboarding CRUD operations
 * - Asset return tracking
 * - Statistics and reporting queries
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StaffOffboarding, AssetReturn } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InitiateOffboardingDto,
  UpdateOffboardingDto,
  UpdateFinalPayDto,
  AddAssetReturnDto,
  UpdateAssetReturnDto,
  OffboardingFilterDto,
} from '../dto/staff-offboarding.dto';
import {
  StaffOffboardingStatus,
  AssetReturnStatus,
  OffboardingReason,
} from '../entities/staff-offboarding.entity';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

// Type for offboarding with relations
type OffboardingWithRelations = StaffOffboarding & {
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string | null;
    idNumber: string;
    basicSalaryCents: number;
  };
  assetReturns: AssetReturn[];
};

@Injectable()
export class StaffOffboardingRepository {
  private readonly logger = new Logger(StaffOffboardingRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Offboarding CRUD Operations
  // ============================================

  /**
   * Create a new offboarding record
   * @throws ConflictException if staff already has an active offboarding
   * @throws NotFoundException if staff doesn't exist
   * @throws DatabaseException for other database errors
   */
  async createOffboarding(
    tenantId: string,
    dto: InitiateOffboardingDto,
  ): Promise<StaffOffboarding> {
    try {
      // Check if staff already has an active offboarding
      const existing = await this.prisma.staffOffboarding.findUnique({
        where: { staffId: dto.staffId },
      });

      if (existing && existing.status !== StaffOffboardingStatus.CANCELLED) {
        throw new ConflictException(
          `Staff member already has an active offboarding process`,
          { staffId: dto.staffId, existingId: existing.id },
        );
      }

      // If cancelled, delete the old record
      if (existing) {
        await this.prisma.staffOffboarding.delete({
          where: { id: existing.id },
        });
      }

      return await this.prisma.staffOffboarding.create({
        data: {
          tenantId,
          staffId: dto.staffId,
          status: StaffOffboardingStatus.INITIATED,
          reason: dto.reason,
          lastWorkingDay: dto.lastWorkingDay,
          noticePeriodDays: dto.noticePeriodDays ?? 30,
          noticePeriodWaived: dto.noticePeriodWaived ?? false,
          initiatedBy: dto.initiatedBy ?? null,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(
        `Failed to create offboarding: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Staff', dto.staffId);
        }
      }
      throw new DatabaseException(
        'createOffboarding',
        'Failed to create offboarding record',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find offboarding by ID with all relations
   * @returns Offboarding with staff and asset returns, or null if not found
   */
  async findOffboardingById(
    id: string,
  ): Promise<OffboardingWithRelations | null> {
    try {
      return await this.prisma.staffOffboarding.findUnique({
        where: { id },
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              idNumber: true,
              basicSalaryCents: true,
            },
          },
          assetReturns: {
            orderBy: { assetType: 'asc' },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find offboarding by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOffboardingById',
        'Failed to find offboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find offboarding by staff ID
   * @returns Offboarding with relations, or null if not found
   */
  async findOffboardingByStaffId(
    staffId: string,
  ): Promise<OffboardingWithRelations | null> {
    try {
      return await this.prisma.staffOffboarding.findUnique({
        where: { staffId },
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              idNumber: true,
              basicSalaryCents: true,
            },
          },
          assetReturns: {
            orderBy: { assetType: 'asc' },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find offboarding by staffId: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOffboardingByStaffId',
        'Failed to find offboarding by staff ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all offboardings for a tenant with optional filters
   */
  async findOffboardingsByTenant(
    tenantId: string,
    filter?: OffboardingFilterDto,
  ): Promise<OffboardingWithRelations[]> {
    try {
      const where: Prisma.StaffOffboardingWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.reason) {
        where.reason = filter.reason;
      }
      if (filter?.fromDate) {
        where.initiatedAt = { gte: filter.fromDate };
      }
      if (filter?.toDate) {
        where.initiatedAt = {
          ...(where.initiatedAt as Prisma.DateTimeFilter),
          lte: filter.toDate,
        };
      }
      if (filter?.search) {
        const searchTerm = filter.search.trim();
        where.staff = {
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { employeeNumber: { contains: searchTerm, mode: 'insensitive' } },
          ],
        };
      }

      return await this.prisma.staffOffboarding.findMany({
        where,
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              idNumber: true,
              basicSalaryCents: true,
            },
          },
          assetReturns: {
            orderBy: { assetType: 'asc' },
          },
        },
        orderBy: { initiatedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find offboardings for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findOffboardingsByTenant',
        'Failed to find offboardings',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an offboarding record
   * @throws NotFoundException if offboarding doesn't exist
   */
  async updateOffboarding(
    id: string,
    dto: UpdateOffboardingDto,
  ): Promise<StaffOffboarding> {
    try {
      const existing = await this.prisma.staffOffboarding.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('StaffOffboarding', id);
      }

      const updateData: Prisma.StaffOffboardingUpdateInput = {};

      if (dto.status !== undefined) {
        updateData.status = dto.status;
      }
      if (dto.lastWorkingDay !== undefined) {
        updateData.lastWorkingDay = dto.lastWorkingDay;
      }
      if (dto.noticePeriodDays !== undefined) {
        updateData.noticePeriodDays = dto.noticePeriodDays;
      }
      if (dto.noticePeriodWaived !== undefined) {
        updateData.noticePeriodWaived = dto.noticePeriodWaived;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      return await this.prisma.staffOffboarding.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update offboarding ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateOffboarding',
        'Failed to update offboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update final pay amounts
   * @throws NotFoundException if offboarding doesn't exist
   */
  async updateFinalPay(
    id: string,
    dto: UpdateFinalPayDto,
  ): Promise<StaffOffboarding> {
    try {
      const existing = await this.prisma.staffOffboarding.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('StaffOffboarding', id);
      }

      // Calculate totals
      const outstandingSalaryCents =
        dto.outstandingSalaryCents ?? existing.outstandingSalaryCents;
      const leavePayoutCents =
        dto.leavePayoutCents ?? existing.leavePayoutCents;
      const noticePayCents = dto.noticePayCents ?? existing.noticePayCents;
      const proRataBonusCents =
        dto.proRataBonusCents ?? existing.proRataBonusCents;
      const otherEarningsCents =
        dto.otherEarningsCents ?? existing.otherEarningsCents;
      const deductionsCents = dto.deductionsCents ?? existing.deductionsCents;

      const grossCents =
        outstandingSalaryCents +
        leavePayoutCents +
        noticePayCents +
        proRataBonusCents +
        otherEarningsCents;

      const netCents = grossCents - deductionsCents;

      return await this.prisma.staffOffboarding.update({
        where: { id },
        data: {
          outstandingSalaryCents:
            dto.outstandingSalaryCents ?? existing.outstandingSalaryCents,
          leavePayoutCents: dto.leavePayoutCents ?? existing.leavePayoutCents,
          leaveBalanceDays: dto.leaveBalanceDays ?? existing.leaveBalanceDays,
          noticePayCents: dto.noticePayCents ?? existing.noticePayCents,
          proRataBonusCents:
            dto.proRataBonusCents ?? existing.proRataBonusCents,
          otherEarningsCents:
            dto.otherEarningsCents ?? existing.otherEarningsCents,
          deductionsCents: dto.deductionsCents ?? existing.deductionsCents,
          finalPayGrossCents: grossCents,
          finalPayNetCents: netCents,
          status: StaffOffboardingStatus.PENDING_FINAL_PAY,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update final pay ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateFinalPay',
        'Failed to update final pay',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Record document generation timestamp
   */
  async recordDocumentGenerated(
    id: string,
    documentType: 'ui19' | 'certificate' | 'irp5' | 'exitPack',
  ): Promise<StaffOffboarding> {
    try {
      const fieldMap: Record<string, string> = {
        ui19: 'ui19GeneratedAt',
        certificate: 'certificateGeneratedAt',
        irp5: 'irp5GeneratedAt',
        exitPack: 'exitPackGeneratedAt',
      };

      return await this.prisma.staffOffboarding.update({
        where: { id },
        data: {
          [fieldMap[documentType]]: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record document generation for ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'recordDocumentGenerated',
        'Failed to record document generation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Record exit interview
   */
  async recordExitInterview(
    id: string,
    interviewDate: Date,
    notes: string,
  ): Promise<StaffOffboarding> {
    try {
      return await this.prisma.staffOffboarding.update({
        where: { id },
        data: {
          exitInterviewDate: interviewDate,
          exitInterviewNotes: notes,
          exitInterviewCompleted: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record exit interview for ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'recordExitInterview',
        'Failed to record exit interview',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Complete the offboarding process
   */
  async completeOffboarding(
    id: string,
    completedBy: string,
    notes?: string,
  ): Promise<StaffOffboarding> {
    try {
      return await this.prisma.staffOffboarding.update({
        where: { id },
        data: {
          status: StaffOffboardingStatus.COMPLETED,
          completedAt: new Date(),
          completedBy,
          notes: notes ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to complete offboarding ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'completeOffboarding',
        'Failed to complete offboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Cancel an offboarding
   */
  async cancelOffboarding(
    id: string,
    reason?: string,
  ): Promise<StaffOffboarding> {
    try {
      return await this.prisma.staffOffboarding.update({
        where: { id },
        data: {
          status: StaffOffboardingStatus.CANCELLED,
          notes: reason ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to cancel offboarding ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'cancelOffboarding',
        'Failed to cancel offboarding',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // Asset Return Operations
  // ============================================

  /**
   * Add an asset to the return checklist
   */
  async createAssetReturn(
    offboardingId: string,
    dto: AddAssetReturnDto,
  ): Promise<AssetReturn> {
    try {
      return await this.prisma.assetReturn.create({
        data: {
          offboardingId,
          assetType: dto.assetType,
          assetDescription: dto.assetDescription,
          serialNumber: dto.serialNumber ?? null,
          status: AssetReturnStatus.PENDING,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create asset return for offboarding ${offboardingId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('StaffOffboarding', offboardingId);
        }
      }
      throw new DatabaseException(
        'createAssetReturn',
        'Failed to create asset return',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all asset returns for an offboarding
   */
  async findAssetReturnsByOffboarding(
    offboardingId: string,
  ): Promise<AssetReturn[]> {
    try {
      return await this.prisma.assetReturn.findMany({
        where: { offboardingId },
        orderBy: { assetType: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find asset returns for offboarding ${offboardingId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findAssetReturnsByOffboarding',
        'Failed to find asset returns',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark an asset as returned
   */
  async markAssetReturned(
    id: string,
    checkedBy: string,
    notes?: string,
  ): Promise<AssetReturn> {
    try {
      return await this.prisma.assetReturn.update({
        where: { id },
        data: {
          status: AssetReturnStatus.RETURNED,
          returnedAt: new Date(),
          checkedBy,
          notes: notes ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to mark asset ${id} as returned`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markAssetReturned',
        'Failed to mark asset as returned',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an asset return record
   */
  async updateAssetReturn(
    id: string,
    dto: UpdateAssetReturnDto,
  ): Promise<AssetReturn> {
    try {
      const updateData: Prisma.AssetReturnUpdateInput = {};

      if (dto.status !== undefined) {
        updateData.status = dto.status;
        if (dto.status === AssetReturnStatus.RETURNED) {
          updateData.returnedAt = new Date();
        }
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      return await this.prisma.assetReturn.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update asset return ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateAssetReturn',
        'Failed to update asset return',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete an asset return record
   */
  async deleteAssetReturn(id: string): Promise<void> {
    try {
      await this.prisma.assetReturn.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete asset return ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteAssetReturn',
        'Failed to delete asset return',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // Statistics and Reporting
  // ============================================

  /**
   * Get offboarding statistics for a tenant
   */
  async getOffboardingStats(tenantId: string): Promise<{
    total: number;
    initiated: number;
    inProgress: number;
    pendingFinalPay: number;
    completed: number;
    cancelled: number;
    byReason: Record<OffboardingReason, number>;
  }> {
    try {
      const [counts, reasonCounts] = await Promise.all([
        this.prisma.staffOffboarding.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
        this.prisma.staffOffboarding.groupBy({
          by: ['reason'],
          where: { tenantId },
          _count: true,
        }),
      ]);

      const statusMap: Record<string, number> = {};
      counts.forEach((c) => {
        statusMap[c.status] = c._count;
      });

      const reasonMap: Record<OffboardingReason, number> = {} as Record<
        OffboardingReason,
        number
      >;
      Object.values(OffboardingReason).forEach((reason) => {
        reasonMap[reason] = 0;
      });
      reasonCounts.forEach((c) => {
        reasonMap[c.reason as OffboardingReason] = c._count;
      });

      const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

      return {
        total,
        initiated: statusMap[StaffOffboardingStatus.INITIATED] ?? 0,
        inProgress: statusMap[StaffOffboardingStatus.IN_PROGRESS] ?? 0,
        pendingFinalPay:
          statusMap[StaffOffboardingStatus.PENDING_FINAL_PAY] ?? 0,
        completed: statusMap[StaffOffboardingStatus.COMPLETED] ?? 0,
        cancelled: statusMap[StaffOffboardingStatus.CANCELLED] ?? 0,
        byReason: reasonMap,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get offboarding stats for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getOffboardingStats',
        'Failed to get offboarding statistics',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get pending offboardings (not completed or cancelled)
   */
  async findPendingOffboardings(
    tenantId: string,
  ): Promise<OffboardingWithRelations[]> {
    try {
      return await this.prisma.staffOffboarding.findMany({
        where: {
          tenantId,
          status: {
            notIn: [
              StaffOffboardingStatus.COMPLETED,
              StaffOffboardingStatus.CANCELLED,
            ],
          },
        },
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              idNumber: true,
              basicSalaryCents: true,
            },
          },
          assetReturns: {
            orderBy: { assetType: 'asc' },
          },
        },
        orderBy: { lastWorkingDay: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending offboardings for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPendingOffboardings',
        'Failed to find pending offboardings',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find offboardings with upcoming last working day
   */
  async findUpcomingOffboardings(
    tenantId: string,
    daysAhead: number = 7,
  ): Promise<OffboardingWithRelations[]> {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + daysAhead);

      return await this.prisma.staffOffboarding.findMany({
        where: {
          tenantId,
          status: {
            notIn: [
              StaffOffboardingStatus.COMPLETED,
              StaffOffboardingStatus.CANCELLED,
            ],
          },
          lastWorkingDay: {
            gte: today,
            lte: futureDate,
          },
        },
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
              idNumber: true,
              basicSalaryCents: true,
            },
          },
          assetReturns: {
            orderBy: { assetType: 'asc' },
          },
        },
        orderBy: { lastWorkingDay: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find upcoming offboardings for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findUpcomingOffboardings',
        'Failed to find upcoming offboardings',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
