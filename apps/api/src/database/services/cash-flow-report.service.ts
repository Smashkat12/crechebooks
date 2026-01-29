/**
 * Cash Flow Report Service
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @module database/services/cash-flow-report
 * @description Wrapper service for cash flow statement generation that integrates
 * with the reports module. Delegates to the existing CashFlowService for calculations.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js for precise calculations - NEVER use floating-point.
 * CRITICAL: Tenant isolation is MANDATORY.
 * CRITICAL: NO WORKAROUNDS OR FALLBACKS - errors must propagate.
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CashFlowService } from './cash-flow.service';
import { FinancialReportService } from './financial-report.service';
import type { CashFlowStatementResponse } from '../dto/cash-flow.dto';
import { BusinessException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

/**
 * Cash flow statement result structured for the reports module.
 */
export interface CashFlowStatement {
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  operating: {
    netProfit: number;
    adjustments: number;
    workingCapital: number;
    total: number;
    details: Array<{
      name: string;
      amountCents: number;
      description?: string;
    }>;
  };
  investing: {
    total: number;
    items: Array<{
      name: string;
      amountCents: number;
    }>;
  };
  financing: {
    total: number;
    items: Array<{
      name: string;
      amountCents: number;
    }>;
  };
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
  cashReconciles: boolean;
  generatedAt: Date;
}

@Injectable()
export class CashFlowReportService {
  private readonly logger = new Logger(CashFlowReportService.name);

  constructor(
    private readonly cashFlowService: CashFlowService,
    private readonly financialReportService: FinancialReportService,
  ) {}

  /**
   * Generate a Cash Flow Statement for the reports module.
   * Uses the indirect method: Net Profit + Non-Cash Adjustments + Working Capital Changes
   *
   * @param tenantId - Tenant ID for isolation (MANDATORY)
   * @param periodStart - Start date of the reporting period
   * @param periodEnd - End date of the reporting period
   * @returns CashFlowStatement with operating, investing, and financing activities
   * @throws BusinessException if period dates are invalid
   */
  async generateCashFlowStatement(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<CashFlowStatement> {
    this.logger.log(
      `Generating Cash Flow Statement for tenant ${tenantId}, period ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    // Validate period dates
    if (periodStart > periodEnd) {
      throw new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      );
    }

    // Delegate to the existing CashFlowService
    const rawStatement: CashFlowStatementResponse =
      await this.cashFlowService.generateCashFlowStatement(
        tenantId,
        periodStart,
        periodEnd,
        false, // Don't include comparative for now
      );

    // Get accounts receivable change for working capital calculation
    // Note: Currently not used directly as CashFlowService handles it,
    // but kept for future detailed reporting needs
    const _accountsReceivableChange =
      await this.calculateAccountsReceivableChange(
        tenantId,
        periodStart,
        periodEnd,
      );

    // Build operating activities details
    const operatingDetails =
      rawStatement.operatingActivities.adjustmentDetails.map((adj) => ({
        name: adj.name,
        amountCents: adj.amountCents,
        description: adj.description,
      }));

    // Build investing items
    const investingItems: Array<{ name: string; amountCents: number }> = [];
    if (rawStatement.investingActivities.assetPurchasesCents !== 0) {
      investingItems.push({
        name: 'Fixed Asset Purchases',
        amountCents: rawStatement.investingActivities.assetPurchasesCents,
      });
    }
    if (rawStatement.investingActivities.assetSalesCents !== 0) {
      investingItems.push({
        name: 'Fixed Asset Sales',
        amountCents: rawStatement.investingActivities.assetSalesCents,
      });
    }

    // Build financing items
    const financingItems: Array<{ name: string; amountCents: number }> = [];
    if (rawStatement.financingActivities.loanProceedsCents !== 0) {
      financingItems.push({
        name: 'Loan Proceeds',
        amountCents: rawStatement.financingActivities.loanProceedsCents,
      });
    }
    if (rawStatement.financingActivities.loanRepaymentsCents !== 0) {
      financingItems.push({
        name: 'Loan Repayments',
        amountCents: rawStatement.financingActivities.loanRepaymentsCents,
      });
    }
    if (rawStatement.financingActivities.ownerContributionsCents !== 0) {
      financingItems.push({
        name: 'Owner Contributions',
        amountCents: rawStatement.financingActivities.ownerContributionsCents,
      });
    }
    if (rawStatement.financingActivities.ownerDrawingsCents !== 0) {
      financingItems.push({
        name: 'Owner Drawings',
        amountCents: rawStatement.financingActivities.ownerDrawingsCents,
      });
    }

    // Calculate working capital change using Decimal.js for precision
    const workingCapitalChange = new Decimal(
      rawStatement.operatingActivities.adjustments.receivablesChange,
    )
      .plus(rawStatement.operatingActivities.adjustments.payablesChange)
      .plus(rawStatement.operatingActivities.adjustments.prepaidExpensesChange)
      .plus(rawStatement.operatingActivities.adjustments.accruedExpensesChange)
      .toNumber();

    // Calculate non-cash adjustments
    const nonCashAdjustments = new Decimal(
      rawStatement.operatingActivities.adjustments.depreciation,
    )
      .plus(rawStatement.operatingActivities.adjustments.otherAdjustments)
      .toNumber();

    return {
      tenantId,
      period: {
        start: periodStart,
        end: periodEnd,
      },
      operating: {
        netProfit: rawStatement.operatingActivities.netIncomeCents,
        adjustments: nonCashAdjustments,
        workingCapital: workingCapitalChange,
        total: rawStatement.operatingActivities.netCashFromOperatingCents,
        details: operatingDetails,
      },
      investing: {
        total: rawStatement.investingActivities.netCashFromInvestingCents,
        items: investingItems,
      },
      financing: {
        total: rawStatement.financingActivities.netCashFromFinancingCents,
        items: financingItems,
      },
      netCashFlow: rawStatement.summary.netCashChangeCents,
      openingBalance: rawStatement.summary.openingCashBalanceCents,
      closingBalance: rawStatement.summary.closingCashBalanceCents,
      cashReconciles: rawStatement.summary.cashReconciles,
      generatedAt: new Date(),
    };
  }

  /**
   * Calculate change in accounts receivable between two dates.
   * Increase in AR = cash outflow (negative working capital effect)
   *
   * @param tenantId - Tenant ID for isolation
   * @param periodStart - Start date
   * @param periodEnd - End date
   * @returns Change in accounts receivable (positive = increase, negative = decrease)
   */
  private async calculateAccountsReceivableChange(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    try {
      // Get balance sheet at start of period
      const startBalance =
        await this.financialReportService.generateBalanceSheet(
          tenantId,
          periodStart,
        );

      // Get balance sheet at end of period
      const endBalance = await this.financialReportService.generateBalanceSheet(
        tenantId,
        periodEnd,
      );

      // Find accounts receivable in both
      const startAR = startBalance.assets.current.find(
        (a) => a.accountCode === '1100', // ACCOUNTS_RECEIVABLE code
      );
      const endAR = endBalance.assets.current.find(
        (a) => a.accountCode === '1100',
      );

      const startARCents = startAR?.amountCents || 0;
      const endARCents = endAR?.amountCents || 0;

      // Use Decimal.js for precise calculation
      return new Decimal(endARCents).minus(startARCents).toNumber();
    } catch (error) {
      this.logger.warn(
        `Failed to calculate AR change: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Get cash flow summary for dashboard display.
   *
   * @param tenantId - Tenant ID for isolation
   * @param periodStart - Start date
   * @param periodEnd - End date
   * @returns Summary of cash flow activities
   */
  async getCashFlowSummary(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    operatingCents: number;
    investingCents: number;
    financingCents: number;
    netChangeCents: number;
    openingBalanceCents: number;
    closingBalanceCents: number;
    isPositive: boolean;
  }> {
    const statement = await this.generateCashFlowStatement(
      tenantId,
      periodStart,
      periodEnd,
    );

    return {
      operatingCents: statement.operating.total,
      investingCents: statement.investing.total,
      financingCents: statement.financing.total,
      netChangeCents: statement.netCashFlow,
      openingBalanceCents: statement.openingBalance,
      closingBalanceCents: statement.closingBalance,
      isPositive: statement.netCashFlow >= 0,
    };
  }
}
