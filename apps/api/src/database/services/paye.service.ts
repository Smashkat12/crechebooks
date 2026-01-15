/**
 * PayeService - PAYE Calculation Service
 * TASK-SARS-012
 *
 * Calculates Pay-As-You-Earn tax for South African employees.
 * Uses 2025 SARS tax tables, rebates, and medical aid credits.
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PayFrequency } from '@prisma/client';
import {
  PayeCalculationResult,
  CalculatePayeDto,
  RebateType,
} from '../dto/paye.dto';
import {
  TAX_BRACKETS_2025,
  REBATES_2025,
  MEDICAL_CREDITS_2025,
  TAX_THRESHOLDS_2025,
  PAY_FREQUENCY_MULTIPLIERS,
  PayeTaxBracket,
} from '../constants/paye.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class PayeService {
  private readonly logger = new Logger(PayeService.name);

  /**
   * Calculate PAYE for an employee
   *
   * @param dto - Calculation parameters
   * @returns PAYE calculation result with full breakdown
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async calculatePaye(dto: CalculatePayeDto): Promise<PayeCalculationResult> {
    const { grossIncomeCents, payFrequency, dateOfBirth, medicalAidMembers } =
      dto;

    this.logger.log(
      `Calculating PAYE for gross ${grossIncomeCents} cents, frequency ${payFrequency}`,
    );

    // Validate inputs
    if (grossIncomeCents < 0) {
      throw new Error(
        'PAYE calculation failed: grossIncomeCents cannot be negative',
      );
    }
    if (!dateOfBirth) {
      throw new Error('PAYE calculation failed: dateOfBirth is required');
    }
    if (medicalAidMembers < 0) {
      throw new Error(
        'PAYE calculation failed: medicalAidMembers cannot be negative',
      );
    }

    // Step 1: Annualize income
    const annualizedIncomeCents = this.annualizeEarnings(
      grossIncomeCents,
      payFrequency,
    );

    // Step 2: Get tax bracket
    const { bracket, bracketIndex } = this.getTaxBracket(annualizedIncomeCents);

    // Step 3: Calculate tax before rebates
    const taxBeforeRebatesCents = this.calculateTaxOnIncome(
      annualizedIncomeCents,
      bracket,
    );

    // Step 4: Calculate rebates based on age
    const age = this.calculateAge(dateOfBirth);
    const primaryRebateCents = REBATES_2025.PRIMARY;
    const secondaryRebateCents = age >= 65 ? REBATES_2025.SECONDARY : 0;
    const tertiaryRebateCents = age >= 75 ? REBATES_2025.TERTIARY : 0;
    const totalRebatesCents =
      primaryRebateCents + secondaryRebateCents + tertiaryRebateCents;

    // Step 5: Annual tax after rebates (floor at 0)
    let taxAfterRebatesCents = taxBeforeRebatesCents - totalRebatesCents;
    if (taxAfterRebatesCents < 0) {
      taxAfterRebatesCents = 0;
    }

    // Step 6: Convert to monthly PAYE
    const monthlyPayeCents = new Decimal(taxAfterRebatesCents)
      .div(12)
      .round()
      .toNumber();

    // Step 7: Calculate medical aid tax credits (monthly)
    const medicalCreditsCents = this.calculateMedicalCredits(medicalAidMembers);

    // Step 8: Net PAYE (after medical credits, floor at 0)
    let netPayeCents = monthlyPayeCents - medicalCreditsCents;
    if (netPayeCents < 0) {
      netPayeCents = 0;
    }

    // Step 9: Calculate effective rate
    const effectiveRatePercent =
      grossIncomeCents > 0
        ? new Decimal(netPayeCents)
            .div(grossIncomeCents)
            .mul(100)
            .toDecimalPlaces(2)
            .toNumber()
        : 0;

    return {
      grossIncomeCents,
      annualizedIncomeCents,
      taxBeforeRebatesCents,
      primaryRebateCents,
      secondaryRebateCents,
      tertiaryRebateCents,
      totalRebatesCents,
      taxAfterRebatesCents,
      medicalCreditsCents,
      netPayeCents,
      effectiveRatePercent,
      bracketIndex,
    };
  }

  /**
   * Get the applicable tax bracket for an annual income
   *
   * @param annualIncomeCents - Annual income in cents
   * @returns Tax bracket and index
   */
  getTaxBracket(annualIncomeCents: number): {
    bracket: PayeTaxBracket;
    bracketIndex: number;
  } {
    for (let i = TAX_BRACKETS_2025.length - 1; i >= 0; i--) {
      const bracket = TAX_BRACKETS_2025[i];
      if (annualIncomeCents >= bracket.minIncomeCents) {
        return { bracket, bracketIndex: i };
      }
    }

    // Default to first bracket
    return { bracket: TAX_BRACKETS_2025[0], bracketIndex: 0 };
  }

  /**
   * Calculate applicable rebate based on age
   *
   * @param dateOfBirth - Employee's date of birth
   * @param rebateType - Optional specific rebate type to calculate
   * @returns Rebate amount in cents (annual)
   */
  calculateRebate(dateOfBirth: Date, rebateType?: RebateType): number {
    if (rebateType) {
      return REBATES_2025[rebateType];
    }

    const age = this.calculateAge(dateOfBirth);
    let total = REBATES_2025.PRIMARY;

    if (age >= 65) {
      total += REBATES_2025.SECONDARY;
    }
    if (age >= 75) {
      total += REBATES_2025.TERTIARY;
    }

    return total;
  }

  /**
   * Calculate medical aid tax credits
   *
   * @param medicalAidMembers - Number of members on medical aid
   * @returns Monthly credit amount in cents
   */
  calculateMedicalCredits(medicalAidMembers: number): number {
    if (medicalAidMembers <= 0) {
      return 0;
    }

    if (medicalAidMembers === 1) {
      // Main member only
      return MEDICAL_CREDITS_2025.MAIN_MEMBER;
    }

    if (medicalAidMembers === 2) {
      // Main + first dependent
      return (
        MEDICAL_CREDITS_2025.MAIN_MEMBER + MEDICAL_CREDITS_2025.FIRST_DEPENDENT
      );
    }

    // Main + first dependent + additional dependents
    const additionalDependents = medicalAidMembers - 2;
    return (
      MEDICAL_CREDITS_2025.MAIN_MEMBER +
      MEDICAL_CREDITS_2025.FIRST_DEPENDENT +
      MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENT * additionalDependents
    );
  }

  /**
   * Annualize earnings based on pay frequency
   *
   * @param grossIncomeCents - Gross income for pay period in cents
   * @param payFrequency - Pay frequency
   * @returns Annual income in cents
   */
  annualizeEarnings(
    grossIncomeCents: number,
    payFrequency: PayFrequency,
  ): number {
    const multiplier = PAY_FREQUENCY_MULTIPLIERS[payFrequency];
    if (!multiplier) {
      throw new Error(
        `PAYE calculation failed: Invalid pay frequency ${payFrequency}`,
      );
    }
    return grossIncomeCents * multiplier;
  }

  /**
   * Get tax threshold based on age
   *
   * @param age - Employee's age
   * @returns Annual tax threshold in cents
   */
  getTaxThreshold(age: number): number {
    if (age >= 75) {
      return TAX_THRESHOLDS_2025.AGE_75_PLUS;
    }
    if (age >= 65) {
      return TAX_THRESHOLDS_2025.AGE_65_TO_74;
    }
    return TAX_THRESHOLDS_2025.BELOW_65;
  }

  /**
   * Check if income is below tax threshold
   *
   * @param annualIncomeCents - Annual income in cents
   * @param age - Employee's age
   * @returns True if below threshold
   */
  isBelowThreshold(annualIncomeCents: number, age: number): boolean {
    return annualIncomeCents < this.getTaxThreshold(age);
  }

  /**
   * Calculate age from date of birth
   *
   * @param dateOfBirth - Date of birth
   * @returns Age in years
   */
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())
    ) {
      age--;
    }

    return age;
  }

  /**
   * Calculate tax on income using tax bracket
   *
   * @param annualIncomeCents - Annual income in cents
   * @param bracket - Applicable tax bracket
   * @returns Tax amount in cents (annual)
   */
  private calculateTaxOnIncome(
    annualIncomeCents: number,
    bracket: PayeTaxBracket,
  ): number {
    if (annualIncomeCents <= 0) {
      return 0;
    }

    // Tax = Base Amount + (Income above bracket floor) * Rate
    const incomeAboveThreshold = new Decimal(annualIncomeCents).minus(
      bracket.minIncomeCents,
    );

    if (incomeAboveThreshold.lessThan(0)) {
      return bracket.baseAmountCents;
    }

    const tax = new Decimal(bracket.baseAmountCents).plus(
      incomeAboveThreshold.mul(bracket.rate),
    );

    return tax.round().toNumber();
  }
}
