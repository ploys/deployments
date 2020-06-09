import type { Actions } from './action'

/**
 * The deployment configuration stages.
 */
export type Stages = Partial<Record<string, Stage>>

/**
 * The deployment configuration stage.
 */
export type Stage = {
  name?: string
  description?: string
  needs?: string | string[]
  actions?: Actions
}
