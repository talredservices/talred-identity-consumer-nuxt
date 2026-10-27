export type TalredIdentityUser = {
  id: string
  email: string
  name: string
  username: string
  emailVerified: boolean
  verificationRequired?: boolean
  isTemporary?: boolean
  expiresAt?: string | null
}

type TalredIdentityApplicationBase = {
  /** Base URL of the Talred Identity Laravel API, without a trailing slash. */
  identityApiUrl: string
  /** Base URL of the Talred Identity Nuxt hosted-auth application. */
  hostedAuthUrl?: string
  /** Confidential client ID created in the Identity project. */
  clientId: string
  /** Confidential client secret. Server-only: never place this in public runtime config. */
  clientSecret: string
  /** Hosted application key configured in the Identity console. */
  hostedApplication: string
  /** Configuration key for the sandbox BFF client used by temporary demo accounts. */
  sandboxApplication?: string
  /** Hosted authentication features explicitly enabled by this consumer application. */
  features?: {
    /** Allow the hosted Identity UI to offer a temporary sandbox demo account. */
    demoAccount?: boolean
  }
  /** Exact callback URL registered for the confidential client. */
  callbackUrl: string
  /** Cookie name for the app's encrypted server session. */
  sessionCookie?: string
  /** Local path used after authentication when no safe return path is supplied. */
  defaultRedirect?: string
  /** Local path used after logout when the caller does not provide one. */
  logoutRedirect?: string
}

export type TalredIdentityRuntimeConfig = {
  /** 32+ character secret used only to encrypt consumer sessions. */
  sessionSecret: string
  applications: Record<string, Partial<TalredIdentityApplication>>
}

/** Hosted is the backward-compatible default. App mode owns all visible pages. */
export type TalredIdentityApplication = TalredIdentityApplicationBase & (
  | { mode?: 'hosted', hostedAuthUrl: string, pages?: never }
  | { mode: 'app', pages: { login: string, register: string, forgotPassword: string, resetPassword: string, verification: string, account: string } }
)

export type TalredIdentityFlowStatus = 'authenticated' | 'verification_required' | 'reauthentication_required' | 'completed'
