/**
 * Payee Normalizer Service
 * TASK-EC-001: Payee Name Variation Detection Algorithm
 *
 * @module database/services/payee-normalizer
 * @description Normalizes payee names for variation detection by removing
 * SA-specific suffixes, locations, and reference codes
 */

import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

/**
 * SA company suffixes to remove during normalization
 * Order matters - process longer patterns first
 */
const SA_SUFFIXES = [
  'PROPRIETARY LIMITED',
  'CLOSE CORPORATION',
  '(PTY) LTD',
  '(PTY LTD)',
  'PTY LTD',
  'LIMITED',
  '(PTY)',
  'PTY',
  '(CC)',
  'CC',
  '(NPC)',
  'NPC',
  '(INC)',
  'INC',
  'LTD',
];

/**
 * Reference code patterns (regex)
 * Match payment references, not company names
 */
const REFERENCE_PATTERNS = [
  /[-\/]REF\d+/gi, // -REF123, /REF456
  /[-\/]PMT\d+/gi, // -PMT123, /PMT456 (must have digit)
  /[-\/]PAY\d+/gi, // -PAY123, /PAY456 (must have digit)
  /[-\/]INV\d+/gi, // -INV123, /INV456
  /\*\d+$/gi, // *123 at end
  /#\d+$/gi, // #456 at end
];

@Injectable()
export class PayeeNormalizerService {
  private readonly logger = new Logger(PayeeNormalizerService.name);
  private abbreviations: Map<string, string[]> = new Map();
  private reverseAbbreviations: Map<string, string> = new Map();
  private locations: Set<string> = new Set();

  constructor() {
    this.loadData();
  }

  /**
   * Load SA abbreviations and locations from JSON files
   */
  private loadData(): void {
    try {
      // Load abbreviations
      const abbrPath = path.join(__dirname, '../data/sa-abbreviations.json');
      if (fs.existsSync(abbrPath)) {
        const abbrData = JSON.parse(fs.readFileSync(abbrPath, 'utf-8'));

        // Load main abbreviations
        for (const [canonical, variants] of Object.entries(
          abbrData.abbreviations || {},
        )) {
          if (Array.isArray(variants)) {
            this.abbreviations.set(
              canonical.toUpperCase(),
              variants as string[],
            );
          }
        }

        // Load reverse lookup
        for (const [abbr, canonical] of Object.entries(
          abbrData.reverse_lookup || {},
        )) {
          this.reverseAbbreviations.set(
            abbr.toUpperCase(),
            (canonical as string).toUpperCase(),
          );
        }

        this.logger.log(
          `Loaded ${this.abbreviations.size} abbreviations, ${this.reverseAbbreviations.size} reverse lookups`,
        );
      }

      // Load locations
      const locPath = path.join(__dirname, '../data/sa-locations.json');
      if (fs.existsSync(locPath)) {
        const locData = JSON.parse(fs.readFileSync(locPath, 'utf-8'));
        const combined = locData.combined || [];
        combined.forEach((loc: string) =>
          this.locations.add(loc.toUpperCase()),
        );
        this.logger.log(`Loaded ${this.locations.size} SA locations`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load SA data files: ${error.message}. Using empty dictionaries.`,
      );
    }
  }

  /**
   * Full normalization pipeline
   * Removes suffixes, locations, reference codes, and normalizes whitespace
   *
   * @param payeeName - Raw payee name
   * @returns Normalized payee name
   */
  normalize(payeeName: string): string {
    if (!payeeName || payeeName.trim() === '') {
      return '';
    }

    let normalized = payeeName.toUpperCase();

    // Remove reference codes BEFORE removing special chars
    normalized = this.removeReferenceCodes(normalized);

    // Iterate removing both locations and suffixes
    // This handles cases like "ACME PTY LTD SANDTON" where both need removal
    let changed = true;
    let iterations = 0;
    const maxIterations = 3;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // Remove location suffixes
      const afterLocation = this.removeLocationSuffix(normalized);
      if (afterLocation !== normalized) {
        normalized = afterLocation;
        changed = true;
      }

      // Remove company suffixes
      const afterSuffix = this.removeSuffixes(normalized);
      if (afterSuffix !== normalized) {
        normalized = afterSuffix;
        changed = true;
      }
    }

    // Remove special characters
    normalized = normalized.replace(/[\/\-_.,()]/g, ' ');

    // Collapse whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Remove SA company suffixes (PTY LTD, CC, etc.)
   * Iterates multiple times to handle overlapping suffixes
   *
   * @param name - Payee name
   * @returns Name without suffixes
   */
  removeSuffixes(name: string): string {
    let result = name.toUpperCase();
    let changed = true;
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops

    // Keep removing suffixes until no more are found
    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      for (const suffix of SA_SUFFIXES) {
        // Escape special regex characters in suffix
        const escapedSuffix = suffix.replace(/[()]/g, '\\$&');

        // Remove suffix at end of string
        const suffixPattern = new RegExp(`\\s+${escapedSuffix}\\s*$`, 'gi');
        const newResult = result.replace(suffixPattern, '');
        if (newResult !== result) {
          result = newResult;
          changed = true;
        }

        // Remove suffix with parentheses (if not already in suffix pattern)
        if (!suffix.includes('(')) {
          const parenPattern = new RegExp(
            `\\s*\\(${escapedSuffix}\\)\\s*`,
            'gi',
          );
          const newResult2 = result.replace(parenPattern, ' ');
          if (newResult2 !== result) {
            result = newResult2;
            changed = true;
          }
        }
      }

      result = result.trim();
    }

    return result;
  }

  /**
   * Remove SA location suffixes (SANDTON, JHB, etc.)
   *
   * @param name - Payee name
   * @returns Name without location suffixes
   */
  removeLocationSuffix(name: string): string {
    let result = name.toUpperCase();

    for (const location of this.locations) {
      // Remove location at end of string
      const locPattern = new RegExp(`\\s+${location}\\s*$`, 'gi');
      result = result.replace(locPattern, '');

      // Remove location in middle (surrounded by spaces)
      const midPattern = new RegExp(`\\s+${location}\\s+`, 'gi');
      result = result.replace(midPattern, ' ');
    }

    return result.trim();
  }

  /**
   * Remove reference codes (-REF123, /PMT, etc.)
   *
   * @param name - Payee name
   * @returns Name without reference codes
   */
  removeReferenceCodes(name: string): string {
    let result = name;

    for (const pattern of REFERENCE_PATTERNS) {
      result = result.replace(pattern, '');
    }

    return result.trim();
  }

  /**
   * Convert to phonetic representation using Soundex algorithm
   * Useful for detecting similar-sounding names
   *
   * @param name - Payee name
   * @returns Soundex code (4 characters)
   */
  toPhonetic(name: string): string {
    if (!name || name.trim() === '') {
      return '';
    }

    const normalized = this.normalize(name);
    if (normalized.length === 0) {
      return '';
    }

    // Soundex algorithm
    const firstLetter = normalized[0].toUpperCase();

    // Map letters to Soundex codes
    const soundexMap: { [key: string]: string } = {
      B: '1',
      F: '1',
      P: '1',
      V: '1',
      C: '2',
      G: '2',
      J: '2',
      K: '2',
      Q: '2',
      S: '2',
      X: '2',
      Z: '2',
      D: '3',
      T: '3',
      L: '4',
      M: '5',
      N: '5',
      R: '6',
    };

    let code = firstLetter;
    let prevCode = soundexMap[firstLetter] || '0';

    for (let i = 1; i < normalized.length && code.length < 4; i++) {
      const char = normalized[i].toUpperCase();
      const charCode = soundexMap[char];

      if (charCode && charCode !== prevCode) {
        code += charCode;
        prevCode = charCode;
      } else if (!charCode) {
        prevCode = '0';
      }
    }

    // Pad with zeros
    return code.padEnd(4, '0');
  }

  /**
   * Get known abbreviations for a name
   * Returns all known abbreviations if the name matches a canonical form
   *
   * @param name - Payee name
   * @returns Array of known abbreviations
   */
  getAbbreviations(name: string): string[] {
    const normalized = this.normalize(name);

    // Check if this is a canonical name
    if (this.abbreviations.has(normalized)) {
      return this.abbreviations.get(normalized) || [];
    }

    // Check if this is an abbreviation that maps to a canonical
    if (this.reverseAbbreviations.has(normalized)) {
      const canonical = this.reverseAbbreviations.get(normalized);
      if (canonical && this.abbreviations.has(canonical)) {
        return this.abbreviations.get(canonical) || [];
      }
    }

    return [];
  }

  /**
   * Check if a name is a known abbreviation
   * Returns the canonical form if found
   *
   * @param name - Payee name
   * @returns Canonical name or null
   */
  resolveAbbreviation(name: string): string | null {
    const normalized = this.normalize(name);

    if (this.reverseAbbreviations.has(normalized)) {
      return this.reverseAbbreviations.get(normalized) || null;
    }

    return null;
  }

  /**
   * Check if two names are abbreviation matches
   *
   * @param nameA - First name
   * @param nameB - Second name
   * @returns True if they are known abbreviations of each other
   */
  isAbbreviationMatch(nameA: string, nameB: string): boolean {
    const normA = this.normalize(nameA);
    const normB = this.normalize(nameB);

    // Check if A is canonical and B is in its abbreviations
    if (this.abbreviations.has(normA)) {
      const abbrs = this.abbreviations.get(normA) || [];
      if (abbrs.some((a) => a.toUpperCase() === normB)) {
        return true;
      }
    }

    // Check if B is canonical and A is in its abbreviations
    if (this.abbreviations.has(normB)) {
      const abbrs = this.abbreviations.get(normB) || [];
      if (abbrs.some((a) => a.toUpperCase() === normA)) {
        return true;
      }
    }

    // Check if both map to the same canonical
    const canonicalA = this.reverseAbbreviations.get(normA);
    const canonicalB = this.reverseAbbreviations.get(normB);

    if (canonicalA && canonicalB && canonicalA === canonicalB) {
      return true;
    }

    return false;
  }
}
