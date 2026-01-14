/**
 * Profile Mapping Sync Repository
 * TASK-SPAY-006: SimplePay Profile (Calculation Template) Mapping Management
 *
 * Repository for managing profile mapping synchronization between
 * CrecheBooks and SimplePay.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ProfileMappingSync, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProfileMappingSyncDto,
  UpdateProfileMappingSyncDto,
  ProfileMappingFilterDto,
} from '../dto/profile.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class ProfileMappingSyncRepository {
  private readonly logger = new Logger(ProfileMappingSyncRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new profile mapping sync record
   * @throws ConflictException if duplicate for tenant/staff/mapping combination
   * @throws NotFoundException if tenant or staff doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateProfileMappingSyncDto): Promise<ProfileMappingSync> {
    try {
      return await this.prisma.profileMappingSync.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayMappingId: dto.simplePayMappingId,
          simplePayProfileId: dto.simplePayProfileId,
          profileName: dto.profileName,
          calculationSettings: dto.calculationSettings,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create profile mapping sync: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Profile mapping sync already exists for staff ${dto.staffId} with mapping ${dto.simplePayMappingId}`,
            {
              staffId: dto.staffId,
              simplePayMappingId: dto.simplePayMappingId,
              tenantId: dto.tenantId,
            },
          );
        }
        if (error.code === 'P2003') {
          const meta = error.meta as { field_name?: string } | undefined;
          const field = meta?.field_name;
          if (field?.includes('tenant')) {
            throw new NotFoundException('Tenant', dto.tenantId);
          }
          if (field?.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
          throw new NotFoundException('Related entity', 'unknown');
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create profile mapping sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find profile mapping sync by ID
   * @returns ProfileMappingSync or null if not found
   */
  async findById(id: string): Promise<ProfileMappingSync | null> {
    try {
      return await this.prisma.profileMappingSync.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping sync by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find profile mapping sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find profile mapping sync by ID or throw NotFoundException
   */
  async findByIdOrThrow(id: string): Promise<ProfileMappingSync> {
    const sync = await this.findById(id);
    if (!sync) {
      throw new NotFoundException('ProfileMappingSync', id);
    }
    return sync;
  }

  /**
   * Find profile mapping by SimplePay mapping ID
   */
  async findBySimplePayMappingId(
    tenantId: string,
    staffId: string,
    simplePayMappingId: number,
  ): Promise<ProfileMappingSync | null> {
    try {
      return await this.prisma.profileMappingSync.findUnique({
        where: {
          tenantId_staffId_simplePayMappingId: {
            tenantId,
            staffId,
            simplePayMappingId,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping by SimplePay ID: ${simplePayMappingId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findBySimplePayMappingId',
        'Failed to find profile mapping by SimplePay ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all profile mappings for a staff member
   */
  async findByStaff(
    tenantId: string,
    staffId: string,
  ): Promise<ProfileMappingSync[]> {
    try {
      return await this.prisma.profileMappingSync.findMany({
        where: { tenantId, staffId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping syncs for staff: ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStaff',
        'Failed to find profile mapping syncs for staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all profile mappings for a tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    filter?: ProfileMappingFilterDto,
  ): Promise<ProfileMappingSync[]> {
    try {
      const where: Prisma.ProfileMappingSyncWhereInput = { tenantId };

      if (filter?.staffId) {
        where.staffId = filter.staffId;
      }
      if (filter?.profileId) {
        where.simplePayProfileId = filter.profileId;
      }
      if (filter?.profileName) {
        where.profileName = {
          contains: filter.profileName,
          mode: 'insensitive',
        };
      }

      const page = filter?.page ?? 1;
      const limit = filter?.limit ?? 20;

      return await this.prisma.profileMappingSync.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping syncs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find profile mapping syncs for tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all profile mappings for a specific profile
   */
  async findByProfile(
    tenantId: string,
    profileId: number,
  ): Promise<ProfileMappingSync[]> {
    try {
      return await this.prisma.profileMappingSync.findMany({
        where: {
          tenantId,
          simplePayProfileId: profileId,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping syncs for profile: ${profileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByProfile',
        'Failed to find profile mapping syncs for profile',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count profile mappings for a tenant with optional filters
   */
  async countByTenant(
    tenantId: string,
    filter?: ProfileMappingFilterDto,
  ): Promise<number> {
    try {
      const where: Prisma.ProfileMappingSyncWhereInput = { tenantId };

      if (filter?.staffId) {
        where.staffId = filter.staffId;
      }
      if (filter?.profileId) {
        where.simplePayProfileId = filter.profileId;
      }
      if (filter?.profileName) {
        where.profileName = {
          contains: filter.profileName,
          mode: 'insensitive',
        };
      }

      return await this.prisma.profileMappingSync.count({ where });
    } catch (error) {
      this.logger.error(
        `Failed to count profile mapping syncs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countByTenant',
        'Failed to count profile mapping syncs',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a profile mapping sync record
   */
  async update(
    id: string,
    dto: UpdateProfileMappingSyncDto,
  ): Promise<ProfileMappingSync> {
    try {
      const updateData: Prisma.ProfileMappingSyncUpdateInput = {};

      if (dto.simplePayProfileId !== undefined) {
        updateData.simplePayProfileId = dto.simplePayProfileId;
      }
      if (dto.profileName !== undefined) {
        updateData.profileName = dto.profileName;
      }
      if (dto.calculationSettings !== undefined) {
        updateData.calculationSettings = dto.calculationSettings;
      }

      return await this.prisma.profileMappingSync.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('ProfileMappingSync', id);
        }
      }
      this.logger.error(
        `Failed to update profile mapping sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update profile mapping sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Upsert profile mapping sync - create if not exists, update if exists
   */
  async upsert(dto: CreateProfileMappingSyncDto): Promise<ProfileMappingSync> {
    try {
      return await this.prisma.profileMappingSync.upsert({
        where: {
          tenantId_staffId_simplePayMappingId: {
            tenantId: dto.tenantId,
            staffId: dto.staffId,
            simplePayMappingId: dto.simplePayMappingId,
          },
        },
        create: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayMappingId: dto.simplePayMappingId,
          simplePayProfileId: dto.simplePayProfileId,
          profileName: dto.profileName,
          calculationSettings: dto.calculationSettings,
        },
        update: {
          simplePayProfileId: dto.simplePayProfileId,
          profileName: dto.profileName,
          calculationSettings: dto.calculationSettings,
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert profile mapping sync: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          const meta = error.meta as { field_name?: string } | undefined;
          const field = meta?.field_name;
          if (field?.includes('tenant')) {
            throw new NotFoundException('Tenant', dto.tenantId);
          }
          if (field?.includes('staff')) {
            throw new NotFoundException('Staff', dto.staffId);
          }
        }
      }
      throw new DatabaseException(
        'upsert',
        'Failed to upsert profile mapping sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a profile mapping sync record by ID
   * @throws NotFoundException if record doesn't exist
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.profileMappingSync.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('ProfileMappingSync', id);
        }
      }
      this.logger.error(
        `Failed to delete profile mapping sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete profile mapping sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a profile mapping sync by SimplePay mapping ID
   * @throws NotFoundException if record doesn't exist
   */
  async deleteBySimplePayMappingId(
    tenantId: string,
    staffId: string,
    simplePayMappingId: number,
  ): Promise<void> {
    try {
      await this.prisma.profileMappingSync.delete({
        where: {
          tenantId_staffId_simplePayMappingId: {
            tenantId,
            staffId,
            simplePayMappingId,
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            'ProfileMappingSync',
            `${staffId}/${simplePayMappingId}`,
          );
        }
      }
      this.logger.error(
        `Failed to delete profile mapping sync for SimplePay ID ${simplePayMappingId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteBySimplePayMappingId',
        'Failed to delete profile mapping sync by SimplePay ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all profile mappings for a staff member
   */
  async deleteByStaff(tenantId: string, staffId: string): Promise<number> {
    try {
      const result = await this.prisma.profileMappingSync.deleteMany({
        where: { tenantId, staffId },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete profile mapping syncs for staff ${staffId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteByStaff',
        'Failed to delete profile mapping syncs for staff',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get staff IDs that have a specific profile assigned
   */
  async getStaffIdsByProfile(
    tenantId: string,
    profileId: number,
  ): Promise<string[]> {
    try {
      const mappings = await this.prisma.profileMappingSync.findMany({
        where: {
          tenantId,
          simplePayProfileId: profileId,
        },
        select: { staffId: true },
        distinct: ['staffId'],
      });
      return mappings.map((m) => m.staffId);
    } catch (error) {
      this.logger.error(
        `Failed to get staff IDs by profile: ${profileId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getStaffIdsByProfile',
        'Failed to get staff IDs by profile',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get unique profile IDs for a tenant
   */
  async getUniqueProfileIds(tenantId: string): Promise<number[]> {
    try {
      const mappings = await this.prisma.profileMappingSync.findMany({
        where: { tenantId },
        select: { simplePayProfileId: true },
        distinct: ['simplePayProfileId'],
      });
      return mappings.map((m) => m.simplePayProfileId);
    } catch (error) {
      this.logger.error(
        `Failed to get unique profile IDs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getUniqueProfileIds',
        'Failed to get unique profile IDs',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
