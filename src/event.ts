import type { Webhooks } from '@octokit/webhooks'

/**
 * The webhook event payload with repository information.
 */
export type WebhookPayloadWithRepository = {
  repository: {
    id: number
    name: string
    owner: {
      name?: string
      login: string
    }
  }
}

/**
 * The webhook event payload with installation information.
 */
export type WebhookPayloadWithInstallation = {
  installation: {
    id: number
  }
}

/**
 * The webhook event.
 */
export type Event<T> = Webhooks.WebhookEvent<
  T & WebhookPayloadWithRepository & Partial<WebhookPayloadWithInstallation>
>
