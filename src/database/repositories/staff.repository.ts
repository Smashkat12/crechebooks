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
          tenantId: dto.tenantId,
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
            { idNumber: dto.idNumber, tenantId: dto.tenantId },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
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
   * Find staff by ID
   * @returns Staff or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<Staff | null> {
    try {
      return await this.prisma.staff.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find staff by id: ${id}`,
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
   * @returns Staff or null if not found
   * @throws DatabaseException for database errors
   */
  async findByIdNumber(
    tenantId: string,
    idNumber: string,
  ): Promise<Staff | null> {
    try {
      return await this.prisma.staff.findUnique({
        where: {
          tenantId_idNumber: {
            tenantId,
            idNumber,
          },
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
   * @returns Array of staff
   * @throws DatabaseException for database errors
   */
  async findByTenantId(
    tenantId: string,
    filter?: StaffFilterDto,
  ): Promise<Staff[]> {
    try {
      const where: Prisma.StaffWhereInput = { tenantId };

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
   * @returns Array of active staff
   * @throws DatabaseException for database errors
   */
  async findActiveByTenantId(tenantId: string): Promise<Staff[]> {
    try {
      return await this.prisma.staff.findMany({
        where: {
          tenantId,
          isActive: true,
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
  async update(id: string, dto: UpdateStaffDto): Promise<Staff> {
    try {
      const existing = await this.findById(id);
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
  async deactivate(id: string, endDate?: Date): Promise<Staff> {
    try {
      const existing = await this.findById(id);
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
   * Delete a staff member (hard delete)
   * @throws NotFoundException if staff doesn't exist
   * @throws ConflictException if staff has payroll records
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
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
