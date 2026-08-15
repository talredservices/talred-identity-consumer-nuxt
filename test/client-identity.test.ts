import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  states: new Map<string, { value: unknown }>(),
}))

vi.mock('nuxt/app', () => ({
  navigateTo: mocks.navigateTo,
  useRequestFetch: () => vi.fn(),
  useRuntimeConfig: () => ({ public: { zoltaIdentityConsumer: { routePrefix: '/api/identity' } } }),
  useState: (key: string, factory: () => unknown) => {
    if (!mocks.states.has(key)) mocks.states.set(key, { value: factory() })
    return mocks.states.get(key)
  },
}))

import {
  identityResponseStatus,
  resolveIdentityAuthIntent,
  resolveIdentityRedirect,
} from '../src/runtime/client/identity.js'
import { identityAccountRoute } from '../src/runtime/client/routes.js'

describe('Zolta Identity host helpers', () => {
  beforeEach(() => {
    mocks.navigateTo.mockReset()
    mocks.states.clear()
  })

  it('accepts local redirects and rejects unsafe destinations', () => {
    expect(resolveIdentityRedirect('/documents?sort=updated', '/')).toBe('/documents?sort=updated')
    expect(resolveIdentityRedirect('https://attacker.example', '/dashboard')).toBe('/dashboard')
    expect(resolveIdentityRedirect('//attacker.example', '/dashboard')).toBe('/dashboard')
    expect(resolveIdentityRedirect('/\\attacker.example', '/dashboard')).toBe('/dashboard')
  })

  it('maps host route actions to supported hosted intents', () => {
    expect(resolveIdentityAuthIntent('login')).toBe('login')
    expect(resolveIdentityAuthIntent('signup')).toBe('register')
    expect(resolveIdentityAuthIntent('unknown')).toBeNull()
  })

  it('normalizes common unauthorized error shapes', () => {
    expect(identityResponseStatus({ response: { status: 401 } })).toBe(401)
    expect(identityResponseStatus({ data: { statusCode: 403 } })).toBe(403)
    expect(identityResponseStatus(new Error('network'))).toBeUndefined()
  })

  it('builds application-scoped account routes', () => {
    expect(identityAccountRoute('document studio', 'authorize'))
      .toBe('/api/identity/document%20studio/account/authorize')
  })
})
