import type { Types } from '@octokit/auth-app'

import { Octokit } from '@octokit/rest'

import * as check from './check'
import * as config from './config'
import * as deployment from './deployment'
import * as status from './status'
import * as util from './util'
import * as workflow from './workflow'

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

    // Check if a deployment workflow exists, otherwise the status cannot be
    // tracked.
    const exists = await workflow.exists(this, sha)

    // Load deployment configuration.
    const list = await config.list(this, sha, '.github/deployments')

    // Iterate over each of the deployment configuration entries.
    for (const [env, [err, cfg]] of util.entries(list)) {
      // Handle missing deployment workflow.
      if (!exists) {
        // Create the check suite if it does not exist.
        await once()

        // Create the check run for the deployment environment.
        const run = await check.create(this, sha, env)

        // Set the status to missing.
        await status.missing(this, env, run)

        continue
      }

      // Handle error case.
      if (err) {
        // Create the check suite if it does not exist.
        await once()

        // Create the check run for the deployment environment.
        const run = await check.create(this, sha, env)

        // Set the status to invalid.
        await status.invalid(this, env, run, err.message)
      }

      // Handle valid configuration.
      if (cfg) {
        // Check if the configuration is applicable.
        if (config.applies(cfg, trigger, branch)) {
          // Create the check suite if it does not exist.
          await once()

          // Create the check run for the deployment environment.
          const run = await check.create(this, sha, env)

          // Get the deployment reference.
          const ref = deployment.reference(env)

          // Create the deployment reference branch. This makes it possible to
          // distinguish between deployment environments when multiple
          // deployment configurations are provided. Otherwise a GitHub Actions
          // workflow run would have no association to the deployment that
          // triggered it.
          try {
            // Attempt to update an existing deployment reference branch.
            await api.git.updateRef({ ...this.params(), sha, ref: `heads/${ref}`, force: true })
          } catch {
            // Alternatively attempt to create a new deployment reference branch.
            await api.git.createRef({ ...this.params(), sha, ref: `refs/heads/${ref}` })
          }

          // Create the deployment.
          const dep = await deployment.create(this, env, run.id)

          // Set the status to queued.
          await status.queued(this, env, run, dep)

          continue
        }

        // Check if manual deployment is enabled. This is limited to the push
        // event as that is when the ready status should be created. However it
        // should not be possible for a pull request event to get this far.
        if (config.applies(cfg, 'manual', branch) && trigger === 'push') {
          // Create the check suite if it does not exist.
          await once()

          // Create the check run for the deployment environment.
          const run = await check.create(this, sha, env)

          // Set the status to ready.
          await status.ready(this, env, run)

          continue
        }
      }
    }
  }

  /**
   * Requests a deployment.
   *
   * @param sha - The commit SHA.
   * @param env - The deployment environment identifier.
   * @param run - The check run identifier.
   */
  async request(sha: string, env: string, run: number): Promise<void> {
    const api = await this.api()

    // Get the deployment reference.
    const ref = deployment.reference(env)

    // Create the deployment reference branch. This makes it possible to
    // distinguish between deployment environments when multiple
    // deployment configurations are provided. Otherwise a GitHub Actions
    // workflow run would have no association to the deployment that
    // triggered it.
    try {
      // Attempt to update an existing deployment reference branch.
      await api.git.updateRef({ ...this.params(), sha, ref: `heads/${ref}`, force: true })
    } catch {
      // Alternatively attempt to create a new deployment reference branch.
      await api.git.createRef({ ...this.params(), sha, ref: `refs/heads/${ref}` })
    }

    // Get the check run.
    const chk = await check.get(this, run)

    // Create the deployment.
    const dep = await deployment.create(this, env, run)

    // Set the status to queued.
    await status.queued(this, env, chk, dep)
  }

  /**
   * Marks a deployment as started.
   *
   * @param sha - The commit SHA.
   * @param env - The deployment environment identifier.
   * @param suite - The GitHub Actions check suite identifier.
   */
  async started(sha: string, env: string, suite: number): Promise<void> {
    // Get the latest deployment workflow run.
    const run = await workflow.get(this, sha, env)

    // Ensure that the run belongs to the correct check suite. This could also
    // be done by mapping a workflow job id to a check run id but this would
    // require additional requests.
    if (!run.check_suite_url.includes(suite.toString())) {
      throw new Error(`Invalid workflow run for ${env} on ${suite} at ${sha}`)
    }

    // Ensure that the run is not marked as completed. This can happen on short
    // workflows when webhook payloads are delivered out of order.
    if (run.status === 'completed') {
      return
    }

    // Get the latest deployment for the commit.
    const dep = await deployment.get(this, sha, env)

    // Get the associated check run.
    const chk = await check.get(this, dep.payload.check_run_id)

    // Ensure that the check run status is queued. Otherwise another check run
    // may have already updated the status. This will be the case for workflows
    // that use multiple jobs as it is not possible to respond to check suite
    // creation events for GitHub Actions.
    if (chk.status !== 'queued') {
      return
    }

    // Set the status to started.
    await status.started(this, env, chk, dep)
  }

  /**
   * Marks a deployment as completed.
   *
   * @param sha - The commit SHA.
   * @param env - The deployment environment identifier.
   * @param suite - The GitHub Actions check suite identifier.
   */
  async completed(sha: string, env: string, suite: number): Promise<void> {
    // Get the latest deployment workflow run.
    const run = await workflow.get(this, sha, env)

    // Ensure that the run belongs to the correct check suite. This could also
    // be done by mapping a workflow job id to a check run id but this would
    // require additional requests.
    if (!run.check_suite_url.includes(suite.toString())) {
      throw new Error(`Invalid workflow run for ${env} on ${suite} at ${sha}`)
    }

    // Ensure that the run is not marked as completed.
    if (run.status !== 'completed') {
      return
    }

    // Get the latest deployment for the commit.
    const dep = await deployment.get(this, sha, env)

    // Get the associated check run.
    const chk = await check.get(this, dep.payload.check_run_id)

    // Handle the workflow run conclusion.
    switch (run.conclusion) {
      case 'success': {
        await status.success(this, env, chk, dep)
        break
      }

      case 'failure': {
        await status.failure(this, env, chk, dep)
        break
      }
    }
  }
}
