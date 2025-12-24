/**
 * PAYE Constants Validation Tests
 * Validates constants against official SARS 2024/25 tax tables
 *
 * Reference: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
 * Tax Year: 1 March 2024 - 28 February 2025
 */
import Decimal from 'decimal.js';
import {
  TAX_BRACKETS_2025,
  REBATES_2025,
  MEDICAL_CREDITS_2025,
  TAX_THRESHOLDS_2025,
} from '../paye.constants';

/**
 * Official SARS 2024/25 Tax Brackets
 * All values in cents (multiply rand by 100)
 */
const SARS_2024_25_BRACKETS = [
  { min: 0, max: 23710000, rate: '0.18', base: 0 }, // R1 - R237,100 @ 18%
  { min: 23710100, max: 37050000, rate: '0.26', base: 4267800 }, // R237,101 - R370,500 @ 26%
  { min: 37050100, max: 51280000, rate: '0.31', base: 7736200 }, // R370,501 - R512,800 @ 31%
  { min: 51280100, max: 67300000, rate: '0.36', base: 12147500 }, // R512,801 - R673,000 @ 36%
  { min: 67300100, max: 85790000, rate: '0.39', base: 17914700 }, // R673,001 - R857,900 @ 39%
  { min: 85790100, max: 181700000, rate: '0.41', base: 25125800 }, // R857,901 - R1,817,000 @ 41%
  { min: 181700100, max: null, rate: '0.45', base: 64448900 }, // R1,817,001+ @ 45%
];

const SARS_2024_25_REBATES = {
  PRIMARY: 1723500, // R17,235
  SECONDARY: 944400, // R9,444
  TERTIARY: 314500, // R3,145
};

const SARS_2024_25_MEDICAL_CREDITS = {
  MAIN_MEMBER: 36400, // R364 per month
  FIRST_DEPENDENT: 36400, // R364 per month
  ADDITIONAL_DEPENDENT: 24600, // R246 per month
};

const SARS_2024_25_THRESHOLDS = {
  BELOW_65: 9575000, // R95,750
  AGE_65_TO_74: 14821700, // R148,217
  AGE_75_PLUS: 16568900, // R165,689
};

describe('PAYE Constants Validation - SARS 2024/25', () => {
  describe('Tax Brackets', () => {
    it('should have exactly 7 tax brackets', () => {
      expect(TAX_BRACKETS_2025).toHaveLength(7);
    });

    it('should match SARS 2024/25 tax brackets exactly', () => {
      TAX_BRACKETS_2025.forEach((bracket, index) => {
        const sars = SARS_2024_25_BRACKETS[index];

        expect(bracket.minIncomeCents).toBe(sars.min);
        expect(bracket.maxIncomeCents).toBe(sars.max);
        expect(bracket.baseAmountCents).toBe(sars.base);
        expect(bracket.rate.toString()).toBe(sars.rate);
      });
    });

    it('should have bracket 1 max at R237,100 (23710000 cents)', () => {
      // Critical validation - this is the correct SARS value
      expect(TAX_BRACKETS_2025[0].maxIncomeCents).toBe(23710000);
    });

    it('should have contiguous brackets with no gaps', () => {
      for (let i = 1; i < TAX_BRACKETS_2025.length; i++) {
        const prevMax = TAX_BRACKETS_2025[i - 1].maxIncomeCents;
        const currMin = TAX_BRACKETS_2025[i].minIncomeCents;

        if (prevMax !== null) {
          expect(currMin).toBe(prevMax + 100); // +1 rand = 100 cents
        }
      }
    });

    it('should have strictly increasing rates per bracket', () => {
      for (let i = 1; i < TAX_BRACKETS_2025.length; i++) {
        const prevRate = TAX_BRACKETS_2025[i - 1].rate;
        const currRate = TAX_BRACKETS_2025[i].rate;
        expect(currRate.greaterThan(prevRate)).toBe(true);
      }
    });

    it('should have strictly increasing base amounts per bracket', () => {
      for (let i = 1; i < TAX_BRACKETS_2025.length; i++) {
        const prevBase = TAX_BRACKETS_2025[i - 1].baseAmountCents;
        const currBase = TAX_BRACKETS_2025[i].baseAmountCents;
        expect(currBase).toBeGreaterThan(prevBase);
      }
    });

    it('should have rates as Decimal instances', () => {
      TAX_BRACKETS_2025.forEach((bracket) => {
        expect(bracket.rate).toBeInstanceOf(Decimal);
      });
    });

    it('should have top bracket with null max (no upper limit)', () => {
      const topBracket = TAX_BRACKETS_2025[TAX_BRACKETS_2025.length - 1];
      expect(topBracket.maxIncomeCents).toBeNull();
    });

    it('should have first bracket starting at 0', () => {
      expect(TAX_BRACKETS_2025[0].minIncomeCents).toBe(0);
    });

    it('should have first bracket with 0 base amount', () => {
      expect(TAX_BRACKETS_2025[0].baseAmountCents).toBe(0);
    });
  });

  describe('Tax Rebates', () => {
    it('should match SARS 2024/25 rebates', () => {
      expect(REBATES_2025.PRIMARY).toBe(SARS_2024_25_REBATES.PRIMARY);
      expect(REBATES_2025.SECONDARY).toBe(SARS_2024_25_REBATES.SECONDARY);
      expect(REBATES_2025.TERTIARY).toBe(SARS_2024_25_REBATES.TERTIARY);
    });

    it('should have primary rebate of R17,235 (1723500 cents)', () => {
      expect(REBATES_2025.PRIMARY).toBe(1723500);
    });

    it('should have secondary rebate less than primary', () => {
      expect(REBATES_2025.SECONDARY).toBeLessThan(REBATES_2025.PRIMARY);
    });

    it('should have tertiary rebate less than secondary', () => {
      expect(REBATES_2025.TERTIARY).toBeLessThan(REBATES_2025.SECONDARY);
    });
  });

  describe('Medical Tax Credits', () => {
    it('should match SARS 2024/25 medical credits', () => {
      expect(MEDICAL_CREDITS_2025.MAIN_MEMBER).toBe(
        SARS_2024_25_MEDICAL_CREDITS.MAIN_MEMBER,
      );
      expect(MEDICAL_CREDITS_2025.FIRST_DEPENDENT).toBe(
        SARS_2024_25_MEDICAL_CREDITS.FIRST_DEPENDENT,
      );
      expect(MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENT).toBe(
        SARS_2024_25_MEDICAL_CREDITS.ADDITIONAL_DEPENDENT,
      );
    });

    it('should have main member credit of R364/month (36400 cents)', () => {
      expect(MEDICAL_CREDITS_2025.MAIN_MEMBER).toBe(36400);
    });

    it('should have main member and first dependent credits equal', () => {
      expect(MEDICAL_CREDITS_2025.MAIN_MEMBER).toBe(
        MEDICAL_CREDITS_2025.FIRST_DEPENDENT,
      );
    });

    it('should have additional dependent credit less than main member', () => {
      expect(MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENT).toBeLessThan(
        MEDICAL_CREDITS_2025.MAIN_MEMBER,
      );
    });
  });

  describe('Tax Thresholds', () => {
    it('should match SARS 2024/25 thresholds', () => {
      expect(TAX_THRESHOLDS_2025.BELOW_65).toBe(
        SARS_2024_25_THRESHOLDS.BELOW_65,
      );
      expect(TAX_THRESHOLDS_2025.AGE_65_TO_74).toBe(
        SARS_2024_25_THRESHOLDS.AGE_65_TO_74,
      );
      expect(TAX_THRESHOLDS_2025.AGE_75_PLUS).toBe(
        SARS_2024_25_THRESHOLDS.AGE_75_PLUS,
      );
    });

    it('should have under-65 threshold of R95,750 (9575000 cents)', () => {
      expect(TAX_THRESHOLDS_2025.BELOW_65).toBe(9575000);
    });

    it('should have increasing thresholds with age', () => {
      expect(TAX_THRESHOLDS_2025.AGE_65_TO_74).toBeGreaterThan(
        TAX_THRESHOLDS_2025.BELOW_65,
      );
      expect(TAX_THRESHOLDS_2025.AGE_75_PLUS).toBeGreaterThan(
        TAX_THRESHOLDS_2025.AGE_65_TO_74,
      );
    });
  });

  describe('Mathematical Consistency', () => {
    it('should have base amounts that match cumulative tax calculation', () => {
      // Verify base amounts are mathematically consistent
      // Base amount for bracket N = previous base + (previous bracket width * previous rate)
      for (let i = 1; i < TAX_BRACKETS_2025.length; i++) {
        const prev = TAX_BRACKETS_2025[i - 1];
        const curr = TAX_BRACKETS_2025[i];

        if (prev.maxIncomeCents !== null) {
          const bracketWidth = prev.maxIncomeCents - prev.minIncomeCents;
          const expectedBase =
            prev.baseAmountCents +
            Math.round(prev.rate.mul(bracketWidth).toNumber());

          // Allow 1 cent rounding tolerance
          expect(
            Math.abs(curr.baseAmountCents - expectedBase),
          ).toBeLessThanOrEqual(100);
        }
      }
    });
  });
});
