/**
 * Comparative Balance Sheet Service
 * TASK-RECON-036: Complete Balance Sheet Implementation
 *
 * @description Generates comparative balance sheets with variance analysis
 * and IFRS for SMEs Section 4 compliance checks
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { BalanceSheetService } from './balance-sheet.service';
import {
  ComparativeBalanceSheet,
  BalanceSheetVariances,
  AssetVariances,
  LiabilityVariances,
  EquityVariances,
  VarianceItem,
  BalanceSheetNote,
  IFRSComplianceStatus,
  IFRSCheckResult,
  OpeningBalancesResult,
  OpeningBalance,
} from '../dto/comparative-balance-sheet.dto';
import { BalanceSheet, LineItem } from '../dto/balance-sheet.dto';

// Configure Decimal.js with banker's rounding (ROUND_HALF_EVEN)
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

// IFRS for SMEs Section 4 - Minimum required line items
const IFRS_MINIMUM_LINE_ITEMS = {
  ASSETS: ['cash', 'receivables'],
  LIABILITIES: ['payables'],
  EQUITY: ['capital', 'retained'],
};

// Materiality threshold (5% of total assets per IFRS Section 4.11)
const MATERIALITY_THRESHOLD_PERCENT = 5;

@Injectable()
export class ComparativeBalanceSheetService {
  private readonly logger = new Logger(ComparativeBalanceSheetService.name);

  constructor(private readonly balanceSheetService: BalanceSheetService) {}

  /**
   * Generate a comparative balance sheet comparing current and prior periods
   * @param tenantId - The tenant identifier
   * @param currentDate - The current period end date
   * @param priorDate - The prior period end date
   * @returns Comparative balance sheet with variances and compliance status
   */
  async generateComparative(
    tenantId: string,
    currentDate: Date,
    priorDate: Date,
  ): Promise<ComparativeBalanceSheet> {
    this.logger.log(
      `Generating comparative balance sheet: tenant=${tenantId}, current=${currentDate.toISOString()}, prior=${priorDate.toISOString()}`,
    );

    // Generate both balance sheets in parallel
    const [currentPeriod, priorPeriod] = await Promise.all([
      this.balanceSheetService.generate(tenantId, currentDate),
      this.balanceSheetService.generate(tenantId, priorDate),
    ]);

    // Calculate variances between periods
    const variances = this.calculateVariances(currentPeriod, priorPeriod);

    // Check IFRS compliance
    const complianceStatus = this.checkIFRSCompliance(currentPeriod);

    // Generate notes based on significant variances and compliance issues
    const notes = this.generateNotes(variances, complianceStatus);

    this.logger.log(
      `Comparative balance sheet generated: asset_variance=${variances.assets.totalVarianceCents}c, compliant=${complianceStatus.isCompliant}`,
    );

    return {
      currentPeriod,
      priorPeriod,
      variances,
      notes,
      complianceStatus,
    };
  }

  /**
   * Calculate variances between current and prior balance sheets
   * Uses Decimal.js for precise calculations
   * @param current - Current period balance sheet
   * @param prior - Prior period balance sheet
   * @returns Detailed variance analysis
   */
  calculateVariances(
    current: BalanceSheet,
    prior: BalanceSheet,
  ): BalanceSheetVariances {
    const assetVariances = this.calculateAssetVariances(
      current.assets.current,
      current.assets.nonCurrent,
      prior.assets.current,
      prior.assets.nonCurrent,
    );

    const liabilityVariances = this.calculateLiabilityVariances(
      current.liabilities.current,
      current.liabilities.nonCurrent,
      prior.liabilities.current,
      prior.liabilities.nonCurrent,
    );

    const equityVariances = this.calculateEquityVariances(
      current.equity.items,
      current.equity.retainedEarningsCents,
      prior.equity.items,
      prior.equity.retainedEarningsCents,
    );

    return {
      assets: assetVariances,
      liabilities: liabilityVariances,
      equity: equityVariances,
    };
  }

  /**
   * Check IFRS for SMEs Section 4 compliance
   * @param balanceSheet - Balance sheet to check
   * @returns Compliance status with detailed check results
   */
  checkIFRSCompliance(balanceSheet: BalanceSheet): IFRSComplianceStatus {
    const checkedSections: IFRSCheckResult[] = [];
    const warnings: string[] = [];

    // Section 4.2 - Minimum line items
    const section42Checks = this.checkSection42MinimumLineItems(balanceSheet);
    checkedSections.push(...section42Checks);

    // Section 4.4-4.8 - Current/Non-current classification
    const section44Checks =
      this.checkSection44CurrentNonCurrentClassification(balanceSheet);
    checkedSections.push(...section44Checks);

    // Section 4.11 - Materiality (5% of total assets)
    const section411Checks = this.checkSection411Materiality(balanceSheet);
    checkedSections.push(...section411Checks);

    // Add materiality warning for items below threshold
    if (section411Checks.some((c) => !c.passed)) {
      warnings.push(
        `Some line items are below the materiality threshold of ${MATERIALITY_THRESHOLD_PERCENT}% of total assets and may need to be aggregated.`,
      );
    }

    // Check if balance sheet balances
    if (!balanceSheet.isBalanced) {
      checkedSections.push({
        section: 'Accounting Equation',
        requirement: 'Assets must equal Liabilities plus Equity',
        passed: false,
        details: `Assets (${balanceSheet.totalAssetsCents}c) does not equal Liabilities + Equity (${balanceSheet.totalLiabilitiesAndEquityCents}c)`,
      });
      warnings.push(
        'Balance sheet does not balance - this is a critical issue that must be resolved.',
      );
    } else {
      checkedSections.push({
        section: 'Accounting Equation',
        requirement: 'Assets must equal Liabilities plus Equity',
        passed: true,
        details: `Assets (${balanceSheet.totalAssetsCents}c) equals Liabilities + Equity (${balanceSheet.totalLiabilitiesAndEquityCents}c)`,
      });
    }

    const isCompliant = checkedSections.every((check) => check.passed);

    return {
      isCompliant,
      checkedSections,
      warnings,
    };
  }

  /**
   * Get opening balances for a period (should match prior period's closing)
   * @param tenantId - The tenant identifier
   * @param periodStartDate - Start date of the period
   * @returns Opening balances for assets, liabilities, and equity
   */
  async getOpeningBalances(
    tenantId: string,
    periodStartDate: Date,
  ): Promise<OpeningBalancesResult> {
    // Opening balance is the closing balance of the day before period starts
    const dayBeforePeriodStart = new Date(periodStartDate);
    dayBeforePeriodStart.setDate(dayBeforePeriodStart.getDate() - 1);

    const priorBalanceSheet = await this.balanceSheetService.generate(
      tenantId,
      dayBeforePeriodStart,
    );

    const assets: OpeningBalance[] = [
      ...priorBalanceSheet.assets.current.map((item) => ({
        account: item.account,
        description: item.description,
        balanceCents: item.amountCents,
        asAtDate: dayBeforePeriodStart,
      })),
      ...priorBalanceSheet.assets.nonCurrent.map((item) => ({
        account: item.account,
        description: item.description,
        balanceCents: item.amountCents,
        asAtDate: dayBeforePeriodStart,
      })),
    ];

    const liabilities: OpeningBalance[] = [
      ...priorBalanceSheet.liabilities.current.map((item) => ({
        account: item.account,
        description: item.description,
        balanceCents: item.amountCents,
        asAtDate: dayBeforePeriodStart,
      })),
      ...priorBalanceSheet.liabilities.nonCurrent.map((item) => ({
        account: item.account,
        description: item.description,
        balanceCents: item.amountCents,
        asAtDate: dayBeforePeriodStart,
      })),
    ];

    const equity: OpeningBalance[] = priorBalanceSheet.equity.items.map(
      (item) => ({
        account: item.account,
        description: item.description,
        balanceCents: item.amountCents,
        asAtDate: dayBeforePeriodStart,
      }),
    );

    // Add retained earnings as an equity item
    equity.push({
      account: '3210',
      description: 'Retained Earnings',
      balanceCents: priorBalanceSheet.equity.retainedEarningsCents,
      asAtDate: dayBeforePeriodStart,
    });

    return {
      tenantId,
      periodStartDate,
      assets,
      liabilities,
      equity,
      totalAssetsCents: priorBalanceSheet.totalAssetsCents,
      totalLiabilitiesCents: priorBalanceSheet.liabilities.totalCents,
      totalEquityCents: priorBalanceSheet.equity.totalCents,
    };
  }

  /**
   * Calculate asset variances between periods
   */
  private calculateAssetVariances(
    currentAssets: LineItem[],
    currentNonCurrent: LineItem[],
    priorAssets: LineItem[],
    priorNonCurrent: LineItem[],
  ): AssetVariances {
    const currentVariances = this.calculateLineItemVariances(
      currentAssets,
      priorAssets,
    );
    const nonCurrentVariances = this.calculateLineItemVariances(
      currentNonCurrent,
      priorNonCurrent,
    );

    const totalCurrentVarianceCents = currentVariances.reduce(
      (sum, v) => sum + v.varianceCents,
      0,
    );
    const totalNonCurrentVarianceCents = nonCurrentVariances.reduce(
      (sum, v) => sum + v.varianceCents,
      0,
    );

    return {
      current: currentVariances,
      nonCurrent: nonCurrentVariances,
      totalCurrentVarianceCents,
      totalNonCurrentVarianceCents,
      totalVarianceCents:
        totalCurrentVarianceCents + totalNonCurrentVarianceCents,
    };
  }

  /**
   * Calculate liability variances between periods
   */
  private calculateLiabilityVariances(
    currentLiabilities: LineItem[],
    currentNonCurrent: LineItem[],
    priorLiabilities: LineItem[],
    priorNonCurrent: LineItem[],
  ): LiabilityVariances {
    const currentVariances = this.calculateLineItemVariances(
      currentLiabilities,
      priorLiabilities,
    );
    const nonCurrentVariances = this.calculateLineItemVariances(
      currentNonCurrent,
      priorNonCurrent,
    );

    const totalCurrentVarianceCents = currentVariances.reduce(
      (sum, v) => sum + v.varianceCents,
      0,
    );
    const totalNonCurrentVarianceCents = nonCurrentVariances.reduce(
      (sum, v) => sum + v.varianceCents,
      0,
    );

    return {
      current: currentVariances,
      nonCurrent: nonCurrentVariances,
      totalCurrentVarianceCents,
      totalNonCurrentVarianceCents,
      totalVarianceCents:
        totalCurrentVarianceCents + totalNonCurrentVarianceCents,
    };
  }

  /**
   * Calculate equity variances between periods
   */
  private calculateEquityVariances(
    currentItems: LineItem[],
    currentRetainedCents: number,
    priorItems: LineItem[],
    priorRetainedCents: number,
  ): EquityVariances {
    const itemVariances = this.calculateLineItemVariances(
      currentItems,
      priorItems,
    );

    const retainedEarningsVarianceCents = new Decimal(currentRetainedCents)
      .minus(priorRetainedCents)
      .toNumber();

    const totalVarianceCents =
      itemVariances.reduce((sum, v) => sum + v.varianceCents, 0) +
      retainedEarningsVarianceCents;

    return {
      items: itemVariances,
      retainedEarningsVarianceCents,
      totalVarianceCents,
    };
  }

  /**
   * Calculate variances for a list of line items
   */
  private calculateLineItemVariances(
    currentItems: LineItem[],
    priorItems: LineItem[],
  ): VarianceItem[] {
    const allAccounts = new Set<string>();
    currentItems.forEach((item) => allAccounts.add(item.account));
    priorItems.forEach((item) => allAccounts.add(item.account));

    const variances: VarianceItem[] = [];

    for (const account of allAccounts) {
      const currentItem = currentItems.find((i) => i.account === account);
      const priorItem = priorItems.find((i) => i.account === account);

      const currentAmountCents = currentItem?.amountCents ?? 0;
      const priorAmountCents = priorItem?.amountCents ?? 0;

      const varianceCents = new Decimal(currentAmountCents)
        .minus(priorAmountCents)
        .toNumber();

      // Calculate variance percentage (avoid division by zero)
      let variancePercent = 0;
      if (priorAmountCents !== 0) {
        variancePercent = new Decimal(varianceCents)
          .div(Math.abs(priorAmountCents))
          .mul(100)
          .toDecimalPlaces(2)
          .toNumber();
      } else if (currentAmountCents !== 0) {
        // If prior was 0 but current is not, show as 100% increase
        variancePercent = 100;
      }

      // Get description from current or prior item
      const description =
        currentItem?.description ?? priorItem?.description ?? account;

      variances.push({
        account,
        description,
        currentAmountCents,
        priorAmountCents,
        varianceCents,
        variancePercent,
      });
    }

    // Sort by account code
    return variances.sort((a, b) => a.account.localeCompare(b.account));
  }

  /**
   * Check Section 4.2 - Minimum line items required
   */
  private checkSection42MinimumLineItems(
    balanceSheet: BalanceSheet,
  ): IFRSCheckResult[] {
    const results: IFRSCheckResult[] = [];

    // Check for cash or cash equivalents
    const hasCash =
      balanceSheet.assets.current.some(
        (item) =>
          item.description.toLowerCase().includes('cash') ||
          item.description.toLowerCase().includes('bank'),
      ) || balanceSheet.assets.totalCurrentCents > 0;

    results.push({
      section: 'Section 4.2(a)',
      requirement: 'Cash and cash equivalents must be presented',
      passed: hasCash,
      details: hasCash
        ? 'Cash/bank accounts found in current assets'
        : 'No cash or bank accounts found',
    });

    // Check for trade receivables
    const hasReceivables = balanceSheet.assets.current.some(
      (item) =>
        item.description.toLowerCase().includes('receivable') ||
        item.description.toLowerCase().includes('debtor'),
    );

    results.push({
      section: 'Section 4.2(b)',
      requirement: 'Trade and other receivables must be presented if material',
      passed: hasReceivables || balanceSheet.assets.totalCurrentCents === 0,
      details: hasReceivables
        ? 'Trade receivables found'
        : 'No trade receivables (may be acceptable if none exist)',
    });

    // Check for trade payables
    const hasPayables = balanceSheet.liabilities.current.some(
      (item) =>
        item.description.toLowerCase().includes('payable') ||
        item.description.toLowerCase().includes('creditor'),
    );

    results.push({
      section: 'Section 4.2(g)',
      requirement: 'Trade and other payables must be presented if material',
      passed: hasPayables || balanceSheet.liabilities.totalCurrentCents === 0,
      details: hasPayables
        ? 'Trade payables found'
        : 'No trade payables (may be acceptable if none exist)',
    });

    // Check for equity
    const hasEquity =
      balanceSheet.equity.items.length > 0 ||
      balanceSheet.equity.retainedEarningsCents !== 0;

    results.push({
      section: 'Section 4.2(p)',
      requirement: 'Equity must be presented',
      passed: hasEquity || balanceSheet.equity.totalCents !== 0,
      details: hasEquity
        ? 'Equity accounts found'
        : 'No equity presented (may indicate data issue)',
    });

    return results;
  }

  /**
   * Check Section 4.4-4.8 - Current/Non-current classification
   */
  private checkSection44CurrentNonCurrentClassification(
    balanceSheet: BalanceSheet,
  ): IFRSCheckResult[] {
    const results: IFRSCheckResult[] = [];

    // Check assets are classified
    const totalAssets =
      balanceSheet.assets.current.length +
      balanceSheet.assets.nonCurrent.length;
    const assetsClassified =
      totalAssets === 0 ||
      balanceSheet.assets.totalCents ===
        balanceSheet.assets.totalCurrentCents +
          balanceSheet.assets.totalNonCurrentCents;

    results.push({
      section: 'Section 4.4-4.5',
      requirement: 'Assets must be classified as current or non-current',
      passed: assetsClassified,
      details: assetsClassified
        ? 'All assets are properly classified'
        : 'Asset classification totals do not reconcile',
    });

    // Check liabilities are classified
    const totalLiabilities =
      balanceSheet.liabilities.current.length +
      balanceSheet.liabilities.nonCurrent.length;
    const liabilitiesClassified =
      totalLiabilities === 0 ||
      balanceSheet.liabilities.totalCents ===
        balanceSheet.liabilities.totalCurrentCents +
          balanceSheet.liabilities.totalNonCurrentCents;

    results.push({
      section: 'Section 4.7-4.8',
      requirement: 'Liabilities must be classified as current or non-current',
      passed: liabilitiesClassified,
      details: liabilitiesClassified
        ? 'All liabilities are properly classified'
        : 'Liability classification totals do not reconcile',
    });

    return results;
  }

  /**
   * Check Section 4.11 - Materiality threshold
   */
  private checkSection411Materiality(
    balanceSheet: BalanceSheet,
  ): IFRSCheckResult[] {
    const results: IFRSCheckResult[] = [];

    // Skip if no assets
    if (balanceSheet.totalAssetsCents === 0) {
      results.push({
        section: 'Section 4.11',
        requirement: 'Line items should be material (>5% of total assets)',
        passed: true,
        details: 'No assets to evaluate materiality',
      });
      return results;
    }

    const materialityThresholdCents = new Decimal(balanceSheet.totalAssetsCents)
      .mul(MATERIALITY_THRESHOLD_PERCENT)
      .div(100)
      .toNumber();

    // Check for immaterial line items
    const immaterialItems: string[] = [];

    [...balanceSheet.assets.current, ...balanceSheet.assets.nonCurrent].forEach(
      (item) => {
        if (Math.abs(item.amountCents) < materialityThresholdCents) {
          immaterialItems.push(`${item.account}: ${item.description}`);
        }
      },
    );

    const hasImmaterialItems = immaterialItems.length > 0;

    results.push({
      section: 'Section 4.11',
      requirement: `Line items should be material (>${MATERIALITY_THRESHOLD_PERCENT}% of total assets = ${materialityThresholdCents}c)`,
      passed: !hasImmaterialItems,
      details: hasImmaterialItems
        ? `${immaterialItems.length} items below materiality threshold may need aggregation: ${immaterialItems.slice(0, 3).join(', ')}${immaterialItems.length > 3 ? '...' : ''}`
        : 'All line items are above materiality threshold',
    });

    return results;
  }

  /**
   * Generate notes based on variances and compliance
   */
  private generateNotes(
    variances: BalanceSheetVariances,
    complianceStatus: IFRSComplianceStatus,
  ): BalanceSheetNote[] {
    const notes: BalanceSheetNote[] = [];

    // Add notes for significant variances (>20%)
    const significantVarianceThreshold = 20;

    // Check asset variances
    const significantAssetChanges = [
      ...variances.assets.current,
      ...variances.assets.nonCurrent,
    ].filter(
      (v) => Math.abs(v.variancePercent) >= significantVarianceThreshold,
    );

    if (significantAssetChanges.length > 0) {
      notes.push({
        section: 'assets',
        title: 'Significant Asset Changes',
        content: significantAssetChanges
          .map(
            (v) =>
              `${v.description}: ${v.variancePercent > 0 ? '+' : ''}${v.variancePercent.toFixed(1)}% (${this.formatCents(v.varianceCents)})`,
          )
          .join('; '),
        referenceCode: 'NOTE-ASSET-VAR',
      });
    }

    // Check liability variances
    const significantLiabilityChanges = [
      ...variances.liabilities.current,
      ...variances.liabilities.nonCurrent,
    ].filter(
      (v) => Math.abs(v.variancePercent) >= significantVarianceThreshold,
    );

    if (significantLiabilityChanges.length > 0) {
      notes.push({
        section: 'liabilities',
        title: 'Significant Liability Changes',
        content: significantLiabilityChanges
          .map(
            (v) =>
              `${v.description}: ${v.variancePercent > 0 ? '+' : ''}${v.variancePercent.toFixed(1)}% (${this.formatCents(v.varianceCents)})`,
          )
          .join('; '),
        referenceCode: 'NOTE-LIAB-VAR',
      });
    }

    // Check equity variances
    if (
      Math.abs(variances.equity.retainedEarningsVarianceCents) > 0 ||
      variances.equity.items.some(
        (v) => Math.abs(v.variancePercent) >= significantVarianceThreshold,
      )
    ) {
      notes.push({
        section: 'equity',
        title: 'Equity Movement',
        content: `Retained earnings changed by ${this.formatCents(variances.equity.retainedEarningsVarianceCents)}`,
        referenceCode: 'NOTE-EQUITY-VAR',
      });
    }

    // Add compliance warnings as notes
    if (!complianceStatus.isCompliant) {
      const failedChecks = complianceStatus.checkedSections.filter(
        (c) => !c.passed,
      );
      notes.push({
        section: 'general',
        title: 'IFRS Compliance Issues',
        content: failedChecks
          .map((c) => `${c.section}: ${c.requirement}`)
          .join('; '),
        referenceCode: 'NOTE-IFRS-COMPLIANCE',
      });
    }

    return notes;
  }

  /**
   * Format cents as currency string
   */
  private formatCents(cents: number): string {
    const rands = new Decimal(cents).div(100).toFixed(2);
    return `R${cents >= 0 ? '' : '-'}${Math.abs(Number(rands)).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  }
}
