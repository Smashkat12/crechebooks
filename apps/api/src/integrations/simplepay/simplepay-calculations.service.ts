/**
 * SimplePay Calculations Service
 * TASK-SPAY-003: SimplePay Calculation Items Retrieval with Caching
 *
 * Provides access to SimplePay calculation items with intelligent caching.
 * Fetches earning types, deduction types, and employer contribution types
 * from SimplePay API and caches them locally for performance.
 */

import { Injectable, Logger } from '@nestjs/common';
import { CalculationType } from '@prisma/client';
import { SimplePayApiClient } from './simplepay-api.client';
import { CalculationCacheRepository } from '../../database/repositories/calculation-cache.repository';
import { PayrollAdjustmentRepository } from '../../database/repositories/payroll-adjustment.repository';
import {
  SimplePayCalculationItem,
  CacheStatus,
  CalculationSyncResult,
  SA_PAYROLL_CODES,
  mapSimplePayTypeToCalculationType,
  affectsUifCalculation,
  isTaxableCode,
} from '../../database/entities/calculation.entity';
import { CalculationItemCacheFilterDto } from '../../database/dto/calculations.dto';

// SimplePay API calculation item wrapper
interface CalculationItemWrapper {
  calculation_item?: SimplePayCalculationItem;
  earning_type?: SimplePayCalculationItem;
  deduction_type?: SimplePayCalculationItem;
  employer_contribution?: SimplePayCalculationItem;
}

@Injectable()
export class SimplePayCalculationsService {
  private readonly logger = new Logger(SimplePayCalculationsService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly cacheRepo: CalculationCacheRepository,
    private readonly adjustmentRepo: PayrollAdjustmentRepository,
  ) {}

  /**
   * Get all calculation items for a tenant with optional filters
   * Uses cache if valid, otherwise fetches from SimplePay
   */
  async getCalculationItems(
    tenantId: string,
    filter?: CalculationItemCacheFilterDto,
    forceRefresh = false,
  ): Promise<ReturnType<typeof this.cacheRepo.findByTenantId>> {
    // Check cache status
    const cacheStatus = await this.getCacheStatus(tenantId);

    // Refresh cache if needed
    if (forceRefresh || cacheStatus.needsRefresh) {
      await this.syncCalculationItems(tenantId);
    }

    // Return cached items
    return this.cacheRepo.findByTenantId(tenantId, filter);
  }

  /**
   * Get calculation items by type
   */
  async getCalculationItemsByType(
    tenantId: string,
    type: CalculationType,
    forceRefresh = false,
  ): Promise<ReturnType<typeof this.cacheRepo.findByType>> {
    const cacheStatus = await this.getCacheStatus(tenantId);

    if (forceRefresh || cacheStatus.needsRefresh) {
      await this.syncCalculationItems(tenantId);
    }

    return this.cacheRepo.findByType(tenantId, type);
  }

  /**
   * Get a specific calculation item by code
   */
  async getCalculationItemByCode(
    tenantId: string,
    code: string,
    forceRefresh = false,
  ): Promise<ReturnType<typeof this.cacheRepo.findByCode>> {
    const cacheStatus = await this.getCacheStatus(tenantId);

    if (forceRefresh || cacheStatus.needsRefresh) {
      await this.syncCalculationItems(tenantId);
    }

    return this.cacheRepo.findByCode(tenantId, code);
  }

  /**
   * Get cache status for a tenant
   */
  async getCacheStatus(tenantId: string): Promise<CacheStatus> {
    return this.cacheRepo.getCacheStatus(tenantId);
  }

  /**
   * Sync calculation items from SimplePay API
   */
  async syncCalculationItems(tenantId: string): Promise<CalculationSyncResult> {
    this.logger.log(`Syncing calculation items for tenant ${tenantId}`);

    const result: CalculationSyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: [],
    };

    try {
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // Fetch all calculation item types in parallel
      const [earningTypes, deductionTypes, employerContributions] =
        await Promise.all([
          this.fetchEarningTypes(clientId),
          this.fetchDeductionTypes(clientId),
          this.fetchEmployerContributions(clientId),
        ]);

      const allItems = [
        ...earningTypes,
        ...deductionTypes,
        ...employerContributions,
      ];

      // Upsert all items
      for (const item of allItems) {
        try {
          await this.cacheRepo.upsert(tenantId, item.code, {
            name: item.name,
            type: mapSimplePayTypeToCalculationType(item.type),
            taxable: item.is_taxable ?? isTaxableCode(item.code),
            affectsUif:
              item.is_uif_applicable ?? affectsUifCalculation(item.code),
            category: item.category,
          });
          result.synced++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            code: item.code,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Also add standard SA payroll codes if not present
      await this.ensureStandardCodes(tenantId);

      result.success = result.failed === 0;

      this.logger.log(
        `Sync complete: ${result.synced} synced, ${result.failed} failed`,
      );
    } catch (error) {
      result.success = false;
      this.logger.error(
        `Failed to sync calculation items: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    return result;
  }

  /**
   * Fetch earning types from SimplePay
   */
  private async fetchEarningTypes(
    clientId: string,
  ): Promise<SimplePayCalculationItem[]> {
    try {
      const response = await this.apiClient.get<CalculationItemWrapper[]>(
        `/clients/${clientId}/earning_types`,
      );

      return response.map((wrapper) => ({
        ...(wrapper.earning_type || wrapper.calculation_item || wrapper),
        type: 'earning' as const,
      })) as SimplePayCalculationItem[];
    } catch (error) {
      this.logger.warn(`Failed to fetch earning types: ${error}`);
      return [];
    }
  }

  /**
   * Fetch deduction types from SimplePay
   */
  private async fetchDeductionTypes(
    clientId: string,
  ): Promise<SimplePayCalculationItem[]> {
    try {
      const response = await this.apiClient.get<CalculationItemWrapper[]>(
        `/clients/${clientId}/deduction_types`,
      );

      return response.map((wrapper) => ({
        ...(wrapper.deduction_type || wrapper.calculation_item || wrapper),
        type: 'deduction' as const,
      })) as SimplePayCalculationItem[];
    } catch (error) {
      this.logger.warn(`Failed to fetch deduction types: ${error}`);
      return [];
    }
  }

  /**
   * Fetch employer contributions from SimplePay
   */
  private async fetchEmployerContributions(
    clientId: string,
  ): Promise<SimplePayCalculationItem[]> {
    try {
      const response = await this.apiClient.get<CalculationItemWrapper[]>(
        `/clients/${clientId}/employer_contributions`,
      );

      return response.map((wrapper) => ({
        ...(wrapper.employer_contribution ||
          wrapper.calculation_item ||
          wrapper),
        type: 'employer_contribution' as const,
      })) as SimplePayCalculationItem[];
    } catch (error) {
      this.logger.warn(`Failed to fetch employer contributions: ${error}`);
      return [];
    }
  }

  /**
   * Ensure standard SA payroll codes exist in cache
   */
  private async ensureStandardCodes(tenantId: string): Promise<void> {
    const standardItems: Array<{
      code: string;
      name: string;
      type: CalculationType;
      taxable: boolean;
      affectsUif: boolean;
    }> = [
      // Statutory
      {
        code: SA_PAYROLL_CODES.PAYE,
        name: 'PAYE (Pay As You Earn)',
        type: 'DEDUCTION',
        taxable: false,
        affectsUif: false,
      },
      {
        code: SA_PAYROLL_CODES.UIF_EMPLOYEE,
        name: 'UIF Employee Contribution',
        type: 'DEDUCTION',
        taxable: false,
        affectsUif: true,
      },
      {
        code: SA_PAYROLL_CODES.UIF_EMPLOYER,
        name: 'UIF Employer Contribution',
        type: 'COMPANY_CONTRIBUTION',
        taxable: false,
        affectsUif: true,
      },
      {
        code: SA_PAYROLL_CODES.SDL,
        name: 'Skills Development Levy',
        type: 'COMPANY_CONTRIBUTION',
        taxable: false,
        affectsUif: false,
      },
      // Earnings
      {
        code: SA_PAYROLL_CODES.BASIC_SALARY,
        name: 'Basic Salary',
        type: 'EARNING',
        taxable: true,
        affectsUif: true,
      },
      {
        code: SA_PAYROLL_CODES.OVERTIME,
        name: 'Overtime',
        type: 'EARNING',
        taxable: true,
        affectsUif: true,
      },
      {
        code: SA_PAYROLL_CODES.BONUS,
        name: 'Bonus',
        type: 'EARNING',
        taxable: true,
        affectsUif: true,
      },
      {
        code: SA_PAYROLL_CODES.TRAVEL_ALLOWANCE,
        name: 'Travel Allowance',
        type: 'EARNING',
        taxable: true,
        affectsUif: false,
      },
      // Deductions
      {
        code: SA_PAYROLL_CODES.PENSION_FUND,
        name: 'Pension Fund Contribution',
        type: 'DEDUCTION',
        taxable: false,
        affectsUif: false,
      },
      {
        code: SA_PAYROLL_CODES.MEDICAL_AID,
        name: 'Medical Aid Contribution',
        type: 'DEDUCTION',
        taxable: false,
        affectsUif: false,
      },
    ];

    for (const item of standardItems) {
      try {
        // Only create if not exists
        const existing = await this.cacheRepo.findByCode(tenantId, item.code);
        if (!existing) {
          await this.cacheRepo.upsert(tenantId, item.code, item);
        }
      } catch (error) {
        this.logger.warn(`Failed to add standard code ${item.code}: ${error}`);
      }
    }
  }

  /**
   * Get earnings calculation items
   */
  async getEarnings(
    tenantId: string,
    forceRefresh = false,
  ): Promise<ReturnType<typeof this.cacheRepo.findByType>> {
    return this.getCalculationItemsByType(tenantId, 'EARNING', forceRefresh);
  }

  /**
   * Get deduction calculation items
   */
  async getDeductions(
    tenantId: string,
    forceRefresh = false,
  ): Promise<ReturnType<typeof this.cacheRepo.findByType>> {
    return this.getCalculationItemsByType(tenantId, 'DEDUCTION', forceRefresh);
  }

  /**
   * Get employer contribution calculation items
   */
  async getEmployerContributions(
    tenantId: string,
    forceRefresh = false,
  ): Promise<ReturnType<typeof this.cacheRepo.findByType>> {
    return this.getCalculationItemsByType(
      tenantId,
      'COMPANY_CONTRIBUTION',
      forceRefresh,
    );
  }

  /**
   * Get active payroll adjustments for a staff member
   */
  async getActiveAdjustments(staffId: string, effectiveDate?: Date) {
    const date = effectiveDate ?? new Date();
    return this.adjustmentRepo.findActiveForDate(staffId, date);
  }

  /**
   * Get count of calculation items
   */
  async getItemCount(tenantId: string): Promise<number> {
    return this.cacheRepo.count(tenantId);
  }

  /**
   * Clear cache for a tenant (forces refresh on next access)
   */
  async clearCache(tenantId: string): Promise<number> {
    this.logger.log(`Clearing cache for tenant ${tenantId}`);
    return this.cacheRepo.deleteByTenantId(tenantId);
  }
}
