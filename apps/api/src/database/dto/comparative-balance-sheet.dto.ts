/**
 * Comparative Balance Sheet DTOs
 * TASK-RECON-036: Complete Balance Sheet Implementation
 *
 * @description Provides comparative balance sheet with variance analysis
 * and IFRS for SMEs compliance checking (Section 4)
 */
import { BalanceSheet } from './balance-sheet.dto';

/**
 * Balance sheet note for disclosures
 */
export interface BalanceSheetNote {
  section: 'assets' | 'liabilities' | 'equity' | 'general';
  title: string;
  content: string;
  referenceCode?: string;
}

/**
 * IFRS compliance check result for a specific section
 */
export interface IFRSCheckResult {
  section: string;
  requirement: string;
  passed: boolean;
  details?: string;
}

/**
 * IFRS for SMEs compliance status
 */
export interface IFRSComplianceStatus {
  isCompliant: boolean;
  checkedSections: IFRSCheckResult[];
  warnings: string[];
}

/**
 * Variance item showing change between periods
 */
export interface VarianceItem {
  account: string;
  description: string;
  currentAmountCents: number;
  priorAmountCents: number;
  varianceCents: number;
  variancePercent: number;
}

/**
 * Asset variances with current and non-current breakdown
 */
export interface AssetVariances {
  current: VarianceItem[];
  nonCurrent: VarianceItem[];
  totalCurrentVarianceCents: number;
  totalNonCurrentVarianceCents: number;
  totalVarianceCents: number;
}

/**
 * Liability variances with current and non-current breakdown
 */
export interface LiabilityVariances {
  current: VarianceItem[];
  nonCurrent: VarianceItem[];
  totalCurrentVarianceCents: number;
  totalNonCurrentVarianceCents: number;
  totalVarianceCents: number;
}

/**
 * Equity variances
 */
export interface EquityVariances {
  items: VarianceItem[];
  retainedEarningsVarianceCents: number;
  totalVarianceCents: number;
}

/**
 * Balance sheet variances structure
 */
export interface BalanceSheetVariances {
  assets: AssetVariances;
  liabilities: LiabilityVariances;
  equity: EquityVariances;
}

/**
 * Opening balance entry for period continuity check
 */
export interface OpeningBalance {
  account: string;
  description: string;
  balanceCents: number;
  asAtDate: Date;
}

/**
 * Opening balances response
 */
export interface OpeningBalancesResult {
  tenantId: string;
  periodStartDate: Date;
  assets: OpeningBalance[];
  liabilities: OpeningBalance[];
  equity: OpeningBalance[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  totalEquityCents: number;
}

/**
 * Comparative Balance Sheet with two periods
 */
export interface ComparativeBalanceSheet {
  currentPeriod: BalanceSheet;
  priorPeriod: BalanceSheet;
  variances: BalanceSheetVariances;
  notes: BalanceSheetNote[];
  complianceStatus: IFRSComplianceStatus;
}

/**
 * API response wrapper for comparative balance sheet
 */
export interface ComparativeBalanceSheetResponse {
  success: boolean;
  data: ComparativeBalanceSheet;
}
