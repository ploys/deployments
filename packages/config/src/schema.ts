import type { Stages } from './stage'

import * as util from './util'
import Joi from '@hapi/joi'

/**
 * Defines the configuration schema.
 *
 * @returns The schema definition.
 */
export function schema(): Joi.ObjectSchema<any> {
  return Joi.object({
    id: id().required(),
    name: name().required(),
    description: description().required(),
    url: url(),
    on: triggers().required(),
    stages: stages(),
  })
}

/**
 * Defines the configuration identity schema.
 *
 * @returns The configuration identity schema definition.
 */
export function id(): Joi.StringSchema {
  return Joi.string().pattern(new RegExp('^[a-zA-Z0-9-]{2,30}$')).min(2).max(30)
}

/**
 * Defines the configuration name schema.
 *
 * @returns The configuration name schema definition.
 */
export function name(): Joi.StringSchema {
  return Joi.string().alphanum().min(2).max(30)
}

/**
 * Defines the configuration description schema.
 *
 * @returns The configuration description schema definition.
 */
export function description(): Joi.StringSchema {
  return Joi.string().max(140)
}

/**
 * Defines the configuration url schema.
 *
 * @returns The configuration url schema definition.
 */
export function url(): Joi.StringSchema {
  return Joi.string().uri()
}

/**
 * Defines the configuration triggers schema.
 *
 * @returns The configuration triggers schema definition.
 */
export function triggers(): Joi.AlternativesSchema {
  return Joi.alternatives(
    string().required(),
    array().required(),
    object().or('push', 'pull_request', 'manual').required()
  )
}

/**
 * Defines the configuration trigger string schema.
 *
 * @returns The configuration trigger string schema definition.
 */
export function string(): Joi.StringSchema {
  return Joi.string().valid('push', 'pull_request', 'manual')
}

/**
 * Defines the configuration trigger array schema.
 *
 * @returns The configuration trigger array schema definition.
 */
export function array(): Joi.ArraySchema {
  return Joi.array().items(string().required())
}

/**
 * Defines the configuration trigger object schema.
 *
 * @returns The configuration trigger object schema definition.
 */
export function object(): Joi.ObjectSchema<any> {
  return Joi.object({ push: trigger(), pull_request: trigger(), manual: trigger() })
}

/**
 * Defines the configuration trigger schema.
 *
 * @returns The configuration trigger schema definition.
 */
export function trigger(): Joi.AlternativesSchema {
  return Joi.alternatives(
    null,
    Joi.object({ branches: Joi.array().items(Joi.string().required()) })
  )
}

/**
 * Defines the configuration stages schema.
 *
 * @returns The configuration stages schema definition.
 */
export function stages(): Joi.ObjectSchema<any> {
  return Joi.object().pattern(id().required(), stage().required(), {
    matches: Joi.array().min(1),
  })
}

/**
 * Defines the configuration stage schema.
 *
 * @returns The configuration stage schema definition.
 */
export function stage(): Joi.ObjectSchema<any> {
  return Joi.object({
    name: name(),
    description: description(),
    actions: actions(),
    needs: needs(),
  })
}

/**
 * Defines the configuration actions schema.
 *
 * @returns The configuration actions schema definition.
 */
export function actions(): Joi.ObjectSchema<any> {
  return Joi.object().pattern(
    Joi.string().pattern(new RegExp('^[a-zA-Z0-9-_]{2,20}$')).min(2).max(20).required(),
    action().required()
  )
}

/**
 * Defines the configuration action schema.
 *
 * @returns The configuration action schema definition.
 */
export function action(): Joi.ObjectSchema<any> {
  return Joi.object({
    name: Joi.string().min(2).max(20).required(),
    description: Joi.string().min(2).max(40),
    runs: runs().required(),
  })
}

/**
 * Defines the configuration runs schema.
 *
 * @returns The configuration runs schema definition.
 */
export function runs(): Joi.AlternativesSchema {
  return Joi.alternatives(run(3), Joi.array().items(run(4).required()).unique())
}

/**
 * Defines the configuration run schema.
 *
 * @param index - The ancestor index.
 *
 * @returns The configuration run schema definition.
 */
export function run(index: number): Joi.StringSchema {
  return Joi.string().custom((value, helpers) => {
    // Ensure that the stage is a valid reference.
    if (!(value in helpers.state.ancestors[index])) {
      throw new Error('it must reference a valid stage')
    }

    return value
  })
}

/**
 * Defines the configuration needs schema.
 *
 * @returns The configuration needs schema definition.
 */
export function needs(): Joi.AlternativesSchema {
  return Joi.alternatives(need(1), Joi.array().items(need(2)).unique())
}

/**
 * Defines the configuration need schema.
 *
 * @param index - The ancestor index.
 *
 * @returns The configuration need schema definition.
 */
export function need(index: number): Joi.StringSchema {
  return Joi.string().custom((value, helpers) => {
    // Ensure that it is not possible to reference own stage.
    if (value === helpers.state.path![1]) {
      throw new Error('it cannot reference own stage')
    }

    // Ensure that the stage is a valid reference.
    if (!(value in helpers.state.ancestors[index])) {
      throw new Error('it must reference another stage')
    }

    const edges: { [key: string]: string[] } = {}
    const items: Stages = helpers.state.ancestors[index]

    // Build the dependency graph.
    for (const [key, item] of util.entries(items)) {
      edges[key] = util.array(item.needs)
    }

    // Detect cycles.
    const cycles = util.cycles(edges, value)

    // Handle cycles.
    if (cycles.length > 0) {
      throw new Error(`detected cycles: \n${cycles.join('\n')}`)
    }

    return value
  })
}
