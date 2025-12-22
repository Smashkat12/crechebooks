/**
 * UifService - UIF Calculation Service
 * TASK-SARS-013
 *
 * Calculates Unemployment Insurance Fund contributions for South African employees.
 * - Employee contribution: 1% of gross remuneration
 * - Employer contribution: 1% of gross remuneration
 * - Maximum monthly remuneration: R17,712 (2025)
 * - Maximum contribution per party: R177.12
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { UifCalculationResult } from '../dto/uif.dto';
import { UIF_CONSTANTS } from '../constants/uif.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class UifService {
  private readonly logger = new Logger(UifService.name);

  /**
   * Calculate UIF contributions for an employee
   *
   * @param grossRemunerationCents - Gross monthly remuneration in cents
   * @returns UIF calculation result with employee and employer contributions
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async calculateUif(
    grossRemunerationCents: number,
  ): Promise<UifCalculationResult> {
    this.logger.log(
      `Calculating UIF for gross ${grossRemunerationCents} cents`,
    );

    // Validate input
    if (grossRemunerationCents < 0) {
      throw new Error(
        'UIF calculation failed: grossRemunerationCents cannot be negative',
      );
    }

    // Apply cap
    const { cappedRemunerationCents, isAboveCap } = this.applyMaxCap(
      grossRemunerationCents,
    );

    // Calculate contributions
    const employeeContributionCents = this.calculateEmployeeContribution(
      cappedRemunerationCents,
    );
    const employerContributionCents = this.calculateEmployerContribution(
      cappedRemunerationCents,
    );
    const totalContributionCents =
      employeeContributionCents + employerContributionCents;

    return {
      grossRemunerationCents,
      cappedRemunerationCents,
      employeeContributionCents,
      employerContributionCents,
      totalContributionCents,
      isAboveCap,
    };
  }

  /**
   * Calculate employee UIF contribution (1%)
   *
   * @param grossRemunerationCents - Gross remuneration in cents
   * @returns Employee contribution in cents
   */
  calculateEmployeeContribution(grossRemunerationCents: number): number {
    if (grossRemunerationCents <= 0) {
      return 0;
    }

    const contribution = new Decimal(grossRemunerationCents)
      .mul(UIF_CONSTANTS.EMPLOYEE_RATE)
      .round()
      .toNumber();

    // Ensure doesn't exceed maximum
    return Math.min(
      contribution,
      UIF_CONSTANTS.MAX_EMPLOYEE_CONTRIBUTION_CENTS,
    );
  }

  /**
   * Calculate employer UIF contribution (1%)
   * Same as employee contribution
   *
   * @param grossRemunerationCents - Gross remuneration in cents
   * @returns Employer contribution in cents
   */
  calculateEmployerContribution(grossRemunerationCents: number): number {
    if (grossRemunerationCents <= 0) {
      return 0;
    }

    const contribution = new Decimal(grossRemunerationCents)
      .mul(UIF_CONSTANTS.EMPLOYER_RATE)
      .round()
      .toNumber();

    // Ensure doesn't exceed maximum
    return Math.min(
      contribution,
      UIF_CONSTANTS.MAX_EMPLOYER_CONTRIBUTION_CENTS,
    );
  }

  /**
   * Apply maximum remuneration cap
   *
   * @param remunerationCents - Gross remuneration in cents
   * @returns Capped remuneration and flag indicating if capped
   */
  applyMaxCap(remunerationCents: number): {
    cappedRemunerationCents: number;
    isAboveCap: boolean;
  } {
    if (remunerationCents <= 0) {
      return {
        cappedRemunerationCents: 0,
        isAboveCap: false,
      };
    }

    if (remunerationCents > UIF_CONSTANTS.MAX_REMUNERATION_CENTS) {
      return {
        cappedRemunerationCents: UIF_CONSTANTS.MAX_REMUNERATION_CENTS,
        isAboveCap: true,
      };
    }

    return {
      cappedRemunerationCents: remunerationCents,
      isAboveCap: false,
    };
  }
}
