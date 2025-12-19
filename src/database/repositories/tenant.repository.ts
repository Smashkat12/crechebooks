import { Injectable, Logger } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from '../dto/tenant.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class TenantRepository {
  private readonly logger = new Logger(TenantRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    try {
      return await this.prisma.tenant.create({
        data: dto,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create tenant: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : error,
      );

      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        throw new ConflictException('Tenant with this email already exists');
      }
      throw new DatabaseException(
        'create',
        'Failed to create tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findById(id: string): Promise<Tenant | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find tenant by id: ${id}`,
        error instanceof Error ? error.stack : error,
      );
      throw new DatabaseException(
        'findById',
        'Failed to find tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findByIdOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }
    return tenant;
  }

  async findByEmail(email: string): Promise<Tenant | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { email },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find tenant by email: ${email}`,
        error instanceof Error ? error.stack : error,
      );
      throw new DatabaseException(
        'findByEmail',
        'Failed to find tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findByXeroTenantId(xeroTenantId: string): Promise<Tenant | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { xeroTenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find tenant by xeroTenantId: ${xeroTenantId}`,
        error instanceof Error ? error.stack : error,
      );
      throw new DatabaseException(
        'findByXeroTenantId',
        'Failed to find tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    try {
      // First verify tenant exists
      await this.findByIdOrThrow(id);

      return await this.prisma.tenant.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update tenant ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : error,
      );

      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        throw new ConflictException('Email already in use by another tenant');
      }
      throw new DatabaseException(
        'update',
        'Failed to update tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findAll(): Promise<Tenant[]> {
    try {
      return await this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        'Failed to find all tenants',
        error instanceof Error ? error.stack : error,
      );
      throw new DatabaseException(
        'findAll',
        'Failed to find tenants',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.findByIdOrThrow(id);
      await this.prisma.tenant.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete tenant: ${id}`,
        error instanceof Error ? error.stack : error,
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
