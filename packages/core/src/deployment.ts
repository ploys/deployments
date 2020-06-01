import type { RestEndpointMethodTypes } from '@octokit/rest'

import { Repository } from './repository'

/**
 * Re-exports the deployment type.
 */
export type Deployment = RestEndpointMethodTypes['repos']['getDeployment']['response']['data'] & {
  payload: {
    check_run_id: number
  }
}

/**
 * Gets the deployment reference.
 *
 * @param env - The deployment environment identifier.
 *
 * @returns The deployment reference.
 */
export function reference(env: string): string {
  return `deployments/${env}`
}

/**
 * Lists the deployments for the giveen commit.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 * @param run - The check run identifier.
 */
export async function list(ctx: Repository, sha: string, env: string): Promise<Deployment[]> {
  const api = await ctx.api()

  // Get the deployment reference.
  const ref = reference(env)

  // Query the deployments.
  const res = await api.repos.listDeployments({ ...ctx.params(), sha, ref, environment: env })

  return res.data as Deployment[]
}

/**
 * Gets the latest deployment for the given commit.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 */
export async function get(ctx: Repository, sha: string, env: string): Promise<Deployment> {
  // List the deployments.
  const deployments = await list(ctx, sha, env)

  // Ensure that a deployment exists.
  if (deployments.length === 0) {
    throw new Error(`No matching deployment for ${env} at ${sha}`)
  }

  // Take the latest deployment.
  return deployments[0]
}

/**
 * Creates a deployment for the given check run.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run identifier.
 */
export async function create(ctx: Repository, env: string, run: number): Promise<Deployment> {
  const api = await ctx.api()

  // Create the deployment payload.
  const pld = {
    // The check run identifier is stored in order to work backwards from an
    // existing deployment to find the associated check run.
    check_run_id: run,
  }

  // Create the deployment.
  const dep = await api.repos.createDeployment({
    ...ctx.params(),
    environment: env,
    ref: reference(env),
    task: 'deploy',
    auto_merge: false,
    required_contexts: [],
    payload: pld as any,
  })

  // Handle the created status.
  if (dep.status === 201) {
    return dep.data as Deployment
  }

  // Throw due to an unexpected error.
  throw new Error((dep.data as any).message)
}
