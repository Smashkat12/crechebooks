import { Injectable, Logger } from '@nestjs/common';
import { Enrollment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
  EnrollmentFilterDto,
} from '../dto/enrollment.dto';
import { EnrollmentStatus } from '../entities/enrollment.entity';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class EnrollmentRepository {
  private readonly logger = new Logger(EnrollmentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new enrollment
   * @throws NotFoundException if tenant, child, or fee structure doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateEnrollmentDto): Promise<Enrollment> {
    try {
      return await this.prisma.enrollment.create({
        data: {
          tenantId: dto.tenantId,
          childId: dto.childId,
          feeStructureId: dto.feeStructureId,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          status: dto.status ?? 'ACTIVE',
          siblingDiscountApplied: dto.siblingDiscountApplied ?? false,
          customFeeOverrideCents: dto.customFeeOverrideCents ?? null,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create enrollment: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('child')) {
            throw new NotFoundException('Child', dto.childId);
          }
          if (field?.includes('fee_structure')) {
            throw new NotFoundException('FeeStructure', dto.feeStructureId);
          }
          throw new NotFoundException('Tenant', dto.tenantId);
        }
        // P2025 = Record not found for nested connect
        if (error.code === 'P2025') {
          throw new NotFoundException('FeeStructure', dto.feeStructureId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create enrollment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find enrollment by ID
   * @returns Enrollment or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<Enrollment | null> {
    try {
      return await this.prisma.enrollment.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find enrollment by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find enrollment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all enrollments for a tenant with optional filters
   * @returns Array of enrollments
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: EnrollmentFilterDto,
  ): Promise<Enrollment[]> {
    try {
      const where: Prisma.EnrollmentWhereInput = {
        tenantId,
      };

      if (filter.childId !== undefined) {
        where.childId = filter.childId;
      }

      if (filter.feeStructureId !== undefined) {
        where.feeStructureId = filter.feeStructureId;
      }

      if (filter.status !== undefined) {
        where.status = filter.status;
      }

      return await this.prisma.enrollment.findMany({
        where,
        orderBy: [{ startDate: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find enrollments for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find enrollments',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all enrollments for a specific child
   * @returns Array of enrollments
   * @throws DatabaseException for database errors
   */
  async findByChild(tenantId: string, childId: string): Promise<Enrollment[]> {
    try {
      return await this.prisma.enrollment.findMany({
        where: {
          tenantId,
          childId,
        },
        orderBy: [{ startDate: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find enrollments for child: ${childId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByChild',
        'Failed to find enrollments for child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find the active enrollment for a child (if any)
   * @returns Active enrollment or null if none
   * @throws DatabaseException for database errors
   */
  async findActiveByChild(
    tenantId: string,
    childId: string,
  ): Promise<Enrollment | null> {
    try {
      return await this.prisma.enrollment.findFirst({
        where: {
          tenantId,
          childId,
          status: 'ACTIVE',
        },
        orderBy: [{ startDate: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find active enrollment for child: ${childId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findActiveByChild',
        'Failed to find active enrollment for child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all enrollments with a specific status
   * @returns Array of enrollments
   * @throws DatabaseException for database errors
   */
  async findByStatus(
    tenantId: string,
    status: EnrollmentStatus,
  ): Promise<Enrollment[]> {
    try {
      return await this.prisma.enrollment.findMany({
        where: {
          tenantId,
          status,
        },
        orderBy: [{ startDate: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find enrollments with status ${status} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStatus',
        'Failed to find enrollments by status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an enrollment
   * @throws NotFoundException if enrollment doesn't exist
   * @throws NotFoundException if new childId or feeStructureId doesn't exist
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateEnrollmentDto): Promise<Enrollment> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Enrollment', id);
      }

      const updateData: Prisma.EnrollmentUpdateInput = {};

      if (dto.startDate !== undefined) {
        updateData.startDate = dto.startDate;
      }
      if (dto.endDate !== undefined) {
        updateData.endDate = dto.endDate;
      }
      if (dto.status !== undefined) {
        updateData.status = dto.status;
      }
      if (dto.siblingDiscountApplied !== undefined) {
        updateData.siblingDiscountApplied = dto.siblingDiscountApplied;
      }
      if (dto.customFeeOverrideCents !== undefined) {
        updateData.customFeeOverrideCents = dto.customFeeOverrideCents;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }
      if (dto.childId !== undefined) {
        updateData.child = { connect: { id: dto.childId } };
      }
      if (dto.feeStructureId !== undefined) {
        updateData.feeStructure = { connect: { id: dto.feeStructureId } };
      }

      return await this.prisma.enrollment.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update enrollment ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('child')) {
            throw new NotFoundException('Child', dto.childId ?? 'unknown');
          }
          if (field?.includes('fee_structure')) {
            throw new NotFoundException(
              'FeeStructure',
              dto.feeStructureId ?? 'unknown',
            );
          }
        }
        // P2025 = Record not found for nested connect
        if (error.code === 'P2025') {
          // Could be either child or fee structure
          if (dto.feeStructureId !== undefined) {
            throw new NotFoundException('FeeStructure', dto.feeStructureId);
          }
          if (dto.childId !== undefined) {
            throw new NotFoundException('Child', dto.childId);
          }
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update enrollment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete an enrollment
   * @throws NotFoundException if enrollment doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Enrollment', id);
      }

      await this.prisma.enrollment.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete enrollment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete enrollment',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Withdraw an enrollment (set status to WITHDRAWN and end date to now)
   * @throws NotFoundException if enrollment doesn't exist
   * @throws DatabaseException for database errors
   */
  async withdraw(id: string): Promise<Enrollment> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Enrollment', id);
      }

      return await this.prisma.enrollment.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          endDate: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to withdraw enrollment: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'withdraw',
        'Failed to withdraw enrollment',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
