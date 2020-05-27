import * as crypto from 'crypto'

import nock from 'nock'
import { safeDump } from 'js-yaml'

import { Application } from '../src/application'

import push from './fixtures/payloads/push.json'
import pull_request from './fixtures/payloads/pull_request.opened.json'
import installationCreated from './fixtures/payloads/installation.created.json'

import installation from './fixtures/responses/installation.json'
import tokens from './fixtures/responses/access_tokens.json'
import commits from './fixtures/responses/commits.json'

function encode(input: any): string {
  return Buffer.from(safeDump(input)).toString('base64')
}

describe('application', () => {
  let app: Application

  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  beforeEach(() => {
    nock.disableNetConnect()

    app = new Application({ id: 1, privateKey, secret: 'test' })
    app.initialize()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  test('disables automatic check suite creation', async done => {
    nock('https://api.github.com').get('/repos/ploys/tests/installation').reply(200, installation)
    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com')
      .patch('/repos/ploys/tests/check-suites/preferences', body => {
        expect(body).toEqual({
          auto_trigger_checks: [{ app_id: 1, setting: false }],
        })

        done()

        return true
      })
      .reply(200, {})

    await app.webhooks.receive({ id: '1', name: 'installation', payload: installationCreated })
  })

  test('creates a check run for invalid configuration on push', async done => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/ploys/tests/installation')
      .reply(200, installation)

    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com').get('/repos/ploys/tests/commits').reply(200, commits)

    nock('https://api.github.com')
      .get('/repos/ploys/tests/contents/.github%2Fdeployments')
      .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
      .reply(200, [
        {
          type: 'file',
          name: 'invalid.yml',
          path: '.github/deployments/invalid.yml',
        },
      ])

    nock('https://api.github.com')
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

    nock('https://api.github.com')
      .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
      .query({ app_id: 1 })
      .reply(200, { total_count: 0, check_suites: [] })

    nock('https://api.github.com').post('/repos/ploys/tests/check-suites').reply(200)

    nock('https://api.github.com')
      .post('/repos/ploys/tests/check-runs', body => {
        expect(body).toMatchObject({
          name: 'deployments/invalid',
          external_id: 'invalid',
          status: 'completed',
          conclusion: 'failure',
        })
        done()
        return true
      })
      .matchHeader('accept', 'application/vnd.github.antiope-preview+json')
      .reply(200)

    await app.webhooks.receive({ id: '1', name: 'push', payload: push })
  })

  test('creates a check run for valid configuration on push', async done => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/ploys/tests/installation')
      .reply(200, installation)

    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com').get('/repos/ploys/tests/commits').reply(200, commits)

    nock('https://api.github.com')
      .get('/repos/ploys/tests/contents/.github%2Fdeployments')
      .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
      .reply(200, [
        {
          type: 'file',
          name: 'valid.yml',
          path: '.github/deployments/valid.yml',
        },
      ])

    nock('https://api.github.com')
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

    nock('https://api.github.com')
      .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
      .query({ app_id: 1 })
      .reply(200, { total_count: 0, check_suites: [] })

    nock('https://api.github.com').post('/repos/ploys/tests/check-suites').reply(200)

    nock('https://api.github.com')
      .post('/repos/ploys/tests/check-runs', body => {
        expect(body).toMatchObject({
          name: 'deployments/valid',
          external_id: 'valid',
          status: 'completed',
          conclusion: 'neutral',
        })
        done()
        return true
      })
      .matchHeader('accept', 'application/vnd.github.antiope-preview+json')
      .reply(200)

    await app.webhooks.receive({ id: '1', name: 'push', payload: push })
  })

  test('supports multiple deployment configurations', async done => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/ploys/tests/installation')
      .reply(200, installation)

    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com').get('/repos/ploys/tests/commits').reply(200, commits)

    nock('https://api.github.com')
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

    nock('https://api.github.com')
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

    nock('https://api.github.com')
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

    nock('https://api.github.com')
      .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
      .query({ app_id: 1 })
      .reply(200, { total_count: 0, check_suites: [] })

    nock('https://api.github.com').post('/repos/ploys/tests/check-suites').reply(200)

    nock('https://api.github.com')
      .post('/repos/ploys/tests/check-runs', body => {
        expect(body).toMatchObject({
          name: 'deployments/staging',
          external_id: 'staging',
          status: 'completed',
          conclusion: 'neutral',
        })
        return true
      })
      .matchHeader('accept', 'application/vnd.github.antiope-preview+json')
      .reply(200)

    nock('https://api.github.com')
      .post('/repos/ploys/tests/check-runs', body => {
        expect(body).toMatchObject({
          name: 'deployments/production',
          external_id: 'production',
          status: 'completed',
          conclusion: 'neutral',
        })
        done()
        return true
      })
      .matchHeader('accept', 'application/vnd.github.antiope-preview+json')
      .reply(200)

    await app.webhooks.receive({ id: '1', name: 'push', payload: push })
  })

  test('creates a check run on pull request to master branch', async done => {
    nock('https://api.github.com')
      .persist()
      .get('/repos/ploys/tests/installation')
      .reply(200, installation)

    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com').get('/repos/ploys/tests/commits').reply(200, commits)

    nock('https://api.github.com')
      .get('/repos/ploys/tests/contents/.github%2Fdeployments')
      .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
      .reply(200, [
        {
          type: 'file',
          name: 'staging.yml',
          path: '.github/deployments/staging.yml',
        },
      ])

    nock('https://api.github.com')
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

    nock('https://api.github.com')
      .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
      .query({ app_id: 1 })
      .reply(200, { total_count: 0, check_suites: [] })

    nock('https://api.github.com').post('/repos/ploys/tests/check-suites').reply(200)

    nock('https://api.github.com')
      .post('/repos/ploys/tests/check-runs', body => {
        expect(body).toMatchObject({
          name: 'deployments/staging',
          external_id: 'staging',
          status: 'completed',
          conclusion: 'neutral',
        })
        done()
        return true
      })
      .matchHeader('accept', 'application/vnd.github.antiope-preview+json')
      .reply(200)

    await app.webhooks.receive({ id: '1', name: 'pull_request', payload: pull_request })
  })
})
