/**
 * Payee Alias Service
 * TASK-TRANS-018: Enable Payee Alias Matching in Categorization
 *
 * @module database/services/payee-alias
 * @description Manages payee name aliases to recognize variations of the same payee
 * (e.g., "WOOLWORTHS", "WOOLWORTHS SANDTON", "W/WORTHS" all map to "WOOLWORTHS")
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PayeePattern } from '@prisma/client';
import { PayeePatternRepository } from '../repositories/payee-pattern.repository';
import { BusinessException, NotFoundException } from '../../shared/exceptions';

/**
 * Represents a payee alias mapping
 */
export interface PayeeAlias {
  id: string;
  tenantId: string;
  alias: string;
  canonicalName: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Levenshtein distance threshold for similarity matching
 */
const SIMILARITY_THRESHOLD = 0.8;

@Injectable()
export class PayeeAliasService {
  private readonly logger = new Logger(PayeeAliasService.name);

  constructor(private readonly payeePatternRepo: PayeePatternRepository) {}

  /**
   * Resolve a payee name to its canonical form
   * Returns the canonical name if an alias exists, otherwise returns the original name
   *
   * @param tenantId - Tenant ID for isolation
   * @param payeeName - Payee name to resolve
   * @returns Canonical payee name
   */
  async resolveAlias(tenantId: string, payeeName: string): Promise<string> {
    if (!payeeName || payeeName.trim() === '') {
      return payeeName;
    }

    const normalized = this.normalizePayeeName(payeeName);

    // Find all patterns for this tenant
    const patterns = await this.payeePatternRepo.findByTenant(tenantId, {});

    // Check for exact match on canonical name (payeePattern)
    for (const pattern of patterns) {
      const normalizedPattern = this.normalizePayeeName(pattern.payeePattern);
      if (normalizedPattern === normalized) {
        return pattern.payeePattern;
      }
    }

    // Check for alias match
    for (const pattern of patterns) {
      const aliases = pattern.payeeAliases as string[];
      for (const alias of aliases) {
        const normalizedAlias = this.normalizePayeeName(alias);
        if (normalizedAlias === normalized) {
          this.logger.log(
            `Resolved alias "${payeeName}" to canonical "${pattern.payeePattern}"`,
          );
          return pattern.payeePattern;
        }
      }
    }

    // No alias found - return original
    return payeeName;
  }

  /**
   * Create a new alias for a canonical payee name
   * Prevents duplicate aliases via case-insensitive check
   *
   * @param tenantId - Tenant ID for isolation
   * @param alias - Alias to create
   * @param canonicalName - Canonical payee name
   * @returns Created alias record
   */
  async createAlias(
    tenantId: string,
    alias: string,
    canonicalName: string,
  ): Promise<PayeeAlias> {
    if (!alias || alias.trim() === '') {
      throw new BusinessException('Alias cannot be empty', 'INVALID_ALIAS');
    }

    if (!canonicalName || canonicalName.trim() === '') {
      throw new BusinessException(
        'Canonical name cannot be empty',
        'INVALID_CANONICAL_NAME',
      );
    }

    const normalizedAlias = this.normalizePayeeName(alias);
    const normalizedCanonical = this.normalizePayeeName(canonicalName);

    // Check if alias already exists for ANY payee
    const allPatterns = await this.payeePatternRepo.findByTenant(tenantId, {});
    for (const pattern of allPatterns) {
      const aliases = pattern.payeeAliases as string[];
      for (const existingAlias of aliases) {
        if (
          this.normalizePayeeName(existingAlias) === normalizedAlias ||
          this.normalizePayeeName(pattern.payeePattern) === normalizedAlias
        ) {
          throw new BusinessException(
            `Alias "${alias}" already exists`,
            'DUPLICATE_ALIAS',
          );
        }
      }
    }

    // Find or create the pattern for the canonical name
    let pattern = await this.payeePatternRepo.findByPayeeName(
      tenantId,
      canonicalName,
    );

    if (!pattern) {
      // Create new pattern with default account (will be updated when first used)
      pattern = await this.payeePatternRepo.create({
        tenantId,
        payeePattern: canonicalName,
        payeeAliases: [],
        defaultAccountCode: '5900', // General Expenses placeholder
        defaultAccountName: 'General Expenses',
        confidenceBoost: 0,
        isRecurring: false,
      });
      this.logger.log(`Created new pattern for canonical name: ${canonicalName}`);
    }

    // Add alias to pattern
    const existingAliases = pattern.payeeAliases as string[];
    const updatedAliases = [...existingAliases, alias];

    await this.payeePatternRepo.update(pattern.id, {
      payeeAliases: updatedAliases,
    });

    this.logger.log(
      `Created alias "${alias}" for canonical name "${canonicalName}"`,
    );

    return {
      id: `${pattern.id}:${alias}`,
      tenantId,
      alias,
      canonicalName: pattern.payeePattern,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get all aliases for a canonical payee name
   *
   * @param tenantId - Tenant ID for isolation
   * @param canonicalName - Canonical payee name
   * @returns Array of aliases
   */
  async getAliases(
    tenantId: string,
    canonicalName: string,
  ): Promise<PayeeAlias[]> {
    const pattern = await this.payeePatternRepo.findByPayeeName(
      tenantId,
      canonicalName,
    );

    if (!pattern) {
      return [];
    }

    const aliases = pattern.payeeAliases as string[];
    return aliases.map((alias) => ({
      id: `${pattern.id}:${alias}`,
      tenantId,
      alias,
      canonicalName: pattern.payeePattern,
      createdAt: pattern.createdAt,
      updatedAt: pattern.updatedAt,
    }));
  }

  /**
   * Delete an alias
   *
   * @param tenantId - Tenant ID for isolation
   * @param aliasId - Alias ID in format "patternId:alias"
   */
  async deleteAlias(tenantId: string, aliasId: string): Promise<void> {
    // Parse aliasId (format: "patternId:alias")
    const parts = aliasId.split(':');
    if (parts.length < 2) {
      throw new BusinessException('Invalid alias ID format', 'INVALID_ALIAS_ID');
    }

    const patternId = parts[0];
    const aliasToDelete = parts.slice(1).join(':'); // Handle aliases with colons

    const pattern = await this.payeePatternRepo.findById(patternId);
    if (!pattern || pattern.tenantId !== tenantId) {
      throw new NotFoundException('PayeePattern', patternId);
    }

    const aliases = pattern.payeeAliases as string[];
    const normalizedToDelete = this.normalizePayeeName(aliasToDelete);

    // Find and remove the alias (case-insensitive)
    const updatedAliases = aliases.filter(
      (a) => this.normalizePayeeName(a) !== normalizedToDelete,
    );

    if (updatedAliases.length === aliases.length) {
      throw new NotFoundException('Alias', aliasToDelete);
    }

    await this.payeePatternRepo.update(patternId, {
      payeeAliases: updatedAliases,
    });

    this.logger.log(`Deleted alias "${aliasToDelete}" from pattern ${patternId}`);
  }

  /**
   * Find similar payee names using Levenshtein distance
   * Returns canonical names that are similar to the input
   *
   * @param tenantId - Tenant ID for isolation
   * @param payeeName - Payee name to match
   * @returns Array of similar canonical payee names
   */
  async findSimilar(tenantId: string, payeeName: string): Promise<string[]> {
    if (!payeeName || payeeName.trim() === '') {
      return [];
    }

    const normalized = this.normalizePayeeName(payeeName);
    const patterns = await this.payeePatternRepo.findByTenant(tenantId, {});

    const similar: Array<{ name: string; similarity: number }> = [];

    for (const pattern of patterns) {
      // Check canonical name
      const canonicalSimilarity = this.calculateSimilarity(
        normalized,
        this.normalizePayeeName(pattern.payeePattern),
      );

      if (canonicalSimilarity >= SIMILARITY_THRESHOLD) {
        similar.push({
          name: pattern.payeePattern,
          similarity: canonicalSimilarity,
        });
        continue; // Skip aliases if canonical matches
      }

      // Check aliases
      const aliases = pattern.payeeAliases as string[];
      for (const alias of aliases) {
        const aliasSimilarity = this.calculateSimilarity(
          normalized,
          this.normalizePayeeName(alias),
        );

        if (aliasSimilarity >= SIMILARITY_THRESHOLD) {
          similar.push({
            name: pattern.payeePattern,
            similarity: aliasSimilarity,
          });
          break; // One match per pattern is enough
        }
      }
    }

    // Sort by similarity descending and return names
    return similar
      .sort((a, b) => b.similarity - a.similarity)
      .map((s) => s.name);
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * Returns a value between 0 (completely different) and 1 (identical)
   *
   * @param s1 - First string (normalized)
   * @param s2 - Second string (normalized)
   * @returns Similarity score
   */
  private calculateSimilarity(s1: string, s2: string): number {
    const distance = this.levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);

    if (maxLen === 0) {
      return 1.0;
    }

    return 1.0 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Uses dynamic programming approach
   *
   * @param s1 - First string
   * @param s2 - Second string
   * @returns Edit distance
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    // Create matrix
    const matrix: number[][] = Array.from({ length: len1 + 1 }, () =>
      Array(len2 + 1).fill(0),
    );

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Normalize payee name for consistent matching
   * Converts to uppercase, removes extra whitespace, and common special characters
   *
   * @param payee - Payee name to normalize
   * @returns Normalized payee name
   */
  private normalizePayeeName(payee: string): string {
    return payee
      .toUpperCase()
      .replace(/[\/\-_.,]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }
}
