import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  identityApplication: vi.fn(),
  logoutIdentityApplication: vi.fn(),
  sendRedirect: vi.fn(),
  setResponseHeader: vi.fn(),
}))

vi.mock('h3', () => ({
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
  defineEventHandler: (handler: (event: unknown) => unknown) => handler,
  getRouterParam: mocks.getRouterParam,
  sendRedirect: mocks.sendRedirect,
  setResponseHeader: mocks.setResponseHeader,
}))

vi.mock('../src/runtime/server/identity.js', () => ({
  identityApplication: mocks.identityApplication,
  logoutIdentityApplication: mocks.logoutIdentityApplication,
}))

import handler from '../src/runtime/server/api/account-logout.get.js'

describe('hosted account logout route', () => {
  beforeEach(() => {
    mocks.getRouterParam.mockReset().mockReturnValue('document-studio')
    mocks.identityApplication.mockReset().mockReturnValue({ mode: 'hosted', logoutRedirect: '/fr/' })
    mocks.logoutIdentityApplication.mockReset().mockResolvedValue(undefined)
    mocks.sendRedirect.mockReset().mockImplementation((_event, path, status) => ({ path, status }))
    mocks.setResponseHeader.mockReset()
  })

  it('clears the BFF session and returns to the configured local app destination', async () => {
    const event = {}

    await expect(handler(event as never)).resolves.toEqual({ path: '/fr/', status: 302 })
    expect(mocks.identityApplication).toHaveBeenCalledWith(event, 'document-studio')
    expect(mocks.logoutIdentityApplication).toHaveBeenCalledWith(event, 'document-studio')
    expect(mocks.sendRedirect).toHaveBeenCalledWith(event, '/fr/', 302)
  })

  it('does not use the hosted adapter for app mode', async () => {
    mocks.identityApplication.mockReturnValue({ mode: 'app', logoutRedirect: '/' })

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 405 })
    expect(mocks.logoutIdentityApplication).not.toHaveBeenCalled()
    expect(mocks.sendRedirect).not.toHaveBeenCalled()
  })

  it('rejects a missing application key', async () => {
    mocks.getRouterParam.mockReturnValue(undefined)

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.identityApplication).not.toHaveBeenCalled()
  })
})
