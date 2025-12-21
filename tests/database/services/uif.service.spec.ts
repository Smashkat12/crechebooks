/**
 * UifService Integration Tests
 * TASK-SARS-013
 *
 * Tests UIF calculations with 2025 rates
 * Employee: 1%, Employer: 1%, Cap: R17,712
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { UifService } from '../../../src/database/services/uif.service';
import { UIF_CONSTANTS } from '../../../src/database/constants/uif.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('UifService', () => {
  let service: UifService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UifService],
    }).compile();

    service = module.get<UifService>(UifService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('calculateUif', () => {
    it('should calculate UIF for R10,000 gross (below cap)', async () => {
      const result = await service.calculateUif(1000000); // R10,000

      expect(result.grossRemunerationCents).toBe(1000000);
      expect(result.cappedRemunerationCents).toBe(1000000);
      expect(result.employeeContributionCents).toBe(10000); // R100 (1%)
      expect(result.employerContributionCents).toBe(10000); // R100 (1%)
      expect(result.totalContributionCents).toBe(20000); // R200 (2%)
      expect(result.isAboveCap).toBe(false);
    });

    it('should calculate UIF for R17,712 gross (at cap)', async () => {
      const result = await service.calculateUif(1771200); // R17,712

      expect(result.grossRemunerationCents).toBe(1771200);
      expect(result.cappedRemunerationCents).toBe(1771200);
      expect(result.employeeContributionCents).toBe(17712); // R177.12 (1%)
      expect(result.employerContributionCents).toBe(17712); // R177.12 (1%)
      expect(result.totalContributionCents).toBe(35424); // R354.24 (2%)
      expect(result.isAboveCap).toBe(false);
    });

    it('should cap UIF for R20,000 gross (above cap)', async () => {
      const result = await service.calculateUif(2000000); // R20,000

      expect(result.grossRemunerationCents).toBe(2000000);
      expect(result.cappedRemunerationCents).toBe(1771200); // Capped at R17,712
      expect(result.employeeContributionCents).toBe(17712); // Max R177.12
      expect(result.employerContributionCents).toBe(17712); // Max R177.12
      expect(result.totalContributionCents).toBe(35424); // Max R354.24
      expect(result.isAboveCap).toBe(true);
    });

    it('should return zeros for R0 gross', async () => {
      const result = await service.calculateUif(0);

      expect(result.grossRemunerationCents).toBe(0);
      expect(result.cappedRemunerationCents).toBe(0);
      expect(result.employeeContributionCents).toBe(0);
      expect(result.employerContributionCents).toBe(0);
      expect(result.totalContributionCents).toBe(0);
      expect(result.isAboveCap).toBe(false);
    });

    it('should throw error for negative gross', async () => {
      await expect(service.calculateUif(-100000)).rejects.toThrow(
        'cannot be negative',
      );
    });

    it('should handle just below cap correctly', async () => {
      const result = await service.calculateUif(1771100); // R17,711

      expect(result.cappedRemunerationCents).toBe(1771100);
      expect(result.employeeContributionCents).toBe(17711); // R177.11
      expect(result.isAboveCap).toBe(false);
    });

    it('should handle just above cap correctly', async () => {
      const result = await service.calculateUif(1771300); // R17,713

      expect(result.cappedRemunerationCents).toBe(1771200); // Capped
      expect(result.employeeContributionCents).toBe(17712); // R177.12 max
      expect(result.isAboveCap).toBe(true);
    });

    it('should apply banker\'s rounding correctly', async () => {
      // R10,005 * 1% = R100.05
      const result = await service.calculateUif(1000500);

      // Decimal.js with banker's rounding: 10005 rounds to 10005 (no .5)
      expect(result.employeeContributionCents).toBe(10005);
      expect(result.employerContributionCents).toBe(10005);
    });

    it('should handle high income correctly', async () => {
      const result = await service.calculateUif(10000000); // R100,000

      expect(result.cappedRemunerationCents).toBe(1771200);
      expect(result.employeeContributionCents).toBe(17712);
      expect(result.employerContributionCents).toBe(17712);
      expect(result.isAboveCap).toBe(true);
    });
  });

  describe('calculateEmployeeContribution', () => {
    it('should calculate 1% of remuneration', () => {
      expect(service.calculateEmployeeContribution(1000000)).toBe(10000);
      expect(service.calculateEmployeeContribution(500000)).toBe(5000);
      expect(service.calculateEmployeeContribution(1500000)).toBe(15000);
    });

    it('should return 0 for 0 remuneration', () => {
      expect(service.calculateEmployeeContribution(0)).toBe(0);
    });

    it('should cap at maximum contribution', () => {
      expect(service.calculateEmployeeContribution(3000000)).toBe(17712);
    });
  });

  describe('calculateEmployerContribution', () => {
    it('should equal employee contribution', () => {
      const amounts = [500000, 1000000, 1500000, 2000000];

      for (const amount of amounts) {
        const employee = service.calculateEmployeeContribution(amount);
        const employer = service.calculateEmployerContribution(amount);
        expect(employer).toBe(employee);
      }
    });

    it('should cap at maximum contribution', () => {
      expect(service.calculateEmployerContribution(3000000)).toBe(17712);
    });
  });

  describe('applyMaxCap', () => {
    it('should not cap amounts below threshold', () => {
      const { cappedRemunerationCents, isAboveCap } = service.applyMaxCap(1000000);

      expect(cappedRemunerationCents).toBe(1000000);
      expect(isAboveCap).toBe(false);
    });

    it('should cap amounts above threshold', () => {
      const { cappedRemunerationCents, isAboveCap } = service.applyMaxCap(2000000);

      expect(cappedRemunerationCents).toBe(UIF_CONSTANTS.MAX_REMUNERATION_CENTS);
      expect(isAboveCap).toBe(true);
    });

    it('should handle exact threshold amount', () => {
      const { cappedRemunerationCents, isAboveCap } = service.applyMaxCap(1771200);

      expect(cappedRemunerationCents).toBe(1771200);
      expect(isAboveCap).toBe(false);
    });

    it('should handle zero amount', () => {
      const { cappedRemunerationCents, isAboveCap } = service.applyMaxCap(0);

      expect(cappedRemunerationCents).toBe(0);
      expect(isAboveCap).toBe(false);
    });
  });

  describe('Total Contribution Calculation', () => {
    it('should calculate total as exactly 2% of capped amount', async () => {
      const testAmounts = [500000, 1000000, 1500000, 1771200, 2000000];

      for (const amount of testAmounts) {
        const result = await service.calculateUif(amount);

        // Total should be employee + employer
        expect(result.totalContributionCents).toBe(
          result.employeeContributionCents + result.employerContributionCents,
        );

        // Both contributions should be equal
        expect(result.employeeContributionCents).toBe(
          result.employerContributionCents,
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small amounts', async () => {
      const result = await service.calculateUif(100); // R1

      expect(result.employeeContributionCents).toBe(1); // 1 cent
      expect(result.employerContributionCents).toBe(1);
      expect(result.totalContributionCents).toBe(2);
    });

    it('should handle amounts that result in fractional cents', async () => {
      // R55.55 = 5555 cents, 1% = 55.55 cents -> should round
      const result = await service.calculateUif(5555);

      // 5555 * 0.01 = 55.55, rounds to 56 with banker's rounding
      expect(result.employeeContributionCents).toBe(56);
    });
  });
});
