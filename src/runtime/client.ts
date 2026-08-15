export { useZoltaIdentitySession } from './client/session.js'
export {
  identityResponseStatus,
  resolveIdentityAuthIntent,
  resolveIdentityRedirect,
  useZoltaIdentity,
  useZoltaIdentityFetch,
  useZoltaIdentityUnauthorizedHandler,
} from './client/identity.js'
export type {
  ZoltaIdentityAccountSection,
  ZoltaIdentityClientOptions,
  ZoltaIdentityIntent,
} from './client/identity.js'
export { createZoltaIdentityRouteMiddleware } from './client/middleware.js'
