/**
 * TaxTableService - Configurable Tax Tables Service
 * TASK-STAFF-005: Make Tax Tables Configurable
 *
 * Provides configurable tax year and bracket management for SARS PAYE calculations.
 * Supports multiple tax years with effective date ranges and caching for performance.
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  TaxYear,
  TaxBracket,
  CreateTaxYearDto,
  UpdateTaxYearDto,
  CreateTaxBracketDto,
  TaxTablePayeResult,
  AgeCategory,
  TAX_YEAR_2024_2025,
  TAX_YEAR_2025_2026,
  TAX_TABLE_CACHE_TTL,
  TAX_TABLE_CACHE_KEY,
} from '../constants/tax-tables.constants';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * In-memory cache entry
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class TaxTableService {
  private readonly logger = new Logger(TaxTableService.name);

  /**
   * In-memory tax year storage (for non-database mode)
   * In production, this would be replaced with PrismaService queries
   */
  private taxYears: Map<string, TaxYear> = new Map();

  /**
   * Simple in-memory cache for tax tables
   */
  private cache: Map<string, CacheEntry<TaxYear>> = new Map();

  constructor() {
    this.initializeDefaultTaxYears();
  }

  /**
   * Initialize default tax years from seed data
   */
  private initializeDefaultTaxYears(): void {
    // Seed 2024/2025 tax year
    const taxYear2024 = this.createTaxYearFromSeed(TAX_YEAR_2024_2025);
    this.taxYears.set(taxYear2024.id, taxYear2024);

    // Seed 2025/2026 tax year
    const taxYear2025 = this.createTaxYearFromSeed(TAX_YEAR_2025_2026);
    this.taxYears.set(taxYear2025.id, taxYear2025);

    this.logger.log(
      `Initialized ${this.taxYears.size} tax years from seed data`,
    );
  }

  /**
   * Create a TaxYear object from seed data
   */
  private createTaxYearFromSeed(
    seed: Omit<TaxYear, 'id' | 'brackets' | 'createdAt' | 'updatedAt'> & {
      brackets: Omit<TaxBracket, 'id' | 'taxYearId'>[];
    },
  ): TaxYear {
    const taxYearId = `tax-year-${seed.yearCode.replace('/', '-')}`;
    const now = new Date();

    const brackets: TaxBracket[] = seed.brackets.map((b, index) => ({
      ...b,
      id: `bracket-${taxYearId}-${index + 1}`,
      taxYearId,
    }));

    return {
      id: taxYearId,
      yearCode: seed.yearCode,
      effectiveFrom: seed.effectiveFrom,
      effectiveTo: seed.effectiveTo,
      isActive: seed.isActive,
      primaryRebateCents: seed.primaryRebateCents,
      secondaryRebateCents: seed.secondaryRebateCents,
      tertiaryRebateCents: seed.tertiaryRebateCents,
      taxThresholdCents: seed.taxThresholdCents,
      taxThresholdOver65Cents: seed.taxThresholdOver65Cents,
      taxThresholdOver75Cents: seed.taxThresholdOver75Cents,
      medicalCreditsMainCents: seed.medicalCreditsMainCents,
      medicalCreditsFirstDependentCents: seed.medicalCreditsFirstDependentCents,
      medicalCreditsOtherDependentsCents:
        seed.medicalCreditsOtherDependentsCents,
      brackets,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get tax year for a specific date
   *
   * @param date - Date to find tax year for
   * @returns TaxYear that is effective for the given date
   * @throws NotFoundException if no active tax year found
   */
  getTaxYearForDate(date: Date): TaxYear {
    const cacheKey = `${TAX_TABLE_CACHE_KEY}:${date.toISOString().split('T')[0]}`;
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      return cached;
    }

    const dateTime = date.getTime();
    let foundTaxYear: TaxYear | undefined;

    for (const taxYear of this.taxYears.values()) {
      if (
        taxYear.isActive &&
        dateTime >= taxYear.effectiveFrom.getTime() &&
        dateTime <= taxYear.effectiveTo.getTime()
      ) {
        foundTaxYear = taxYear;
        break;
      }
    }

    if (!foundTaxYear) {
      throw new NotFoundException(
        `No active tax year found for date: ${date.toISOString().split('T')[0]}`,
      );
    }

    this.setToCache(cacheKey, foundTaxYear);
    return foundTaxYear;
  }

  /**
   * Get current tax year based on today's date
   *
   * @returns Current TaxYear
   */
  getCurrentTaxYear(): TaxYear {
    return this.getTaxYearForDate(new Date());
  }

  /**
   * Get tax year by ID
   *
   * @param id - Tax year ID
   * @returns TaxYear
   * @throws NotFoundException if not found
   */
  getTaxYearById(id: string): TaxYear {
    const taxYear = this.taxYears.get(id);

    if (!taxYear) {
      throw new NotFoundException(`Tax year not found: ${id}`);
    }

    return taxYear;
  }

  /**
   * Get tax year by year code
   *
   * @param yearCode - Tax year code (e.g., '2024/2025')
   * @returns TaxYear
   * @throws NotFoundException if not found
   */
  getTaxYearByCode(yearCode: string): TaxYear {
    for (const taxYear of this.taxYears.values()) {
      if (taxYear.yearCode === yearCode) {
        return taxYear;
      }
    }

    throw new NotFoundException(`Tax year not found: ${yearCode}`);
  }

  /**
   * Get all tax years
   *
   * @returns Array of all TaxYear objects, sorted by effectiveFrom descending
   */
  getAllTaxYears(): TaxYear[] {
    return Array.from(this.taxYears.values()).sort(
      (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
    );
  }

  /**
   * Create a new tax year
   *
   * @param dto - Tax year creation data
   * @param userId - User ID for audit trail
   * @returns Created TaxYear
   * @throws BadRequestException if validation fails
   */
  createTaxYear(dto: CreateTaxYearDto, userId?: string): TaxYear {
    // Validate year code format
    if (!/^\d{4}\/\d{4}$/.test(dto.yearCode)) {
      throw new BadRequestException(
        `Invalid year code format: ${dto.yearCode}. Expected format: YYYY/YYYY`,
      );
    }

    // Check for duplicate year code
    for (const taxYear of this.taxYears.values()) {
      if (taxYear.yearCode === dto.yearCode) {
        throw new BadRequestException(
          `Tax year already exists: ${dto.yearCode}`,
        );
      }
    }

    // Check for overlapping date ranges
    const overlapping = this.findOverlappingTaxYear(
      dto.effectiveFrom,
      dto.effectiveTo,
    );
    if (overlapping) {
      throw new BadRequestException(
        `Tax year overlaps with existing year: ${overlapping.yearCode}`,
      );
    }

    // Validate brackets
    this.validateBrackets(dto.brackets);

    const taxYearId = `tax-year-${dto.yearCode.replace('/', '-')}-${Date.now()}`;
    const now = new Date();

    const brackets: TaxBracket[] = dto.brackets.map((b, index) => ({
      id: `bracket-${taxYearId}-${index + 1}`,
      taxYearId,
      lowerBoundCents: b.lowerBoundCents,
      upperBoundCents: b.upperBoundCents,
      baseTaxCents: b.baseTaxCents,
      marginalRate: new Decimal(b.marginalRate),
      bracketOrder: b.bracketOrder,
    }));

    const taxYear: TaxYear = {
      id: taxYearId,
      yearCode: dto.yearCode,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      isActive: true,
      primaryRebateCents: dto.primaryRebateCents,
      secondaryRebateCents: dto.secondaryRebateCents,
      tertiaryRebateCents: dto.tertiaryRebateCents,
      taxThresholdCents: dto.taxThresholdCents,
      taxThresholdOver65Cents: dto.taxThresholdOver65Cents,
      taxThresholdOver75Cents: dto.taxThresholdOver75Cents,
      medicalCreditsMainCents: dto.medicalCreditsMainCents,
      medicalCreditsFirstDependentCents: dto.medicalCreditsFirstDependentCents,
      medicalCreditsOtherDependentsCents:
        dto.medicalCreditsOtherDependentsCents,
      brackets,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };

    this.taxYears.set(taxYearId, taxYear);
    this.clearCache();

    this.logger.log(
      `Tax year ${dto.yearCode} created by ${userId || 'system'}`,
    );

    return taxYear;
  }

  /**
   * Update a tax year
   *
   * @param id - Tax year ID
   * @param dto - Update data
   * @param userId - User ID for audit trail
   * @returns Updated TaxYear
   */
  updateTaxYear(id: string, dto: UpdateTaxYearDto, userId?: string): TaxYear {
    const existing = this.getTaxYearById(id);

    if (dto.brackets) {
      this.validateBrackets(dto.brackets);
    }

    const now = new Date();

    // Create updated brackets if provided
    let brackets = existing.brackets;
    if (dto.brackets) {
      brackets = dto.brackets.map((b, index) => ({
        id: `bracket-${id}-${index + 1}-${Date.now()}`,
        taxYearId: id,
        lowerBoundCents: b.lowerBoundCents,
        upperBoundCents: b.upperBoundCents,
        baseTaxCents: b.baseTaxCents,
        marginalRate: new Decimal(b.marginalRate),
        bracketOrder: b.bracketOrder,
      }));
    }

    const updated: TaxYear = {
      ...existing,
      yearCode: dto.yearCode ?? existing.yearCode,
      effectiveFrom: dto.effectiveFrom ?? existing.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? existing.effectiveTo,
      isActive: dto.isActive ?? existing.isActive,
      primaryRebateCents: dto.primaryRebateCents ?? existing.primaryRebateCents,
      secondaryRebateCents:
        dto.secondaryRebateCents ?? existing.secondaryRebateCents,
      tertiaryRebateCents:
        dto.tertiaryRebateCents ?? existing.tertiaryRebateCents,
      taxThresholdCents: dto.taxThresholdCents ?? existing.taxThresholdCents,
      taxThresholdOver65Cents:
        dto.taxThresholdOver65Cents ?? existing.taxThresholdOver65Cents,
      taxThresholdOver75Cents:
        dto.taxThresholdOver75Cents ?? existing.taxThresholdOver75Cents,
      medicalCreditsMainCents:
        dto.medicalCreditsMainCents ?? existing.medicalCreditsMainCents,
      medicalCreditsFirstDependentCents:
        dto.medicalCreditsFirstDependentCents ??
        existing.medicalCreditsFirstDependentCents,
      medicalCreditsOtherDependentsCents:
        dto.medicalCreditsOtherDependentsCents ??
        existing.medicalCreditsOtherDependentsCents,
      brackets,
      updatedAt: now,
      updatedBy: userId,
    };

    this.taxYears.set(id, updated);
    this.clearCache();

    this.logger.log(
      `Tax year ${existing.yearCode} updated by ${userId || 'system'}`,
    );

    return updated;
  }

  /**
   * Calculate PAYE for a given annual income
   *
   * @param annualIncomeCents - Annual taxable income in cents
   * @param age - Employee's age
   * @param date - Date for tax year selection (defaults to today)
   * @returns PAYE calculation result
   */
  calculatePAYE(
    annualIncomeCents: number,
    age: number,
    date?: Date,
  ): TaxTablePayeResult {
    if (annualIncomeCents < 0) {
      throw new BadRequestException('Annual income cannot be negative');
    }
    if (age < 0 || age > 150) {
      throw new BadRequestException('Invalid age provided');
    }

    const taxYear = date
      ? this.getTaxYearForDate(date)
      : this.getCurrentTaxYear();
    const ageCategory = this.getAgeCategory(age);

    // Get applicable threshold
    const threshold = this.getThresholdForAge(taxYear, ageCategory);

    // Check if below threshold
    if (annualIncomeCents <= threshold) {
      return {
        annualIncomeCents,
        taxYearCode: taxYear.yearCode,
        taxBeforeRebatesCents: 0,
        primaryRebateCents: 0,
        secondaryRebateCents: 0,
        tertiaryRebateCents: 0,
        totalRebatesCents: 0,
        taxAfterRebatesCents: 0,
        monthlyPayeCents: 0,
        bracketIndex: 0,
        effectiveRatePercent: 0,
      };
    }

    // Find applicable bracket
    const { bracket, bracketIndex } = this.findBracket(
      taxYear,
      annualIncomeCents,
    );

    // Calculate tax before rebates
    const taxBeforeRebatesCents = this.calculateTaxOnIncome(
      annualIncomeCents,
      bracket,
    );

    // Calculate rebates
    const rebates = this.getApplicableRebate(taxYear, ageCategory);

    // Tax after rebates (floor at 0)
    const taxAfterRebatesCents = Math.max(
      0,
      taxBeforeRebatesCents - rebates.totalRebatesCents,
    );

    // Monthly PAYE
    const monthlyPayeCents = new Decimal(taxAfterRebatesCents)
      .div(12)
      .round()
      .toNumber();

    // Effective rate
    const effectiveRatePercent =
      annualIncomeCents > 0
        ? new Decimal(taxAfterRebatesCents)
            .div(annualIncomeCents)
            .mul(100)
            .toDecimalPlaces(2)
            .toNumber()
        : 0;

    return {
      annualIncomeCents,
      taxYearCode: taxYear.yearCode,
      taxBeforeRebatesCents,
      primaryRebateCents: rebates.primaryRebateCents,
      secondaryRebateCents: rebates.secondaryRebateCents,
      tertiaryRebateCents: rebates.tertiaryRebateCents,
      totalRebatesCents: rebates.totalRebatesCents,
      taxAfterRebatesCents,
      monthlyPayeCents,
      bracketIndex,
      effectiveRatePercent,
    };
  }

  /**
   * Get age category for rebate/threshold calculation
   *
   * @param age - Employee's age
   * @returns Age category
   */
  getAgeCategory(age: number): AgeCategory {
    if (age >= 75) {
      return 'AGE_75_PLUS';
    }
    if (age >= 65) {
      return 'AGE_65_TO_74';
    }
    return 'UNDER_65';
  }

  /**
   * Get applicable rebate based on age category
   *
   * @param taxYear - Tax year
   * @param ageCategory - Age category
   * @returns Rebate amounts
   */
  getApplicableRebate(
    taxYear: TaxYear,
    ageCategory: AgeCategory,
  ): {
    primaryRebateCents: number;
    secondaryRebateCents: number;
    tertiaryRebateCents: number;
    totalRebatesCents: number;
  } {
    const primaryRebateCents = taxYear.primaryRebateCents;
    let secondaryRebateCents = 0;
    let tertiaryRebateCents = 0;

    if (ageCategory === 'AGE_65_TO_74' || ageCategory === 'AGE_75_PLUS') {
      secondaryRebateCents = taxYear.secondaryRebateCents;
    }

    if (ageCategory === 'AGE_75_PLUS') {
      tertiaryRebateCents = taxYear.tertiaryRebateCents;
    }

    const totalRebatesCents =
      primaryRebateCents + secondaryRebateCents + tertiaryRebateCents;

    return {
      primaryRebateCents,
      secondaryRebateCents,
      tertiaryRebateCents,
      totalRebatesCents,
    };
  }

  /**
   * Get tax threshold for age category
   *
   * @param taxYear - Tax year
   * @param ageCategory - Age category
   * @returns Tax threshold in cents
   */
  getThresholdForAge(taxYear: TaxYear, ageCategory: AgeCategory): number {
    switch (ageCategory) {
      case 'AGE_75_PLUS':
        return taxYear.taxThresholdOver75Cents;
      case 'AGE_65_TO_74':
        return taxYear.taxThresholdOver65Cents;
      default:
        return taxYear.taxThresholdCents;
    }
  }

  /**
   * Find the applicable tax bracket for an income
   *
   * @param taxYear - Tax year
   * @param annualIncomeCents - Annual income in cents
   * @returns Bracket and index
   */
  findBracket(
    taxYear: TaxYear,
    annualIncomeCents: number,
  ): { bracket: TaxBracket; bracketIndex: number } {
    const sortedBrackets = [...taxYear.brackets].sort(
      (a, b) => a.bracketOrder - b.bracketOrder,
    );

    for (let i = sortedBrackets.length - 1; i >= 0; i--) {
      const bracket = sortedBrackets[i];
      if (annualIncomeCents >= bracket.lowerBoundCents) {
        return { bracket, bracketIndex: i };
      }
    }

    // Default to first bracket
    return { bracket: sortedBrackets[0], bracketIndex: 0 };
  }

  /**
   * Calculate tax on income using bracket
   *
   * @param annualIncomeCents - Annual income in cents
   * @param bracket - Tax bracket
   * @returns Tax amount in cents
   */
  private calculateTaxOnIncome(
    annualIncomeCents: number,
    bracket: TaxBracket,
  ): number {
    if (annualIncomeCents <= 0) {
      return 0;
    }

    const incomeAboveThreshold = new Decimal(annualIncomeCents).minus(
      bracket.lowerBoundCents,
    );

    if (incomeAboveThreshold.lessThan(0)) {
      return bracket.baseTaxCents;
    }

    const tax = new Decimal(bracket.baseTaxCents).plus(
      incomeAboveThreshold.mul(bracket.marginalRate),
    );

    return tax.round().toNumber();
  }

  /**
   * Calculate medical aid tax credits
   *
   * @param taxYear - Tax year
   * @param medicalAidMembers - Number of members on medical aid
   * @returns Monthly credit amount in cents
   */
  calculateMedicalCredits(taxYear: TaxYear, medicalAidMembers: number): number {
    if (medicalAidMembers <= 0) {
      return 0;
    }

    if (medicalAidMembers === 1) {
      return taxYear.medicalCreditsMainCents;
    }

    if (medicalAidMembers === 2) {
      return (
        taxYear.medicalCreditsMainCents +
        taxYear.medicalCreditsFirstDependentCents
      );
    }

    const additionalDependents = medicalAidMembers - 2;
    return (
      taxYear.medicalCreditsMainCents +
      taxYear.medicalCreditsFirstDependentCents +
      taxYear.medicalCreditsOtherDependentsCents * additionalDependents
    );
  }

  /**
   * Validate tax brackets for consistency
   *
   * @param brackets - Array of bracket DTOs
   * @throws BadRequestException if validation fails
   */
  private validateBrackets(brackets: CreateTaxBracketDto[]): void {
    if (brackets.length === 0) {
      throw new BadRequestException('At least one tax bracket is required');
    }

    // Sort by order
    const sorted = [...brackets].sort(
      (a, b) => a.bracketOrder - b.bracketOrder,
    );

    // Validate first bracket starts at 0
    if (sorted[0].lowerBoundCents !== 0) {
      throw new BadRequestException('First bracket must start at 0');
    }

    // Validate continuous ranges
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      if (current.upperBoundCents === null) {
        throw new BadRequestException(
          `Only the last bracket can have null upper bound. Bracket ${i + 1} has null.`,
        );
      }

      if (current.upperBoundCents !== next.lowerBoundCents) {
        throw new BadRequestException(
          `Gap or overlap between bracket ${i + 1} upper bound (${current.upperBoundCents}) and bracket ${i + 2} lower bound (${next.lowerBoundCents})`,
        );
      }
    }

    // Last bracket must have null upper bound
    const lastBracket = sorted[sorted.length - 1];
    if (lastBracket.upperBoundCents !== null) {
      throw new BadRequestException(
        'Highest bracket must have null upper bound',
      );
    }

    // Validate marginal rates
    for (const bracket of brackets) {
      if (bracket.marginalRate < 0 || bracket.marginalRate > 1) {
        throw new BadRequestException(
          `Invalid marginal rate: ${bracket.marginalRate}. Must be between 0 and 1.`,
        );
      }
    }
  }

  /**
   * Find overlapping tax year
   */
  private findOverlappingTaxYear(
    effectiveFrom: Date,
    effectiveTo: Date,
    excludeId?: string,
  ): TaxYear | undefined {
    for (const taxYear of this.taxYears.values()) {
      if (excludeId && taxYear.id === excludeId) {
        continue;
      }

      // Check for overlap
      if (
        effectiveFrom <= taxYear.effectiveTo &&
        effectiveTo >= taxYear.effectiveFrom
      ) {
        return taxYear;
      }
    }

    return undefined;
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): TaxYear | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Set to cache
   */
  private setToCache(key: string, data: TaxYear): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + TAX_TABLE_CACHE_TTL * 1000,
    });
  }

  /**
   * Clear all cache entries
   */
  private clearCache(): void {
    this.cache.clear();
    this.logger.debug('Tax table cache cleared');
  }

  /**
   * Get all bracket descriptions for a tax year (for display purposes)
   *
   * @param taxYear - Tax year
   * @returns Array of bracket descriptions
   */
  getBracketDescriptions(taxYear: TaxYear): Array<{
    bracket: string;
    rate: string;
    baseTax: string;
  }> {
    const sortedBrackets = [...taxYear.brackets].sort(
      (a, b) => a.bracketOrder - b.bracketOrder,
    );

    return sortedBrackets.map((b) => {
      const lowerRands = (b.lowerBoundCents / 100).toLocaleString('en-ZA');
      const upperRands = b.upperBoundCents
        ? (b.upperBoundCents / 100).toLocaleString('en-ZA')
        : '∞';
      const baseTaxRands = (b.baseTaxCents / 100).toLocaleString('en-ZA');
      const ratePercent = b.marginalRate.mul(100).toNumber();

      return {
        bracket: `R${lowerRands} - R${upperRands}`,
        rate: `${ratePercent}%`,
        baseTax: `R${baseTaxRands}`,
      };
    });
  }
}
