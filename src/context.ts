import type { Types } from '@octokit/auth-app'
import type { Webhooks } from '@octokit/webhooks'

import { Octokit } from '@octokit/rest'

import { Application } from './application'

/**
 * The repository information.
 */
export type Repository = { repo: string; owner: string }

/**
 * The repository payload component.
 */
export type RepositoryPayload = {
  repository: { id: number; name: string; owner: { name?: string; login: string } }
}

/**
 * The installation payload component.
 */
export type InstallationPayload = {
  installation: { id: number }
}

/**
 * The event.
 */
export type Event<T> = Webhooks.WebhookEvent<T & RepositoryPayload & Partial<InstallationPayload>>

/**
 * The webhook event context.
 */
export class Context<T> {
  app: Application
  repo: Repository
  event: Event<T>

  /**
   * Creates the context.
   *
   * @param app - The application.
   * @param event - The webhook event.
   */
  constructor(app: Application, event: Event<T>) {
    this.app = app
    this.event = event
    this.repo = {
      repo: event.payload.repository.name,
      owner: event.payload.repository.owner.name || event.payload.repository.owner.login,
    }
  }

  /**
   * Authenticates the context.
   *
   * @returns The promised authentication.
   */
  async auth(): Promise<Types['Authentication']> {
    const installationId = await this.installation()
    const repositoryIds = [this.event.payload.repository.id]

    return await this.app.authenticator({ type: 'installation', installationId, repositoryIds })
  }

  /**
   * Gets the GitHub API client.
   *
   * @returns The promised GitHub API client.
   */
  async api(): Promise<Octokit> {
    const auth = await this.auth()

    return new Octokit({ auth: auth.token })
  }

  /**
   * Gets the installation identifier.
   */
  async installation(): Promise<number> {
    if (this.event.payload.installation?.id) {
      return this.event.payload.installation.id
    }

    const api = await this.app.api()
    const installation = await api.apps.getRepoInstallation(this.repo)

    return installation.data.id
  }
}
