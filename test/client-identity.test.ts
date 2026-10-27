import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  requestFetch: vi.fn(),
  runtimeConfig: { public: { talredIdentityConsumer: { routePrefix: '/api/identity', applications: {} as Record<string, { logoutRedirect?: string }> } } },
  states: new Map<string, { value: unknown }>(),
}))

vi.mock('nuxt/app', () => ({
  navigateTo: mocks.navigateTo,
  useRequestFetch: () => mocks.requestFetch,
  useRuntimeConfig: () => mocks.runtimeConfig,
  useState: (key: string, factory: () => unknown) => {
    if (!mocks.states.has(key)) mocks.states.set(key, { value: factory() })
    return mocks.states.get(key)
  },
}))

import {
  identityResponseStatus,
  resolveIdentityAuthIntent,
  resolveIdentityRedirect,
  useTalredIdentity,
} from '../src/runtime/client/identity.js'
import { identityAccountRoute } from '../src/runtime/client/routes.js'

describe('Talred Identity host helpers', () => {
  beforeEach(() => {
    mocks.navigateTo.mockReset()
    mocks.requestFetch.mockReset()
    mocks.runtimeConfig.public.talredIdentityConsumer.applications = {}
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

  it('clears client state and follows the hosted logout handoff', async () => {
    mocks.requestFetch.mockResolvedValueOnce({ redirectUrl: 'https://identity.example.test/auth/logout?intent=opaque' })
    const identity = useTalredIdentity('document-studio')
    identity.session.value = { user: { id: '1' } as never }

    await identity.logout('/signed-out')

    expect(identity.user.value).toBeNull()
    expect(mocks.requestFetch).toHaveBeenCalledWith('/api/identity/document-studio/auth/logout', expect.objectContaining({
      method: 'POST',
      body: { returnTo: '/signed-out' },
    }))
    expect(mocks.navigateTo).toHaveBeenCalledWith('https://identity.example.test/auth/logout?intent=opaque', { external: true })
  })

  it('redirects to the signed-out destination when the handoff service fails', async () => {
    mocks.requestFetch.mockRejectedValueOnce(new Error('Identity unavailable'))
    const identity = useTalredIdentity('document-studio')
    identity.session.value = { user: { id: '1' } as never }

    await identity.logout('/auth/login')

    expect(identity.user.value).toBeNull()
    expect(mocks.navigateTo).toHaveBeenCalledWith('/auth/login')
  })

  it('uses the configured logout destination when the caller does not override it', async () => {
    mocks.requestFetch.mockRejectedValueOnce(new Error('Identity unavailable'))
    const identity = useTalredIdentity('job-tracker', { logoutRedirect: '/fr/auth/login' })

    await identity.logout()

    expect(mocks.requestFetch).toHaveBeenCalledWith('/api/identity/job-tracker/auth/logout', expect.objectContaining({
      body: { returnTo: '/fr/auth/login' },
    }))
    expect(mocks.navigateTo).toHaveBeenCalledWith('/fr/auth/login')
  })

  it('uses the public per-application logout destination as its default', async () => {
    mocks.runtimeConfig.public.talredIdentityConsumer.applications = {
      jobTracker: { logoutRedirect: '/fr/jobs' },
    }
    mocks.requestFetch.mockRejectedValueOnce(new Error('Identity unavailable'))
    const identity = useTalredIdentity('job-tracker')

    await identity.logout()

    expect(mocks.requestFetch).toHaveBeenCalledWith('/api/identity/job-tracker/auth/logout', expect.objectContaining({
      body: { returnTo: '/fr/jobs' },
    }))
    expect(mocks.navigateTo).toHaveBeenCalledWith('/fr/jobs')
  })
})
