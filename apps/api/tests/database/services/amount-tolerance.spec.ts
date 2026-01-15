/**
 * Amount Tolerance Utility Tests
 * TASK-RECON-001: Add Amount Tolerance to Matching
 *
 * Comprehensive tests for the amount tolerance utility used in payment matching.
 * All monetary amounts are in CENTS as integers.
 */

import {
  isAmountWithinTolerance,
  validateToleranceConfig,
  getEffectiveTolerance,
  createBankFeeTolerance,
  createStrictTolerance,
  AmountToleranceConfig,
} from '../../../src/database/services/amount-tolerance.util';
import {
  TOLERANCE_DEFAULTS,
  TOLERANCE_CONFIDENCE_FACTORS,
} from '../../../src/database/constants/tolerance.constants';

describe('Amount Tolerance Utility', () => {
  describe('isAmountWithinTolerance', () => {
    describe('exact matches', () => {
      it('TC-001: exact match returns full confidence', () => {
        const result = isAmountWithinTolerance(10000, 10000);
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(0);
        expect(result.confidenceAdjustment).toBe(0);
        expect(result.matchDescription).toBe('Exact amount match');
      });

      it('should handle exact match with zero amounts', () => {
        const result = isAmountWithinTolerance(0, 0);
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(0);
        expect(result.confidenceAdjustment).toBe(0);
      });

      it('should handle exact match with large amounts', () => {
        const result = isAmountWithinTolerance(10000000, 10000000); // R100,000
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(0);
        expect(result.confidenceAdjustment).toBe(0);
      });
    });

    describe('absolute tolerance matching', () => {
      it('TC-002: within tolerance matches with reduced confidence', () => {
        const result = isAmountWithinTolerance(10000, 9999, {
          absoluteTolerance: 1,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(1);
        expect(result.confidenceAdjustment).toBeLessThan(0);
        expect(result.confidenceAdjustment).toBeGreaterThanOrEqual(
          -TOLERANCE_CONFIDENCE_FACTORS.MAX_CONFIDENCE_REDUCTION,
        );
      });

      it('TC-003: outside tolerance does not match', () => {
        // Use strict mode (both tolerances must match) with 0 percentage tolerance
        const result = isAmountWithinTolerance(10000, 9998, {
          absoluteTolerance: 1,
          percentageTolerance: 0,
          useHigherTolerance: false,
        });
        expect(result.matches).toBe(false);
        expect(result.deviation).toBe(2);
      });

      it('TC-004: bank fee scenario matches with configured tolerance', () => {
        // R100 with R0.50 bank fee = R99.50 (50 cents difference)
        const result = isAmountWithinTolerance(10000, 9950, {
          absoluteTolerance: 100,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(50);
      });

      it('should match exactly at tolerance boundary', () => {
        const result = isAmountWithinTolerance(10000, 9900, {
          absoluteTolerance: 100,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(100);
      });

      it('should not match just outside tolerance boundary', () => {
        const result = isAmountWithinTolerance(10000, 9899, {
          absoluteTolerance: 100,
        });
        expect(result.matches).toBe(false);
        expect(result.deviation).toBe(101);
      });
    });

    describe('percentage tolerance matching', () => {
      it('TC-005: percentage tolerance handles large amounts', () => {
        // R10,000 with 0.5% tolerance = R50 tolerance
        const result = isAmountWithinTolerance(1000000, 999500, {
          percentageTolerance: 0.005,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(500); // R5 difference
      });

      it('should handle 1% tolerance correctly', () => {
        // R100 with 1% tolerance = R1 tolerance
        const result = isAmountWithinTolerance(10000, 9900, {
          percentageTolerance: 0.01,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(100);
      });

      it('should reject amounts outside percentage tolerance', () => {
        // R100 with 0.5% tolerance = R0.50 tolerance
        const result = isAmountWithinTolerance(10000, 9900, {
          absoluteTolerance: 0,
          percentageTolerance: 0.005,
          useHigherTolerance: false,
        });
        expect(result.matches).toBe(false);
        expect(result.deviation).toBe(100); // R1 difference, exceeds 0.5%
      });
    });

    describe('combined tolerance modes', () => {
      it('should use higher tolerance when useHigherTolerance is true (default)', () => {
        // Small absolute but large percentage
        const result = isAmountWithinTolerance(10000, 9900, {
          absoluteTolerance: 10, // Would fail
          percentageTolerance: 0.02, // Would pass (2% = R2)
          useHigherTolerance: true,
        });
        expect(result.matches).toBe(true); // Passes due to percentage
      });

      it('should require both tolerances when useHigherTolerance is false', () => {
        const result = isAmountWithinTolerance(10000, 9900, {
          absoluteTolerance: 10,
          percentageTolerance: 0.02,
          useHigherTolerance: false,
        });
        expect(result.matches).toBe(false); // Fails because absolute doesn't match
      });

      it('should match when both tolerances are satisfied', () => {
        const result = isAmountWithinTolerance(10000, 9999, {
          absoluteTolerance: 10,
          percentageTolerance: 0.01,
          useHigherTolerance: false,
        });
        expect(result.matches).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle zero amounts', () => {
        const result = isAmountWithinTolerance(0, 0);
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(0);
      });

      it('should handle one zero amount', () => {
        const result = isAmountWithinTolerance(100, 0, {
          absoluteTolerance: 100,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(100);
      });

      it('should handle negative amounts (refunds)', () => {
        const result = isAmountWithinTolerance(-10000, -9999, {
          absoluteTolerance: 1,
        });
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(1);
      });

      it('should handle mixed positive and negative amounts', () => {
        const result = isAmountWithinTolerance(10000, -10000, {
          absoluteTolerance: 100,
        });
        expect(result.matches).toBe(false);
        expect(result.deviation).toBe(20000);
      });

      it('should handle very large amounts', () => {
        // R1,000,000 with default percentage tolerance
        const result = isAmountWithinTolerance(100000000, 99995000);
        expect(result.matches).toBe(true); // 0.05% deviation within 0.5% tolerance
      });

      it('should handle very small amounts', () => {
        const result = isAmountWithinTolerance(1, 0, { absoluteTolerance: 1 });
        expect(result.matches).toBe(true);
      });
    });

    describe('confidence adjustment calculation', () => {
      it('should have zero adjustment for exact match', () => {
        const result = isAmountWithinTolerance(10000, 10000);
        expect(result.confidenceAdjustment).toBe(0);
      });

      it('should have negative adjustment for tolerance match', () => {
        const result = isAmountWithinTolerance(10000, 9999, {
          absoluteTolerance: 1,
        });
        expect(result.confidenceAdjustment).toBeLessThan(0);
      });

      it('should cap adjustment at MAX_CONFIDENCE_REDUCTION', () => {
        // Large deviation within tolerance should cap at -0.2
        const result = isAmountWithinTolerance(10000, 9500, {
          absoluteTolerance: 500,
        });
        expect(result.confidenceAdjustment).toBeGreaterThanOrEqual(
          -TOLERANCE_CONFIDENCE_FACTORS.MAX_CONFIDENCE_REDUCTION,
        );
      });

      it('should have proportional adjustment based on deviation', () => {
        const result50 = isAmountWithinTolerance(10000, 9950, {
          absoluteTolerance: 100,
        });
        const result100 = isAmountWithinTolerance(10000, 9900, {
          absoluteTolerance: 100,
        });

        // Larger deviation should have larger (more negative) adjustment
        expect(result100.confidenceAdjustment).toBeLessThan(
          result50.confidenceAdjustment,
        );
      });
    });

    describe('match description', () => {
      it('should describe exact match', () => {
        const result = isAmountWithinTolerance(10000, 10000);
        expect(result.matchDescription).toBe('Exact amount match');
      });

      it('should describe tolerance match with cents', () => {
        const result = isAmountWithinTolerance(10000, 9999, {
          absoluteTolerance: 10,
        });
        expect(result.matchDescription).toContain('tolerance');
        expect(result.matchDescription).toContain('1 cents');
      });

      it('should describe tolerance match with Rand', () => {
        const result = isAmountWithinTolerance(10000, 9800, {
          absoluteTolerance: 500,
        });
        expect(result.matchDescription).toContain('R2.00');
      });

      it('should describe outside tolerance', () => {
        const result = isAmountWithinTolerance(10000, 9000, {
          absoluteTolerance: 100,
        });
        expect(result.matchDescription).toContain('outside tolerance');
      });
    });

    describe('default configuration', () => {
      it('should use default 1 cent tolerance', () => {
        const result = isAmountWithinTolerance(10000, 10001);
        expect(result.matches).toBe(true);
        expect(result.deviation).toBe(1);
      });

      it('should use default 0.5% percentage tolerance', () => {
        // R100 with R0.50 difference = 0.5%
        const result = isAmountWithinTolerance(10000, 9950);
        expect(result.matches).toBe(true);
      });
    });
  });

  describe('validateToleranceConfig', () => {
    describe('absoluteTolerance validation', () => {
      it('should accept valid absolute tolerance', () => {
        expect(() =>
          validateToleranceConfig({ absoluteTolerance: 100 }),
        ).not.toThrow();
      });

      it('should accept zero tolerance', () => {
        expect(() =>
          validateToleranceConfig({ absoluteTolerance: 0 }),
        ).not.toThrow();
      });

      it('should accept max tolerance', () => {
        expect(() =>
          validateToleranceConfig({
            absoluteTolerance: TOLERANCE_DEFAULTS.MAX_AMOUNT_TOLERANCE_CENTS,
          }),
        ).not.toThrow();
      });

      it('should reject negative tolerance', () => {
        expect(() =>
          validateToleranceConfig({ absoluteTolerance: -1 }),
        ).toThrow('cannot be negative');
      });

      it('should reject excessive tolerance', () => {
        expect(() =>
          validateToleranceConfig({
            absoluteTolerance:
              TOLERANCE_DEFAULTS.MAX_AMOUNT_TOLERANCE_CENTS + 1,
          }),
        ).toThrow('cannot exceed');
      });
    });

    describe('percentageTolerance validation', () => {
      it('should accept valid percentage tolerance', () => {
        expect(() =>
          validateToleranceConfig({ percentageTolerance: 0.01 }),
        ).not.toThrow();
      });

      it('should accept zero percentage', () => {
        expect(() =>
          validateToleranceConfig({ percentageTolerance: 0 }),
        ).not.toThrow();
      });

      it('should accept max percentage', () => {
        expect(() =>
          validateToleranceConfig({
            percentageTolerance: TOLERANCE_DEFAULTS.MAX_PERCENTAGE_TOLERANCE,
          }),
        ).not.toThrow();
      });

      it('should reject negative percentage', () => {
        expect(() =>
          validateToleranceConfig({ percentageTolerance: -0.01 }),
        ).toThrow('cannot be negative');
      });

      it('should reject percentage greater than 1', () => {
        expect(() =>
          validateToleranceConfig({ percentageTolerance: 1.5 }),
        ).toThrow('must be between 0 and 1');
      });

      it('should reject percentage exceeding max', () => {
        expect(() =>
          validateToleranceConfig({
            percentageTolerance:
              TOLERANCE_DEFAULTS.MAX_PERCENTAGE_TOLERANCE + 0.01,
          }),
        ).toThrow('cannot exceed');
      });
    });

    describe('combined validation', () => {
      it('should accept valid combined config', () => {
        expect(() =>
          validateToleranceConfig({
            absoluteTolerance: 100,
            percentageTolerance: 0.01,
            useHigherTolerance: true,
          }),
        ).not.toThrow();
      });

      it('should validate both values when provided', () => {
        expect(() =>
          validateToleranceConfig({
            absoluteTolerance: -1,
            percentageTolerance: 0.01,
          }),
        ).toThrow('cannot be negative');
      });

      it('should accept empty config', () => {
        expect(() => validateToleranceConfig({})).not.toThrow();
      });
    });
  });

  describe('getEffectiveTolerance', () => {
    it('should return default tolerance for small amounts', () => {
      // With useHigherTolerance=true (default), even small amounts use percentage
      // 0.5% of R100 = R0.50 = 50 cents
      const tolerance = getEffectiveTolerance(10000); // R100
      expect(tolerance).toBe(50); // 0.5% of 10000 cents

      // With strict mode, uses absolute tolerance
      const strictTolerance = getEffectiveTolerance(10000, {
        absoluteTolerance: TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
        percentageTolerance: 0,
        useHigherTolerance: false,
      });
      expect(strictTolerance).toBe(0); // Percentage is 0, and min(1, 0) = 0
    });

    it('should return percentage-based tolerance for large amounts', () => {
      // R100,000 with 0.5% = R500 tolerance
      const tolerance = getEffectiveTolerance(10000000);
      expect(tolerance).toBe(50000); // 0.5% of R100,000
    });

    it('should use custom config when provided', () => {
      const tolerance = getEffectiveTolerance(10000, {
        absoluteTolerance: 100,
      });
      expect(tolerance).toBe(100);
    });

    it('should handle negative amounts', () => {
      const tolerance = getEffectiveTolerance(-10000);
      expect(tolerance).toBeGreaterThan(0);
    });

    it('should use higher of two tolerances by default', () => {
      // For large amount, percentage should win
      const tolerance = getEffectiveTolerance(10000000, {
        absoluteTolerance: 1,
        percentageTolerance: 0.01,
      });
      expect(tolerance).toBe(100000); // 1% of R100,000
    });

    it('should use lower tolerance when useHigherTolerance is false', () => {
      const tolerance = getEffectiveTolerance(10000000, {
        absoluteTolerance: 100,
        percentageTolerance: 0.01,
        useHigherTolerance: false,
      });
      expect(tolerance).toBe(100); // Absolute is smaller
    });
  });

  describe('createBankFeeTolerance', () => {
    it('should create config with bank fee tolerance', () => {
      const config = createBankFeeTolerance();
      expect(config.absoluteTolerance).toBe(
        TOLERANCE_DEFAULTS.BANK_FEE_TOLERANCE_CENTS,
      );
      expect(config.useHigherTolerance).toBe(true);
    });

    it('should match typical bank fee scenario', () => {
      const config = createBankFeeTolerance();
      // R100 payment with R5 bank fee
      const result = isAmountWithinTolerance(10000, 9500, config);
      expect(result.matches).toBe(true);
    });

    it('should reject excessive differences', () => {
      const config = createBankFeeTolerance();
      // R100 payment with R10 difference (too much)
      const result = isAmountWithinTolerance(10000, 9000, config);
      expect(result.matches).toBe(false);
    });
  });

  describe('createStrictTolerance', () => {
    it('should create strict config', () => {
      const config = createStrictTolerance();
      expect(config.absoluteTolerance).toBe(
        TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
      );
      expect(config.percentageTolerance).toBe(0);
      expect(config.useHigherTolerance).toBe(false);
    });

    it('should only match near-exact amounts', () => {
      // Strict tolerance uses 1 cent absolute but 0 percentage
      // With useHigherTolerance=false, BOTH must match
      // Since percentage is 0, only exact match passes percentage check
      // Therefore strict mode only matches exact amounts (0 deviation)
      const config = createStrictTolerance();
      const resultExact = isAmountWithinTolerance(10000, 10000, config);
      expect(resultExact.matches).toBe(true);

      // 1 cent difference fails because percentage (0) is not met
      const result1Cent = isAmountWithinTolerance(10000, 9999, config);
      expect(result1Cent.matches).toBe(false);
    });

    it('should reject even small differences', () => {
      const config = createStrictTolerance();
      const result = isAmountWithinTolerance(10000, 9998, config);
      expect(result.matches).toBe(false);
    });
  });

  describe('TOLERANCE_DEFAULTS constants', () => {
    it('should have sensible default values', () => {
      expect(TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS).toBe(1);
      expect(TOLERANCE_DEFAULTS.MAX_AMOUNT_TOLERANCE_CENTS).toBe(500);
      expect(TOLERANCE_DEFAULTS.DEFAULT_PERCENTAGE_TOLERANCE).toBe(0.005);
      expect(TOLERANCE_DEFAULTS.MAX_PERCENTAGE_TOLERANCE).toBe(0.05);
      expect(TOLERANCE_DEFAULTS.BANK_FEE_TOLERANCE_CENTS).toBe(500);
      expect(TOLERANCE_DEFAULTS.LARGE_AMOUNT_THRESHOLD_CENTS).toBe(1000000);
    });
  });

  describe('TOLERANCE_CONFIDENCE_FACTORS constants', () => {
    it('should have valid confidence factors', () => {
      expect(TOLERANCE_CONFIDENCE_FACTORS.MAX_CONFIDENCE_REDUCTION).toBe(0.2);
      expect(TOLERANCE_CONFIDENCE_FACTORS.CONFIDENCE_REDUCTION_RATE).toBe(0.1);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical creche monthly fee with bank fee', () => {
      // R2,500 monthly fee, bank deducts R2.50 fee
      const result = isAmountWithinTolerance(
        250000,
        249750,
        createBankFeeTolerance(),
      );
      expect(result.matches).toBe(true);
    });

    it('should handle partial payment scenario', () => {
      // Parent pays R1,000 of R2,500 fee
      const result = isAmountWithinTolerance(250000, 100000);
      expect(result.matches).toBe(false); // Partial payments should not auto-match
    });

    it('should handle rounding difference', () => {
      // R1,234.56 becomes R1,234.57 due to rounding
      const result = isAmountWithinTolerance(123456, 123457);
      expect(result.matches).toBe(true);
    });

    it('should handle multiple children payment', () => {
      // Two children at R2,500 each = R5,000 total
      const result = isAmountWithinTolerance(
        500000,
        499950,
        createBankFeeTolerance(),
      );
      expect(result.matches).toBe(true);
    });
  });
});
