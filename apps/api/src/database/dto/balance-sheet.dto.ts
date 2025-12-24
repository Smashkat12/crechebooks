import Decimal from 'decimal.js';

/**
 * Individual line item on the balance sheet
 */
export interface LineItem {
  account: string;
  description: string;
  amountCents: number; // Store as cents for precision
  amount: Decimal; // For calculations/display
}

/**
 * Asset section with current and non-current classifications
 */
export interface AssetSection {
  current: LineItem[];
  nonCurrent: LineItem[];
  totalCurrentCents: number;
  totalNonCurrentCents: number;
  totalCents: number;
}

/**
 * Liability section with current and non-current classifications
 */
export interface LiabilitySection {
  current: LineItem[];
  nonCurrent: LineItem[];
  totalCurrentCents: number;
  totalNonCurrentCents: number;
  totalCents: number;
}

/**
 * Equity section including retained earnings
 */
export interface EquitySection {
  items: LineItem[];
  retainedEarningsCents: number;
  totalCents: number;
}

/**
 * Complete balance sheet following IFRS for SMEs structure
 */
export interface BalanceSheet {
  asAtDate: Date;
  tenantId: string;
  assets: AssetSection;
  liabilities: LiabilitySection;
  equity: EquitySection;
  totalAssetsCents: number;
  totalLiabilitiesAndEquityCents: number;
  isBalanced: boolean; // Assets = Liabilities + Equity
  generatedAt: Date;
}

/**
 * API response wrapper for balance sheet
 */
export interface BalanceSheetResponse {
  success: boolean;
  data: BalanceSheet;
}
