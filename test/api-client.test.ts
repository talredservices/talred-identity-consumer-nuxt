import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  accessToken: vi.fn(),
  optionalAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  user: vi.fn(),
  logout: vi.fn(),
  firstClient: vi.fn(),
  retryClient: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@talred/api-client', () => {
  class TalredApiError extends Error {
    isUnauthorized = true

    constructor(statusCode: number, envelope: { message: string }) {
      super(envelope.message || String(statusCode))
    }
  }
  return {
    TalredApiError,
    createTalredApiClient: mocks.createClient,
  }
})

vi.mock('../src/runtime/server/identity.js', () => ({
  useServerIdentity: () => ({
    accessToken: mocks.accessToken,
    optionalAccessToken: mocks.optionalAccessToken,
    refreshAccessToken: mocks.refreshAccessToken,
    user: mocks.user,
    logout: mocks.logout,
  }),
}))

import { TalredApiError } from '@talred/api-client'
import { createIdentityApiClient } from '../src/runtime/server/api-client.js'

const unauthorizedError = () => new TalredApiError(401, {
  success: false,
  message: 'Unauthenticated.',
  data: {},
  errors: { public: { code: 'auth.unauthenticated' } },
  debug: [],
})

describe('createIdentityApiClient', () => {
  beforeEach(() => {
    mocks.accessToken.mockResolvedValue('initial-token')
    mocks.optionalAccessToken.mockResolvedValue(undefined)
    mocks.refreshAccessToken.mockResolvedValue('refreshed-token')
    mocks.user.mockResolvedValue({ id: 'user-1' })
    mocks.logout.mockResolvedValue(undefined)
    mocks.firstClient.mockReset()
    mocks.retryClient.mockReset()
    mocks.createClient.mockReset()
    mocks.createClient.mockReturnValueOnce(mocks.firstClient).mockReturnValueOnce(mocks.retryClient)
  })

  it('forces one refresh and retries an unauthorized upstream request', async () => {
    mocks.firstClient.mockRejectedValueOnce(unauthorizedError())
    mocks.retryClient.mockResolvedValueOnce({ data: { ok: true } })
    const client = await createIdentityApiClient({} as never, 'document-studio', {
      baseURL: 'https://api.example.test',
      requireAuthentication: true,
    })

    await expect(client('/documents')).resolves.toEqual({ data: { ok: true } })
    expect(mocks.refreshAccessToken).toHaveBeenCalledOnce()
    expect(mocks.createClient).toHaveBeenLastCalledWith(expect.objectContaining({ bearerToken: 'refreshed-token' }))
    expect(mocks.retryClient).toHaveBeenCalledOnce()
  })

  it('requires authentication by default', async () => {
    mocks.firstClient.mockResolvedValueOnce({ data: { ok: true } })
    const client = await createIdentityApiClient({} as never, 'document-studio', {
      baseURL: 'https://api.example.test',
    })

    await client('/documents')
    expect(mocks.accessToken).toHaveBeenCalledOnce()
    expect(mocks.optionalAccessToken).not.toHaveBeenCalled()
  })

  it('clears the Identity session when token refresh fails', async () => {
    mocks.firstClient.mockRejectedValueOnce(unauthorizedError())
    mocks.refreshAccessToken.mockRejectedValueOnce(new Error('refresh failed'))
    const client = await createIdentityApiClient({} as never, 'document-studio', {
      baseURL: 'https://api.example.test',
    })

    await expect(client('/documents')).rejects.toThrow('refresh failed')
    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.retryClient).not.toHaveBeenCalled()
  })
})
