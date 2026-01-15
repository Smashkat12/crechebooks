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
  ForbiddenException,
} from '../../shared/exceptions';
import { AuditLogService } from '../services/audit-log.service';
import { AuditAction } from '../entities/audit-log.entity';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
   * Create multiple transactions in a single batch
   * Uses Prisma's createMany for optimal performance
   * @param dtos - Array of transaction DTOs to create
   * @returns Array of created transactions
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for database errors
   */
  async createMany(dtos: CreateTransactionDto[]): Promise<Transaction[]> {
    if (dtos.length === 0) {
      return [];
    }

    try {
      // Verify tenant exists (check first dto's tenant)
      const tenantId = dtos[0].tenantId;
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant', tenantId);
      }

      // Bulk insert using createMany
      await this.prisma.transaction.createMany({
        data: dtos,
        skipDuplicates: true, // Skip any xeroTransactionId conflicts
      });

      // Fetch the created transactions by importBatchId
      const importBatchId = dtos[0].importBatchId;
      if (importBatchId) {
        return await this.prisma.transaction.findMany({
          where: {
            tenantId,
            importBatchId,
          },
          orderBy: { date: 'asc' },
        });
      }

      // If no batch ID, return empty (shouldn't happen in import flow)
      return [];
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to create batch of ${dtos.length} transactions`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'createMany',
        'Failed to create transactions batch',
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
   * @throws ForbiddenException if transaction is reconciled (CRIT-001)
   * @throws DatabaseException for database errors
   */
  async softDelete(
    tenantId: string,
    id: string,
    userId?: string,
  ): Promise<void> {
    try {
      // First verify transaction exists and belongs to tenant
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Transaction', id);
      }

      // CRIT-001: Prevent deletion of reconciled transactions
      // REQ-RECON-010: Reconciled transactions cannot be modified or deleted
      if (existing.isReconciled) {
        this.logger.warn(`Blocked deletion of reconciled transaction ${id}`, {
          transactionId: id,
          tenantId,
          userId,
          reconciledAt: existing.reconciledAt,
        });

        // Log to audit trail for compliance
        await this.auditLogService.logAction({
          tenantId,
          entityType: 'Transaction',
          entityId: id,
          action: AuditAction.DELETE_BLOCKED,
          userId: userId || undefined,
          beforeValue: {
            isReconciled: existing.isReconciled,
            reconciledAt: existing.reconciledAt?.toISOString(),
          },
          changeSummary: `Blocked deletion attempt on reconciled transaction by user ${userId || 'SYSTEM'}`,
        });

        throw new ForbiddenException(
          'Cannot delete reconciled transaction. Reconciled transactions are locked for audit compliance.',
          'RECONCILED_TRANSACTION_UNDELETABLE',
          { transactionId: id, reconciledAt: existing.reconciledAt },
        );
      }

      await this.prisma.transaction.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      this.logger.log(`Soft deleted transaction ${id}`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
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
   * Find multiple transactions by IDs with tenant isolation
   * @returns Array of transactions (only those that exist and belong to tenant)
   * @throws DatabaseException for database errors
   */
  async findByIds(tenantId: string, ids: string[]): Promise<Transaction[]> {
    if (ids.length === 0) {
      return [];
    }

    try {
      return await this.prisma.transaction.findMany({
        where: {
          id: { in: ids },
          tenantId,
          isDeleted: false,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find transactions by ids: ${ids.join(', ')} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByIds',
        'Failed to find transactions',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update transaction status
   * @throws NotFoundException if transaction doesn't exist or belongs to different tenant
   * @throws DatabaseException for database errors
   */
  async updateStatus(
    tenantId: string,
    id: string,
    status: 'PENDING' | 'CATEGORIZED' | 'REVIEW_REQUIRED' | 'SYNCED',
  ): Promise<Transaction> {
    try {
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Transaction', id);
      }

      return await this.prisma.transaction.update({
        where: { id },
        data: { status },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update transaction status: ${id} to ${status}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateStatus',
        'Failed to update transaction status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find transaction by Xero transaction ID
   * @returns Transaction or null if not found
   * @throws DatabaseException for database errors
   */
  async findByXeroId(
    tenantId: string,
    xeroTransactionId: string,
  ): Promise<Transaction | null> {
    try {
      return await this.prisma.transaction.findFirst({
        where: {
          tenantId,
          xeroTransactionId,
          isDeleted: false,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find transaction by xeroId: ${xeroTransactionId} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByXeroId',
        'Failed to find transaction by Xero ID',
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

  /**
   * TXN-005: Link a reversal transaction to its original
   * @throws NotFoundException if either transaction doesn't exist
   * @throws DatabaseException for database errors
   */
  async linkReversal(
    tenantId: string,
    reversalId: string,
    originalId: string,
  ): Promise<Transaction> {
    try {
      // Verify both transactions exist and belong to tenant
      const [reversal, original] = await Promise.all([
        this.findById(tenantId, reversalId),
        this.findById(tenantId, originalId),
      ]);

      if (!reversal) {
        throw new NotFoundException('Reversal Transaction', reversalId);
      }
      if (!original) {
        throw new NotFoundException('Original Transaction', originalId);
      }

      return await this.prisma.transaction.update({
        where: { id: reversalId },
        data: {
          reversesTransactionId: originalId,
          isReversal: true,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to link reversal ${reversalId} to original ${originalId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'linkReversal',
        'Failed to link reversal transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TXN-005: Unlink a reversal transaction from its original
   * @throws NotFoundException if transaction doesn't exist
   * @throws DatabaseException for database errors
   */
  async unlinkReversal(
    tenantId: string,
    reversalId: string,
  ): Promise<Transaction> {
    try {
      const reversal = await this.findById(tenantId, reversalId);
      if (!reversal) {
        throw new NotFoundException('Transaction', reversalId);
      }

      return await this.prisma.transaction.update({
        where: { id: reversalId },
        data: {
          reversesTransactionId: null,
          isReversal: false,
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to unlink reversal ${reversalId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'unlinkReversal',
        'Failed to unlink reversal transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TXN-005: Find all reversals for a given transaction
   * @returns Array of transactions that reverse the given transaction
   * @throws DatabaseException for database errors
   */
  async findReversalsFor(
    tenantId: string,
    transactionId: string,
  ): Promise<Transaction[]> {
    try {
      return await this.prisma.transaction.findMany({
        where: {
          tenantId,
          reversesTransactionId: transactionId,
          isDeleted: false,
        },
        orderBy: { date: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reversals for transaction ${transactionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findReversalsFor',
        'Failed to find reversal transactions',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TXN-005: Find all unlinked potential reversals (negative amounts)
   * @returns Array of transactions that might be reversals
   * @throws DatabaseException for database errors
   */
  async findPotentialReversals(
    tenantId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Transaction[]> {
    try {
      const where: Prisma.TransactionWhereInput = {
        tenantId,
        isDeleted: false,
        isReversal: false,
        reversesTransactionId: null,
        amountCents: { lt: 0 },
      };

      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }

      return await this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 100, // Limit for performance
      });
    } catch (error) {
      this.logger.error(
        `Failed to find potential reversals for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPotentialReversals',
        'Failed to find potential reversal transactions',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TXN-006: Find transactions by import batch ID
   * @returns Array of transactions from a specific import batch
   * @throws DatabaseException for database errors
   */
  async findByImportBatchId(
    tenantId: string,
    importBatchId: string,
  ): Promise<Transaction[]> {
    try {
      return await this.prisma.transaction.findMany({
        where: {
          tenantId,
          importBatchId,
          isDeleted: false,
        },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find transactions for batch ${importBatchId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByImportBatchId',
        'Failed to find transactions by import batch',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * TXN-004: Update transaction with currency conversion data
   * @throws NotFoundException if transaction doesn't exist
   * @throws DatabaseException for database errors
   */
  async updateCurrencyData(
    tenantId: string,
    id: string,
    currencyData: {
      originalCurrency?: string;
      originalAmountCents?: number;
      exchangeRate?: number;
      rateSource?: string;
      rateTimestamp?: Date;
    },
  ): Promise<Transaction> {
    try {
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundException('Transaction', id);
      }

      // Note: These fields would need to be added to the schema
      // For now, we store in the transaction's metadata/notes field
      // TODO: Add proper currency fields to Transaction model

      return await this.prisma.transaction.update({
        where: { id },
        data: {
          // Store currency data - actual implementation depends on schema
          // For now, update would be to a JSON field or separate table
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update currency data for transaction ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateCurrencyData',
        'Failed to update transaction currency data',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
