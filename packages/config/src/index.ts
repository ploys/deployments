import type { Octokit } from '@octokit/rest'
import type { Trigger, TriggerName, Triggers } from './trigger'
import type { Stages } from './stage'

import { basename, extname } from 'path'
import { schema as definition } from './schema'

import to from 'await-to-js'
import yaml from 'js-yaml'

export type { Trigger, TriggerName, Triggers } from './trigger'
export type { Stage, Stages } from './stage'
export type { Action, Actions } from './action'

/**
 * The generated schema.
 */
export const schema = definition()

/**
 * The deployment configuration parameters.
 */
export type Params = {
  owner: string
  repo: string
  path: string
  ref: string
}

/**
 * The deployment configuration data.
 */
export type ConfigData = {
  id: string
  name: string
  description: string
  url?: string
  on: Triggers
  stages: Stages
}

/**
 * The deployment configuration list.
 */
export type ConfigList = {
  [key: string]: [Error | null, Config | undefined] | undefined
}

/**
 * The deployment configuration.
 */
export class Config {
  private readonly data: ConfigData

  /**
   * Creates the configuration.
   *
   * @param data - The deployment configuration data.
   */
  constructor(data: ConfigData) {
    this.data = data
  }

  /**
   * Gets the configuration identifier.
   *
   * @returns The configuration identifier.
   */
  public id(): string {
    return this.data.id
  }

  /**
   * Gets the configuration name.
   *
   * @returns The configuration name.
   */
  public name(): string {
    return this.data.name
  }

  /**
   * Gets the configuration description.
   *
   * @returns The configuration description.
   */
  public description(): string {
    return this.data.description
  }

  /**
   * Gets the deployment url.
   *
   * @returns The deployment url.
   */
  public url(): string | undefined {
    return this.data.url
  }

  /**
   * Gets the deployment triggers.
   *
   * @returns The deployment triggers.
   */
  public triggers(): Triggers {
    return this.data.on
  }

  /**
   * Gets the deployment stages.
   *
   * @returns The deployment stages.
   */
  public stages(): Stages {
    return this.data.stages
  }

  /**
   * Checks if the configuration matches the given branch and trigger.
   *
   * @param trigger - The deployment trigger.
   * @param branch - The branch name.
   */
  public matches(trigger: TriggerName, branch: string): boolean {
    const triggers = this.triggers()

    if (Array.isArray(triggers)) {
      return triggers.includes(trigger)
    }

    if (typeof triggers === 'string') {
      return triggers === trigger
    }

    const tr = (triggers as any)[trigger] as Trigger | null | undefined

    if (tr === undefined || (tr && tr.branches && !tr.branches.includes(branch))) {
      return false
    }

    return true
  }

  /**
   * Loads deployment configuration.
   *
   * @param api - The GitHub REST API client.
   * @param params - The deployment configuration parameters.
   *
   * @returns The promised deployment configuration.
   */
  public static async load(api: Octokit, params: Params): Promise<Config> {
    const res = await api.repos.getContents(params)

    if (Array.isArray(res.data)) {
      throw new Error(`Expected file, found directory at '${params.path}' for '${params.ref}'`)
    }

    if (res.data.type !== 'file') {
      throw new Error(
        `Expected file, found '${res.data.type}' at '${params.path}' for '${params.ref}'`
      )
    }

    if (res.data.encoding !== 'base64') {
      throw new Error(
        `Unknown encoding '${res.data.encoding}' for file at '${params.path}' for '${params.ref}'`
      )
    }

    const obj = yaml.safeLoad(Buffer.from(res.data.content, 'base64').toString())
    const def = { ...this.defaults(params.path), ...obj }
    const val = await schema.validateAsync(def)

    return new this(val)
  }

  /**
   * Lists deployment configuration.
   *
   * @param api - The GitHub REST API client.
   * @param params - The deployment configuration parameters.
   *
   * @returns The promised list of deployment configuration.
   */
  public static async list(api: Octokit, params: Params): Promise<ConfigList> {
    const res = await api.repos.getContents(params)
    const items: ConfigList = {}

    if (Array.isArray(res.data)) {
      for (const file of res.data) {
        if (file.type === 'file' && (file.name.endsWith('.yml') || file.name.endsWith('.yaml'))) {
          const [err, cfg] = await to(this.load(api, { ...params, path: file.path }))

          if (err) {
            const id = basename(file.path, extname(file.path)).replace(/[\W_-]+/g, '-')
            items[id] = [err, undefined]
          }

          if (cfg) {
            items[cfg.id()] = [null, cfg]
          }
        }
      }
    }

    return items
  }

  /**
   * Defines the default configuration options.
   *
   * @param path - The config file path.
   */
  public static defaults(path: string): Partial<ConfigData> {
    const id = basename(path, extname(path)).replace(/[\W_-]+/g, '-')

    return {
      id,
      description: `The ${id} environment.`,
      stages: {
        deploy: {
          name: 'Deploy',
          description: `Deploy to ${id}`,
        },
      },
    }
  }
}
