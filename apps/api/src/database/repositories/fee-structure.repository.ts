import { Injectable, Logger } from '@nestjs/common';
import { FeeStructure, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFeeStructureDto,
  UpdateFeeStructureDto,
  FeeStructureFilterDto,
} from '../dto/fee-structure.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class FeeStructureRepository {
  private readonly logger = new Logger(FeeStructureRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new fee structure
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateFeeStructureDto): Promise<FeeStructure> {
    try {
      return await this.prisma.feeStructure.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.name,
          description: dto.description ?? null,
          feeType: dto.feeType,
          amountCents: dto.amountCents,
          registrationFeeCents: dto.registrationFeeCents ?? 0,
          vatInclusive: dto.vatInclusive ?? true,
          siblingDiscountPercent: dto.siblingDiscountPercent ?? null,
          effectiveFrom: dto.effectiveFrom,
          effectiveTo: dto.effectiveTo ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create fee structure: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create fee structure',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find fee structure by ID
   * @returns FeeStructure or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<FeeStructure | null> {
    try {
      return await this.prisma.feeStructure.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find fee structure by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find fee structure',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all fee structures for a tenant with optional filters
   * @returns Array of fee structures
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: FeeStructureFilterDto,
  ): Promise<FeeStructure[]> {
    try {
      const where: Prisma.FeeStructureWhereInput = {
        tenantId,
      };

      if (filter.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      if (filter.feeType !== undefined) {
        where.feeType = filter.feeType;
      }

      if (filter.effectiveDate !== undefined) {
        where.effectiveFrom = { lte: filter.effectiveDate };
        where.OR = [
          { effectiveTo: null },
          { effectiveTo: { gte: filter.effectiveDate } },
        ];
      }

      return await this.prisma.feeStructure.findMany({
        where,
        orderBy: [{ name: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find fee structures for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find fee structures',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all active fee structures for a tenant
   * @returns Array of active fee structures
   * @throws DatabaseException for database errors
   */
  async findActiveByTenant(tenantId: string): Promise<FeeStructure[]> {
    try {
      return await this.prisma.feeStructure.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: [{ name: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find active fee structures for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findActiveByTenant',
        'Failed to find active fee structures',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find fee structures effective on a specific date
   * @returns Array of fee structures effective on the given date
   * @throws DatabaseException for database errors
   */
  async findEffectiveOnDate(
    tenantId: string,
    date: Date,
  ): Promise<FeeStructure[]> {
    try {
      return await this.prisma.feeStructure.findMany({
        where: {
          tenantId,
          isActive: true,
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
        },
        orderBy: [{ name: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find fee structures effective on ${date.toISOString()} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findEffectiveOnDate',
        'Failed to find fee structures effective on date',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a fee structure
   * @throws NotFoundException if fee structure doesn't exist
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateFeeStructureDto): Promise<FeeStructure> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('FeeStructure', id);
      }

      const updateData: Prisma.FeeStructureUpdateInput = {};

      if (dto.name !== undefined) {
        updateData.name = dto.name;
      }
      if (dto.description !== undefined) {
        updateData.description = dto.description;
      }
      if (dto.feeType !== undefined) {
        updateData.feeType = dto.feeType;
      }
      if (dto.amountCents !== undefined) {
        updateData.amountCents = dto.amountCents;
      }
      if (dto.registrationFeeCents !== undefined) {
        updateData.registrationFeeCents = dto.registrationFeeCents;
      }
      if (dto.vatInclusive !== undefined) {
        updateData.vatInclusive = dto.vatInclusive;
      }
      if (dto.siblingDiscountPercent !== undefined) {
        updateData.siblingDiscountPercent = dto.siblingDiscountPercent;
      }
      if (dto.effectiveFrom !== undefined) {
        updateData.effectiveFrom = dto.effectiveFrom;
      }
      if (dto.effectiveTo !== undefined) {
        updateData.effectiveTo = dto.effectiveTo;
      }

      return await this.prisma.feeStructure.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update fee structure ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update fee structure',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Deactivate a fee structure (soft delete)
   * @throws NotFoundException if fee structure doesn't exist
   * @throws DatabaseException for database errors
   */
  async deactivate(id: string): Promise<FeeStructure> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('FeeStructure', id);
      }

      return await this.prisma.feeStructure.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to deactivate fee structure: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deactivate',
        'Failed to deactivate fee structure',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a fee structure (hard delete)
   * Note: Will fail if enrollments exist - use deactivate instead
   * @throws NotFoundException if fee structure doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('FeeStructure', id);
      }

      await this.prisma.feeStructure.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete fee structure: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003 = FK constraint violation (enrollments exist)
        if (error.code === 'P2003') {
          throw new DatabaseException(
            'delete',
            'Cannot delete fee structure with existing enrollments. Deactivate instead.',
            error,
          );
        }
      }
      throw new DatabaseException(
        'delete',
        'Failed to delete fee structure',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
