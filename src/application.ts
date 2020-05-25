import * as http from 'http'

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
   */
  start(): http.Server {
    return http.createServer(this.webhooks.middleware).listen(3000)
  }
}
