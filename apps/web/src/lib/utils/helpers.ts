/**
 * Helper utilities for UI components and common operations
 */

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/**
 * Get the appropriate badge variant based on status
 * Maps various status strings to UI badge variants for consistent styling
 * @param status - The status string to map
 * @returns Badge variant for styling
 */
export function getStatusBadgeVariant(status: string): BadgeVariant {
  const variants: Record<string, BadgeVariant> = {
    // Invoice statuses
    draft: 'secondary',
    pending: 'outline',
    sent: 'default',
    paid: 'default',
    overdue: 'destructive',

    // Transaction statuses
    categorized: 'default',
    uncategorized: 'secondary',
    needs_review: 'destructive',

    // Payment statuses
    matched: 'default',
    unmatched: 'destructive',
    partial: 'outline',

    // SARS statuses
    submitted: 'default',
    accepted: 'default',
    rejected: 'destructive',
  };

  return variants[status.toLowerCase()] ?? 'secondary';
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - The text to truncate
 * @param length - Maximum length before truncation
 * @returns Truncated text with "..." if needed
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}...`;
}

/**
 * Pluralize a word based on count
 * @param count - The count to check
 * @param singular - Singular form of the word
 * @param plural - Optional plural form (defaults to singular + "s")
 * @returns Singular or plural form based on count
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/**
 * Get initials from a name
 * @param name - Full name string
 * @returns Uppercase initials (max 2 characters)
 */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generate a safe slug from a string
 * @param text - The text to slugify
 * @returns URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array)
 * @param value - The value to check
 * @returns true if empty, false otherwise
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Debounce a function call
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
