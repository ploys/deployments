import * as http from 'http'

import EventSource from 'eventsource'
import { Octokit } from '@octokit/rest'
import { Webhooks } from '@octokit/webhooks'
import { createAppAuth } from '@octokit/auth-app'

import type { Types } from '@octokit/auth-app'
import type { AuthInterface } from '@octokit/types'

import { Context } from './context'

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
   * Initializes the application.
   */
  initialize(): void {
    this.webhooks.on('push', async event => {
      const ctx = new Context(this, event)
      const api = await ctx.api()
      const res = await api.repos.listCommits(ctx.repo)

      console.log(res)
    })

    this.webhooks.on('error', error => {
      console.error(error)
    })
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
}
