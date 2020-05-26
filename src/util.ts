/**
 * Gets the entries of an object.
 *
 * Like Object.entries but with non-nullable values.
 *
 * @param object - The object.
 *
 * @returns The object entries.
 */
export function entries<T>(
  object: { [s: string]: T } | ArrayLike<T> | undefined
): Array<[string, NonNullable<T>]> {
  return Object.entries(object || {}) as Array<[string, NonNullable<T>]>
}
