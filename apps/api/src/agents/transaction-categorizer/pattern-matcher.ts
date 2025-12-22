/**
 * Pattern Matcher for Transaction Categorizer Agent
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/pattern-matcher
 * @description Matches transaction payee/description against regex patterns.
 * Patterns are loaded from .claude/context/payee_patterns.json.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ContextLoader } from './context-loader';
import { PatternMatch } from './interfaces/categorizer.interface';

@Injectable()
export class PatternMatcher {
  private readonly logger = new Logger(PatternMatcher.name);
  private readonly compiledPatterns: Map<string, RegExp> = new Map();
  private readonly invalidPatterns: Set<string> = new Set();

  constructor(private readonly contextLoader: ContextLoader) {}

  /**
   * Match payee/description against all patterns
   * Returns matches sorted by confidence (highest first)
   *
   * @param payee - Transaction payee name
   * @param description - Transaction description
   * @param amountCents - Transaction amount for amount-based filtering
   * @param isCredit - Whether transaction is a credit
   * @returns Array of matches sorted by confidence
   */
  match(
    payee: string,
    description: string,
    amountCents?: number,
    isCredit?: boolean,
  ): PatternMatch[] {
    const context = this.contextLoader.getContext();
    const matches: PatternMatch[] = [];
    const textToMatch = `${payee} ${description}`.toUpperCase();

    for (const pattern of context.patterns) {
      // Skip patterns that require credit/debit matching
      if (pattern.isCredit !== undefined && pattern.isCredit !== isCredit) {
        continue;
      }

      // Skip if pattern has amount limit and amount exceeds it
      if (
        pattern.requiresAmountCheck &&
        pattern.maxAmountCents !== undefined &&
        amountCents !== undefined &&
        amountCents > pattern.maxAmountCents
      ) {
        continue;
      }

      // Skip patterns we've already identified as invalid
      if (this.invalidPatterns.has(pattern.id)) {
        continue;
      }

      try {
        let regex = this.compiledPatterns.get(pattern.id);
        if (!regex) {
          regex = new RegExp(pattern.regex, 'i');
          this.compiledPatterns.set(pattern.id, regex);
        }

        const match = textToMatch.match(regex);
        if (match) {
          matches.push({
            pattern,
            matchedText: match[0],
            confidence: pattern.confidence * 100, // Convert to 0-100 scale
          });
        }
      } catch (error) {
        // Mark invalid pattern to avoid repeated failures
        this.invalidPatterns.add(pattern.id);
        this.logger.error(
          `Invalid regex pattern ${pattern.id}: "${pattern.regex}" - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get best match or null if no patterns match
   *
   * @param payee - Transaction payee name
   * @param description - Transaction description
   * @param amountCents - Transaction amount for filtering
   * @param isCredit - Whether transaction is a credit
   * @returns Best match or null
   */
  getBestMatch(
    payee: string,
    description: string,
    amountCents?: number,
    isCredit?: boolean,
  ): PatternMatch | null {
    const matches = this.match(payee, description, amountCents, isCredit);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Get all patterns that match, regardless of confidence
   */
  getAllMatches(payee: string, description: string): PatternMatch[] {
    return this.match(payee, description);
  }

  /**
   * Check if a specific pattern matches
   */
  matchesPattern(
    patternId: string,
    payee: string,
    description: string,
  ): boolean {
    const context = this.contextLoader.getContext();
    const pattern = context.patterns.find((p) => p.id === patternId);

    if (!pattern) {
      return false;
    }

    try {
      let regex = this.compiledPatterns.get(pattern.id);
      if (!regex) {
        regex = new RegExp(pattern.regex, 'i');
        this.compiledPatterns.set(pattern.id, regex);
      }

      const textToMatch = `${payee} ${description}`.toUpperCase();
      return regex.test(textToMatch);
    } catch {
      return false;
    }
  }
}
