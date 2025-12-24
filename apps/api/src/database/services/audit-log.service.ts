/**
 * Audit Log Service
 * TASK-CORE-004: Audit Log Entity and Trail System
 *
 * @module database/services/audit-log
 * @description Service for creating immutable audit log entries.
 * This service provides convenience methods for logging entity changes.
 * NOTE: This is a SERVICE (business logic), not a REPOSITORY (data access).
 */

import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../entities/audit-log.entity';
import { DatabaseException, NotFoundException } from '../../shared/exceptions';
import {
  AuditLogQueryOptions,
  AuditLogPaginatedResult,
  ExportFormat,
} from '../dto/audit-log.dto';

interface LogCreateParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  afterValue: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

interface LogUpdateParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  beforeValue: Prisma.InputJsonValue;
  afterValue: Prisma.InputJsonValue;
  changeSummary?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LogDeleteParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  beforeValue: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

interface LogActionParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  changeSummary?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a CREATE action
   * @param params - Create action parameters
   * @returns Created audit log entry
   * @throws DatabaseException on database errors
   */
  async logCreate(params: LogCreateParams): Promise<AuditLog> {
    return this.logAction({
      ...params,
      action: AuditAction.CREATE,
      beforeValue: undefined,
    });
  }

  /**
   * Log an UPDATE action
   * @param params - Update action parameters
   * @returns Created audit log entry
   * @throws DatabaseException on database errors
   */
  async logUpdate(params: LogUpdateParams): Promise<AuditLog> {
    return this.logAction({
      ...params,
      action: AuditAction.UPDATE,
    });
  }

  /**
   * Log a DELETE action
   * @param params - Delete action parameters
   * @returns Created audit log entry
   * @throws DatabaseException on database errors
   */
  async logDelete(params: LogDeleteParams): Promise<AuditLog> {
    return this.logAction({
      ...params,
      action: AuditAction.DELETE,
      afterValue: undefined,
    });
  }

  /**
   * Log any audit action
   * @param params - Action parameters including action type
   * @returns Created audit log entry
   * @throws DatabaseException on database errors
   */
  async logAction(params: LogActionParams): Promise<AuditLog> {
    try {
      return await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId ?? null,
          agentId: params.agentId ?? null,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          beforeValue: params.beforeValue ?? Prisma.DbNull,
          afterValue: params.afterValue ?? Prisma.DbNull,
          changeSummary: params.changeSummary ?? null,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${JSON.stringify(params)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'logAction',
        'Failed to create audit log',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get complete audit history for an entity
   * @param tenantId - Tenant ID for isolation
   * @param entityType - Type of entity (e.g., 'Transaction')
   * @param entityId - ID of the entity
   * @returns Array of audit log entries in descending order by createdAt
   * @throws DatabaseException on database errors
   */
  async getEntityHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    try {
      return await this.prisma.auditLog.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get entity history: ${tenantId}/${entityType}/${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getEntityHistory',
        'Failed to get entity history',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // TASK-RECON-034: Pagination and Filtering
  // ============================================

  /**
   * Find all audit logs with pagination and filtering
   * @param tenantId - Tenant ID for isolation
   * @param options - Query options for pagination and filtering
   * @returns Paginated result with audit logs
   */
  async findAll(
    tenantId: string,
    options: AuditLogQueryOptions = {},
  ): Promise<AuditLogPaginatedResult<AuditLog>> {
    const {
      offset = 0,
      limit = 50,
      startDate,
      endDate,
      entityType,
      action,
      userId,
      entityId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    // Enforce max limit
    const safeLimit = Math.min(limit, 500);

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && {
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          lte: new Date(endDate),
        },
      }),
      ...(entityType && { entityType }),
      ...(action && { action: action as AuditAction }),
      ...(userId && { userId }),
      ...(entityId && { entityId }),
    };

    try {
      // Execute count and data queries in parallel
      const [total, data] = await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.findMany({
          where,
          skip: offset,
          take: safeLimit,
          orderBy: { [sortBy]: sortOrder },
        }),
      ]);

      return {
        data,
        total,
        offset,
        limit: safeLimit,
        hasMore: offset + data.length < total,
      };
    } catch (error) {
      this.logger.error(
        `Failed to find audit logs: ${JSON.stringify(options)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findAll',
        'Failed to find audit logs',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get a single audit log by ID
   * @param tenantId - Tenant ID for isolation
   * @param id - Audit log ID
   * @returns Audit log entry
   * @throws NotFoundException if not found
   */
  async getById(tenantId: string, id: string): Promise<AuditLog> {
    try {
      const log = await this.prisma.auditLog.findFirst({
        where: { id, tenantId },
      });

      if (!log) {
        throw new NotFoundException('AuditLog', id);
      }

      return log;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to get audit log by ID: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getById',
        'Failed to get audit log',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get all audit logs for a specific entity
   * @param tenantId - Tenant ID for isolation
   * @param entityId - Entity ID to filter by
   * @returns Array of audit log entries
   */
  async getByEntityId(tenantId: string, entityId: string): Promise<AuditLog[]> {
    try {
      return await this.prisma.auditLog.findMany({
        where: { tenantId, entityId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get audit logs by entity ID: ${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getByEntityId',
        'Failed to get audit logs by entity ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Export audit logs to CSV or JSON format
   * @param tenantId - Tenant ID for isolation
   * @param options - Query options for filtering
   * @param format - Export format (csv or json)
   * @returns Buffer containing the exported data
   */
  async export(
    tenantId: string,
    options: AuditLogQueryOptions,
    format: ExportFormat = 'csv',
  ): Promise<Buffer> {
    // For exports, remove pagination limits but enforce date range
    const exportOptions = {
      ...options,
      offset: 0,
      limit: 10000, // Max records for export
    };

    const { data } = await this.findAll(tenantId, exportOptions);

    if (format === 'json') {
      return Buffer.from(JSON.stringify(data, null, 2));
    }

    // CSV format
    const headers = [
      'id',
      'createdAt',
      'entityType',
      'entityId',
      'action',
      'userId',
      'agentId',
      'changeSummary',
      'ipAddress',
    ];

    const rows = data.map((log) => [
      log.id,
      log.createdAt.toISOString(),
      log.entityType,
      log.entityId,
      log.action,
      log.userId || '',
      log.agentId || '',
      (log.changeSummary || '').replace(/"/g, '""'),
      log.ipAddress || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return Buffer.from(csvContent);
  }
}
