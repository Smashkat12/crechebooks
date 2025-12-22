/**
 * UIF Calculation DTOs and Interfaces
 * TASK-SARS-013
 *
 * Unemployment Insurance Fund (UIF) for South Africa
 * All monetary values in CENTS (integers)
 */

/**
 * Result of UIF calculation
 * All amounts in CENTS
 */
export interface UifCalculationResult {
  /** Gross remuneration in cents */
  grossRemunerationCents: number;

  /** Capped remuneration in cents (max R17,712) */
  cappedRemunerationCents: number;

  /** Employee contribution in cents (1%) */
  employeeContributionCents: number;

  /** Employer contribution in cents (1%) */
  employerContributionCents: number;

  /** Total contribution in cents (2%) */
  totalContributionCents: number;

  /** Whether remuneration exceeds the UIF cap */
  isAboveCap: boolean;
}

/**
 * DTO for UIF calculation request
 */
export interface CalculateUifDto {
  /** Gross monthly remuneration in cents */
  grossRemunerationCents: number;
}
