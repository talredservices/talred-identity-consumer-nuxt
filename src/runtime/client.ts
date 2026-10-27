export { useTalredIdentitySession } from './client/session.js'
export {
  identityResponseStatus,
  resolveIdentityAuthIntent,
  resolveIdentityRedirect,
  useTalredIdentity,
  useTalredIdentityFetch,
  useTalredIdentityUnauthorizedHandler,
} from './client/identity.js'
export type {
  TalredIdentityAccountSection,
  TalredIdentityClientOptions,
  TalredIdentityIntent,
} from './client/identity.js'
export { createTalredIdentityRouteMiddleware } from './client/middleware.js'

export { useTalredIdentityOperations } from './client/operations.js'
export type { IdentityFlowResult, IdentityCredentials, IdentityRegistration, IdentitySensitiveAction } from './client/operations.js'

export type { TalredIdentityFlowStatus } from '../types.js'
