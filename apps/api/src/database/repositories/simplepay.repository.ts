/**
 * SimplePay Repository
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SimplePaySyncStatus, Prisma } from '@prisma/client';
import type {
  ISimplePayConnection,
  ISimplePayEmployeeMapping,
  ISimplePayPayslipImport,
} from '../entities/simplepay.entity';

@Injectable()
export class SimplePayRepository {
  private readonly logger = new Logger(SimplePayRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // Connection methods
  async findConnection(tenantId: string): Promise<ISimplePayConnection | null> {
    return this.prisma.simplePayConnection.findUnique({
      where: { tenantId },
    });
  }

  async upsertConnection(
    tenantId: string,
    data: {
      clientId: string;
      apiKey: string;
      isActive?: boolean;
    },
  ): Promise<ISimplePayConnection> {
    return this.prisma.simplePayConnection.upsert({
      where: { tenantId },
      create: {
        tenantId,
        clientId: data.clientId,
        apiKey: data.apiKey,
        isActive: data.isActive ?? true,
      },
      update: {
        clientId: data.clientId,
        apiKey: data.apiKey,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateConnectionStatus(
    tenantId: string,
    data: {
      lastSyncAt?: Date;
      syncErrorMessage?: string | null;
      isActive?: boolean;
    },
  ): Promise<ISimplePayConnection> {
    return this.prisma.simplePayConnection.update({
      where: { tenantId },
      data,
    });
  }

  async deleteConnection(tenantId: string): Promise<void> {
    await this.prisma.simplePayConnection.delete({
      where: { tenantId },
    });
  }

  // Employee mapping methods
  async findEmployeeMapping(
    staffId: string,
  ): Promise<ISimplePayEmployeeMapping | null> {
    return this.prisma.simplePayEmployeeMapping.findUnique({
      where: { staffId },
    });
  }

  async findEmployeeMappingBySimplePayId(
    tenantId: string,
    simplePayEmployeeId: string,
  ): Promise<ISimplePayEmployeeMapping | null> {
    return this.prisma.simplePayEmployeeMapping.findFirst({
      where: { tenantId, simplePayEmployeeId },
    });
  }

  /**
   * Find employee mapping by SimplePay employee ID (without tenant)
   * TASK-SPAY-009: Used by webhook handler to resolve staff from SimplePay ID
   */
  async findEmployeeMappingBySimplePayIdOnly(
    simplePayEmployeeId: string,
  ): Promise<ISimplePayEmployeeMapping | null> {
    return this.prisma.simplePayEmployeeMapping.findFirst({
      where: { simplePayEmployeeId },
    });
  }

  /**
   * Update employee mapping sync status
   * TASK-SPAY-009: Used by webhook handler to mark employees as out of sync
   */
  async updateEmployeeMappingSyncStatus(
    staffId: string,
    status: 'NOT_SYNCED' | 'SYNCED' | 'SYNC_FAILED' | 'OUT_OF_SYNC',
    errorMessage: string | null,
  ): Promise<ISimplePayEmployeeMapping> {
    return this.prisma.simplePayEmployeeMapping.update({
      where: { staffId },
      data: {
        syncStatus: status,
        lastSyncAt: new Date(),
        lastSyncError: errorMessage,
      },
    });
  }

  async findAllEmployeeMappings(
    tenantId: string,
    options?: {
      syncStatus?: SimplePaySyncStatus;
      skip?: number;
      take?: number;
    },
  ): Promise<{ data: ISimplePayEmployeeMapping[]; total: number }> {
    const where = {
      tenantId,
      ...(options?.syncStatus && { syncStatus: options.syncStatus }),
    };

    const [data, total] = await Promise.all([
      this.prisma.simplePayEmployeeMapping.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.simplePayEmployeeMapping.count({ where }),
    ]);

    return { data, total };
  }

  async upsertEmployeeMapping(
    tenantId: string,
    staffId: string,
    data: {
      simplePayEmployeeId: string;
      syncStatus?: SimplePaySyncStatus;
      lastSyncAt?: Date;
      lastSyncError?: string | null;
    },
  ): Promise<ISimplePayEmployeeMapping> {
    return this.prisma.simplePayEmployeeMapping.upsert({
      where: { staffId },
      create: {
        tenantId,
        staffId,
        simplePayEmployeeId: data.simplePayEmployeeId,
        syncStatus: data.syncStatus ?? SimplePaySyncStatus.SYNCED,
        lastSyncAt: data.lastSyncAt ?? new Date(),
        lastSyncError: data.lastSyncError,
      },
      update: {
        simplePayEmployeeId: data.simplePayEmployeeId,
        syncStatus: data.syncStatus,
        lastSyncAt: data.lastSyncAt ?? new Date(),
        lastSyncError: data.lastSyncError,
      },
    });
  }

  async updateEmployeeMappingStatus(
    staffId: string,
    data: {
      syncStatus: SimplePaySyncStatus;
      lastSyncAt?: Date;
      lastSyncError?: string | null;
    },
  ): Promise<ISimplePayEmployeeMapping> {
    return this.prisma.simplePayEmployeeMapping.update({
      where: { staffId },
      data: {
        syncStatus: data.syncStatus,
        lastSyncAt: data.lastSyncAt ?? new Date(),
        lastSyncError: data.lastSyncError,
      },
    });
  }

  async deleteEmployeeMapping(staffId: string): Promise<void> {
    await this.prisma.simplePayEmployeeMapping.delete({
      where: { staffId },
    });
  }

  async countEmployeeMappingsByStatus(
    tenantId: string,
  ): Promise<Record<SimplePaySyncStatus, number>> {
    const counts = await this.prisma.simplePayEmployeeMapping.groupBy({
      by: ['syncStatus'],
      where: { tenantId },
      _count: true,
    });

    const result = {
      NOT_SYNCED: 0,
      SYNCED: 0,
      SYNC_FAILED: 0,
      OUT_OF_SYNC: 0,
    } as Record<SimplePaySyncStatus, number>;

    for (const item of counts) {
      result[item.syncStatus] = item._count;
    }

    return result;
  }

  // Payslip import methods
  async findPayslipImport(id: string): Promise<ISimplePayPayslipImport | null> {
    return this.prisma.simplePayPayslipImport.findUnique({
      where: { id },
    });
  }

  async findPayslipImportBySimplePayId(
    tenantId: string,
    staffId: string,
    simplePayPayslipId: string,
  ): Promise<ISimplePayPayslipImport | null> {
    return this.prisma.simplePayPayslipImport.findUnique({
      where: {
        tenantId_staffId_simplePayPayslipId: {
          tenantId,
          staffId,
          simplePayPayslipId,
        },
      },
    });
  }

  async findPayslipImportsByStaff(
    tenantId: string,
    staffId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
      skip?: number;
      take?: number;
    },
  ): Promise<{ data: ISimplePayPayslipImport[]; total: number }> {
    const where = {
      tenantId,
      staffId,
      ...(options?.fromDate && {
        payPeriodStart: { gte: options.fromDate },
      }),
      ...(options?.toDate && {
        payPeriodEnd: { lte: options.toDate },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.simplePayPayslipImport.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        orderBy: { payPeriodStart: 'desc' },
      }),
      this.prisma.simplePayPayslipImport.count({ where }),
    ]);

    return { data, total };
  }

  async findPayslipImportsByPeriod(
    tenantId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date,
  ): Promise<ISimplePayPayslipImport[]> {
    return this.prisma.simplePayPayslipImport.findMany({
      where: {
        tenantId,
        payPeriodStart: { gte: payPeriodStart },
        payPeriodEnd: { lte: payPeriodEnd },
      },
      orderBy: { staffId: 'asc' },
    });
  }

  async createPayslipImport(
    data: Omit<ISimplePayPayslipImport, 'id' | 'importedAt'> & {
      payslipData: Prisma.InputJsonValue;
    },
  ): Promise<ISimplePayPayslipImport> {
    return this.prisma.simplePayPayslipImport.create({
      data: {
        tenantId: data.tenantId,
        staffId: data.staffId,
        simplePayPayslipId: data.simplePayPayslipId,
        payPeriodStart: data.payPeriodStart,
        payPeriodEnd: data.payPeriodEnd,
        grossSalaryCents: data.grossSalaryCents,
        netSalaryCents: data.netSalaryCents,
        payeCents: data.payeCents,
        uifEmployeeCents: data.uifEmployeeCents,
        uifEmployerCents: data.uifEmployerCents,
        payslipData: data.payslipData,
      },
    });
  }

  async upsertPayslipImport(
    data: Omit<ISimplePayPayslipImport, 'id' | 'importedAt' | 'payslipData'> & {
      payslipData: Prisma.InputJsonValue;
    },
  ): Promise<ISimplePayPayslipImport> {
    return this.prisma.simplePayPayslipImport.upsert({
      where: {
        tenantId_staffId_simplePayPayslipId: {
          tenantId: data.tenantId,
          staffId: data.staffId,
          simplePayPayslipId: data.simplePayPayslipId,
        },
      },
      create: {
        tenantId: data.tenantId,
        staffId: data.staffId,
        simplePayPayslipId: data.simplePayPayslipId,
        payPeriodStart: data.payPeriodStart,
        payPeriodEnd: data.payPeriodEnd,
        grossSalaryCents: data.grossSalaryCents,
        netSalaryCents: data.netSalaryCents,
        payeCents: data.payeCents,
        uifEmployeeCents: data.uifEmployeeCents,
        uifEmployerCents: data.uifEmployerCents,
        payslipData: data.payslipData,
      },
      update: {
        payPeriodStart: data.payPeriodStart,
        payPeriodEnd: data.payPeriodEnd,
        grossSalaryCents: data.grossSalaryCents,
        netSalaryCents: data.netSalaryCents,
        payeCents: data.payeCents,
        uifEmployeeCents: data.uifEmployeeCents,
        uifEmployerCents: data.uifEmployerCents,
        payslipData: data.payslipData,
      },
    });
  }
}
