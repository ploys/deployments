import type { Types } from '@octokit/auth-app'

import { Octokit } from '@octokit/rest'

import * as config from './config'
import * as deployment from './deployment'
import * as util from './util'

import { TriggerName } from './config'
import { Application } from './application'
import { Installation } from './installation'

/**
 * The repository options.
 */
export type Options = {
  id: number
  name: string
  owner: string
}

/**
 * The repository context.
 */
export class Repository {
  private inner: {
    installation: Installation
    options: Options
  }

  /**
   * Creates the repository context.
   *
   * @param installation - The installation.
   * @param options - The repository options.
   */
  constructor(installation: Installation, options: Options) {
    this.inner = { installation, options }
  }

  /**
   * Gets the repository identifier.
   *
   * @returns The repository identifier.
   */
  id(): number {
    return this.inner.options.id
  }

  /**
   * Gets the repository name.
   *
   * @returns The repository name.
   */
  name(): string {
    return this.inner.options.name
  }

  /**
   * Gets the repository owner.
   *
   * @returns The repository owner.
   */
  owner(): string {
    return this.inner.options.owner
  }

  /**
   * Gets the installation.
   *
   * @returns The installation.
   */
  installation(): Installation {
    return this.inner.installation
  }

  /**
   * Gets the application.
   *
   * @returns The application.
   */
  app(): Application {
    return this.inner.installation.app()
  }

  /**
   * Gets the repository parameters.
   *
   * @returns The repository paramaters.
   */
  params(): { repo: string; owner: string } {
    return {
      repo: this.inner.options.name,
      owner: this.inner.options.owner,
    }
  }

  /**
   * Gets the repository authentication.
   *
   * @returns The promised repository authentication.
   */
  async auth(): Promise<Types['Authentication']> {
    return await this.installation().auth()
  }

  /**
   * Gets the GitHub API client.
   *
   * @returns The promised GitHub API client.
   */
  async api(): Promise<Octokit> {
    return await this.installation().api()
  }

  /**
   * Installs the application for the repository.
   */
  async install(): Promise<void> {
    const app = this.app().id()
    const api = await this.api()

    await api.checks.setSuitesPreferences({
      ...this.params(),
      auto_trigger_checks: [{ app_id: app, setting: false }],
    })
  }

  /**
   * Starts a deployment.
   *
   * @param sha - The commit SHA.
   * @param branch - The branch name.
   * @param trigger - The deployment trigger.
   */
  async deploy(sha: string, branch: string, trigger: TriggerName): Promise<void> {
    const api = await this.api()

    // Load existing check suites.
    const res = await api.checks.listSuitesForRef({
      ...this.params(),
      app_id: this.app().id(),
      ref: sha,
    })

    // Skip processing if the check suite has already been created. This occurs
    // when an existing commit has been pushed to a new branch or when a pull
    // request event triggers after a push.
    if (res.data.total_count > 0) {
      return
    }

    // Wrap the check suite creation to ensure it only runs once.
    const once = util.once(async () => {
      await api.checks.createSuite({ ...this.params(), head_sha: sha })
    })

    // Load deployment configuration.
    const list = await config.list(this, sha, '.github/deployments')

    // Iterate over each of the deployment configuration entries.
    for (const [id, [err, cfg]] of util.entries(list)) {
      // Create the invalid status on configuration error.
      if (err) {
        await once()
        await deployment.invalid(this, sha, id, err.message)
      }

      // Create the ready status if the configuration applies.
      if (cfg && config.applies(cfg, trigger, branch)) {
        await once()
        await deployment.ready(this, sha, id)
      }
    }
  }
}
