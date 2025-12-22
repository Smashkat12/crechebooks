/**
 * IRP5 Generation Constants
 * TASK-SARS-016
 *
 * South African employee tax certificate constants.
 * IRP5 codes based on SARS specifications.
 */

/**
 * IRP5 Income Source Codes (3000 series)
 */
export const IRP5_INCOME_CODES = {
  /** Basic salary */
  CODE_3601: '3601',

  /** Overtime payments */
  CODE_3602: '3602',

  /** Commission */
  CODE_3603: '3603',

  /** Taxable allowances */
  CODE_3605: '3605',

  /** Bonus / 13th cheque */
  CODE_3606: '3606',

  /** Annual payment */
  CODE_3607: '3607',

  /** Other taxable income */
  CODE_3608: '3608',

  /** Total income (remuneration) */
  CODE_3615: '3615',
};

/**
 * IRP5 Deduction Codes (3600/3700 series)
 */
export const IRP5_DEDUCTION_CODES = {
  /** PAYE deducted */
  CODE_3696: '3696',

  /** Pension fund contributions (employee) */
  CODE_3701: '3701',

  /** Retirement annuity contributions */
  CODE_3702: '3702',

  /** Provident fund contributions */
  CODE_3703: '3703',

  /** Medical aid contributions (employee) */
  CODE_3713: '3713',

  /** Medical aid tax credits */
  CODE_3714: '3714',

  /** UIF employee contributions */
  CODE_3810: '3810',
};

/**
 * IRP5 Constants
 */
export const IRP5_CONSTANTS = {
  /**
   * Tax year format regex (YYYY)
   */
  TAX_YEAR_FORMAT_REGEX: /^\d{4}$/,

  /**
   * SA ID number format (13 digits)
   */
  SA_ID_NUMBER_REGEX: /^\d{13}$/,

  /**
   * Tax number format (10 digits)
   */
  TAX_NUMBER_REGEX: /^\d{10}$/,

  /**
   * Certificate number max length
   */
  MAX_CERTIFICATE_NUMBER_LENGTH: 50,
};

/**
 * SA tax year constants
 * Tax year runs from March 1 to February 28/29
 */
export const TAX_YEAR_CONFIG = {
  /** First month of tax year (March = 2, 0-indexed) */
  START_MONTH: 2,

  /** Last month of tax year (February = 1, 0-indexed) */
  END_MONTH: 1,

  /** First day of tax year */
  START_DAY: 1,
};
