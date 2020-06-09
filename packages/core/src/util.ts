/**
 * A value that is never undefined.
 */
export type Defined<T> = T extends undefined ? never : T

/**
 * Creates a flat array.
 *
 * @param input - The input.
 *
 * @returns The flat array.
 */
export function array<T>(input: T | T[] | undefined): T[] {
  return [input || []].flat() as T[]
}

/**
 * Removes duplicate values from an array.
 *
 * @param input - The input.
 *
 * @returns The deduplicated array.
 */
export function unique<T>(input: T[]): T[] {
  return Array.from(new Set(input))
}

/**
 * Gets the entries of an object.
 *
 * Like Object.entries but with defined values.
 *
 * @param object - The object.
 *
 * @returns The object entries.
 */
export function entries<T>(
  object: { [s: string]: T } | ArrayLike<T> | undefined
): Array<[string, Defined<T>]> {
  return Object.entries(object || {}) as Array<[string, Defined<T>]>
}

/**
 * Gets the values of an object.
 *
 * Like Object.values but with defined values.
 *
 * @param object - The object.
 *
 * @returns The object values.
 */
export function values<T>(
  object: { [s: string]: T } | ArrayLike<T> | undefined
): Array<Defined<T>> {
  return Object.values(object || {}) as Array<Defined<T>>
}

/**
 * Runs a function once.
 *
 * @param fn - The function to run.
 *
 * @returns A wrapper function which can call the input only once.
 */
export function once(fn: () => Promise<void>): () => Promise<void> {
  let call: (() => Promise<void>) | null = fn

  return async function (): Promise<void> {
    if (call) {
      await call()

      call = null
    }
  }
}
