import { Injectable, Logger } from '@nestjs/common';
import { PayeePattern, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePayeePatternDto,
  UpdatePayeePatternDto,
  PayeePatternFilterDto,
} from '../dto/payee-pattern.dto';
import {
  NotFoundException,
  DatabaseException,
  BusinessException,
  ConflictException,
} from '../../shared/exceptions';

@Injectable()
export class PayeePatternRepository {
  private readonly logger = new Logger(PayeePatternRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new payee pattern
   * @throws BusinessException if recurring pattern missing expectedAmountCents
   * @throws ConflictException if duplicate pattern per tenant
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreatePayeePatternDto): Promise<PayeePattern> {
    try {
      this.validateRecurringPattern(dto);

      return await this.prisma.payeePattern.create({
        data: {
          tenantId: dto.tenantId,
          payeePattern: dto.payeePattern,
          payeeAliases: dto.payeeAliases,
          defaultAccountCode: dto.defaultAccountCode,
          defaultAccountName: dto.defaultAccountName,
          confidenceBoost: dto.confidenceBoost ?? 0,
          isRecurring: dto.isRecurring,
          expectedAmountCents: dto.expectedAmountCents ?? null,
          amountVariancePercent: dto.amountVariancePercent ?? null,
        },
      });
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.error(
        `Failed to create payee pattern: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Payee pattern '${dto.payeePattern}' already exists for this tenant`,
            { tenantId: dto.tenantId, payeePattern: dto.payeePattern },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create payee pattern',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payee pattern by ID with tenant isolation
   * @param id - Payee pattern ID
   * @param tenantId - Tenant ID for isolation
   * @returns PayeePattern or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string, tenantId: string): Promise<PayeePattern | null> {
    try {
      return await this.prisma.payeePattern.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payee pattern by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find payee pattern',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all payee patterns for a tenant with optional filters
   * @returns Array of payee patterns
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: PayeePatternFilterDto,
  ): Promise<PayeePattern[]> {
    try {
      const where: Prisma.PayeePatternWhereInput = {
        tenantId,
      };

      if (filter.isRecurring !== undefined) {
        where.isRecurring = filter.isRecurring;
      }

      if (filter.accountCode) {
        where.defaultAccountCode = filter.accountCode;
      }

      if (filter.search) {
        where.OR = [
          { payeePattern: { contains: filter.search, mode: 'insensitive' } },
          {
            defaultAccountName: {
              contains: filter.search,
              mode: 'insensitive',
            },
          },
        ];
      }

      return await this.prisma.payeePattern.findMany({
        where,
        orderBy: { matchCount: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find payee patterns for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find payee patterns',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find payee pattern by payee name (exact match or alias match)
   * @returns PayeePattern or null if not found
   * @throws DatabaseException for database errors
   */
  async findByPayeeName(
    tenantId: string,
    payeeName: string,
  ): Promise<PayeePattern | null> {
    try {
      // First try exact match on payeePattern
      const exactMatch = await this.prisma.payeePattern.findFirst({
        where: {
          tenantId,
          payeePattern: {
            equals: payeeName,
            mode: 'insensitive',
          },
        },
      });

      if (exactMatch) {
        return exactMatch;
      }

      // Then search in aliases using raw query for JSONB array containment
      const aliasMatches = await this.prisma.payeePattern.findMany({
        where: {
          tenantId,
        },
      });

      // Check aliases (case-insensitive)
      const payeeNameLower = payeeName.toLowerCase();
      for (const pattern of aliasMatches) {
        const aliases = pattern.payeeAliases as string[];
        if (aliases.some((alias) => alias.toLowerCase() === payeeNameLower)) {
          return pattern;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to find payee pattern by payee name: ${payeeName}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByPayeeName',
        'Failed to find payee pattern by payee name',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Increment the match count for a pattern (atomic operation)
   * @throws NotFoundException if pattern doesn't exist
   * @throws DatabaseException for database errors
   */
  async incrementMatchCount(
    id: string,
    tenantId: string,
  ): Promise<PayeePattern> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('PayeePattern', id);
      }

      return await this.prisma.payeePattern.update({
        where: { id },
        data: {
          matchCount: { increment: 1 },
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to increment match count for pattern: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'incrementMatchCount',
        'Failed to increment match count',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a payee pattern
   * @throws NotFoundException if pattern doesn't exist
   * @throws BusinessException if validation fails
   * @throws ConflictException if update causes duplicate
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdatePayeePatternDto,
  ): Promise<PayeePattern> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('PayeePattern', id);
      }

      // Merge existing with updates for validation
      const merged = {
        isRecurring: dto.isRecurring ?? existing.isRecurring,
        expectedAmountCents:
          dto.expectedAmountCents ?? existing.expectedAmountCents ?? undefined,
      };

      if (
        dto.isRecurring !== undefined ||
        dto.expectedAmountCents !== undefined
      ) {
        this.validateRecurringPattern(merged as CreatePayeePatternDto);
      }

      const updateData: Prisma.PayeePatternUpdateInput = {};

      if (dto.payeePattern !== undefined) {
        updateData.payeePattern = dto.payeePattern;
      }
      if (dto.payeeAliases !== undefined) {
        updateData.payeeAliases = dto.payeeAliases;
      }
      if (dto.defaultAccountCode !== undefined) {
        updateData.defaultAccountCode = dto.defaultAccountCode;
      }
      if (dto.defaultAccountName !== undefined) {
        updateData.defaultAccountName = dto.defaultAccountName;
      }
      if (dto.confidenceBoost !== undefined) {
        updateData.confidenceBoost = dto.confidenceBoost;
      }
      if (dto.isRecurring !== undefined) {
        updateData.isRecurring = dto.isRecurring;
      }
      if (dto.expectedAmountCents !== undefined) {
        updateData.expectedAmountCents = dto.expectedAmountCents;
      }
      if (dto.amountVariancePercent !== undefined) {
        updateData.amountVariancePercent = dto.amountVariancePercent;
      }

      return await this.prisma.payeePattern.update({
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
        `Failed to update payee pattern ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Payee pattern '${dto.payeePattern}' already exists for this tenant`,
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update payee pattern',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a payee pattern
   * @throws NotFoundException if pattern doesn't exist
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('PayeePattern', id);
      }

      await this.prisma.payeePattern.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete payee pattern: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete payee pattern',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate recurring pattern rules
   * @throws BusinessException if isRecurring=true but expectedAmountCents is missing
   */
  private validateRecurringPattern(dto: CreatePayeePatternDto): void {
    if (dto.isRecurring && dto.expectedAmountCents === undefined) {
      throw new BusinessException(
        'Recurring patterns require expectedAmountCents',
        'EXPECTED_AMOUNT_REQUIRED',
      );
    }
  }
}
