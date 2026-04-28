/**
 * Name Normalizer Utility
 *
 * Conservative write-time normalizer for parent/child first_name and last_name
 * fields. Only corrects obviously-broken casing (ALL_UPPER or all_lower).
 * Already mixed-case values — including Dutch-particle names like
 * "van der Merwe" — are returned unchanged.
 *
 * Rules (applied in order):
 *  1. null / undefined  → null
 *  2. Trim + collapse internal whitespace
 *  3. Trimmed length ≤ 2 → return trimmed (preserves initials: "A", "KM")
 *  4. All-uppercase AND contains [A-Z] → Title Case each whitespace token
 *  5. All-lowercase AND contains [a-z] → Title Case each whitespace token
 *  6. Anything else (already mixed-case) → return trimmed unchanged
 *
 * Decorator division of responsibilities:
 *  - @SanitizeName() (sanitize.utils.ts): XSS/HTML-strip + control-char removal
 *    + whitespace collapse. Applies to ALL string name fields including
 *    non-person strings (e.g. bankName). Declared below @Transform so it runs
 *    FIRST in class-transformer's bottom-up evaluation order.
 *  - @Transform(normalizeName): Title-Case correction for person-name fields only
 *    (firstName, lastName). Declared above @SanitizeName so it runs SECOND,
 *    operating on already-sanitized input. Do NOT apply to institution names.
 */

/**
 * Apply Title Case to a single whitespace-delimited token.
 * E.g. "OMOLEMO" → "Omolemo", "MARY-JANE" → "Mary-jane"
 * (hyphen-compound tokens are treated as one word by design — v1 scope).
 */
function titleCaseToken(token: string): string {
  if (token.length === 0) return token;
  return token[0].toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Normalizes a name value at write time.
 *
 * @param input - Raw value from the request body.
 * @returns Normalized string, or null for absent values.
 */
export function normalizeName(input: string | null | undefined): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  // Step 2: trim + collapse internal whitespace
  const trimmed = input.trim().replace(/\s+/g, ' ');

  // Step 3: length ≤ 2 — preserve initials/abbreviations unchanged
  if (trimmed.length <= 2) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();

  // Step 4: all-uppercase AND contains at least one [A-Z] letter
  if (trimmed === upper && /[A-Z]/.test(trimmed)) {
    return trimmed.split(' ').map(titleCaseToken).join(' ');
  }

  // Step 5: all-lowercase AND contains at least one [a-z] letter
  if (trimmed === lower && /[a-z]/.test(trimmed)) {
    return trimmed.split(' ').map(titleCaseToken).join(' ');
  }

  // Step 6: already mixed-case (or no letters) — return trimmed unchanged
  return trimmed;
}

export default normalizeName;
