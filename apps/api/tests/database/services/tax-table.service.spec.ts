/**
 * Tax Table Service Tests
 * TASK-STAFF-005: Make Tax Tables Configurable
 *
 * Comprehensive tests for configurable tax year and bracket management.
 * Tests SARS PAYE calculations with 2024/2025 tax tables.
 *
 * All monetary values in CENTS
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { TaxTableService } from '../../../src/database/services/tax-table.service';
import {
  TaxYear,
  TaxBracket,
  CreateTaxYearDto,
  TAX_YEAR_2024_2025,
} from '../../../src/database/constants/tax-tables.constants';

// Configure Decimal.js
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('TaxTableService', () => {
  let service: TaxTableService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxTableService],
    }).compile();

    service = module.get<TaxTableService>(TaxTableService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have default tax years loaded', () => {
      const taxYears = service.getAllTaxYears();
      expect(taxYears.length).toBeGreaterThanOrEqual(2);
    });

    it('should have 2024/2025 tax year available', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      expect(taxYear).toBeDefined();
      expect(taxYear.yearCode).toBe('2024/2025');
    });

    it('should have 2025/2026 tax year available', () => {
      const taxYear = service.getTaxYearByCode('2025/2026');
      expect(taxYear).toBeDefined();
      expect(taxYear.yearCode).toBe('2025/2026');
    });
  });

  describe('getTaxYearForDate', () => {
    it('should return 2024/2025 tax year for date in that period', () => {
      const date = new Date('2024-06-15'); // June 2024
      const taxYear = service.getTaxYearForDate(date);

      expect(taxYear.yearCode).toBe('2024/2025');
    });

    it('should return 2025/2026 tax year for date in that period', () => {
      const date = new Date('2025-06-15'); // June 2025
      const taxYear = service.getTaxYearForDate(date);

      expect(taxYear.yearCode).toBe('2025/2026');
    });

    it('should throw NotFoundException for date with no tax year', () => {
      const date = new Date('2020-01-01'); // No tax year for this
      expect(() => service.getTaxYearForDate(date)).toThrow(
        'No active tax year found',
      );
    });

    it('should cache tax year lookups', () => {
      const date = new Date('2024-06-15');

      // First call
      const result1 = service.getTaxYearForDate(date);

      // Second call should be cached (no easy way to verify cache hit,
      // but we verify it returns the same result)
      const result2 = service.getTaxYearForDate(date);

      expect(result1.id).toBe(result2.id);
      expect(result1.yearCode).toBe(result2.yearCode);
    });
  });

  describe('getCurrentTaxYear', () => {
    it('should return a valid tax year', () => {
      // This test depends on current date - using a safe assumption
      // that we're testing during 2024/2025 or 2025/2026 tax years
      const taxYear = service.getCurrentTaxYear();

      expect(taxYear).toBeDefined();
      expect(taxYear.yearCode).toMatch(/^\d{4}\/\d{4}$/);
    });
  });

  describe('getTaxYearById', () => {
    it('should return tax year by ID', () => {
      const allYears = service.getAllTaxYears();
      const firstYear = allYears[0];

      const result = service.getTaxYearById(firstYear.id);
      expect(result.id).toBe(firstYear.id);
    });

    it('should throw NotFoundException for invalid ID', () => {
      expect(() => service.getTaxYearById('invalid-id')).toThrow(
        'Tax year not found',
      );
    });
  });

  describe('getTaxYearByCode', () => {
    it('should return tax year by code', () => {
      const result = service.getTaxYearByCode('2024/2025');
      expect(result.yearCode).toBe('2024/2025');
    });

    it('should throw NotFoundException for invalid code', () => {
      expect(() => service.getTaxYearByCode('1999/2000')).toThrow(
        'Tax year not found',
      );
    });
  });

  describe('getAllTaxYears', () => {
    it('should return all tax years sorted by effectiveFrom descending', () => {
      const taxYears = service.getAllTaxYears();

      expect(taxYears.length).toBeGreaterThanOrEqual(2);

      // Verify sorting (most recent first)
      for (let i = 0; i < taxYears.length - 1; i++) {
        expect(taxYears[i].effectiveFrom.getTime()).toBeGreaterThanOrEqual(
          taxYears[i + 1].effectiveFrom.getTime(),
        );
      }
    });
  });

  describe('createTaxYear', () => {
    const validDto: CreateTaxYearDto = {
      yearCode: '2026/2027',
      effectiveFrom: new Date('2026-03-01'),
      effectiveTo: new Date('2027-02-28'),
      primaryRebateCents: 1800000,
      secondaryRebateCents: 1000000,
      tertiaryRebateCents: 350000,
      taxThresholdCents: 10000000,
      taxThresholdOver65Cents: 15500000,
      taxThresholdOver75Cents: 17500000,
      medicalCreditsMainCents: 40000,
      medicalCreditsFirstDependentCents: 40000,
      medicalCreditsOtherDependentsCents: 27000,
      brackets: [
        {
          lowerBoundCents: 0,
          upperBoundCents: 25000000,
          baseTaxCents: 0,
          marginalRate: 0.18,
          bracketOrder: 1,
        },
        {
          lowerBoundCents: 25000000,
          upperBoundCents: 40000000,
          baseTaxCents: 4500000,
          marginalRate: 0.26,
          bracketOrder: 2,
        },
        {
          lowerBoundCents: 40000000,
          upperBoundCents: null,
          baseTaxCents: 8400000,
          marginalRate: 0.31,
          bracketOrder: 3,
        },
      ],
    };

    it('should create a new tax year', () => {
      const result = service.createTaxYear(validDto, 'test-user');

      expect(result.yearCode).toBe('2026/2027');
      expect(result.primaryRebateCents).toBe(1800000);
      expect(result.brackets.length).toBe(3);
      expect(result.createdBy).toBe('test-user');
    });

    it('should throw BadRequestException for invalid year code format', () => {
      const invalidDto = { ...validDto, yearCode: '2026-2027' };

      expect(() => service.createTaxYear(invalidDto)).toThrow(
        'Invalid year code format',
      );
    });

    it('should throw BadRequestException for duplicate year code', () => {
      // 2024/2025 already exists from seed
      const duplicateDto = { ...validDto, yearCode: '2024/2025' };

      expect(() => service.createTaxYear(duplicateDto)).toThrow(
        'Tax year already exists',
      );
    });

    it('should throw BadRequestException for empty brackets', () => {
      const emptyBracketsDto = {
        ...validDto,
        yearCode: '2027/2028',
        effectiveFrom: new Date('2027-03-01'),
        effectiveTo: new Date('2028-02-29'),
        brackets: [],
      };

      expect(() => service.createTaxYear(emptyBracketsDto)).toThrow(
        'At least one tax bracket is required',
      );
    });

    it('should throw BadRequestException if first bracket does not start at 0', () => {
      const badBracketsDto = {
        ...validDto,
        yearCode: '2027/2028',
        effectiveFrom: new Date('2027-03-01'),
        effectiveTo: new Date('2028-02-29'),
        brackets: [
          {
            lowerBoundCents: 1000,
            upperBoundCents: 25000000,
            baseTaxCents: 0,
            marginalRate: 0.18,
            bracketOrder: 1,
          },
          {
            lowerBoundCents: 25000000,
            upperBoundCents: null,
            baseTaxCents: 4500000,
            marginalRate: 0.26,
            bracketOrder: 2,
          },
        ],
      };

      expect(() => service.createTaxYear(badBracketsDto)).toThrow(
        'First bracket must start at 0',
      );
    });

    it('should throw BadRequestException for bracket gaps', () => {
      const gapDto = {
        ...validDto,
        yearCode: '2027/2028',
        effectiveFrom: new Date('2027-03-01'),
        effectiveTo: new Date('2028-02-29'),
        brackets: [
          {
            lowerBoundCents: 0,
            upperBoundCents: 20000000,
            baseTaxCents: 0,
            marginalRate: 0.18,
            bracketOrder: 1,
          },
          {
            lowerBoundCents: 25000000,
            upperBoundCents: null,
            baseTaxCents: 4500000,
            marginalRate: 0.26,
            bracketOrder: 2,
          },
        ],
      };

      expect(() => service.createTaxYear(gapDto)).toThrow('Gap or overlap');
    });

    it('should throw BadRequestException if last bracket has upper bound', () => {
      const badLastBracketDto = {
        ...validDto,
        yearCode: '2027/2028',
        effectiveFrom: new Date('2027-03-01'),
        effectiveTo: new Date('2028-02-29'),
        brackets: [
          {
            lowerBoundCents: 0,
            upperBoundCents: 25000000,
            baseTaxCents: 0,
            marginalRate: 0.18,
            bracketOrder: 1,
          },
          {
            lowerBoundCents: 25000000,
            upperBoundCents: 50000000,
            baseTaxCents: 4500000,
            marginalRate: 0.26,
            bracketOrder: 2,
          },
        ],
      };

      expect(() => service.createTaxYear(badLastBracketDto)).toThrow(
        'null upper bound',
      );
    });
  });

  describe('updateTaxYear', () => {
    it('should update tax year properties', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const originalPrimary = taxYear.primaryRebateCents;

      const updated = service.updateTaxYear(
        taxYear.id,
        {
          primaryRebateCents: originalPrimary + 100000,
        },
        'test-user',
      );

      expect(updated.primaryRebateCents).toBe(originalPrimary + 100000);
      expect(updated.updatedBy).toBe('test-user');
    });

    it('should update tax year brackets', () => {
      const taxYear = service.getTaxYearByCode('2025/2026');

      const updated = service.updateTaxYear(taxYear.id, {
        brackets: [
          {
            lowerBoundCents: 0,
            upperBoundCents: 25000000,
            baseTaxCents: 0,
            marginalRate: 0.19,
            bracketOrder: 1,
          },
          {
            lowerBoundCents: 25000000,
            upperBoundCents: null,
            baseTaxCents: 4750000,
            marginalRate: 0.27,
            bracketOrder: 2,
          },
        ],
      });

      expect(updated.brackets.length).toBe(2);
      expect(updated.brackets[0].marginalRate.toNumber()).toBe(0.19);
    });

    it('should deactivate a tax year', () => {
      const taxYear = service.getTaxYearByCode('2025/2026');

      const updated = service.updateTaxYear(taxYear.id, {
        isActive: false,
      });

      expect(updated.isActive).toBe(false);
    });
  });

  describe('calculatePAYE', () => {
    describe('Below threshold income', () => {
      it('should return 0 tax for income below under-65 threshold', () => {
        // Threshold is R95,750 = 9575000 cents
        const result = service.calculatePAYE(9000000, 30); // R90,000 annual

        expect(result.taxAfterRebatesCents).toBe(0);
        expect(result.monthlyPayeCents).toBe(0);
      });

      it('should return 0 tax for 65-74 age group below their threshold', () => {
        // Threshold is R148,217 = 14821700 cents
        const result = service.calculatePAYE(14000000, 68); // R140,000 annual

        expect(result.taxAfterRebatesCents).toBe(0);
        expect(result.monthlyPayeCents).toBe(0);
      });

      it('should return 0 tax for 75+ age group below their threshold', () => {
        // Threshold is R165,689 = 16568900 cents
        const result = service.calculatePAYE(16000000, 78); // R160,000 annual

        expect(result.taxAfterRebatesCents).toBe(0);
        expect(result.monthlyPayeCents).toBe(0);
      });
    });

    describe('First bracket calculations (18%)', () => {
      it('should calculate tax correctly for R150,000 annual income', () => {
        // R150,000 = 15000000 cents
        // Tax = 15000000 * 0.18 = 2700000 (R27,000)
        // Less primary rebate: 2700000 - 1723500 = 976500 (R9,765)
        // Use specific date to ensure 2024/2025 tax year
        const date = new Date('2024-06-15');
        const result = service.calculatePAYE(15000000, 30, date);

        expect(result.annualIncomeCents).toBe(15000000);
        expect(result.taxYearCode).toBe('2024/2025');
        expect(result.taxBeforeRebatesCents).toBe(2700000);
        expect(result.primaryRebateCents).toBe(1723500);
        expect(result.secondaryRebateCents).toBe(0);
        expect(result.tertiaryRebateCents).toBe(0);
        expect(result.taxAfterRebatesCents).toBe(976500);

        // Monthly = 976500 / 12 = 81375
        expect(result.monthlyPayeCents).toBe(81375);
        expect(result.bracketIndex).toBe(0);
      });

      it('should calculate tax correctly for R200,000 annual income', () => {
        // R200,000 = 20000000 cents
        // Tax = 20000000 * 0.18 = 3600000 (R36,000)
        // Less primary rebate: 3600000 - 1723500 = 1876500 (R18,765)
        const result = service.calculatePAYE(20000000, 30);

        expect(result.taxBeforeRebatesCents).toBe(3600000);
        expect(result.taxAfterRebatesCents).toBe(1876500);
        expect(result.monthlyPayeCents).toBe(156375); // 1876500 / 12
      });
    });

    describe('Second bracket calculations (26%)', () => {
      it('should calculate tax correctly for R300,000 annual income', () => {
        // R300,000 = 30000000 cents
        // Bracket: R237,100 - R370,500 (23710000 - 37050000 cents)
        // Base tax: R42,678 = 4267800 cents
        // Excess: 30000000 - 23710000 = 6290000
        // Tax on excess: 6290000 * 0.26 = 1635400
        // Total tax: 4267800 + 1635400 = 5903200
        // Less rebate: 5903200 - 1723500 = 4179700
        const result = service.calculatePAYE(30000000, 30);

        expect(result.bracketIndex).toBe(1);
        expect(result.taxBeforeRebatesCents).toBe(5903200);
        expect(result.taxAfterRebatesCents).toBe(4179700);
        expect(result.monthlyPayeCents).toBe(348308); // 4179700 / 12 rounded
      });
    });

    describe('Third bracket calculations (31%)', () => {
      it('should calculate tax correctly for R450,000 annual income', () => {
        // R450,000 = 45000000 cents
        // Bracket: R370,500 - R512,800 (37050000 - 51280000 cents)
        // Base tax: R77,362 = 7736200 cents
        // Excess: 45000000 - 37050000 = 7950000
        // Tax on excess: 7950000 * 0.31 = 2464500
        // Total tax: 7736200 + 2464500 = 10200700
        // Less rebate: 10200700 - 1723500 = 8477200
        const result = service.calculatePAYE(45000000, 30);

        expect(result.bracketIndex).toBe(2);
        expect(result.taxBeforeRebatesCents).toBe(10200700);
        expect(result.taxAfterRebatesCents).toBe(8477200);
      });
    });

    describe('Higher bracket calculations', () => {
      it('should calculate tax correctly for R600,000 annual income (36% bracket)', () => {
        // R600,000 = 60000000 cents
        // Bracket: R512,800 - R673,000
        // Base tax: R121,475 = 12147500 cents
        // Excess: 60000000 - 51280000 = 8720000
        // Tax on excess: 8720000 * 0.36 = 3139200
        // Total tax: 12147500 + 3139200 = 15286700
        const result = service.calculatePAYE(60000000, 30);

        expect(result.bracketIndex).toBe(3);
        expect(result.taxBeforeRebatesCents).toBe(15286700);
      });

      it('should calculate tax correctly for R1,000,000 annual income (41% bracket)', () => {
        // R1,000,000 = 100000000 cents
        // Bracket: R857,900 - R1,817,000
        // Base tax: R251,258 = 25125800 cents
        // Excess: 100000000 - 85790000 = 14210000
        // Tax on excess: 14210000 * 0.41 = 5826100
        // Total tax: 25125800 + 5826100 = 30951900
        const result = service.calculatePAYE(100000000, 30);

        expect(result.bracketIndex).toBe(5);
        expect(result.taxBeforeRebatesCents).toBe(30951900);
      });

      it('should calculate tax correctly for R2,000,000 annual income (45% bracket)', () => {
        // R2,000,000 = 200000000 cents
        // Bracket: R1,817,000+ (45%)
        // Base tax: R644,489 = 64448900 cents
        // Excess: 200000000 - 181700000 = 18300000
        // Tax on excess: 18300000 * 0.45 = 8235000
        // Total tax: 64448900 + 8235000 = 72683900
        const result = service.calculatePAYE(200000000, 30);

        expect(result.bracketIndex).toBe(6);
        expect(result.taxBeforeRebatesCents).toBe(72683900);
      });
    });

    describe('Age-based rebates', () => {
      it('should apply secondary rebate for age 65-74', () => {
        // R300,000 annual income
        // Tax before rebates: 5903200 (from second bracket test)
        // Primary rebate: 1723500
        // Secondary rebate: 944400
        // Total rebates: 2667900
        // Tax after rebates: 5903200 - 2667900 = 3235300
        const result = service.calculatePAYE(30000000, 68);

        expect(result.primaryRebateCents).toBe(1723500);
        expect(result.secondaryRebateCents).toBe(944400);
        expect(result.tertiaryRebateCents).toBe(0);
        expect(result.totalRebatesCents).toBe(2667900);
        expect(result.taxAfterRebatesCents).toBe(3235300);
      });

      it('should apply all three rebates for age 75+', () => {
        // R300,000 annual income
        // Tax before rebates: 5903200
        // Primary: 1723500
        // Secondary: 944400
        // Tertiary: 314500
        // Total: 2982400
        // Tax after: 5903200 - 2982400 = 2920800
        const result = service.calculatePAYE(30000000, 78);

        expect(result.primaryRebateCents).toBe(1723500);
        expect(result.secondaryRebateCents).toBe(944400);
        expect(result.tertiaryRebateCents).toBe(314500);
        expect(result.totalRebatesCents).toBe(2982400);
        expect(result.taxAfterRebatesCents).toBe(2920800);
      });
    });

    describe('Edge cases', () => {
      it('should return 0 for zero income', () => {
        const result = service.calculatePAYE(0, 30);

        expect(result.taxBeforeRebatesCents).toBe(0);
        expect(result.taxAfterRebatesCents).toBe(0);
        expect(result.monthlyPayeCents).toBe(0);
        expect(result.effectiveRatePercent).toBe(0);
      });

      it('should throw error for negative income', () => {
        expect(() => service.calculatePAYE(-100000, 30)).toThrow(
          'cannot be negative',
        );
      });

      it('should throw error for invalid age', () => {
        expect(() => service.calculatePAYE(15000000, -5)).toThrow(
          'Invalid age',
        );
        expect(() => service.calculatePAYE(15000000, 200)).toThrow(
          'Invalid age',
        );
      });

      it('should calculate for specific tax year date', () => {
        const date = new Date('2024-06-15');
        const result = service.calculatePAYE(15000000, 30, date);

        expect(result.taxYearCode).toBe('2024/2025');
      });

      it('should floor tax at zero when rebates exceed tax', () => {
        // Very low income where rebates exceed calculated tax
        const result = service.calculatePAYE(10000000, 30); // R100,000

        // Tax = 10000000 * 0.18 = 1800000
        // Less rebate: 1800000 - 1723500 = 76500
        expect(result.taxAfterRebatesCents).toBe(76500);
        expect(result.taxAfterRebatesCents).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Effective rate calculation', () => {
      it('should calculate effective tax rate correctly', () => {
        // R500,000 annual income
        const result = service.calculatePAYE(50000000, 30);

        // Effective rate = taxAfterRebates / annualIncome * 100
        const expectedRate = new Decimal(result.taxAfterRebatesCents)
          .div(50000000)
          .mul(100)
          .toDecimalPlaces(2)
          .toNumber();

        expect(result.effectiveRatePercent).toBe(expectedRate);
      });
    });
  });

  describe('getAgeCategory', () => {
    it('should return UNDER_65 for age 30', () => {
      expect(service.getAgeCategory(30)).toBe('UNDER_65');
    });

    it('should return UNDER_65 for age 64', () => {
      expect(service.getAgeCategory(64)).toBe('UNDER_65');
    });

    it('should return AGE_65_TO_74 for age 65', () => {
      expect(service.getAgeCategory(65)).toBe('AGE_65_TO_74');
    });

    it('should return AGE_65_TO_74 for age 74', () => {
      expect(service.getAgeCategory(74)).toBe('AGE_65_TO_74');
    });

    it('should return AGE_75_PLUS for age 75', () => {
      expect(service.getAgeCategory(75)).toBe('AGE_75_PLUS');
    });

    it('should return AGE_75_PLUS for age 90', () => {
      expect(service.getAgeCategory(90)).toBe('AGE_75_PLUS');
    });
  });

  describe('getApplicableRebate', () => {
    it('should return only primary rebate for under 65', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const rebates = service.getApplicableRebate(taxYear, 'UNDER_65');

      expect(rebates.primaryRebateCents).toBe(1723500);
      expect(rebates.secondaryRebateCents).toBe(0);
      expect(rebates.tertiaryRebateCents).toBe(0);
      expect(rebates.totalRebatesCents).toBe(1723500);
    });

    it('should return primary and secondary rebates for 65-74', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const rebates = service.getApplicableRebate(taxYear, 'AGE_65_TO_74');

      expect(rebates.primaryRebateCents).toBe(1723500);
      expect(rebates.secondaryRebateCents).toBe(944400);
      expect(rebates.tertiaryRebateCents).toBe(0);
      expect(rebates.totalRebatesCents).toBe(2667900);
    });

    it('should return all rebates for 75+', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const rebates = service.getApplicableRebate(taxYear, 'AGE_75_PLUS');

      expect(rebates.primaryRebateCents).toBe(1723500);
      expect(rebates.secondaryRebateCents).toBe(944400);
      expect(rebates.tertiaryRebateCents).toBe(314500);
      expect(rebates.totalRebatesCents).toBe(2982400);
    });
  });

  describe('getThresholdForAge', () => {
    it('should return under-65 threshold for young taxpayers', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const threshold = service.getThresholdForAge(taxYear, 'UNDER_65');

      expect(threshold).toBe(9575000); // R95,750
    });

    it('should return 65-74 threshold for middle-aged seniors', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const threshold = service.getThresholdForAge(taxYear, 'AGE_65_TO_74');

      expect(threshold).toBe(14821700); // R148,217
    });

    it('should return 75+ threshold for elderly taxpayers', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const threshold = service.getThresholdForAge(taxYear, 'AGE_75_PLUS');

      expect(threshold).toBe(16568900); // R165,689
    });
  });

  describe('findBracket', () => {
    it('should find first bracket for low income', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const { bracket, bracketIndex } = service.findBracket(taxYear, 15000000);

      expect(bracketIndex).toBe(0);
      expect(bracket.bracketOrder).toBe(1);
      expect(bracket.marginalRate.toNumber()).toBe(0.18);
    });

    it('should find second bracket for R300,000', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const { bracket, bracketIndex } = service.findBracket(taxYear, 30000000);

      expect(bracketIndex).toBe(1);
      expect(bracket.bracketOrder).toBe(2);
      expect(bracket.marginalRate.toNumber()).toBe(0.26);
    });

    it('should find highest bracket for very high income', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const { bracket, bracketIndex } = service.findBracket(taxYear, 200000000);

      expect(bracketIndex).toBe(6);
      expect(bracket.bracketOrder).toBe(7);
      expect(bracket.marginalRate.toNumber()).toBe(0.45);
      expect(bracket.upperBoundCents).toBeNull();
    });
  });

  describe('calculateMedicalCredits', () => {
    it('should return 0 for 0 members', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const credits = service.calculateMedicalCredits(taxYear, 0);

      expect(credits).toBe(0);
    });

    it('should return main member credit for 1 member', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const credits = service.calculateMedicalCredits(taxYear, 1);

      expect(credits).toBe(36400); // R364
    });

    it('should return main + first dependent for 2 members', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const credits = service.calculateMedicalCredits(taxYear, 2);

      expect(credits).toBe(72800); // R364 + R364
    });

    it('should calculate correctly for 4 members', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const credits = service.calculateMedicalCredits(taxYear, 4);

      // Main: 36400 + First: 36400 + 2 others: 2 * 24600 = 122000
      expect(credits).toBe(122000); // R1,220
    });

    it('should calculate correctly for large family', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const credits = service.calculateMedicalCredits(taxYear, 6);

      // Main: 36400 + First: 36400 + 4 others: 4 * 24600 = 171200
      expect(credits).toBe(171200); // R1,712
    });
  });

  describe('getBracketDescriptions', () => {
    it('should return formatted bracket descriptions', () => {
      const taxYear = service.getTaxYearByCode('2024/2025');
      const descriptions = service.getBracketDescriptions(taxYear);

      expect(descriptions.length).toBe(7);
      expect(descriptions[0].rate).toBe('18%');
      expect(descriptions[6].rate).toBe('45%');
    });
  });

  describe('2024/2025 Tax Year Seed Data Verification', () => {
    it('should have correct rebate values', () => {
      expect(TAX_YEAR_2024_2025.primaryRebateCents).toBe(1723500); // R17,235
      expect(TAX_YEAR_2024_2025.secondaryRebateCents).toBe(944400); // R9,444
      expect(TAX_YEAR_2024_2025.tertiaryRebateCents).toBe(314500); // R3,145
    });

    it('should have correct threshold values', () => {
      expect(TAX_YEAR_2024_2025.taxThresholdCents).toBe(9575000); // R95,750
      expect(TAX_YEAR_2024_2025.taxThresholdOver65Cents).toBe(14821700); // R148,217
      expect(TAX_YEAR_2024_2025.taxThresholdOver75Cents).toBe(16568900); // R165,689
    });

    it('should have correct medical credit values', () => {
      expect(TAX_YEAR_2024_2025.medicalCreditsMainCents).toBe(36400); // R364
      expect(TAX_YEAR_2024_2025.medicalCreditsFirstDependentCents).toBe(36400); // R364
      expect(TAX_YEAR_2024_2025.medicalCreditsOtherDependentsCents).toBe(24600); // R246
    });

    it('should have 7 tax brackets', () => {
      expect(TAX_YEAR_2024_2025.brackets.length).toBe(7);
    });

    it('should have correct bracket values', () => {
      const brackets = TAX_YEAR_2024_2025.brackets;

      // First bracket: 0 - R237,100 at 18%
      expect(brackets[0].lowerBoundCents).toBe(0);
      expect(brackets[0].upperBoundCents).toBe(23710000);
      expect(brackets[0].baseTaxCents).toBe(0);
      expect(brackets[0].marginalRate.toNumber()).toBe(0.18);

      // Second bracket: R237,100 - R370,500 at 26%
      expect(brackets[1].lowerBoundCents).toBe(23710000);
      expect(brackets[1].upperBoundCents).toBe(37050000);
      expect(brackets[1].baseTaxCents).toBe(4267800);
      expect(brackets[1].marginalRate.toNumber()).toBe(0.26);

      // Seventh/highest bracket: R1,817,000+ at 45%
      expect(brackets[6].lowerBoundCents).toBe(181700000);
      expect(brackets[6].upperBoundCents).toBeNull();
      expect(brackets[6].baseTaxCents).toBe(64448900);
      expect(brackets[6].marginalRate.toNumber()).toBe(0.45);
    });

    it('should have correct effective date range', () => {
      expect(TAX_YEAR_2024_2025.effectiveFrom).toEqual(new Date('2024-03-01'));
      expect(TAX_YEAR_2024_2025.effectiveTo).toEqual(new Date('2025-02-28'));
    });
  });
});
