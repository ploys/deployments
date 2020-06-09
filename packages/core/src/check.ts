import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'

import { Repository } from './repository'

/**
 * Re-exports the check run type.
 */
export type CheckRun = RestEndpointMethodTypes['checks']['create']['response']['data']

/**
 * Finds the latest deployment check run.
 *
 * @param ctx - The repository context.
 * @param api - The GitHub REST API client.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 */
export async function find(
  ctx: Repository,
  api: Octokit,
  sha: string,
  env: string
): Promise<CheckRun> {
  const list = await api.checks.listForRef({
    ...ctx.params(),
    ref: sha,
    check_name: env,
    filter: 'latest',
  })

  if (list.data.total_count > 0) {
    return list.data.check_runs[0]
  }

  throw new Error(`Unable to find check run for ${env} at ${sha}`)
}

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
    name: env,
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
