/**
 * formatFullName — assemble a full name string from parts.
 *
 * Mirrors the API-side helper so display is consistent across surfaces.
 * Middle name is included only when present and non-empty.
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
