/**
 * The deployment configuration actions.
 */
export type Actions = Partial<Record<string, Action>>

/**
 * The deployment configuration action.
 */
export type Action = {
  name: string
  description?: string
  runs: string | string[]
}
