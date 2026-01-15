/**
 * Payroll Adjustment Repository
 * TASK-SPAY-003: SimplePay Calculation Items Retrieval with Caching
 */

import { Injectable, Logger } from '@nestjs/common';
import { PayrollAdjustment, CalculationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePayrollAdjustmentDto,
  UpdatePayrollAdjustmentDto,
  PayrollAdjustmentFilterDto,
} from '../dto/calculations.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class PayrollAdjustmentRepository {
  private readonly logger = new Logger(PayrollAdjustmentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new payroll adjustment
   */
  async create(dto: CreatePayrollAdjustmentDto): Promise<PayrollAdjustment> {
    try {
      return await this.prisma.payrollAdjustment.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          itemCode: dto.itemCode,
          itemName: dto.itemName,
          type: dto.type,
          amountCents: dto.amountCents ?? null,
          percentage: dto.percentage ?? null,
          isRecurring: dto.isRecurring ?? true,
          effectiveDate: dto.effectiveDate,
          endDate: dto.endDate ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create payroll adjustment: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const message = error.message.toLowerCase();
          if (message.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create payroll adjustment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payroll adjustment by ID with tenant isolation
   * @param id - Payroll adjustment ID
   * @param tenantId - Tenant ID for isolation
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<PayrollAdjustment | null> {
    try {
      return await this.prisma.payrollAdjustment.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll adjustment by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find payroll adjustment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payroll adjustments for a staff member
   */
  async findByStaffId(
    staffId: string,
    filter?: PayrollAdjustmentFilterDto,
  ): Promise<PayrollAdjustment[]> {
    try {
      const where: Prisma.PayrollAdjustmentWhereInput = { staffId };

      if (filter?.itemCode !== undefined) {
        where.itemCode = filter.itemCode;
      }
      if (filter?.type !== undefined) {
        where.type = filter.type;
      }
      if (filter?.isRecurring !== undefined) {
        where.isRecurring = filter.isRecurring;
      }
      if (filter?.syncedToSimplePay !== undefined) {
        where.syncedToSimplePay = filter.syncedToSimplePay;
      }
      if (filter?.effectiveDate !== undefined) {
        where.effectiveDate = { lte: filter.effectiveDate };
        where.OR = [
          { endDate: null },
          { endDate: { gte: filter.effectiveDate } },
        ];
      }

      return await this.prisma.payrollAdjustment.findMany({
        where,
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll adjustments for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStaffId',
        'Failed to find payroll adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payroll adjustments for a tenant
   */
  async findByTenantId(
    tenantId: string,
    filter?: PayrollAdjustmentFilterDto,
  ): Promise<PayrollAdjustment[]> {
    try {
      const where: Prisma.PayrollAdjustmentWhereInput = { tenantId };

      if (filter?.staffId !== undefined) {
        where.staffId = filter.staffId;
      }
      if (filter?.itemCode !== undefined) {
        where.itemCode = filter.itemCode;
      }
      if (filter?.type !== undefined) {
        where.type = filter.type;
      }
      if (filter?.isRecurring !== undefined) {
        where.isRecurring = filter.isRecurring;
      }
      if (filter?.syncedToSimplePay !== undefined) {
        where.syncedToSimplePay = filter.syncedToSimplePay;
      }
      if (filter?.effectiveDate !== undefined) {
        where.effectiveDate = { lte: filter.effectiveDate };
        where.OR = [
          { endDate: null },
          { endDate: { gte: filter.effectiveDate } },
        ];
      }

      return await this.prisma.payrollAdjustment.findMany({
        where,
        orderBy: [{ staffId: 'asc' }, { effectiveDate: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll adjustments for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find payroll adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find active adjustments for a staff member on a specific date
   */
  async findActiveForDate(
    staffId: string,
    date: Date,
  ): Promise<PayrollAdjustment[]> {
    try {
      return await this.prisma.payrollAdjustment.findMany({
        where: {
          staffId,
          effectiveDate: { lte: date },
          OR: [{ endDate: null }, { endDate: { gte: date } }],
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find active adjustments for staff: ${staffId} on date: ${date}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findActiveForDate',
        'Failed to find active adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find recurring adjustments for a staff member
   */
  async findRecurringByStaffId(staffId: string): Promise<PayrollAdjustment[]> {
    try {
      return await this.prisma.payrollAdjustment.findMany({
        where: {
          staffId,
          isRecurring: true,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find recurring adjustments for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findRecurringByStaffId',
        'Failed to find recurring adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find adjustments not yet synced to SimplePay
   */
  async findUnsyncedByTenantId(tenantId: string): Promise<PayrollAdjustment[]> {
    try {
      return await this.prisma.payrollAdjustment.findMany({
        where: {
          tenantId,
          syncedToSimplePay: false,
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find unsynced adjustments for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findUnsyncedByTenantId',
        'Failed to find unsynced adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a payroll adjustment
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdatePayrollAdjustmentDto,
  ): Promise<PayrollAdjustment> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('PayrollAdjustment', id);
      }

      const updateData: Prisma.PayrollAdjustmentUpdateInput = {};

      if (dto.itemCode !== undefined) {
        updateData.itemCode = dto.itemCode;
      }
      if (dto.itemName !== undefined) {
        updateData.itemName = dto.itemName;
      }
      if (dto.type !== undefined) {
        updateData.type = dto.type;
      }
      if (dto.amountCents !== undefined) {
        updateData.amountCents = dto.amountCents;
      }
      if (dto.percentage !== undefined) {
        updateData.percentage = dto.percentage;
      }
      if (dto.isRecurring !== undefined) {
        updateData.isRecurring = dto.isRecurring;
      }
      if (dto.effectiveDate !== undefined) {
        updateData.effectiveDate = dto.effectiveDate;
      }
      if (dto.endDate !== undefined) {
        updateData.endDate = dto.endDate;
      }
      if (dto.simplePayCalcId !== undefined) {
        updateData.simplePayCalcId = dto.simplePayCalcId;
      }
      if (dto.syncedToSimplePay !== undefined) {
        updateData.syncedToSimplePay = dto.syncedToSimplePay;
      }

      return await this.prisma.payrollAdjustment.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update payroll adjustment ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update payroll adjustment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark adjustment as synced to SimplePay
   */
  async markSynced(
    id: string,
    simplePayCalcId: string,
  ): Promise<PayrollAdjustment> {
    try {
      return await this.prisma.payrollAdjustment.update({
        where: { id },
        data: {
          simplePayCalcId,
          syncedToSimplePay: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to mark adjustment as synced: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markSynced',
        'Failed to mark adjustment as synced',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * End a payroll adjustment
   */
  async end(
    id: string,
    tenantId: string,
    endDate?: Date,
  ): Promise<PayrollAdjustment> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('PayrollAdjustment', id);
      }

      return await this.prisma.payrollAdjustment.update({
        where: { id },
        data: {
          endDate: endDate ?? new Date(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to end payroll adjustment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'end',
        'Failed to end payroll adjustment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a payroll adjustment
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('PayrollAdjustment', id);
      }

      await this.prisma.payrollAdjustment.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete payroll adjustment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete payroll adjustment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all adjustments for a staff member
   */
  async deleteByStaffId(staffId: string): Promise<number> {
    try {
      const result = await this.prisma.payrollAdjustment.deleteMany({
        where: { staffId },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete adjustments for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteByStaffId',
        'Failed to delete adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count active adjustments for a staff member
   */
  async countActiveByStaffId(staffId: string): Promise<number> {
    try {
      const now = new Date();
      return await this.prisma.payrollAdjustment.count({
        where: {
          staffId,
          effectiveDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to count active adjustments for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countActiveByStaffId',
        'Failed to count active adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate total adjustments for a staff member by type
   */
  async sumByType(
    staffId: string,
    type: CalculationType,
    date: Date,
  ): Promise<number> {
    try {
      const result = await this.prisma.payrollAdjustment.aggregate({
        where: {
          staffId,
          type,
          effectiveDate: { lte: date },
          OR: [{ endDate: null }, { endDate: { gte: date } }],
        },
        _sum: {
          amountCents: true,
        },
      });
      return result._sum.amountCents ?? 0;
    } catch (error) {
      this.logger.error(
        `Failed to sum adjustments for staff: ${staffId}, type: ${type}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'sumByType',
        'Failed to sum adjustments',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
