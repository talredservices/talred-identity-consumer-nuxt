# Detailed usage

This guide is the detailed reference for the Zolta Identity Nuxt consumer. See the [README](../README.md) for installation and configuration.

## Sandbox demo sessions

To show hosted **Create instant demo account**, create a separate sandbox project and a dedicated sandbox BFF client in the Zolta Identity console. Set that client as the hosted application's **Sandbox client ID**, configure it as a second consumer application, set the live application's `sandboxApplication` to its key, and enable `features.demoAccount` on the live application.

The module sends this opt-in through a short-lived, client-authenticated authorization intent. Both configurations must use the callback URL registered on the hosted application. The callback's connection binding selects the primary or sandbox client for token exchange, refresh, and logout while preserving one consumer session. Hosts own the demo policy, including whether demo users may use account management or protected domain operations.

## Routes

For an application named `document-studio`, the module registers these no-store BFF endpoints:

| Route | Purpose |
| --- | --- |
| `GET /api/identity/document-studio/auth/authorize` | Stores a state transaction, then redirects to hosted authentication. |
| `GET /api/identity/document-studio/auth/callback` | Validates state, exchanges the handoff code, and redirects locally. |
| `GET /api/identity/document-studio/auth/session` | Returns the public user profile or `null`. |
| `POST /api/identity/document-studio/auth/logout` | Creates a one-time hosted logout handoff, revokes remote access when possible, clears the local session, and returns a hosted `redirectUrl`. |
| `GET /api/identity/document-studio/account/authorize` | Requires an Identity session, creates a short-lived account-portal intent, then redirects to hosted account authentication before settings. |
| `GET /api/identity/document-studio/account/logout` | Clears the consumer session and begins a new hosted sign-in flow after account-portal logout. |

Use the account route only for an authenticated user's **Manage identity** action. Identity issues and consumes the opaque portal intent; consumers do not sign or validate it, and tokens never enter the browser URL. `useZoltaIdentity(...).logout(returnTo)` performs the complete browser flow. `returnTo` must be a local path.

## Client API

`useZoltaIdentity` is the recommended application-bound client facade. It supplies public session state, safe login navigation, logout, and account-portal navigation on top of the lower-level `useZoltaIdentitySession` composable.

```ts
const { csrf, headerName } = useCsrf()

const identity = useZoltaIdentity('document-studio', {
  defaultRedirect: '/document-studio',
  loginPath: '/auth/login', // optional host-owned interstitial page
  logoutRedirect: '/auth/login',
  logoutHeaders: () => ({ [headerName]: csrf }),
})

await identity.refresh()
identity.user.value
identity.loggedIn.value
identity.ready.value

await identity.login('/document-studio')
await identity.logout()
await identity.openAccountPortal('security')
```

Without `loginPath`, `login()` goes straight to the BFF authorization endpoint. Use it when the host needs a localized interstitial page, product context, analytics, or another host-owned step before hosted authentication.

- `profile`, `sessions`, and `privacy` open the hosted profile tab.
- `password` and `security` open the hosted security tab.

Use `useZoltaIdentitySession` when the host owns navigation itself:

```vue
<script setup lang="ts">
const identity = useZoltaIdentitySession('document-studio')
</script>

<template>
  <NuxtLink :to="identity.authorize('/document-studio')">Sign in</NuxtLink>
</template>
```

### Authenticated fetch and expired sessions

`useZoltaIdentityFetch` applies one response policy: a browser-side `401` clears the consumer session and starts a new login. Other errors are rethrown.

```ts
const authenticatedFetch = useZoltaIdentityFetch('document-studio', {
  defaultRedirect: '/document-studio',
  loginPath: '/auth/login',
})

const documents = await authenticatedFetch<Document[]>('/api/documents')
```

It does not add authorization or CSRF headers to requests. The host must still attach any CSRF header required for protected mutations. For a custom transport, use `useZoltaIdentityUnauthorizedHandler` and call `await unauthorized.handle(error)` in the error path.

### Redirects, intents, and route guards

The module auto-imports helpers for host routes such as `/auth/[action]`:

```ts
const intent = resolveIdentityAuthIntent(String(route.params.action))
// login | register | forgot-password | reset-password | null

const returnTo = resolveIdentityRedirect(route.query.redirect, '/dashboard')
```

`resolveIdentityRedirect` accepts only local absolute paths. Use it before placing user-controlled values in an authentication flow.

Protect selected routes without installing a global guard:

```ts
// app/middleware/require-document-studio-auth.ts
export default createZoltaIdentityRouteMiddleware('document-studio')
```

```ts
definePageMeta({ middleware: ['require-document-studio-auth'] })
```

## Server API

`useServerIdentity` binds the current H3 event and one configured application:

```ts
import { useServerIdentity } from '@zoltasoft/identity-consumer-nuxt/runtime'

export default defineEventHandler(async (event) => {
  const identity = useServerIdentity(event, 'document-studio')
  const user = await identity.requireUser()
  const token = await identity.accessToken()

  // Call the application service with `Authorization: Bearer ${token}`.
  return { user }
})
```

| Method | Use case |
| --- | --- |
| `user()` | Read the public user or `null` without requiring authentication. |
| `requireUser()` | Reject an unauthenticated BFF request with `401`. |
| `accessToken()` | Get a valid access token, refreshing it server-side when needed. |
| `optionalAccessToken()` | Add authentication to an upstream request only when a session exists. |
| `authorize(options)` | Begin hosted authentication from a custom server handler. |
| `accountPortal(tab)` | Begin an authenticated hosted account-portal handoff. |
| `completeAuthorization(...)` | Complete a custom callback implementation. |
| `logout()` | Revoke remote access when possible and clear the local session. |

Focused utilities remain available for backward compatibility:

```ts
import { identityAccessToken, requireIdentityUser } from '@zoltasoft/identity-consumer-nuxt/runtime'

export default defineEventHandler(async (event) => {
  const user = await requireIdentityUser(event, 'document-studio')
  const token = await identityAccessToken(event, 'document-studio')
  return { user }
})
```

### Authenticated Zolta API client

Use `createIdentityApiClient` when a BFF talks to an API protected by the same Zolta Identity application. It attaches the current bearer token, refreshes an expired session after the first `401`, and retries once. If refresh fails, it clears the local session. API failures remain typed `ZoltaApiError` values.

```ts
import { createIdentityApiClient } from '@zoltasoft/identity-consumer-nuxt/runtime'

export default defineEventHandler(async (event) => {
  const api = await createIdentityApiClient(event, 'document-studio', {
    baseURL: useRuntimeConfig(event).zoltaApiUrl,
    internalToken: useRuntimeConfig(event).internalServiceToken,
  })

  return api('/v1/documents')
})
```

Set `requireAuthentication: false` for an anonymous endpoint that should send the current access token when a session exists. Use `@zoltasoft/api-client` directly when no Zolta Identity session is involved.

## Authentication flows

### Hosted sign-in or registration

1. The host calls `identity.login(returnTo, intent)` or sends the browser to `auth/authorize`.
2. The consumer stores a random state transaction in an encrypted HTTP-only cookie and redirects to hosted Identity.
3. Identity authenticates or registers the user and returns a short-lived handoff code to the callback.
4. The consumer validates state, exchanges the code with its confidential client, stores tokens server-side, and redirects to the validated local `returnTo` path.
5. Browser code receives only the public user through `refresh()` or the session endpoint.

Use this flow for sign-in, registration, password recovery, and email/token handoffs while keeping credentials and tokens outside the browser.

### Calling an upstream application API

1. A browser component calls the host's Nuxt BFF route.
2. The BFF creates `createIdentityApiClient(event, application, options)` or uses `useServerIdentity` for a custom transport.
3. The consumer refreshes an expired access token as needed; a rejected token is refreshed and retried once.
4. The BFF forwards the authenticated request to the protected Zolta API and returns an application-shaped response.

Use `accessToken()` for protected operations and `optionalAccessToken()` for endpoints that can serve anonymous users.

### Hosted account management

1. An authenticated user selects **Manage identity**.
2. `openAccountPortal()` enters the consumer account authorization route.
3. The consumer proves the current Identity session and requests a short-lived, single-use portal intent.
4. The browser goes through hosted account authentication before profile or security settings.

Use this flow instead of linking directly to the account UI. Hosts decide whether temporary, sandbox, or restricted users can enter account management.

### Session expiration and logout

Normal logout attempts remote token revocation and always clears the encrypted session. `useZoltaIdentityFetch` can centralize recovery from expired browser sessions. Domain authorization failures, including `403`, are never converted into login redirects.

## Import boundaries

- Import Nitro helpers from `@zoltasoft/identity-consumer-nuxt/runtime`.
- Import client composables from `@zoltasoft/identity-consumer-nuxt/runtime/client`, or use the Nuxt auto-imports registered by the module.
- Do not import `runtime/client` from server routes or server utilities.

This keeps Vue aliases such as `nuxt/app` and `#build` out of the Nitro server bundle.

## Local package development

An adjacent Nuxt host can use an unpublished build directly:

```json
{
  "dependencies": {
    "@zoltasoft/api-client": "file:../api-client",
    "@zoltasoft/identity-consumer-nuxt": "file:../zolta-identity-consumer-nuxt"
  }
}
```

After changing the consumer, run `pnpm build` in this repository and refresh the dependency in the host. Use compatible Node versions in both applications so native dependencies are rebuilt for the correct runtime.

If the host protects POST requests with CSRF middleware, configure `logoutHeaders` on `useZoltaIdentity`, or pass `{ headers }` to `useZoltaIdentitySession().logout()`. The package does not weaken the host's CSRF policy.

## Security model

- Client secrets, handoff-code exchanges, refresh tokens, and access tokens stay on the Nuxt server.
- Authentication state is random, bound to an HTTP-only transaction cookie, expires after ten minutes, and is cleared after one callback attempt.
- Sessions are encrypted with `zoltaIdentity.sessionSecret`, use `HttpOnly`, `SameSite=Lax`, and use `Secure` in production.
- Redirect targets are limited to local paths; protocol-relative and backslash-based values are rejected.
- Production rejects non-local HTTP Identity and callback URLs.
- Account-management redirects require an Identity-issued, short-lived, single-use portal intent.

The module supports the Zolta Identity API v1 handoff, refresh, and logout contract. Treat that version as the compatibility boundary; a breaking protocol change is released as a new major module version.

See [SECURITY.md](../SECURITY.md) for responsible disclosure and deployment responsibilities.

## Contract fixture and release

`fixtures/contract-app` is a minimal Nuxt host used by the real-contract workflow against a disposable Zolta Identity v1 deployment. Configure the repository's `ZOLTA_IDENTITY_CONTRACT_*` secrets before enabling that workflow; the normal pull-request suite is hermetic and needs no real credentials.

The publish workflow uses npm trusted publishing. Before the first release, create the public npm package and configure its trusted publisher for this GitHub repository. Tag `vX.Y.Z` to build, test, and publish with provenance.
