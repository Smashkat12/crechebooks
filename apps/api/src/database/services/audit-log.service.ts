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
import { DatabaseException } from '../../shared/exceptions';

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
}
