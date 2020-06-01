import type { RestEndpointMethodTypes } from '@octokit/rest'

import to from 'await-to-js'
import yaml from 'js-yaml'

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

/**
 * Gets the contents of deployment workflow files.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 *
 * @returns The promised list of deployment workflow file contents.
 */
export async function files(ctx: Repository, sha: string): Promise<any[]> {
  const api = await ctx.api()

  // Query the repository workflow files.
  const [, res] = await to(
    api.repos.getContents({
      ...ctx.params(),
      ref: sha,
      path: '.github/workflows',
    })
  )

  const items: any[] = []

  // Check if the response is a directory.
  if (res && Array.isArray(res.data)) {
    // Iterate over files in the directory contents.
    for (const item of res.data) {
      try {
        // Ensure that the file has the correct extension.
        if (item.type === 'file' && (item.name.endsWith('.yml') || item.name.endsWith('.yaml'))) {
          // Load the file contents.
          const file = await api.repos.getContents({ ...ctx.params(), ref: sha, path: item.path })

          // Convert the file to YAML.
          const data = yaml.safeLoad(Buffer.from(file.data.content, 'base64').toString())

          // Check if the workflow is for a deployment.
          if (data && data.on) {
            if (data.on === 'deployment') {
              items.push(data)
            } else if (Array.isArray(data.on) && data.on.includes('deployment')) {
              items.push(data)
            } else if (typeof data.on === 'object' && data.on['deployment'] !== undefined) {
              items.push(data)
            }
          }
        }
      } catch {
        continue
      }
    }
  }

  return items
}

/**
 * Checks if a deployment workflow exists.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 *
 * @returns The promised boolean status.
 */
export async function exists(ctx: Repository, sha: string): Promise<boolean> {
  // List the deployment workflows.
  const items = await files(ctx, sha)

  return items.length > 0
}
