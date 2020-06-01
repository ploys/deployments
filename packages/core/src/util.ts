/**
 * A value that is never undefined.
 */
export type Defined<T> = T extends undefined ? never : T

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
