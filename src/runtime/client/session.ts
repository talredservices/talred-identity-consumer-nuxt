import { useRequestFetch, useState } from 'nuxt/app'
import type { ZoltaIdentityUser } from '../../types.js'
import { identityConsumerRoute } from './routes.js'

type BrowserSession = { user: ZoltaIdentityUser | null }

/**
 * Opt-in browser session state. It deliberately exposes only the public user
 * profile; access and refresh tokens never leave server-side session storage.
 */
export function useZoltaIdentitySession(application: string) {
  const key = `zolta-identity-session:${application}`
  const session = useState<BrowserSession>(key, () => ({ user: null }))
  const pending = useState<boolean>(`${key}:pending`, () => false)
  const error = useState<unknown>(`${key}:error`, () => null)

  async function refresh(): Promise<BrowserSession> {
    pending.value = true
    error.value = null
    try {
      session.value = await useRequestFetch()<BrowserSession>(identityConsumerRoute(application, 'session'))
      return session.value
    } catch (caught) {
      error.value = caught
      throw caught
    } finally {
      pending.value = false
    }
  }

  async function logout(options: { headers?: HeadersInit, body?: { returnTo?: string } } = {}): Promise<{ redirectUrl: string }> {
    const result = await useRequestFetch()< { redirectUrl: string }>(identityConsumerRoute(application, 'logout'), {
      method: 'POST',
      headers: options.headers,
      body: options.body,
    })
    session.value = { user: null }
    return result
  }

  function authorize(returnTo?: string, intent: 'login' | 'register' | 'forgot-password' | 'reset-password' = 'login'): string {
    const query = new URLSearchParams()
    if (returnTo) query.set('returnTo', returnTo)
    if (intent !== 'login') query.set('intent', intent)
    const suffix = query.toString()
    return `${identityConsumerRoute(application, 'authorize')}${suffix ? `?${suffix}` : ''}`
  }

  return { session, pending, error, refresh, logout, sessionLogout: logout, authorize }
}
