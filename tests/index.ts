import * as crypto from 'crypto'

import nock from 'nock'

import { Application } from '../src/application'

import push from './fixtures/payloads/push.json'
import installation from './fixtures/payloads/installation.json'
import tokens from './fixtures/payloads/access_tokens.json'
import commits from './fixtures/payloads/commits.json'

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

  test('receives a push webhook event payload', async () => {
    nock('https://api.github.com').get('/repos/ploys/tests/installation').reply(200, installation)
    nock('https://api.github.com').post('/app/installations/1/access_tokens').reply(200, tokens)
    nock('https://api.github.com').get('/repos/ploys/tests/commits').reply(200, commits)

    await app.webhooks.receive({ id: '1', name: 'push', payload: push })
  })
})
