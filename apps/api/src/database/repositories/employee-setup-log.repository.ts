/**
 * Employee Setup Log Repository
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Manages persistence of employee setup pipeline logs and status tracking.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetupStatus, Prisma } from '@prisma/client';
import type { EmployeeSetupLog } from '@prisma/client';
import {
  SetupStepResult,
  SetupError,
  SetupWarning,
  createInitialStepResults,
} from '../entities/employee-setup-log.entity';
import { NotFoundException } from '../../shared/exceptions';

/**
 * Create setup log input
 */
export interface CreateSetupLogInput {
  tenantId: string;
  staffId: string;
  triggeredBy: string;
  simplePayEmployeeId?: string;
  status?: SetupStatus;
  setupSteps?: SetupStepResult[];
}

/**
 * Update setup log input
 */
export interface UpdateSetupLogInput {
  status?: SetupStatus;
  simplePayEmployeeId?: string;
  setupSteps?: SetupStepResult[];
  profileAssigned?: string;
  leaveInitialized?: boolean;
  taxConfigured?: boolean;
  calculationsAdded?: number;
  errors?: SetupError[];
  warnings?: SetupWarning[];
  completedAt?: Date;
}

/**
 * Setup log filter
 */
export interface SetupLogFilter {
  status?: SetupStatus;
  staffId?: string;
  triggeredBy?: string;
  skip?: number;
  take?: number;
}

/**
 * Helper to convert array to Prisma JSON value
 */
function toJsonValue(
  value: SetupStepResult[] | SetupError[] | SetupWarning[] | undefined | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class EmployeeSetupLogRepository {
  private readonly logger = new Logger(EmployeeSetupLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new setup log
   */
  async create(input: CreateSetupLogInput): Promise<EmployeeSetupLog> {
    const setupSteps = input.setupSteps || createInitialStepResults();

    return this.prisma.employeeSetupLog.create({
      data: {
        tenantId: input.tenantId,
        staffId: input.staffId,
        triggeredBy: input.triggeredBy,
        simplePayEmployeeId: input.simplePayEmployeeId || null,
        status: input.status || SetupStatus.PENDING,
        setupSteps: toJsonValue(setupSteps) ?? Prisma.JsonNull,
        profileAssigned: null,
        leaveInitialized: false,
        taxConfigured: false,
        calculationsAdded: 0,
        errors: Prisma.JsonNull,
        warnings: Prisma.JsonNull,
        startedAt: new Date(),
        completedAt: null,
      },
    });
  }

  /**
   * Update a setup log
   */
  async update(
    id: string,
    input: UpdateSetupLogInput,
  ): Promise<EmployeeSetupLog> {
    const data: Prisma.EmployeeSetupLogUpdateInput = {};

    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.simplePayEmployeeId !== undefined) {
      data.simplePayEmployeeId = input.simplePayEmployeeId;
    }
    if (input.setupSteps !== undefined) {
      data.setupSteps = toJsonValue(input.setupSteps);
    }
    if (input.profileAssigned !== undefined) {
      data.profileAssigned = input.profileAssigned;
    }
    if (input.leaveInitialized !== undefined) {
      data.leaveInitialized = input.leaveInitialized;
    }
    if (input.taxConfigured !== undefined) {
      data.taxConfigured = input.taxConfigured;
    }
    if (input.calculationsAdded !== undefined) {
      data.calculationsAdded = input.calculationsAdded;
    }
    if (input.errors !== undefined) {
      data.errors = toJsonValue(input.errors);
    }
    if (input.warnings !== undefined) {
      data.warnings = toJsonValue(input.warnings);
    }
    if (input.completedAt !== undefined) {
      data.completedAt = input.completedAt;
    }

    return this.prisma.employeeSetupLog.update({
      where: { id },
      data,
    });
  }

  /**
   * Find setup log by ID with tenant isolation
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   * @returns EmployeeSetupLog or null if not found or tenant mismatch
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<EmployeeSetupLog | null> {
    return this.prisma.employeeSetupLog.findFirst({
      where: { id, tenantId },
    });
  }

  /**
   * Find setup log by staff ID
   */
  async findByStaffId(staffId: string): Promise<EmployeeSetupLog | null> {
    return this.prisma.employeeSetupLog.findUnique({
      where: { staffId },
    });
  }

  /**
   * Find setup logs by tenant
   */
  async findByTenant(
    tenantId: string,
    filter?: SetupLogFilter,
  ): Promise<{ data: EmployeeSetupLog[]; total: number }> {
    const where: Prisma.EmployeeSetupLogWhereInput = {
      tenantId,
      ...(filter?.status && { status: filter.status }),
      ...(filter?.staffId && { staffId: filter.staffId }),
      ...(filter?.triggeredBy && { triggeredBy: filter.triggeredBy }),
    };

    const [data, total] = await Promise.all([
      this.prisma.employeeSetupLog.findMany({
        where,
        skip: filter?.skip,
        take: filter?.take,
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.employeeSetupLog.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find pending setup logs for a tenant
   */
  async findPendingSetups(tenantId: string): Promise<EmployeeSetupLog[]> {
    return this.prisma.employeeSetupLog.findMany({
      where: {
        tenantId,
        status: {
          in: [SetupStatus.PENDING, SetupStatus.IN_PROGRESS],
        },
      },
      orderBy: { startedAt: 'asc' },
    });
  }

  /**
   * Find failed setup logs for retry
   */
  async findFailedSetups(tenantId: string): Promise<EmployeeSetupLog[]> {
    return this.prisma.employeeSetupLog.findMany({
      where: {
        tenantId,
        status: {
          in: [
            SetupStatus.FAILED,
            SetupStatus.PARTIAL,
            SetupStatus.ROLLED_BACK,
          ],
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Mark setup as in progress
   */
  async markInProgress(id: string): Promise<EmployeeSetupLog> {
    return this.prisma.employeeSetupLog.update({
      where: { id },
      data: {
        status: SetupStatus.IN_PROGRESS,
      },
    });
  }

  /**
   * Mark setup as completed
   */
  async markCompleted(
    id: string,
    data: {
      simplePayEmployeeId?: string;
      profileAssigned?: string;
      leaveInitialized?: boolean;
      taxConfigured?: boolean;
      calculationsAdded?: number;
      setupSteps?: SetupStepResult[];
      warnings?: SetupWarning[];
    },
  ): Promise<EmployeeSetupLog> {
    return this.prisma.employeeSetupLog.update({
      where: { id },
      data: {
        status: SetupStatus.COMPLETED,
        completedAt: new Date(),
        simplePayEmployeeId: data.simplePayEmployeeId,
        profileAssigned: data.profileAssigned,
        leaveInitialized: data.leaveInitialized ?? false,
        taxConfigured: data.taxConfigured ?? false,
        calculationsAdded: data.calculationsAdded ?? 0,
        setupSteps: toJsonValue(data.setupSteps),
        warnings: toJsonValue(data.warnings),
      },
    });
  }

  /**
   * Mark setup as failed
   */
  async markFailed(
    id: string,
    data: {
      setupSteps?: SetupStepResult[];
      errors?: SetupError[];
      warnings?: SetupWarning[];
      simplePayEmployeeId?: string;
      profileAssigned?: string;
      leaveInitialized?: boolean;
      taxConfigured?: boolean;
      calculationsAdded?: number;
    },
  ): Promise<EmployeeSetupLog> {
    // Determine if partial (some steps completed) or failed (no steps completed)
    let status: SetupStatus = SetupStatus.FAILED;
    if (data.setupSteps) {
      const completedCount = data.setupSteps.filter(
        (s) => s.status === 'completed',
      ).length;
      if (completedCount > 0) {
        status = SetupStatus.PARTIAL;
      }
    }

    return this.prisma.employeeSetupLog.update({
      where: { id },
      data: {
        status,
        completedAt: new Date(),
        setupSteps: toJsonValue(data.setupSteps),
        errors: toJsonValue(data.errors),
        warnings: toJsonValue(data.warnings),
        simplePayEmployeeId: data.simplePayEmployeeId,
        profileAssigned: data.profileAssigned,
        leaveInitialized: data.leaveInitialized ?? false,
        taxConfigured: data.taxConfigured ?? false,
        calculationsAdded: data.calculationsAdded ?? 0,
      },
    });
  }

  /**
   * Mark setup as rolled back
   */
  async markRolledBack(
    id: string,
    setupSteps: SetupStepResult[],
    errors: SetupError[],
  ): Promise<EmployeeSetupLog> {
    return this.prisma.employeeSetupLog.update({
      where: { id },
      data: {
        status: SetupStatus.ROLLED_BACK,
        completedAt: new Date(),
        setupSteps: toJsonValue(setupSteps),
        errors: toJsonValue(errors),
      },
    });
  }

  /**
   * Delete setup log with tenant isolation
   * Uses deleteMany with tenant filter for atomic cross-tenant protection
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   * @throws NotFoundException if record not found or tenant mismatch (same error to prevent enumeration)
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const result = await this.prisma.employeeSetupLog.deleteMany({
      where: {
        id,
        tenantId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('EmployeeSetupLog', id);
    }
  }

  /**
   * Delete setup log by staff ID with tenant isolation
   * @param staffId - Staff ID
   * @param tenantId - Tenant ID for isolation
   */
  async deleteByStaffId(staffId: string, tenantId: string): Promise<void> {
    await this.prisma.employeeSetupLog.deleteMany({
      where: { staffId, tenantId },
    });
  }

  /**
   * Check if staff has an existing setup log
   */
  async existsForStaff(staffId: string): Promise<boolean> {
    const count = await this.prisma.employeeSetupLog.count({
      where: { staffId },
    });
    return count > 0;
  }

  /**
   * Get setup statistics for a tenant
   */
  async getStatistics(tenantId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    partial: number;
    failed: number;
    rolledBack: number;
  }> {
    const counts = await this.prisma.employeeSetupLog.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    });

    const stats = {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      partial: 0,
      failed: 0,
      rolledBack: 0,
    };

    for (const count of counts) {
      stats.total += count._count;
      switch (count.status) {
        case 'PENDING':
          stats.pending = count._count;
          break;
        case 'IN_PROGRESS':
          stats.inProgress = count._count;
          break;
        case 'COMPLETED':
          stats.completed = count._count;
          break;
        case 'PARTIAL':
          stats.partial = count._count;
          break;
        case 'FAILED':
          stats.failed = count._count;
          break;
        case 'ROLLED_BACK':
          stats.rolledBack = count._count;
          break;
      }
    }

    return stats;
  }
}
