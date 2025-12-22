/**
 * SARS Context Validator
 * TASK-AGENT-004: SARS Calculation Agent
 *
 * @module agents/sars-agent/context-validator
 * @description Validates SARS calculations against .claude/context/sars_tables_2025.json.
 * Ensures tax brackets, rebates, and UIF values match official SARS tables.
 *
 * All monetary values in CENTS (integers)
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SarsTablesContext {
  version: string;
  effectiveFrom: string;
  effectiveTo: string;
  source: string;
  paye: {
    taxYear: string;
    description: string;
    taxBrackets: Array<{
      bracketNumber: number;
      fromCents: number;
      toCents: number;
      rate: number;
      baseTaxCents: number;
    }>;
    rebates: {
      description: string;
      primary: { amountCents: number; ageRequirement: number | null };
      secondary: { amountCents: number; ageRequirement: number };
      tertiary: { amountCents: number; ageRequirement: number };
    };
    taxThresholds: {
      description: string;
      under65: number;
      age65to74: number;
      age75plus: number;
    };
  };
  uif: {
    description: string;
    employeeRate: number;
    employerRate: number;
    maxMonthlyEarningsCents: number;
    maxMonthlyContributionCents: number;
  };
  vat: {
    description: string;
    standardRate: number;
    zeroRatedItems: string[];
    exemptItems: string[];
    registrationThresholdCents: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class SarsContextValidator implements OnModuleInit {
  private readonly logger = new Logger(SarsContextValidator.name);
  private context: SarsTablesContext | null = null;
  private readonly contextPath = path.join(
    process.cwd(),
    '.claude/context/sars_tables_2025.json',
  );

  async onModuleInit(): Promise<void> {
    await this.loadContext();
  }

  /**
   * Load SARS tables context from JSON file
   */
  async loadContext(): Promise<SarsTablesContext> {
    try {
      const rawContent = await fs.readFile(this.contextPath, 'utf-8');
      this.context = JSON.parse(rawContent) as SarsTablesContext;
      this.logger.log(
        `Loaded SARS tables ${this.context.version} effective from ${this.context.effectiveFrom}`,
      );
      return this.context;
    } catch (error) {
      throw new Error(
        `Failed to load SARS context: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get loaded context
   */
  getContext(): SarsTablesContext {
    if (!this.context) {
      throw new Error(
        'SARS context not loaded. Call loadContext() first or wait for module init.',
      );
    }
    return this.context;
  }

  /**
   * Validate PAYE calculation against context
   *
   * @param annualIncomeCents - Annual income in cents
   * @param calculatedTaxCents - Calculated tax in cents (annual, before rebates)
   * @returns Validation result
   */
  validatePayeCalculation(
    annualIncomeCents: number,
    calculatedTaxCents: number,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.context) {
      return {
        isValid: false,
        errors: ['SARS context not loaded'],
        warnings: [],
      };
    }

    // Find applicable bracket
    const brackets = this.context.paye.taxBrackets;
    const bracket = brackets.find(
      (b) => annualIncomeCents >= b.fromCents && annualIncomeCents <= b.toCents,
    );

    if (!bracket) {
      warnings.push(
        `Income ${annualIncomeCents} cents outside defined brackets`,
      );
    } else {
      // Calculate expected tax
      const incomeAboveMin = annualIncomeCents - bracket.fromCents;
      const expectedTax =
        bracket.baseTaxCents + Math.round(incomeAboveMin * bracket.rate);
      const tolerance = Math.max(100, expectedTax * 0.001); // 0.1% tolerance or R1

      if (Math.abs(calculatedTaxCents - expectedTax) > tolerance) {
        errors.push(
          `PAYE mismatch: calculated ${calculatedTaxCents}, expected ${expectedTax} (diff: ${calculatedTaxCents - expectedTax})`,
        );
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate UIF calculation against context
   *
   * @param grossRemunerationCents - Gross remuneration in cents
   * @param calculatedContributionCents - Calculated total UIF in cents
   * @returns Validation result
   */
  validateUifCalculation(
    grossRemunerationCents: number,
    calculatedContributionCents: number,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.context) {
      return {
        isValid: false,
        errors: ['SARS context not loaded'],
        warnings: [],
      };
    }

    const uif = this.context.uif;
    const cappedRemuneration = Math.min(
      grossRemunerationCents,
      uif.maxMonthlyEarningsCents,
    );
    const expectedTotal = Math.round(
      cappedRemuneration * (uif.employeeRate + uif.employerRate),
    );
    const maxTotal = uif.maxMonthlyContributionCents * 2;

    // Check cap
    if (calculatedContributionCents > maxTotal) {
      errors.push(
        `UIF exceeds maximum: calculated ${calculatedContributionCents}, max ${maxTotal}`,
      );
    }

    // Check calculation (allow R1 tolerance)
    if (Math.abs(calculatedContributionCents - expectedTotal) > 100) {
      errors.push(
        `UIF mismatch: calculated ${calculatedContributionCents}, expected ${expectedTotal}`,
      );
    }

    if (grossRemunerationCents > uif.maxMonthlyEarningsCents) {
      warnings.push(
        'Gross remuneration exceeds UIF ceiling - contribution capped',
      );
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate VAT calculation against context
   *
   * @param baseCents - Base amount in cents
   * @param calculatedVatCents - Calculated VAT in cents
   * @returns Validation result
   */
  validateVatCalculation(
    baseCents: number,
    calculatedVatCents: number,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.context) {
      return {
        isValid: false,
        errors: ['SARS context not loaded'],
        warnings: [],
      };
    }

    const expectedVat = Math.round(baseCents * this.context.vat.standardRate);
    const tolerance = Math.max(1, expectedVat * 0.001); // 0.1% or 1 cent

    if (Math.abs(calculatedVatCents - expectedVat) > tolerance) {
      errors.push(
        `VAT mismatch: calculated ${calculatedVatCents}, expected ${expectedVat} (diff: ${calculatedVatCents - expectedVat})`,
      );
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Get primary rebate amount
   */
  getPrimaryRebateCents(): number {
    if (!this.context) {
      throw new Error('SARS context not loaded');
    }
    return this.context.paye.rebates.primary.amountCents;
  }

  /**
   * Get secondary rebate amount (for age 65+)
   */
  getSecondaryRebateCents(): number {
    if (!this.context) {
      throw new Error('SARS context not loaded');
    }
    return this.context.paye.rebates.secondary.amountCents;
  }

  /**
   * Get tertiary rebate amount (for age 75+)
   */
  getTertiaryRebateCents(): number {
    if (!this.context) {
      throw new Error('SARS context not loaded');
    }
    return this.context.paye.rebates.tertiary.amountCents;
  }

  /**
   * Get VAT rate
   */
  getVatRate(): number {
    if (!this.context) {
      throw new Error('SARS context not loaded');
    }
    return this.context.vat.standardRate;
  }

  /**
   * Get UIF rates
   */
  getUifRates(): {
    employeeRate: number;
    employerRate: number;
    maxContributionCents: number;
  } {
    if (!this.context) {
      throw new Error('SARS context not loaded');
    }
    return {
      employeeRate: this.context.uif.employeeRate,
      employerRate: this.context.uif.employerRate,
      maxContributionCents: this.context.uif.maxMonthlyContributionCents,
    };
  }
}
