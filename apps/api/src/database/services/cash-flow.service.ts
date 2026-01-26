/**
 * Cash Flow Statement Service
 * TASK-ACCT-004: Cash Flow Report Service
 *
 * @module database/services/cash-flow
 * @description Generates Cash Flow Statements using the indirect method.
 * Starts with net income and adjusts for non-cash items and working capital changes.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Never mix cash and accrual amounts in calculations.
 * CRITICAL: Never double-count items between sections.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralLedgerService } from './general-ledger.service';
import {
  CashFlowStatementResponse,
  OperatingActivitiesResponse,
  InvestingActivitiesResponse,
  FinancingActivitiesResponse,
  CashFlowSummaryResponse,
  CashFlowAdjustment,
  CashFlowTrendResponse,
} from '../dto/cash-flow.dto';

// Standard chart of account codes
const ACCOUNT_CODES = {
  BANK: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  PETTY_CASH: '1200',
  PREPAID_EXPENSES: '1300',
  FIXED_ASSETS: '1500',
  ACCUMULATED_DEPRECIATION: '1510',
  ACCOUNTS_PAYABLE: '2000',
  VAT_PAYABLE: '2100',
  PAYE_PAYABLE: '2200',
  UIF_PAYABLE: '2300',
  ACCRUED_EXPENSES: '2400',
  LOAN_PREFIX: '25',
  OWNERS_EQUITY: '3000',
  RETAINED_EARNINGS: '3200',
  DEPRECIATION_EXPENSE: '5900',
};

@Injectable()
export class CashFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedgerService: GeneralLedgerService,
  ) {}

  /**
   * Generate a complete Cash Flow Statement
   */
  async generateCashFlowStatement(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    includeComparative: boolean = false,
  ): Promise<CashFlowStatementResponse> {
    // Generate main period statement
    const operatingActivities = await this.calculateOperatingActivities(
      tenantId,
      startDate,
      endDate,
    );
    const investingActivities = await this.calculateInvestingActivities(
      tenantId,
      startDate,
      endDate,
    );
    const financingActivities = await this.calculateFinancingActivities(
      tenantId,
      startDate,
      endDate,
    );
    const summary = await this.calculateSummary(
      tenantId,
      startDate,
      endDate,
      operatingActivities.netCashFromOperatingCents,
      investingActivities.netCashFromInvestingCents,
      financingActivities.netCashFromFinancingCents,
    );

    const result: CashFlowStatementResponse = {
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      operatingActivities,
      investingActivities,
      financingActivities,
      summary,
    };

    // Generate comparative period if requested
    if (includeComparative) {
      const priorYearStart = new Date(startDate);
      priorYearStart.setFullYear(priorYearStart.getFullYear() - 1);
      const priorYearEnd = new Date(endDate);
      priorYearEnd.setFullYear(priorYearEnd.getFullYear() - 1);

      const compOperating = await this.calculateOperatingActivities(
        tenantId,
        priorYearStart,
        priorYearEnd,
      );
      const compInvesting = await this.calculateInvestingActivities(
        tenantId,
        priorYearStart,
        priorYearEnd,
      );
      const compFinancing = await this.calculateFinancingActivities(
        tenantId,
        priorYearStart,
        priorYearEnd,
      );
      const compSummary = await this.calculateSummary(
        tenantId,
        priorYearStart,
        priorYearEnd,
        compOperating.netCashFromOperatingCents,
        compInvesting.netCashFromInvestingCents,
        compFinancing.netCashFromFinancingCents,
      );

      result.comparative = {
        period: {
          startDate: priorYearStart.toISOString().split('T')[0],
          endDate: priorYearEnd.toISOString().split('T')[0],
        },
        operatingActivities: compOperating,
        investingActivities: compInvesting,
        financingActivities: compFinancing,
        summary: compSummary,
      };
    }

    return result;
  }

  /**
   * Calculate Operating Activities section (Indirect Method)
   */
  private async calculateOperatingActivities(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<OperatingActivitiesResponse> {
    // 1. Calculate Net Income
    const netIncomeCents = await this.calculateNetIncome(
      tenantId,
      startDate,
      endDate,
    );

    // 2. Calculate adjustments for non-cash items
    const depreciation = await this.getDepreciationExpense(
      tenantId,
      startDate,
      endDate,
    );

    // 3. Calculate working capital changes
    const receivablesChange = await this.calculateBalanceChange(
      tenantId,
      ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      startDate,
      endDate,
    );

    const payablesChange = await this.calculateBalanceChange(
      tenantId,
      ACCOUNT_CODES.ACCOUNTS_PAYABLE,
      startDate,
      endDate,
    );

    const prepaidExpensesChange = await this.calculateBalanceChange(
      tenantId,
      ACCOUNT_CODES.PREPAID_EXPENSES,
      startDate,
      endDate,
    );

    const accruedExpensesChange = await this.calculateBalanceChange(
      tenantId,
      ACCOUNT_CODES.ACCRUED_EXPENSES,
      startDate,
      endDate,
    );

    // Build adjustment details
    const adjustmentDetails: CashFlowAdjustment[] = [];

    if (depreciation !== 0) {
      adjustmentDetails.push({
        name: 'Depreciation',
        amountCents: depreciation,
        description: 'Add back non-cash depreciation expense',
      });
    }

    if (receivablesChange !== 0) {
      adjustmentDetails.push({
        name: 'Change in Accounts Receivable',
        amountCents: -receivablesChange,
        description:
          receivablesChange > 0
            ? 'Increase in receivables (cash used)'
            : 'Decrease in receivables (cash freed)',
      });
    }

    if (payablesChange !== 0) {
      adjustmentDetails.push({
        name: 'Change in Accounts Payable',
        amountCents: payablesChange,
        description:
          payablesChange > 0
            ? 'Increase in payables (cash saved)'
            : 'Decrease in payables (cash used)',
      });
    }

    if (prepaidExpensesChange !== 0) {
      adjustmentDetails.push({
        name: 'Change in Prepaid Expenses',
        amountCents: -prepaidExpensesChange,
        description:
          prepaidExpensesChange > 0
            ? 'Increase in prepaids (cash used)'
            : 'Decrease in prepaids (cash freed)',
      });
    }

    if (accruedExpensesChange !== 0) {
      adjustmentDetails.push({
        name: 'Change in Accrued Expenses',
        amountCents: accruedExpensesChange,
        description:
          accruedExpensesChange > 0
            ? 'Increase in accruals (cash saved)'
            : 'Decrease in accruals (cash used)',
      });
    }

    // Total adjustments
    const totalAdjustmentsCents =
      depreciation -
      receivablesChange +
      payablesChange -
      prepaidExpensesChange +
      accruedExpensesChange;

    const netCashFromOperatingCents = netIncomeCents + totalAdjustmentsCents;

    return {
      netIncomeCents,
      adjustments: {
        depreciation,
        receivablesChange: -receivablesChange,
        payablesChange,
        prepaidExpensesChange: -prepaidExpensesChange,
        accruedExpensesChange,
        otherAdjustments: 0,
      },
      adjustmentDetails,
      totalAdjustmentsCents,
      netCashFromOperatingCents,
    };
  }

  /**
   * Calculate Investing Activities section
   */
  private async calculateInvestingActivities(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<InvestingActivitiesResponse> {
    // Get fixed asset transactions
    const assetPurchasesCents = await this.getAccountDebits(
      tenantId,
      ACCOUNT_CODES.FIXED_ASSETS,
      startDate,
      endDate,
    );

    const assetSalesCents = await this.getAccountCredits(
      tenantId,
      ACCOUNT_CODES.FIXED_ASSETS,
      startDate,
      endDate,
    );

    // Equipment is a subset of fixed assets (could use separate account if defined)
    const equipmentPurchasesCents = 0; // Would need separate account tracking

    // Investments (if creche has any - rare)
    const investmentPurchasesCents = 0;
    const investmentSalesCents = 0;

    const netCashFromInvestingCents = assetSalesCents - assetPurchasesCents;

    return {
      assetPurchasesCents: -assetPurchasesCents, // Show as negative (outflow)
      assetSalesCents, // Show as positive (inflow)
      equipmentPurchasesCents: -equipmentPurchasesCents,
      investmentPurchasesCents: -investmentPurchasesCents,
      investmentSalesCents,
      netCashFromInvestingCents,
    };
  }

  /**
   * Calculate Financing Activities section
   */
  private async calculateFinancingActivities(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FinancingActivitiesResponse> {
    // Find loan accounts (accounts starting with 25)
    const loanAccounts = await this.prisma.chartOfAccount.findMany({
      where: {
        tenantId,
        code: { startsWith: ACCOUNT_CODES.LOAN_PREFIX },
        type: 'LIABILITY',
        isActive: true,
      },
    });

    let loanProceedsCents = 0;
    let loanRepaymentsCents = 0;

    for (const account of loanAccounts) {
      loanProceedsCents += await this.getAccountCredits(
        tenantId,
        account.code,
        startDate,
        endDate,
      );
      loanRepaymentsCents += await this.getAccountDebits(
        tenantId,
        account.code,
        startDate,
        endDate,
      );
    }

    // Owner equity changes
    const ownerContributionsCents = await this.getAccountCredits(
      tenantId,
      ACCOUNT_CODES.OWNERS_EQUITY,
      startDate,
      endDate,
    );

    const ownerDrawingsCents = await this.getAccountDebits(
      tenantId,
      ACCOUNT_CODES.OWNERS_EQUITY,
      startDate,
      endDate,
    );

    const netCashFromFinancingCents =
      loanProceedsCents -
      loanRepaymentsCents +
      ownerContributionsCents -
      ownerDrawingsCents;

    return {
      loanProceedsCents,
      loanRepaymentsCents: -loanRepaymentsCents, // Show as negative (outflow)
      ownerContributionsCents,
      ownerDrawingsCents: -ownerDrawingsCents, // Show as negative (outflow)
      netCashFromFinancingCents,
    };
  }

  /**
   * Calculate Summary section
   */
  private async calculateSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    netCashFromOperating: number,
    netCashFromInvesting: number,
    netCashFromFinancing: number,
  ): Promise<CashFlowSummaryResponse> {
    const openingCashBalanceCents = await this.getCashBalance(
      tenantId,
      startDate,
    );
    const netCashChangeCents =
      netCashFromOperating + netCashFromInvesting + netCashFromFinancing;
    const calculatedClosingBalance =
      openingCashBalanceCents + netCashChangeCents;

    // Get actual closing balance for reconciliation
    const actualClosingBalance = await this.getCashBalance(
      tenantId,
      new Date(endDate.getTime() + 24 * 60 * 60 * 1000),
    );

    // Check if cash reconciles (within a small tolerance for rounding)
    const tolerance = 100; // 1 Rand tolerance
    const cashReconciles =
      Math.abs(calculatedClosingBalance - actualClosingBalance) <= tolerance;

    return {
      netCashChangeCents,
      openingCashBalanceCents,
      closingCashBalanceCents: calculatedClosingBalance,
      cashReconciles,
    };
  }

  /**
   * Calculate net income from revenue and expenses
   */
  private async calculateNetIncome(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    // Get all revenue accounts
    const revenueAccounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, type: 'REVENUE', isActive: true },
    });

    // Get all expense accounts
    const expenseAccounts = await this.prisma.chartOfAccount.findMany({
      where: { tenantId, type: 'EXPENSE', isActive: true },
    });

    let totalRevenue = 0;
    let totalExpenses = 0;

    // Calculate total revenue for period
    for (const account of revenueAccounts) {
      try {
        const ledger = await this.generalLedgerService.getAccountLedger(
          tenantId,
          account.code,
          startDate,
          endDate,
        );
        // Revenue is credit-normal, so closing - opening gives period activity
        const periodActivity =
          ledger.closingBalanceCents - ledger.openingBalanceCents;
        totalRevenue += periodActivity;
      } catch {
        // Account may not have transactions
      }
    }

    // Calculate total expenses for period
    for (const account of expenseAccounts) {
      try {
        const ledger = await this.generalLedgerService.getAccountLedger(
          tenantId,
          account.code,
          startDate,
          endDate,
        );
        // Expenses are debit-normal
        const periodActivity =
          ledger.closingBalanceCents - ledger.openingBalanceCents;
        totalExpenses += periodActivity;
      } catch {
        // Account may not have transactions
      }
    }

    return totalRevenue - totalExpenses;
  }

  /**
   * Get depreciation expense for period
   */
  private async getDepreciationExpense(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: ACCOUNT_CODES.DEPRECIATION_EXPENSE },
    });

    if (!account) return 0;

    try {
      const ledger = await this.generalLedgerService.getAccountLedger(
        tenantId,
        ACCOUNT_CODES.DEPRECIATION_EXPENSE,
        startDate,
        endDate,
      );
      return ledger.closingBalanceCents - ledger.openingBalanceCents;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate change in account balance between two dates
   */
  private async calculateBalanceChange(
    tenantId: string,
    accountCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: accountCode },
    });

    if (!account) return 0;

    try {
      const ledger = await this.generalLedgerService.getAccountLedger(
        tenantId,
        accountCode,
        startDate,
        endDate,
      );
      return ledger.closingBalanceCents - ledger.openingBalanceCents;
    } catch {
      return 0;
    }
  }

  /**
   * Get total debits to an account for a period
   */
  private async getAccountDebits(
    tenantId: string,
    accountCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: accountCode },
    });

    if (!account) return 0;

    try {
      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode,
      });

      return entries
        .filter((e) => e.debitCents > 0)
        .reduce((sum, e) => sum + e.debitCents, 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get total credits to an account for a period
   */
  private async getAccountCredits(
    tenantId: string,
    accountCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const account = await this.prisma.chartOfAccount.findFirst({
      where: { tenantId, code: accountCode },
    });

    if (!account) return 0;

    try {
      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode,
      });

      return entries
        .filter((e) => e.creditCents > 0)
        .reduce((sum, e) => sum + e.creditCents, 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get total cash balance as of a date
   */
  private async getCashBalance(
    tenantId: string,
    asOfDate: Date,
  ): Promise<number> {
    let totalCash = 0;

    // Bank account
    try {
      const bankLedger = await this.generalLedgerService.getAccountLedger(
        tenantId,
        ACCOUNT_CODES.BANK,
        new Date('1970-01-01'),
        asOfDate,
      );
      totalCash += bankLedger.closingBalanceCents;
    } catch {
      // Account may not exist
    }

    // Petty cash
    try {
      const pettyCashLedger = await this.generalLedgerService.getAccountLedger(
        tenantId,
        ACCOUNT_CODES.PETTY_CASH,
        new Date('1970-01-01'),
        asOfDate,
      );
      totalCash += pettyCashLedger.closingBalanceCents;
    } catch {
      // Account may not exist
    }

    return totalCash;
  }

  /**
   * Generate monthly cash flow trend for a period
   */
  async getCashFlowTrend(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CashFlowTrendResponse> {
    const periods: CashFlowTrendResponse['periods'] = [];

    // Generate monthly periods
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const periodStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const periodEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );

      // Cap at the overall end date
      const effectiveEnd = periodEnd > endDate ? endDate : periodEnd;

      const operating = await this.calculateOperatingActivities(
        tenantId,
        periodStart,
        effectiveEnd,
      );
      const investing = await this.calculateInvestingActivities(
        tenantId,
        periodStart,
        effectiveEnd,
      );
      const financing = await this.calculateFinancingActivities(
        tenantId,
        periodStart,
        effectiveEnd,
      );

      const netChange =
        operating.netCashFromOperatingCents +
        investing.netCashFromInvestingCents +
        financing.netCashFromFinancingCents;

      const closingBalance = await this.getCashBalance(
        tenantId,
        new Date(effectiveEnd.getTime() + 24 * 60 * 60 * 1000),
      );

      periods.push({
        period: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
        operatingCents: operating.netCashFromOperatingCents,
        investingCents: investing.netCashFromInvestingCents,
        financingCents: financing.netCashFromFinancingCents,
        netChangeCents: netChange,
        closingBalanceCents: closingBalance,
      });

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return { periods };
  }

  /**
   * Get cash flow summary for dashboard
   */
  async getCashFlowSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
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
      startDate,
      endDate,
      false,
    );

    return {
      operatingCents: statement.operatingActivities.netCashFromOperatingCents,
      investingCents: statement.investingActivities.netCashFromInvestingCents,
      financingCents: statement.financingActivities.netCashFromFinancingCents,
      netChangeCents: statement.summary.netCashChangeCents,
      openingBalanceCents: statement.summary.openingCashBalanceCents,
      closingBalanceCents: statement.summary.closingCashBalanceCents,
      isPositive: statement.summary.netCashChangeCents >= 0,
    };
  }
}
