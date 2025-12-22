import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
});

/**
 * Money utility class for all financial calculations in CrecheBooks.
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 *
 * IMPORTANT: All amounts are stored in CENTS (integer) in the database.
 * This class handles conversion between cents (storage) and Rands (display).
 */
export class Money {
  /**
   * Convert cents (integer) to Rands (Decimal)
   * @param cents - Amount in cents (e.g., 12345 = R123.45)
   */
  static fromCents(cents: number): Decimal {
    if (!Number.isInteger(cents)) {
      throw new Error(`Cents must be an integer, received: ${cents}`);
    }
    return new Decimal(cents).dividedBy(100);
  }

  /**
   * Convert Rands (Decimal) to cents (integer)
   * Uses banker's rounding
   * @param amount - Amount in Rands (e.g., R123.45)
   */
  static toCents(amount: Decimal): number {
    return amount.times(100).round().toNumber();
  }

  /**
   * Add two Decimal amounts
   */
  static add(a: Decimal, b: Decimal): Decimal {
    return a.plus(b);
  }

  /**
   * Subtract b from a
   */
  static subtract(a: Decimal, b: Decimal): Decimal {
    return a.minus(b);
  }

  /**
   * Multiply two Decimal amounts
   */
  static multiply(a: Decimal, b: Decimal): Decimal {
    return a.times(b);
  }

  /**
   * Divide a by b
   * @throws Error if dividing by zero
   */
  static divide(a: Decimal, b: Decimal): Decimal {
    if (b.isZero()) {
      throw new Error('Cannot divide by zero');
    }
    return a.dividedBy(b);
  }

  /**
   * Round to 2 decimal places using banker's rounding
   */
  static round(value: Decimal): Decimal {
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  }

  /**
   * Calculate percentage of an amount
   * @param amount - Base amount
   * @param percentage - Percentage as decimal (e.g., 0.15 for 15%)
   */
  static percentage(amount: Decimal, percentage: number): Decimal {
    return amount.times(percentage);
  }

  /**
   * Calculate VAT from gross amount (VAT-inclusive)
   * @param grossAmount - Amount including VAT
   * @param vatRate - VAT rate as decimal (default 0.15 for 15%)
   */
  static extractVAT(grossAmount: Decimal, vatRate: number = 0.15): Decimal {
    // VAT = Gross / (1 + rate) * rate
    return grossAmount.dividedBy(1 + vatRate).times(vatRate);
  }

  /**
   * Calculate VAT to add to net amount (VAT-exclusive)
   * @param netAmount - Amount excluding VAT
   * @param vatRate - VAT rate as decimal (default 0.15 for 15%)
   */
  static calculateVAT(netAmount: Decimal, vatRate: number = 0.15): Decimal {
    return netAmount.times(vatRate);
  }

  /**
   * Format amount for display (South African Rand)
   * @param amount - Amount in Rands
   */
  static format(amount: Decimal): string {
    return `R ${amount.toFixed(2)}`;
  }

  /**
   * Create a new Decimal from a number or string
   */
  static from(value: number | string): Decimal {
    return new Decimal(value);
  }

  /**
   * Check if two amounts are equal
   */
  static equals(a: Decimal, b: Decimal): boolean {
    return a.equals(b);
  }

  /**
   * Check if a is greater than b
   */
  static isGreaterThan(a: Decimal, b: Decimal): boolean {
    return a.greaterThan(b);
  }

  /**
   * Check if a is less than b
   */
  static isLessThan(a: Decimal, b: Decimal): boolean {
    return a.lessThan(b);
  }

  /**
   * Check if amount is zero
   */
  static isZero(amount: Decimal): boolean {
    return amount.isZero();
  }

  /**
   * Check if amount is negative
   */
  static isNegative(amount: Decimal): boolean {
    return amount.isNegative();
  }
}

// Re-export Decimal type for convenience
export { Decimal };
