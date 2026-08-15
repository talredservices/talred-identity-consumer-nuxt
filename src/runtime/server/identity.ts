import { randomBytes } from 'node:crypto'
import { createError, type H3Event, useSession } from 'h3'
import { $fetch } from 'ofetch'
import { useRuntimeConfig } from 'nitropack/runtime/config'
import type { ZoltaIdentityApplication, ZoltaIdentityRuntimeConfig, ZoltaIdentityUser } from '../../types.js'

type IdentityLoginData = {
  access_token: string
  access_token_expires_at: string
  refresh_token: string
  refresh_token_expires_at: string
  identity: {
    user: {
      id: string
      email: string
      username: string
      email_verified: boolean
      is_temporary?: boolean
      temporary_expires_at?: string | null
    }
  }
}

type ConsumerSession = {
  user?: ZoltaIdentityUser
  secure?: {
    accessToken: string
    accessTokenExpiresAt: string
    refreshToken: string
    refreshTokenExpiresAt: string
    connection: 'primary' | 'sandbox'
  }
}

type AuthorizationTransaction = {
  state?: string
  returnTo?: string
  createdAt?: number
}

const sessionMaxAge = 60 * 60 * 24 * 7
const stateTtlMilliseconds = 10 * 60 * 1000

function configurationKey(name: string): string {
  return name.replace(/-([a-z0-9])/gi, (_, character: string) => character.toUpperCase())
}

function safeLocalPath(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

function failConfiguration(name: string, reason: string): never {
  throw createError({ statusCode: 503, statusMessage: `Identity application [${name}] is not configured: ${reason}.` })
}

function validUrl(value: string, name: string, production: boolean): string {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) failConfiguration(name, 'URL must use HTTP or HTTPS')
    if (production && url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      failConfiguration(name, 'non-local URLs must use HTTPS in production')
    }
    return url.toString().replace(/\/$/, '')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    failConfiguration(name, 'contains an invalid URL')
  }
}

function cookieName(name: string, configured?: string): string {
  const value = configured || `zolta-identity-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-session`
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/.test(value)) failConfiguration(name, 'sessionCookie is invalid')
  return value
}

export function identityApplication(event: H3Event, name: string): Required<ZoltaIdentityApplication> {
  const runtime = (useRuntimeConfig(event).zoltaIdentity ?? {}) as Partial<ZoltaIdentityRuntimeConfig>
  const applications = runtime.applications ?? {}
  const application = applications[name] ?? applications[configurationKey(name)]
  if (!application) failConfiguration(name, 'application is missing')

  const required = ['identityApiUrl', 'hostedAuthUrl', 'clientId', 'clientSecret', 'hostedApplication', 'callbackUrl'] as const
  const missing = required.filter(key => !String(application[key] ?? '').trim())
  if (missing.length > 0) failConfiguration(name, `missing ${missing.join(', ')}`)
  if (String(runtime.sessionSecret ?? '').length < 32) failConfiguration(name, 'zoltaIdentity.sessionSecret must be at least 32 characters')

  const production = process.env.NODE_ENV === 'production'
  const callbackUrl = validUrl(String(application.callbackUrl), name, production)
  return {
    identityApiUrl: validUrl(String(application.identityApiUrl), name, production),
    hostedAuthUrl: validUrl(String(application.hostedAuthUrl), name, production),
    clientId: String(application.clientId),
    clientSecret: String(application.clientSecret),
    hostedApplication: String(application.hostedApplication),
    callbackUrl,
    sessionCookie: cookieName(name, application.sessionCookie),
    defaultRedirect: safeLocalPath(application.defaultRedirect, '/'),
    sandboxApplication: application.sandboxApplication ? String(application.sandboxApplication) : '',
  }
}

function tokenApplication(event: H3Event, application: Required<ZoltaIdentityApplication>, connection: 'primary' | 'sandbox'): Required<ZoltaIdentityApplication> {
  if (connection === 'primary') return application
  if (!application.sandboxApplication) failConfiguration(application.hostedApplication, 'sandboxApplication is required for a sandbox handoff')
  return identityApplication(event, application.sandboxApplication)
}

function sessionPassword(event: H3Event, name: string): string {
  const password = String((useRuntimeConfig(event).zoltaIdentity as Partial<ZoltaIdentityRuntimeConfig> | undefined)?.sessionSecret ?? '')
  if (password.length < 32) failConfiguration(name, 'zoltaIdentity.sessionSecret must be at least 32 characters')
  return password
}

async function applicationSession(event: H3Event, name: string, application: Required<ZoltaIdentityApplication>) {
  return useSession<ConsumerSession>(event, {
    password: sessionPassword(event, name),
    name: application.sessionCookie,
    maxAge: sessionMaxAge,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
  })
}

async function transactionSession(event: H3Event, name: string, application: Required<ZoltaIdentityApplication>) {
  return useSession<AuthorizationTransaction>(event, {
    password: sessionPassword(event, name),
    name: `${application.sessionCookie}-transaction`,
    maxAge: stateTtlMilliseconds / 1000,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
  })
}

function user(data: IdentityLoginData): ZoltaIdentityUser {
  return {
    id: data.identity.user.id,
    email: data.identity.user.email,
    name: data.identity.user.username,
    username: data.identity.user.username,
    emailVerified: data.identity.user.email_verified,
    isTemporary: data.identity.user.is_temporary,
    expiresAt: data.identity.user.temporary_expires_at,
  }
}

async function storeLogin(event: H3Event, name: string, application: Required<ZoltaIdentityApplication>, data: IdentityLoginData, connection: 'primary' | 'sandbox'): Promise<void> {
  await (await applicationSession(event, name, application)).update({
    user: user(data),
    secure: {
      accessToken: data.access_token,
      accessTokenExpiresAt: data.access_token_expires_at,
      refreshToken: data.refresh_token,
      refreshTokenExpiresAt: data.refresh_token_expires_at,
      connection,
    },
  })
}

export async function beginIdentityAuthorization(
  event: H3Event,
  name: string,
  options: { returnTo?: string, intent?: 'login' | 'register' | 'forgot-password' | 'reset-password', email?: string, token?: string } = {},
): Promise<string> {
  const application = identityApplication(event, name)
  const state = randomBytes(32).toString('base64url')
  await (await transactionSession(event, name, application)).update({
    state,
    returnTo: safeLocalPath(options.returnTo, application.defaultRedirect),
    createdAt: Date.now(),
  })
  const destination = new URL(`/auth/${options.intent ?? 'login'}`, `${application.hostedAuthUrl}/`)
  destination.searchParams.set('application', application.hostedApplication)
  destination.searchParams.set('state', state)
  if (options.email) destination.searchParams.set('email', options.email)
  if (options.token) destination.searchParams.set('token', options.token)
  return destination.toString()
}

/** Starts a short-lived, host-authorized entry to the hosted account portal. */
export async function beginIdentityAccountPortal(
  event: H3Event,
  name: string,
  tab: 'profile' | 'security' = 'profile',
): Promise<string> {
  const application = identityApplication(event, name)
  const accessToken = await identityAccessToken(event, name)
  const response = await $fetch<{ data: { intent: string } }>('/api/v1/identity/auth/account/intent', {
    baseURL: application.identityApiUrl,
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    body: { client_id: application.clientId, client_secret: application.clientSecret, hosted_application: application.hostedApplication },
  })
  const destination = new URL('/account/authenticate', `${application.hostedAuthUrl}/`)
  destination.searchParams.set('application', application.hostedApplication)
  destination.searchParams.set('intent', response.data.intent)
  destination.searchParams.set('tab', tab)
  return destination.toString()
}

export async function completeIdentityAuthorization(event: H3Event, name: string, code: string, state: string, connection: 'primary' | 'sandbox' = 'primary'): Promise<string> {
  const application = identityApplication(event, name)
  const transaction = await transactionSession(event, name, application)
  const data = transaction.data
  const valid = typeof data.createdAt === 'number'
    && Date.now() - data.createdAt >= 0
    && Date.now() - data.createdAt <= stateTtlMilliseconds
    && data.state === state
  if (!valid) {
    await transaction.clear()
    throw createError({ statusCode: 401, statusMessage: 'The hosted authentication state is invalid or expired.' })
  }

  try {
    const client = tokenApplication(event, application, connection)
    const response = await $fetch<{ data: IdentityLoginData }>('/api/v1/identity/auth/handoff/exchange', {
      baseURL: client.identityApiUrl,
      method: 'POST',
      body: { client_id: client.clientId, client_secret: client.clientSecret, code, redirect_uri: client.callbackUrl },
    })
    await storeLogin(event, name, application, response.data, connection)
    return safeLocalPath(data.returnTo, application.defaultRedirect)
  } finally {
    await transaction.clear()
  }
}

export async function identityAccessToken(event: H3Event, name: string): Promise<string> {
  const application = identityApplication(event, name)
  const current = await applicationSession(event, name, application)
  const secure = current.data.secure
  if (!secure?.accessToken || !secure.refreshToken) {
    throw createError({ statusCode: 401, statusMessage: 'An Identity session is required.' })
  }
  const client = tokenApplication(event, application, secure.connection ?? 'primary')
  const expiresAt = Date.parse(secure.accessTokenExpiresAt)
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) return secure.accessToken

  const response = await $fetch<{ data: IdentityLoginData }>('/api/v1/identity/auth/refresh', {
    baseURL: client.identityApiUrl,
    method: 'POST',
    body: { client_id: client.clientId, client_secret: client.clientSecret, refresh_token: secure.refreshToken },
  })
  await storeLogin(event, name, application, response.data, secure.connection ?? 'primary')
  return response.data.access_token
}

export async function identityBrowserSession(event: H3Event, name: string): Promise<ZoltaIdentityUser | null> {
  const application = identityApplication(event, name)
  return (await applicationSession(event, name, application)).data.user ?? null
}

export async function requireIdentityUser(event: H3Event, name: string): Promise<ZoltaIdentityUser> {
  const currentUser = await identityBrowserSession(event, name)
  if (!currentUser) throw createError({ statusCode: 401, statusMessage: 'An Identity session is required.' })
  return currentUser
}

export async function logoutIdentityApplication(event: H3Event, name: string): Promise<void> {
  const application = identityApplication(event, name)
  const current = await applicationSession(event, name, application)
  const accessToken = current.data.secure?.accessToken
  if (accessToken) {
    const client = tokenApplication(event, application, current.data.secure?.connection ?? 'primary')
    await $fetch('/api/v1/identity/auth/logout', {
      baseURL: client.identityApiUrl,
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined)
  }
  await current.clear()
}

/** Application-bound server facade for hosts that should not repeat consumer names. */
export function useServerIdentity(event: H3Event, name: string) {
  return {
    user: () => identityBrowserSession(event, name),
    requireUser: () => requireIdentityUser(event, name),
    accessToken: () => identityAccessToken(event, name),
    async optionalAccessToken(): Promise<string | undefined> {
      if (!await identityBrowserSession(event, name)) return undefined
      return await identityAccessToken(event, name)
    },
    authorize: (options?: Parameters<typeof beginIdentityAuthorization>[2]) => beginIdentityAuthorization(event, name, options),
    accountPortal: (tab?: 'profile' | 'security') => beginIdentityAccountPortal(event, name, tab),
    completeAuthorization: (code: string, state: string, connection?: 'primary' | 'sandbox') => completeIdentityAuthorization(event, name, code, state, connection),
    logout: () => logoutIdentityApplication(event, name),
  }
}

export { safeLocalPath }
