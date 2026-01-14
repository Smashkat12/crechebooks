/**
 * Report Request Repository
 * TASK-SPAY-005: SimplePay Reports Management
 */

import { Injectable, Logger } from '@nestjs/common';
import { ReportRequest, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateReportRequestDto,
  ReportRequestFilterDto,
} from '../dto/reports.dto';
import {
  ReportStatus,
  ReportType,
  ReportResultInput,
} from '../entities/report-request.entity';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class ReportRequestRepository {
  private readonly logger = new Logger(ReportRequestRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new report request
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateReportRequestDto): Promise<ReportRequest> {
    try {
      return await this.prisma.reportRequest.create({
        data: {
          tenantId: dto.tenantId,
          reportType: dto.reportType,
          params: dto.params,
          status: ReportStatus.QUEUED,
          requestedBy: dto.requestedBy ?? null,
          requestedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create report request: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create report request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find report request by ID
   * @returns ReportRequest or null if not found
   */
  async findById(id: string): Promise<ReportRequest | null> {
    try {
      return await this.prisma.reportRequest.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find report request by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find report request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find report request by ID or throw NotFoundException
   */
  async findByIdOrThrow(id: string): Promise<ReportRequest> {
    const reportRequest = await this.findById(id);
    if (!reportRequest) {
      throw new NotFoundException('ReportRequest', id);
    }
    return reportRequest;
  }

  /**
   * Find report request by async UUID
   */
  async findByAsyncUuid(asyncUuid: string): Promise<ReportRequest | null> {
    try {
      return await this.prisma.reportRequest.findFirst({
        where: { asyncUuid },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find report request by async UUID: ${asyncUuid}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByAsyncUuid',
        'Failed to find report request by async UUID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all report requests for a tenant
   */
  async findByTenant(
    tenantId: string,
    filter?: ReportRequestFilterDto,
  ): Promise<ReportRequest[]> {
    try {
      const where: Prisma.ReportRequestWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status as Prisma.EnumReportStatusFilter;
      }
      if (filter?.reportType) {
        where.reportType = filter.reportType as Prisma.EnumReportTypeFilter;
      }
      if (filter?.requestedBy) {
        where.requestedBy = filter.requestedBy;
      }
      if (filter?.fromDate) {
        where.requestedAt = { gte: filter.fromDate };
      }
      if (filter?.toDate) {
        where.requestedAt = {
          ...((where.requestedAt as Prisma.DateTimeFilter) || {}),
          lte: filter.toDate,
        };
      }

      return await this.prisma.reportRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: filter?.page
          ? (filter.page - 1) * (filter.limit || 20)
          : undefined,
        take: filter?.limit || 20,
      });
    } catch (error) {
      this.logger.error(
        `Failed to find report requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find report requests for tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pending/processing report requests for a tenant
   */
  async findPending(tenantId: string): Promise<ReportRequest[]> {
    try {
      return await this.prisma.reportRequest.findMany({
        where: {
          tenantId,
          status: {
            in: [ReportStatus.QUEUED, ReportStatus.PROCESSING],
          },
        },
        orderBy: { requestedAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending report requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPending',
        'Failed to find pending report requests',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a report request
   */
  async update(
    id: string,
    data: {
      status?: ReportStatus;
      asyncUuid?: string;
      resultData?: ReportResultInput;
      errorMessage?: string;
      completedAt?: Date;
    },
  ): Promise<ReportRequest> {
    try {
      const updateData: Prisma.ReportRequestUpdateInput = {};

      if (data.status !== undefined) {
        updateData.status =
          data.status as Prisma.EnumReportStatusFieldUpdateOperationsInput['set'];
      }
      if (data.asyncUuid !== undefined) {
        updateData.asyncUuid = data.asyncUuid;
      }
      if (data.resultData !== undefined) {
        updateData.resultData = data.resultData;
      }
      if (data.errorMessage !== undefined) {
        updateData.errorMessage = data.errorMessage;
      }
      if (data.completedAt !== undefined) {
        updateData.completedAt = data.completedAt;
      }

      return await this.prisma.reportRequest.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('ReportRequest', id);
      }
      this.logger.error(
        `Failed to update report request ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update report request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark report as processing
   */
  async markProcessing(id: string, asyncUuid?: string): Promise<ReportRequest> {
    return this.update(id, {
      status: ReportStatus.PROCESSING,
      asyncUuid,
    });
  }

  /**
   * Mark report as completed with result data
   */
  async markCompleted(
    id: string,
    resultData: ReportResultInput,
  ): Promise<ReportRequest> {
    return this.update(id, {
      status: ReportStatus.COMPLETED,
      resultData,
      completedAt: new Date(),
    });
  }

  /**
   * Mark report as failed with error message
   */
  async markFailed(id: string, errorMessage: string): Promise<ReportRequest> {
    return this.update(id, {
      status: ReportStatus.FAILED,
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Delete a report request
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.reportRequest.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('ReportRequest', id);
      }
      this.logger.error(
        `Failed to delete report request ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete report request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete old report requests (older than specified days)
   */
  async deleteOldReports(
    tenantId: string,
    olderThanDays: number = 30,
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.reportRequest.deleteMany({
        where: {
          tenantId,
          requestedAt: { lt: cutoffDate },
          status: {
            in: [ReportStatus.COMPLETED, ReportStatus.FAILED],
          },
        },
      });

      this.logger.log(
        `Deleted ${result.count} old report requests for tenant ${tenantId}`,
      );

      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete old report requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteOldReports',
        'Failed to delete old report requests',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count report requests by tenant
   */
  async countByTenant(
    tenantId: string,
    filter?: ReportRequestFilterDto,
  ): Promise<number> {
    try {
      const where: Prisma.ReportRequestWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status as Prisma.EnumReportStatusFilter;
      }
      if (filter?.reportType) {
        where.reportType = filter.reportType as Prisma.EnumReportTypeFilter;
      }
      if (filter?.requestedBy) {
        where.requestedBy = filter.requestedBy;
      }
      if (filter?.fromDate) {
        where.requestedAt = { gte: filter.fromDate };
      }
      if (filter?.toDate) {
        where.requestedAt = {
          ...((where.requestedAt as Prisma.DateTimeFilter) || {}),
          lte: filter.toDate,
        };
      }

      return await this.prisma.reportRequest.count({ where });
    } catch (error) {
      this.logger.error(
        `Failed to count report requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countByTenant',
        'Failed to count report requests',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get report request statistics for a tenant
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    byStatus: Record<ReportStatus, number>;
    byType: Record<ReportType, number>;
  }> {
    try {
      const [total, statusCounts, typeCounts] = await Promise.all([
        this.prisma.reportRequest.count({ where: { tenantId } }),
        this.prisma.reportRequest.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: { status: true },
        }),
        this.prisma.reportRequest.groupBy({
          by: ['reportType'],
          where: { tenantId },
          _count: { reportType: true },
        }),
      ]);

      const byStatus = Object.values(ReportStatus).reduce(
        (acc, status) => {
          const found = statusCounts.find((s) => s.status === status);
          acc[status as ReportStatus] = found?._count?.status || 0;
          return acc;
        },
        {} as Record<ReportStatus, number>,
      );

      const byType = Object.values(ReportType).reduce(
        (acc, type) => {
          const found = typeCounts.find((t) => t.reportType === type);
          acc[type as ReportType] = found?._count?.reportType || 0;
          return acc;
        },
        {} as Record<ReportType, number>,
      );

      return { total, byStatus, byType };
    } catch (error) {
      this.logger.error(
        `Failed to get report statistics for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getStatistics',
        'Failed to get report statistics',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
