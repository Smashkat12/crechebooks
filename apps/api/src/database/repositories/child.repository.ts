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
   * Find child by ID with tenant isolation
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param id - Child ID
   * @param tenantId - Tenant ID for isolation
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Child or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(
    id: string,
    tenantId: string,
    includeDeleted = false,
  ): Promise<Child | null> {
    try {
      return await this.prisma.child.findFirst({
        where: {
          id,
          tenantId,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find child by id: ${id} for tenant: ${tenantId}`,
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
   * TASK-PERF-101: Batch load children by IDs to eliminate N+1 queries
   * @param ids - Array of child IDs
   * @param tenantId - Tenant ID for isolation
   * @returns Array of children
   * @throws DatabaseException for database errors
   */
  async findByIds(ids: string[], tenantId: string): Promise<Child[]> {
    if (ids.length === 0) return [];
    try {
      return await this.prisma.child.findMany({
        where: {
          id: { in: ids },
          tenantId,
          deletedAt: null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find children by ids: ${ids.join(', ')} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByIds',
        'Failed to find children by IDs',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TASK-PERF-101: Batch load children by parent IDs
   * @param parentIds - Array of parent IDs
   * @param tenantId - Tenant ID for isolation
   * @returns Array of children
   * @throws DatabaseException for database errors
   */
  async findByParentIds(
    parentIds: string[],
    tenantId: string,
  ): Promise<Child[]> {
    if (parentIds.length === 0) return [];
    try {
      return await this.prisma.child.findMany({
        where: {
          parentId: { in: parentIds },
          tenantId,
          deletedAt: null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find children by parent ids: ${parentIds.join(', ')} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByParentIds',
        'Failed to find children by parent IDs',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all children for a specific parent
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param parentId - Parent ID to filter by
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Array of children
   * @throws DatabaseException for database errors
   */
  async findByParent(
    tenantId: string,
    parentId: string,
    includeDeleted = false,
  ): Promise<Child[]> {
    try {
      return await this.prisma.child.findMany({
        where: {
          tenantId,
          parentId,
          ...(includeDeleted ? {} : { deletedAt: null }),
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
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param filter - Filter options
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Array of children
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: ChildFilterDto,
    includeDeleted = false,
  ): Promise<Child[]> {
    try {
      const where: Prisma.ChildWhereInput = {
        tenantId,
        // TASK-DATA-003: Exclude soft-deleted records by default
        ...(includeDeleted ? {} : { deletedAt: null }),
      };

      if (filter.parentId) {
        where.parentId = filter.parentId;
      }

      if (filter.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      if (filter.status) {
        where.status = filter.status;
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
   * Update a child with tenant isolation
   * @param id - Child ID
   * @param tenantId - Tenant ID for isolation
   * @param dto - Update data
   * @throws NotFoundException if child doesn't exist
   * @throws NotFoundException if new parentId doesn't exist
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateChildDto,
  ): Promise<Child> {
    try {
      const existing = await this.findById(id, tenantId);
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
      if (dto.status !== undefined) {
        updateData.status = dto.status;
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
   * Soft delete a child (set deletedAt timestamp) with tenant isolation
   * TASK-DATA-003: Soft delete implementation for data retention
   * @param id - Child ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @throws NotFoundException if child doesn't exist or is already deleted
   * @throws DatabaseException for database errors
   */
  async softDelete(
    id: string,
    tenantId: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch entity data (excluding already deleted)
        const existing = await tx.child.findFirst({
          where: { id, tenantId, deletedAt: null },
          include: {
            parent: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        if (!existing) {
          throw new NotFoundException('Child', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Child',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: new Date(),
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Child soft-deleted: ${existing.firstName} ${existing.lastName} (DOB: ${existing.dateOfBirth.toISOString().split('T')[0]}), Parent: ${existing.parent?.firstName} ${existing.parent?.lastName}`,
          },
        });

        // Step 3: Set deletedAt timestamp (soft delete)
        await tx.child.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        this.logger.debug(
          `TASK-DATA-003: Child ${id} soft-deleted with audit trail`,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete child: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'softDelete',
        'Failed to soft delete child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Restore a soft-deleted child
   * TASK-DATA-003: Restore functionality for accidentally deleted records
   * @param id - Child ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @returns Restored child
   * @throws NotFoundException if child doesn't exist or is not deleted
   * @throws DatabaseException for database errors
   */
  async restore(id: string, tenantId: string, userId?: string): Promise<Child> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch soft-deleted entity
        const existing = await tx.child.findFirst({
          where: { id, tenantId, deletedAt: { not: null } },
        });

        if (!existing) {
          throw new NotFoundException('Child', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Child',
            entityId: id,
            action: 'UPDATE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: null,
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Child restored: ${existing.firstName} ${existing.lastName}`,
          },
        });

        // Step 3: Clear deletedAt timestamp (restore)
        const restored = await tx.child.update({
          where: { id },
          data: { deletedAt: null },
        });

        this.logger.debug(
          `TASK-DATA-003: Child ${id} restored with audit trail`,
        );

        return restored;
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to restore child: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'restore',
        'Failed to restore child',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Hard delete a child with tenant isolation
   * TASK-DATA-003: Kept as option for permanent deletion when needed
   * @param id - Child ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @throws NotFoundException if child doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string, userId?: string): Promise<void> {
    try {
      // Use transaction to ensure audit log and delete succeed together
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch entity data for audit snapshot (include soft-deleted)
        const existing = await tx.child.findFirst({
          where: { id, tenantId },
          include: {
            parent: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        if (!existing) {
          throw new NotFoundException('Child', id);
        }

        // Step 2: Create audit log entry (transactional)
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Child',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: Prisma.DbNull,
            changeSummary: `Child permanently deleted: ${existing.firstName} ${existing.lastName} (DOB: ${existing.dateOfBirth.toISOString().split('T')[0]}), Parent: ${existing.parent?.firstName} ${existing.parent?.lastName}`,
          },
        });

        // Step 3: Execute delete
        await tx.child.delete({
          where: { id },
        });

        this.logger.debug(
          `TASK-DATA-003: Child ${id} permanently deleted with audit trail`,
        );
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
