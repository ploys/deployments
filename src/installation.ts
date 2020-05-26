import type { Types } from '@octokit/auth-app'

import { Octokit } from '@octokit/rest'

import { Application } from './application'

/**
 * The repository information.
 */
export type Repository = { id: number; repo: string; owner: string }

/**
 * The installation options.
 */
export type Options = {
  id: number
  repos: Repository[]
}

/**
 * The installation.
 */
export class Installation {
  private application: Application
  private options: Options

  /**
   * Creates the installation.
   *
   * @param app - The application.
   * @param options - The installation options.
   */
  constructor(app: Application, options: Options) {
    this.application = app
    this.options = options
  }

  /**
   * Gets the installation identifier.
   *
   * @returns The installation identifier.
   */
  id(): number {
    return this.options.id
  }

  /**
   * Gets the application.
   *
   * @returns The application.
   */
  app(): Application {
    return this.application
  }

  /**
   * Gets the installation repositories.
   */
  repos(): Repository[] {
    return this.options.repos
  }

  /**
   * Authenticates the installation.
   *
   * @returns The promised authentication.
   */
  async auth(): Promise<Types['Authentication']> {
    return await this.app().authenticator({
      type: 'installation',
      installationId: this.id(),
      repositoryIds: this.repos().map(repo => repo.id),
    })
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
   * Installs the application for the installation.
   */
  async install(): Promise<void> {
    const app = this.app().id()
    const api = await this.api()

    for (const repo of this.repos()) {
      await api.checks.setSuitesPreferences({
        owner: repo.owner,
        repo: repo.repo,
        auto_trigger_checks: [{ app_id: app, setting: false }],
      })
    }
  }
}
