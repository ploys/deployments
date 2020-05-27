import type { Types } from '@octokit/auth-app'

import { Octokit } from '@octokit/rest'

import { Application } from './application'
import { Repository } from './repository'

/**
 * The installation options.
 */
export type Options = {
  id: number
  repos: RepositoryInfo[]
}

/**
 * The repository information.
 */
export type RepositoryInfo = {
  id: number
  name: string
  owner: string
}

/**
 * The installation context.
 */
export class Installation {
  private inner: {
    app: Application
    options: Options
  }

  /**
   * Creates the installation context.
   *
   * @param app - The application.
   * @param options - The installation options.
   */
  constructor(app: Application, options: Options) {
    this.inner = { app, options }
  }

  /**
   * Gets the installation identifier.
   *
   * @returns The installation identifier.
   */
  id(): number {
    return this.inner.options.id
  }

  /**
   * Gets the application.
   *
   * @returns The application.
   */
  app(): Application {
    return this.inner.app
  }

  /**
   * Gets the installation repositories.
   *
   * @returns The installation repositories.
   */
  repos(): RepositoryInfo[] {
    return this.inner.options.repos
  }

  /**
   * Gets an installation repository.
   *
   * @param id - The repository identifier.
   *
   * @returns The installation repository, if it exists.
   */
  repo(id: number): RepositoryInfo | undefined {
    const repos = this.repos().filter(repo => repo.id === id)

    if (repos.length > 0) {
      return repos[0]
    }
  }

  /**
   * Gets the repository context.
   *
   * @param id - The repository identifier.
   *
   * @returns The promised repository context.
   */
  async repository(id: number): Promise<Repository> {
    const repo = this.repo(id)

    if (repo) {
      return new Repository(this, repo)
    }

    throw new Error(`No repository '${id}' for installation '${this.id()}'`)
  }

  /**
   * Gets the installation authentication.
   *
   * @returns The promised installation authentication.
   */
  async auth(): Promise<Types['Authentication']> {
    return await this.app().authenticate({
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
   * Installs the application for the installation repositories.
   */
  async install(): Promise<void> {
    for (const data of this.repos()) {
      const repo = await this.repository(data.id)

      repo.install()
    }
  }
}
