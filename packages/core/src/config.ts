import type { Octokit } from '@octokit/rest'
import type { ConfigList } from '@ploys/deployments-config'
import type { Repository } from './repository'

import { Config } from '@ploys/deployments-config'

import * as util from './util'

/**
 * Gets the deployment configuration.
 *
 * @param ctx - The repository context.
 * @param api - The GitHub REST API client.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 *
 * @returns The promised deployment configuration.
 */
export async function get(
  ctx: Repository,
  api: Octokit,
  sha: string,
  env: string
): Promise<Config> {
  const data = await list(ctx, api, sha)

  for (const [key, [err, cfg]] of util.entries(data)) {
    if (key === env) {
      if (cfg) {
        return cfg
      }

      if (err) {
        throw err
      }
    }
  }

  throw new Error(`Unable to get config for ${env} at ${sha}`)
}

/**
 * Lists the deployment configuration.
 *
 * @param ctx - The repository context.
 * @param api - The GitHub REST API client.
 * @param sha - The commit SHA.
 *
 * @returns The promised list of deployment configuration.
 */
export async function list(ctx: Repository, api: Octokit, sha: string): Promise<ConfigList> {
  return await Config.list(api, { ...ctx.params(), ref: sha, path: '.github/deployments' })
}
