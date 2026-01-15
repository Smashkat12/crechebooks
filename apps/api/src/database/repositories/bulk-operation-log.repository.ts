/**
 * Bulk Operation Log Repository
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  BulkOperationType,
  BulkOperationStatus,
  IBulkOperationLog,
} from '../entities/bulk-operation-log.entity';
import { NotFoundException } from '../../shared/exceptions';

@Injectable()
export class BulkOperationLogRepository {
  private readonly logger = new Logger(BulkOperationLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new bulk operation log
   */
  async create(data: {
    tenantId: string;
    operationType: BulkOperationType;
    totalEntities: number;
    requestData: Prisma.InputJsonValue;
    executedBy: string;
  }): Promise<IBulkOperationLog> {
    try {
      return await this.prisma.bulkOperationLog.create({
        data: {
          tenantId: data.tenantId,
          operationType: data.operationType,
          totalEntities: data.totalEntities,
          requestData: data.requestData,
          executedBy: data.executedBy,
          status: BulkOperationStatus.PENDING,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Tenant', data.tenantId);
      }
      throw error;
    }
  }

  /**
   * Update a bulk operation log
   */
  async update(
    id: string,
    data: {
      status?: BulkOperationStatus;
      successCount?: number;
      failureCount?: number;
      resultData?: Prisma.InputJsonValue;
      errors?: Prisma.InputJsonValue;
      warnings?: Prisma.InputJsonValue;
      completedAt?: Date;
    },
  ): Promise<IBulkOperationLog> {
    const existing = await this.prisma.bulkOperationLog.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('BulkOperationLog', id);
    }

    return this.prisma.bulkOperationLog.update({
      where: { id },
      data,
    });
  }

  /**
   * Mark operation as processing
   */
  async markProcessing(id: string): Promise<IBulkOperationLog> {
    return this.update(id, { status: BulkOperationStatus.PROCESSING });
  }

  /**
   * Mark operation as completed with results
   */
  async markCompleted(
    id: string,
    data: {
      successCount: number;
      failureCount: number;
      resultData: Prisma.InputJsonValue;
      errors?: Prisma.InputJsonValue;
      warnings?: Prisma.InputJsonValue;
    },
  ): Promise<IBulkOperationLog> {
    const status =
      data.failureCount === 0
        ? BulkOperationStatus.COMPLETED
        : data.successCount > 0
          ? BulkOperationStatus.PARTIAL_FAILURE
          : BulkOperationStatus.FAILED;

    return this.update(id, {
      status,
      successCount: data.successCount,
      failureCount: data.failureCount,
      resultData: data.resultData,
      errors: data.errors,
      warnings: data.warnings,
      completedAt: new Date(),
    });
  }

  /**
   * Mark operation as failed
   */
  async markFailed(
    id: string,
    errors: Prisma.InputJsonValue,
  ): Promise<IBulkOperationLog> {
    return this.update(id, {
      status: BulkOperationStatus.FAILED,
      failureCount: 1,
      errors,
      completedAt: new Date(),
    });
  }

  /**
   * Find by ID with tenant isolation
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   * @returns IBulkOperationLog or null if not found or tenant mismatch
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<IBulkOperationLog | null> {
    return this.prisma.bulkOperationLog.findFirst({
      where: { id, tenantId },
    });
  }

  /**
   * Find by ID or throw
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   */
  async findByIdOrThrow(
    id: string,
    tenantId: string,
  ): Promise<IBulkOperationLog> {
    const log = await this.findById(id, tenantId);
    if (!log) {
      throw new NotFoundException('BulkOperationLog', id);
    }
    return log;
  }

  /**
   * Find by tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    options?: {
      operationType?: BulkOperationType;
      status?: BulkOperationStatus;
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: IBulkOperationLog[]; total: number }> {
    const where: Prisma.BulkOperationLogWhereInput = {
      tenantId,
      ...(options?.operationType && { operationType: options.operationType }),
      ...(options?.status && { status: options.status }),
      ...(options?.fromDate &&
        options?.toDate && {
          startedAt: {
            gte: options.fromDate,
            lte: options.toDate,
          },
        }),
      ...(options?.fromDate &&
        !options?.toDate && {
          startedAt: { gte: options.fromDate },
        }),
      ...(!options?.fromDate &&
        options?.toDate && {
          startedAt: { lte: options.toDate },
        }),
    };

    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.bulkOperationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.bulkOperationLog.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find recent operations for tenant
   */
  async findRecentByTenant(
    tenantId: string,
    limit: number = 10,
  ): Promise<IBulkOperationLog[]> {
    return this.prisma.bulkOperationLog.findMany({
      where: { tenantId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Count by tenant and status
   */
  async countByTenantAndStatus(
    tenantId: string,
  ): Promise<Record<BulkOperationStatus, number>> {
    const counts = await this.prisma.bulkOperationLog.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    });

    const result: Record<BulkOperationStatus, number> = {
      [BulkOperationStatus.PENDING]: 0,
      [BulkOperationStatus.PROCESSING]: 0,
      [BulkOperationStatus.COMPLETED]: 0,
      [BulkOperationStatus.PARTIAL_FAILURE]: 0,
      [BulkOperationStatus.FAILED]: 0,
    };

    for (const item of counts) {
      result[item.status as BulkOperationStatus] = item._count;
    }

    return result;
  }

  /**
   * Get operation statistics for tenant
   */
  async getStatsByTenant(
    tenantId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<{
    totalOperations: number;
    totalEntitiesProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    byOperationType: Record<BulkOperationType, number>;
  }> {
    const where: Prisma.BulkOperationLogWhereInput = {
      tenantId,
      ...(fromDate &&
        toDate && {
          startedAt: { gte: fromDate, lte: toDate },
        }),
    };

    const [totals, byType] = await Promise.all([
      this.prisma.bulkOperationLog.aggregate({
        where,
        _count: true,
        _sum: {
          totalEntities: true,
          successCount: true,
          failureCount: true,
        },
      }),
      this.prisma.bulkOperationLog.groupBy({
        by: ['operationType'],
        where,
        _count: true,
      }),
    ]);

    const byOperationType: Record<BulkOperationType, number> = {
      [BulkOperationType.GENERIC_INPUT]: 0,
      [BulkOperationType.SALARY_ADJUSTMENT]: 0,
      [BulkOperationType.BONUS_DISTRIBUTION]: 0,
      [BulkOperationType.DEDUCTION_SETUP]: 0,
      [BulkOperationType.EMPLOYEE_UPDATE]: 0,
    };

    for (const item of byType) {
      byOperationType[item.operationType as BulkOperationType] = item._count;
    }

    return {
      totalOperations: totals._count,
      totalEntitiesProcessed: totals._sum.totalEntities ?? 0,
      totalSuccessful: totals._sum.successCount ?? 0,
      totalFailed: totals._sum.failureCount ?? 0,
      byOperationType,
    };
  }

  /**
   * Delete old logs (for cleanup)
   */
  async deleteOlderThan(tenantId: string, cutoffDate: Date): Promise<number> {
    const result = await this.prisma.bulkOperationLog.deleteMany({
      where: {
        tenantId,
        startedAt: { lt: cutoffDate },
        status: {
          in: [
            BulkOperationStatus.COMPLETED,
            BulkOperationStatus.FAILED,
            BulkOperationStatus.PARTIAL_FAILURE,
          ],
        },
      },
    });

    return result.count;
  }
}
