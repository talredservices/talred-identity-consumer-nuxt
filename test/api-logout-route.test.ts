import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  beginIdentityLogout: vi.fn(),
  readBody: vi.fn(),
}))

vi.mock('h3', () => ({
  createError: vi.fn(),
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: vi.fn(() => 'document-studio'),
  readBody: mocks.readBody,
  setResponseHeader: vi.fn(),
}))

vi.mock('../src/runtime/server/csrf.js', () => ({ requireIdentityCsrf: vi.fn() }))

vi.mock('../src/runtime/server/identity.js', () => ({
  beginIdentityLogout: mocks.beginIdentityLogout,
  identityApplication: () => ({ mode: 'hosted' }),
}))

import handler from '../src/runtime/server/api/logout.post.js'

describe('generated logout route', () => {
  beforeEach(() => {
    mocks.beginIdentityLogout.mockReset()
    mocks.readBody.mockReset()
    mocks.beginIdentityLogout.mockResolvedValue('https://identity.example.test/auth/logout?intent=opaque')
  })

  it('accepts an empty POST body', async () => {
    mocks.readBody.mockResolvedValue(undefined)

    await expect(handler({} as never)).resolves.toEqual({
      redirectUrl: 'https://identity.example.test/auth/logout?intent=opaque',
    })
    expect(mocks.beginIdentityLogout).toHaveBeenCalledWith({}, 'document-studio', undefined)
  })
})
