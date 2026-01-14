/**
 * Service Period Sync Repository
 * TASK-SPAY-004: SimplePay Service Period Management
 *
 * Repository for managing service period synchronization between
 * CrecheBooks and SimplePay, including termination and reinstatement tracking.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ServicePeriodSync, Prisma, TerminationCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateServicePeriodSyncDto,
  UpdateServicePeriodSyncDto,
  ServicePeriodFilterDto,
} from '../dto/service-period.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class ServicePeriodSyncRepository {
  private readonly logger = new Logger(ServicePeriodSyncRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new service period sync record
   * @throws ConflictException if duplicate for tenant/staff/period combination
   * @throws NotFoundException if tenant or staff doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateServicePeriodSyncDto): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayEmployeeId: dto.simplePayEmployeeId,
          simplePayPeriodId: dto.simplePayPeriodId,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          terminationCode: dto.terminationCode ?? null,
          terminationReason: dto.terminationReason ?? null,
          lastWorkingDay: dto.lastWorkingDay ?? null,
          finalPayslipId: dto.finalPayslipId ?? null,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create service period sync: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Service period sync already exists for staff ${dto.staffId} with period ${dto.simplePayPeriodId}`,
            {
              staffId: dto.staffId,
              simplePayPeriodId: dto.simplePayPeriodId,
              tenantId: dto.tenantId,
            },
          );
        }
        if (error.code === 'P2003') {
          // Foreign key constraint - check which one failed
          const meta = error.meta as { field_name?: string } | undefined;
          const field = meta?.field_name;
          if (field?.includes('tenant')) {
            throw new NotFoundException('Tenant', dto.tenantId);
          }
          if (field?.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
          throw new NotFoundException('Related entity', 'unknown');
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create service period sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find service period sync by ID
   * @returns ServicePeriodSync or null if not found
   */
  async findById(id: string): Promise<ServicePeriodSync | null> {
    try {
      return await this.prisma.servicePeriodSync.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find service period sync by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find service period sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find service period sync by ID or throw NotFoundException
   */
  async findByIdOrThrow(id: string): Promise<ServicePeriodSync> {
    const sync = await this.findById(id);
    if (!sync) {
      throw new NotFoundException('ServicePeriodSync', id);
    }
    return sync;
  }

  /**
   * Find all service period syncs for a staff member
   */
  async findByStaff(
    tenantId: string,
    staffId: string,
  ): Promise<ServicePeriodSync[]> {
    try {
      return await this.prisma.servicePeriodSync.findMany({
        where: { tenantId, staffId },
        orderBy: { startDate: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find service period syncs for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStaff',
        'Failed to find service period syncs for staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find the active service period for a staff member
   */
  async findActiveByStaff(
    tenantId: string,
    staffId: string,
  ): Promise<ServicePeriodSync | null> {
    try {
      return await this.prisma.servicePeriodSync.findFirst({
        where: {
          tenantId,
          staffId,
          isActive: true,
        },
        orderBy: { startDate: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find active service period for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findActiveByStaff',
        'Failed to find active service period for staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find service period by SimplePay period ID
   */
  async findBySimplePayPeriodId(
    tenantId: string,
    staffId: string,
    simplePayPeriodId: string,
  ): Promise<ServicePeriodSync | null> {
    try {
      return await this.prisma.servicePeriodSync.findUnique({
        where: {
          tenantId_staffId_simplePayPeriodId: {
            tenantId,
            staffId,
            simplePayPeriodId,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find service period by SimplePay ID: ${simplePayPeriodId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findBySimplePayPeriodId',
        'Failed to find service period by SimplePay ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all service periods for a tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    filter?: ServicePeriodFilterDto,
  ): Promise<ServicePeriodSync[]> {
    try {
      const where: Prisma.ServicePeriodSyncWhereInput = { tenantId };

      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.staffId) {
        where.staffId = filter.staffId;
      }
      if (filter?.terminationCode) {
        where.terminationCode = filter.terminationCode;
      }
      if (filter?.startDateFrom || filter?.startDateTo) {
        where.startDate = {};
        if (filter.startDateFrom) {
          where.startDate.gte = filter.startDateFrom;
        }
        if (filter.startDateTo) {
          where.startDate.lte = filter.startDateTo;
        }
      }
      if (filter?.endDateFrom || filter?.endDateTo) {
        where.endDate = {};
        if (filter.endDateFrom) {
          where.endDate.gte = filter.endDateFrom;
        }
        if (filter.endDateTo) {
          where.endDate.lte = filter.endDateTo;
        }
      }

      const page = filter?.page ?? 1;
      const limit = filter?.limit ?? 20;

      return await this.prisma.servicePeriodSync.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to find service period syncs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find service period syncs for tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count service periods for a tenant with optional filters
   */
  async countByTenant(
    tenantId: string,
    filter?: ServicePeriodFilterDto,
  ): Promise<number> {
    try {
      const where: Prisma.ServicePeriodSyncWhereInput = { tenantId };

      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.staffId) {
        where.staffId = filter.staffId;
      }
      if (filter?.terminationCode) {
        where.terminationCode = filter.terminationCode;
      }

      return await this.prisma.servicePeriodSync.count({ where });
    } catch (error) {
      this.logger.error(
        `Failed to count service period syncs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countByTenant',
        'Failed to count service period syncs',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a service period sync record
   */
  async update(
    id: string,
    dto: UpdateServicePeriodSyncDto,
  ): Promise<ServicePeriodSync> {
    try {
      const updateData: Prisma.ServicePeriodSyncUpdateInput = {};

      if (dto.endDate !== undefined) updateData.endDate = dto.endDate;
      if (dto.terminationCode !== undefined)
        updateData.terminationCode = dto.terminationCode;
      if (dto.terminationReason !== undefined)
        updateData.terminationReason = dto.terminationReason;
      if (dto.lastWorkingDay !== undefined)
        updateData.lastWorkingDay = dto.lastWorkingDay;
      if (dto.finalPayslipId !== undefined)
        updateData.finalPayslipId = dto.finalPayslipId;
      if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

      return await this.prisma.servicePeriodSync.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('ServicePeriodSync', id);
        }
      }
      this.logger.error(
        `Failed to update service period sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update service period sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark a service period as terminated
   */
  async markTerminated(
    id: string,
    terminationCode: TerminationCode,
    endDate: Date,
    lastWorkingDay: Date,
    terminationReason: string | null,
    finalPayslipId: string | null,
  ): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.update({
        where: { id },
        data: {
          terminationCode,
          endDate,
          lastWorkingDay,
          terminationReason,
          finalPayslipId,
          isActive: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('ServicePeriodSync', id);
        }
      }
      this.logger.error(
        `Failed to mark service period sync ${id} as terminated`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markTerminated',
        'Failed to mark service period as terminated',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Undo termination - clear termination fields and reactivate
   * Only allowed if final pay has not been processed
   */
  async undoTermination(id: string): Promise<ServicePeriodSync> {
    try {
      // First check if we can undo (final payslip not processed)
      const existing = await this.findByIdOrThrow(id);

      if (existing.finalPayslipId) {
        throw new ConflictException(
          'Cannot undo termination - final payslip has been processed',
          {
            id,
            finalPayslipId: existing.finalPayslipId,
          },
        );
      }

      return await this.prisma.servicePeriodSync.update({
        where: { id },
        data: {
          terminationCode: null,
          endDate: null,
          lastWorkingDay: null,
          terminationReason: null,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('ServicePeriodSync', id);
        }
      }
      this.logger.error(
        `Failed to undo termination for service period sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'undoTermination',
        'Failed to undo termination',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a service period sync record
   * @throws NotFoundException if record doesn't exist
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.servicePeriodSync.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('ServicePeriodSync', id);
        }
      }
      this.logger.error(
        `Failed to delete service period sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete service period sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Upsert service period sync - create if not exists, update if exists
   */
  async upsert(dto: CreateServicePeriodSyncDto): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.upsert({
        where: {
          tenantId_staffId_simplePayPeriodId: {
            tenantId: dto.tenantId,
            staffId: dto.staffId,
            simplePayPeriodId: dto.simplePayPeriodId,
          },
        },
        create: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayEmployeeId: dto.simplePayEmployeeId,
          simplePayPeriodId: dto.simplePayPeriodId,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          terminationCode: dto.terminationCode ?? null,
          terminationReason: dto.terminationReason ?? null,
          lastWorkingDay: dto.lastWorkingDay ?? null,
          finalPayslipId: dto.finalPayslipId ?? null,
          isActive: dto.isActive ?? true,
        },
        update: {
          simplePayEmployeeId: dto.simplePayEmployeeId,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          terminationCode: dto.terminationCode ?? null,
          terminationReason: dto.terminationReason ?? null,
          lastWorkingDay: dto.lastWorkingDay ?? null,
          finalPayslipId: dto.finalPayslipId ?? null,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert service period sync: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const meta = error.meta as { field_name?: string } | undefined;
          const field = meta?.field_name;
          if (field?.includes('tenant')) {
            throw new NotFoundException('Tenant', dto.tenantId);
          }
          if (field?.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
        }
      }
      throw new DatabaseException(
        'upsert',
        'Failed to upsert service period sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all terminated service periods for a tenant within a date range
   * Useful for generating UI-19 reports
   */
  async findTerminatedByPeriod(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ServicePeriodSync[]> {
    try {
      return await this.prisma.servicePeriodSync.findMany({
        where: {
          tenantId,
          isActive: false,
          endDate: {
            gte: startDate,
            lte: endDate,
          },
          terminationCode: { not: null },
        },
        orderBy: { endDate: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find terminated service periods for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findTerminatedByPeriod',
        'Failed to find terminated service periods',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find service periods by termination code for reporting
   */
  async findByTerminationCode(
    tenantId: string,
    terminationCode: TerminationCode,
  ): Promise<ServicePeriodSync[]> {
    try {
      return await this.prisma.servicePeriodSync.findMany({
        where: {
          tenantId,
          terminationCode,
        },
        orderBy: { endDate: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find service periods by termination code: ${terminationCode}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTerminationCode',
        'Failed to find service periods by termination code',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
