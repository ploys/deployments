import type { RestEndpointMethodTypes } from '@octokit/rest'

import * as deployment from './deployment'

import { Repository } from './repository'

/**
 * Re-exports the workflow run type.
 */
export type WorkflowRun = RestEndpointMethodTypes['actions']['getWorkflowRun']['response']['data']

/**
 * Lists the deployment workflow runs for the given commit.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 *
 * @returns The promised deployment workflow runs.
 */
export async function list(ctx: Repository, sha: string, env: string): Promise<WorkflowRun[]> {
  const api = await ctx.api()

  // Get the deployment reference.
  const ref = deployment.reference(env)

  // Query the deployment workflow runs.
  const res = await api.actions.listRepoWorkflowRuns({
    ...ctx.params(),
    event: 'deployment',
    branch: ref,
  })

  // Filter out workflow runs that do not belong to the commit.
  return res.data.workflow_runs.filter(run => run.head_sha === sha)
}

/**
 * Gets the latest deployment workflow run for the given commit.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 *
 * @returns The promised deployment workflow run.
 */
export async function get(ctx: Repository, sha: string, env: string): Promise<WorkflowRun> {
  // List the completed deployment workflow runs.
  const runs = await list(ctx, sha, env)

  // Ensure that a workflow run exists.
  if (runs.length === 0) {
    throw new Error(`No matching workflow run for ${env} at ${sha}`)
  }

  // Take the latest workflow run.
  return runs[0]
}
