/**
 * Name formatting utilities
 */

/**
 * Format a person's full name, including middle name if present and non-empty.
 *
 * @param person - Object with firstName, optional middleName, and lastName
 * @returns Full name string: "First Middle Last" or "First Last"
 */
export function formatFullName(person: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  const middle = person.middleName?.trim();
  return middle
    ? `${person.firstName} ${middle} ${person.lastName}`
    : `${person.firstName} ${person.lastName}`;
}
