import { createError, type H3Event } from 'h3'
import { requireIdentityCsrf } from './csrf.js'
export { requireIdentityCsrf } from './csrf.js'
import { $fetch } from 'ofetch'
import { applicationSession, beginIdentityGoogle, identityAccessToken, identityApplication, safeLocalPath, storeLogin, type IdentityLoginData } from './identity.js'

const operations = {
  google: { path: 'google/authorize', method: 'POST', fields: [], public: true },
  context: { path: 'context', method: 'POST', fields: [], public: true },
  login: { path: 'login', method: 'POST', fields: ['email', 'password'], public: true },
  register: { path: 'register', method: 'POST', fields: ['email', 'username', 'password', 'password_confirmation', 'terms_accepted', 'policy_revision'], public: true },
  recovery: { path: 'password/forgot', method: 'POST', fields: ['email'], public: true },
  reset: { path: 'password/reset', method: 'POST', fields: ['email', 'token', 'password', 'password_confirmation'], public: true },
  verify: { path: 'email/verification', method: 'POST', fields: ['code'], pending: true },
  resend: { path: 'email/verification/resend', method: 'POST', fields: [], pending: true },
  profile: { path: 'account/profile', method: 'PUT', fields: ['username', 'email', 'avatar_url'], grant: 'profile' },
  password: { path: 'account/password', method: 'PUT', fields: ['password', 'password_confirmation'], grant: 'password' },
  export: { path: 'account/export', method: 'POST', fields: [], grant: 'export' },
  delete: { path: 'account', method: 'DELETE', fields: [], grant: 'delete_account' },
  sessions: { path: 'sessions', method: 'GET', fields: [] },
  revoke: { path: 'sessions', method: 'DELETE', fields: [] },
  reauthenticate: { path: 'reauthenticate', method: 'POST', fields: ['password', 'sensitive_operation'] },
} as const

export type IdentityAppOperation = keyof typeof operations

export async function executeIdentityAppOperation(event: H3Event, name: string, operation: IdentityAppOperation, input: Record<string, unknown> = {}) {
  const application = identityApplication(event, name)
  if (application.mode !== 'app') throw createError({ statusCode: 404, statusMessage: 'App authentication is disabled.' })
  requireIdentityCsrf(event, application.callbackUrl)
  if (!Object.hasOwn(operations, operation)) throw createError({ statusCode: 404, statusMessage: 'Unknown identity operation.' })
  if (operation === 'google') return { status: 'completed', redirect: await beginIdentityGoogle(event, name, input) }
  const definition = operations[operation]
  const session = await applicationSession(event, name, application)
  const body: Record<string, unknown> = Object.fromEntries(definition.fields.filter(field => Object.hasOwn(input, field)).map(field => [field, input[field]]))
  const headers: Record<string, string> = { Accept: 'application/json' }
  if ('public' in definition || operation === 'reauthenticate') {
    Object.assign(body, { client_id: application.clientId, client_secret: application.clientSecret, application_key: application.hostedApplication })
  }
  if (!('public' in definition)) headers.Authorization = `Bearer ${await identityAccessToken(event, name, 'pending' in definition)}`
  if ('grant' in definition) {
    const grant = session.data.reauthentication
    if (!grant || grant.operation !== definition.grant || Date.parse(grant.expiresAt) <= Date.now()) {
      return { status: 'reauthentication_required' as const }
    }
    headers['X-Identity-Reauthentication'] = grant.grant
    await session.update({ reauthentication: undefined })
  }
  let path: string = definition.path
  if (operation === 'revoke') {
    if (typeof input.session !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.session)) throw createError({ statusCode: 400, statusMessage: 'Invalid session.' })
    path += `/${input.session}`
  }
  try {
    const response = await $fetch<{ data: unknown }>(`/api/v1/identity/auth/${path}`, {
      baseURL: application.identityApiUrl, method: definition.method, headers,
      ...definition.method !== 'GET' ? { body } : {},
    })
    if (operation === 'login' || operation === 'register') {
      await storeLogin(event, name, application, response.data as IdentityLoginData, 'primary')
      return { status: session.data.user?.verificationRequired ? 'verification_required' : 'authenticated', user: session.data.user, redirect: safeLocalPath(typeof input.returnTo === 'string' ? input.returnTo : undefined, application.defaultRedirect) }
    }
    if (operation === 'reauthenticate') {
      const grant = response.data as { grant: string, operation: string, expires_at: string }
      await session.update({ reauthentication: { grant: grant.grant, operation: grant.operation, expiresAt: grant.expires_at } })
      return { status: 'completed' }
    }
    if (operation === 'verify' || operation === 'profile') {
      const current = await $fetch<{ data: IdentityLoginData['identity'] }>('/api/v1/identity/auth/me', { baseURL: application.identityApiUrl, headers })
      const user = current.data.user
      await session.update({ user: { id: user.id, email: user.email, name: user.username, username: user.username, emailVerified: user.email_verified, verificationRequired: current.data.project?.email_verification_required === true && !user.email_verified } })
    }
    if (operation === 'delete') await session.clear()
    // Never relay arbitrary auth payloads (e.g. development reset/verification tokens).
    return { status: 'completed', ...['context', 'sessions', 'export'].includes(operation) ? { data: response.data } : {} }
  } catch (error) {
    const upstream = error as { response?: { status?: number }, data?: { message?: string, errors?: Record<string, string[]> } }
    const statusCode = upstream.response?.status ?? 502
    throw createError({ statusCode, statusMessage: statusCode >= 500 ? 'Identity is temporarily unavailable.' : 'Identity request failed.', data: { message: statusCode >= 500 ? undefined : upstream.data?.message, errors: upstream.data?.errors } })
  }
}
