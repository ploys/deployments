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
 * Detects cycles in a graph.
 *
 * @param graph - The dependency graph.
 * @param start - The start node.
 *
 * @returns The detected cycles as string representations.
 */
export function cycles(graph: { [key: string]: string[] }, start: string): string[] {
  const output: string[] = []

  // Defines an intermediate function to handle recursion.
  function detect(root: string, edges: string[], visited: string[]) {
    // Iterate over each of the edges.
    for (const edge of edges) {
      // Check if the edge has been visited before.
      if (visited.includes(edge)) {
        // Check if the edge matches the root, otherwise this will duplicate a
        // detected cycle.
        if (visited[visited.length - 1] === root) {
          // Record a representation of the cycle.
          output.push([root, ...visited].join(' -> '))
        }
        // Stop processing to prevent infinite loops.
        break
      }

      // Recurse to find deeper cycles.
      detect(root, graph[edge], [...visited, edge])
    }
  }

  detect(start, graph[start], [])

  return output
}
