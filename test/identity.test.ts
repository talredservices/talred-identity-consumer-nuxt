import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const records = new Map<string, { data: Record<string, unknown>, update: ReturnType<typeof vi.fn>, clear: ReturnType<typeof vi.fn> }>()
  const fetch = vi.fn()
  return { records, fetch }
})

vi.mock('h3', () => ({
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
  useSession: (_event: unknown, options: { name: string }) => {
    let record = mocks.records.get(options.name)
    if (!record) {
      const data: Record<string, unknown> = {}
      record = {
        data,
        update: vi.fn(async (value: Record<string, unknown>) => Object.assign(data, value)),
        clear: vi.fn(async () => {
          for (const key of Object.keys(data)) delete data[key]
        }),
      }
      mocks.records.set(options.name, record)
    }
    return record
  },
}))

vi.mock('ofetch', () => ({ $fetch: mocks.fetch }))

import {
  beginIdentityAuthorization,
  beginIdentityAccountPortal,
  beginIdentityLogout,
  completeIdentityAuthorization,
  identityApplication,
  identityAccessToken,
  refreshIdentityAccessToken,
  logoutIdentityApplication,
  requireIdentityUser,
  safeLocalPath,
} from '../src/runtime/server/identity.js'

const response = {
  data: {
    access_token: 'access-token',
    access_token_expires_at: '2030-01-01T00:00:00Z',
    refresh_token: 'refresh-token',
    refresh_token_expires_at: '2030-01-02T00:00:00Z',
    identity: { user: { id: 'user-1', email: 'person@example.com', username: 'person', email_verified: true } },
  },
}

function configure(overrides: Record<string, unknown> = {}) {
  ;(globalThis as Record<string, unknown>).useRuntimeConfig = () => ({
    talredIdentity: {
      sessionSecret: 'a-unique-consumer-session-secret-with-32-chars',
      applications: {
        documentStudio: {
          identityApiUrl: 'https://identity-api.example.test',
          hostedAuthUrl: 'https://identity.example.test',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          hostedApplication: 'document-studio',
          callbackUrl: 'https://studio.example.test/api/identity/document-studio/auth/callback',
          defaultRedirect: '/documents',
          logoutRedirect: '/auth/login',
          sandboxApplication: 'documentStudioSandbox',
          features: { demoAccount: true },
          ...overrides,
        },
        documentStudioSandbox: {
          identityApiUrl: 'https://identity-api.example.test',
          hostedAuthUrl: 'https://identity.example.test',
          clientId: 'sandbox-client-id',
          clientSecret: 'sandbox-client-secret',
          hostedApplication: 'document-studio',
          callbackUrl: 'https://studio.example.test/api/identity/document-studio/auth/callback',
        },
        jobTracker: {
          identityApiUrl: 'https://identity-api.example.test',
          hostedAuthUrl: 'https://identity.example.test',
          clientId: 'job-client-id',
          clientSecret: 'job-client-secret',
          hostedApplication: 'job-tracker',
          callbackUrl: 'https://jobs.example.test/api/identity/job-tracker/auth/callback',
        },
      },
    },
  })
}

describe('Talred Identity consumer security boundary', () => {
  beforeEach(() => {
    mocks.records.clear()
    mocks.fetch.mockReset()
    configure()
  })

  it('rejects browser-normalized unsafe return paths', () => {
    for (const path of ['/\n/evil.test', '/%2fevil.test', '/%5cevil.test', '/ /evil.test']) expect(safeLocalPath(path, '/safe')).toBe('/safe')
  })

  it('supports app mode without a hosted URL and keeps navigation local', async () => {
    configure({ mode: 'app', hostedAuthUrl: undefined, pages: { login: '/auth/login', register: '/auth/register', forgotPassword: '/auth/forgot-password', resetPassword: '/auth/reset-password', verification: '/auth/verify', account: '/account' } })
    expect(identityApplication({} as never, 'document-studio').mode).toBe('app')
    expect(await beginIdentityAuthorization({} as never, 'document-studio', { intent: 'register', returnTo: '//evil.test' })).toBe('/auth/register?redirect=%2Fdocuments')
    expect(await beginIdentityAccountPortal({} as never, 'document-studio', 'security')).toBe('/account?tab=security')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects app mode with unsafe page destinations', () => {
    configure({ mode: 'app', pages: { login: '//evil.test' } })
    expect(() => identityApplication({} as never, 'document-studio')).toThrow('safe local')
  })

  it('does not authorize protected operations with a verification-pending session', async () => {
    const application = identityApplication({} as never, 'document-studio')
    await requireIdentityUser({} as never, 'document-studio').catch(() => undefined)
    const session = mocks.records.get(application.sessionCookie)!
    session.data.user = { id: 'user-1', verificationRequired: true }
    session.data.secure = { accessToken: 'secret', refreshToken: 'refresh', accessTokenExpiresAt: '2030-01-01' }
    await expect(requireIdentityUser({} as never, 'document-studio')).rejects.toMatchObject({ statusCode: 403 })
    await expect(identityAccessToken({} as never, 'document-studio')).rejects.toMatchObject({ statusCode: 403 })
    expect(await identityAccessToken({} as never, 'document-studio', true)).toBe('secret')
  })

  it('uses a distinct default cookie for each application', () => {
    const documentStudio = identityApplication({} as never, 'document-studio')
    const jobTracker = identityApplication({} as never, 'job-tracker')

    expect(documentStudio.sessionCookie).toBe('talred-identity-document-studio-session')
    expect(jobTracker.sessionCookie).toBe('talred-identity-job-tracker-session')
    expect(jobTracker.sessionCookie).not.toBe(documentStudio.sessionCookie)
  })

  it('fails closed when a confidential configuration value is absent', () => {
    configure({ clientSecret: '' })

    expect(() => identityApplication({} as never, 'document-studio')).toThrow('missing clientSecret')
  })

  it('rejects non-local HTTP identity endpoints in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    configure({ identityApiUrl: 'http://identity.example.test' })

    expect(() => identityApplication({} as never, 'document-studio')).toThrow('non-local URLs must use HTTPS')

    vi.unstubAllEnvs()
  })

  it('allows explicitly listed private HTTP identity hosts in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NUXT_TALRED_IDENTITY_PRIVATE_HTTP_HOSTS', ' identity-api, STARTER-IDENTITY-API ')
    configure({ identityApiUrl: 'http://starter-identity-api:8000' })

    expect(identityApplication({} as never, 'document-studio').identityApiUrl).toBe('http://starter-identity-api:8000')

    vi.unstubAllEnvs()
  })

  it('rejects external and backslash redirects', () => {
    expect(safeLocalPath('/documents?sort=updated', '/')).toBe('/documents?sort=updated')
    expect(safeLocalPath('//attacker.example', '/documents')).toBe('/documents')
    expect(safeLocalPath('/\\attacker.example', '/documents')).toBe('/documents')
    expect(safeLocalPath('https://attacker.example', '/documents')).toBe('/documents')
  })

  it('binds the host demo policy to an Identity-issued authorization intent', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })

    const destination = await beginIdentityAuthorization({} as never, 'document-studio')

    expect(new URL(destination).searchParams.get('intent')).toBe('authorization-intent')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/authorization/intent', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        client_id: 'client-id',
        hosted_application: 'document-studio',
        demo_account_enabled: true,
      }),
    }))
  })

  it('requires a sandbox application when the host enables demo accounts', () => {
    configure({ sandboxApplication: undefined, features: { demoAccount: true } })

    expect(() => identityApplication({} as never, 'document-studio'))
      .toThrow('sandboxApplication is required when the demo account feature is enabled')
  })

  it.each([
    [{ clientId: 'sandbox-client-id' }, 'sandbox client credentials must be distinct'],
    [{ clientSecret: 'sandbox-client-secret' }, 'sandbox client credentials must be distinct'],
    [{ hostedApplication: 'another-application' }, 'sandbox hostedApplication must match'],
    [{ callbackUrl: 'https://studio.example.test/another-callback' }, 'sandbox callbackUrl must exactly match'],
  ])('rejects an invalid demo sandbox configuration', async (overrides, message) => {
    configure(overrides)

    await expect(beginIdentityAuthorization({} as never, 'document-studio')).rejects.toThrow(message)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects a new sandbox callback when the host demo policy is disabled', async () => {
    configure({ features: { demoAccount: false } })
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const destination = await beginIdentityAuthorization({} as never, 'document-studio')

    await expect(completeIdentityAuthorization(
      {} as never,
      'document-studio',
      'handoff-code-that-is-long-enough',
      new URL(destination).searchParams.get('state')!,
      'sandbox',
    )).rejects.toThrow('Demo sandbox accounts are disabled')
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('exchanges a valid callback once and clears the state transaction', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const destination = await beginIdentityAuthorization({} as never, 'document-studio', { returnTo: '/documents/new' })
    const state = new URL(destination).searchParams.get('state')!
    mocks.fetch.mockResolvedValueOnce(response)

    await expect(completeIdentityAuthorization({} as never, 'document-studio', 'handoff-code-that-is-long-enough', state)).resolves.toBe('/documents/new')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/handoff/exchange', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({ client_id: 'client-id', client_secret: 'client-secret' }),
    }))
    expect(mocks.records.get('talred-identity-document-studio-session-transaction')?.clear).toHaveBeenCalledOnce()
    await expect(completeIdentityAuthorization({} as never, 'document-studio', 'handoff-code-that-is-long-enough', state)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('creates an Identity-issued account portal intent and redirects without exposing tokens', async () => {
    const app = identityApplication({} as never, 'document-studio')
    mocks.records.set(app.sessionCookie, {
      data: { secure: { accessToken: 'access-token', accessTokenExpiresAt: '2030-01-01T00:00:00Z', refreshToken: 'refresh-token', refreshTokenExpiresAt: '2030-01-02T00:00:00Z', connection: 'primary' } },
      update: vi.fn(), clear: vi.fn(),
    })
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'opaque-identity-issued-intent' } })

    const destination = await beginIdentityAccountPortal({} as never, 'document-studio', 'security')
    expect(destination).toBe('https://identity.example.test/account/authenticate?application=document-studio&intent=opaque-identity-issued-intent&tab=security')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/account/intent', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      body: expect.objectContaining({ client_id: 'client-id', hosted_application: 'document-studio' }),
    }))
  })

  it('exchanges and refreshes a sandbox handoff with the sandbox BFF client in the primary session', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const destination = await beginIdentityAuthorization({} as never, 'document-studio')
    const state = new URL(destination).searchParams.get('state')!
    mocks.fetch.mockResolvedValueOnce(response)

    await completeIdentityAuthorization({} as never, 'document-studio', 'sandbox-handoff-code-that-is-long-enough', state, 'sandbox')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/handoff/exchange', expect.objectContaining({
      body: expect.objectContaining({ client_id: 'sandbox-client-id', client_secret: 'sandbox-client-secret' }),
    }))
    const app = mocks.records.get('talred-identity-document-studio-session')!
    expect(app.data.secure).toMatchObject({ connection: 'sandbox' })
    ;(app.data.secure as { accessTokenExpiresAt: string }).accessTokenExpiresAt = '2000-01-01T00:00:00Z'
    mocks.fetch.mockResolvedValueOnce(response)

    await identityAccessToken({} as never, 'document-studio')
    expect(mocks.fetch).toHaveBeenLastCalledWith('/api/v1/identity/auth/refresh', expect.objectContaining({
      body: expect.objectContaining({ client_id: 'sandbox-client-id', client_secret: 'sandbox-client-secret' }),
    }))
  })

  it('rejects an expired callback transaction', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const destination = await beginIdentityAuthorization({} as never, 'document-studio')
    const transaction = mocks.records.get('talred-identity-document-studio-session-transaction')!
    transaction.data.createdAt = Date.now() - (10 * 60 * 1000) - 1

    await expect(completeIdentityAuthorization({} as never, 'document-studio', 'handoff-code-that-is-long-enough', new URL(destination).searchParams.get('state')!)).rejects.toMatchObject({ statusCode: 401 })
    expect(transaction.clear).toHaveBeenCalledOnce()
  })

  it('refreshes an expired token without exposing it to the browser session', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const session = await beginIdentityAuthorization({} as never, 'document-studio')
    mocks.fetch.mockResolvedValueOnce(response)
    await completeIdentityAuthorization({} as never, 'document-studio', 'handoff-code-that-is-long-enough', new URL(session).searchParams.get('state')!)
    const app = mocks.records.get('talred-identity-document-studio-session')!
    ;(app.data.secure as { accessTokenExpiresAt: string }).accessTokenExpiresAt = '2000-01-01T00:00:00Z'
    mocks.fetch.mockResolvedValueOnce(response)

    await expect(identityAccessToken({} as never, 'document-studio')).resolves.toBe('access-token')
    expect(app.data.user).toMatchObject({ email: 'person@example.com' })
    expect(app.data).not.toHaveProperty('accessToken')
  })

  it('reuses a valid access token without refreshing it', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const destination = await beginIdentityAuthorization({} as never, 'document-studio')
    mocks.fetch.mockResolvedValueOnce(response)
    await completeIdentityAuthorization({} as never, 'document-studio', 'handoff-code-that-is-long-enough', new URL(destination).searchParams.get('state')!)
    mocks.fetch.mockClear()

    await expect(identityAccessToken({} as never, 'document-studio')).resolves.toBe('access-token')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('can force a refresh after an upstream API rejects a valid token', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'authorization-intent' } })
    const destination = await beginIdentityAuthorization({} as never, 'document-studio')
    mocks.fetch.mockResolvedValueOnce(response)
    await completeIdentityAuthorization({} as never, 'document-studio', 'handoff-code-that-is-long-enough', new URL(destination).searchParams.get('state')!)
    mocks.fetch.mockClear()
    mocks.fetch.mockResolvedValueOnce(response)

    await expect(refreshIdentityAccessToken({} as never, 'document-studio')).resolves.toBe('access-token')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/refresh', expect.any(Object))
  })

  it('deduplicates concurrent refreshes for the same session token', async () => {
    const app = identityApplication({} as never, 'document-studio')
    mocks.records.set(app.sessionCookie, {
      data: { secure: { accessToken: 'expired-token', accessTokenExpiresAt: '2000-01-01T00:00:00Z', refreshToken: 'shared-refresh-token', refreshTokenExpiresAt: '2030-01-02T00:00:00Z', connection: 'primary' } },
      update: vi.fn(),
      clear: vi.fn(),
    })

    let resolveRefresh!: (value: typeof response) => void
    const refreshResponse = new Promise<typeof response>((resolve) => { resolveRefresh = resolve })
    mocks.fetch.mockReturnValue(refreshResponse)

    const firstRefresh = refreshIdentityAccessToken({} as never, 'document-studio')
    const secondRefresh = refreshIdentityAccessToken({} as never, 'document-studio')
    await Promise.resolve()
    expect(mocks.fetch).toHaveBeenCalledOnce()

    resolveRefresh(response)
    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual(['access-token', 'access-token'])
  })

  it('requires an authenticated session before exposing a user to a server route', async () => {
    await expect(requireIdentityUser({} as never, 'document-studio')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('clears the local session even when remote logout is unavailable', async () => {
    const app = identityApplication({} as never, 'document-studio')
    const session = mocks.records.get(app.sessionCookie) ?? { data: { secure: { accessToken: 'access-token' } }, update: vi.fn(), clear: vi.fn(async () => undefined) }
    mocks.records.set(app.sessionCookie, session)
    mocks.fetch.mockRejectedValueOnce(new Error('network unavailable'))

    await logoutIdentityApplication({} as never, 'document-studio')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/logout', expect.objectContaining({
      headers: { Authorization: 'Bearer access-token' },
    }))
    expect(session.clear).toHaveBeenCalledOnce()
  })

  it('creates a namespaced hosted logout handoff and clears the consumer session', async () => {
    const app = identityApplication({} as never, 'document-studio')
    const session = { data: { secure: { accessToken: 'access-token' } }, update: vi.fn(), clear: vi.fn(async () => undefined) }
    mocks.records.set(app.sessionCookie, session)
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'logout-intent' } }).mockResolvedValueOnce({})

    const destination = await beginIdentityLogout({} as never, 'document-studio', '/signed-out')

    expect(mocks.fetch).toHaveBeenNthCalledWith(1, '/api/v1/identity/auth/logout/intent', expect.objectContaining({
      body: expect.objectContaining({ hosted_application: 'document-studio', return_to: '/signed-out' }),
    }))
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, '/api/v1/identity/auth/logout', expect.any(Object))
    expect(new URL(destination).pathname).toBe('/auth/logout')
    expect(new URL(destination).searchParams.get('intent')).toBe('logout-intent')
    expect(session.clear).toHaveBeenCalledOnce()
  })

  it('uses the configured logout redirect when no explicit destination is supplied', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'logout-intent' } })

    await beginIdentityLogout({} as never, 'document-studio')

    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/logout/intent', expect.objectContaining({
      body: expect.objectContaining({ return_to: '/auth/login' }),
    }))
  })

  it('refreshes an expired access token before revoking its current family', async () => {
    const app = identityApplication({} as never, 'document-studio')
    const session = {
      data: {
        secure: {
          accessToken: 'expired-access-token',
          accessTokenExpiresAt: '2020-01-01T00:00:00Z',
          refreshToken: 'valid-refresh-token',
          refreshTokenExpiresAt: '2030-01-02T00:00:00Z',
          connection: 'primary',
        },
      },
      update: vi.fn(async (value: Record<string, unknown>) => Object.assign(session.data, value)),
      clear: vi.fn(async () => undefined),
    }
    mocks.records.set(app.sessionCookie, session as never)
    mocks.fetch.mockResolvedValueOnce(response).mockResolvedValueOnce({})

    await logoutIdentityApplication({} as never, 'document-studio')

    expect(mocks.fetch).toHaveBeenNthCalledWith(1, '/api/v1/identity/auth/refresh', expect.objectContaining({
      body: expect.objectContaining({ refresh_token: 'valid-refresh-token' }),
    }))
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, '/api/v1/identity/auth/logout', expect.objectContaining({
      headers: { Authorization: 'Bearer access-token' },
    }))
    expect(session.clear).toHaveBeenCalledOnce()
  })

  it('isolates logout handoffs by configured application', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'job-intent' } })
    const destination = await beginIdentityLogout({} as never, 'job-tracker', '/auth/login')

    expect(new URL(destination).searchParams.get('application')).toBe('job-tracker')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/identity/auth/logout/intent', expect.objectContaining({
      body: expect.objectContaining({ client_id: 'job-client-id', hosted_application: 'job-tracker' }),
    }))
    expect(mocks.records.get('talred-identity-document-studio-session')).toBeUndefined()
  })

  it('continues the hosted handoff when token revocation already occurred', async () => {
    const app = identityApplication({} as never, 'document-studio')
    const session = { data: { secure: { accessToken: 'already-revoked' } }, update: vi.fn(), clear: vi.fn(async () => undefined) }
    mocks.records.set(app.sessionCookie, session)
    mocks.fetch.mockResolvedValueOnce({ data: { intent: 'still-valid-intent' } })
      .mockRejectedValueOnce(Object.assign(new Error('revoked'), { status: 401 }))

    await expect(beginIdentityLogout({} as never, 'document-studio', '/signed-out'))
      .resolves.toContain('still-valid-intent')
    expect(session.clear).toHaveBeenCalledOnce()
  })
})
