import { Injectable, Logger } from '@nestjs/common';
import { Reconciliation, Prisma, ReconciliationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateReconciliationDto,
  UpdateReconciliationDto,
  CompleteReconciliationDto,
  ReconciliationFilterDto,
} from '../dto/reconciliation.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
  BusinessException,
} from '../../shared/exceptions';

@Injectable()
export class ReconciliationRepository {
  private readonly logger = new Logger(ReconciliationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new reconciliation
   * Automatically calculates discrepancy as closingBalanceCents - calculatedBalanceCents
   * @throws NotFoundException if tenant doesn't exist
   * @throws ConflictException if reconciliation for period already exists
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateReconciliationDto): Promise<Reconciliation> {
    try {
      // Calculate discrepancy: closing - calculated
      const discrepancyCents =
        dto.closingBalanceCents - dto.calculatedBalanceCents;

      return await this.prisma.reconciliation.create({
        data: {
          tenantId: dto.tenantId,
          bankAccount: dto.bankAccount,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          openingBalanceCents: dto.openingBalanceCents,
          closingBalanceCents: dto.closingBalanceCents,
          calculatedBalanceCents: dto.calculatedBalanceCents,
          discrepancyCents,
          notes: dto.notes ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create reconciliation: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Reconciliation already exists for tenant '${dto.tenantId}', bank account '${dto.bankAccount}', period starting '${dto.periodStart.toISOString()}'`,
            {
              tenantId: dto.tenantId,
              bankAccount: dto.bankAccount,
              periodStart: dto.periodStart,
            },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create reconciliation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find reconciliation by ID with tenant isolation
   * @param id - Reconciliation ID
   * @param tenantId - Tenant ID for isolation
   * @returns Reconciliation or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string, tenantId: string): Promise<Reconciliation | null> {
    try {
      return await this.prisma.reconciliation.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reconciliation by id: ${id} for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find reconciliation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find reconciliation by unique key (tenantId, bankAccount, periodStart)
   * @returns Reconciliation or null if not found
   * @throws DatabaseException for database errors
   */
  async findByTenantAndAccount(
    tenantId: string,
    bankAccount: string,
    periodStart: Date,
  ): Promise<Reconciliation | null> {
    try {
      return await this.prisma.reconciliation.findUnique({
        where: {
          tenantId_bankAccount_periodStart: {
            tenantId,
            bankAccount,
            periodStart,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reconciliation for tenant: ${tenantId}, account: ${bankAccount}, period: ${periodStart.toISOString()}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantAndAccount',
        'Failed to find reconciliation by account and period',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all reconciliations for a tenant with optional filters
   * @returns Array of reconciliations
   * @throws DatabaseException for database errors
   */
  async findByTenantId(
    tenantId: string,
    filter?: ReconciliationFilterDto,
  ): Promise<Reconciliation[]> {
    try {
      const where: Prisma.ReconciliationWhereInput = { tenantId };

      if (filter?.bankAccount !== undefined) {
        where.bankAccount = filter.bankAccount;
      }
      if (filter?.status !== undefined) {
        where.status = filter.status;
      }
      if (filter?.periodStart !== undefined) {
        where.periodStart = { gte: filter.periodStart };
      }
      if (filter?.periodEnd !== undefined) {
        where.periodEnd = { lte: filter.periodEnd };
      }

      return await this.prisma.reconciliation.findMany({
        where,
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reconciliations for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantId',
        'Failed to find reconciliations',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all reconciliations for a specific bank account
   * @returns Array of reconciliations ordered by periodStart descending
   * @throws DatabaseException for database errors
   */
  async findByBankAccount(
    tenantId: string,
    bankAccount: string,
  ): Promise<Reconciliation[]> {
    try {
      return await this.prisma.reconciliation.findMany({
        where: { tenantId, bankAccount },
        orderBy: { periodStart: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reconciliations for bank account: ${bankAccount}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByBankAccount',
        'Failed to find reconciliations by bank account',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a reconciliation
   * Recalculates discrepancy if balance fields are updated
   * @throws NotFoundException if reconciliation doesn't exist
   * @throws BusinessException if reconciliation is already RECONCILED
   * @throws DatabaseException for other database errors
   */
  async update(
    id: string,
    tenantId: string,
    dto: UpdateReconciliationDto,
  ): Promise<Reconciliation> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Reconciliation', id);
      }

      if (existing.status === ReconciliationStatus.RECONCILED) {
        throw new BusinessException(
          `Cannot update reconciliation '${id}' - reconciliation is already RECONCILED and immutable`,
          'RECONCILIATION_COMPLETED',
          { reconciliationId: id, status: existing.status },
        );
      }

      const updateData: Prisma.ReconciliationUpdateInput = {};

      if (dto.openingBalanceCents !== undefined) {
        updateData.openingBalanceCents = dto.openingBalanceCents;
      }
      if (dto.closingBalanceCents !== undefined) {
        updateData.closingBalanceCents = dto.closingBalanceCents;
      }
      if (dto.calculatedBalanceCents !== undefined) {
        updateData.calculatedBalanceCents = dto.calculatedBalanceCents;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      // Recalculate discrepancy if balance fields are updated
      const closingBalance =
        dto.closingBalanceCents ?? existing.closingBalanceCents;
      const calculatedBalance =
        dto.calculatedBalanceCents ?? existing.calculatedBalanceCents;
      updateData.discrepancyCents = closingBalance - calculatedBalance;

      return await this.prisma.reconciliation.update({
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
        `Failed to update reconciliation ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Reconciliation for this period already exists',
            { periodStart: dto.periodStart },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update reconciliation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Complete a reconciliation (set status to RECONCILED or DISCREPANCY)
   * Sets reconciledBy and reconciledAt when status is RECONCILED
   * @throws NotFoundException if reconciliation doesn't exist
   * @throws NotFoundException if reconciler user doesn't exist
   * @throws BusinessException if reconciliation is not IN_PROGRESS or already RECONCILED
   * @throws DatabaseException for database errors
   */
  async complete(
    id: string,
    tenantId: string,
    dto: CompleteReconciliationDto,
  ): Promise<Reconciliation> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Reconciliation', id);
      }

      if (existing.status === ReconciliationStatus.RECONCILED) {
        throw new BusinessException(
          `Cannot modify reconciliation '${id}' - reconciliation is already RECONCILED`,
          'RECONCILIATION_COMPLETED',
          { reconciliationId: id, status: existing.status },
        );
      }

      if (existing.status !== ReconciliationStatus.IN_PROGRESS) {
        throw new BusinessException(
          `Cannot complete reconciliation '${id}' - current status is '${existing.status}', expected 'IN_PROGRESS'`,
          'INVALID_STATUS',
          { reconciliationId: id, currentStatus: existing.status },
        );
      }

      const updateData: Prisma.ReconciliationUpdateInput = {
        status: dto.status,
      };

      // Only set reconciledBy and reconciledAt for RECONCILED status
      // Cast to string to avoid enum type mismatch between DTO and Prisma enums
      if ((dto.status as string) === 'RECONCILED') {
        updateData.reconciler = { connect: { id: dto.reconciledBy } };
        updateData.reconciledAt = new Date();
      }

      return await this.prisma.reconciliation.update({
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
        `Failed to complete reconciliation: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          if (error.message.includes('reconciled_by')) {
            throw new NotFoundException('User', dto.reconciledBy);
          }
        }
      }
      throw new DatabaseException(
        'complete',
        'Failed to complete reconciliation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Recalculate discrepancy based on current balance values
   * Used when transactions are updated after reconciliation started
   * @throws NotFoundException if reconciliation doesn't exist
   * @throws BusinessException if reconciliation is already RECONCILED
   * @throws DatabaseException for database errors
   */
  async calculateDiscrepancy(
    id: string,
    tenantId: string,
  ): Promise<Reconciliation> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Reconciliation', id);
      }

      if (existing.status === ReconciliationStatus.RECONCILED) {
        throw new BusinessException(
          `Cannot recalculate discrepancy for reconciliation '${id}' - reconciliation is already RECONCILED`,
          'RECONCILIATION_COMPLETED',
          { reconciliationId: id, status: existing.status },
        );
      }

      const discrepancyCents =
        existing.closingBalanceCents - existing.calculatedBalanceCents;

      return await this.prisma.reconciliation.update({
        where: { id },
        data: { discrepancyCents },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to calculate discrepancy for reconciliation: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'calculateDiscrepancy',
        'Failed to calculate discrepancy',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find reconciliations with discrepancies
   * @returns Array of reconciliations with non-zero discrepancy
   * @throws DatabaseException for database errors
   */
  async findWithDiscrepancies(tenantId: string): Promise<Reconciliation[]> {
    try {
      return await this.prisma.reconciliation.findMany({
        where: {
          tenantId,
          discrepancyCents: { not: 0 },
          status: { not: ReconciliationStatus.RECONCILED },
        },
        orderBy: { periodStart: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find reconciliations with discrepancies for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findWithDiscrepancies',
        'Failed to find reconciliations with discrepancies',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find reconciliations in progress
   * @returns Array of IN_PROGRESS reconciliations
   * @throws DatabaseException for database errors
   */
  async findInProgress(tenantId: string): Promise<Reconciliation[]> {
    try {
      return await this.prisma.reconciliation.findMany({
        where: {
          tenantId,
          status: ReconciliationStatus.IN_PROGRESS,
        },
        orderBy: { periodStart: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find in-progress reconciliations for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findInProgress',
        'Failed to find in-progress reconciliations',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a reconciliation (hard delete)
   * Can only delete IN_PROGRESS reconciliations
   * @param id - Reconciliation ID
   * @param tenantId - Tenant ID for isolation
   * @throws NotFoundException if reconciliation doesn't exist
   * @throws BusinessException if reconciliation is not IN_PROGRESS
   * @throws DatabaseException for database errors
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findById(id, tenantId);
      if (!existing) {
        throw new NotFoundException('Reconciliation', id);
      }

      if (existing.status !== ReconciliationStatus.IN_PROGRESS) {
        throw new BusinessException(
          `Cannot delete reconciliation '${id}' - only IN_PROGRESS reconciliations can be deleted, current status is '${existing.status}'`,
          'INVALID_STATUS',
          { reconciliationId: id, currentStatus: existing.status },
        );
      }

      await this.prisma.reconciliation.delete({
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
        `Failed to delete reconciliation: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete reconciliation',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
