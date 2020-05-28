import { basename, extname } from 'path'

import to from 'await-to-js'
import yaml from 'js-yaml'
import Joi from '@hapi/joi'

import { Repository } from './repository'

/**
 * The deployment configuration.
 */
export type Config = {
  id: string
  name: string
  description: string
  on: Triggers
}

/**
 * The deployment configuration list.
 */
export type ConfigList = {
  [key: string]: [Error | null, Config | undefined] | undefined
}

/**
 * The deployment configuration triggers.
 */
export type Triggers =
  | TriggerName
  | TriggerName[]
  | { push: Trigger | null }
  | { pull_request: Trigger | null }
  | { manual: Trigger | null }
  | { push: Trigger | null; pull_request: Trigger | null }
  | { push: Trigger | null; pull_request: Trigger | null; manual: Trigger | null }
  | { push: Trigger | null; manual: Trigger | null }
  | { pull_request: Trigger | null; manual: Trigger | null }

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
 * Defines the deployment configuration schema.
 *
 * This schema is applicable to the configuration after defaults have been
 * applied.
 *
 * @returns The schema definition.
 */
export function schema(): Joi.ObjectSchema<any> {
  return Joi.object({
    id: Joi.string().pattern(new RegExp('^[a-zA-Z0-9-]{2,30}$')).min(2).max(30).required(),
    name: Joi.string().alphanum().min(2).max(30).required(),
    description: Joi.string().max(140).required(),
    on: Joi.alternatives(
      Joi.string().valid('push', 'pull_request', 'manual').required(),
      Joi.array().items(Joi.string().valid('push', 'pull_request', 'manual').required()).required(),
      Joi.object({
        push: Joi.alternatives(
          null,
          Joi.object({
            branches: Joi.array().items(Joi.string().required()),
          })
        ),
        pull_request: Joi.alternatives(
          null,
          Joi.object({
            branches: Joi.array().items(Joi.string().required()),
          })
        ),
        manual: Joi.alternatives(
          null,
          Joi.object({
            branches: Joi.array().items(Joi.string().required()),
          })
        ),
      })
        .or('push', 'pull_request', 'manual')
        .required()
    ).required(),
  })
}

/**
 * Defines the default deployment configuration values.
 *
 * @param path - The config file path.
 */
export function defaults(path: string): Partial<Config> {
  const id = basename(path, extname(path)).replace(/[\W_-]+/g, '-')

  return {
    id,
    description: `The ${id} environment.`,
  }
}

/**
 * Loads deployment configuration from the repository.
 *
 * @param ctx - The repository context.
 * @param ref - The commit reference.
 * @param path - The config file path.
 *
 * @returns The promised deployment configuration.
 */
export async function load(ctx: Repository, ref: string, path: string): Promise<Config> {
  const api = await ctx.api()
  const res = await api.repos.getContents({ ...ctx.params(), ref, path })

  if (Array.isArray(res.data)) {
    throw new Error(`Expected file, found directory at '${path}' for '${ref}'`)
  }

  if (res.data.type !== 'file') {
    throw new Error(`Expected file, found '${res.data.type}' at '${path}' for '${ref}'`)
  }

  if (res.data.encoding !== 'base64') {
    throw new Error(`Unknown encoding '${res.data.encoding}' for file at '${path}' for '${ref}'`)
  }

  const obj = yaml.safeLoad(Buffer.from(res.data.content, 'base64').toString())
  const def = { ...defaults(path), ...obj }
  const val = await schema().validateAsync(def)

  return val
}

/**
 * Lists the deployment configuration.
 *
 * @param ctx - The repository context.
 * @param ref - The commit reference.
 * @param path - The config directory.
 *
 * @returns The promised list of deployment configuration.
 */
export async function list(ctx: Repository, ref: string, path: string): Promise<ConfigList> {
  const api = await ctx.api()
  const res = await api.repos.getContents({ ...ctx.params(), ref, path })
  const items: ConfigList = {}

  if (Array.isArray(res.data)) {
    for (const file of res.data) {
      if (file.type === 'file' && (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))) {
        const [err, cfg] = await to(load(ctx, ref, file.path))

        if (err) {
          const id = basename(file.path, extname(file.path)).replace(/[\W_-]+/g, '-')
          items[id] = [err, undefined]
        }

        if (cfg) {
          items[cfg.id] = [null, cfg]
        }
      }
    }
  }

  return items
}

/**
 * Checks if deployment configuration applies to the given branch and trigger.
 *
 * @param cfg - The deployment configuration.
 * @param trigger - The deployment trigger.
 * @param branch - The branch name.
 */
export function applies(cfg: Config, trigger: TriggerName, branch: string): boolean {
  if (Array.isArray(cfg.on)) {
    return cfg.on.includes(trigger)
  }

  if (typeof cfg.on === 'string') {
    return cfg.on === trigger
  }

  const tr = (cfg.on as any)[trigger] as Trigger | null | undefined

  if (tr === undefined || (tr && tr.branches && !tr.branches.includes(branch))) {
    return false
  }

  return true
}
