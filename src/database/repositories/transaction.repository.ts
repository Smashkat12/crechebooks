import { Injectable, Logger } from '@nestjs/common';
import { Transaction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionFilterDto,
} from '../dto/transaction.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class TransactionRepository {
  private readonly logger = new Logger(TransactionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new transaction
   * @throws ConflictException if xeroTransactionId already exists
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateTransactionDto): Promise<Transaction> {
    try {
      return await this.prisma.transaction.create({
        data: dto,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create transaction: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Transaction with this xeroTransactionId already exists',
            { xeroTransactionId: dto.xeroTransactionId },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find transaction by ID with tenant isolation
   * @returns Transaction or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(tenantId: string, id: string): Promise<Transaction | null> {
    try {
      return await this.prisma.transaction.findFirst({
        where: {
          id,
          tenantId,
          isDeleted: false,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find transaction by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find transactions by tenant with filters and pagination
   * @returns Paginated result with transactions
   * @throws DatabaseException for database errors
   */
  async findByTenant(
    tenantId: string,
    filter: TransactionFilterDto,
  ): Promise<PaginatedResult<Transaction>> {
    try {
      const page = filter.page ?? 1;
      const limit = filter.limit ?? 20;
      const skip = (page - 1) * limit;

      const where: Prisma.TransactionWhereInput = {
        tenantId,
        isDeleted: false,
      };

      if (filter.status) {
        where.status = filter.status;
      }

      if (filter.dateFrom || filter.dateTo) {
        where.date = {};
        if (filter.dateFrom) {
          where.date.gte = filter.dateFrom;
        }
        if (filter.dateTo) {
          where.date.lte = filter.dateTo;
        }
      }

      if (filter.isReconciled !== undefined) {
        where.isReconciled = filter.isReconciled;
      }

      if (filter.search) {
        where.OR = [
          { description: { contains: filter.search, mode: 'insensitive' } },
          { payeeName: { contains: filter.search, mode: 'insensitive' } },
          { reference: { contains: filter.search, mode: 'insensitive' } },
        ];
      }

      const [data, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where,
          orderBy: { date: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({ where }),
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
        `Failed to find transactions for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find transactions',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all pending transactions for a tenant
   * @returns Array of pending transactions
   * @throws DatabaseException for database errors
   */
  async findPending(tenantId: string): Promise<Transaction[]> {
    try {
      return await this.prisma.transaction.findMany({
        where: {
          tenantId,
          status: 'PENDING',
          isDeleted: false,
        },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending transactions for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPending',
        'Failed to find pending transactions',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update transaction with tenant isolation
   * @throws NotFoundException if transaction doesn't exist or belongs to different tenant
   * @throws ConflictException if xeroTransactionId already exists
   * @throws DatabaseException for other database errors
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    try {
      // First verify transaction exists and belongs to tenant
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Transaction', id);
      }

      return await this.prisma.transaction.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update transaction ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Transaction with this xeroTransactionId already exists',
            { xeroTransactionId: dto.xeroTransactionId },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Soft delete transaction (sets isDeleted and deletedAt)
   * @throws NotFoundException if transaction doesn't exist or belongs to different tenant
   * @throws DatabaseException for database errors
   */
  async softDelete(tenantId: string, id: string): Promise<void> {
    try {
      // First verify transaction exists and belongs to tenant
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Transaction', id);
      }

      await this.prisma.transaction.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to soft delete transaction: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'softDelete',
        'Failed to delete transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark transaction as reconciled
   * @throws NotFoundException if transaction doesn't exist or belongs to different tenant
   * @throws DatabaseException for database errors
   */
  async markReconciled(tenantId: string, id: string): Promise<Transaction> {
    try {
      // First verify transaction exists and belongs to tenant
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Transaction', id);
      }

      return await this.prisma.transaction.update({
        where: { id },
        data: {
          isReconciled: true,
          reconciledAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to mark transaction as reconciled: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markReconciled',
        'Failed to mark transaction as reconciled',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
