import * as crypto from 'crypto'

import nock from 'nock'

import { Application } from '../src/application'

import push from './fixtures/payloads/push.json'
import installationCreated from './fixtures/payloads/installation.created.json'

import installation from './fixtures/responses/installation.json'
import tokens from './fixtures/responses/access_tokens.json'
import commits from './fixtures/responses/commits.json'

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

  test('receives a push webhook event payload', async () => {
    nock('https://api.github.com').get('/repos/ploys/tests/installation').reply(200, installation)
    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com').get('/repos/ploys/tests/commits').reply(200, commits)

    await app.webhooks.receive({ id: '1', name: 'push', payload: push })
  })
})
