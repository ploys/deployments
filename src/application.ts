import * as http from 'http'

import EventSource from 'eventsource'
import { Octokit } from '@octokit/rest'
import { Webhooks } from '@octokit/webhooks'
import { createAppAuth } from '@octokit/auth-app'

import type { Types } from '@octokit/auth-app'
import type { AuthInterface } from '@octokit/types'

import { Installation } from './installation'
import { Event } from './event'

/**
 * The application options.
 */
export type Options = {
  id: number
  privateKey: string
  secret: string
}

/**
 * The application.
 */
export class Application {
  private inner: {
    options: Options
    webhooks: Webhooks
    authenticate: AuthInterface<[Types['AuthOptions']], Types['Authentication']>
  }

  /**
   * Creates the application.
   *
   * @param options - The application options.
   */
  constructor(options: Options) {
    this.inner = {
      options,
      webhooks: new Webhooks({ secret: options.secret }),
      authenticate: createAppAuth({ id: options.id, privateKey: options.privateKey }),
    }
  }

  /**
   * Gets the application identifier.
   *
   * @returns The application identifier.
   */
  id(): number {
    return this.inner.options.id
  }

  /**
   * Gets the application webhooks.
   *
   * @returns The application webhooks.
   */
  webhooks(): Webhooks {
    return this.inner.webhooks
  }

  /**
   * Initializes the application.
   */
  initialize(): void {
    const hooks = this.webhooks()

    hooks.on('installation.created', this.onInstallation.bind(this))
    hooks.on('installation_repositories.added', this.onRepositoriesAdded.bind(this))
    hooks.on('push', this.onPush.bind(this))
    hooks.on('pull_request.opened', this.onPullRequest.bind(this))
    hooks.on('pull_request.synchronize', this.onPullRequest.bind(this))
    hooks.on('error', error => console.error(error))
  }

  /**
   * Authenticates with GitHub.
   *
   * @returns The authenticator method.
   */
  async authenticate(options: Types['AuthOptions']): Promise<Types['Authentication']> {
    return this.inner.authenticate(options)
  }

  /**
   * Gets the application authentication.
   *
   * @returns The promised application authentication.
   */
  async auth(): Promise<Types['Authentication']> {
    return await this.authenticate({ type: 'app' })
  }

  /**
   * Gets the GitHub API client.
   *
   * @returns The promised API client.
   */
  async api(): Promise<Octokit> {
    const auth = await this.auth()

    return new Octokit({ auth: auth.token })
  }

  /**
   * Starts the application.
   *
   * @param proxy - The optional proxy server URL.
   *
   * @returns The HTTP server.
   */
  start(proxy?: string): http.Server {
    const server = http.createServer(this.webhooks().middleware)

    if (proxy) {
      const source = new EventSource(proxy)

      source.onmessage = event => {
        const webhookEvent = JSON.parse(event.data)

        try {
          this.webhooks().verifyAndReceive({
            id: webhookEvent['x-request-id'],
            name: webhookEvent['x-github-event'],
            signature: webhookEvent['x-hub-signature'],
            payload: webhookEvent.body,
          })
        } catch (error) {
          console.error(error)
        }
      }
    }

    return server.listen(3000)
  }

  /**
   * Gets the installation for an event.
   *
   * @param event - The event object.
   */
  async installation<T>(event: Event<T>): Promise<Installation> {
    const repo = {
      id: event.payload.repository.id,
      name: event.payload.repository.name,
      owner: event.payload.repository.owner.name || event.payload.repository.owner.login,
    }

    if (event.payload.installation?.id) {
      return new Installation(this, { id: event.payload.installation.id, repos: [repo] })
    }

    const api = await this.api()
    const res = await api.apps.getRepoInstallation({ owner: repo.owner, repo: repo.name })

    return new Installation(this, { id: res.data.id, repos: [repo] })
  }

  /**
   * Handles the *installation created* event.
   *
   * @param event - The event object.
   */
  private async onInstallation(
    event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadInstallation>
  ): Promise<void> {
    const installation = new Installation(this, {
      id: event.payload.installation.id,
      repos: event.payload.repositories.map(repository => {
        const [owner, name] = repository.full_name.split('/', 2)

        return { id: repository.id, owner, name }
      }),
    })

    await installation.install()
  }

  /**
   * Handles the *installation repositories added* event.
   *
   * @param event - The event object.
   */
  private async onRepositoriesAdded(
    event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadInstallationRepositories>
  ): Promise<void> {
    const installation = new Installation(this, {
      id: event.payload.installation.id,
      repos: event.payload.repositories_added.map(repository => {
        const [owner, name] = repository.full_name.split('/', 2)

        return { id: repository.id, owner, name }
      }),
    })

    await installation.install()
  }

  /**
   * Handles the *push* event.
   *
   * @param event - The event object.
   */
  private async onPush(event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadPush>): Promise<void> {
    // Skip commit reference deletion.
    if (event.payload.deleted) {
      return
    }

    // Skip pushes that are not on a branch.
    if (!event.payload.ref.startsWith('refs/heads/')) {
      return
    }

    const sha = event.payload.after
    const ref = event.payload.ref.substring(11)

    const inst = await this.installation(event)
    const repo = await inst.repository(event.payload.repository.id)

    await repo.deploy(sha, ref, 'push')
  }

  /**
   * Handles the *pull request opened/synchronize* event.
   *
   * @param event - The event object.
   */
  private async onPullRequest(
    event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadPullRequest>
  ): Promise<void> {
    const sha = event.payload.pull_request.head.sha
    const ref = event.payload.pull_request.base.ref

    const inst = await this.installation(event)
    const repo = await inst.repository(event.payload.repository.id)

    await repo.deploy(sha, ref, 'pull_request')
  }
}
