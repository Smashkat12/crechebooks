import { Injectable, Logger } from '@nestjs/common';
import { Parent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateParentDto,
  UpdateParentDto,
  ParentFilterDto,
} from '../dto/parent.dto';
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
   * Find parent by ID
   * @returns Parent or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<Parent | null> {
    try {
      return await this.prisma.parent.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find parent by id: ${id}`,
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
   * Find all parents for a tenant with optional filters
   * @returns Array of parents
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: ParentFilterDto,
  ): Promise<Parent[]> {
    try {
      const where: Prisma.ParentWhereInput = {
        tenantId,
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

      return await this.prisma.parent.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
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
   * @returns Parent or null if not found
   * @throws DatabaseException for database errors
   */
  async findByEmail(tenantId: string, email: string): Promise<Parent | null> {
    try {
      return await this.prisma.parent.findUnique({
        where: {
          tenantId_email: {
            tenantId,
            email,
          },
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
   * Update a parent
   * @throws NotFoundException if parent doesn't exist
   * @throws ConflictException if update causes duplicate email
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateParentDto): Promise<Parent> {
    try {
      const existing = await this.findById(id);
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
   * Delete a parent (hard delete - cascades to children)
   * @throws NotFoundException if parent doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Parent', id);
      }

      await this.prisma.parent.delete({
        where: { id },
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
