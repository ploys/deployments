import { schema, Config, ConfigData, TriggerName } from '../src'

function valid(value: any) {
  expect(schema.validate(value).error).toBeUndefined()
}

function invalid(value: any) {
  expect(schema.validate(value).error).toBeDefined()
}

function matches(cfg: ConfigData, trigger: TriggerName, branch: string, bool: boolean) {
  expect(new Config(cfg).matches(trigger, branch)).toBe(bool)
}

describe('config', () => {
  const defaults = { id: 'test', name: 'test', description: 'test' }

  test('validates string trigger', () => {
    valid({ ...defaults, on: 'push' })
    valid({ ...defaults, on: 'pull_request' })
    valid({ ...defaults, on: 'manual' })

    invalid({ ...defaults, on: '' })
    invalid({ ...defaults, on: 'other' })

    matches({ ...defaults, on: 'push' }, 'push', 'one', true)
    matches({ ...defaults, on: 'pull_request' }, 'pull_request', 'one', true)
    matches({ ...defaults, on: 'manual' }, 'manual', 'one', true)

    matches({ ...defaults, on: 'push' }, 'pull_request', 'one', false)
    matches({ ...defaults, on: 'push' }, 'manual', 'one', false)
    matches({ ...defaults, on: 'pull_request' }, 'push', 'one', false)
    matches({ ...defaults, on: 'pull_request' }, 'manual', 'one', false)
    matches({ ...defaults, on: 'manual' }, 'push', 'one', false)
    matches({ ...defaults, on: 'manual' }, 'pull_request', 'one', false)
  })

  test('validates array trigger', () => {
    valid({ ...defaults, on: ['push'] })
    valid({ ...defaults, on: ['pull_request'] })
    valid({ ...defaults, on: ['manual'] })
    valid({ ...defaults, on: ['push', 'pull_request'] })
    valid({ ...defaults, on: ['push', 'pull_request', 'manual'] })

    invalid({ ...defaults, on: [] })
    invalid({ ...defaults, on: ['other'] })
    invalid({ ...defaults, on: ['push', 'other'] })

    matches({ ...defaults, on: ['push'] }, 'push', 'one', true)
    matches({ ...defaults, on: ['pull_request'] }, 'pull_request', 'one', true)
    matches({ ...defaults, on: ['manual'] }, 'manual', 'one', true)

    matches({ ...defaults, on: ['push'] }, 'pull_request', 'one', false)
    matches({ ...defaults, on: ['pull_request'] }, 'push', 'one', false)
    matches({ ...defaults, on: ['manual'] }, 'push', 'one', false)
  })

  test('validates object trigger', () => {
    valid({ ...defaults, on: { push: {} } })
    valid({ ...defaults, on: { pull_request: {} } })
    valid({ ...defaults, on: { push: {}, pull_request: {} } })

    valid({ ...defaults, on: { push: null } })
    valid({ ...defaults, on: { pull_request: null } })
    valid({ ...defaults, on: { manual: null } })
    valid({ ...defaults, on: { push: null, pull_request: null, manual: null } })

    invalid({ ...defaults, on: {} })
    invalid({ ...defaults, on: { other: {} } })
    invalid({ ...defaults, on: { push: {}, other: {} } })

    invalid({ ...defaults, on: undefined })
    invalid({ ...defaults, on: { other: undefined } })
    invalid({ ...defaults, on: { push: undefined, other: undefined } })

    matches({ ...defaults, on: { push: {} } }, 'push', 'one', true)
    matches({ ...defaults, on: { pull_request: {} } }, 'pull_request', 'one', true)
    matches({ ...defaults, on: { manual: {} } }, 'manual', 'one', true)

    matches({ ...defaults, on: { push: {} } }, 'pull_request', 'one', false)
    matches({ ...defaults, on: { pull_request: {} } }, 'push', 'one', false)
    matches({ ...defaults, on: { manual: {} } }, 'push', 'one', false)

    matches({ ...defaults, on: { push: null } }, 'push', 'one', true)
    matches({ ...defaults, on: { pull_request: null } }, 'pull_request', 'one', true)
    matches({ ...defaults, on: { manual: null } }, 'manual', 'one', true)

    matches({ ...defaults, on: { push: null } }, 'pull_request', 'one', false)
    matches({ ...defaults, on: { pull_request: null } }, 'push', 'one', false)
    matches({ ...defaults, on: { manual: null } }, 'push', 'one', false)
  })

  test('validates object trigger branches', () => {
    valid({ ...defaults, on: { push: { branches: ['one'] } } })
    valid({ ...defaults, on: { push: { branches: ['one', 'two'] } } })
    valid({ ...defaults, on: { pull_request: { branches: ['one'] } } })
    valid({ ...defaults, on: { pull_request: { branches: ['one', 'two'] } } })
    valid({ ...defaults, on: { manual: { branches: ['one'] } } })
    valid({ ...defaults, on: { manual: { branches: ['one', 'two'] } } })
    valid({
      ...defaults,
      on: {
        push: { branches: ['one'] },
        pull_request: { branches: ['two'] },
        manual: { branches: ['three'] },
      },
    })

    invalid({ ...defaults, on: { push: { branches: [] } } })
    invalid({ ...defaults, on: { pull_request: { branches: [] } } })
    invalid({ ...defaults, on: { manual: { branches: [] } } })

    matches({ ...defaults, on: { push: { branches: ['one'] } } }, 'push', 'one', true)
    matches({ ...defaults, on: { push: { branches: ['one', 'two'] } } }, 'push', 'one', true)
    matches(
      { ...defaults, on: { pull_request: { branches: ['one'] } } },
      'pull_request',
      'one',
      true
    )
    matches(
      { ...defaults, on: { pull_request: { branches: ['one', 'two'] } } },
      'pull_request',
      'one',
      true
    )
    matches({ ...defaults, on: { manual: { branches: ['one'] } } }, 'manual', 'one', true)
    matches({ ...defaults, on: { manual: { branches: ['one', 'two'] } } }, 'manual', 'one', true)

    matches({ ...defaults, on: { push: { branches: ['one'] } } }, 'push', 'two', false)
    matches(
      { ...defaults, on: { pull_request: { branches: ['one'] } } },
      'pull_request',
      'two',
      false
    )
    matches({ ...defaults, on: { manual: { branches: ['one'] } } }, 'manual', 'two', false)
  })

  test('validates url', () => {
    valid({ ...defaults, on: 'push' })
    valid({ ...defaults, on: 'push', url: 'http://example.com' })
    valid({ ...defaults, on: 'push', url: 'https://www.example.com' })
    valid({ ...defaults, on: 'push', url: 'https://www.example.com/path/to/something' })

    invalid({ ...defaults, on: 'push', url: '' })
    invalid({ ...defaults, on: 'push', url: 'example.com' })
    invalid({ ...defaults, on: 'push', url: 'www.example.com' })
    invalid({ ...defaults, on: 'push', url: 'www.example.com/path/to/something' })
    invalid({ ...defaults, on: 'push', url: '/path/to/something' })
  })
})
