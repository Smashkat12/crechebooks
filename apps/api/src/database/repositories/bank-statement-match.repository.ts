/**
 * Bank Statement Match Repository
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 */

import { Injectable, Logger } from '@nestjs/common';
import { BankStatementMatch, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BankStatementMatchStatus,
  CreateBankStatementMatchDto,
} from '../entities/bank-statement-match.entity';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class BankStatementMatchRepository {
  private readonly logger = new Logger(BankStatementMatchRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new bank statement match record
   * @throws NotFoundException if tenant or reconciliation doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateBankStatementMatchDto): Promise<BankStatementMatch> {
    try {
      return await this.prisma.bankStatementMatch.create({
        data: {
          tenantId: dto.tenantId,
          reconciliationId: dto.reconciliationId,
          bankDate: dto.bankDate,
          bankDescription: dto.bankDescription,
          bankAmountCents: dto.bankAmountCents,
          bankIsCredit: dto.bankIsCredit,
          transactionId: dto.transactionId,
          xeroDate: dto.xeroDate,
          xeroDescription: dto.xeroDescription,
          xeroAmountCents: dto.xeroAmountCents,
          xeroIsCredit: dto.xeroIsCredit,
          status: dto.status,
          matchConfidence: dto.matchConfidence,
          discrepancyReason: dto.discrepancyReason,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create bank statement match: ${JSON.stringify({
          reconciliationId: dto.reconciliationId,
          status: dto.status,
        })}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          if (error.message.includes('tenant_id')) {
            throw new NotFoundException('Tenant', dto.tenantId);
          }
          if (error.message.includes('reconciliation_id')) {
            throw new NotFoundException('Reconciliation', dto.reconciliationId);
          }
          if (error.message.includes('transaction_id') && dto.transactionId) {
            throw new NotFoundException('Transaction', dto.transactionId);
          }
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create bank statement match',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find bank statement match by ID
   * @returns BankStatementMatch or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<BankStatementMatch | null> {
    try {
      return await this.prisma.bankStatementMatch.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find bank statement match by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find bank statement match',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all matches for a reconciliation
   * @returns Array of BankStatementMatch ordered by bank_date
   * @throws DatabaseException for database errors
   */
  async findByReconciliationId(
    tenantId: string,
    reconciliationId: string,
  ): Promise<BankStatementMatch[]> {
    try {
      return await this.prisma.bankStatementMatch.findMany({
        where: {
          tenantId,
          reconciliationId,
        },
        orderBy: { bankDate: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find bank statement matches for reconciliation: ${reconciliationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByReconciliationId',
        'Failed to find bank statement matches',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all matches by status for a tenant
   * @returns Array of BankStatementMatch
   * @throws DatabaseException for database errors
   */
  async findByStatus(
    tenantId: string,
    status: BankStatementMatchStatus,
  ): Promise<BankStatementMatch[]> {
    try {
      return await this.prisma.bankStatementMatch.findMany({
        where: {
          tenantId,
          status,
        },
        orderBy: { bankDate: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find bank statement matches by status: ${status}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByStatus',
        'Failed to find bank statement matches by status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find match by transaction ID
   * @returns BankStatementMatch or null if not found
   * @throws DatabaseException for database errors
   */
  async findByTransactionId(
    transactionId: string,
  ): Promise<BankStatementMatch | null> {
    try {
      return await this.prisma.bankStatementMatch.findFirst({
        where: { transactionId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find bank statement match by transaction: ${transactionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTransactionId',
        'Failed to find bank statement match by transaction',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all matches for a reconciliation
   * Used when re-reconciling a period
   * @throws DatabaseException for database errors
   */
  async deleteByReconciliationId(reconciliationId: string): Promise<void> {
    try {
      await this.prisma.bankStatementMatch.deleteMany({
        where: { reconciliationId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete bank statement matches for reconciliation: ${reconciliationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteByReconciliationId',
        'Failed to delete bank statement matches',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count matches by status for a reconciliation
   * @returns Record with counts per status
   * @throws DatabaseException for database errors
   */
  async countByStatus(
    tenantId: string,
    reconciliationId: string,
  ): Promise<Record<BankStatementMatchStatus, number>> {
    try {
      const counts = await this.prisma.bankStatementMatch.groupBy({
        by: ['status'],
        where: {
          tenantId,
          reconciliationId,
        },
        _count: {
          status: true,
        },
      });

      // Initialize all statuses to 0
      const result: Record<BankStatementMatchStatus, number> = {
        [BankStatementMatchStatus.MATCHED]: 0,
        [BankStatementMatchStatus.IN_BANK_ONLY]: 0,
        [BankStatementMatchStatus.IN_XERO_ONLY]: 0,
        [BankStatementMatchStatus.AMOUNT_MISMATCH]: 0,
        [BankStatementMatchStatus.DATE_MISMATCH]: 0,
      };

      // Populate with actual counts
      for (const item of counts) {
        const status = item.status as BankStatementMatchStatus;
        result[status] = item._count.status;
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to count bank statement matches by status for reconciliation: ${reconciliationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countByStatus',
        'Failed to count bank statement matches',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find unmatched records (IN_BANK_ONLY or IN_XERO_ONLY) for a reconciliation
   * @returns Array of unmatched BankStatementMatch records
   * @throws DatabaseException for database errors
   */
  async findUnmatched(
    tenantId: string,
    reconciliationId: string,
  ): Promise<BankStatementMatch[]> {
    try {
      return await this.prisma.bankStatementMatch.findMany({
        where: {
          tenantId,
          reconciliationId,
          status: {
            in: [
              BankStatementMatchStatus.IN_BANK_ONLY,
              BankStatementMatchStatus.IN_XERO_ONLY,
            ],
          },
        },
        orderBy: { bankDate: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find unmatched bank statement records for reconciliation: ${reconciliationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findUnmatched',
        'Failed to find unmatched bank statement records',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a bank statement match record
   * @throws NotFoundException if match doesn't exist
   * @throws DatabaseException for database errors
   */
  async update(
    id: string,
    data: {
      transactionId?: string | null;
      xeroDate?: Date | null;
      xeroDescription?: string | null;
      xeroAmountCents?: number | null;
      xeroIsCredit?: boolean | null;
      status?: BankStatementMatchStatus;
      matchConfidence?: number | null;
      discrepancyReason?: string | null;
    },
  ): Promise<BankStatementMatch> {
    try {
      return await this.prisma.bankStatementMatch.update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update bank statement match: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('BankStatementMatch', id);
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update bank statement match',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
