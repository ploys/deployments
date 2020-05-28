import * as config from '../src/config'

const schema = config.schema()

function valid(value: any) {
  expect(schema.validate(value).error).toBeUndefined()
}

function invalid(value: any) {
  expect(schema.validate(value).error).toBeDefined()
}

function applies(cfg: config.Config, trigger: config.TriggerName, branch: string, bool: boolean) {
  expect(config.applies(cfg, trigger, branch)).toBe(bool)
}

describe('config', () => {
  const defaults = { id: 'test', name: 'test', description: 'test', automatic: true }

  test('validates string trigger', () => {
    valid({ ...defaults, on: 'push' })
    valid({ ...defaults, on: 'pull_request' })

    invalid({ ...defaults, on: '' })
    invalid({ ...defaults, on: 'other' })

    applies({ ...defaults, on: 'push' }, 'push', 'one', true)
    applies({ ...defaults, on: 'pull_request' }, 'pull_request', 'one', true)

    applies({ ...defaults, on: 'push' }, 'pull_request', 'one', false)
    applies({ ...defaults, on: 'pull_request' }, 'push', 'one', false)
  })

  test('validates array trigger', () => {
    valid({ ...defaults, on: ['push'] })
    valid({ ...defaults, on: ['pull_request'] })
    valid({ ...defaults, on: ['push', 'pull_request'] })

    invalid({ ...defaults, on: [] })
    invalid({ ...defaults, on: ['other'] })
    invalid({ ...defaults, on: ['push', 'other'] })

    applies({ ...defaults, on: ['push'] }, 'push', 'one', true)
    applies({ ...defaults, on: ['pull_request'] }, 'pull_request', 'one', true)

    applies({ ...defaults, on: ['push'] }, 'pull_request', 'one', false)
    applies({ ...defaults, on: ['pull_request'] }, 'push', 'one', false)
  })

  test('validates object trigger', () => {
    valid({ ...defaults, on: { push: {} } })
    valid({ ...defaults, on: { pull_request: {} } })
    valid({ ...defaults, on: { push: {}, pull_request: {} } })

    valid({ ...defaults, on: { push: null } })
    valid({ ...defaults, on: { pull_request: null } })
    valid({ ...defaults, on: { push: null, pull_request: null } })

    invalid({ ...defaults, on: {} })
    invalid({ ...defaults, on: { other: {} } })
    invalid({ ...defaults, on: { push: {}, other: {} } })

    invalid({ ...defaults, on: undefined })
    invalid({ ...defaults, on: { other: undefined } })
    invalid({ ...defaults, on: { push: undefined, other: undefined } })

    applies({ ...defaults, on: { push: {} } }, 'push', 'one', true)
    applies({ ...defaults, on: { pull_request: {} } }, 'pull_request', 'one', true)

    applies({ ...defaults, on: { push: {} } }, 'pull_request', 'one', false)
    applies({ ...defaults, on: { pull_request: {} } }, 'push', 'one', false)

    applies({ ...defaults, on: { push: null } }, 'push', 'one', true)
    applies({ ...defaults, on: { pull_request: null } }, 'pull_request', 'one', true)

    applies({ ...defaults, on: { push: null } }, 'pull_request', 'one', false)
    applies({ ...defaults, on: { pull_request: null } }, 'push', 'one', false)
  })

  test('validates object trigger branches', () => {
    valid({ ...defaults, on: { push: { branches: ['one'] } } })
    valid({ ...defaults, on: { push: { branches: ['one', 'two'] } } })
    valid({ ...defaults, on: { pull_request: { branches: ['one'] } } })
    valid({ ...defaults, on: { pull_request: { branches: ['one', 'two'] } } })
    valid({ ...defaults, on: { push: { branches: ['one'] }, pull_request: { branches: ['two'] } } })

    invalid({ ...defaults, on: { push: { branches: [] } } })
    invalid({ ...defaults, on: { pull_request: { branches: [] } } })

    applies({ ...defaults, on: { push: { branches: ['one'] } } }, 'push', 'one', true)
    applies({ ...defaults, on: { push: { branches: ['one', 'two'] } } }, 'push', 'one', true)
    applies(
      { ...defaults, on: { pull_request: { branches: ['one'] } } },
      'pull_request',
      'one',
      true
    )
    applies(
      { ...defaults, on: { pull_request: { branches: ['one', 'two'] } } },
      'pull_request',
      'one',
      true
    )

    applies({ ...defaults, on: { push: { branches: ['one'] } } }, 'push', 'two', false)
    applies(
      { ...defaults, on: { pull_request: { branches: ['one'] } } },
      'pull_request',
      'two',
      false
    )
  })
})
