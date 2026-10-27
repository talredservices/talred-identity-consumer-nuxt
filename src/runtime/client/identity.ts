import { navigateTo, useRequestFetch, useRuntimeConfig, useState } from 'nuxt/app'
import { $fetch } from 'ofetch'
import { computed } from 'vue'
import { useTalredIdentitySession } from './session.js'
import { identityAccountRoute } from './routes.js'

export type TalredIdentityIntent = 'login' | 'register' | 'forgot-password' | 'reset-password'
export type TalredIdentityAccountSection = 'profile' | 'password' | 'sessions' | 'privacy' | 'security'

export type TalredIdentityClientOptions = {
  defaultRedirect?: string
  loginPath?: string
  logoutRedirect?: string
  logoutHeaders?: () => HeadersInit | undefined
}

export function resolveIdentityRedirect(
  value: string | string[] | null | undefined,
  fallback = '/',
): string {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || Array.from(candidate).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) || /^\/(?:%2f|%5c)/i.test(candidate)) return fallback
  return candidate
}

const actionIntents = {
  login: 'login',
  signup: 'register',
  register: 'register',
  'forgot-password': 'forgot-password',
  'reset-password': 'reset-password',
} as const

export function resolveIdentityAuthIntent(action: string): TalredIdentityIntent | null {
  return actionIntents[action as keyof typeof actionIntents] ?? null
}

export function identityResponseStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
    data?: { statusCode?: unknown }
  }
  return [candidate.status, candidate.statusCode, candidate.response?.status, candidate.data?.statusCode]
    .find((value): value is number => typeof value === 'number')
}

export function useTalredIdentity(application: string, options: TalredIdentityClientOptions = {}) {
  const session = useTalredIdentitySession(application)
  const runtimeConfig = useRuntimeConfig()
  const applicationConfigKey = application.replace(/[-_ ]+([a-z0-9])/gi, (_match, letter: string) => letter.toUpperCase())
  const configuredApplications = (runtimeConfig.public?.talredIdentityConsumer as { applications?: Record<string, { logoutRedirect?: string }> } | undefined)?.applications
  const configuredLogoutRedirect = options.logoutRedirect
    ?? configuredApplications?.[application]?.logoutRedirect
    ?? configuredApplications?.[applicationConfigKey]?.logoutRedirect
    ?? '/'
  const defaultLogoutRedirect = resolveIdentityRedirect(configuredLogoutRedirect, '/')
  const ready = useState<boolean>(`talred-identity-session:${application}:ready`, () => false)
  const user = computed(() => session.session.value.user)
  const loggedIn = computed(() => Boolean(user.value))

  async function refresh() {
    try {
      return await session.refresh()
    } finally {
      ready.value = true
    }
  }

  async function logout(returnTo?: string | string[] | null): Promise<void> {
    const destination = resolveIdentityRedirect(returnTo, defaultLogoutRedirect)
    try {
      const response = await session.logout({
        headers: options.logoutHeaders?.(),
        body: { returnTo: destination },
      })
      await navigateTo(response.redirectUrl, { external: true })
    } catch {
      // The host session and browser state must not remain visually authenticated
      // when the Identity handoff service is unavailable.
      await navigateTo(destination)
    } finally {
      session.session.value = { user: null }
      ready.value = true
    }
  }

  async function login(returnTo?: string | string[] | null, intent: TalredIdentityIntent = 'login') {
    const destination = resolveIdentityRedirect(returnTo, options.defaultRedirect ?? '/')
    if (options.loginPath) {
      return await navigateTo({ path: options.loginPath, query: { redirect: destination } })
    }
    return await navigateTo(session.authorize(destination, intent), { external: true })
  }

  function accountPortalUrl(section: TalredIdentityAccountSection = 'profile'): string {
    const tab = section === 'password' || section === 'security' ? 'security' : 'profile'
    return `${identityAccountRoute(application, 'authorize')}?tab=${tab}`
  }

  async function openAccountPortal(section: TalredIdentityAccountSection = 'profile') {
    return await navigateTo(accountPortalUrl(section), { external: true })
  }

  return {
    ...session,
    user,
    loggedIn,
    ready,
    refresh,
    login,
    logout,
    accountPortalUrl,
    openAccountPortal,
  }
}

export function useTalredIdentityUnauthorizedHandler(application: string, options: TalredIdentityClientOptions = {}) {
  const identity = useTalredIdentity(application, options)
  const redirecting = useState<boolean>(`talred-identity-session:${application}:redirecting`, () => false)

  async function handle(error: unknown): Promise<boolean> {
    if (identityResponseStatus(error) !== 401 || import.meta.server || redirecting.value) return false
    redirecting.value = true
    try {
      await identity.sessionLogout({ headers: options.logoutHeaders?.() })
    } finally {
      await identity.login(options.defaultRedirect)
      redirecting.value = false
    }
    return true
  }

  return { isUnauthorized: (error: unknown) => identityResponseStatus(error) === 401, handle }
}

export function useTalredIdentityFetch(application: string, options: TalredIdentityClientOptions = {}) {
  const unauthorized = useTalredIdentityUnauthorizedHandler(application, options)
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch

  return async function identityFetch<T>(request: string, fetchOptions?: Parameters<typeof $fetch>[1]): Promise<T> {
    try {
      return await requestFetch<T>(request, fetchOptions)
    } catch (error) {
      await unauthorized.handle(error)
      throw error
    }
  }
}
