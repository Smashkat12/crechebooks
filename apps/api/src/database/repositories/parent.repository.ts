import { Injectable, Logger } from '@nestjs/common';
import { Parent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateParentDto,
  UpdateParentDto,
  ParentFilterDto,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '../dto/parent.dto';
import { PaginatedResult } from '../../shared/interfaces';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class ParentRepository {
  private readonly logger = new Logger(ParentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new parent
   * @throws ConflictException if duplicate email per tenant or xeroContactId
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateParentDto): Promise<Parent> {
    try {
      return await this.prisma.parent.create({
        data: {
          tenantId: dto.tenantId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          whatsapp: dto.whatsapp ?? null,
          preferredContact: dto.preferredContact ?? 'EMAIL',
          idNumber: dto.idNumber ?? null,
          address: dto.address ?? null,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create parent: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          if (target?.includes('email')) {
            throw new ConflictException(
              `Parent with email '${dto.email}' already exists for this tenant`,
              { tenantId: dto.tenantId, email: dto.email },
            );
          }
          if (target?.includes('xero_contact_id')) {
            throw new ConflictException(
              'Parent with this Xero contact ID already exists',
            );
          }
          throw new ConflictException('Parent already exists');
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find parent by ID with tenant isolation
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param id - Parent ID
   * @param tenantId - Tenant ID for isolation
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Parent or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(
    id: string,
    tenantId: string,
    includeDeleted = false,
  ): Promise<Parent | null> {
    try {
      return await this.prisma.parent.findFirst({
        where: {
          id,
          tenantId,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
        include: {
          children: true, // Include children for the parent
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find parent by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all parents for a tenant with optional filters and pagination
   * TASK-DATA-004: Added pagination support for memory efficiency
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param filter - Filter options including search, isActive, pagination
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Paginated array of parents
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: ParentFilterDto,
    includeDeleted = false,
  ): Promise<PaginatedResult<Parent>> {
    try {
      // TASK-DATA-004: Pagination with sensible defaults
      const page = filter.page ?? DEFAULT_PAGE;
      const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const skip = (page - 1) * limit;

      const where: Prisma.ParentWhereInput = {
        tenantId,
        // TASK-DATA-003: Exclude soft-deleted records by default
        ...(includeDeleted ? {} : { deletedAt: null }),
      };

      if (filter.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      if (filter.search) {
        where.OR = [
          { firstName: { contains: filter.search, mode: 'insensitive' } },
          { lastName: { contains: filter.search, mode: 'insensitive' } },
          { email: { contains: filter.search, mode: 'insensitive' } },
        ];
      }

      // Execute count and find in parallel for performance
      const [total, data] = await Promise.all([
        this.prisma.parent.count({ where }),
        this.prisma.parent.findMany({
          where,
          include: {
            children: true, // Include children for each parent
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          skip,
          take: limit,
        }),
      ]);

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      this.logger.debug(
        `TASK-DATA-004: Fetched ${data.length} of ${total} parents (page ${page}/${totalPages}, hasNext=${hasNext}, hasPrev=${hasPrev})`,
      );

      return {
        data,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to find parents for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find parents',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find parent by email within a tenant
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param email - Email address to search
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Parent or null if not found
   * @throws DatabaseException for database errors
   */
  async findByEmail(
    tenantId: string,
    email: string,
    includeDeleted = false,
  ): Promise<Parent | null> {
    try {
      // Use findFirst to support the deletedAt filter
      return await this.prisma.parent.findFirst({
        where: {
          tenantId,
          email,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find parent by email: ${email} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByEmail',
        'Failed to find parent by email',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find parent by Xero contact ID
   * @returns Parent or null if not found
   * @throws DatabaseException for database errors
   */
  async findByXeroContactId(xeroContactId: string): Promise<Parent | null> {
    try {
      return await this.prisma.parent.findUnique({
        where: { xeroContactId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find parent by xeroContactId: ${xeroContactId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByXeroContactId',
        'Failed to find parent by Xero contact ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a parent with tenant isolation
   * @param id - Parent ID
   * @param tenantId - Tenant ID for isolation
   * @param dto - Update data
   * @throws NotFoundException if parent doesn't exist
   * @throws ConflictException if update causes duplicate email
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateParentDto,
  ): Promise<Parent> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Parent', id);
      }

      const updateData: Prisma.ParentUpdateInput = {};

      if (dto.firstName !== undefined) {
        updateData.firstName = dto.firstName;
      }
      if (dto.lastName !== undefined) {
        updateData.lastName = dto.lastName;
      }
      if (dto.email !== undefined) {
        updateData.email = dto.email;
      }
      if (dto.phone !== undefined) {
        updateData.phone = dto.phone;
      }
      if (dto.whatsapp !== undefined) {
        updateData.whatsapp = dto.whatsapp;
      }
      if (dto.preferredContact !== undefined) {
        updateData.preferredContact = dto.preferredContact;
      }
      if (dto.idNumber !== undefined) {
        updateData.idNumber = dto.idNumber;
      }
      if (dto.address !== undefined) {
        updateData.address = dto.address;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      return await this.prisma.parent.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update parent ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Parent with email '${dto.email}' already exists for this tenant`,
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Soft delete a parent (set deletedAt timestamp) with tenant isolation
   * TASK-DATA-003: Soft delete implementation for data retention
   * @param id - Parent ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @throws NotFoundException if parent doesn't exist or is already deleted
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
        const existing = await tx.parent.findFirst({
          where: { id, tenantId, deletedAt: null },
          include: { children: { select: { id: true } } },
        });

        if (!existing) {
          throw new NotFoundException('Parent', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Parent',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: new Date(),
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Parent soft-deleted: ${existing.firstName} ${existing.lastName} (${existing.email}), ${existing.children.length} children`,
          },
        });

        // Step 3: Set deletedAt timestamp (soft delete)
        await tx.parent.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        this.logger.debug(
          `TASK-DATA-003: Parent ${id} soft-deleted with audit trail`,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete parent: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'softDelete',
        'Failed to soft delete parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Restore a soft-deleted parent
   * TASK-DATA-003: Restore functionality for accidentally deleted records
   * @param id - Parent ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @returns Restored parent
   * @throws NotFoundException if parent doesn't exist or is not deleted
   * @throws DatabaseException for database errors
   */
  async restore(
    id: string,
    tenantId: string,
    userId?: string,
  ): Promise<Parent> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch soft-deleted entity
        const existing = await tx.parent.findFirst({
          where: { id, tenantId, deletedAt: { not: null } },
        });

        if (!existing) {
          throw new NotFoundException('Parent', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Parent',
            entityId: id,
            action: 'UPDATE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: null,
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Parent restored: ${existing.firstName} ${existing.lastName} (${existing.email})`,
          },
        });

        // Step 3: Clear deletedAt timestamp (restore)
        const restored = await tx.parent.update({
          where: { id },
          data: { deletedAt: null },
        });

        this.logger.debug(
          `TASK-DATA-003: Parent ${id} restored with audit trail`,
        );

        return restored;
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to restore parent: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'restore',
        'Failed to restore parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Hard delete a parent (permanent deletion - cascades to children) with tenant isolation
   * TASK-DATA-003: Kept as option for permanent deletion when needed
   * @param id - Parent ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @throws NotFoundException if parent doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string, userId?: string): Promise<void> {
    try {
      // Use transaction to ensure audit log and delete succeed together
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch entity data with children count for audit snapshot (include soft-deleted)
        const existing = await tx.parent.findFirst({
          where: { id, tenantId },
          include: { children: { select: { id: true } } },
        });

        if (!existing) {
          throw new NotFoundException('Parent', id);
        }

        // Step 2: Create audit log entry (transactional)
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Parent',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: Prisma.DbNull,
            changeSummary: `Parent permanently deleted: ${existing.firstName} ${existing.lastName} (${existing.email}), ${existing.children.length} children`,
          },
        });

        // Step 3: Execute delete (cascades to children)
        await tx.parent.delete({
          where: { id },
        });

        this.logger.debug(
          `TASK-DATA-003: Parent ${id} permanently deleted with audit trail`,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete parent: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete parent',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
