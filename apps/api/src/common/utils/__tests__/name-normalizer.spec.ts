/**
 * Name Normalizer Tests
 *
 * Covers the conservative write-time normalization logic.
 * Verifies that obviously-broken casing is fixed, intentional mixed-case
 * and short initials are preserved, and whitespace is normalised.
 */

import { normalizeName } from '../name-normalizer';

describe('normalizeName', () => {
  // ---- null / undefined ----
  it('returns null for null', () => {
    expect(normalizeName(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeName(undefined)).toBeNull();
  });

  // ---- ALL_UPPER → Title Case ----
  it('title-cases all-uppercase single word', () => {
    expect(normalizeName('OMOLEMO')).toBe('Omolemo');
  });

  it('title-cases all-uppercase multi-word name', () => {
    expect(normalizeName('MARY JANE')).toBe('Mary Jane');
  });

  // ---- all_lower → Title Case ----
  it('title-cases all-lowercase single word', () => {
    expect(normalizeName('kaboentle')).toBe('Kaboentle');
  });

  // ---- short initials — must NOT be changed ----
  it('preserves two-char initials unchanged', () => {
    expect(normalizeName('KM')).toBe('KM');
  });

  it('preserves single-char initial unchanged', () => {
    expect(normalizeName('A')).toBe('A');
  });

  // ---- already Title Case — must NOT be changed ----
  it('returns already-Title-Cased name unchanged', () => {
    expect(normalizeName('Sarah')).toBe('Sarah');
  });

  // ---- mixed-case particles — must NOT be changed ----
  it('preserves Dutch-particle name unchanged', () => {
    expect(normalizeName('van der Merwe')).toBe('van der Merwe');
  });

  // ---- whitespace handling ----
  it('trims leading and trailing whitespace', () => {
    expect(normalizeName('  Sarah  ')).toBe('Sarah');
  });

  it('collapses internal double space to single space', () => {
    expect(normalizeName('Mary  Jane')).toBe('Mary Jane');
  });

  // ---- hyphenated names ----
  // "MARY-JANE" is all-uppercase, so it is Title-Cased.
  // The hyphen-compound is treated as a single whitespace-delimited token:
  // titleCaseToken('MARY-JANE') = 'M' + 'ary-jane' = 'Mary-jane'.
  // This is intentional v1 behaviour — documented here so future engineers
  // understand and can extend if O'Name / McName support is needed.
  it('title-cases hyphenated all-uppercase as a single token (v1 behaviour)', () => {
    expect(normalizeName('MARY-JANE')).toBe('Mary-jane');
  });

  // ---- edge cases ----
  it('returns empty string for empty string', () => {
    expect(normalizeName('')).toBe('');
  });

  it('returns whitespace-only as empty string after trim', () => {
    expect(normalizeName('   ')).toBe('');
  });

  it('preserves a name that is exactly 2 chars even if uppercase', () => {
    // "JD" length === 2 → length guard fires → returned unchanged
    expect(normalizeName('JD')).toBe('JD');
  });

  it('normalises a 3-char all-uppercase name', () => {
    // Length > 2, so rule 4 fires
    expect(normalizeName('JAN')).toBe('Jan');
  });
});
