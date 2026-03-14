/**
 * Mapping from CrecheBooks account codes to Stub.africa category names.
 *
 * Stub uses simple predefined category names (no numbered codes).
 * This map translates our Chart of Accounts codes to the closest
 * Stub category for push operations.
 *
 * Stub Income categories:
 *   Sales, Interest Earned, Tips & Donations, Refunds,
 *   Asset Sales, Asset Disposal, Foreign Exchange, Write Offs
 *
 * Stub Expense categories:
 *   Advertising & Marketing, Bank Charges, Cleaning, Contract Workers,
 *   Cost of Goods Sold, Deliveries & Shipping, Depreciation, Donations,
 *   Equipment Rental, Fines & Penalties, Fuel, Garden Services, Gifts,
 *   Insurance, Interest Paid, Internet & Phone, Meals & Entertainment,
 *   Medical, Merchant Fees, Office Supplies, Packaging, Professional Fees,
 *   Rent, Repairs & Maintenance, Salaries & Wages, Software & Subscriptions,
 *   Training & Education, Travel, Utilities
 */

// -- INCOME codes → Stub income category --
const INCOME_MAP: Record<string, string> = {
  // Fee Income (41xx) → Sales
  '4110': 'Sales',        // Monthly Tuition Fees
  '4115': 'Sales',        // Registration Fees
  '4120': 'Sales',        // Activity Fees
  '4125': 'Sales',        // Transport Fees
  '4130': 'Sales',        // After Care Fees
  '4135': 'Sales',        // Holiday Program Fees

  // Subsidies & Grants (42xx) → Sales
  '4210': 'Sales',        // Provincial ECD Subsidy
  '4215': 'Sales',        // Municipal ECD Grant
  '4220': 'Sales',        // National School Nutrition Grant
  '4225': 'Sales',        // School Trip Income

  // Donations (43xx) → Tips & Donations
  '4310': 'Tips & Donations', // Cash Donations
  '4315': 'Tips & Donations', // In-Kind Donations
  '4320': 'Tips & Donations', // Corporate Sponsorships
  '4325': 'Tips & Donations', // Fundraising Events

  // Merchandise Sales (44xx) → Sales
  '4410': 'Sales',        // Uniform Sales
  '4415': 'Sales',        // Book Sales
  '4420': 'Sales',        // Stationery Sales

  // Interest (45xx) → Interest Earned
  '4510': 'Interest Earned', // Interest Income - Bank
};

// -- EXPENSE codes → Stub expense category --
const EXPENSE_MAP: Record<string, string> = {
  // Salaries & Benefits (51xx) → Salaries & Wages
  '5100': 'Salaries & Wages', // Overtime Pay
  '5110': 'Salaries & Wages', // Principal Salary
  '5115': 'Salaries & Wages', // Teacher Salaries
  '5120': 'Salaries & Wages', // Assistant Teacher Salaries
  '5125': 'Salaries & Wages', // Administrative Staff Salaries
  '5130': 'Salaries & Wages', // Kitchen Staff Salaries
  '5135': 'Salaries & Wages', // Cleaning Staff Salaries
  '5210': 'Salaries & Wages', // Medical Aid Contributions
  '5215': 'Salaries & Wages', // Pension Fund Contributions
  '5220': 'Salaries & Wages', // UIF Contributions
  '5225': 'Salaries & Wages', // WCA Contributions
  '5230': 'Salaries & Wages', // SDL Contributions
  '5240': 'Salaries & Wages', // Staff Bonuses

  // Training (53xx) → Training & Education
  '5310': 'Training & Education', // Training Course Fees
  '5315': 'Training & Education', // Conference Attendance

  // Educational Supplies (61xx) → Cost of Goods Sold
  '6110': 'Cost of Goods Sold', // Textbooks and Workbooks
  '6115': 'Cost of Goods Sold', // Art and Craft Supplies
  '6120': 'Cost of Goods Sold', // Educational Toys and Games
  '6135': 'Software & Subscriptions', // Technology and Software
  '6140': 'Cost of Goods Sold', // Library Books

  // Events & Activities (62xx) → Meals & Entertainment
  '6210': 'Meals & Entertainment', // Field Trip Expenses
  '6215': 'Professional Fees',     // Guest Speaker Fees
  '6260': 'Meals & Entertainment', // Graduation Expenses

  // Food & Nutrition (63xx) → Cost of Goods Sold
  '6310': 'Cost of Goods Sold', // Food Purchases
  '6315': 'Cost of Goods Sold', // Kitchen Supplies

  // Health & Safety (64xx) → Medical / Cleaning
  '6410': 'Medical',    // First Aid Supplies
  '6415': 'Cleaning',   // Safety Equipment
  '6425': 'Cleaning',   // Cleaning Supplies

  // Premises & Facilities (65xx-66xx) → Rent / Utilities / Repairs
  '6510': 'Cost of Goods Sold', // Cost of Uniforms Sold
  '6520': 'Rent',               // Rent - Building
  '6525': 'Utilities',          // Electricity
  '6530': 'Utilities',          // Water and Sewer
  '6540': 'Utilities',          // Refuse Collection
  '6545': 'Insurance',          // Security Services
  '6610': 'Repairs & Maintenance', // Building Maintenance
  '6615': 'Repairs & Maintenance', // Plumbing Repairs
  '6620': 'Repairs & Maintenance', // Electrical Repairs
  '6635': 'Repairs & Maintenance', // Equipment Repairs

  // Insurance (67xx) → Insurance
  '6710': 'Insurance',  // Property Insurance
  '6715': 'Insurance',  // Property Taxes

  // General wages (70xx) → Salaries & Wages
  '7010': 'Salaries & Wages', // Wages and Salaries

  // Office & Admin (71xx) → Office Supplies / Software
  '7110': 'Office Supplies',          // Stationery Supplies
  '7115': 'Office Supplies',          // Printing and Photocopying
  '7125': 'Internet & Phone',         // Telephone and Internet
  '7135': 'Software & Subscriptions', // Computer Software

  // Professional (72xx) → Professional Fees
  '7210': 'Professional Fees', // Accounting Fees
  '7215': 'Professional Fees', // Audit Fees
  '7220': 'Professional Fees', // Legal Fees
  '7230': 'Professional Fees', // Payroll Processing

  // Marketing (73xx) → Advertising & Marketing
  '7310': 'Advertising & Marketing', // Advertising Costs
  '7315': 'Software & Subscriptions', // Website Maintenance
  '7320': 'Advertising & Marketing', // Brochures and Flyers

  // Compliance (74xx) → Professional Fees
  '7410': 'Professional Fees', // License Fees
  '7415': 'Professional Fees', // Registration Fees

  // Vehicle (75xx) → Fuel / Travel
  '7520': 'Fuel',                // Vehicle Fuel
  '7525': 'Insurance',           // Vehicle Insurance
  '7530': 'Repairs & Maintenance', // Vehicle Maintenance
  '7531': 'Bank Charges',        // Cash Withdrawals

  // Insurance (76xx) → Insurance
  '7610': 'Insurance', // Public Liability Insurance
  '7615': 'Insurance', // Professional Indemnity Insurance

  // Financial (77xx) → Bank Charges / Interest
  '7710': 'Bank Charges',  // Bank Charges
  '7715': 'Merchant Fees', // Credit Card Fees
  '7720': 'Interest Paid', // Interest on Overdraft
  '7725': 'Interest Paid', // Loan Interest

  // Miscellaneous (78xx)
  '7810': 'Software & Subscriptions', // Subscriptions and Memberships
  '7820': 'Cost of Goods Sold',       // Bad Debts Written Off

  // Equity/Other
  '3020': 'Sales', // Founder Capital (mapped to generic)
  '9999': 'Cost of Goods Sold', // To Be Categorized
};

/**
 * Get Stub category name for a CrecheBooks account code.
 * Returns the mapped category, or a sensible default.
 */
export function getStubCategory(accountCode: string, isCredit: boolean): string {
  // Try exact match
  const incomeMatch = INCOME_MAP[accountCode];
  if (incomeMatch) return incomeMatch;

  const expenseMatch = EXPENSE_MAP[accountCode];
  if (expenseMatch) return expenseMatch;

  // Fallback by prefix
  if (accountCode.startsWith('4')) return 'Sales';
  if (accountCode.startsWith('5')) return 'Salaries & Wages';
  if (accountCode.startsWith('6')) return 'Cost of Goods Sold';
  if (accountCode.startsWith('7')) return 'Office Supplies';

  // Last resort
  return isCredit ? 'Sales' : 'Cost of Goods Sold';
}

/**
 * Full mapping for reference/display.
 */
export const STUB_CATEGORY_MAP = { ...INCOME_MAP, ...EXPENSE_MAP };
