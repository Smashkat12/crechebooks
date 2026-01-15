/**
 * Calculation Item Cache Repository
 * TASK-SPAY-003: SimplePay Calculation Items Retrieval with Caching
 */

import { Injectable, Logger } from '@nestjs/common';
import { CalculationItemCache, CalculationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCalculationItemCacheDto,
  UpdateCalculationItemCacheDto,
  CalculationItemCacheFilterDto,
} from '../dto/calculations.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';
import { CacheStatus } from '../entities/calculation.entity';

// Default cache validity in hours (24 hours)
const DEFAULT_CACHE_HOURS = 24;

@Injectable()
export class CalculationCacheRepository {
  private readonly logger = new Logger(CalculationCacheRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new calculation item cache entry
   */
  async create(
    dto: CreateCalculationItemCacheDto,
  ): Promise<CalculationItemCache> {
    try {
      return await this.prisma.calculationItemCache.create({
        data: {
          tenantId: dto.tenantId,
          code: dto.code,
          name: dto.name,
          type: dto.type,
          taxable: dto.taxable,
          affectsUif: dto.affectsUif,
          category: dto.category ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create calculation cache: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Calculation item with code '${dto.code}' already exists for this tenant`,
            { code: dto.code, tenantId: dto.tenantId },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find calculation item cache by ID with tenant isolation
   * @param id - Calculation item cache ID
   * @param tenantId - Tenant ID for isolation
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<CalculationItemCache | null> {
    try {
      return await this.prisma.calculationItemCache.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find calculation cache by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find calculation item cache by code within a tenant
   */
  async findByCode(
    tenantId: string,
    code: string,
  ): Promise<CalculationItemCache | null> {
    try {
      return await this.prisma.calculationItemCache.findUnique({
        where: {
          tenantId_code: {
            tenantId,
            code,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find calculation cache by code: ${code} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByCode',
        'Failed to find calculation cache by code',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all calculation items for a tenant with optional filters
   */
  async findByTenantId(
    tenantId: string,
    filter?: CalculationItemCacheFilterDto,
  ): Promise<CalculationItemCache[]> {
    try {
      const where: Prisma.CalculationItemCacheWhereInput = { tenantId };

      if (filter?.type !== undefined) {
        where.type = filter.type;
      }
      if (filter?.taxable !== undefined) {
        where.taxable = filter.taxable;
      }
      if (filter?.affectsUif !== undefined) {
        where.affectsUif = filter.affectsUif;
      }
      if (filter?.search !== undefined && filter.search.trim() !== '') {
        const searchTerm = filter.search.trim();
        where.OR = [
          { code: { contains: searchTerm, mode: 'insensitive' } },
          { name: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      return await this.prisma.calculationItemCache.findMany({
        where,
        orderBy: [{ code: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find calculation cache for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find calculation items by type for a tenant
   */
  async findByType(
    tenantId: string,
    type: CalculationType,
  ): Promise<CalculationItemCache[]> {
    try {
      return await this.prisma.calculationItemCache.findMany({
        where: {
          tenantId,
          type,
        },
        orderBy: [{ code: 'asc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find calculation cache by type: ${type} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByType',
        'Failed to find calculation cache by type',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a calculation item cache entry
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateCalculationItemCacheDto,
  ): Promise<CalculationItemCache> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('CalculationItemCache', id);
      }

      const updateData: Prisma.CalculationItemCacheUpdateInput = {};

      if (dto.name !== undefined) {
        updateData.name = dto.name;
      }
      if (dto.type !== undefined) {
        updateData.type = dto.type;
      }
      if (dto.taxable !== undefined) {
        updateData.taxable = dto.taxable;
      }
      if (dto.affectsUif !== undefined) {
        updateData.affectsUif = dto.affectsUif;
      }
      if (dto.category !== undefined) {
        updateData.category = dto.category;
      }

      return await this.prisma.calculationItemCache.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update calculation cache ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Upsert a calculation item cache entry
   */
  async upsert(
    tenantId: string,
    code: string,
    data: Omit<CreateCalculationItemCacheDto, 'tenantId' | 'code'>,
  ): Promise<CalculationItemCache> {
    try {
      return await this.prisma.calculationItemCache.upsert({
        where: {
          tenantId_code: {
            tenantId,
            code,
          },
        },
        update: {
          name: data.name,
          type: data.type,
          taxable: data.taxable,
          affectsUif: data.affectsUif,
          category: data.category ?? null,
        },
        create: {
          tenantId,
          code,
          name: data.name,
          type: data.type,
          taxable: data.taxable,
          affectsUif: data.affectsUif,
          category: data.category ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert calculation cache for tenant: ${tenantId}, code: ${code}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'upsert',
        'Failed to upsert calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Bulk upsert calculation items
   */
  async bulkUpsert(
    tenantId: string,
    items: Array<Omit<CreateCalculationItemCacheDto, 'tenantId'>>,
  ): Promise<{ upserted: number; failed: number }> {
    let upserted = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await this.upsert(tenantId, item.code, item);
        upserted++;
      } catch (error) {
        this.logger.warn(
          `Failed to upsert calculation item ${item.code}: ${error}`,
        );
        failed++;
      }
    }

    return { upserted, failed };
  }

  /**
   * Delete a calculation item cache entry
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('CalculationItemCache', id);
      }

      await this.prisma.calculationItemCache.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete calculation cache: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all cache entries for a tenant
   */
  async deleteByTenantId(tenantId: string): Promise<number> {
    try {
      const result = await this.prisma.calculationItemCache.deleteMany({
        where: { tenantId },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete calculation cache for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteByTenantId',
        'Failed to delete calculation cache',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get cache status for a tenant
   */
  async getCacheStatus(tenantId: string): Promise<CacheStatus> {
    try {
      const items = await this.prisma.calculationItemCache.findMany({
        where: { tenantId },
        orderBy: { cachedAt: 'desc' },
        take: 1,
      });

      if (items.length === 0) {
        return {
          isValid: false,
          itemCount: 0,
          cachedAt: null,
          needsRefresh: true,
        };
      }

      const totalCount = await this.prisma.calculationItemCache.count({
        where: { tenantId },
      });

      const latestItem = items[0];
      const now = new Date();
      const cacheAge = now.getTime() - latestItem.cachedAt.getTime();
      const maxCacheAge = DEFAULT_CACHE_HOURS * 60 * 60 * 1000;
      const isExpired = cacheAge > maxCacheAge;

      return {
        isValid: !isExpired,
        itemCount: totalCount,
        cachedAt: latestItem.cachedAt,
        needsRefresh: isExpired,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get cache status for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getCacheStatus',
        'Failed to get cache status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count calculation items for a tenant
   */
  async count(tenantId: string): Promise<number> {
    try {
      return await this.prisma.calculationItemCache.count({
        where: { tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to count calculation items for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'count',
        'Failed to count calculation items',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
