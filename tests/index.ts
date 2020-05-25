import { Application } from '../src/application'

import payload from './fixtures/payload.json'

describe('application', () => {
  let app: Application

  beforeEach(() => {
    app = new Application({ secret: 'test' })
    app.initialize()
  })

  test('receives a webhook event payload', () => {
    app.webhooks.receive({ id: '1', name: 'push', payload })
  })
})
