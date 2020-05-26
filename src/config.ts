import { basename, extname } from 'path'

import to from 'await-to-js'
import yaml from 'js-yaml'
import Joi from '@hapi/joi'

import { Context } from './context'

/**
 * The deployment configuration.
 */
export type Config = {
  id: string
  name: string
  description: string
}

/**
 * The deployment configuration list.
 */
export type ConfigList = {
  [key: string]: [Error | null, Config | undefined] | undefined
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
 * @param ctx - The context.
 * @param ref - The commit reference.
 * @param path - The config file path.
 *
 * @returns The promised deployment configuration.
 */
export async function load(ctx: Context<any>, ref: string, path: string): Promise<Config> {
  const api = await ctx.api()
  const res = await api.repos.getContents({ ...ctx.repo, ref, path })

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
 * @param ctx - The context.
 * @param ref - The commit reference.
 * @param path - The config directory.
 *
 * @returns The promised list of deployment configuration.
 */
export async function list(ctx: Context<any>, ref: string, path: string): Promise<ConfigList> {
  const api = await ctx.api()
  const res = await api.repos.getContents({ ...ctx.repo, ref, path })
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