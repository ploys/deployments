/**
 * Utility type to require at least one key.
 */
export type Require<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys]

/**
 * The deployment configuration trigger name.
 */
export type TriggerName = 'push' | 'pull_request' | 'manual'

/**
 * The deployment configuration trigger.
 */
export type Trigger = {
  branches?: string[]
}

/**
 * The deployment configuration triggers.
 */
export type Triggers = TriggerName | TriggerName[] | Require<Record<TriggerName, Trigger | null>>
