import { Injectable, Logger } from '@nestjs/common';
import { Payroll, Prisma, PayrollStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePayrollDto,
  UpdatePayrollDto,
  PayrollFilterDto,
} from '../dto/payroll.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';

@Injectable()
export class PayrollRepository {
  private readonly logger = new Logger(PayrollRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new payroll record
   * @throws NotFoundException if tenant or staff doesn't exist
   * @throws ConflictException if payroll for period already exists
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreatePayrollDto): Promise<Payroll> {
    try {
      return await this.prisma.payroll.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          payPeriodStart: dto.payPeriodStart,
          payPeriodEnd: dto.payPeriodEnd,
          basicSalaryCents: dto.basicSalaryCents,
          overtimeCents: dto.overtimeCents ?? 0,
          bonusCents: dto.bonusCents ?? 0,
          otherEarningsCents: dto.otherEarningsCents ?? 0,
          grossSalaryCents: dto.grossSalaryCents,
          payeCents: dto.payeCents,
          uifEmployeeCents: dto.uifEmployeeCents,
          uifEmployerCents: dto.uifEmployerCents,
          otherDeductionsCents: dto.otherDeductionsCents ?? 0,
          netSalaryCents: dto.netSalaryCents,
          medicalAidCreditCents: dto.medicalAidCreditCents ?? 0,
          status: dto.status ?? 'DRAFT',
          paymentDate: dto.paymentDate ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create payroll: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Payroll for staff '${dto.staffId}' already exists for period starting '${dto.payPeriodStart.toISOString()}'`,
            {
              staffId: dto.staffId,
              payPeriodStart: dto.payPeriodStart,
            },
          );
        }
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create payroll',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payroll by ID with tenant isolation
   * @param id - Payroll ID
   * @param tenantId - Tenant ID for isolation
   * @returns Payroll or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string, tenantId: string): Promise<Payroll | null> {
    try {
      return await this.prisma.payroll.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find payroll',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payroll by tenant, staff, and period start
   * @returns Payroll or null if not found
   * @throws DatabaseException for database errors
   */
  async findByTenantStaffPeriod(
    tenantId: string,
    staffId: string,
    payPeriodStart: Date,
  ): Promise<Payroll | null> {
    try {
      return await this.prisma.payroll.findUnique({
        where: {
          tenantId_staffId_payPeriodStart: {
            tenantId,
            staffId,
            payPeriodStart,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll for staff: ${staffId}, period: ${payPeriodStart.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantStaffPeriod',
        'Failed to find payroll by period',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payroll records for a staff member
   * @returns Array of payroll records
   * @throws DatabaseException for database errors
   */
  async findByStaffId(
    staffId: string,
    filter?: PayrollFilterDto,
  ): Promise<Payroll[]> {
    try {
      const where: Prisma.PayrollWhereInput = { staffId };

      if (filter?.status !== undefined) {
        where.status = filter.status;
      }
      if (filter?.periodStart !== undefined) {
        where.payPeriodStart = { gte: filter.periodStart };
      }
      if (filter?.periodEnd !== undefined) {
        where.payPeriodEnd = { lte: filter.periodEnd };
      }

      return await this.prisma.payroll.findMany({
        where,
        orderBy: { payPeriodStart: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStaffId',
        'Failed to find payroll for staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payroll records for a tenant with optional filters
   * @returns Array of payroll records
   * @throws DatabaseException for database errors
   */
  async findByTenantId(
    tenantId: string,
    filter?: PayrollFilterDto,
  ): Promise<Payroll[]> {
    try {
      const where: Prisma.PayrollWhereInput = { tenantId };

      if (filter?.staffId !== undefined) {
        where.staffId = filter.staffId;
      }
      if (filter?.status !== undefined) {
        where.status = filter.status;
      }
      if (filter?.periodStart !== undefined) {
        where.payPeriodStart = { gte: filter.periodStart };
      }
      if (filter?.periodEnd !== undefined) {
        where.payPeriodEnd = { lte: filter.periodEnd };
      }

      return await this.prisma.payroll.findMany({
        where,
        orderBy: [{ payPeriodStart: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find payroll',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payroll records for a specific period
   * @returns Array of payroll records
   * @throws DatabaseException for database errors
   */
  async findByPeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Payroll[]> {
    try {
      return await this.prisma.payroll.findMany({
        where: {
          tenantId,
          payPeriodStart: { gte: periodStart },
          payPeriodEnd: { lte: periodEnd },
        },
        orderBy: [{ payPeriodStart: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payroll for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByPeriod',
        'Failed to find payroll by period',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a payroll record
   * @throws NotFoundException if payroll doesn't exist
   * @throws ConflictException if payroll is already PAID
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdatePayrollDto,
  ): Promise<Payroll> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Payroll', id);
      }

      if (existing.status === PayrollStatus.PAID) {
        throw new ConflictException(
          `Cannot update payroll '${id}' - already marked as PAID`,
          { payrollId: id, status: existing.status },
        );
      }

      const updateData: Prisma.PayrollUpdateInput = {};

      if (dto.payPeriodStart !== undefined) {
        updateData.payPeriodStart = dto.payPeriodStart;
      }
      if (dto.payPeriodEnd !== undefined) {
        updateData.payPeriodEnd = dto.payPeriodEnd;
      }
      if (dto.basicSalaryCents !== undefined) {
        updateData.basicSalaryCents = dto.basicSalaryCents;
      }
      if (dto.overtimeCents !== undefined) {
        updateData.overtimeCents = dto.overtimeCents;
      }
      if (dto.bonusCents !== undefined) {
        updateData.bonusCents = dto.bonusCents;
      }
      if (dto.otherEarningsCents !== undefined) {
        updateData.otherEarningsCents = dto.otherEarningsCents;
      }
      if (dto.grossSalaryCents !== undefined) {
        updateData.grossSalaryCents = dto.grossSalaryCents;
      }
      if (dto.payeCents !== undefined) {
        updateData.payeCents = dto.payeCents;
      }
      if (dto.uifEmployeeCents !== undefined) {
        updateData.uifEmployeeCents = dto.uifEmployeeCents;
      }
      if (dto.uifEmployerCents !== undefined) {
        updateData.uifEmployerCents = dto.uifEmployerCents;
      }
      if (dto.otherDeductionsCents !== undefined) {
        updateData.otherDeductionsCents = dto.otherDeductionsCents;
      }
      if (dto.netSalaryCents !== undefined) {
        updateData.netSalaryCents = dto.netSalaryCents;
      }
      if (dto.medicalAidCreditCents !== undefined) {
        updateData.medicalAidCreditCents = dto.medicalAidCreditCents;
      }
      if (dto.status !== undefined) {
        updateData.status = dto.status;
      }
      if (dto.paymentDate !== undefined) {
        updateData.paymentDate = dto.paymentDate;
      }

      return await this.prisma.payroll.update({
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
        `Failed to update payroll ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Payroll for this period already exists',
            { payPeriodStart: dto.payPeriodStart },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update payroll',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Approve a payroll record
   * Transitions from DRAFT to APPROVED
   * @throws NotFoundException if payroll doesn't exist
   * @throws ValidationException if payroll is not in DRAFT status
   * @throws DatabaseException for database errors
   */
  async approve(id: string, tenantId: string): Promise<Payroll> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Payroll', id);
      }

      if (existing.status !== PayrollStatus.DRAFT) {
        throw new BusinessException(
          `Cannot approve payroll '${id}' - current status is '${existing.status}', expected 'DRAFT'`,
          'INVALID_STATUS',
          { payrollId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.payroll.update({
        where: { id },
        data: {
          status: PayrollStatus.APPROVED,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to approve payroll: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'approve',
        'Failed to approve payroll',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark a payroll record as paid
   * Transitions from APPROVED to PAID and sets paymentDate
   * @throws NotFoundException if payroll doesn't exist
   * @throws ValidationException if payroll is not in APPROVED status
   * @throws DatabaseException for database errors
   */
  async markAsPaid(
    id: string,
    tenantId: string,
    paymentDate: Date,
  ): Promise<Payroll> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Payroll', id);
      }

      if (existing.status !== PayrollStatus.APPROVED) {
        throw new BusinessException(
          `Cannot mark payroll '${id}' as paid - current status is '${existing.status}', expected 'APPROVED'`,
          'INVALID_STATUS',
          { payrollId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.payroll.update({
        where: { id },
        data: {
          status: PayrollStatus.PAID,
          paymentDate,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to mark payroll as paid: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markAsPaid',
        'Failed to mark payroll as paid',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a payroll record (hard delete)
   * @throws NotFoundException if payroll doesn't exist
   * @throws ConflictException if payroll is PAID
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Payroll', id);
      }

      if (existing.status === PayrollStatus.PAID) {
        throw new ConflictException(
          `Cannot delete payroll '${id}' - already marked as PAID`,
          { payrollId: id, status: existing.status },
        );
      }

      await this.prisma.payroll.delete({
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
        `Failed to delete payroll: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete payroll',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate total payroll costs for a period
   * @returns Object with totals for all salary components
   * @throws DatabaseException for database errors
   */
  async calculatePeriodTotals(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    totalGross: number;
    totalPaye: number;
    totalUifEmployee: number;
    totalUifEmployer: number;
    totalNet: number;
  }> {
    try {
      const result = await this.prisma.payroll.aggregate({
        where: {
          tenantId,
          payPeriodStart: { gte: periodStart },
          payPeriodEnd: { lte: periodEnd },
          status: { not: PayrollStatus.DRAFT }, // Only count approved/paid
        },
        _sum: {
          grossSalaryCents: true,
          payeCents: true,
          uifEmployeeCents: true,
          uifEmployerCents: true,
          netSalaryCents: true,
        },
      });

      return {
        totalGross: result._sum.grossSalaryCents ?? 0,
        totalPaye: result._sum.payeCents ?? 0,
        totalUifEmployee: result._sum.uifEmployeeCents ?? 0,
        totalUifEmployer: result._sum.uifEmployerCents ?? 0,
        totalNet: result._sum.netSalaryCents ?? 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate period totals: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'calculatePeriodTotals',
        'Failed to calculate period totals',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
