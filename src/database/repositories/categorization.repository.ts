import { Injectable, Logger } from '@nestjs/common';
import { Categorization, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategorizationDto,
  UpdateCategorizationDto,
  ReviewCategorizationDto,
  CategorizationFilterDto,
} from '../dto/categorization.dto';
import {
  NotFoundException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';
import {
  CategorizationSource,
  VatType,
} from '../entities/categorization.entity';

export interface PaginatedCategorizationResult {
  data: Categorization[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CategorizationRepository {
  private readonly logger = new Logger(CategorizationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new categorization
   * @throws BusinessException if split validation fails
   * @throws BusinessException if VAT validation fails
   * @throws NotFoundException if transaction doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateCategorizationDto): Promise<Categorization> {
    try {
      this.validateSplitTransaction(dto);
      this.validateVatCalculation(dto);

      return await this.prisma.categorization.create({
        data: {
          transactionId: dto.transactionId,
          accountCode: dto.accountCode,
          accountName: dto.accountName,
          confidenceScore: dto.confidenceScore,
          reasoning: dto.reasoning ?? null,
          source: dto.source,
          isSplit: dto.isSplit,
          splitAmountCents: dto.splitAmountCents ?? null,
          vatAmountCents: dto.vatAmountCents ?? null,
          vatType: dto.vatType,
        },
      });
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(
        `Failed to create categorization: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Transaction', dto.transactionId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create categorization',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find categorization by ID
   * @returns Categorization or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<Categorization | null> {
    try {
      return await this.prisma.categorization.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find categorization by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find categorization',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all categorizations for a transaction
   * @returns Array of categorizations
   * @throws DatabaseException for database errors
   */
  async findByTransaction(transactionId: string): Promise<Categorization[]> {
    try {
      return await this.prisma.categorization.findMany({
        where: { transactionId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find categorizations for transaction: ${transactionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTransaction',
        'Failed to find categorizations',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find categorizations pending review for a tenant
   * (categorizations where source is AI_SUGGESTED and reviewedBy is null)
   * @returns Array of categorizations needing review
   * @throws DatabaseException for database errors
   */
  async findPendingReview(tenantId: string): Promise<Categorization[]> {
    try {
      return await this.prisma.categorization.findMany({
        where: {
          transaction: {
            tenantId,
            isDeleted: false,
          },
          source: CategorizationSource.AI_SUGGESTED,
          reviewedBy: null,
        },
        include: {
          transaction: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending review categorizations for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPendingReview',
        'Failed to find pending review categorizations',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find categorizations with filters and pagination
   * @returns Paginated result with categorizations
   * @throws DatabaseException for database errors
   */
  async findWithFilters(
    tenantId: string,
    filter: CategorizationFilterDto,
  ): Promise<PaginatedCategorizationResult> {
    try {
      const page = filter.page ?? 1;
      const limit = filter.limit ?? 20;
      const skip = (page - 1) * limit;

      const where: Prisma.CategorizationWhereInput = {
        transaction: {
          tenantId,
          isDeleted: false,
        },
      };

      if (filter.source) {
        where.source = filter.source;
      }

      if (filter.vatType) {
        where.vatType = filter.vatType;
      }

      if (filter.needsReview === true) {
        where.source = CategorizationSource.AI_SUGGESTED;
        where.reviewedBy = null;
      }

      if (filter.minConfidence !== undefined) {
        where.confidenceScore = { gte: filter.minConfidence };
      }

      const [data, total] = await Promise.all([
        this.prisma.categorization.findMany({
          where,
          include: { transaction: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.categorization.count({ where }),
      ]);

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(
        `Failed to find categorizations with filters for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findWithFilters',
        'Failed to find categorizations',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Review a categorization (mark as reviewed, optionally override values)
   * @throws NotFoundException if categorization doesn't exist
   * @throws NotFoundException if reviewer (user) doesn't exist
   * @throws DatabaseException for other database errors
   */
  async review(
    id: string,
    dto: ReviewCategorizationDto,
  ): Promise<Categorization> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Categorization', id);
      }

      const updateData: Prisma.CategorizationUpdateInput = {
        reviewer: {
          connect: { id: dto.reviewedBy },
        },
        reviewedAt: new Date(),
        source: CategorizationSource.USER_OVERRIDE,
      };

      if (dto.accountCode !== undefined) {
        updateData.accountCode = dto.accountCode;
      }

      if (dto.accountName !== undefined) {
        updateData.accountName = dto.accountName;
      }

      if (dto.vatType !== undefined) {
        updateData.vatType = dto.vatType;
      }

      if (dto.vatAmountCents !== undefined) {
        updateData.vatAmountCents = dto.vatAmountCents;
      }

      return await this.prisma.categorization.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to review categorization ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: Foreign key constraint violation
        // P2025: Record not found for connect operation
        if (error.code === 'P2003' || error.code === 'P2025') {
          throw new NotFoundException('User', dto.reviewedBy);
        }
      }
      throw new DatabaseException(
        'review',
        'Failed to review categorization',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a categorization
   * @throws NotFoundException if categorization doesn't exist
   * @throws BusinessException if validation fails
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    dto: UpdateCategorizationDto,
  ): Promise<Categorization> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Categorization', id);
      }

      // Merge existing with updates for validation
      const merged = {
        isSplit: dto.isSplit ?? existing.isSplit,
        splitAmountCents:
          dto.splitAmountCents ?? existing.splitAmountCents ?? undefined,
        vatType: dto.vatType ?? existing.vatType,
        vatAmountCents:
          dto.vatAmountCents ?? existing.vatAmountCents ?? undefined,
      };

      if (dto.isSplit !== undefined || dto.splitAmountCents !== undefined) {
        this.validateSplitTransaction(
          merged as unknown as CreateCategorizationDto,
        );
      }

      if (dto.vatType !== undefined || dto.vatAmountCents !== undefined) {
        this.validateVatCalculation(
          merged as unknown as CreateCategorizationDto,
        );
      }

      const updateData: Prisma.CategorizationUpdateInput = {};

      if (dto.accountCode !== undefined) {
        updateData.accountCode = dto.accountCode;
      }
      if (dto.accountName !== undefined) {
        updateData.accountName = dto.accountName;
      }
      if (dto.confidenceScore !== undefined) {
        updateData.confidenceScore = dto.confidenceScore;
      }
      if (dto.reasoning !== undefined) {
        updateData.reasoning = dto.reasoning;
      }
      if (dto.source !== undefined) {
        updateData.source = dto.source;
      }
      if (dto.isSplit !== undefined) {
        updateData.isSplit = dto.isSplit;
      }
      if (dto.splitAmountCents !== undefined) {
        updateData.splitAmountCents = dto.splitAmountCents;
      }
      if (dto.vatAmountCents !== undefined) {
        updateData.vatAmountCents = dto.vatAmountCents;
      }
      if (dto.vatType !== undefined) {
        updateData.vatType = dto.vatType;
      }

      return await this.prisma.categorization.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update categorization ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update categorization',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a categorization
   * @throws NotFoundException if categorization doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException('Categorization', id);
      }

      await this.prisma.categorization.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete categorization: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete categorization',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate split transaction rules
   * @throws BusinessException if isSplit=true but splitAmountCents is missing
   */
  private validateSplitTransaction(dto: CreateCategorizationDto): void {
    if (dto.isSplit && dto.splitAmountCents === undefined) {
      throw new BusinessException(
        'Split transactions require splitAmountCents',
        'SPLIT_AMOUNT_REQUIRED',
      );
    }
  }

  /**
   * Validate VAT calculation rules
   * @throws BusinessException if vatType=STANDARD but vatAmountCents is missing
   */
  private validateVatCalculation(dto: CreateCategorizationDto): void {
    if (dto.vatType === VatType.STANDARD && dto.vatAmountCents === undefined) {
      throw new BusinessException(
        'STANDARD VAT type requires vatAmountCents',
        'VAT_AMOUNT_REQUIRED',
      );
    }
  }
}
