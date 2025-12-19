import { Money, Decimal } from '../../../src/shared/utils/decimal.util';

describe('Money Utility', () => {
  describe('Banker\'s Rounding (ROUND_HALF_EVEN)', () => {
    // This is CRITICAL for financial compliance
    // Money.round() always rounds to 2 decimal places for currency
    // Banker's rounding: when the digit to round is exactly 5, round to nearest even

    it('should round 2.005 to 2.00 (down to even - 0 is even)', () => {
      const result = Money.round(new Decimal('2.005'));
      expect(result.toNumber()).toBe(2.00);
    });

    it('should round 2.015 to 2.02 (up to even - 2 is even)', () => {
      const result = Money.round(new Decimal('2.015'));
      expect(result.toNumber()).toBe(2.02);
    });

    it('should round 2.025 to 2.02 (down to even - 2 is even)', () => {
      const result = Money.round(new Decimal('2.025'));
      expect(result.toNumber()).toBe(2.02);
    });

    it('should round 2.035 to 2.04 (up to even - 4 is even)', () => {
      const result = Money.round(new Decimal('2.035'));
      expect(result.toNumber()).toBe(2.04);
    });

    it('should round 2.045 to 2.04 (down to even - 4 is even)', () => {
      const result = Money.round(new Decimal('2.045'));
      expect(result.toNumber()).toBe(2.04);
    });

    it('should round 2.055 to 2.06 (up to even - 6 is even)', () => {
      const result = Money.round(new Decimal('2.055'));
      expect(result.toNumber()).toBe(2.06);
    });

    // Additional edge cases
    it('should round 0.005 to 0.00 (banker\'s rounding)', () => {
      const result = Money.round(new Decimal('0.005'));
      expect(result.toNumber()).toBe(0);
    });

    it('should round 0.015 to 0.02 (up to even)', () => {
      const result = Money.round(new Decimal('0.015'));
      expect(result.toNumber()).toBe(0.02);
    });

    it('should round 1.125 to 1.12 (down to even)', () => {
      const result = Money.round(new Decimal('1.125'));
      expect(result.toNumber()).toBe(1.12);
    });

    it('should round 1.135 to 1.14 (up to even)', () => {
      const result = Money.round(new Decimal('1.135'));
      expect(result.toNumber()).toBe(1.14);
    });

    // Negative numbers with banker's rounding to 2 decimal places
    it('should round -2.005 to -2.00 (banker\'s rounding with negatives)', () => {
      const result = Money.round(new Decimal('-2.005'));
      expect(result.toNumber()).toBe(-2.00);
    });

    it('should round -2.015 to -2.02 (banker\'s rounding with negatives)', () => {
      const result = Money.round(new Decimal('-2.015'));
      expect(result.toNumber()).toBe(-2.02);
    });

    it('should round -2.025 to -2.02 (banker\'s rounding with negatives)', () => {
      const result = Money.round(new Decimal('-2.025'));
      expect(result.toNumber()).toBe(-2.02);
    });
  });

  describe('fromCents and toCents', () => {
    it('should convert cents to Rands correctly', () => {
      const result = Money.fromCents(12345);
      expect(result.toNumber()).toBe(123.45);
    });

    it('should convert Rands to cents correctly', () => {
      const result = Money.toCents(new Decimal('123.45'));
      expect(result).toBe(12345);
    });

    it('should round-trip cents -> Rands -> cents', () => {
      const original = 345067;
      const rands = Money.fromCents(original);
      const backToCents = Money.toCents(rands);
      expect(backToCents).toBe(original);
    });

    it('should throw error for non-integer cents', () => {
      expect(() => Money.fromCents(123.45)).toThrow('Cents must be an integer');
    });

    it('should handle zero cents', () => {
      const result = Money.fromCents(0);
      expect(result.toNumber()).toBe(0);
    });

    it('should handle negative cents', () => {
      const result = Money.fromCents(-5000);
      expect(result.toNumber()).toBe(-50);
    });

    it('should apply banker\'s rounding when converting to cents', () => {
      // 2.125 should round to 2.12 (212 cents), not 2.13 (213 cents)
      const amount = new Decimal('2.125');
      const cents = Money.toCents(amount);
      expect(cents).toBe(212);
    });

    it('should apply banker\'s rounding to 2.135', () => {
      // 2.135 should round to 2.14 (214 cents)
      const amount = new Decimal('2.135');
      const cents = Money.toCents(amount);
      expect(cents).toBe(214);
    });
  });

  describe('Arithmetic Operations', () => {
    it('should add two amounts correctly', () => {
      const a = new Decimal('100.50');
      const b = new Decimal('50.25');
      const result = Money.add(a, b);
      expect(result.toNumber()).toBe(150.75);
    });

    it('should subtract two amounts correctly', () => {
      const a = new Decimal('100.50');
      const b = new Decimal('50.25');
      const result = Money.subtract(a, b);
      expect(result.toNumber()).toBe(50.25);
    });

    it('should multiply two amounts correctly', () => {
      const a = new Decimal('100');
      const b = new Decimal('0.15');
      const result = Money.multiply(a, b);
      expect(result.toNumber()).toBe(15);
    });

    it('should divide two amounts correctly', () => {
      const a = new Decimal('100');
      const b = new Decimal('3');
      const result = Money.divide(a, b);
      // 100 / 3 = 33.333...
      expect(result.toDecimalPlaces(2).toNumber()).toBe(33.33);
    });

    it('should throw error when dividing by zero', () => {
      const a = new Decimal('100');
      const b = new Decimal('0');
      expect(() => Money.divide(a, b)).toThrow('Cannot divide by zero');
    });

    it('should handle precision in division', () => {
      const a = new Decimal('10');
      const b = new Decimal('3');
      const result = Money.divide(a, b);
      // Should maintain high precision before rounding
      expect(result.toDecimalPlaces(10).toString()).toBe('3.3333333333');
    });

    it('should handle large number addition', () => {
      const a = new Decimal('999999.99');
      const b = new Decimal('0.01');
      const result = Money.add(a, b);
      expect(result.toNumber()).toBe(1000000);
    });

    it('should handle subtraction resulting in negative', () => {
      const a = new Decimal('50');
      const b = new Decimal('75');
      const result = Money.subtract(a, b);
      expect(result.toNumber()).toBe(-25);
    });
  });

  describe('VAT Calculations', () => {
    const VAT_RATE = 0.15; // 15% SA VAT

    it('should calculate VAT on net amount', () => {
      const netAmount = new Decimal('1000');
      const vat = Money.calculateVAT(netAmount, VAT_RATE);
      expect(vat.toNumber()).toBe(150);
    });

    it('should extract VAT from gross amount', () => {
      const grossAmount = new Decimal('1150');
      const vat = Money.extractVAT(grossAmount, VAT_RATE);
      // VAT = 1150 / 1.15 * 0.15 = 150
      expect(Money.round(vat).toNumber()).toBe(150);
    });

    it('should calculate correct VAT for typical invoice', () => {
      const netAmount = new Decimal('3000'); // R3000 school fee
      const vat = Money.calculateVAT(netAmount, VAT_RATE);
      const grossAmount = Money.add(netAmount, vat);

      expect(vat.toNumber()).toBe(450);
      expect(grossAmount.toNumber()).toBe(3450);
    });

    it('should extract correct net amount from gross', () => {
      const grossAmount = new Decimal('3450');
      const vat = Money.extractVAT(grossAmount, VAT_RATE);
      const netAmount = Money.subtract(grossAmount, vat);

      expect(Money.round(vat).toNumber()).toBe(450);
      expect(Money.round(netAmount).toNumber()).toBe(3000);
    });

    it('should handle VAT on fractional amounts', () => {
      const netAmount = new Decimal('123.45');
      const vat = Money.calculateVAT(netAmount, VAT_RATE);
      // 123.45 * 0.15 = 18.5175
      expect(Money.round(vat).toNumber()).toBe(18.52);
    });

    it('should roundtrip: net -> +VAT -> extract VAT -> net', () => {
      const originalNet = new Decimal('2500');
      const vat = Money.calculateVAT(originalNet, VAT_RATE);
      const gross = Money.add(originalNet, vat);
      const extractedVat = Money.extractVAT(gross, VAT_RATE);
      const calculatedNet = Money.subtract(gross, extractedVat);

      expect(Money.round(calculatedNet).toNumber()).toBe(originalNet.toNumber());
    });
  });

  describe('Comparison Operations', () => {
    it('should correctly identify equal amounts', () => {
      const a = new Decimal('100.50');
      const b = new Decimal('100.50');
      expect(Money.equals(a, b)).toBe(true);
    });

    it('should correctly identify unequal amounts', () => {
      const a = new Decimal('100.50');
      const b = new Decimal('100.51');
      expect(Money.equals(a, b)).toBe(false);
    });

    it('should correctly identify greater than', () => {
      const a = new Decimal('100.51');
      const b = new Decimal('100.50');
      expect(Money.isGreaterThan(a, b)).toBe(true);
    });

    it('should correctly identify not greater than when equal', () => {
      const a = new Decimal('100.50');
      const b = new Decimal('100.50');
      expect(Money.isGreaterThan(a, b)).toBe(false);
    });

    it('should correctly identify less than', () => {
      const a = new Decimal('100.49');
      const b = new Decimal('100.50');
      expect(Money.isLessThan(a, b)).toBe(true);
    });

    it('should correctly identify not less than when equal', () => {
      const a = new Decimal('100.50');
      const b = new Decimal('100.50');
      expect(Money.isLessThan(a, b)).toBe(false);
    });

    it('should correctly identify zero', () => {
      const zero = new Decimal('0');
      expect(Money.isZero(zero)).toBe(true);
      expect(Money.isZero(new Decimal('0.01'))).toBe(false);
      expect(Money.isZero(new Decimal('-0.01'))).toBe(false);
    });

    it('should correctly identify negative', () => {
      const negative = new Decimal('-100');
      expect(Money.isNegative(negative)).toBe(true);
      expect(Money.isNegative(new Decimal('100'))).toBe(false);
      expect(Money.isNegative(new Decimal('0'))).toBe(false);
    });

    it('should handle comparison of very small differences', () => {
      const a = new Decimal('100.001');
      const b = new Decimal('100.002');
      expect(Money.isLessThan(a, b)).toBe(true);
    });
  });

  describe('Format', () => {
    it('should format amount in South African Rand', () => {
      const amount = new Decimal('1234.56');
      expect(Money.format(amount)).toBe('R 1234.56');
    });

    it('should format with trailing zeros', () => {
      const amount = new Decimal('100');
      expect(Money.format(amount)).toBe('R 100.00');
    });

    it('should format zero correctly', () => {
      const amount = new Decimal('0');
      expect(Money.format(amount)).toBe('R 0.00');
    });

    it('should format negative amounts correctly', () => {
      const amount = new Decimal('-50.25');
      expect(Money.format(amount)).toBe('R -50.25');
    });

    it('should format large amounts correctly', () => {
      const amount = new Decimal('1234567.89');
      expect(Money.format(amount)).toBe('R 1234567.89');
    });

    it('should format with exactly 2 decimal places', () => {
      const amount = new Decimal('99.9');
      expect(Money.format(amount)).toBe('R 99.90');
    });
  });

  describe('Real-world Invoice Scenario', () => {
    it('should calculate monthly invoice correctly', () => {
      // Scenario: 3 children, R3000 each, 10% sibling discount on 2nd+
      const baseFee = new Decimal('3000');
      const discountRate = new Decimal('0.10');

      // First child: full price
      const child1 = baseFee;

      // Second child: 10% discount
      const child2Discount = Money.multiply(baseFee, discountRate);
      const child2 = Money.subtract(baseFee, child2Discount);

      // Third child: 10% discount
      const child3Discount = Money.multiply(baseFee, discountRate);
      const child3 = Money.subtract(baseFee, child3Discount);

      // Total before VAT
      const subtotal = Money.add(Money.add(child1, child2), child3);
      expect(subtotal.toNumber()).toBe(8400); // 3000 + 2700 + 2700

      // VAT
      const vat = Money.calculateVAT(subtotal, 0.15);
      expect(vat.toNumber()).toBe(1260);

      // Total
      const total = Money.add(subtotal, vat);
      expect(total.toNumber()).toBe(9660);

      // Convert to cents for database storage
      const totalCents = Money.toCents(total);
      expect(totalCents).toBe(966000);
    });

    it('should handle complex discount calculation with rounding', () => {
      // Scenario: R2547.50 base, 7.5% discount
      const baseFee = new Decimal('2547.50');
      const discountRate = new Decimal('0.075');

      const discountAmount = Money.multiply(baseFee, discountRate);
      // 2547.50 * 0.075 = 191.0625
      expect(Money.round(discountAmount).toNumber()).toBe(191.06);

      const discountedFee = Money.subtract(baseFee, Money.round(discountAmount));
      expect(discountedFee.toNumber()).toBe(2356.44);

      const vat = Money.calculateVAT(discountedFee, 0.15);
      expect(Money.round(vat).toNumber()).toBe(353.47);

      const total = Money.add(discountedFee, Money.round(vat));
      expect(total.toNumber()).toBe(2709.91);
    });

    it('should handle payment allocation across multiple invoices', () => {
      // Payment: R5000
      // Invoice 1: R2000
      // Invoice 2: R1500
      // Invoice 3: R2000
      const payment = new Decimal('5000');
      const invoice1 = new Decimal('2000');
      const invoice2 = new Decimal('1500');
      const invoice3 = new Decimal('2000');

      // Allocate payment
      let remaining = payment;

      // Pay invoice 1
      const pay1 = Money.isGreaterThan(remaining, invoice1) ? invoice1 : remaining;
      remaining = Money.subtract(remaining, pay1);
      expect(pay1.toNumber()).toBe(2000);
      expect(remaining.toNumber()).toBe(3000);

      // Pay invoice 2
      const pay2 = Money.isGreaterThan(remaining, invoice2) ? invoice2 : remaining;
      remaining = Money.subtract(remaining, pay2);
      expect(pay2.toNumber()).toBe(1500);
      expect(remaining.toNumber()).toBe(1500);

      // Partial pay invoice 3
      const pay3 = Money.isGreaterThan(remaining, invoice3) ? invoice3 : remaining;
      remaining = Money.subtract(remaining, pay3);
      expect(pay3.toNumber()).toBe(1500);
      expect(remaining.toNumber()).toBe(0);

      // Invoice 3 balance
      const invoice3Balance = Money.subtract(invoice3, pay3);
      expect(invoice3Balance.toNumber()).toBe(500);
    });

    it('should calculate prorated fees correctly', () => {
      // Monthly fee: R3000
      // Days in month: 30
      // Days attended: 20
      const monthlyFee = new Decimal('3000');
      const daysInMonth = new Decimal('30');
      const daysAttended = new Decimal('20');

      const dailyRate = Money.divide(monthlyFee, daysInMonth);
      expect(dailyRate.toNumber()).toBe(100);

      const proratedFee = Money.multiply(dailyRate, daysAttended);
      expect(proratedFee.toNumber()).toBe(2000);

      const vat = Money.calculateVAT(proratedFee, 0.15);
      expect(vat.toNumber()).toBe(300);

      const total = Money.add(proratedFee, vat);
      expect(total.toNumber()).toBe(2300);
    });

    it('should handle edge case: proration with banker\'s rounding', () => {
      // Monthly fee: R3000
      // Days in month: 30
      // Days attended: 17
      const monthlyFee = new Decimal('3000');
      const daysInMonth = new Decimal('30');
      const daysAttended = new Decimal('17');

      const dailyRate = Money.divide(monthlyFee, daysInMonth);
      // 3000 / 30 = 100

      const proratedFee = Money.multiply(dailyRate, daysAttended);
      // 100 * 17 = 1700
      expect(proratedFee.toNumber()).toBe(1700);

      // Convert to cents
      const cents = Money.toCents(proratedFee);
      expect(cents).toBe(170000);
    });
  });

  describe('from() helper', () => {
    it('should create Decimal from number', () => {
      const result = Money.from(123.45);
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toNumber()).toBe(123.45);
    });

    it('should create Decimal from string', () => {
      const result = Money.from('123.45');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toNumber()).toBe(123.45);
    });

    it('should handle large precision strings', () => {
      const result = Money.from('123.456789012345');
      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBe('123.456789012345');
    });
  });

  describe('percentage() helper', () => {
    it('should calculate percentage correctly', () => {
      const amount = new Decimal('1000');
      const result = Money.percentage(amount, 0.15);
      expect(result.toNumber()).toBe(150);
    });

    it('should handle fractional percentages', () => {
      const amount = new Decimal('1234.56');
      const result = Money.percentage(amount, 0.125);
      // 1234.56 * 0.125 = 154.32
      expect(result.toNumber()).toBe(154.32);
    });

    it('should handle 100% (returns same amount)', () => {
      const amount = new Decimal('500');
      const result = Money.percentage(amount, 1.0);
      expect(result.toNumber()).toBe(500);
    });

    it('should handle 0%', () => {
      const amount = new Decimal('500');
      const result = Money.percentage(amount, 0);
      expect(result.toNumber()).toBe(0);
    });
  });
});
