import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'

import { Repository } from './repository'

/**
 * The deployment type.
 */
export type Deployment = RestEndpointMethodTypes['repos']['getDeployment']['response']['data'] & {
  payload: {
    check_run_id: number
    stages: string[]
    completed_stages: string[]
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
export async function list(
  ctx: Repository,
  sha: string,
  env: string,
  run?: number
): Promise<Deployment[]> {
  const api = await ctx.api()

  // Get the deployment reference.
  const ref = reference(env)

  // Query the deployments.
  const res = await api.repos.listDeployments({ ...ctx.params(), sha, ref, environment: env })

  // Cast the deployments to recognize the payload.
  let deployments = res.data as Deployment[]

  if (run) {
    // Filter the deployments for the check run.
    deployments = deployments.filter(deployment => deployment.payload.check_run_id === run)
  }

  return deployments
}

/**
 * Gets the latest deployment for the given commit.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 * @param run - The check run identifier.
 */
export async function get(
  ctx: Repository,
  sha: string,
  env: string,
  run?: number
): Promise<Deployment> {
  // List the deployments.
  const deployments = await list(ctx, sha, env, run)

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
 * @param task - The task name.
 * @param stages - The deployment stages to run.
 * @param completed - The deployment stages that are already complete.
 */
export async function create(
  ctx: Repository,
  env: string,
  run: number,
  task: string,
  stages: string[],
  completed: string[]
): Promise<Deployment> {
  const api = await ctx.api()

  // Create the deployment payload.
  const pld = {
    // The check run identifier is stored in order to work backwards from an
    // existing deployment to find the associated check run.
    check_run_id: run,
    // The stages are stored to track multi-stage deployment progress. This can
    // also be used by the workflow to conditionally run jobs and steps.
    stages,
    // The completed stages are stored here so that they can be passed to
    // subsequent deployments without having to be tracked by the application.
    completed_stages: completed,
  }

  // Create the deployment.
  const dep = await api.repos.createDeployment({
    ...ctx.params(),
    environment: env,
    ref: reference(env),
    task,
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

/**
 * Deletes a deployment.
 *
 * @param ctx - The repository context.
 * @param api - The GitHub REST API client.
 * @param dep - The deployment identifier.
 */
export async function remove(ctx: Repository, api: Octokit, dep: number): Promise<void> {
  // Mark the deployment as inactive to allow deletion.
  await api.repos.createDeploymentStatus({
    ...ctx.params(),
    deployment_id: dep,
    state: 'inactive',
  })

  // Delete the deployment.
  await api.repos.deleteDeployment({
    ...ctx.params(),
    deployment_id: dep,
  })
}
