/**
 * Payee Variation Detector Service
 * TASK-EC-001: Payee Name Variation Detection Algorithm
 *
 * @module database/services/payee-variation-detector
 * @description Detects variations of payee names using multiple similarity algorithms
 * (Levenshtein, Jaro-Winkler, phonetic matching)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PayeeNormalizerService } from './payee-normalizer.service';
import { PayeePatternRepository } from '../repositories/payee-pattern.repository';

/**
 * Match type indicators for payee variations
 */
export type PayeeMatchType =
  | 'exact'
  | 'abbreviation'
  | 'suffix'
  | 'phonetic'
  | 'fuzzy';

/**
 * Variation match result
 */
export interface VariationMatch {
  payeeA: string;
  payeeB: string;
  similarity: number; // 0-1
  matchType: PayeeMatchType;
  confidence: number; // 0-100
  normalizedA: string;
  normalizedB: string;
}

/**
 * Group of potentially related payees
 */
export interface PayeeGroup {
  canonicalName: string;
  variants: string[];
  confidence: number; // 0-100
  matchTypes: PayeeMatchType[];
}

/**
 * Alias suggestion for user confirmation
 */
export interface AliasSuggestion {
  payeeName: string;
  suggestedCanonical: string;
  confidence: number; // 0-100
  reason: string;
  examples: string[]; // Similar existing payees
}

/**
 * Similarity thresholds
 */
const LEVENSHTEIN_THRESHOLD = 0.8;
const JARO_WINKLER_THRESHOLD = 0.85;
const PHONETIC_THRESHOLD = 0.9; // Exact phonetic match
const MIN_LENGTH_AFTER_NORMALIZATION = 3;
const MAX_SUGGESTIONS = 50;

@Injectable()
export class PayeeVariationDetectorService {
  private readonly logger = new Logger(PayeeVariationDetectorService.name);

  constructor(
    private readonly normalizer: PayeeNormalizerService,
    private readonly payeePatternRepo: PayeePatternRepository,
  ) {}

  /**
   * Detect variations of a specific payee name
   * Returns all potential matches across the tenant's payees
   *
   * @param tenantId - Tenant ID for isolation
   * @param payeeName - Payee name to match
   * @returns Array of variation matches
   */
  async detectVariations(
    tenantId: string,
    payeeName: string,
  ): Promise<VariationMatch[]> {
    if (!payeeName || payeeName.trim() === '') {
      return [];
    }

    const normalized = this.normalize(payeeName);
    if (normalized.length < MIN_LENGTH_AFTER_NORMALIZATION) {
      return [];
    }

    // Get all payees for this tenant
    const patterns = await this.payeePatternRepo.findByTenant(tenantId, {});
    const allPayees = new Set<string>();

    // Collect all unique payee names (canonical + aliases)
    for (const pattern of patterns) {
      allPayees.add(pattern.payeePattern);
      const aliases = pattern.payeeAliases as string[];
      aliases.forEach((alias) => allPayees.add(alias));
    }

    const matches: VariationMatch[] = [];

    // Compare against all payees
    for (const otherPayee of allPayees) {
      if (otherPayee.toLowerCase() === payeeName.toLowerCase()) {
        continue; // Skip exact match
      }

      const match = this.calculateSimilarity(payeeName, otherPayee);
      if (
        match.score >= LEVENSHTEIN_THRESHOLD ||
        match.method === 'abbreviation' ||
        match.method === 'phonetic'
      ) {
        const normalizedOther = this.normalize(otherPayee);

        matches.push({
          payeeA: payeeName,
          payeeB: otherPayee,
          similarity: match.score,
          matchType: match.method as PayeeMatchType,
          confidence: this.calculateConfidence(match.score, match.method),
          normalizedA: normalized,
          normalizedB: normalizedOther,
        });
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find all potential payee groups across the tenant
   * Groups payees that are likely variations of each other
   *
   * @param tenantId - Tenant ID for isolation
   * @returns Array of payee groups
   */
  async findAllPotentialGroups(tenantId: string): Promise<PayeeGroup[]> {
    const patterns = await this.payeePatternRepo.findByTenant(tenantId, {});
    const allPayees = new Set<string>();

    // Collect all unique payee names
    for (const pattern of patterns) {
      allPayees.add(pattern.payeePattern);
      const aliases = pattern.payeeAliases as string[];
      aliases.forEach((alias) => allPayees.add(alias));
    }

    const payeeArray = Array.from(allPayees);
    const groups: Map<string, PayeeGroup> = new Map();
    const processed = new Set<string>();

    // Compare each payee with all others
    for (let i = 0; i < payeeArray.length; i++) {
      const payeeA = payeeArray[i];
      if (processed.has(payeeA)) continue;

      const variants: string[] = [payeeA];
      const matchTypes: Set<PayeeMatchType> = new Set();
      let totalConfidence = 0;
      let matchCount = 0;

      for (let j = i + 1; j < payeeArray.length; j++) {
        const payeeB = payeeArray[j];
        if (processed.has(payeeB)) continue;

        const match = this.calculateSimilarity(payeeA, payeeB);
        if (
          match.score >= LEVENSHTEIN_THRESHOLD ||
          match.method === 'abbreviation'
        ) {
          variants.push(payeeB);
          matchTypes.add(match.method as PayeeMatchType);
          totalConfidence += this.calculateConfidence(
            match.score,
            match.method,
          );
          matchCount++;
          processed.add(payeeB);
        }
      }

      if (variants.length > 1) {
        const avgConfidence = matchCount > 0 ? totalConfidence / matchCount : 0;
        groups.set(payeeA, {
          canonicalName: payeeA,
          variants,
          confidence: Math.round(avgConfidence),
          matchTypes: Array.from(matchTypes),
        });
        processed.add(payeeA);
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.confidence - a.confidence,
    );
  }

  /**
   * Normalize a payee name using the normalizer service
   *
   * @param payeeName - Raw payee name
   * @returns Normalized name
   */
  normalize(payeeName: string): string {
    return this.normalizer.normalize(payeeName);
  }

  /**
   * Calculate similarity between two payee names
   * Uses multiple algorithms and returns the best match
   *
   * @param nameA - First payee name
   * @param nameB - Second payee name
   * @returns Similarity result with score and method
   */
  calculateSimilarity(
    nameA: string,
    nameB: string,
  ): { score: number; method: string } {
    // Check for abbreviation match first (highest confidence)
    if (this.normalizer.isAbbreviationMatch(nameA, nameB)) {
      return { score: 1.0, method: 'abbreviation' };
    }

    const normA = this.normalize(nameA);
    const normB = this.normalize(nameB);

    // Exact match after normalization
    if (normA === normB) {
      return { score: 1.0, method: 'suffix' };
    }

    // Phonetic match
    const phoneticA = this.normalizer.toPhonetic(nameA);
    const phoneticB = this.normalizer.toPhonetic(nameB);
    if (phoneticA === phoneticB && phoneticA.length > 0) {
      return { score: PHONETIC_THRESHOLD, method: 'phonetic' };
    }

    // Levenshtein distance
    const levenshtein = this.calculateLevenshteinSimilarity(normA, normB);

    // Jaro-Winkler distance
    const jaroWinkler = this.calculateJaroWinklerSimilarity(normA, normB);

    // Return the best score
    if (jaroWinkler >= levenshtein && jaroWinkler >= JARO_WINKLER_THRESHOLD) {
      return { score: jaroWinkler, method: 'jaro-winkler' };
    } else if (levenshtein >= LEVENSHTEIN_THRESHOLD) {
      return { score: levenshtein, method: 'levenshtein' };
    }

    return { score: Math.max(levenshtein, jaroWinkler), method: 'fuzzy' };
  }

  /**
   * Get suggested aliases for user confirmation
   * Returns high-confidence matches that haven't been aliased yet
   *
   * @param tenantId - Tenant ID for isolation
   * @param limit - Maximum suggestions to return (default: 50)
   * @returns Array of alias suggestions
   */
  async getSuggestedAliases(
    tenantId: string,
    limit: number = MAX_SUGGESTIONS,
  ): Promise<AliasSuggestion[]> {
    const groups = await this.findAllPotentialGroups(tenantId);
    const suggestions: AliasSuggestion[] = [];

    for (const group of groups) {
      if (group.confidence < 70) continue; // Only suggest medium+ confidence

      // Canonical is usually the shortest or most common variant
      const canonical = this.selectCanonical(group.variants);

      for (const variant of group.variants) {
        if (variant === canonical) continue;

        suggestions.push({
          payeeName: variant,
          suggestedCanonical: canonical,
          confidence: group.confidence,
          reason: this.generateReason(group.matchTypes),
          examples: group.variants.filter((v) => v !== variant).slice(0, 3),
        });
      }

      if (suggestions.length >= limit) break;
    }

    return suggestions.slice(0, limit);
  }

  /**
   * Calculate Levenshtein similarity
   * Returns a value between 0 (completely different) and 1 (identical)
   *
   * @param s1 - First string
   * @param s2 - Second string
   * @returns Similarity score
   */
  private calculateLevenshteinSimilarity(s1: string, s2: string): number {
    const distance = this.levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);

    if (maxLen === 0) {
      return 1.0;
    }

    return 1.0 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance
   *
   * @param s1 - First string
   * @param s2 - Second string
   * @returns Edit distance
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
      Array(len2 + 1).fill(0),
    );

    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate Jaro-Winkler similarity
   * Better for short strings and name matching
   *
   * @param s1 - First string
   * @param s2 - Second string
   * @returns Similarity score (0-1)
   */
  private calculateJaroWinklerSimilarity(s1: string, s2: string): number {
    const jaro = this.jaroSimilarity(s1, s2);

    // Jaro-Winkler uses prefix scaling
    const prefixScale = 0.1;
    const maxPrefixLength = 4;

    let prefixLength = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length, maxPrefixLength); i++) {
      if (s1[i] === s2[i]) {
        prefixLength++;
      } else {
        break;
      }
    }

    return jaro + prefixLength * prefixScale * (1 - jaro);
  }

  /**
   * Calculate Jaro similarity
   *
   * @param s1 - First string
   * @param s2 - Second string
   * @returns Similarity score (0-1)
   */
  private jaroSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0.0;

    // Find transpositions
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    return (
      (matches / s1.length +
        matches / s2.length +
        (matches - transpositions / 2) / matches) /
      3.0
    );
  }

  /**
   * Calculate confidence score (0-100)
   *
   * @param similarity - Similarity score (0-1)
   * @param method - Match method
   * @returns Confidence score
   */
  private calculateConfidence(similarity: number, method: string): number {
    let baseConfidence = similarity * 100;

    // Boost confidence based on method
    switch (method) {
      case 'abbreviation':
        baseConfidence = Math.max(baseConfidence, 95); // Known abbreviations are very confident
        break;
      case 'suffix':
        baseConfidence = Math.max(baseConfidence, 90); // Exact after suffix removal
        break;
      case 'phonetic':
        baseConfidence = Math.max(baseConfidence, 85); // Same pronunciation
        break;
      case 'jaro-winkler':
        baseConfidence *= 1.05; // Slight boost for name-optimized algorithm
        break;
      case 'levenshtein':
        // No boost
        break;
      default:
        baseConfidence *= 0.9; // Reduce confidence for generic fuzzy
    }

    return Math.min(100, Math.round(baseConfidence));
  }

  /**
   * Select canonical name from variants
   * Prefers shortest, most common, or alphabetically first
   *
   * @param variants - Array of variant names
   * @returns Canonical name
   */
  private selectCanonical(variants: string[]): string {
    if (variants.length === 0) return '';
    if (variants.length === 1) return variants[0];

    // Prefer the shortest normalized name
    return variants.reduce((canonical, variant) => {
      const normCanonical = this.normalize(canonical);
      const normVariant = this.normalize(variant);

      if (normVariant.length < normCanonical.length) {
        return variant;
      } else if (
        normVariant.length === normCanonical.length &&
        variant < canonical
      ) {
        return variant; // Alphabetically first
      }
      return canonical;
    });
  }

  /**
   * Generate human-readable reason for alias suggestion
   *
   * @param matchTypes - Array of match types
   * @returns Reason string
   */
  private generateReason(matchTypes: PayeeMatchType[]): string {
    if (matchTypes.includes('abbreviation')) {
      return 'Known abbreviation match';
    } else if (matchTypes.includes('suffix')) {
      return 'Same name after removing suffixes (PTY LTD, location, etc.)';
    } else if (matchTypes.includes('phonetic')) {
      return 'Similar pronunciation (phonetic match)';
    } else if (matchTypes.includes('fuzzy')) {
      return 'Similar spelling (fuzzy match)';
    }
    return 'Potential variation detected';
  }
}
