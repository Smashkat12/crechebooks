/**
 * Categorization Journal Repository
 * TASK-XERO-007: Journal Entry Approach for Categorization Sync
 *
 * Provides data access for CategorizationJournal records that track
 * manual journals created when original bank transactions are reconciled
 * and cannot be edited in Xero.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  CategorizationJournal,
  CategorizationJournalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';
import {
  CreateCategorizationJournalInput,
  CategorizationJournalWithTransaction,
} from '../entities/categorization-journal.entity';

@Injectable()
export class CategorizationJournalRepository {
  private readonly logger = new Logger(CategorizationJournalRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new categorization journal record
   */
  async create(
    input: CreateCategorizationJournalInput,
  ): Promise<CategorizationJournal> {
    try {
      return await this.prisma.categorizationJournal.create({
        data: {
          tenantId: input.tenantId,
          transactionId: input.transactionId,
          fromAccountCode: input.fromAccountCode,
          toAccountCode: input.toAccountCode,
          amountCents: input.amountCents,
          isCredit: input.isCredit,
          narration: input.narration,
          status: CategorizationJournalStatus.PENDING,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create categorization journal for transaction ${input.transactionId}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint violation - journal already exists
          throw new DatabaseException(
            'create',
            `Categorization journal already exists for transaction ${input.transactionId}`,
            error,
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Transaction', input.transactionId);
        }
      }

      throw new DatabaseException(
        'create',
        'Failed to create categorization journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find journal by ID with tenant isolation
   * @param id - Journal ID
   * @param tenantId - Tenant ID for isolation
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<CategorizationJournal | null> {
    return this.prisma.categorizationJournal.findFirst({
      where: { id, tenantId },
    });
  }

  /**
   * Find journal by transaction ID
   */
  async findByTransactionId(
    transactionId: string,
  ): Promise<CategorizationJournal | null> {
    return this.prisma.categorizationJournal.findUnique({
      where: { transactionId },
    });
  }

  /**
   * Find journal by ID with transaction relation and tenant isolation
   * @param id - Journal ID
   * @param tenantId - Tenant ID for isolation
   */
  async findByIdWithTransaction(
    id: string,
    tenantId: string,
  ): Promise<CategorizationJournalWithTransaction | null> {
    const result = await this.prisma.categorizationJournal.findFirst({
      where: { id, tenantId },
      include: {
        transaction: {
          select: {
            id: true,
            description: true,
            date: true,
            amountCents: true,
            isCredit: true,
            payeeName: true,
          },
        },
      },
    });

    return result as CategorizationJournalWithTransaction | null;
  }

  /**
   * Find all pending journals for a tenant
   */
  async findPendingByTenant(
    tenantId: string,
  ): Promise<CategorizationJournal[]> {
    return this.prisma.categorizationJournal.findMany({
      where: {
        tenantId,
        status: CategorizationJournalStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find failed journals for retry
   */
  async findFailedByTenant(
    tenantId: string,
    maxRetries = 3,
  ): Promise<CategorizationJournal[]> {
    return this.prisma.categorizationJournal.findMany({
      where: {
        tenantId,
        status: CategorizationJournalStatus.FAILED,
        retryCount: { lt: maxRetries },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find journals by tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    options?: {
      status?: CategorizationJournalStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    journals: CategorizationJournalWithTransaction[];
    total: number;
  }> {
    const where: Prisma.CategorizationJournalWhereInput = {
      tenantId,
      ...(options?.status && { status: options.status }),
    };

    const [journals, total] = await Promise.all([
      this.prisma.categorizationJournal.findMany({
        where,
        include: {
          transaction: {
            select: {
              id: true,
              description: true,
              date: true,
              amountCents: true,
              isCredit: true,
              payeeName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit,
        skip: options?.offset,
      }),
      this.prisma.categorizationJournal.count({ where }),
    ]);

    return {
      journals: journals as CategorizationJournalWithTransaction[],
      total,
    };
  }

  /**
   * Mark journal as posted to Xero
   */
  async markAsPosted(
    id: string,
    xeroJournalId: string,
    journalNumber: string,
  ): Promise<void> {
    try {
      await this.prisma.categorizationJournal.update({
        where: { id },
        data: {
          status: CategorizationJournalStatus.POSTED,
          xeroJournalId,
          journalNumber,
          postedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('CategorizationJournal', id);
        }
      }
      throw new DatabaseException(
        'markAsPosted',
        `Failed to mark journal ${id} as posted`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark journal as failed
   */
  async markAsFailed(id: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.categorizationJournal.update({
        where: { id },
        data: {
          status: CategorizationJournalStatus.FAILED,
          errorMessage,
          retryCount: { increment: 1 },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('CategorizationJournal', id);
        }
      }
      throw new DatabaseException(
        'markAsFailed',
        `Failed to mark journal ${id} as failed`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Reset a failed journal for retry
   */
  async resetForRetry(id: string): Promise<void> {
    try {
      await this.prisma.categorizationJournal.update({
        where: { id },
        data: {
          status: CategorizationJournalStatus.PENDING,
          errorMessage: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('CategorizationJournal', id);
        }
      }
      throw new DatabaseException(
        'resetForRetry',
        `Failed to reset journal ${id}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get journal statistics for a tenant
   */
  async getStats(tenantId: string): Promise<{
    pending: number;
    posted: number;
    failed: number;
    totalAmountCents: number;
  }> {
    const [pending, posted, failed, totalAmount] = await Promise.all([
      this.prisma.categorizationJournal.count({
        where: { tenantId, status: CategorizationJournalStatus.PENDING },
      }),
      this.prisma.categorizationJournal.count({
        where: { tenantId, status: CategorizationJournalStatus.POSTED },
      }),
      this.prisma.categorizationJournal.count({
        where: { tenantId, status: CategorizationJournalStatus.FAILED },
      }),
      this.prisma.categorizationJournal.aggregate({
        where: { tenantId },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      pending,
      posted,
      failed,
      totalAmountCents: totalAmount._sum.amountCents ?? 0,
    };
  }

  /**
   * Delete a journal (only if not posted) with tenant isolation
   * Uses atomic deleteMany with tenant filter for cross-tenant protection
   * @param id - Journal ID
   * @param tenantId - Tenant ID for isolation
   * @throws NotFoundException if journal not found or tenant mismatch (same error to prevent enumeration)
   * @throws DatabaseException if journal is posted and cannot be deleted
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      // First check if journal exists and is not posted - with tenant isolation
      const journal = await this.prisma.categorizationJournal.findFirst({
        where: { id, tenantId },
        select: { status: true },
      });

      if (!journal) {
        throw new NotFoundException('CategorizationJournal', id);
      }

      if (journal.status === CategorizationJournalStatus.POSTED) {
        throw new DatabaseException('delete', 'Cannot delete a posted journal');
      }

      // Use deleteMany with tenant filter for atomic operation
      const result = await this.prisma.categorizationJournal.deleteMany({
        where: {
          id,
          tenantId,
        },
      });

      if (result.count === 0) {
        throw new NotFoundException('CategorizationJournal', id);
      }
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof DatabaseException
      ) {
        throw error;
      }
      throw new DatabaseException(
        'delete',
        `Failed to delete journal ${id}`,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
