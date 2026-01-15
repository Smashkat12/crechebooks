/**
 * Pay Run Sync Repository
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { PayRunSync, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayRunSyncDto, PayRunFilterDto } from '../dto/payrun.dto';
import {
  PayRunSyncStatus,
  AccountingDataInput,
} from '../entities/payrun-sync.entity';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class PayRunSyncRepository {
  private readonly logger = new Logger(PayRunSyncRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new pay run sync record
   * @throws ConflictException if duplicate simplePayPayRunId for tenant
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreatePayRunSyncDto): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.create({
        data: {
          tenantId: dto.tenantId,
          simplePayPayRunId: dto.simplePayPayRunId,
          waveId: dto.waveId,
          waveName: dto.waveName,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          payDate: dto.payDate,
          status: dto.status,
          employeeCount: dto.employeeCount,
          totalGrossCents: dto.totalGrossCents,
          totalNetCents: dto.totalNetCents,
          totalPayeCents: dto.totalPayeCents,
          totalUifEmployeeCents: dto.totalUifEmployeeCents,
          totalUifEmployerCents: dto.totalUifEmployerCents,
          totalSdlCents: dto.totalSdlCents,
          totalEtiCents: dto.totalEtiCents ?? 0,
          syncStatus: PayRunSyncStatus.PENDING,
          accountingData: dto.accountingData as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create pay run sync: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint violation
          throw new ConflictException(
            `Pay run sync already exists for SimplePay pay run ${dto.simplePayPayRunId}`,
            {
              simplePayPayRunId: dto.simplePayPayRunId,
              tenantId: dto.tenantId,
            },
          );
        }
        if (error.code === 'P2003') {
          // Foreign key constraint failed
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create pay run sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pay run sync by ID with tenant isolation
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   * @returns PayRunSync or null if not found or tenant mismatch
   */
  async findById(id: string, tenantId: string): Promise<PayRunSync | null> {
    try {
      return await this.prisma.payRunSync.findFirst({
        where: { id, tenantId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pay run sync by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find pay run sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pay run sync by ID or throw NotFoundException
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   */
  async findByIdOrThrow(id: string, tenantId: string): Promise<PayRunSync> {
    const payRunSync = await this.findById(id, tenantId);
    if (!payRunSync) {
      throw new NotFoundException('PayRunSync', id);
    }
    return payRunSync;
  }

  /**
   * Find pay run sync by SimplePay pay run ID for a tenant
   */
  async findBySimplePayId(
    tenantId: string,
    simplePayPayRunId: string,
  ): Promise<PayRunSync | null> {
    try {
      return await this.prisma.payRunSync.findUnique({
        where: {
          tenantId_simplePayPayRunId: {
            tenantId,
            simplePayPayRunId,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pay run sync by SimplePay ID: ${simplePayPayRunId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findBySimplePayId',
        'Failed to find pay run sync by SimplePay ID',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all pay run syncs for a tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    filter?: PayRunFilterDto,
  ): Promise<PayRunSync[]> {
    try {
      const where: Prisma.PayRunSyncWhereInput = { tenantId };

      if (filter?.waveId) {
        where.waveId = filter.waveId;
      }
      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.syncStatus) {
        where.syncStatus = filter.syncStatus;
      }
      if (filter?.periodStartFrom || filter?.periodStartTo) {
        where.periodStart = {};
        if (filter.periodStartFrom) {
          where.periodStart.gte = filter.periodStartFrom;
        }
        if (filter.periodStartTo) {
          where.periodStart.lte = filter.periodStartTo;
        }
      }

      const page = filter?.page ?? 1;
      const limit = filter?.limit ?? 20;

      return await this.prisma.payRunSync.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pay run syncs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find pay run syncs for tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pay run syncs within a period for a tenant
   */
  async findByPeriod(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PayRunSync[]> {
    try {
      return await this.prisma.payRunSync.findMany({
        where: {
          tenantId,
          periodStart: { gte: startDate },
          periodEnd: { lte: endDate },
        },
        orderBy: { periodStart: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pay run syncs by period for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByPeriod',
        'Failed to find pay run syncs by period',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find pay run syncs pending Xero sync
   */
  async findPendingXeroSync(tenantId: string): Promise<PayRunSync[]> {
    try {
      return await this.prisma.payRunSync.findMany({
        where: {
          tenantId,
          syncStatus: PayRunSyncStatus.SYNCED,
          xeroJournalId: null,
        },
        orderBy: { periodStart: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending Xero sync for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findPendingXeroSync',
        'Failed to find pending Xero sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(
    id: string,
    syncStatus: PayRunSyncStatus,
  ): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: { syncStatus },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('PayRunSync', id);
        }
      }
      this.logger.error(
        `Failed to update sync status for pay run sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateSyncStatus',
        'Failed to update sync status',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark pay run as posted to Xero
   */
  async markXeroPosted(id: string, xeroJournalId: string): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: {
          syncStatus: PayRunSyncStatus.XERO_POSTED,
          xeroJournalId,
          xeroSyncedAt: new Date(),
          xeroSyncError: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('PayRunSync', id);
        }
      }
      this.logger.error(
        `Failed to mark pay run sync ${id} as Xero posted`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markXeroPosted',
        'Failed to mark pay run as Xero posted',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Mark pay run as failed to post to Xero
   */
  async markXeroFailed(id: string, errorMessage: string): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: {
          syncStatus: PayRunSyncStatus.XERO_FAILED,
          xeroSyncError: errorMessage,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('PayRunSync', id);
        }
      }
      this.logger.error(
        `Failed to mark pay run sync ${id} as Xero failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'markXeroFailed',
        'Failed to mark pay run as Xero failed',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Save accounting data for a pay run sync
   */
  async saveAccountingData(
    id: string,
    accountingData: AccountingDataInput,
  ): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: {
          accountingData: accountingData,
          syncStatus: PayRunSyncStatus.SYNCED,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('PayRunSync', id);
        }
      }
      this.logger.error(
        `Failed to save accounting data for pay run sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'saveAccountingData',
        'Failed to save accounting data',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update pay run sync record with new data from SimplePay
   */
  async update(
    id: string,
    data: Partial<Omit<CreatePayRunSyncDto, 'tenantId' | 'simplePayPayRunId'>>,
  ): Promise<PayRunSync> {
    try {
      const updateData: Prisma.PayRunSyncUpdateInput = {};

      if (data.waveId !== undefined) updateData.waveId = data.waveId;
      if (data.waveName !== undefined) updateData.waveName = data.waveName;
      if (data.periodStart !== undefined)
        updateData.periodStart = data.periodStart;
      if (data.periodEnd !== undefined) updateData.periodEnd = data.periodEnd;
      if (data.payDate !== undefined) updateData.payDate = data.payDate;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.employeeCount !== undefined)
        updateData.employeeCount = data.employeeCount;
      if (data.totalGrossCents !== undefined)
        updateData.totalGrossCents = data.totalGrossCents;
      if (data.totalNetCents !== undefined)
        updateData.totalNetCents = data.totalNetCents;
      if (data.totalPayeCents !== undefined)
        updateData.totalPayeCents = data.totalPayeCents;
      if (data.totalUifEmployeeCents !== undefined)
        updateData.totalUifEmployeeCents = data.totalUifEmployeeCents;
      if (data.totalUifEmployerCents !== undefined)
        updateData.totalUifEmployerCents = data.totalUifEmployerCents;
      if (data.totalSdlCents !== undefined)
        updateData.totalSdlCents = data.totalSdlCents;
      if (data.totalEtiCents !== undefined)
        updateData.totalEtiCents = data.totalEtiCents;
      if (data.accountingData !== undefined)
        updateData.accountingData =
          data.accountingData as Prisma.InputJsonValue;

      return await this.prisma.payRunSync.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('PayRunSync', id);
        }
      }
      this.logger.error(
        `Failed to update pay run sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'update',
        'Failed to update pay run sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a pay run sync record with tenant isolation
   * @param id - Record ID
   * @param tenantId - Tenant ID for isolation
   * @throws NotFoundException if pay run sync doesn't exist or tenant mismatch
   * @throws ConflictException if pay run is already posted to Xero
   */
  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const existing = await this.findByIdOrThrow(id, tenantId);

      if (existing.xeroJournalId) {
        throw new ConflictException(
          'Cannot delete pay run sync that has been posted to Xero',
          { id, xeroJournalId: existing.xeroJournalId },
        );
      }

      await this.prisma.payRunSync.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to delete pay run sync ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'delete',
        'Failed to delete pay run sync',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Count pay run syncs for a tenant with optional filters
   */
  async countByTenant(
    tenantId: string,
    filter?: PayRunFilterDto,
  ): Promise<number> {
    try {
      const where: Prisma.PayRunSyncWhereInput = { tenantId };

      if (filter?.waveId) {
        where.waveId = filter.waveId;
      }
      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.syncStatus) {
        where.syncStatus = filter.syncStatus;
      }
      if (filter?.periodStartFrom || filter?.periodStartTo) {
        where.periodStart = {};
        if (filter.periodStartFrom) {
          where.periodStart.gte = filter.periodStartFrom;
        }
        if (filter.periodStartTo) {
          where.periodStart.lte = filter.periodStartTo;
        }
      }

      return await this.prisma.payRunSync.count({ where });
    } catch (error) {
      this.logger.error(
        `Failed to count pay run syncs for tenant: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'countByTenant',
        'Failed to count pay run syncs',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Upsert pay run sync - create if not exists, update if exists
   */
  async upsert(dto: CreatePayRunSyncDto): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.upsert({
        where: {
          tenantId_simplePayPayRunId: {
            tenantId: dto.tenantId,
            simplePayPayRunId: dto.simplePayPayRunId,
          },
        },
        create: {
          tenantId: dto.tenantId,
          simplePayPayRunId: dto.simplePayPayRunId,
          waveId: dto.waveId,
          waveName: dto.waveName,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          payDate: dto.payDate,
          status: dto.status,
          employeeCount: dto.employeeCount,
          totalGrossCents: dto.totalGrossCents,
          totalNetCents: dto.totalNetCents,
          totalPayeCents: dto.totalPayeCents,
          totalUifEmployeeCents: dto.totalUifEmployeeCents,
          totalUifEmployerCents: dto.totalUifEmployerCents,
          totalSdlCents: dto.totalSdlCents,
          totalEtiCents: dto.totalEtiCents ?? 0,
          syncStatus: PayRunSyncStatus.PENDING,
          accountingData: dto.accountingData as Prisma.InputJsonValue,
        },
        update: {
          waveId: dto.waveId,
          waveName: dto.waveName,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          payDate: dto.payDate,
          status: dto.status,
          employeeCount: dto.employeeCount,
          totalGrossCents: dto.totalGrossCents,
          totalNetCents: dto.totalNetCents,
          totalPayeCents: dto.totalPayeCents,
          totalUifEmployeeCents: dto.totalUifEmployeeCents,
          totalUifEmployerCents: dto.totalUifEmployerCents,
          totalSdlCents: dto.totalSdlCents,
          totalEtiCents: dto.totalEtiCents ?? 0,
          accountingData: dto.accountingData as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert pay run sync: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'upsert',
        'Failed to upsert pay run sync',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
