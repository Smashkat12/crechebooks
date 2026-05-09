/**
 * Confidence Scorer for Transaction Categorizer Agent
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/confidence-scorer
 * @description Calculates deterministic confidence scores for categorization.
 * Scoring formula is documented and reproducible.
 */

import { Injectable } from '@nestjs/common';
import { ConfidenceInput } from './interfaces/categorizer.interface';

/**
 * Confidence scoring weights - documented for reproducibility
 */
const CONFIDENCE_WEIGHTS = {
  /** Maximum points from pattern match (pattern.confidence * 0.6) */
  PATTERN_WEIGHT: 0.6,
  /** Base points for having a historical match */
  HISTORICAL_BASE: 25,
  /** Additional points per historical match (max 5 additional) */
  HISTORICAL_PER_MATCH: 1,
  /** Maximum additional historical points */
  HISTORICAL_MAX_BONUS: 5,
  /** Points for typical amount */
  TYPICAL_AMOUNT: 10,
  /** Maximum points from description quality */
  DESCRIPTION_MAX: 10,
} as const;

@Injectable()
export class ConfidenceScorer {
  /**
   * Calculate deterministic confidence score
   *
   * Formula:
   *   Pattern: pattern_confidence * 0.6 (max 60 points)
   *   Historical: 25 base + 1 per additional match (max 30 points)
   *   Typical Amount: 10 points
   *   Description Quality: 0-10 points based on word count
   *
   * @param input - Scoring inputs
   * @returns Confidence score 0-100
   */
  calculate(input: ConfidenceInput): number {
    let score = 0;

    // Pattern match contribution (0-60 points)
    if (input.hasPatternMatch) {
      score += input.patternConfidence * CONFIDENCE_WEIGHTS.PATTERN_WEIGHT;
    }

    // Historical match contribution (0-30 points)
    if (input.hasHistoricalMatch) {
      score += CONFIDENCE_WEIGHTS.HISTORICAL_BASE;
      const additionalMatches = Math.max(0, input.historicalMatchCount - 1);
      const bonus = Math.min(
        additionalMatches * CONFIDENCE_WEIGHTS.HISTORICAL_PER_MATCH,
        CONFIDENCE_WEIGHTS.HISTORICAL_MAX_BONUS,
      );
      score += bonus;
    }

    // Typical amount (0-10 points)
    if (input.isAmountTypical) {
      score += CONFIDENCE_WEIGHTS.TYPICAL_AMOUNT;
    }

    // Description quality bonus (0-10 points)
    score +=
      (input.descriptionQuality / 100) * CONFIDENCE_WEIGHTS.DESCRIPTION_MAX;

    // Clamp to 0-100 and round
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Determine if confidence meets auto-apply threshold
   *
   * @param confidence - Calculated confidence score
   * @param threshold - Threshold from context (default 80)
   * @returns true if confidence >= threshold
   */
  meetsAutoApplyThreshold(confidence: number, threshold: number = 80): boolean {
    return confidence >= threshold;
  }
}
