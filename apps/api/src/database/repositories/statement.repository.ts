import { Injectable, Logger } from '@nestjs/common';
import { Statement, StatementLine, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';

/**
 * DTO for creating a new statement
 */
export interface CreateStatementDto {
  tenantId: string;
  parentId: string;
  statementNumber: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents?: number;
  totalChargesCents?: number;
  totalPaymentsCents?: number;
  totalCreditsCents?: number;
  closingBalanceCents?: number;
  status?: 'DRAFT' | 'FINAL' | 'DELIVERED' | 'CANCELLED';
}

/**
 * DTO for updating an existing statement
 */
export interface UpdateStatementDto {
  status?: 'DRAFT' | 'FINAL' | 'DELIVERED' | 'CANCELLED';
  deliveryStatus?: string;
  deliveredAt?: Date;
  deliveryChannel?: string;
  openingBalanceCents?: number;
  totalChargesCents?: number;
  totalPaymentsCents?: number;
  totalCreditsCents?: number;
  closingBalanceCents?: number;
}

/**
 * DTO for creating a statement line
 */
export interface CreateStatementLineDto {
  statementId: string;
  date: Date;
  description: string;
  lineType:
    | 'OPENING_BALANCE'
    | 'INVOICE'
    | 'PAYMENT'
    | 'CREDIT_NOTE'
    | 'ADJUSTMENT'
    | 'CLOSING_BALANCE';
  referenceNumber?: string;
  referenceId?: string;
  debitCents?: number;
  creditCents?: number;
  balanceCents?: number;
  sortOrder?: number;
}

/**
 * Filter options for querying statements
 */
export interface StatementFilterDto {
  parentId?: string;
  status?: 'DRAFT' | 'FINAL' | 'DELIVERED' | 'CANCELLED';
  periodStart?: Date;
  periodEnd?: Date;
}

@Injectable()
export class StatementRepository {
  private readonly logger = new Logger(StatementRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new statement
   * @throws NotFoundException if tenant or parent doesn't exist
   * @throws ConflictException if statement number already exists for tenant
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateStatementDto): Promise<Statement> {
    try {
      return await this.prisma.statement.create({
        data: {
          tenantId: dto.tenantId,
          parentId: dto.parentId,
          statementNumber: dto.statementNumber,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          openingBalanceCents: dto.openingBalanceCents ?? 0,
          totalChargesCents: dto.totalChargesCents ?? 0,
          totalPaymentsCents: dto.totalPaymentsCents ?? 0,
          totalCreditsCents: dto.totalCreditsCents ?? 0,
          closingBalanceCents: dto.closingBalanceCents ?? 0,
          status: dto.status ?? 'DRAFT',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create statement: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Statement with number '${dto.statementNumber}' already exists for this tenant`,
            { statementNumber: dto.statementNumber, tenantId: dto.tenantId },
          );
        }
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
        'Failed to create statement',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find statement by ID
   * @returns Statement or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string, tenantId: string): Promise<Statement | null> {
    try {
      return await this.prisma.statement.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find statement by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find statement',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find statement by ID with lines included
   * @returns Statement with lines or null if not found
   * @throws DatabaseException for database errors
   */
  async findByIdWithLines(
    id: string,
    tenantId: string,
  ): Promise<(Statement & { lines: StatementLine[] }) | null> {
    try {
      return await this.prisma.statement.findFirst({
        where: { id, tenantId },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find statement with lines by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByIdWithLines',
        'Failed to find statement with lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all statements for a parent
   * @returns Array of statements
   * @throws DatabaseException for database errors
   */
  async findByParentId(
    parentId: string,
    tenantId: string,
  ): Promise<Statement[]> {
    try {
      return await this.prisma.statement.findMany({
        where: {
          tenantId,
          parentId,
        },
        orderBy: [{ periodEnd: 'desc' }, { statementNumber: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find statements for parent: ${parentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByParentId',
        'Failed to find statements for parent',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find statements for a tenant within a period
   * @returns Array of statements
   * @throws DatabaseException for database errors
   */
  async findByPeriod(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Statement[]> {
    try {
      return await this.prisma.statement.findMany({
        where: {
          tenantId,
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
        },
        orderBy: [{ periodEnd: 'desc' }, { statementNumber: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find statements for period: ${periodStart} to ${periodEnd}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByPeriod',
        'Failed to find statements for period',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all statements for a tenant with optional filters
   * @returns Array of statements
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: StatementFilterDto = {},
  ): Promise<Statement[]> {
    try {
      const where: Prisma.StatementWhereInput = { tenantId };

      if (filter.parentId !== undefined) {
        where.parentId = filter.parentId;
      }

      if (filter.status !== undefined) {
        where.status = filter.status;
      }

      if (filter.periodStart !== undefined) {
        where.periodStart = { gte: filter.periodStart };
      }

      if (filter.periodEnd !== undefined) {
        where.periodEnd = { lte: filter.periodEnd };
      }

      return await this.prisma.statement.findMany({
        where,
        orderBy: [{ periodEnd: 'desc' }, { statementNumber: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find statements for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find statements',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an existing statement
   * @throws NotFoundException if statement doesn't exist
   * @throws BusinessException if trying to update a FINAL or DELIVERED statement
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateStatementDto,
  ): Promise<Statement> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Statement', id);
      }

      // Only allow updates to DRAFT statements (except for delivery-related fields)
      const isLocked =
        existing.status === 'FINAL' ||
        existing.status === 'DELIVERED' ||
        existing.status === 'CANCELLED';

      if (isLocked) {
        // Allow only delivery-related updates for finalized statements
        const allowedFields = [
          'deliveryStatus',
          'deliveredAt',
          'deliveryChannel',
          'status',
        ];
        const updateKeys = Object.keys(dto);
        const hasDisallowedFields = updateKeys.some(
          (key) => !allowedFields.includes(key),
        );

        if (hasDisallowedFields) {
          throw new BusinessException(
            `Cannot modify statement with status '${existing.status}'. Only delivery-related fields can be updated.`,
            'STATEMENT_LOCKED',
            { statementId: id, currentStatus: existing.status },
          );
        }
      }

      const updateData: Prisma.StatementUpdateInput = {};

      if (dto.status !== undefined) {
        updateData.status = dto.status;
      }
      if (dto.deliveryStatus !== undefined) {
        updateData.deliveryStatus = dto.deliveryStatus;
      }
      if (dto.deliveredAt !== undefined) {
        updateData.deliveredAt = dto.deliveredAt;
      }
      if (dto.deliveryChannel !== undefined) {
        updateData.deliveryChannel = dto.deliveryChannel;
      }
      if (dto.openingBalanceCents !== undefined) {
        updateData.openingBalanceCents = dto.openingBalanceCents;
      }
      if (dto.totalChargesCents !== undefined) {
        updateData.totalChargesCents = dto.totalChargesCents;
      }
      if (dto.totalPaymentsCents !== undefined) {
        updateData.totalPaymentsCents = dto.totalPaymentsCents;
      }
      if (dto.totalCreditsCents !== undefined) {
        updateData.totalCreditsCents = dto.totalCreditsCents;
      }
      if (dto.closingBalanceCents !== undefined) {
        updateData.closingBalanceCents = dto.closingBalanceCents;
      }

      return await this.prisma.statement.update({
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
        `Failed to update statement ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update statement',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a statement (only if status is DRAFT)
   * @throws NotFoundException if statement doesn't exist
   * @throws BusinessException if statement status is FINAL
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Statement', id);
      }

      if (existing.status === 'FINAL' || existing.status === 'DELIVERED') {
        throw new BusinessException(
          `Cannot delete statement with status '${existing.status}'. Only DRAFT statements can be deleted.`,
          'STATEMENT_DELETE_FORBIDDEN',
          { statementId: id, currentStatus: existing.status },
        );
      }

      await this.prisma.statement.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to delete statement: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete statement',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Generate a unique statement number for a tenant
   * Format: STMT-YYYY-NNNN
   * @returns Generated statement number
   * @throws DatabaseException for database errors
   */
  async generateStatementNumber(tenantId: string): Promise<string> {
    try {
      const year = new Date().getFullYear();
      const prefix = `STMT-${year}-`;

      const lastStatement = await this.prisma.statement.findFirst({
        where: {
          tenantId,
          statementNumber: {
            startsWith: prefix,
          },
        },
        orderBy: { statementNumber: 'desc' },
      });

      let nextNumber = 1;
      if (lastStatement) {
        const lastNumberStr = lastStatement.statementNumber.replace(prefix, '');
        const lastNumber = parseInt(lastNumberStr, 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }

      return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
    } catch (error) {
      this.logger.error(
        `Failed to generate statement number for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'generateStatementNumber',
        'Failed to generate statement number',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create a statement line
   * @throws NotFoundException if statement doesn't exist
   * @throws DatabaseException for database errors
   */
  async createLine(dto: CreateStatementLineDto): Promise<StatementLine> {
    try {
      return await this.prisma.statementLine.create({
        data: {
          statementId: dto.statementId,
          date: dto.date,
          description: dto.description,
          lineType: dto.lineType,
          referenceNumber: dto.referenceNumber ?? null,
          referenceId: dto.referenceId ?? null,
          debitCents: dto.debitCents ?? 0,
          creditCents: dto.creditCents ?? 0,
          balanceCents: dto.balanceCents ?? 0,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create statement line: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Statement', dto.statementId);
        }
      }
      throw new DatabaseException(
        'createLine',
        'Failed to create statement line',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create multiple statement lines in a transaction
   * @throws NotFoundException if statement doesn't exist
   * @throws DatabaseException for database errors
   */
  async createLines(lines: CreateStatementLineDto[]): Promise<StatementLine[]> {
    try {
      const createdLines: StatementLine[] = [];

      await this.prisma.$transaction(async (tx) => {
        for (const dto of lines) {
          const line = await tx.statementLine.create({
            data: {
              statementId: dto.statementId,
              date: dto.date,
              description: dto.description,
              lineType: dto.lineType,
              referenceNumber: dto.referenceNumber ?? null,
              referenceId: dto.referenceId ?? null,
              debitCents: dto.debitCents ?? 0,
              creditCents: dto.creditCents ?? 0,
              balanceCents: dto.balanceCents ?? 0,
              sortOrder: dto.sortOrder ?? 0,
            },
          });
          createdLines.push(line);
        }
      });

      return createdLines;
    } catch (error) {
      this.logger.error(
        `Failed to create statement lines`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException(
            'Statement',
            lines[0]?.statementId ?? 'unknown',
          );
        }
      }
      throw new DatabaseException(
        'createLines',
        'Failed to create statement lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all lines for a statement
   * @throws DatabaseException for database errors
   */
  async deleteLines(statementId: string): Promise<number> {
    try {
      const result = await this.prisma.statementLine.deleteMany({
        where: { statementId },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete statement lines for statement: ${statementId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteLines',
        'Failed to delete statement lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Finalize a statement (set status to FINAL)
   * @throws NotFoundException if statement doesn't exist
   * @throws BusinessException if statement is not in DRAFT status
   * @throws DatabaseException for database errors
   */
  async finalize(id: string, tenantId: string): Promise<Statement> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Statement', id);
      }

      if (existing.status !== 'DRAFT') {
        throw new BusinessException(
          `Cannot finalize statement with status '${existing.status}'. Only DRAFT statements can be finalized.`,
          'STATEMENT_FINALIZE_ERROR',
          { statementId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.statement.update({
        where: { id },
        data: { status: 'FINAL' },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to finalize statement: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'finalize',
        'Failed to finalize statement',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update statement status (convenience method for status transitions)
   * @throws NotFoundException if statement doesn't exist
   * @throws DatabaseException for database errors
   */
  async updateStatus(
    id: string,
    tenantId: string,
    status: 'DRAFT' | 'FINAL' | 'DELIVERED' | 'CANCELLED',
    userId?: string,
  ): Promise<Statement> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Statement', id);
      }

      return await this.prisma.statement.update({
        where: { id },
        data: {
          status,
          deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update statement status: ${id} to ${status}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateStatus',
        'Failed to update statement status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find statement by statement number for a tenant
   * @returns Statement or null if not found
   * @throws DatabaseException for database errors
   */
  async findByStatementNumber(
    tenantId: string,
    statementNumber: string,
  ): Promise<Statement | null> {
    try {
      return await this.prisma.statement.findUnique({
        where: {
          tenantId_statementNumber: {
            tenantId,
            statementNumber,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find statement by number: ${statementNumber} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStatementNumber',
        'Failed to find statement by number',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
