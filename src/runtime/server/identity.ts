import { createHash, randomBytes } from 'node:crypto'
import { createError, type H3Event, useSession } from 'h3'
import { $fetch } from 'ofetch'
import { useRuntimeConfig } from 'nitropack/runtime/config'
import type { TalredIdentityApplication, TalredIdentityRuntimeConfig, TalredIdentityUser } from '../../types.js'

export type IdentityLoginData = {
  access_token: string
  access_token_expires_at: string
  refresh_token: string
  refresh_token_expires_at: string
  identity: {
    project?: { email_verification_required?: boolean }
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

export type ResolvedIdentityApplication = Omit<Required<TalredIdentityApplication>, 'pages' | 'mode'> & { mode: 'hosted' | 'app', pages?: { login: string, register: string, forgotPassword: string, resetPassword: string, verification: string, account: string } }

type ConsumerSession = {
  user?: TalredIdentityUser
  reauthentication?: { grant: string, operation: string, expiresAt: string }
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
const inFlightRefreshes = new Map<string, Promise<IdentityLoginData>>()

function configurationKey(name: string): string {
  return name.replace(/-([a-z0-9])/gi, (_, character: string) => character.toUpperCase())
}

function safeLocalPath(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || Array.from(value).some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) || /^\/(?:%2f|%5c)/i.test(value)) return fallback
  return value
}

function failConfiguration(name: string, reason: string): never {
  throw createError({ statusCode: 503, statusMessage: `Identity application [${name}] is not configured: ${reason}.` })
}

function validUrl(value: string, name: string, production: boolean, privateHttpHosts: string[] = []): string {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) failConfiguration(name, 'URL must use HTTP or HTTPS')
    if (production && url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname) && !privateHttpHosts.includes(url.hostname)) {
      failConfiguration(name, 'non-local URLs must use HTTPS in production')
    }
    return url.toString().replace(/\/$/, '')
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    failConfiguration(name, 'contains an invalid URL')
  }
}

function cookieName(name: string, configured?: string): string {
  const value = configured || `talred-identity-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-session`
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/.test(value)) failConfiguration(name, 'sessionCookie is invalid')
  return value
}

export function identityApplication(event: H3Event, name: string): ResolvedIdentityApplication {
  const privateHttpHosts = String(process.env.NUXT_TALRED_IDENTITY_PRIVATE_HTTP_HOSTS ?? '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
  const runtime = (useRuntimeConfig(event).talredIdentity ?? {}) as Partial<TalredIdentityRuntimeConfig>
  const applications = runtime.applications ?? {}
  const application = applications[name] ?? applications[configurationKey(name)]
  if (!application) failConfiguration(name, 'application is missing')

  const mode = application.mode ?? 'hosted'
  if (!['hosted', 'app'].includes(mode)) failConfiguration(name, 'mode must be hosted or app')
  if (mode === 'app' && (!application.pages || ['login', 'register', 'forgotPassword', 'resetPassword', 'verification', 'account'].some(key => { const path = application.pages?.[key as keyof typeof application.pages]; return !path || safeLocalPath(path, '') !== path }))) failConfiguration(name, 'app mode requires safe local auth and account pages')
  const required = ['identityApiUrl', 'clientId', 'clientSecret', 'hostedApplication', 'callbackUrl', ...(mode === 'hosted' ? ['hostedAuthUrl' as const] : [])] as const
  const missing = required.filter(key => !String(application[key] ?? '').trim())
  if (missing.length > 0) failConfiguration(name, `missing ${missing.join(', ')}`)
  if (String(runtime.sessionSecret ?? '').length < 32) failConfiguration(name, 'talredIdentity.sessionSecret must be at least 32 characters')

  const production = process.env.NODE_ENV === 'production'
  const callbackUrl = validUrl(String(application.callbackUrl), name, production, privateHttpHosts)
  const demoAccount = application.features?.demoAccount === true
  if (demoAccount && !application.sandboxApplication) {
    failConfiguration(name, 'sandboxApplication is required when the demo account feature is enabled')
  }
  return {
    identityApiUrl: validUrl(String(application.identityApiUrl), name, production, privateHttpHosts),
    mode,
    pages: application.pages,
    hostedAuthUrl: application.hostedAuthUrl ? validUrl(application.hostedAuthUrl, name, production, privateHttpHosts) : '',
    clientId: String(application.clientId),
    clientSecret: String(application.clientSecret),
    hostedApplication: String(application.hostedApplication),
    callbackUrl,
    sessionCookie: cookieName(name, application.sessionCookie),
    defaultRedirect: safeLocalPath(application.defaultRedirect, '/'),
    logoutRedirect: safeLocalPath(application.logoutRedirect, '/'),
    sandboxApplication: application.sandboxApplication ? String(application.sandboxApplication) : '',
    features: { demoAccount },
  }
}

function validatedSandboxApplication(
  event: H3Event,
  name: string,
  application: ResolvedIdentityApplication,
): ResolvedIdentityApplication {
  if (!application.sandboxApplication) failConfiguration(name, 'sandboxApplication is required when the demo account feature is enabled')
  const sandbox = identityApplication(event, application.sandboxApplication)
  if (sandbox.clientId === application.clientId || sandbox.clientSecret === application.clientSecret) {
    failConfiguration(name, 'sandbox client credentials must be distinct from the live client')
  }
  if (sandbox.hostedApplication !== application.hostedApplication) {
    failConfiguration(name, 'sandbox hostedApplication must match the live application')
  }
  if (sandbox.callbackUrl !== application.callbackUrl) {
    failConfiguration(name, 'sandbox callbackUrl must exactly match the live callbackUrl')
  }
  return sandbox
}

function tokenApplication(event: H3Event, application: ResolvedIdentityApplication, connection: 'primary' | 'sandbox'): ResolvedIdentityApplication {
  if (connection === 'primary') return application
  if (!application.sandboxApplication) failConfiguration(application.hostedApplication, 'sandboxApplication is required for a sandbox handoff')
  return identityApplication(event, application.sandboxApplication)
}

function sessionPassword(event: H3Event, name: string): string {
  const password = String((useRuntimeConfig(event).talredIdentity as Partial<TalredIdentityRuntimeConfig> | undefined)?.sessionSecret ?? '')
  if (password.length < 32) failConfiguration(name, 'talredIdentity.sessionSecret must be at least 32 characters')
  return password
}

export async function applicationSession(event: H3Event, name: string, application: ResolvedIdentityApplication) {
  return useSession<ConsumerSession>(event, {
    password: sessionPassword(event, name),
    name: application.sessionCookie,
    maxAge: sessionMaxAge,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
  })
}

async function transactionSession(event: H3Event, name: string, application: ResolvedIdentityApplication) {
  return useSession<AuthorizationTransaction>(event, {
    password: sessionPassword(event, name),
    name: `${application.sessionCookie}-transaction`,
    maxAge: stateTtlMilliseconds / 1000,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
  })
}

function user(data: IdentityLoginData): TalredIdentityUser {
  return {
    id: data.identity.user.id,
    email: data.identity.user.email,
    name: data.identity.user.username,
    username: data.identity.user.username,
    emailVerified: data.identity.user.email_verified,
    verificationRequired: data.identity.project?.email_verification_required === true && !data.identity.user.email_verified,
    isTemporary: data.identity.user.is_temporary,
    expiresAt: data.identity.user.temporary_expires_at,
  }
}

export async function storeLogin(event: H3Event, name: string, application: ResolvedIdentityApplication, data: IdentityLoginData, connection: 'primary' | 'sandbox'): Promise<void> {
  await (await applicationSession(event, name, application)).update({
    reauthentication: undefined,
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
  if (application.mode === 'app' && application.pages) {
    const intent = options.intent ?? 'login'
    const paths = { login: application.pages.login, register: application.pages.register, 'forgot-password': application.pages.forgotPassword, 'reset-password': application.pages.resetPassword }
    const query = new URLSearchParams({ redirect: safeLocalPath(options.returnTo, application.defaultRedirect) })
    if (options.email) query.set('email', options.email)
    if (options.token) query.set('token', options.token)
    return `${paths[intent]}?${query}`
  }
  if (application.features.demoAccount) validatedSandboxApplication(event, name, application)
  const state = randomBytes(32).toString('base64url')
  await (await transactionSession(event, name, application)).update({
    state,
    returnTo: safeLocalPath(options.returnTo, application.defaultRedirect),
    createdAt: Date.now(),
  })
  const response = await $fetch<{ data: { intent: string } }>('/api/v1/identity/auth/authorization/intent', {
    baseURL: application.identityApiUrl,
    method: 'POST',
    body: {
      client_id: application.clientId,
      client_secret: application.clientSecret,
      hosted_application: application.hostedApplication,
      state,
      demo_account_enabled: application.features.demoAccount,
    },
  })
  const destination = new URL(`/auth/${options.intent ?? 'login'}`, `${application.hostedAuthUrl}/`)
  destination.searchParams.set('application', application.hostedApplication)
  destination.searchParams.set('state', state)
  destination.searchParams.set('intent', response.data.intent)
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
  if (application.mode === 'app' && application.pages) return `${application.pages.account}?tab=${tab}`
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

/** Creates a one-time hosted logout handoff before clearing the consumer session. */
export async function beginIdentityLogout(event: H3Event, name: string, returnTo?: string): Promise<string> {
  const application = identityApplication(event, name)
  const destinationPath = safeLocalPath(returnTo, application.logoutRedirect)
  if (application.mode === 'app') {
    await logoutIdentityApplication(event, name)
    return destinationPath
  }

  try {
    const response = await $fetch<{ data: { intent: string } }>('/api/v1/identity/auth/logout/intent', {
      baseURL: application.identityApiUrl,
      method: 'POST',
      body: {
        client_id: application.clientId,
        client_secret: application.clientSecret,
        hosted_application: application.hostedApplication,
        return_to: destinationPath,
      },
    })
    const destination = new URL('/auth/logout', `${application.hostedAuthUrl}/`)
    destination.searchParams.set('application', application.hostedApplication)
    destination.searchParams.set('intent', response.data.intent)
    return destination.toString()
  } finally {
    await logoutIdentityApplication(event, name)
  }
}

export async function beginIdentityGoogle(event: H3Event, name: string, input: Record<string, unknown>): Promise<string> {
  const application = identityApplication(event, name)
  if (application.mode !== 'app') throw createError({ statusCode: 404, statusMessage: 'App authentication is disabled.' })
  const transaction = await transactionSession(event, name, application)
  const state = randomBytes(32).toString('base64url')
  await transaction.update({ state, createdAt: Date.now(), returnTo: safeLocalPath(typeof input.returnTo === 'string' ? input.returnTo : undefined, application.defaultRedirect) })
  const response = await $fetch<{ data: { redirect_url: string } }>('/api/v1/identity/auth/google/authorize', {
    baseURL: application.identityApiUrl, method: 'POST',
    headers: input.sensitive_operation ? { Authorization: `Bearer ${await identityAccessToken(event, name)}` } : undefined,
    body: {
      client_id: application.clientId, client_secret: application.clientSecret,
      application_key: application.hostedApplication, redirect_uri: application.callbackUrl,
      state, terms_accepted: input.terms_accepted === true, policy_revision: input.policy_revision, sensitive_operation: input.sensitive_operation,
    },
  })
  const destination = new URL(response.data.redirect_url)
  if (destination.origin !== 'https://accounts.google.com') throw createError({ statusCode: 502, statusMessage: 'Unexpected provider destination.' })
  return destination.toString()
}

export async function completeIdentityProviderDenial(event: H3Event, name: string, state: string): Promise<string> {
  const application = identityApplication(event, name)
  const transaction = await transactionSession(event, name, application)
  const valid = transaction.data.state === state && typeof transaction.data.createdAt === 'number'
    && Date.now() - transaction.data.createdAt >= 0 && Date.now() - transaction.data.createdAt <= stateTtlMilliseconds
  await transaction.clear()
  if (!valid || application.mode !== 'app') throw createError({ statusCode: 401, statusMessage: 'Invalid provider state.' })
  return `${application.pages!.login}?error=access_denied`
}

export async function completeIdentityAuthorization(event: H3Event, name: string, code: string, state: string, connection: 'primary' | 'sandbox' = 'primary'): Promise<string> {
  const application = identityApplication(event, name)
  if (connection === 'sandbox' && !application.features.demoAccount) {
    throw createError({ statusCode: 403, statusMessage: 'Demo sandbox accounts are disabled for this application.' })
  }
  if (connection === 'sandbox') validatedSandboxApplication(event, name, application)
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
    const response = await $fetch<{ data: IdentityLoginData | { reauthentication: { grant: string, operation: string, expires_at: string, source_token_hash: string } } }>('/api/v1/identity/auth/handoff/exchange', {
      baseURL: client.identityApiUrl,
      method: 'POST',
      body: { client_id: client.clientId, client_secret: client.clientSecret, code, redirect_uri: client.callbackUrl },
    })
    if ('reauthentication' in response.data) {
      const current = await applicationSession(event, name, application)
      const grant = response.data.reauthentication
      if (!current.data.secure?.accessToken || createHash('sha256').update(current.data.secure.accessToken).digest('hex') !== grant.source_token_hash) {
        throw createError({ statusCode: 401, statusMessage: 'The signed-in account changed during reauthentication.' })
      }
      await current.update({ reauthentication: { grant: grant.grant, operation: grant.operation, expiresAt: grant.expires_at } })
      return safeLocalPath(data.returnTo, application.pages?.account ?? application.defaultRedirect)
    }
    await storeLogin(event, name, application, response.data, connection)
    const currentUser = await identityBrowserSession(event, name)
    return currentUser?.verificationRequired && application.pages ? application.pages.verification : safeLocalPath(data.returnTo, application.defaultRedirect)
  } finally {
    await transaction.clear()
  }
}

export async function identityAccessToken(event: H3Event, name: string, allowVerificationPending = false): Promise<string> {
  const application = identityApplication(event, name)
  const current = await applicationSession(event, name, application)
  if (!allowVerificationPending && current.data.user?.verificationRequired) {
    throw createError({ statusCode: 403, statusMessage: 'Email verification is required.', data: { code: 'verification_required' } })
  }
  const secure = current.data.secure
  if (!secure?.accessToken || !secure.refreshToken) {
    throw createError({ statusCode: 401, statusMessage: 'An Identity session is required.' })
  }
  const expiresAt = Date.parse(secure.accessTokenExpiresAt)
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 30_000) return secure.accessToken

  return await refreshIdentityAccessToken(event, name)
}

export async function refreshIdentityAccessToken(event: H3Event, name: string): Promise<string> {
  const application = identityApplication(event, name)
  const current = await applicationSession(event, name, application)
  const secure = current.data.secure
  if (!secure?.refreshToken) {
    throw createError({ statusCode: 401, statusMessage: 'An Identity session is required.' })
  }
  const client = tokenApplication(event, application, secure.connection ?? 'primary')
  const refreshKey = `${name}:${secure.refreshToken}`
  let refreshPromise = inFlightRefreshes.get(refreshKey)
  if (!refreshPromise) {
    refreshPromise = $fetch<{ data: IdentityLoginData }>('/api/v1/identity/auth/refresh', {
      baseURL: client.identityApiUrl,
      method: 'POST',
      body: { client_id: client.clientId, client_secret: client.clientSecret, refresh_token: secure.refreshToken },
    }).then(response => response.data)
    inFlightRefreshes.set(refreshKey, refreshPromise)
  }
  try {
    const response = await refreshPromise
    await storeLogin(event, name, application, response, secure.connection ?? 'primary')
    return response.access_token
  } finally {
    if (inFlightRefreshes.get(refreshKey) === refreshPromise) inFlightRefreshes.delete(refreshKey)
  }
}

export async function identityBrowserSession(event: H3Event, name: string): Promise<TalredIdentityUser | null> {
  const application = identityApplication(event, name)
  return (await applicationSession(event, name, application)).data.user ?? null
}

export async function requireIdentityUser(event: H3Event, name: string): Promise<TalredIdentityUser> {
  const currentUser = await identityBrowserSession(event, name)
  if (!currentUser) throw createError({ statusCode: 401, statusMessage: 'An Identity session is required.' })
  if (currentUser.verificationRequired) throw createError({ statusCode: 403, statusMessage: 'Email verification is required.', data: { code: 'verification_required' } })
  return currentUser
}

export async function logoutIdentityApplication(event: H3Event, name: string): Promise<void> {
  const application = identityApplication(event, name)
  const current = await applicationSession(event, name, application)
  const secure = current.data.secure
  try {
    let accessToken = secure?.accessToken
    if (accessToken && secure?.refreshToken) {
      const accessExpiresAt = Date.parse(secure.accessTokenExpiresAt)
      const refreshExpiresAt = Date.parse(secure.refreshTokenExpiresAt)
      if (Number.isFinite(accessExpiresAt) && accessExpiresAt <= Date.now()
        && Number.isFinite(refreshExpiresAt) && refreshExpiresAt > Date.now()) {
        accessToken = await refreshIdentityAccessToken(event, name)
      }
    }
    if (accessToken) {
      const client = tokenApplication(event, application, secure?.connection ?? 'primary')
      await $fetch('/api/v1/identity/auth/logout', {
        baseURL: client.identityApiUrl,
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    }
  } catch (error) {
    const status = (error as { status?: number, statusCode?: number, response?: { status?: number } }).status
      ?? (error as { statusCode?: number }).statusCode
      ?? (error as { response?: { status?: number } }).response?.status
    console.warn('[talred-identity] Remote session revocation failed.', { application: name, status })
  } finally {
    await current.clear()
  }
}

/** Application-bound server facade for hosts that should not repeat consumer names. */
export function useServerIdentity(event: H3Event, name: string) {
  return {
    user: () => identityBrowserSession(event, name),
    requireUser: () => requireIdentityUser(event, name),
    accessToken: () => identityAccessToken(event, name),
    refreshAccessToken: () => refreshIdentityAccessToken(event, name),
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
