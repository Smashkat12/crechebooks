/**
 * South African Chart of Accounts structure
 * Based on IFRS for SMEs
 *
 * @module database/constants/chart-of-accounts
 * @description Standard Chart of Accounts ranges and helpers for South African accounting
 */

export const ACCOUNT_RANGES = {
  ASSETS: { start: 1000, end: 1999 },
  CURRENT_ASSETS: { start: 1000, end: 1499 },
  NON_CURRENT_ASSETS: { start: 1500, end: 1999 },
  LIABILITIES: { start: 2000, end: 2999 },
  CURRENT_LIABILITIES: { start: 2000, end: 2499 },
  NON_CURRENT_LIABILITIES: { start: 2500, end: 2999 },
  EQUITY: { start: 3000, end: 3999 },
  INCOME: { start: 4000, end: 4999 },
  EXPENSES: { start: 5000, end: 8999 },
};

/**
 * Default accounts aligned with Xero Chart of Accounts
 * Codes verified from Think M8 ECD Xero export (Jan 2026)
 */
export const DEFAULT_ACCOUNTS = {
  // Bank Accounts
  PETTY_CASH: { code: '1010', name: 'Petty Cash' },
  CASH_ON_HAND: { code: '1020', name: 'Cash on Hand' },
  SAVINGS_ACCOUNT: { code: '1035', name: 'Standard Bank Savings Account' },

  // Receivables
  ACCOUNTS_RECEIVABLE: { code: '610', name: 'Accounts Receivable' },
  PARENT_FEE_RECEIVABLE: { code: '1110', name: 'Parent Fee Receivables' },
  GOVT_SUBSIDY_RECEIVABLE: {
    code: '1115',
    name: 'Government Subsidy Receivables',
  },
  FUNDRAISING_RECEIVABLE: { code: '1120', name: 'Fundraising Receivables' },
  STAFF_ADVANCE_RECEIVABLE: { code: '1130', name: 'Staff Advance Receivables' },

  // VAT Accounts
  VAT_INPUT: { code: '1410', name: 'VAT Input Tax' },
  VAT_OUTPUT: { code: '2230', name: 'VAT Output Tax' },
  VAT_SETTLEMENT: { code: '820', name: 'VAT' },

  // Prepayments
  PREPAID_INSURANCE: { code: '1310', name: 'Prepaid Insurance' },
  PREPAID_RENT: { code: '1315', name: 'Prepaid Rent' },
  PREPAID_UTILITIES: { code: '1320', name: 'Prepaid Utilities' },
  PREPAID_SOFTWARE: { code: '1325', name: 'Prepaid Software Licenses' },

  // Fixed Assets
  FURNITURE_FIXTURES: { code: '1540', name: 'Furniture and Fixtures' },
  EDUCATIONAL_EQUIPMENT: { code: '1545', name: 'Educational Equipment' },
  COMPUTER_EQUIPMENT: { code: '1550', name: 'Computer Equipment' },
  KITCHEN_EQUIPMENT: { code: '1555', name: 'Kitchen Equipment' },
  MOTOR_VEHICLES: { code: '1565', name: 'Motor Vehicles' },

  // Accounts Payable
  ACCOUNTS_PAYABLE: { code: '800', name: 'Accounts Payable' },
  AP_FOOD_SUPPLIERS: {
    code: '2025',
    name: 'Accounts Payable - Food Suppliers',
  },
  AP_EDUCATIONAL: {
    code: '2030',
    name: 'Accounts Payable - Educational Suppliers',
  },
  AP_UTILITIES: { code: '2035', name: 'Accounts Payable - Utilities' },

  // Payroll Liabilities (Actual Xero Codes)
  ACCRUED_SALARIES: { code: '2110', name: 'Accrued Salaries and Wages' },
  ACCRUED_LEAVE: { code: '2115', name: 'Accrued Leave Pay' },
  PAYE_PAYABLE: { code: '2210', name: 'PAYE Payable' },
  UIF_PAYABLE: { code: '2215', name: 'UIF Payable' },
  SDL_PAYABLE: { code: '2220', name: 'SDL Payable' },
  WCA_PAYABLE: { code: '2225', name: 'WCA Payable' },
  PENSION_PAYABLE: { code: '2415', name: 'Staff Pension Fund Payable' },
  MEDICAL_AID_PAYABLE: {
    code: '2420',
    name: 'Medical Aid Contributions Payable',
  },
  NET_PAY_CLEARING: { code: '803', name: 'Wages Payable' },

  // Income in Advance (Liabilities)
  PREPAID_TUITION: { code: '2310', name: 'Prepaid Tuition Fees' },
  PREPAID_REGISTRATION: { code: '2315', name: 'Prepaid Registration Fees' },
  PREPAID_ACTIVITY: { code: '2320', name: 'Prepaid Activity Fees' },
  PARENT_DEPOSITS: { code: '2410', name: 'Parent Deposits Held' },

  // Equity
  FOUNDER_CAPITAL: { code: '3020', name: 'Founder Capital' },
  GOVT_GRANTS_CAPITAL: { code: '3030', name: 'Government Grants - Capital' },
  RETAINED_EARNINGS: { code: '3210', name: 'Retained Earnings' },

  // Revenue - School Fees (Actual Xero Codes)
  SCHOOL_FEES: { code: '4110', name: 'Monthly Tuition Fees' },
  REGISTRATION_FEES: { code: '4115', name: 'Registration Fees' },
  ACTIVITY_FEES: { code: '4120', name: 'Activity Fees' },
  TRANSPORT_FEES: { code: '4125', name: 'Transport Fees' },
  AFTER_CARE_FEES: { code: '4130', name: 'After Care Fees' },
  HOLIDAY_PROGRAM_FEES: { code: '4135', name: 'Holiday Program Fees' },

  // Revenue - Government Subsidies
  PROVINCIAL_SUBSIDY: { code: '4210', name: 'Provincial ECD Subsidy' },
  MUNICIPAL_GRANT: { code: '4215', name: 'Municipal ECD Grant' },
  NUTRITION_GRANT: { code: '4220', name: 'National School Nutrition Grant' },

  // Revenue - Donations & Fundraising
  CASH_DONATIONS: { code: '4310', name: 'Cash Donations' },
  INKIND_DONATIONS: { code: '4315', name: 'In-Kind Donations' },
  CORPORATE_SPONSORSHIPS: { code: '4320', name: 'Corporate Sponsorships' },
  FUNDRAISING_EVENTS: { code: '4325', name: 'Fundraising Events' },

  // Revenue - Sales (Actual Xero Codes)
  UNIFORM_SALES: { code: '4410', name: 'Uniform Sales' },
  BOOK_SALES: { code: '4415', name: 'Book Sales' },
  STATIONERY_SALES: { code: '4420', name: 'Stationery Sales' }, // To be created in Xero
  SCHOOL_TRIP_INCOME: { code: '4225', name: 'School Trip Income' }, // To be created in Xero

  // Revenue - Other
  INTEREST_INCOME: { code: '4510', name: 'Interest Income - Bank' },

  // Payroll Expenses (Actual Xero Codes)
  SALARIES_PRINCIPAL: { code: '5110', name: 'Principal Salary' },
  SALARIES_TEACHERS: { code: '5115', name: 'Teacher Salaries' },
  SALARIES_ASSISTANT: { code: '5120', name: 'Assistant Teacher Salaries' },
  SALARIES_ADMIN: { code: '5125', name: 'Administrative Staff Salaries' },
  SALARIES_KITCHEN: { code: '5130', name: 'Kitchen Staff Salaries' },
  SALARIES_CLEANING: { code: '5135', name: 'Cleaning Staff Salaries' },
  MEDICAL_AID_EXPENSE: { code: '5210', name: 'Medical Aid Contributions' },
  PENSION_EXPENSE: { code: '5215', name: 'Pension Fund Contributions' },
  UIF_EMPLOYER: { code: '5220', name: 'UIF Contributions' },
  WCA_EXPENSE: { code: '5225', name: 'WCA Contributions' },
  SDL_EXPENSE: { code: '5230', name: 'SDL Contributions' },
  BONUSES: { code: '5240', name: 'Staff Bonuses' },
  OVERTIME: { code: '5100', name: 'Overtime Pay' }, // To be created in Xero
  TRAINING_FEES: { code: '5310', name: 'Training Course Fees' },

  // Operating Expenses
  TEXTBOOKS: { code: '6110', name: 'Textbooks and Workbooks' },
  ART_SUPPLIES: { code: '6115', name: 'Art and Craft Supplies' },
  EDUCATIONAL_TOYS: { code: '6120', name: 'Educational Toys and Games' },
  FIELD_TRIPS: { code: '6210', name: 'Field Trip Expenses' },
  FOOD_PURCHASES: { code: '6310', name: 'Food Purchases' },
  KITCHEN_SUPPLIES: { code: '6315', name: 'Kitchen Supplies' },
  FIRST_AID: { code: '6410', name: 'First Aid Supplies' },
  CLEANING_SUPPLIES: { code: '6425', name: 'Cleaning Supplies' },
  UNIFORM_COST: { code: '6510', name: 'Cost of Uniforms Sold' },
  RENT: { code: '6520', name: 'Rent - Building' },
  ELECTRICITY: { code: '6525', name: 'Electricity' },
  WATER: { code: '6530', name: 'Water and Sewer' },
  REFUSE: { code: '6540', name: 'Refuse Collection' },
  SECURITY: { code: '6545', name: 'Security Services' },
  BUILDING_MAINTENANCE: { code: '6610', name: 'Building Maintenance' },
  EQUIPMENT_REPAIRS: { code: '6635', name: 'Equipment Repairs' },
  PROPERTY_INSURANCE: { code: '6710', name: 'Property Insurance' },

  // Admin Expenses
  STATIONERY: { code: '7110', name: 'Stationery Supplies' },
  PRINTING: { code: '7115', name: 'Printing and Photocopying' },
  TELEPHONE_INTERNET: { code: '7125', name: 'Telephone and Internet' },
  ACCOUNTING_FEES: { code: '7210', name: 'Accounting Fees' },
  AUDIT_FEES: { code: '7215', name: 'Audit Fees' },
  LEGAL_FEES: { code: '7220', name: 'Legal Fees' },
  PAYROLL_PROCESSING: { code: '7230', name: 'Payroll Processing' },
  ADVERTISING: { code: '7310', name: 'Advertising Costs' },
  WEBSITE_MAINTENANCE: { code: '7315', name: 'Website Maintenance' },
  LICENSE_FEES: { code: '7410', name: 'License Fees' },
  VEHICLE_FUEL: { code: '7520', name: 'Vehicle Fuel' },
  VEHICLE_INSURANCE: { code: '7525', name: 'Vehicle Insurance' },
  VEHICLE_MAINTENANCE: { code: '7530', name: 'Vehicle Maintenance' },
  PUBLIC_LIABILITY_INS: { code: '7610', name: 'Public Liability Insurance' },
  BANK_CHARGES: { code: '7710', name: 'Bank Charges' },
  CREDIT_CARD_FEES: { code: '7715', name: 'Credit Card Fees' },
  OVERDRAFT_INTEREST: { code: '7720', name: 'Interest on Overdraft' },
  LOAN_INTEREST: { code: '7725', name: 'Loan Interest' },
  SUBSCRIPTIONS: { code: '7810', name: 'Subscriptions and Memberships' },
  BAD_DEBTS: { code: '7820', name: 'Bad Debts Written Off' },
};

export function isIncomeAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.INCOME.start && num <= ACCOUNT_RANGES.INCOME.end;
}

export function isExpenseAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.EXPENSES.start && num <= ACCOUNT_RANGES.EXPENSES.end
  );
}

export function isAssetAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.ASSETS.start && num <= ACCOUNT_RANGES.ASSETS.end;
}

export function isLiabilityAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.LIABILITIES.start &&
    num <= ACCOUNT_RANGES.LIABILITIES.end
  );
}

export function isEquityAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.EQUITY.start && num <= ACCOUNT_RANGES.EQUITY.end;
}

export function isCurrentAsset(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.CURRENT_ASSETS.start &&
    num <= ACCOUNT_RANGES.CURRENT_ASSETS.end
  );
}

export function isNonCurrentAsset(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.NON_CURRENT_ASSETS.start &&
    num <= ACCOUNT_RANGES.NON_CURRENT_ASSETS.end
  );
}

export function isCurrentLiability(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.CURRENT_LIABILITIES.start &&
    num <= ACCOUNT_RANGES.CURRENT_LIABILITIES.end
  );
}

export function isNonCurrentLiability(code: string): boolean {
  const num = parseInt(code, 10);
  return (
    num >= ACCOUNT_RANGES.NON_CURRENT_LIABILITIES.start &&
    num <= ACCOUNT_RANGES.NON_CURRENT_LIABILITIES.end
  );
}
