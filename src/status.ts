import { CheckRun } from './check'
import { Deployment } from './deployment'
import { Repository } from './repository'

/**
 * Sets the deployment check status to invalid.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run.
 * @param msg - The error message.
 */
export async function invalid(
  ctx: Repository,
  env: string,
  run: CheckRun,
  msg: string
): Promise<void> {
  const api = await ctx.api()

  // Update the status of the check run.
  await api.checks.update({
    ...ctx.params(),
    check_run_id: run.id,
    status: 'completed',
    conclusion: 'failure',
    output: {
      title: 'Invalid',
      summary: `Invalid deployment configuration for the ${env} environment.`,
      text: `## Error\n\n\`\`\`\n${msg}\n\`\`\``,
    },
  })
}

/**
 * Sets the deployment check status to ready.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run.
 */
export async function ready(ctx: Repository, env: string, run: CheckRun): Promise<void> {
  const api = await ctx.api()

  // Update the status of the check run.
  await api.checks.update({
    ...ctx.params(),
    check_run_id: run.id,
    status: 'completed',
    conclusion: 'neutral',
    output: {
      title: 'Ready',
      summary: `Ready for deployment to the ${env} environment.`,
    },
  })
}

/**
 * Sets the deployment check status to queued.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run.
 * @param dep - The deployment.
 */
export async function queued(
  ctx: Repository,
  env: string,
  run: CheckRun,
  dep: Deployment
): Promise<void> {
  const api = await ctx.api()

  // Update the status of the deployment.
  await api.repos.createDeploymentStatus({
    ...ctx.params(),
    deployment_id: dep.id,
    state: 'queued',
    description: `Queued deployment to the ${env} environment.`,
    log_url: run.html_url,
  })

  // Update the status of the associated check run.
  await api.checks.update({
    ...ctx.params(),
    check_run_id: run.id,
    details_url: run.html_url,
    status: 'queued',
    output: {
      title: 'Queued',
      summary: `Queued deployment to the ${env} environment.`,
    },
  })
}

/**
 * Sets the deployment check status to started.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run.
 * @param dep - The deployment.
 */
export async function started(
  ctx: Repository,
  env: string,
  run: CheckRun,
  dep: Deployment
): Promise<void> {
  const api = await ctx.api()

  // Update the status of the deployment.
  await api.repos.createDeploymentStatus({
    ...ctx.params(),
    deployment_id: dep.id,
    state: 'in_progress',
    description: `Deploying to the ${env} environment.`,
    log_url: run.html_url,
  })

  // Update the status of the associated check run.
  await api.checks.update({
    ...ctx.params(),
    check_run_id: run.id,
    details_url: run.html_url,
    status: 'in_progress',
    output: {
      title: 'Deploying',
      summary: `Deploying to the ${env} environment.`,
    },
  })
}

/**
 * Sets the deployment check status to success.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run.
 * @param dep - The deployment.
 */
export async function success(
  ctx: Repository,
  env: string,
  run: CheckRun,
  dep: Deployment
): Promise<void> {
  const api = await ctx.api()

  // Update the status of the deployment.
  await api.repos.createDeploymentStatus({
    ...ctx.params(),
    deployment_id: dep.id,
    state: 'success',
    description: `Deployed to the ${env} environment.`,
    log_url: run.html_url,
    auto_inactive: true,
  })

  // Update the status of the associated check run.
  await api.checks.update({
    ...ctx.params(),
    check_run_id: run.id,
    details_url: run.html_url,
    status: 'completed',
    conclusion: 'success',
    output: {
      title: 'Deployed',
      summary: `Deployed to the ${env} environment.`,
    },
  })
}

/**
 * Sets the deployment check status to failure.
 *
 * @param ctx - The repository context.
 * @param env - The deployment environment identifier.
 * @param run - The associated check run.
 * @param dep - The deployment.
 */
export async function failure(
  ctx: Repository,
  env: string,
  run: CheckRun,
  dep: Deployment
): Promise<void> {
  const api = await ctx.api()

  // Update the status of the deployment.
  await api.repos.createDeploymentStatus({
    ...ctx.params(),
    deployment_id: dep.id,
    state: 'failure',
    description: `Failed deployment to the ${env} environment.`,
    log_url: run.html_url,
    auto_inactive: false,
  })

  // Update the status of the associated check run.
  await api.checks.update({
    ...ctx.params(),
    check_run_id: run.id,
    details_url: run.html_url,
    status: 'completed',
    conclusion: 'failure',
    output: {
      title: 'Failed',
      summary: `Failed deployment to the ${env} environment.`,
    },
  })
}
