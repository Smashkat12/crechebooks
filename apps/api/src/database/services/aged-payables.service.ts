/**
 * Aged Payables Service
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @module database/services/aged-payables
 * @description Placeholder service for aged payables report.
 * Returns empty structure since bills/suppliers module is not in scope.
 * Ready for future integration when bills module is implemented.
 *
 * CRITICAL: Tenant isolation is MANDATORY.
 * CRITICAL: NO WORKAROUNDS OR FALLBACKS - errors must propagate.
 * CRITICAL: Never return null - return structure with zeros.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../shared/exceptions';

/**
 * Supplier aging bucket with invoice details.
 */
export interface SupplierAgingBucket {
  count: number;
  totalCents: number;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    amountCents: number;
    invoiceCount: number;
    oldestBillDays: number;
  }>;
}

/**
 * Complete aged payables report structure.
 */
export interface AgedPayablesReport {
  tenantId: string;
  asOfDate: Date;
  aging: {
    current: SupplierAgingBucket;
    thirtyDays: SupplierAgingBucket;
    sixtyDays: SupplierAgingBucket;
    ninetyDays: SupplierAgingBucket;
    overNinety: SupplierAgingBucket;
  };
  summary: {
    totalOutstanding: number;
    totalSuppliers: number;
    oldestBillDays: number;
    averagePaymentDays: number;
  };
  generatedAt: Date;
}

/**
 * Individual supplier aging detail.
 */
export interface SupplierAging {
  supplierId: string;
  supplierName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  total: number;
  invoiceCount: number;
  oldestBillDays: number;
}

@Injectable()
export class AgedPayablesService {
  private readonly logger = new Logger(AgedPayablesService.name);

  /**
   * Generate Aged Payables Report.
   *
   * Currently returns empty structure as bills/suppliers module is not in scope.
   * This is a placeholder for future implementation.
   *
   * @param tenantId - Tenant ID for isolation (MANDATORY)
   * @param asOfDate - Date to calculate aging from
   * @returns AgedPayablesReport with empty aging buckets
   * @throws BusinessException if tenantId is missing
   */
  async generateAgedPayablesReport(
    tenantId: string,
    asOfDate: Date,
  ): Promise<AgedPayablesReport> {
    // Validate inputs BEFORE logging (to avoid RangeError on invalid date)
    if (!tenantId) {
      throw new BusinessException(
        'Tenant ID is required for aged payables report',
        'MISSING_TENANT_ID',
        { tenantId },
      );
    }

    if (!asOfDate || isNaN(asOfDate.getTime())) {
      throw new BusinessException(
        'Valid as-of date is required for aged payables report',
        'INVALID_DATE',
        { asOfDate: String(asOfDate) },
      );
    }

    this.logger.log(
      `Generating Aged Payables Report for tenant ${tenantId} as of ${asOfDate.toISOString()}`,
    );

    // Return empty structure - bills/suppliers module not in scope
    // NEVER return null - always return structure with zeros
    const emptyBucket: SupplierAgingBucket = {
      count: 0,
      totalCents: 0,
      suppliers: [],
    };

    return {
      tenantId,
      asOfDate,
      aging: {
        current: { ...emptyBucket },
        thirtyDays: { ...emptyBucket },
        sixtyDays: { ...emptyBucket },
        ninetyDays: { ...emptyBucket },
        overNinety: { ...emptyBucket },
      },
      summary: {
        totalOutstanding: 0,
        totalSuppliers: 0,
        oldestBillDays: 0,
        averagePaymentDays: 0,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Get supplier aging details for a specific supplier.
   *
   * Currently returns empty result as bills/suppliers module is not in scope.
   *
   * @param tenantId - Tenant ID for isolation
   * @param supplierId - Supplier ID to get details for
   * @param asOfDate - Date to calculate aging from
   * @returns Empty supplier aging detail
   */
  async getSupplierAgingDetail(
    tenantId: string,
    supplierId: string,
    asOfDate: Date,
  ): Promise<SupplierAging | null> {
    this.logger.log(
      `Getting supplier aging detail for supplier ${supplierId}, tenant ${tenantId}`,
    );

    // Bills/suppliers module not in scope - return null
    return null;
  }

  /**
   * Get all suppliers with outstanding balances.
   *
   * Currently returns empty array as bills/suppliers module is not in scope.
   *
   * @param tenantId - Tenant ID for isolation
   * @param asOfDate - Date to calculate aging from
   * @returns Empty array of supplier aging details
   */
  async getAllSuppliersAging(
    tenantId: string,
    asOfDate: Date,
  ): Promise<SupplierAging[]> {
    this.logger.log(
      `Getting all suppliers aging for tenant ${tenantId} as of ${asOfDate.toISOString()}`,
    );

    // Bills/suppliers module not in scope - return empty array
    return [];
  }

  /**
   * Check if supplier bills feature is available.
   * This can be used by the frontend to show appropriate messaging.
   *
   * @returns false - feature not yet implemented
   */
  isFeatureAvailable(): boolean {
    return false;
  }

  /**
   * Get feature availability message for UI display.
   *
   * @returns Message explaining feature is coming soon
   */
  getFeatureMessage(): string {
    return 'Supplier bills and aged payables tracking will be available in a future update.';
  }
}
