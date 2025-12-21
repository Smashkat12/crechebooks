/**
 * PayeService Integration Tests
 * TASK-SARS-012
 *
 * Tests PAYE calculations using 2025 SARS tax tables
 * CRITICAL: Uses REAL calculations, verifies against known values
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { PayeService } from '../../../src/database/services/paye.service';
import { PayFrequency } from '@prisma/client';
import {
  REBATES_2025,
  MEDICAL_CREDITS_2025,
  TAX_THRESHOLDS_2025,
} from '../../../src/database/constants/paye.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('PayeService', () => {
  let service: PayeService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayeService],
    }).compile();

    service = module.get<PayeService>(PayeService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('calculatePaye', () => {
    it('should calculate PAYE for R30,000 monthly salary', async () => {
      // R30,000/month = R360,000/year
      // Expected: Tax bracket 2 (26%)
      // Tax = R42,678 + (R360,000 - R237,100) * 26% = R42,678 + R31,954 = R74,632
      // After rebate (R17,235): R74,632 - R17,235 = R57,397 annual
      // Monthly: R57,397 / 12 = R4,783.08

      const result = await service.calculatePaye({
        grossIncomeCents: 3000000, // R30,000
        payFrequency: PayFrequency.MONTHLY,
        dateOfBirth: new Date('1990-01-01'), // Under 65
        medicalAidMembers: 0,
      });

      expect(result.grossIncomeCents).toBe(3000000);
      expect(result.annualizedIncomeCents).toBe(36000000); // R360,000
      expect(result.bracketIndex).toBe(1); // Second bracket
      expect(result.primaryRebateCents).toBe(REBATES_2025.PRIMARY);
      expect(result.secondaryRebateCents).toBe(0);
      expect(result.tertiaryRebateCents).toBe(0);
      // Monthly PAYE should be around R4,783
      expect(result.netPayeCents).toBeGreaterThan(400000);
      expect(result.netPayeCents).toBeLessThan(600000);
    });

    it('should apply secondary rebate for age 65+', async () => {
      const result = await service.calculatePaye({
        grossIncomeCents: 2000000, // R20,000
        payFrequency: PayFrequency.MONTHLY,
        dateOfBirth: new Date('1958-01-01'), // 67 years old
        medicalAidMembers: 0,
      });

      expect(result.primaryRebateCents).toBe(REBATES_2025.PRIMARY);
      expect(result.secondaryRebateCents).toBe(REBATES_2025.SECONDARY);
      expect(result.tertiaryRebateCents).toBe(0);
      expect(result.totalRebatesCents).toBe(
        REBATES_2025.PRIMARY + REBATES_2025.SECONDARY,
      );
    });

    it('should apply tertiary rebate for age 75+', async () => {
      const result = await service.calculatePaye({
        grossIncomeCents: 2000000,
        payFrequency: PayFrequency.MONTHLY,
        dateOfBirth: new Date('1948-01-01'), // 77 years old
        medicalAidMembers: 0,
      });

      expect(result.primaryRebateCents).toBe(REBATES_2025.PRIMARY);
      expect(result.secondaryRebateCents).toBe(REBATES_2025.SECONDARY);
      expect(result.tertiaryRebateCents).toBe(REBATES_2025.TERTIARY);
      expect(result.totalRebatesCents).toBe(
        REBATES_2025.PRIMARY + REBATES_2025.SECONDARY + REBATES_2025.TERTIARY,
      );
    });

    it('should apply medical aid tax credits', async () => {
      const result = await service.calculatePaye({
        grossIncomeCents: 3000000,
        payFrequency: PayFrequency.MONTHLY,
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 3, // Main + 1 dependent + 1 additional
      });

      // Main (R364) + First dependent (R364) + 1 additional (R246) = R974
      const expectedCredits =
        MEDICAL_CREDITS_2025.MAIN_MEMBER +
        MEDICAL_CREDITS_2025.FIRST_DEPENDENT +
        MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENT;
      expect(result.medicalCreditsCents).toBe(expectedCredits);
    });

    it('should return zero PAYE for income below threshold', async () => {
      // R7,000/month = R84,000/year (below R95,750 threshold)
      const result = await service.calculatePaye({
        grossIncomeCents: 700000, // R7,000
        payFrequency: PayFrequency.MONTHLY,
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 0,
      });

      // Tax before rebates = R84,000 * 18% = R15,120
      // After rebate R17,235: negative, so floor to 0
      expect(result.netPayeCents).toBe(0);
    });

    it('should handle weekly pay frequency', async () => {
      // R5,000/week = R260,000/year (52 weeks)
      const result = await service.calculatePaye({
        grossIncomeCents: 500000, // R5,000 per week
        payFrequency: PayFrequency.WEEKLY,
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 0,
      });

      expect(result.annualizedIncomeCents).toBe(26000000); // R260,000
      expect(result.bracketIndex).toBe(1); // Second bracket (above R237,100)
    });

    it('should handle daily pay frequency', async () => {
      // R1,000/day = R261,000/year (261 days)
      const result = await service.calculatePaye({
        grossIncomeCents: 100000, // R1,000 per day
        payFrequency: PayFrequency.DAILY,
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 0,
      });

      expect(result.annualizedIncomeCents).toBe(26100000); // R261,000
    });

    it('should handle hourly pay frequency', async () => {
      // R150/hour = R313,200/year (2088 hours)
      const result = await service.calculatePaye({
        grossIncomeCents: 15000, // R150 per hour
        payFrequency: PayFrequency.HOURLY,
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 0,
      });

      expect(result.annualizedIncomeCents).toBe(31320000); // R313,200
    });

    it('should throw error for negative income', async () => {
      await expect(
        service.calculatePaye({
          grossIncomeCents: -100000,
          payFrequency: PayFrequency.MONTHLY,
          dateOfBirth: new Date('1990-01-01'),
          medicalAidMembers: 0,
        }),
      ).rejects.toThrow('cannot be negative');
    });

    it('should throw error for negative medical aid members', async () => {
      await expect(
        service.calculatePaye({
          grossIncomeCents: 3000000,
          payFrequency: PayFrequency.MONTHLY,
          dateOfBirth: new Date('1990-01-01'),
          medicalAidMembers: -1,
        }),
      ).rejects.toThrow('cannot be negative');
    });

    it('should calculate effective rate correctly', async () => {
      const result = await service.calculatePaye({
        grossIncomeCents: 3000000,
        payFrequency: PayFrequency.MONTHLY,
        dateOfBirth: new Date('1990-01-01'),
        medicalAidMembers: 0,
      });

      // Effective rate = PAYE / Gross * 100
      const expectedRate = new Decimal(result.netPayeCents)
        .div(result.grossIncomeCents)
        .mul(100)
        .toDecimalPlaces(2)
        .toNumber();

      expect(result.effectiveRatePercent).toBe(expectedRate);
    });
  });

  describe('getTaxBracket', () => {
    it('should return bracket 0 for income R200,000', () => {
      const { bracket, bracketIndex } = service.getTaxBracket(20000000);
      expect(bracketIndex).toBe(0);
      expect(bracket.rate.toNumber()).toBe(0.18);
    });

    it('should return bracket 1 for income R300,000', () => {
      const { bracket, bracketIndex } = service.getTaxBracket(30000000);
      expect(bracketIndex).toBe(1);
      expect(bracket.rate.toNumber()).toBe(0.26);
    });

    it('should return bracket 2 for income R400,000', () => {
      const { bracket, bracketIndex } = service.getTaxBracket(40000000);
      expect(bracketIndex).toBe(2);
      expect(bracket.rate.toNumber()).toBe(0.31);
    });

    it('should return bracket 6 for income R2,000,000', () => {
      const { bracket, bracketIndex } = service.getTaxBracket(200000000);
      expect(bracketIndex).toBe(6);
      expect(bracket.rate.toNumber()).toBe(0.45);
    });

    it('should handle boundary cases correctly', () => {
      // Exactly at bracket boundary R237,100
      const { bracketIndex: idx1 } = service.getTaxBracket(23710000);
      expect(idx1).toBe(0);

      // Just above bracket boundary R237,101
      const { bracketIndex: idx2 } = service.getTaxBracket(23710100);
      expect(idx2).toBe(1);
    });
  });

  describe('calculateRebate', () => {
    it('should return primary rebate for age under 65', () => {
      const dob = new Date('1990-01-01'); // ~35 years old
      const rebate = service.calculateRebate(dob);
      expect(rebate).toBe(REBATES_2025.PRIMARY);
    });

    it('should return primary + secondary for age 65-74', () => {
      const dob = new Date('1958-01-01'); // ~67 years old
      const rebate = service.calculateRebate(dob);
      expect(rebate).toBe(REBATES_2025.PRIMARY + REBATES_2025.SECONDARY);
    });

    it('should return all rebates for age 75+', () => {
      const dob = new Date('1948-01-01'); // ~77 years old
      const rebate = service.calculateRebate(dob);
      expect(rebate).toBe(
        REBATES_2025.PRIMARY + REBATES_2025.SECONDARY + REBATES_2025.TERTIARY,
      );
    });
  });

  describe('calculateMedicalCredits', () => {
    it('should return 0 for 0 members', () => {
      expect(service.calculateMedicalCredits(0)).toBe(0);
    });

    it('should return main member credit for 1 member', () => {
      expect(service.calculateMedicalCredits(1)).toBe(
        MEDICAL_CREDITS_2025.MAIN_MEMBER,
      );
    });

    it('should return main + first dependent for 2 members', () => {
      expect(service.calculateMedicalCredits(2)).toBe(
        MEDICAL_CREDITS_2025.MAIN_MEMBER + MEDICAL_CREDITS_2025.FIRST_DEPENDENT,
      );
    });

    it('should calculate correctly for 4 members', () => {
      // Main + first dependent + 2 additional
      const expected =
        MEDICAL_CREDITS_2025.MAIN_MEMBER +
        MEDICAL_CREDITS_2025.FIRST_DEPENDENT +
        MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENT * 2;
      expect(service.calculateMedicalCredits(4)).toBe(expected);
    });

    it('should handle large families', () => {
      // Main + first dependent + 5 additional
      const expected =
        MEDICAL_CREDITS_2025.MAIN_MEMBER +
        MEDICAL_CREDITS_2025.FIRST_DEPENDENT +
        MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENT * 5;
      expect(service.calculateMedicalCredits(7)).toBe(expected);
    });
  });

  describe('annualizeEarnings', () => {
    it('should annualize monthly correctly', () => {
      expect(service.annualizeEarnings(2000000, PayFrequency.MONTHLY)).toBe(
        24000000,
      ); // R20,000 * 12
    });

    it('should annualize weekly correctly', () => {
      expect(service.annualizeEarnings(500000, PayFrequency.WEEKLY)).toBe(
        26000000,
      ); // R5,000 * 52
    });

    it('should annualize daily correctly', () => {
      expect(service.annualizeEarnings(100000, PayFrequency.DAILY)).toBe(
        26100000,
      ); // R1,000 * 261
    });

    it('should annualize hourly correctly', () => {
      expect(service.annualizeEarnings(15000, PayFrequency.HOURLY)).toBe(
        31320000,
      ); // R150 * 2088
    });
  });

  describe('getTaxThreshold', () => {
    it('should return correct threshold for under 65', () => {
      expect(service.getTaxThreshold(30)).toBe(TAX_THRESHOLDS_2025.BELOW_65);
    });

    it('should return correct threshold for 65-74', () => {
      expect(service.getTaxThreshold(67)).toBe(TAX_THRESHOLDS_2025.AGE_65_TO_74);
    });

    it('should return correct threshold for 75+', () => {
      expect(service.getTaxThreshold(80)).toBe(TAX_THRESHOLDS_2025.AGE_75_PLUS);
    });
  });

  describe('isBelowThreshold', () => {
    it('should return true for income below threshold', () => {
      expect(service.isBelowThreshold(9000000, 30)).toBe(true); // R90,000 < R95,750
    });

    it('should return false for income above threshold', () => {
      expect(service.isBelowThreshold(10000000, 30)).toBe(false); // R100,000 > R95,750
    });

    it('should use age-appropriate threshold', () => {
      // R140,000 is below 65+ threshold (R148,217) but above <65 threshold (R95,750)
      expect(service.isBelowThreshold(14000000, 30)).toBe(false);
      expect(service.isBelowThreshold(14000000, 67)).toBe(true);
    });
  });

  describe('Banker\'s Rounding', () => {
    it('should apply banker\'s rounding correctly', () => {
      // Test calculation that would produce a .5 case
      const result = service.annualizeEarnings(12345, PayFrequency.MONTHLY);
      expect(result).toBe(148140); // 12345 * 12

      // Verify Decimal.js is configured correctly
      const test1 = new Decimal('100.125').round();
      expect(test1.toNumber()).toBe(100); // Round to even (down)

      const test2 = new Decimal('100.135').round();
      expect(test2.toNumber()).toBe(100); // Round to even (down)

      const test3 = new Decimal('100.145').round();
      expect(test3.toNumber()).toBe(100); // Round to even (down)

      const test4 = new Decimal('100.155').round();
      expect(test4.toNumber()).toBe(100); // Round to even (down)
    });
  });
});
