/**
 * Mapping from CrecheBooks account codes to Stub.africa account names.
 *
 * Stub accounts are now aligned with CrecheBooks/Xero using identical
 * names with the account code in parentheses (e.g. "Monthly Tuition Fees (4110)").
 *
 * For codes without a custom Stub account, falls back to Stub's default categories.
 */

const ACCOUNT_MAP: Record<string, string> = {
  // ── Income (41xx) ──────────────────────────────────────────────
  '4110': 'Monthly Tuition Fees (4110)',
  '4115': 'Registration Fees (4115)',
  '4120': 'Activity Fees (4120)',
  '4125': 'Transport Fees (4125)',
  '4130': 'After Care Fees (4130)',
  '4135': 'Holiday Program Fees (4135)',

  // ── Subsidies & Grants (42xx) ──────────────────────────────────
  '4210': 'Provincial ECD Subsidy (4210)',
  '4215': 'Municipal ECD Grant (4215)',
  '4220': 'National School Nutrition Grant (4220)',
  '4225': 'School Trip Income (4225)',

  // ── Donations (43xx) ───────────────────────────────────────────
  '4310': 'Cash Donations (4310)',
  '4315': 'In-Kind Donations (4315)',
  '4320': 'Corporate Sponsorships (4320)',
  '4325': 'Fundraising Events (4325)',

  // ── Merchandise Sales (44xx) ───────────────────────────────────
  '4410': 'Uniform Sales (4410)',
  '4415': 'Book Sales (4415)',
  '4420': 'Stationery Sales (4420)',

  // ── Interest (45xx) ────────────────────────────────────────────
  '4510': 'Interest Income - Bank (4510)',

  // ── Salaries & Benefits (51xx-52xx) ────────────────────────────
  '5100': 'Overtime Pay (5100)',
  '5110': 'Principal Salary (5110)',
  '5115': 'Teacher Salaries (5115)',
  '5120': 'Assistant Teacher Salaries (5120)',
  '5125': 'Administrative Staff Salaries (5125)',
  '5130': 'Kitchen Staff Salaries (5130)',
  '5135': 'Cleaning Staff Salaries (5135)',
  '5210': 'Medical Aid Contributions (5210)',
  '5215': 'Pension Fund Contributions (5215)',
  '5220': 'UIF Contributions (5220)',
  '5225': 'WCA Contributions (5225)',
  '5230': 'SDL Contributions (5230)',
  '5240': 'Staff Bonuses (5240)',

  // ── Training (53xx) ────────────────────────────────────────────
  '5310': 'Training Course Fees (5310)',
  '5315': 'Conference Attendance (5315)',

  // ── Educational Supplies (61xx) ────────────────────────────────
  '6110': 'Textbooks and Workbooks (6110)',
  '6115': 'Art and Craft Supplies (6115)',
  '6120': 'Educational Toys and Games (6120)',
  '6135': 'Technology and Software (6135)',
  '6140': 'Library Books (6140)',

  // ── Events & Activities (62xx) ─────────────────────────────────
  '6210': 'Field Trip Expenses (6210)',
  '6215': 'Guest Speaker Fees (6215)',
  '6260': 'Graduation Expenses (6260)',

  // ── Food & Nutrition (63xx) ────────────────────────────────────
  '6310': 'Food Purchases (6310)',
  '6315': 'Kitchen Supplies (6315)',

  // ── Health & Safety (64xx) ─────────────────────────────────────
  '6410': 'First Aid Supplies (6410)',
  '6415': 'Safety Equipment (6415)',
  '6425': 'Cleaning Supplies (6425)',

  // ── Premises & Facilities (65xx-66xx) ──────────────────────────
  '6510': 'Cost of Uniforms Sold (6510)',
  '6520': 'Rent - Building (6520)',
  '6525': 'Electricity (6525)',
  '6530': 'Water and Sewer (6530)',
  '6540': 'Refuse Collection (6540)',
  '6545': 'Security Services (6545)',
  '6610': 'Building Maintenance (6610)',
  '6615': 'Plumbing Repairs (6615)',
  '6620': 'Electrical Repairs (6620)',
  '6635': 'Equipment Repairs (6635)',

  // ── Insurance & Property (67xx) ────────────────────────────────
  '6710': 'Property Insurance (6710)',
  '6715': 'Property Taxes (6715)',

  // ── General Wages (70xx) ───────────────────────────────────────
  '7010': 'Wages and Salaries (7010)',

  // ── Office & Admin (71xx) ──────────────────────────────────────
  '7110': 'Stationery Supplies (7110)',
  '7115': 'Printing and Photocopying (7115)',
  '7125': 'Telephone and Internet (7125)',
  '7135': 'Computer Software (7135)',

  // ── Professional Services (72xx) ───────────────────────────────
  '7210': 'Accounting Fees (7210)',
  '7215': 'Audit Fees (7215)',
  '7220': 'Legal Fees (7220)',
  '7230': 'Payroll Processing (7230)',

  // ── Marketing (73xx) ──────────────────────────────────────────
  '7310': 'Advertising Costs (7310)',
  '7315': 'Website Maintenance (7315)',
  '7320': 'Brochures and Flyers (7320)',

  // ── Compliance (74xx) ──────────────────────────────────────────
  '7410': 'License Fees (7410)',
  '7415': 'Registration Fees - Compliance (7415)',

  // ── Vehicle (75xx) ─────────────────────────────────────────────
  '7520': 'Vehicle Fuel (7520)',
  '7525': 'Vehicle Insurance (7525)',
  '7530': 'Vehicle Maintenance (7530)',
  '7531': 'Cash Withdrawals (7531)',

  // ── Liability Insurance (76xx) ─────────────────────────────────
  '7610': 'Public Liability Insurance (7610)',
  '7615': 'Professional Indemnity Insurance (7615)',

  // ── Financial (77xx) ──────────────────────────────────────────
  '7710': 'Bank Charges', // Stub default — no custom needed
  '7715': 'Credit Card Fees (7715)',
  '7720': 'Interest on Overdraft (7720)',
  '7725': 'Loan Interest (7725)',

  // ── Miscellaneous (78xx) ───────────────────────────────────────
  '7810': 'Subscriptions and Memberships (7810)',
  '7820': 'Bad Debts Written Off (7820)',

  // ── Other ──────────────────────────────────────────────────────
  '3020': 'Sales', // Founder Capital → Stub default
  '9999': 'Sales', // To Be Categorized → fallback
};

/**
 * Get Stub category/account name for a CrecheBooks account code.
 */
export function getStubCategory(
  accountCode: string,
  isCredit: boolean,
): string {
  const match = ACCOUNT_MAP[accountCode];
  if (match) return match;

  // Fallback to Stub defaults by prefix
  if (accountCode.startsWith('41')) return 'Sales';
  if (accountCode.startsWith('42')) return 'Sales';
  if (accountCode.startsWith('43')) return 'Tips & Donations';
  if (accountCode.startsWith('44')) return 'Sales';
  if (accountCode.startsWith('45')) return 'Interest Earned';
  if (accountCode.startsWith('5')) return 'Salaries & Wages';
  if (accountCode.startsWith('6')) return 'Cost of Goods Sold';
  if (accountCode.startsWith('7')) return 'Office Supplies';

  return isCredit ? 'Sales' : 'Cost of Goods Sold';
}

export const STUB_CATEGORY_MAP = ACCOUNT_MAP;
