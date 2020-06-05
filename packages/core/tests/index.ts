import * as crypto from 'crypto'

import { safeDump } from 'js-yaml'

import { Harness } from '@ploys/harness'
import { Application } from '../src/application'

import push from './fixtures/payloads/push.json'
import pullRequest from './fixtures/payloads/pull_request.opened.json'
import installationCreated from './fixtures/payloads/installation.created.json'
import checkRun from './fixtures/payloads/check_run.created.json'
import checkSuite from './fixtures/payloads/check_suite.completed.json'
import requestedAction from './fixtures/payloads/check_run.requested_action.json'

import installation from './fixtures/responses/installation.json'
import tokens from './fixtures/responses/access_tokens.json'

function encode(input: any): string {
  return Buffer.from(safeDump(input)).toString('base64')
}

describe('application', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const harness = new Harness(async () => {
    const application = new Application({ id: 1, secret: 'secret', privateKey })
    application.initialize()
    return application
  })

  beforeEach(harness.setup)
  afterEach(harness.teardown)

  test('disables automatic check suite creation', async () => {
    await harness.run(async cx => {
      cx.intercept().get('/repos/ploys/tests/installation').reply(200, installation)
      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)
      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-suites/preferences', body => {
          expect(body).toEqual({
            auto_trigger_checks: [{ app_id: 1, setting: false }],
          })
          return true
        })
        .reply(200, {})

      await cx.receive('installation', installationCreated)
    })
  })

  test('creates a check run for invalid configuration on push', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'invalid.yml',
            path: '.github/deployments/invalid.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Finvalid.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'invalid.yml',
          path: '.github/deployments/invalid.yml',
          encoding: 'base64',
          content: encode({
            id: 'my&invalid&id',
            name: 'invalid',
            description: 'The invalid deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'invalid',
            external_id: 'invalid',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'failure',
            output: {
              title: 'Invalid',
              summary: 'Invalid deployment configuration for the invalid environment.',
            },
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)
    })
  })

  test('creates a check run for missing deployment workflow on push', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query(true)
        .reply(200, [])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'staging.yml',
            path: '.github/deployments/staging.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fstaging.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
          encoding: 'base64',
          content: encode({
            id: 'staging',
            name: 'staging',
            description: 'The staging deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'staging',
            external_id: 'staging',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'failure',
            output: {
              title: 'Missing workflow',
              summary: 'No deployment workflow found for the staging environment.',
            },
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)
    })
  })

  test('creates a check run for push workflow on push', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'staging.yml',
            path: '.github/deployments/staging.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fstaging.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
          encoding: 'base64',
          content: encode({
            id: 'staging',
            name: 'staging',
            description: 'The staging deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'staging',
            external_id: 'staging',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'failure',
            output: {
              title: 'Missing workflow',
              summary: 'No deployment workflow found for the staging environment.',
            },
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)
    })
  })

  test('queues a deployment for valid configuration on push', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'valid.yml',
            path: '.github/deployments/valid.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fvalid.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'valid.yml',
          path: '.github/deployments/valid.yml',
          encoding: 'base64',
          content: encode({
            id: 'valid',
            name: 'valid',
            description: 'The valid deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'valid',
            external_id: 'valid',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/valid',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'valid',
            ref: 'deployments/valid',
            payload: {
              check_run_id: 1,
            },
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)
    })
  })

  test('supports multiple deployment configurations', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'staging.yml',
            path: '.github/deployments/staging.yml',
          },
          {
            type: 'file',
            name: 'production.yml',
            path: '.github/deployments/production.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fstaging.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
          encoding: 'base64',
          content: encode({
            id: 'staging',
            name: 'staging',
            description: 'The staging deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fproduction.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'production.yml',
          path: '.github/deployments/production.yml',
          encoding: 'base64',
          content: encode({
            id: 'production',
            name: 'production',
            description: 'The production deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'staging',
            external_id: 'staging',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/staging',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'staging',
            ref: 'deployments/staging',
            payload: {
              check_run_id: 1,
            },
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'production',
            external_id: 'production',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 2,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/production',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'production',
            ref: 'deployments/production',
            payload: {
              check_run_id: 2,
            },
          })
          return true
        })
        .reply(201, {
          id: 2,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/2/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/2', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)
    })
  })

  test('queues a deployment on pull request to master branch', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'staging.yml',
            path: '.github/deployments/staging.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fstaging.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
          encoding: 'base64',
          content: encode({
            id: 'staging',
            name: 'staging',
            description: 'The staging deployment configuration',
            on: {
              pull_request: {
                branches: ['master'],
              },
            },
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'staging',
            external_id: 'staging',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/staging',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'staging',
            ref: 'deployments/staging',
            payload: {
              check_run_id: 1,
            },
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      await cx.receive('pull_request', pullRequest)
    })
  })

  test('creates, updates and completes a deployment', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'staging.yml',
            path: '.github/deployments/staging.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fstaging.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
          encoding: 'base64',
          content: encode({
            id: 'staging',
            name: 'staging',
            description: 'The staging deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'staging',
            external_id: 'staging',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/staging',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'staging',
            ref: 'deployments/staging',
            payload: {
              check_run_id: 1,
            },
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/actions/runs')
        .query({ event: 'deployment', branch: 'deployments/staging' })
        .reply(200, {
          total_count: 1,
          workflow_runs: [
            {
              id: 1,
              status: 'queued',
              check_suite_url: '/1',
              head_sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            },
          ],
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/deployments')
        .query({
          sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
          ref: 'deployments/staging',
          environment: 'staging',
        })
        .reply(200, [
          {
            id: 1,
            ref: 'deployments/staging',
            task: 'deploy',
            environment: 'staging',
            state: 'queued',
            payload: {
              check_run_id: 1,
            },
          },
        ])

      cx.expect().intercept().get('/repos/ploys/tests/check-runs/1').reply(200, {
        id: 1,
        status: 'queued',
      })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'in_progress',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'in_progress',
          })
          return true
        })
        .reply(200)

      await cx.receive('check_run', checkRun)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/actions/runs')
        .query({ event: 'deployment', branch: 'deployments/staging' })
        .reply(200, {
          total_count: 1,
          workflow_runs: [
            {
              id: 1,
              status: 'completed',
              conclusion: 'success',
              check_suite_url: '/1',
              head_sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            },
          ],
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/deployments')
        .query({
          sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
          ref: 'deployments/staging',
          environment: 'staging',
        })
        .reply(200, [
          {
            id: 1,
            ref: 'deployments/staging',
            task: 'deploy',
            environment: 'staging',
            state: 'in_progress',
            payload: {
              check_run_id: 1,
            },
          },
        ])

      cx.expect().intercept().get('/repos/ploys/tests/check-runs/1').reply(200, {
        id: 1,
        status: 'in_progress',
      })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'success',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'success',
          })
          return true
        })
        .reply(200)

      await cx.receive('check_suite', checkSuite)
    })
  })

  test('creates, updates and completes a manual deployment', async () => {
    await harness.run(async cx => {
      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect().intercept().post('/app/installations/1/access_tokens').reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'staging.yml',
            path: '.github/deployments/staging.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fstaging.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
          encoding: 'base64',
          content: encode({
            id: 'staging',
            name: 'staging',
            description: 'The staging deployment configuration',
            on: 'manual',
          }),
        })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'staging',
            external_id: 'staging',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'neutral',
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/staging',
          })
          return true
        })
        .reply(201)

      cx.expect().intercept().get('/repos/ploys/tests/check-runs/1').reply(200, {
        id: 1,
        status: 'completed',
        conclusion: 'neutral',
      })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'staging',
            ref: 'deployments/staging',
            payload: {
              check_run_id: 1,
            },
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      await cx.receive('check_run', requestedAction)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/actions/runs')
        .query({ event: 'deployment', branch: 'deployments/staging' })
        .reply(200, {
          total_count: 1,
          workflow_runs: [
            {
              id: 1,
              status: 'queued',
              check_suite_url: '/1',
              head_sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            },
          ],
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/deployments')
        .query({
          sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
          ref: 'deployments/staging',
          environment: 'staging',
        })
        .reply(200, [
          {
            id: 1,
            ref: 'deployments/staging',
            task: 'deploy',
            environment: 'staging',
            state: 'queued',
            payload: {
              check_run_id: 1,
            },
          },
        ])

      cx.expect().intercept().get('/repos/ploys/tests/check-runs/1').reply(200, {
        id: 1,
        status: 'queued',
      })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'in_progress',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'in_progress',
          })
          return true
        })
        .reply(200)

      await cx.receive('check_run', checkRun)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/actions/runs')
        .query({ event: 'deployment', branch: 'deployments/staging' })
        .reply(200, {
          total_count: 1,
          workflow_runs: [
            {
              id: 1,
              status: 'completed',
              conclusion: 'success',
              check_suite_url: '/1',
              head_sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            },
          ],
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/deployments')
        .query({
          sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
          ref: 'deployments/staging',
          environment: 'staging',
        })
        .reply(200, [
          {
            id: 1,
            ref: 'deployments/staging',
            task: 'deploy',
            environment: 'staging',
            state: 'in_progress',
            payload: {
              check_run_id: 1,
            },
          },
        ])

      cx.expect().intercept().get('/repos/ploys/tests/check-runs/1').reply(200, {
        id: 1,
        status: 'in_progress',
      })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'success',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'success',
          })
          return true
        })
        .reply(200)

      await cx.receive('check_suite', checkSuite)
    })
  })
})
