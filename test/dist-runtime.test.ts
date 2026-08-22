import { describe, expect, it } from 'vitest'
import * as runtime from '../dist/runtime/index.mjs'

describe('published runtime build', () => {
  it('ships the server adapters used by linked consumers', () => {
    expect(runtime.createIdentityApiClient).toBeTypeOf('function')
    expect(runtime.logoutIdentityApplication).toBeTypeOf('function')
    expect(runtime.refreshIdentityAccessToken).toBeTypeOf('function')
  })
})
