import type { Types } from '@octokit/auth-app'
import type { TriggerName } from '@ploys/deployments-config'

import { Octokit } from '@octokit/rest'

import to from 'await-to-js'

import * as check from './check'
import * as config from './config'
import * as deployment from './deployment'
import * as status from './status'
import * as util from './util'
import * as workflow from './workflow'

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
    const list = await config.list(this, api, sha)

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
        if (cfg.matches(trigger, branch)) {
          // Create the check suite if it does not exist.
          await once()

          // Create the check run for the deployment environment.
          const run = await check.create(this, sha, env)

          try {
            // Lock the deployment to the commit SHA. This prevents the
            // deployment from being triggered on another commit.
            await this.lock(api, env, sha)
          } catch {
            // Otherwise set the status to ready. Ideally this would create a
            // status without any actions but this would prevent the deployment
            // from being started at a later time. It would not be feasible to
            // go back and re-enable the action once deployment is completed.
            await status.ready(this, env, run)

            continue
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
        if (cfg.matches('manual', branch) && trigger === 'push') {
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

    try {
      // Lock the deployment to the commit SHA. This prevents the deployment
      // from being triggered on another commit or by a duplicate request.
      await this.lock(api, env, sha)
    } catch {
      // Otherwise stop processing. Ideally this would alert the user that a
      // deployment is already in progress but that would leave the status
      // incorrect once the deployment is complete.
      return
    }

    // Get the check run.
    const chk = await check.get(this, run)

    // Create the deployment.
    const dep = await deployment.create(this, env, run)

    // Set the status to queued.
    await status.queued(this, env, chk, dep)
  }

  /**
   * Rerequests a deployment.
   *
   * @param sha - The commit SHA.
   * @param env - The deployment environment identifier.
   * @param last - The previous check run identifier.
   */
  async rerequest(sha: string, env: string, last: number): Promise<void> {
    const api = await this.api()

    try {
      // Lock the deployment to the commit SHA. This prevents the deployment
      // from being triggered on another commit or by a duplicate rerequest.
      await this.lock(api, env, sha)
    } catch {
      // Otherwise stop processing.
      return
    }

    // Get the previous check run.
    const chk = await check.get(this, last)

    // Ensure that the previous check run was completed as failure. This should
    // always be the case for a rerequested check.
    if (chk.status !== 'completed' || chk.conclusion !== 'failure') {
      return
    }

    // Check if a deployment workflow exists. This should never change for a
    // rerun but GitHub will offer the option to rerequest the check anyway.
    const exists = await workflow.exists(this, sha)

    // Handle the missing deployment workflow. This simply creates a fresh
    // check to update the timestamp and acknowledge that the request was
    // performed.
    if (!exists) {
      // Create the check run for the deployment environment.
      const run = await check.create(this, sha, env)

      // Set the status to missing.
      await status.missing(this, env, run)

      return
    }

    // Attempt to load the deployment configuration.
    const [err, cfg] = await to(config.get(this, api, sha, env))

    // Handle the error case. This will likely be the same as the previous run
    // but it allows for changes to the application to take effect instead of
    // simply ignoring the request.
    if (err) {
      const run = await check.create(this, sha, env)
      await status.invalid(this, env, run, err.message)
      return
    }

    // Handle valid configuration. There is no need to check if the config
    // matches here as this is a rerequest. It is also not possible to
    // accurately determine the branch.
    if (cfg) {
      const run = await check.create(this, sha, env)
      const dep = await deployment.create(this, env, run.id)
      await status.queued(this, env, run, dep)
    }
  }

  /**
   * Marks a deployment as started.
   *
   * @param sha - The commit SHA.
   * @param env - The deployment environment identifier.
   * @param suite - The GitHub Actions check suite identifier.
   */
  async started(sha: string, env: string, suite: number): Promise<void> {
    const api = await this.api()

    // Ensure that the deployment environment is locked.
    await this.ensure(api, env, sha)

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
    const api = await this.api()

    // Ensure that the deployment environment is locked.
    await this.ensure(api, env, sha)

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
        const [, cfg] = await to(config.get(this, api, sha, env))
        await status.success(this, env, chk, dep, cfg?.url())
        break
      }

      case 'failure': {
        await status.failure(this, env, chk, dep)
        break
      }
    }

    // Unlock the deployment environment.
    await this.unlock(api, env)
  }

  /**
   * Locks a deployment environment to a specific commit SHA.
   *
   * The implementation uses a custom `deployments/:environment` branch to
   * ensure that a deployment is tied to a specific commit SHA. This eliminates
   * the need for a separate data store to track locks.
   *
   * The branch also makes it possible to associate a GitHub Actions deployment
   * workflow run with the environment. Coupled with the lock it then becomes
   * possible to map a deployment workflow run to the deployment event that
   * triggered it.
   *
   * @param api - The GitHub REST API client.
   * @param env - The deployment environment identifier.
   * @param sha - The commit SHA.
   */
  async lock(api: Octokit, env: string, sha: string): Promise<void> {
    // Get the deployment reference.
    const ref = deployment.reference(env)

    try {
      // Attempt to create the branch.
      await api.git.createRef({ ...this.params(), sha, ref: `refs/heads/${ref}` })
    } catch {
      // Otherwise the branch already exists.
      throw new Error(`Failed to acquire lock for ${env} at ${sha}`)
    }
  }

  /**
   * Unlocks a deployment environment.
   *
   * @param api - The GitHub REST API client.
   * @param env - The deployment environment identifier.
   */
  async unlock(api: Octokit, env: string): Promise<void> {
    // Get the deployment reference.
    const ref = deployment.reference(env)

    try {
      // Attempt to delete the branch.
      await api.git.deleteRef({ ...this.params(), ref: `heads/${ref}` })
    } catch {
      // Otherwise the deployment is not locked.
      throw new Error(`Failed to release lock for ${env}`)
    }
  }

  /**
   * Checks if a deployment environment is locked.
   *
   * @param api - The GitHub REST API client.
   * @param env - The deployment environment identifier.
   *
   * @returns Whether the deployment environment is locked or not.
   */
  async locked(api: Octokit, env: string): Promise<boolean> {
    // Get the deployment reference.
    const ref = deployment.reference(env)

    try {
      // Check if the branch exists.
      await api.git.getRef({ ...this.params(), ref: `heads/${ref}` })
      return true
    } catch {
      return false
    }
  }

  /**
   * Ensures that a deployment environment is locked to a specific commit SHA.
   *
   * @param api - The GitHub REST API client.
   * @param env - The deployment environment identifier.
   * @param sha - The commit SHA.
   */
  async ensure(api: Octokit, env: string, sha: string): Promise<void> {
    // Get the deployment reference.
    const ref = deployment.reference(env)

    try {
      // Attempt to acquire the lock. This will more often than not fail but it
      // allows for race conditions if performed first.
      await this.lock(api, env, sha)
    } catch {
      // Otherwise attempt to ensure that the lock exists. This is done second
      // because if two processes were to ensure that the lock exists at the
      // same time then both would succeed whereas in the reverse order one
      // would fail.
      const res = await api.git.getRef({ ...this.params(), ref: `heads/${ref}` })

      // Check that the SHA matches.
      if (res.data.object.sha !== sha) {
        throw new Error(`Failed to ensure lock for ${env} at ${sha}`)
      }
    }
  }
}
