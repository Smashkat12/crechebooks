/**
 * SimplePay Payslip Service
 * Imports payslip data from SimplePay
 *
 * TASK-STAFF-004: SimplePay Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { SimplePayApiClient } from './simplepay-api.client';
import type {
  SimplePayPayslip,
  BulkImportResult,
  ISimplePayPayslipImport,
} from '../../database/entities/simplepay.entity';

@Injectable()
export class SimplePayPayslipService {
  private readonly logger = new Logger(SimplePayPayslipService.name);

  constructor(
    private readonly simplePayRepo: SimplePayRepository,
    private readonly apiClient: SimplePayApiClient,
  ) {}

  /**
   * Import payslips for employee
   */
  async importPayslips(
    tenantId: string,
    staffId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<ISimplePayPayslipImport[]> {
    this.logger.log(`Importing payslips for staff ${staffId}`);

    await this.apiClient.initializeForTenant(tenantId);

    // Get employee mapping
    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    // Build query params
    const params = new URLSearchParams();
    if (fromDate) params.append('from', fromDate.toISOString().split('T')[0]);
    if (toDate) params.append('to', toDate.toISOString().split('T')[0]);

    // Fetch payslips from SimplePay
    const payslips = await this.apiClient.get<SimplePayPayslip[]>(
      `/employees/${mapping.simplePayEmployeeId}/payslips?${params.toString()}`,
    );

    const imported: ISimplePayPayslipImport[] = [];

    for (const payslip of payslips) {
      const importedPayslip = await this.simplePayRepo.upsertPayslipImport({
        tenantId,
        staffId,
        simplePayPayslipId: payslip.id,
        payPeriodStart: new Date(payslip.period_start),
        payPeriodEnd: new Date(payslip.period_end),
        grossSalaryCents: Math.round(payslip.gross * 100),
        netSalaryCents: Math.round(payslip.nett * 100),
        payeCents: Math.round(payslip.paye * 100),
        uifEmployeeCents: Math.round(payslip.uif_employee * 100),
        uifEmployerCents: Math.round(payslip.uif_employer * 100),
        payslipData: payslip as unknown as Prisma.InputJsonValue,
      });
      imported.push(importedPayslip);
    }

    this.logger.log(
      `Imported ${imported.length} payslips for staff ${staffId}`,
    );
    return imported;
  }

  /**
   * Import payslips for all employees
   */
  async importAllPayslips(
    tenantId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date,
    staffIds?: string[],
  ): Promise<BulkImportResult> {
    this.logger.log(`Bulk importing payslips for tenant ${tenantId}`);

    const result: BulkImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    // Get all employee mappings
    const { data: mappings } =
      await this.simplePayRepo.findAllEmployeeMappings(tenantId);

    const targetMappings = staffIds
      ? mappings.filter((m) => staffIds.includes(m.staffId))
      : mappings;

    for (const mapping of targetMappings) {
      try {
        const imported = await this.importPayslips(
          tenantId,
          mapping.staffId,
          payPeriodStart,
          payPeriodEnd,
        );
        result.imported += imported.length;
        if (imported.length === 0) {
          result.skipped++;
        }
      } catch (error) {
        result.errors.push({
          staffId: mapping.staffId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.log(
      `Bulk import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
    );
    return result;
  }

  /**
   * Get payslip PDF from SimplePay
   */
  async getPayslipPdf(
    tenantId: string,
    simplePayPayslipId: string,
  ): Promise<Buffer> {
    await this.apiClient.initializeForTenant(tenantId);
    return this.apiClient.downloadPdf(`/payslips/${simplePayPayslipId}.pdf`);
  }

  /**
   * Get imported payslips for staff member
   */
  async getImportedPayslips(
    tenantId: string,
    staffId: string,
    options?: {
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: ISimplePayPayslipImport[]; total: number }> {
    return this.simplePayRepo.findPayslipImportsByStaff(tenantId, staffId, {
      fromDate: options?.fromDate,
      toDate: options?.toDate,
      skip: options?.page ? (options.page - 1) * (options.limit || 20) : 0,
      take: options?.limit || 20,
    });
  }
}
