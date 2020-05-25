import * as http from 'http'

import EventSource from 'eventsource'
import { Webhooks } from '@octokit/webhooks'

/**
 * The application.
 */
export class Application {
  webhooks: Webhooks

  /**
   * Creates the application.
   *
   * @param options - The application options.
   */
  constructor(options: { secret: string }) {
    this.webhooks = new Webhooks({ secret: options.secret })
  }

  /**
   * Initializes the application.
   */
  initialize(): void {
    this.webhooks.on('*', ({ id, name, payload }) => {
      console.log(`received event ${name} (${id})`, payload)
    })
  }

  /**
   * Starts the application.
   *
   * @param proxy - The optional proxy server URL.
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
