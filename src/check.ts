import type { RestEndpointMethodTypes } from '@octokit/rest'

import { Repository } from './repository'

/**
 * Re-exports the check run type.
 */
export type CheckRun = RestEndpointMethodTypes['checks']['create']['response']['data']

/**
 * Gets the deployment check run.
 *
 * @param ctx - The repository context.
 * @param id - The check run identifier.
 */
export async function get(ctx: Repository, id: number): Promise<CheckRun> {
  const api = await ctx.api()

  // Query the deployment check run.
  const res = await api.checks.get({ ...ctx.params(), check_run_id: id })

  return res.data
}

/**
 * Creates a check run.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 */
export async function create(ctx: Repository, sha: string, env: string): Promise<CheckRun> {
  const api = await ctx.api()

  // Create the check run.
  const res = await api.checks.create({
    ...ctx.params(),
    name: `deployments/${env}`,
    head_sha: sha,
    external_id: env,
    status: 'queued',
    output: {
      title: 'Queued',
      summary: `Queued deployment to the ${env} environment.`,
    },
  })

  return res.data
}
