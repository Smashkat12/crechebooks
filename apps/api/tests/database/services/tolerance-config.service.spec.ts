/**
 * Tolerance Configuration Service Tests
 * TASK-RECON-003: Standardize Balance Tolerance Configuration
 *
 * Tests for centralized tolerance configuration used across reconciliation services.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ToleranceConfigService,
  DEFAULT_TOLERANCE_CONFIG,
  TOLERANCE_ENV_VARS,
} from '../../../src/database/services/tolerance-config.service';

describe('ToleranceConfigService', () => {
  let service: ToleranceConfigService;
  let configService: ConfigService;
  let mockEnvValues: Record<string, string | undefined>;

  beforeEach(async () => {
    // Reset mock env values before each test
    mockEnvValues = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToleranceConfigService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => mockEnvValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<ToleranceConfigService>(ToleranceConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('default values', () => {
    it('should return default amountMatchingTolerance when no env var', () => {
      expect(service.amountMatchingTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.amountMatchingTolerance,
      );
      expect(service.amountMatchingTolerance).toBe(1);
    });

    it('should return default balanceValidationTolerance when no env var', () => {
      expect(service.balanceValidationTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.balanceValidationTolerance,
      );
      expect(service.balanceValidationTolerance).toBe(100);
    });

    it('should return default bankFeeTolerance when no env var', () => {
      expect(service.bankFeeTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.bankFeeTolerance,
      );
      expect(service.bankFeeTolerance).toBe(500);
    });

    it('should return default dateTolerance when no env var', () => {
      expect(service.dateTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.dateTolerance,
      );
      expect(service.dateTolerance).toBe(1);
    });

    it('should return default percentageTolerance when no env var', () => {
      expect(service.percentageTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.percentageTolerance,
      );
      expect(service.percentageTolerance).toBe(0.005);
    });

    it('should return default largeAmountThreshold when no env var', () => {
      expect(service.largeAmountThreshold).toBe(
        DEFAULT_TOLERANCE_CONFIG.largeAmountThreshold,
      );
      expect(service.largeAmountThreshold).toBe(1000000);
    });

    it('should return default descriptionSimilarityThreshold when no env var', () => {
      expect(service.descriptionSimilarityThreshold).toBe(
        DEFAULT_TOLERANCE_CONFIG.descriptionSimilarityThreshold,
      );
      expect(service.descriptionSimilarityThreshold).toBe(0.7);
    });

    it('should return full config object with getConfig()', () => {
      const config = service.getConfig();
      expect(config).toEqual(DEFAULT_TOLERANCE_CONFIG);
    });
  });

  describe('environment variable overrides', () => {
    it('should use env var for amountMatchingTolerance', async () => {
      mockEnvValues[TOLERANCE_ENV_VARS.AMOUNT] = '5';

      const module = await Test.createTestingModule({
        providers: [
          ToleranceConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => mockEnvValues[key]),
            },
          },
        ],
      }).compile();

      const svc = module.get<ToleranceConfigService>(ToleranceConfigService);
      expect(svc.amountMatchingTolerance).toBe(5);
    });

    it('should use env var for balanceValidationTolerance', async () => {
      mockEnvValues[TOLERANCE_ENV_VARS.BALANCE] = '200';

      const module = await Test.createTestingModule({
        providers: [
          ToleranceConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => mockEnvValues[key]),
            },
          },
        ],
      }).compile();

      const svc = module.get<ToleranceConfigService>(ToleranceConfigService);
      expect(svc.balanceValidationTolerance).toBe(200);
    });

    it('should use env var for percentageTolerance', async () => {
      mockEnvValues[TOLERANCE_ENV_VARS.PERCENTAGE] = '0.01';

      const module = await Test.createTestingModule({
        providers: [
          ToleranceConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => mockEnvValues[key]),
            },
          },
        ],
      }).compile();

      const svc = module.get<ToleranceConfigService>(ToleranceConfigService);
      expect(svc.percentageTolerance).toBe(0.01);
    });

    it('should handle invalid env var values gracefully', async () => {
      mockEnvValues[TOLERANCE_ENV_VARS.AMOUNT] = 'invalid';

      const module = await Test.createTestingModule({
        providers: [
          ToleranceConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => mockEnvValues[key]),
            },
          },
        ],
      }).compile();

      const svc = module.get<ToleranceConfigService>(ToleranceConfigService);
      // Should fall back to default when value is invalid
      expect(svc.amountMatchingTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.amountMatchingTolerance,
      );
    });

    it('should handle empty string env var values', async () => {
      mockEnvValues[TOLERANCE_ENV_VARS.BALANCE] = '';

      const module = await Test.createTestingModule({
        providers: [
          ToleranceConfigService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => mockEnvValues[key]),
            },
          },
        ],
      }).compile();

      const svc = module.get<ToleranceConfigService>(ToleranceConfigService);
      expect(svc.balanceValidationTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.balanceValidationTolerance,
      );
    });
  });

  describe('getEffectiveTolerance', () => {
    it('should return fixed tolerance for small amounts', () => {
      // Amount below threshold (R5,000 = 500,000 cents)
      const tolerance = service.getEffectiveTolerance(500000);
      expect(tolerance).toBe(1); // Fixed tolerance
    });

    it('should return percentage tolerance for large amounts', () => {
      // Amount above threshold (R20,000 = 2,000,000 cents)
      const tolerance = service.getEffectiveTolerance(2000000);
      // 0.5% of 2,000,000 = 10,000 cents
      expect(tolerance).toBe(10000);
    });

    it('should return fixed tolerance at threshold boundary', () => {
      // Exactly at threshold (R10,000 = 1,000,000 cents)
      const tolerance = service.getEffectiveTolerance(1000000);
      // 0.5% of 1,000,000 = 5,000 cents (greater than fixed 1)
      expect(tolerance).toBe(5000);
    });

    it('should handle negative amounts correctly', () => {
      // Negative amounts should use absolute value
      const tolerance = service.getEffectiveTolerance(-2000000);
      expect(tolerance).toBe(10000);
    });

    it('should return max of fixed and percentage for borderline cases', () => {
      // For very small percentage that's less than fixed tolerance
      // With 0.5% and fixed of 1, we'd need amount < 200 cents
      const tolerance = service.getEffectiveTolerance(100);
      expect(tolerance).toBe(1); // Fixed tolerance since percentage would be 0.5
    });
  });

  describe('isWithinTolerance', () => {
    it('should return true when variance equals tolerance', () => {
      // Small amount - 1 cent tolerance
      expect(service.isWithinTolerance(1, 5000)).toBe(true);
    });

    it('should return true when variance is less than tolerance', () => {
      expect(service.isWithinTolerance(0, 5000)).toBe(true);
    });

    it('should return false when variance exceeds tolerance', () => {
      // 5 cents difference on a small amount (tolerance is 1 cent)
      expect(service.isWithinTolerance(5, 5000)).toBe(false);
    });

    it('should handle negative variances correctly', () => {
      expect(service.isWithinTolerance(-1, 5000)).toBe(true);
      expect(service.isWithinTolerance(-5, 5000)).toBe(false);
    });

    it('should use percentage tolerance for large amounts', () => {
      // R20,000 with 0.5% tolerance = R100 tolerance
      // 5000 cents (R50) variance should be within tolerance
      expect(service.isWithinTolerance(5000, 2000000)).toBe(true);
      // 15000 cents (R150) variance should exceed tolerance
      expect(service.isWithinTolerance(15000, 2000000)).toBe(false);
    });
  });

  describe('isBalanceWithinTolerance', () => {
    it('should return true for discrepancy within default tolerance', () => {
      expect(service.isBalanceWithinTolerance(50)).toBe(true);
      expect(service.isBalanceWithinTolerance(100)).toBe(true);
    });

    it('should return false for discrepancy exceeding default tolerance', () => {
      expect(service.isBalanceWithinTolerance(101)).toBe(false);
      expect(service.isBalanceWithinTolerance(500)).toBe(false);
    });

    it('should handle negative discrepancies', () => {
      expect(service.isBalanceWithinTolerance(-50)).toBe(true);
      expect(service.isBalanceWithinTolerance(-100)).toBe(true);
      expect(service.isBalanceWithinTolerance(-101)).toBe(false);
    });

    it('should return true for zero discrepancy', () => {
      expect(service.isBalanceWithinTolerance(0)).toBe(true);
    });
  });

  describe('isDateWithinTolerance', () => {
    it('should return true for same day (0 days difference)', () => {
      expect(service.isDateWithinTolerance(0)).toBe(true);
    });

    it('should return true for 1 day difference', () => {
      expect(service.isDateWithinTolerance(1)).toBe(true);
    });

    it('should return false for 2+ days difference', () => {
      expect(service.isDateWithinTolerance(2)).toBe(false);
      expect(service.isDateWithinTolerance(5)).toBe(false);
    });

    it('should handle fractional days', () => {
      expect(service.isDateWithinTolerance(0.5)).toBe(true);
      expect(service.isDateWithinTolerance(1.5)).toBe(false);
    });
  });

  describe('isDescriptionMatch', () => {
    it('should return true for similarity above threshold', () => {
      expect(service.isDescriptionMatch(0.8)).toBe(true);
      expect(service.isDescriptionMatch(0.75)).toBe(true);
      expect(service.isDescriptionMatch(0.7)).toBe(true);
    });

    it('should return false for similarity below threshold', () => {
      expect(service.isDescriptionMatch(0.6)).toBe(false);
      expect(service.isDescriptionMatch(0.5)).toBe(false);
      expect(service.isDescriptionMatch(0.69)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(service.isDescriptionMatch(1.0)).toBe(true);
      expect(service.isDescriptionMatch(0.0)).toBe(false);
    });
  });

  describe('isPotentialBankFee', () => {
    it('should return true for amounts within bank fee tolerance', () => {
      expect(service.isPotentialBankFee(100)).toBe(true); // R1
      expect(service.isPotentialBankFee(500)).toBe(true); // R5 (at limit)
      expect(service.isPotentialBankFee(300)).toBe(true); // R3
    });

    it('should return false for amounts exceeding bank fee tolerance', () => {
      expect(service.isPotentialBankFee(501)).toBe(false);
      expect(service.isPotentialBankFee(1000)).toBe(false);
    });

    it('should handle negative amounts', () => {
      expect(service.isPotentialBankFee(-300)).toBe(true);
      expect(service.isPotentialBankFee(-600)).toBe(false);
    });
  });

  describe('configuration immutability', () => {
    it('should return a copy of config, not the original', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      // Modify the returned object
      (config1 as any).amountMatchingTolerance = 999;

      // Should not affect the original or subsequent calls
      expect(config2.amountMatchingTolerance).toBe(
        DEFAULT_TOLERANCE_CONFIG.amountMatchingTolerance,
      );
    });
  });

  describe('environment variable names', () => {
    it('should have correct env var names', () => {
      expect(TOLERANCE_ENV_VARS.AMOUNT).toBe('RECONCILIATION_AMOUNT_TOLERANCE');
      expect(TOLERANCE_ENV_VARS.BALANCE).toBe(
        'RECONCILIATION_BALANCE_TOLERANCE',
      );
      expect(TOLERANCE_ENV_VARS.BANK_FEE).toBe(
        'RECONCILIATION_BANK_FEE_TOLERANCE',
      );
      expect(TOLERANCE_ENV_VARS.DATE).toBe('RECONCILIATION_DATE_TOLERANCE');
      expect(TOLERANCE_ENV_VARS.PERCENTAGE).toBe(
        'RECONCILIATION_PERCENTAGE_TOLERANCE',
      );
      expect(TOLERANCE_ENV_VARS.LARGE_AMOUNT_THRESHOLD).toBe(
        'RECONCILIATION_LARGE_AMOUNT_THRESHOLD',
      );
      expect(TOLERANCE_ENV_VARS.DESCRIPTION_SIMILARITY).toBe(
        'RECONCILIATION_DESCRIPTION_SIMILARITY',
      );
    });
  });

  describe('default config rationale', () => {
    it('should have sensible default values for SA banking', () => {
      // 1 cent for exact matching - covers rounding edge cases
      expect(DEFAULT_TOLERANCE_CONFIG.amountMatchingTolerance).toBe(1);

      // R1 for balance validation - covers minor bank charges
      expect(DEFAULT_TOLERANCE_CONFIG.balanceValidationTolerance).toBe(100);

      // R5 for bank fees - typical debit order/transaction fees
      expect(DEFAULT_TOLERANCE_CONFIG.bankFeeTolerance).toBe(500);

      // 1 day for date tolerance - processing delays
      expect(DEFAULT_TOLERANCE_CONFIG.dateTolerance).toBe(1);

      // 0.5% for large amounts - scales appropriately
      expect(DEFAULT_TOLERANCE_CONFIG.percentageTolerance).toBe(0.005);

      // R10,000 threshold for percentage-based tolerance
      expect(DEFAULT_TOLERANCE_CONFIG.largeAmountThreshold).toBe(1000000);

      // 70% description similarity - reasonable for partial matches
      expect(DEFAULT_TOLERANCE_CONFIG.descriptionSimilarityThreshold).toBe(0.7);
    });
  });
});
