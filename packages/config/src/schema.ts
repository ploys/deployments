import Joi from '@hapi/joi'

/**
 * Defines the configuration schema.
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
