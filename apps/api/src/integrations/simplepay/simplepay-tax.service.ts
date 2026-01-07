/**
 * SimplePay Tax Service
 * Fetches IRP5 and EMP201 data from SimplePay
 *
 * TASK-STAFF-004: SimplePay Integration
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { SimplePayApiClient } from './simplepay-api.client';
import {
  SimplePayIrp5,
  SimplePayEmp201,
  Emp201Comparison,
} from '../../database/entities/simplepay.entity';

@Injectable()
export class SimplePayTaxService {
  private readonly logger = new Logger(SimplePayTaxService.name);

  constructor(
    private readonly simplePayRepo: SimplePayRepository,
    private readonly apiClient: SimplePayApiClient,
  ) {}

  /**
   * Fetch IRP5 certificates for employee
   */
  async fetchIrp5Certificates(
    tenantId: string,
    staffId: string,
    taxYear?: number,
  ): Promise<SimplePayIrp5[]> {
    this.logger.log(`Fetching IRP5 certificates for staff ${staffId}`);

    await this.apiClient.initializeForTenant(tenantId);

    // Get employee mapping
    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    const params = taxYear ? `?year=${taxYear}` : '';
    return this.apiClient.get<SimplePayIrp5[]>(
      `/employees/${mapping.simplePayEmployeeId}/tax_certificates${params}`,
    );
  }

  /**
   * Get IRP5 PDF from SimplePay
   */
  async getIrp5Pdf(
    tenantId: string,
    staffId: string,
    taxYear: number,
  ): Promise<Buffer> {
    this.logger.log(
      `Downloading IRP5 PDF for staff ${staffId}, year ${taxYear}`,
    );

    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    return this.apiClient.downloadPdf(
      `/employees/${mapping.simplePayEmployeeId}/tax_certificates/${taxYear}.pdf`,
    );
  }

  /**
   * Fetch EMP201 data for period
   */
  async fetchEmp201(
    tenantId: string,
    periodDate: Date,
  ): Promise<SimplePayEmp201> {
    this.logger.log(
      `Fetching EMP201 for tenant ${tenantId}, period ${periodDate.toISOString()}`,
    );

    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const dateStr = periodDate.toISOString().split('T')[0];
    return this.apiClient.get<SimplePayEmp201>(
      `/clients/${clientId}/submissions/emp201?date=${dateStr}`,
    );
  }

  /**
   * Compare SimplePay EMP201 with local calculation
   * Requires local payroll data for comparison
   */
  async compareEmp201(
    tenantId: string,
    periodDate: Date,
    localData: { paye: number; uif: number; sdl: number },
  ): Promise<Emp201Comparison> {
    const remote = await this.fetchEmp201(tenantId, periodDate);

    const period = periodDate.toISOString().slice(0, 7); // YYYY-MM format

    return {
      period,
      local: localData,
      remote: {
        paye: remote.total_paye,
        uif: remote.total_uif_employer + remote.total_uif_employee,
        sdl: remote.total_sdl,
      },
      isMatch:
        localData.paye === remote.total_paye &&
        localData.uif ===
          remote.total_uif_employer + remote.total_uif_employee &&
        localData.sdl === remote.total_sdl,
    };
  }
}
