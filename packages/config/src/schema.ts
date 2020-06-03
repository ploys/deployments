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
    on: triggers().required(),
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
