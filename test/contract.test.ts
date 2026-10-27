import { describe, expect, it } from 'vitest'

const hostedAuthUrl = process.env.TALRED_IDENTITY_CONTRACT_HOSTED_AUTH_URL
const hostedApplication = process.env.TALRED_IDENTITY_CONTRACT_HOSTED_APPLICATION ?? 'contract-app'

describe.skipIf(!hostedAuthUrl)('real Talred Identity hosted-auth contract', () => {
  it('serves the configured hosted application login entry point', async () => {
    const url = new URL('/auth/login', hostedAuthUrl)
    url.searchParams.set('application', hostedApplication)
    url.searchParams.set('state', 'a-contract-state-that-is-at-least-thirty-two-characters-long')
    const response = await fetch(url)

    expect(response.ok).toBe(true)
    expect((await response.text()).toLowerCase()).toContain('identity')
  })
})
