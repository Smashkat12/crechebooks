import { Injectable, Logger } from '@nestjs/common';
import { Staff, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStaffDto,
  UpdateStaffDto,
  StaffFilterDto,
} from '../dto/staff.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class StaffRepository {
  private readonly logger = new Logger(StaffRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new staff member
   * @throws NotFoundException if tenant doesn't exist
   * @throws ConflictException if idNumber already exists for tenant
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateStaffDto): Promise<Staff> {
    try {
      return await this.prisma.staff.create({
        data: {
          tenantId: dto.tenantId!,
          employeeNumber: dto.employeeNumber ?? null,
          firstName: dto.firstName,
          lastName: dto.lastName,
          idNumber: dto.idNumber,
          taxNumber: dto.taxNumber ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          dateOfBirth: dto.dateOfBirth,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
          employmentType: dto.employmentType,
          payFrequency: dto.payFrequency ?? 'MONTHLY',
          basicSalaryCents: dto.basicSalaryCents,
          bankName: dto.bankName ?? null,
          bankAccount: dto.bankAccount ?? null,
          bankBranchCode: dto.bankBranchCode ?? null,
          medicalAidMembers: dto.medicalAidMembers ?? 0,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create staff: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Staff with idNumber '${dto.idNumber}' already exists for this tenant`,
            { idNumber: dto.idNumber, tenantId: dto.tenantId! },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId!);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find staff by ID with tenant isolation
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param id - Staff ID
   * @param tenantId - Tenant ID for isolation
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Staff or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(
    id: string,
    tenantId: string,
    includeDeleted = false,
  ): Promise<Staff | null> {
    try {
      return await this.prisma.staff.findFirst({
        where: {
          id,
          tenantId,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find staff by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find staff by ID number within a tenant
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param idNumber - South African ID number
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Staff or null if not found
   * @throws DatabaseException for database errors
   */
  async findByIdNumber(
    tenantId: string,
    idNumber: string,
    includeDeleted = false,
  ): Promise<Staff | null> {
    try {
      // Use findFirst to support the deletedAt filter
      return await this.prisma.staff.findFirst({
        where: {
          tenantId,
          idNumber,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find staff by idNumber: ${idNumber} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByIdNumber',
        'Failed to find staff by ID number',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all staff for a tenant with optional filters
   * TASK-DATA-003: Added includeDeleted option for soft delete support
   * @param tenantId - Tenant ID for isolation
   * @param filter - Filter options
   * @param includeDeleted - Whether to include soft-deleted records (default: false)
   * @returns Array of staff
   * @throws DatabaseException for database errors
   */
  async findByTenantId(
    tenantId: string,
    filter?: StaffFilterDto,
    includeDeleted = false,
  ): Promise<Staff[]> {
    try {
      const where: Prisma.StaffWhereInput = {
        tenantId,
        // TASK-DATA-003: Exclude soft-deleted records by default
        ...(includeDeleted ? {} : { deletedAt: null }),
      };

      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.employmentType !== undefined) {
        where.employmentType = filter.employmentType;
      }
      if (filter?.payFrequency !== undefined) {
        where.payFrequency = filter.payFrequency;
      }
      if (filter?.search !== undefined && filter.search.trim() !== '') {
        const searchTerm = filter.search.trim();
        where.OR = [
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
          { idNumber: { contains: searchTerm } },
          { employeeNumber: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      return await this.prisma.staff.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find staff for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all active staff for a tenant
   * TASK-DATA-003: Excludes soft-deleted records
   * @param tenantId - Tenant ID for isolation
   * @returns Array of active staff (not soft-deleted)
   * @throws DatabaseException for database errors
   */
  async findActiveByTenantId(tenantId: string): Promise<Staff[]> {
    try {
      return await this.prisma.staff.findMany({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null, // TASK-DATA-003: Exclude soft-deleted
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find active staff for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findActiveByTenantId',
        'Failed to find active staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a staff member
   * @throws NotFoundException if staff doesn't exist
   * @throws ConflictException if updating to a duplicate idNumber
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateStaffDto,
  ): Promise<Staff> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Staff', id);
      }

      const updateData: Prisma.StaffUpdateInput = {};

      if (dto.employeeNumber !== undefined) {
        updateData.employeeNumber = dto.employeeNumber;
      }
      if (dto.firstName !== undefined) {
        updateData.firstName = dto.firstName;
      }
      if (dto.lastName !== undefined) {
        updateData.lastName = dto.lastName;
      }
      if (dto.idNumber !== undefined) {
        updateData.idNumber = dto.idNumber;
      }
      if (dto.taxNumber !== undefined) {
        updateData.taxNumber = dto.taxNumber;
      }
      if (dto.email !== undefined) {
        updateData.email = dto.email;
      }
      if (dto.phone !== undefined) {
        updateData.phone = dto.phone;
      }
      if (dto.dateOfBirth !== undefined) {
        updateData.dateOfBirth = dto.dateOfBirth;
      }
      if (dto.startDate !== undefined) {
        updateData.startDate = dto.startDate;
      }
      if (dto.endDate !== undefined) {
        updateData.endDate = dto.endDate;
      }
      if (dto.employmentType !== undefined) {
        updateData.employmentType = dto.employmentType;
      }
      if (dto.payFrequency !== undefined) {
        updateData.payFrequency = dto.payFrequency;
      }
      if (dto.basicSalaryCents !== undefined) {
        updateData.basicSalaryCents = dto.basicSalaryCents;
      }
      if (dto.bankName !== undefined) {
        updateData.bankName = dto.bankName;
      }
      if (dto.bankAccount !== undefined) {
        updateData.bankAccount = dto.bankAccount;
      }
      if (dto.bankBranchCode !== undefined) {
        updateData.bankBranchCode = dto.bankBranchCode;
      }
      if (dto.medicalAidMembers !== undefined) {
        updateData.medicalAidMembers = dto.medicalAidMembers;
      }

      return await this.prisma.staff.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update staff ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Staff with idNumber '${dto.idNumber}' already exists for this tenant`,
            { idNumber: dto.idNumber },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Deactivate a staff member
   * Sets isActive to false and optionally sets endDate
   * @throws NotFoundException if staff doesn't exist
   * @throws DatabaseException for database errors
   */
  async deactivate(
    id: string,
    tenantId: string,
    endDate?: Date,
  ): Promise<Staff> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Staff', id);
      }

      return await this.prisma.staff.update({
        where: { id },
        data: {
          isActive: false,
          endDate: endDate ?? new Date(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to deactivate staff: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deactivate',
        'Failed to deactivate staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Soft delete a staff member (set deletedAt timestamp) with tenant isolation
   * TASK-DATA-003: Soft delete implementation for data retention
   * @param id - Staff ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @throws NotFoundException if staff doesn't exist or is already deleted
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
        const existing = await tx.staff.findFirst({
          where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
          throw new NotFoundException('Staff', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Staff',
            entityId: id,
            action: 'DELETE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: new Date(),
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Staff soft-deleted: ${existing.firstName} ${existing.lastName} (ID: ${existing.idNumber})`,
          },
        });

        // Step 3: Set deletedAt timestamp (soft delete)
        await tx.staff.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        this.logger.debug(
          `TASK-DATA-003: Staff ${id} soft-deleted with audit trail`,
        );
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete staff: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'softDelete',
        'Failed to soft delete staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Restore a soft-deleted staff member
   * TASK-DATA-003: Restore functionality for accidentally deleted records
   * @param id - Staff ID
   * @param tenantId - Tenant ID for isolation
   * @param userId - Optional user ID for audit trail
   * @returns Restored staff member
   * @throws NotFoundException if staff doesn't exist or is not deleted
   * @throws DatabaseException for database errors
   */
  async restore(id: string, tenantId: string, userId?: string): Promise<Staff> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Step 1: Fetch soft-deleted entity
        const existing = await tx.staff.findFirst({
          where: { id, tenantId, deletedAt: { not: null } },
        });

        if (!existing) {
          throw new NotFoundException('Staff', id);
        }

        // Step 2: Create audit log entry
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: userId ?? null,
            entityType: 'Staff',
            entityId: id,
            action: 'UPDATE',
            beforeValue: existing as unknown as Prisma.InputJsonValue,
            afterValue: {
              ...existing,
              deletedAt: null,
            } as unknown as Prisma.InputJsonValue,
            changeSummary: `Staff restored: ${existing.firstName} ${existing.lastName} (ID: ${existing.idNumber})`,
          },
        });

        // Step 3: Clear deletedAt timestamp (restore)
        const restored = await tx.staff.update({
          where: { id },
          data: { deletedAt: null },
        });

        this.logger.debug(
          `TASK-DATA-003: Staff ${id} restored with audit trail`,
        );

        return restored;
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to restore staff: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'restore',
        'Failed to restore staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Hard delete a staff member (permanent deletion)
   * TASK-DATA-003: Kept as option for permanent deletion when needed
   * @throws NotFoundException if staff doesn't exist
   * @throws ConflictException if staff has payroll records
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      // Include soft-deleted records in lookup for hard delete
      const existing = await this.findById(id, tenantId, true);
      if (!existing) {
        throw new NotFoundException('Staff', id);
      }

      await this.prisma.staff.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete staff: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new ConflictException(
            `Cannot delete staff '${id}' - has associated payroll records`,
            { staffId: id },
          );
        }
      }
      throw new DatabaseException(
        'delete',
        'Failed to delete staff',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
