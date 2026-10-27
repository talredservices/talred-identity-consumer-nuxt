import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), store: vi.fn(), update: vi.fn(), clear: vi.fn(), data: {} as Record<string, unknown> }))
vi.mock('ofetch', () => ({ $fetch: mocks.fetch }))
vi.mock('h3', () => ({
  createError: (input: Record<string, unknown>) => Object.assign(new Error(String(input.statusMessage)), input),
  getHeader: (event: { headers: Record<string, string> }, name: string) => event.headers[name],
  getRequestURL: () => new URL('https://tasks.example.test/api/identity/projects/operations/login'),
}))
vi.mock('../src/runtime/server/identity.js', () => ({
  identityApplication: () => ({ mode: 'app', callbackUrl: 'https://tasks.example.test/api/identity/projects/auth/callback', identityApiUrl: 'https://identity.example.test', clientId: 'trusted-client', clientSecret: 'trusted-secret', hostedApplication: 'tasks-demo', defaultRedirect: '/projects/dashboard' }),
  applicationSession: async () => ({ data: mocks.data, update: mocks.update, clear: mocks.clear }),
  identityAccessToken: async () => 'private-token',
  safeLocalPath: (value: string, fallback: string) => value?.startsWith('/') && !value.startsWith('//') ? value : fallback,
  storeLogin: mocks.store,
  beginIdentityGoogle: vi.fn(),
}))
import { executeIdentityAppOperation, requireIdentityCsrf } from '../src/runtime/server/app-operations.js'
const event = () => ({ headers: { origin: 'https://tasks.example.test', 'x-talred-identity': '1', 'content-type': 'application/json' } }) as never

describe('app authentication BFF boundary', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.data = {} })
  it('rejects cross-origin and form-encoded mutations', () => {
    expect(() => requireIdentityCsrf({ headers: { origin: 'https://evil.test' } } as never, 'https://tasks.example.test/callback')).toThrow('origin')
    expect(() => requireIdentityCsrf({ headers: { origin: 'https://tasks.example.test', 'content-type': 'application/x-www-form-urlencoded' } } as never, 'https://tasks.example.test/callback')).toThrow('origin')
  })
  it('never accepts browser credentials or returns login tokens', async () => {
    mocks.fetch.mockResolvedValue({ data: { access_token: 'secret', refresh_token: 'secret-refresh' } })
    mocks.store.mockImplementation(async () => { mocks.data.user = { id: 'user' } })
    const result = await executeIdentityAppOperation(event(), 'projects', 'login', { email: 'user@example.test', password: 'password', client_secret: 'forged', client_id: 'forged', returnTo: '//evil.test' })
    expect(mocks.fetch.mock.calls[0]![1].body).toEqual({ email: 'user@example.test', password: 'password', client_id: 'trusted-client', client_secret: 'trusted-secret', application_key: 'tasks-demo' })
    expect(result).toEqual({ status: 'authenticated', user: { id: 'user' }, redirect: '/projects/dashboard' })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
  it('does not relay development recovery tokens', async () => {
    mocks.fetch.mockResolvedValue({ data: { development_token: 'private-reset-token' } })
    expect(await executeIdentityAppOperation(event(), 'projects', 'recovery', { email: 'user@example.test' })).toEqual({ status: 'completed' })
  })
  it('stores step-up grants server-side and consumes them for the requested mutation', async () => {
    mocks.fetch.mockResolvedValueOnce({ data: { grant: 'private-grant', operation: 'password', expires_at: '2030-01-01' } })
    mocks.update.mockImplementation(async value => Object.assign(mocks.data, value))
    expect(await executeIdentityAppOperation(event(), 'projects', 'reauthenticate', { password: 'password', sensitive_operation: 'password' })).toEqual({ status: 'completed' })
    mocks.fetch.mockResolvedValueOnce({ data: {} })
    expect(await executeIdentityAppOperation(event(), 'projects', 'password', { password: 'new-password', password_confirmation: 'new-password' })).toEqual({ status: 'completed' })
    expect(mocks.fetch.mock.calls[1]![1].headers['X-Identity-Reauthentication']).toBe('private-grant')
    expect(mocks.data.reauthentication).toBeUndefined()
  })
  it('requires a grant before calling a sensitive upstream operation', async () => {
    expect(await executeIdentityAppOperation(event(), 'projects', 'delete')).toEqual({ status: 'reauthentication_required' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
