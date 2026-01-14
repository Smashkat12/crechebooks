/**
 * Leave Request Repository
 * TASK-SPAY-001: SimplePay Leave Management
 */

import { Injectable, Logger } from '@nestjs/common';
import { LeaveRequest, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeaveRequestDto,
  UpdateLeaveRequestDto,
  LeaveRequestFilterDto,
} from '../dto/leave.dto';
import { LeaveRequestStatus } from '../entities/leave-request.entity';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';
import Decimal from 'decimal.js';

@Injectable()
export class LeaveRequestRepository {
  private readonly logger = new Logger(LeaveRequestRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new leave request
   * @throws NotFoundException if tenant or staff doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    try {
      return await this.prisma.leaveRequest.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          leaveTypeId: dto.leaveTypeId,
          leaveTypeName: dto.leaveTypeName,
          startDate: dto.startDate,
          endDate: dto.endDate,
          totalDays: new Decimal(dto.totalDays),
          totalHours: new Decimal(dto.totalHours),
          reason: dto.reason ?? null,
          status: LeaveRequestStatus.PENDING,
          simplePaySynced: false,
          simplePayIds: [],
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create leave request: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          // Foreign key constraint failed
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
          // Default to tenant error if not staff-related FK
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find leave request by ID
   * @returns LeaveRequest or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<LeaveRequest | null> {
    try {
      return await this.prisma.leaveRequest.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find leave request by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find leave request by ID or throw NotFoundException
   */
  async findByIdOrThrow(id: string): Promise<LeaveRequest> {
    const leaveRequest = await this.findById(id);
    if (!leaveRequest) {
      throw new NotFoundException('LeaveRequest', id);
    }
    return leaveRequest;
  }

  /**
   * Find all leave requests for a staff member
   */
  async findByStaff(
    staffId: string,
    filter?: LeaveRequestFilterDto,
  ): Promise<LeaveRequest[]> {
    try {
      const where: Prisma.LeaveRequestWhereInput = { staffId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.leaveTypeId) {
        where.leaveTypeId = filter.leaveTypeId;
      }
      if (filter?.fromDate) {
        where.startDate = { gte: filter.fromDate };
      }
      if (filter?.toDate) {
        where.endDate = { lte: filter.toDate };
      }
      if (filter?.simplePaySynced !== undefined) {
        where.simplePaySynced = filter.simplePaySynced;
      }

      return await this.prisma.leaveRequest.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: filter?.page
          ? (filter.page - 1) * (filter.limit || 20)
          : undefined,
        take: filter?.limit || 20,
      });
    } catch (error) {
      this.logger.error(
        `Failed to find leave requests for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStaff',
        'Failed to find leave requests for staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all leave requests for a tenant
   */
  async findByTenant(
    tenantId: string,
    filter?: LeaveRequestFilterDto,
  ): Promise<LeaveRequest[]> {
    try {
      const where: Prisma.LeaveRequestWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.leaveTypeId) {
        where.leaveTypeId = filter.leaveTypeId;
      }
      if (filter?.fromDate) {
        where.startDate = { gte: filter.fromDate };
      }
      if (filter?.toDate) {
        where.endDate = { lte: filter.toDate };
      }
      if (filter?.simplePaySynced !== undefined) {
        where.simplePaySynced = filter.simplePaySynced;
      }

      return await this.prisma.leaveRequest.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: filter?.page
          ? (filter.page - 1) * (filter.limit || 20)
          : undefined,
        take: filter?.limit || 20,
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNumber: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find leave requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find leave requests for tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pending leave requests for a staff member
   */
  async findPendingByStaff(staffId: string): Promise<LeaveRequest[]> {
    try {
      return await this.prisma.leaveRequest.findMany({
        where: {
          staffId,
          status: LeaveRequestStatus.PENDING,
        },
        orderBy: { startDate: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending leave requests for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPendingByStaff',
        'Failed to find pending leave requests',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a leave request
   * @throws NotFoundException if leave request doesn't exist
   * @throws ConflictException if leave request is not in PENDING status
   */
  async update(id: string, dto: UpdateLeaveRequestDto): Promise<LeaveRequest> {
    try {
      const existing = await this.findByIdOrThrow(id);

      if (existing.status !== LeaveRequestStatus.PENDING) {
        throw new ConflictException(
          `Cannot update leave request in '${existing.status}' status`,
          { id, status: existing.status },
        );
      }

      const updateData: Prisma.LeaveRequestUpdateInput = {};

      if (dto.leaveTypeId !== undefined) {
        updateData.leaveTypeId = dto.leaveTypeId;
      }
      if (dto.leaveTypeName !== undefined) {
        updateData.leaveTypeName = dto.leaveTypeName;
      }
      if (dto.startDate !== undefined) {
        updateData.startDate = dto.startDate;
      }
      if (dto.endDate !== undefined) {
        updateData.endDate = dto.endDate;
      }
      if (dto.totalDays !== undefined) {
        updateData.totalDays = new Decimal(dto.totalDays);
      }
      if (dto.totalHours !== undefined) {
        updateData.totalHours = new Decimal(dto.totalHours);
      }
      if (dto.reason !== undefined) {
        updateData.reason = dto.reason;
      }

      return await this.prisma.leaveRequest.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update leave request ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Approve a leave request
   * @throws NotFoundException if leave request doesn't exist
   * @throws ConflictException if leave request is not in PENDING status
   */
  async approve(id: string, approvedBy: string): Promise<LeaveRequest> {
    try {
      const existing = await this.findByIdOrThrow(id);

      if (existing.status !== LeaveRequestStatus.PENDING) {
        throw new ConflictException(
          `Cannot approve leave request in '${existing.status}' status`,
          { id, status: existing.status },
        );
      }

      return await this.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveRequestStatus.APPROVED,
          approvedBy,
          approvedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to approve leave request ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'approve',
        'Failed to approve leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Reject a leave request
   * @throws NotFoundException if leave request doesn't exist
   * @throws ConflictException if leave request is not in PENDING status
   */
  async reject(
    id: string,
    rejectedBy: string,
    rejectedReason: string,
  ): Promise<LeaveRequest> {
    try {
      const existing = await this.findByIdOrThrow(id);

      if (existing.status !== LeaveRequestStatus.PENDING) {
        throw new ConflictException(
          `Cannot reject leave request in '${existing.status}' status`,
          { id, status: existing.status },
        );
      }

      return await this.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveRequestStatus.REJECTED,
          approvedBy: rejectedBy, // Store who rejected it
          rejectedReason,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to reject leave request ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'reject',
        'Failed to reject leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Cancel a leave request
   * @throws NotFoundException if leave request doesn't exist
   * @throws ConflictException if leave request is already REJECTED or CANCELLED
   */
  async cancel(id: string): Promise<LeaveRequest> {
    try {
      const existing = await this.findByIdOrThrow(id);

      if (
        existing.status === LeaveRequestStatus.REJECTED ||
        existing.status === LeaveRequestStatus.CANCELLED
      ) {
        throw new ConflictException(
          `Cannot cancel leave request in '${existing.status}' status`,
          { id, status: existing.status },
        );
      }

      return await this.prisma.leaveRequest.update({
        where: { id },
        data: {
          status: LeaveRequestStatus.CANCELLED,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to cancel leave request ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'cancel',
        'Failed to cancel leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark leave request as synced to SimplePay
   */
  async markSynced(id: string, simplePayIds: string[]): Promise<LeaveRequest> {
    try {
      return await this.prisma.leaveRequest.update({
        where: { id },
        data: {
          simplePaySynced: true,
          simplePayIds,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to mark leave request ${id} as synced`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markSynced',
        'Failed to mark leave request as synced',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a leave request
   * @throws NotFoundException if leave request doesn't exist
   * @throws ConflictException if leave request is synced to SimplePay
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findByIdOrThrow(id);

      if (existing.simplePaySynced) {
        throw new ConflictException(
          'Cannot delete leave request that is synced to SimplePay',
          { id },
        );
      }

      await this.prisma.leaveRequest.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to delete leave request ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete leave request',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count leave requests by tenant
   */
  async countByTenant(
    tenantId: string,
    filter?: LeaveRequestFilterDto,
  ): Promise<number> {
    try {
      const where: Prisma.LeaveRequestWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.leaveTypeId) {
        where.leaveTypeId = filter.leaveTypeId;
      }
      if (filter?.fromDate) {
        where.startDate = { gte: filter.fromDate };
      }
      if (filter?.toDate) {
        where.endDate = { lte: filter.toDate };
      }
      if (filter?.simplePaySynced !== undefined) {
        where.simplePaySynced = filter.simplePaySynced;
      }

      return await this.prisma.leaveRequest.count({ where });
    } catch (error) {
      this.logger.error(
        `Failed to count leave requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countByTenant',
        'Failed to count leave requests',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find unsynced approved leave requests for a tenant
   */
  async findUnsyncedApproved(tenantId: string): Promise<LeaveRequest[]> {
    try {
      return await this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          status: LeaveRequestStatus.APPROVED,
          simplePaySynced: false,
        },
        orderBy: { startDate: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find unsynced approved leave requests for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findUnsyncedApproved',
        'Failed to find unsynced approved leave requests',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
