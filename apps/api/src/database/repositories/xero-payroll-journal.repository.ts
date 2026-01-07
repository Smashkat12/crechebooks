/**
 * Xero Payroll Journal Repository
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * Provides data access for:
 * - XeroAccountMapping: CRUD operations for account mappings
 * - PayrollJournal: Journal management and status tracking
 * - PayrollJournalLine: Journal line operations
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  XeroAccountMapping,
  PayrollJournal,
  PayrollJournalLine,
  XeroAccountType,
  PayrollJournalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';
import {
  UpsertAccountMappingDto,
  JournalFilterDto,
  JournalStats,
} from '../dto/xero-payroll-journal.dto';

// Type for journal with lines included
export type PayrollJournalWithLines = PayrollJournal & {
  journalLines: PayrollJournalLine[];
};

// Type for journal with full relations
export type PayrollJournalWithRelations = PayrollJournal & {
  journalLines: PayrollJournalLine[];
  payroll: {
    id: string;
    staff: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
};

@Injectable()
export class XeroPayrollJournalRepository {
  private readonly logger = new Logger(XeroPayrollJournalRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // Account Mapping Methods
  // ============================================

  /**
   * Upsert an account mapping
   * Creates if not exists, updates if exists for tenant+accountType
   */
  async upsertAccountMapping(
    tenantId: string,
    dto: UpsertAccountMappingDto,
  ): Promise<XeroAccountMapping> {
    try {
      return await this.prisma.xeroAccountMapping.upsert({
        where: {
          tenantId_accountType: {
            tenantId,
            accountType: dto.accountType,
          },
        },
        update: {
          xeroAccountId: dto.xeroAccountId,
          xeroAccountCode: dto.xeroAccountCode,
          xeroAccountName: dto.xeroAccountName,
          isActive: dto.isActive ?? true,
        },
        create: {
          tenantId,
          accountType: dto.accountType,
          xeroAccountId: dto.xeroAccountId,
          xeroAccountCode: dto.xeroAccountCode,
          xeroAccountName: dto.xeroAccountName,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert account mapping: ${dto.accountType}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', tenantId);
        }
      }
      throw new DatabaseException(
        'upsertAccountMapping',
        'Failed to upsert account mapping',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Bulk upsert account mappings
   */
  async bulkUpsertAccountMappings(
    tenantId: string,
    mappings: UpsertAccountMappingDto[],
  ): Promise<XeroAccountMapping[]> {
    const results: XeroAccountMapping[] = [];

    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      for (const mapping of mappings) {
        const result = await tx.xeroAccountMapping.upsert({
          where: {
            tenantId_accountType: {
              tenantId,
              accountType: mapping.accountType,
            },
          },
          update: {
            xeroAccountId: mapping.xeroAccountId,
            xeroAccountCode: mapping.xeroAccountCode,
            xeroAccountName: mapping.xeroAccountName,
            isActive: mapping.isActive ?? true,
          },
          create: {
            tenantId,
            accountType: mapping.accountType,
            xeroAccountId: mapping.xeroAccountId,
            xeroAccountCode: mapping.xeroAccountCode,
            xeroAccountName: mapping.xeroAccountName,
            isActive: mapping.isActive ?? true,
          },
        });
        results.push(result);
      }
    });

    return results;
  }

  /**
   * Find all active mappings for a tenant
   */
  async findMappingsByTenant(tenantId: string): Promise<XeroAccountMapping[]> {
    try {
      return await this.prisma.xeroAccountMapping.findMany({
        where: { tenantId, isActive: true },
        orderBy: { accountType: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find mappings for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findMappingsByTenant',
        'Failed to find account mappings',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find a specific mapping by tenant and account type
   */
  async findMappingByType(
    tenantId: string,
    accountType: XeroAccountType,
  ): Promise<XeroAccountMapping | null> {
    try {
      return await this.prisma.xeroAccountMapping.findUnique({
        where: {
          tenantId_accountType: { tenantId, accountType },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find mapping by type: ${accountType}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findMappingByType',
        'Failed to find account mapping',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find multiple mappings by account types
   */
  async findMappingsByTypes(
    tenantId: string,
    accountTypes: XeroAccountType[],
  ): Promise<XeroAccountMapping[]> {
    try {
      return await this.prisma.xeroAccountMapping.findMany({
        where: {
          tenantId,
          accountType: { in: accountTypes },
          isActive: true,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find mappings by types`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findMappingsByTypes',
        'Failed to find account mappings',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a specific mapping
   */
  async deleteMapping(
    tenantId: string,
    accountType: XeroAccountType,
  ): Promise<void> {
    try {
      await this.prisma.xeroAccountMapping.delete({
        where: {
          tenantId_accountType: { tenantId, accountType },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('XeroAccountMapping', accountType);
        }
      }
      this.logger.error(
        `Failed to delete mapping: ${accountType}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteMapping',
        'Failed to delete account mapping',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete all mappings for a tenant
   */
  async deleteMappingsByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.prisma.xeroAccountMapping.deleteMany({
        where: { tenantId },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete mappings for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteMappingsByTenant',
        'Failed to delete account mappings',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // Payroll Journal Methods
  // ============================================

  /**
   * Create a new payroll journal with lines
   */
  async createJournal(
    data: Prisma.PayrollJournalCreateInput,
    lines: Omit<Prisma.PayrollJournalLineCreateManyInput, 'journalId'>[],
  ): Promise<PayrollJournalWithLines> {
    try {
      return await this.prisma.payrollJournal.create({
        data: {
          ...data,
          journalLines: {
            createMany: {
              data: lines,
            },
          },
        },
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create journal`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Journal for this payroll already exists',
            { payrollId: data.payroll?.connect?.id },
          );
        }
        if (error.code === 'P2003') {
          const field = error.meta?.field_name as string | undefined;
          if (field?.includes('payroll')) {
            throw new NotFoundException(
              'Payroll',
              data.payroll?.connect?.id || 'unknown',
            );
          }
          throw new NotFoundException(
            'Tenant',
            data.tenant?.connect?.id || 'unknown',
          );
        }
      }
      throw new DatabaseException(
        'createJournal',
        'Failed to create payroll journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find journal by ID with lines
   */
  async findJournalById(id: string): Promise<PayrollJournalWithLines | null> {
    try {
      return await this.prisma.payrollJournal.findUnique({
        where: { id },
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find journal by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findJournalById',
        'Failed to find payroll journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find journal by ID with full relations (including payroll and staff)
   */
  async findJournalByIdWithRelations(
    id: string,
  ): Promise<PayrollJournalWithRelations | null> {
    try {
      return await this.prisma.payrollJournal.findUnique({
        where: { id },
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
          payroll: {
            include: {
              staff: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find journal with relations: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findJournalByIdWithRelations',
        'Failed to find payroll journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find journal by payroll ID
   */
  async findJournalByPayrollId(
    payrollId: string,
  ): Promise<PayrollJournalWithLines | null> {
    try {
      return await this.prisma.payrollJournal.findUnique({
        where: { payrollId },
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find journal by payroll: ${payrollId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findJournalByPayrollId',
        'Failed to find payroll journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find journals for a tenant with optional filters
   */
  async findJournalsByTenant(
    tenantId: string,
    filter?: JournalFilterDto,
  ): Promise<PayrollJournalWithRelations[]> {
    try {
      const where: Prisma.PayrollJournalWhereInput = { tenantId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.periodStart) {
        where.payPeriodStart = { gte: filter.periodStart };
      }
      if (filter?.periodEnd) {
        where.payPeriodEnd = { lte: filter.periodEnd };
      }
      if (filter?.payrollId) {
        where.payrollId = filter.payrollId;
      }

      return await this.prisma.payrollJournal.findMany({
        where,
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
          payroll: {
            include: {
              staff: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: [{ payPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find journals for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findJournalsByTenant',
        'Failed to find payroll journals',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pending journals ready for posting
   */
  async findPendingJournals(
    tenantId: string,
  ): Promise<PayrollJournalWithLines[]> {
    try {
      return await this.prisma.payrollJournal.findMany({
        where: {
          tenantId,
          status: PayrollJournalStatus.PENDING,
        },
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { payPeriodEnd: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending journals for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPendingJournals',
        'Failed to find pending journals',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find failed journals that may need retry
   */
  async findFailedJournals(
    tenantId: string,
    maxRetries: number = 3,
  ): Promise<PayrollJournalWithLines[]> {
    try {
      return await this.prisma.payrollJournal.findMany({
        where: {
          tenantId,
          status: PayrollJournalStatus.FAILED,
          retryCount: { lt: maxRetries },
        },
        include: {
          journalLines: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { updatedAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find failed journals for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findFailedJournals',
        'Failed to find failed journals',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update journal status and related fields
   */
  async updateJournal(
    id: string,
    data: Prisma.PayrollJournalUpdateInput,
  ): Promise<PayrollJournal> {
    try {
      return await this.prisma.payrollJournal.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('PayrollJournal', id);
        }
      }
      this.logger.error(
        `Failed to update journal: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateJournal',
        'Failed to update payroll journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark journal as posted (successfully sent to Xero)
   */
  async markAsPosted(
    id: string,
    xeroJournalId: string,
    journalNumber: string | null,
  ): Promise<PayrollJournal> {
    try {
      const existing = await this.findJournalById(id);
      if (!existing) {
        throw new NotFoundException('PayrollJournal', id);
      }

      if (existing.status === PayrollJournalStatus.POSTED) {
        throw new BusinessException(
          `Journal '${id}' is already posted`,
          'ALREADY_POSTED',
          { journalId: id, xeroJournalId: existing.xeroJournalId },
        );
      }

      if (existing.status === PayrollJournalStatus.CANCELLED) {
        throw new BusinessException(
          `Cannot post cancelled journal '${id}'`,
          'JOURNAL_CANCELLED',
          { journalId: id },
        );
      }

      return await this.prisma.payrollJournal.update({
        where: { id },
        data: {
          status: PayrollJournalStatus.POSTED,
          xeroJournalId,
          journalNumber,
          postedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to mark journal as posted: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markAsPosted',
        'Failed to mark journal as posted',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark journal as failed
   */
  async markAsFailed(
    id: string,
    errorMessage: string,
  ): Promise<PayrollJournal> {
    try {
      const existing = await this.findJournalById(id);
      if (!existing) {
        throw new NotFoundException('PayrollJournal', id);
      }

      return await this.prisma.payrollJournal.update({
        where: { id },
        data: {
          status: PayrollJournalStatus.FAILED,
          errorMessage,
          retryCount: { increment: 1 },
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to mark journal as failed: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markAsFailed',
        'Failed to mark journal as failed',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Reset journal for retry (back to PENDING)
   */
  async resetForRetry(id: string): Promise<PayrollJournal> {
    try {
      const existing = await this.findJournalById(id);
      if (!existing) {
        throw new NotFoundException('PayrollJournal', id);
      }

      if (existing.status !== PayrollJournalStatus.FAILED) {
        throw new BusinessException(
          `Can only retry failed journals, current status: ${existing.status}`,
          'INVALID_STATUS',
          { journalId: id, currentStatus: existing.status },
        );
      }

      return await this.prisma.payrollJournal.update({
        where: { id },
        data: {
          status: PayrollJournalStatus.PENDING,
          errorMessage: null,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to reset journal for retry: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'resetForRetry',
        'Failed to reset journal for retry',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Cancel a journal
   */
  async cancelJournal(id: string, reason: string): Promise<PayrollJournal> {
    try {
      const existing = await this.findJournalById(id);
      if (!existing) {
        throw new NotFoundException('PayrollJournal', id);
      }

      if (existing.status === PayrollJournalStatus.POSTED) {
        throw new BusinessException(
          `Cannot cancel posted journal '${id}'`,
          'ALREADY_POSTED',
          { journalId: id, xeroJournalId: existing.xeroJournalId },
        );
      }

      return await this.prisma.payrollJournal.update({
        where: { id },
        data: {
          status: PayrollJournalStatus.CANCELLED,
          errorMessage: `Cancelled: ${reason}`,
        },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to cancel journal: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'cancelJournal',
        'Failed to cancel journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a journal (only if not posted)
   */
  async deleteJournal(id: string): Promise<void> {
    try {
      const existing = await this.findJournalById(id);
      if (!existing) {
        throw new NotFoundException('PayrollJournal', id);
      }

      if (existing.status === PayrollJournalStatus.POSTED) {
        throw new BusinessException(
          `Cannot delete posted journal '${id}'`,
          'ALREADY_POSTED',
          { journalId: id, xeroJournalId: existing.xeroJournalId },
        );
      }

      await this.prisma.payrollJournal.delete({
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
        `Failed to delete journal: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deleteJournal',
        'Failed to delete journal',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // Journal Line Methods
  // ============================================

  /**
   * Get journal lines for a journal
   */
  async findJournalLines(journalId: string): Promise<PayrollJournalLine[]> {
    try {
      return await this.prisma.payrollJournalLine.findMany({
        where: { journalId },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find journal lines for journal: ${journalId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findJournalLines',
        'Failed to find journal lines',
        error instanceof Error ? error : undefined,
      );
    }
  }

  // ============================================
  // Statistics Methods
  // ============================================

  /**
   * Get journal statistics for a tenant
   */
  async getJournalStats(tenantId: string): Promise<JournalStats> {
    try {
      const [statusCounts, totals] = await Promise.all([
        this.prisma.payrollJournal.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: true,
        }),
        this.prisma.payrollJournal.aggregate({
          where: { tenantId, status: PayrollJournalStatus.POSTED },
          _sum: {
            totalDebitCents: true,
            totalCreditCents: true,
          },
        }),
      ]);

      const stats: JournalStats = {
        total: 0,
        pending: 0,
        posted: 0,
        failed: 0,
        cancelled: 0,
        totalDebitCents: totals._sum.totalDebitCents ?? 0,
        totalCreditCents: totals._sum.totalCreditCents ?? 0,
      };

      for (const row of statusCounts) {
        stats.total += row._count;
        switch (row.status) {
          case PayrollJournalStatus.PENDING:
            stats.pending = row._count;
            break;
          case PayrollJournalStatus.POSTED:
            stats.posted = row._count;
            break;
          case PayrollJournalStatus.FAILED:
            stats.failed = row._count;
            break;
          case PayrollJournalStatus.CANCELLED:
            stats.cancelled = row._count;
            break;
        }
      }

      return stats;
    } catch (error) {
      this.logger.error(
        `Failed to get journal stats for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getJournalStats',
        'Failed to get journal statistics',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check if all required mappings exist for journal creation
   */
  async hasRequiredMappings(
    tenantId: string,
    requiredTypes: XeroAccountType[],
  ): Promise<{ hasAll: boolean; missing: XeroAccountType[] }> {
    try {
      const mappings = await this.prisma.xeroAccountMapping.findMany({
        where: {
          tenantId,
          accountType: { in: requiredTypes },
          isActive: true,
        },
        select: { accountType: true },
      });

      const mappedTypes = new Set(mappings.map((m) => m.accountType));
      const missing = requiredTypes.filter((t) => !mappedTypes.has(t));

      return {
        hasAll: missing.length === 0,
        missing,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check required mappings for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'hasRequiredMappings',
        'Failed to check required mappings',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
