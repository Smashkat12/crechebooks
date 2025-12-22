import { Injectable, Logger } from '@nestjs/common';
import { Child, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateChildDto,
  UpdateChildDto,
  ChildFilterDto,
} from '../dto/child.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class ChildRepository {
  private readonly logger = new Logger(ChildRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new child
   * @throws NotFoundException if tenant or parent doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateChildDto): Promise<Child> {
    try {
      return await this.prisma.child.create({
        data: {
          tenantId: dto.tenantId,
          parentId: dto.parentId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          dateOfBirth: dto.dateOfBirth,
          gender: dto.gender ?? null,
          medicalNotes: dto.medicalNotes ?? null,
          emergencyContact: dto.emergencyContact ?? null,
          emergencyPhone: dto.emergencyPhone ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create child: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('parent')) {
            throw new NotFoundException('Parent', dto.parentId);
          }
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find child by ID
   * @returns Child or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<Child | null> {
    try {
      return await this.prisma.child.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find child by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all children for a specific parent
   * @returns Array of children
   * @throws DatabaseException for database errors
   */
  async findByParent(tenantId: string, parentId: string): Promise<Child[]> {
    try {
      return await this.prisma.child.findMany({
        where: {
          tenantId,
          parentId,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find children for parent: ${parentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByParent',
        'Failed to find children for parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all children for a tenant with optional filters
   * @returns Array of children
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: ChildFilterDto,
  ): Promise<Child[]> {
    try {
      const where: Prisma.ChildWhereInput = {
        tenantId,
      };

      if (filter.parentId) {
        where.parentId = filter.parentId;
      }

      if (filter.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      if (filter.search) {
        where.OR = [
          { firstName: { contains: filter.search, mode: 'insensitive' } },
          { lastName: { contains: filter.search, mode: 'insensitive' } },
        ];
      }

      return await this.prisma.child.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find children for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find children',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a child
   * @throws NotFoundException if child doesn't exist
   * @throws NotFoundException if new parentId doesn't exist
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateChildDto): Promise<Child> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Child', id);
      }

      const updateData: Prisma.ChildUpdateInput = {};

      if (dto.firstName !== undefined) {
        updateData.firstName = dto.firstName;
      }
      if (dto.lastName !== undefined) {
        updateData.lastName = dto.lastName;
      }
      if (dto.dateOfBirth !== undefined) {
        updateData.dateOfBirth = dto.dateOfBirth;
      }
      if (dto.gender !== undefined) {
        updateData.gender = dto.gender;
      }
      if (dto.medicalNotes !== undefined) {
        updateData.medicalNotes = dto.medicalNotes;
      }
      if (dto.emergencyContact !== undefined) {
        updateData.emergencyContact = dto.emergencyContact;
      }
      if (dto.emergencyPhone !== undefined) {
        updateData.emergencyPhone = dto.emergencyPhone;
      }
      if (dto.parentId !== undefined) {
        updateData.parent = { connect: { id: dto.parentId } };
      }

      return await this.prisma.child.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update child ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Parent', dto.parentId ?? 'unknown');
        }
        // P2025 = Record not found for nested connect (e.g., parentId doesn't exist)
        if (error.code === 'P2025') {
          throw new NotFoundException('Parent', dto.parentId ?? 'unknown');
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a child
   * @throws NotFoundException if child doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Child', id);
      }

      await this.prisma.child.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete child: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Calculate age in months from date of birth
   * @returns Age in months
   */
  getAgeInMonths(child: Child): number {
    const now = new Date();
    const dob = new Date(child.dateOfBirth);
    const years = now.getFullYear() - dob.getFullYear();
    const months = now.getMonth() - dob.getMonth();
    let totalMonths = years * 12 + months;

    // Adjust if the day of month hasn't occurred yet
    if (now.getDate() < dob.getDate()) {
      totalMonths--;
    }

    return totalMonths;
  }
}
