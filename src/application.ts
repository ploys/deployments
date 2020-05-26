import * as http from 'http'

import EventSource from 'eventsource'
import { Octokit } from '@octokit/rest'
import { Webhooks } from '@octokit/webhooks'
import { createAppAuth } from '@octokit/auth-app'

import type { Types } from '@octokit/auth-app'
import type { AuthInterface } from '@octokit/types'

import * as config from './config'
import * as util from './util'
import { Context } from './context'
import { Installation } from './installation'

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
  private options: Options

  webhooks: Webhooks
  authenticator: AuthInterface<[Types['AuthOptions']], Types['Authentication']>

  /**
   * Creates the application.
   *
   * @param options - The application options.
   */
  constructor(options: Options) {
    this.options = options
    this.webhooks = new Webhooks({ secret: options.secret })
    this.authenticator = createAppAuth({ id: options.id, privateKey: options.privateKey })
  }

  /**
   * Gets the application identifier.
   *
   * @returns The application identifier.
   */
  id(): number {
    return this.options.id
  }

  /**
   * Initializes the application.
   */
  initialize(): void {
    this.webhooks.on('installation.created', this.onInstallation.bind(this))
    this.webhooks.on('installation_repositories.added', this.onRepositoriesAdded.bind(this))
    this.webhooks.on('push', this.onPush.bind(this))
    this.webhooks.on('error', error => console.error(error))
  }

  /**
   * Authenticates the application.
   *
   * @returns The promised authentication.
   */
  async auth(): Promise<Types['Authentication']> {
    return await this.authenticator({ type: 'app' })
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
    const server = http.createServer(this.webhooks.middleware)

    if (proxy) {
      const source = new EventSource(proxy)

      source.onmessage = event => {
        const webhookEvent = JSON.parse(event.data)

        try {
          this.webhooks.verifyAndReceive({
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
   * Handles the *installation created* event.
   *
   * @param event - The event.
   */
  private async onInstallation(
    event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadInstallation>
  ): Promise<void> {
    const installation = new Installation(this, {
      id: event.payload.installation.id,
      repos: event.payload.repositories.map(repository => {
        const [owner, repo] = repository.full_name.split('/', 2)

        return { id: repository.id, owner, repo }
      }),
    })

    await installation.install()
  }

  /**
   * Handles the *installation repositories added* event.
   *
   * @param event - The event.
   */
  private async onRepositoriesAdded(
    event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadInstallationRepositories>
  ): Promise<void> {
    const installation = new Installation(this, {
      id: event.payload.installation.id,
      repos: event.payload.repositories_added.map(repository => {
        const [owner, repo] = repository.full_name.split('/', 2)

        return { id: repository.id, owner, repo }
      }),
    })

    await installation.install()
  }

  /**
   * Handles the *push* event.
   *
   * @param event - The event.
   */
  private async onPush(event: Webhooks.WebhookEvent<Webhooks.WebhookPayloadPush>): Promise<void> {
    const ctx = new Context(this, event)
    const api = await ctx.api()
    const cfg = await config.list(ctx, event.payload.after, '.github/deployments')

    for (const [id, [err]] of util.entries(cfg)) {
      if (err) {
        await api.checks.create({
          ...ctx.repo,
          name: `deployments/${id}`,
          head_sha: event.payload.after,
          external_id: id,
          status: 'completed',
          conclusion: 'failure',
          output: {
            title: 'Invalid',
            summary: `Invalid deployment configuration for the ${id} environment.`,
            text: `## Error\n\n\`\`\`\n${err.message}\n\`\`\``,
          },
        })
      }
    }
  }
}
