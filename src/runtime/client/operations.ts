import { $fetch } from 'ofetch'
import type { TalredIdentityFlowStatus, TalredIdentityUser } from '../../types.js'
import { identityOperationRoute } from './routes.js'

export type IdentityFlowResult<T = unknown> = { status: TalredIdentityFlowStatus, user?: TalredIdentityUser, redirect?: string, data?: T }
export type IdentityCredentials = { email: string, password: string, returnTo?: string }
export type IdentityRegistration = IdentityCredentials & { username: string, password_confirmation: string, terms_accepted: boolean, policy_revision?: string }
export type IdentitySensitiveAction = 'profile' | 'password' | 'export' | 'delete_account' | 'revoke_session'

/** Headless browser operations. The application owns forms, validation messages and navigation. */
export function useTalredIdentityOperations(application: string, headers?: () => HeadersInit | undefined) {
  function execute<T = unknown>(operation: string, body: Record<string, unknown> = {}): Promise<IdentityFlowResult<T>> {
    const requestHeaders = new Headers(headers?.())
    requestHeaders.set('x-talred-identity', '1')
    requestHeaders.set('content-type', 'application/json')
    return $fetch<IdentityFlowResult<T>>(identityOperationRoute(application, operation), { method: 'POST', headers: requestHeaders, body })
  }
  return {
    google: (input: { sensitive_operation?: IdentitySensitiveAction, terms_accepted: boolean, policy_revision?: string, returnTo?: string }) => execute('google', input),
    context: () => execute<{ application: { google_enabled?: boolean, terms_required?: boolean, policy_revision?: string } | null }>('context'),
    login: (input: IdentityCredentials) => execute('login', input),
    register: (input: IdentityRegistration) => execute('register', input),
    recover: (email: string) => execute('recovery', { email }),
    reset: (input: { email: string, token: string, password: string, password_confirmation: string }) => execute('reset', input),
    verify: (code: string) => execute('verify', { code }),
    resend: () => execute('resend'),
    reauthenticate: (password: string, operation: IdentitySensitiveAction) => execute('reauthenticate', { password, sensitive_operation: operation }),
    profile: (input: { username: string, email: string, avatar_url?: string | null }) => execute('profile', input),
    password: (password: string, password_confirmation: string) => execute('password', { password, password_confirmation }),
    sessions: () => execute('sessions'),
    revoke: (session: string) => execute('revoke', { session }),
    export: () => execute('export'),
    deleteAccount: () => execute('delete'),
  }
}
