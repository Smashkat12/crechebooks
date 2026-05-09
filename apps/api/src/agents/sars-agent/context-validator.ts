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
}
