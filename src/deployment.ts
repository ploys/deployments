import { Repository } from './repository'

/**
 * Sets the deployment check status to invalid.
 *
 * @param ctx - The repository context.
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 * @param msg - The error message.
 */
export async function invalid(
  ctx: Repository,
  sha: string,
  env: string,
  msg: string
): Promise<void> {
  const api = await ctx.api()
  await api.checks.create({
    ...ctx.params(),
    name: `deployments/${env}`,
    head_sha: sha,
    external_id: env,
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
 * @param sha - The commit SHA.
 * @param env - The deployment environment identifier.
 */
export async function ready(ctx: Repository, sha: string, env: string): Promise<void> {
  const api = await ctx.api()
  await api.checks.create({
    ...ctx.params(),
    name: `deployments/${env}`,
    head_sha: sha,
    external_id: env,
    status: 'completed',
    conclusion: 'neutral',
    output: {
      title: 'Ready',
      summary: `Ready for deployment to the ${env} environment.`,
    },
  })
}
