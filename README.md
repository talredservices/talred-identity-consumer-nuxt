# Zolta Identity Consumer for Nuxt

Server-side hosted-auth consumer for [Zolta Identity](https://github.com/zoltasoft/zolta-identity). It gives a Nuxt application a small BFF surface: it starts hosted login, validates the callback state, exchanges the one-time handoff code with a confidential client, and keeps refresh tokens in an encrypted HTTP-only session cookie.

This is deliberately an authentication integration, not a UI kit. It does not install a dashboard, user menu, login page, global middleware, or domain authorization policy.

> **Beta status:** `0.1.0-beta.8` supports the Zolta Identity API v1 hosted-auth contract. Expect small API changes before `1.0`; pin the beta version in production and read the changelog before upgrading.

## Install

```bash
pnpm add @zoltasoft/identity-consumer-nuxt
```

## Configure one deployed consumer

Create a Zolta Identity **project**, a confidential **client**, and a hosted **application** in the Identity console. The registered client callback URL and the Nuxt configuration below must match exactly.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@zoltasoft/identity-consumer-nuxt'],

  zoltaIdentityConsumer: {
    routePrefix: '/api/identity', // optional; this is the default
  },

  runtimeConfig: {
    zoltaIdentity: {
      sessionSecret: '',
      applications: {
        documentStudio: {
          identityApiUrl: '',
          hostedAuthUrl: '',
          clientId: '',
          clientSecret: '',
          hostedApplication: 'document-studio',
          callbackUrl: 'https://studio.example.com/api/identity/document-studio/auth/callback',
          sessionCookie: 'zolta-document-studio-session',
          defaultRedirect: '/document-studio',
          logoutRedirect: '/auth/login',
          sandboxApplication: 'documentStudioSandbox',
          features: {
            demoAccount: true,
          },
        },
        documentStudioSandbox: {
          identityApiUrl: '',
          hostedAuthUrl: '',
          clientId: '',
          clientSecret: '',
          hostedApplication: 'document-studio',
          callbackUrl: 'https://studio.example.com/api/identity/document-studio/auth/callback',
        },
      },
    },
  },
})
```

Declare every application key in `nuxt.config.ts`, then supply all sensitive deployment values through environment variables (or your secret manager). Nuxt resolves the nested key as follows:

```dotenv
NUXT_ZOLTA_IDENTITY_SESSION_SECRET=<unique-32+-character-secret>
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_IDENTITY_API_URL=https://identity-api.example.com
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_HOSTED_AUTH_URL=https://identity.example.com
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_CLIENT_ID=<confidential-client-id>
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_CLIENT_SECRET=<confidential-client-secret>
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_HOSTED_APPLICATION=document-studio
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_CALLBACK_URL=https://studio.example.com/api/identity/document-studio/auth/callback
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SESSION_COOKIE=zolta-document-studio-session
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_DEFAULT_REDIRECT=/document-studio
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_LOGOUT_REDIRECT=/auth/login
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_APPLICATION=documentStudioSandbox
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_FEATURES_DEMO_ACCOUNT=true
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_IDENTITY_API_URL=https://identity-api.example.com
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_HOSTED_AUTH_URL=https://identity.example.com
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_CLIENT_ID=<sandbox-confidential-client-id>
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_CLIENT_SECRET=<sandbox-confidential-client-secret>
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_HOSTED_APPLICATION=document-studio
NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_CALLBACK_URL=https://studio.example.com/api/identity/document-studio/auth/callback
```

`runtimeConfig.zoltaIdentity` is private by default. Do **not** place it under `runtimeConfig.public`, expose it through `app.config`, or prefix secrets with `NUXT_PUBLIC_`.

Use one confidential client and one consumer session secret per deployed application/environment. For example, production and staging should have separate client secrets. The hosted application record is public presentation/routing metadata; the confidential client is the credential held by the app's server. `IDENTITY_HOSTED_APPLICATIONS_TOKEN` belongs only to the Zolta Identity host and API deployments—consumer Nuxt apps do not need it.

## Optional sandbox demos

To offer the hosted **Create instant demo account** action, create a separate
sandbox project and a dedicated sandbox BFF client in the Identity Console.
Link that client in the hosted application's **Sandbox client ID** field. Add a
second application configuration and set the live configuration's
`sandboxApplication` to its key, then explicitly enable
`features.demoAccount` on the live application, as shown above. The feature is
disabled by default and is carried to hosted Identity through a short-lived,
client-authenticated authorization intent. Both BFF configurations must
use the exact callback URL registered on the hosted application. The module
also rejects reused live client IDs or secrets and mismatched hosted-application
keys before redirecting to hosted authentication. The module
uses the callback's connection binding to exchange and refresh sandbox tokens
with the sandbox client while preserving one normal consumer session.

## Routes

For an application named `document-studio`, the module registers these no-store BFF endpoints:

| Route | Purpose |
| --- | --- |
| `GET /api/identity/document-studio/auth/authorize` | Stores a state transaction then redirects to hosted auth. |
| `GET /api/identity/document-studio/auth/callback` | Validates state, exchanges the handoff code, and redirects locally. |
| `GET /api/identity/document-studio/auth/session` | Returns only the public user profile or `null`. |
| `POST /api/identity/document-studio/auth/logout` | Creates a one-time hosted logout handoff, revokes remote access when possible, clears the local session, and returns the hosted `redirectUrl`. |
| `GET /api/identity/document-studio/account/authorize` | Requires an existing Identity session, creates a short-lived one-time account-portal intent, then redirects to the hosted account authentication page before settings. |
| `GET /api/identity/document-studio/account/logout` | Clears the consumer session and begins a new hosted sign-in flow after account-portal logout. |

Use the account route only for an authenticated user's **Manage identity** action. The opaque intent is issued and consumed by Identity; consumers never sign or validate it, and no access or refresh token is placed in the browser URL.

`useZoltaIdentity(...).logout(returnTo)` performs the complete browser flow. `returnTo` must be a local path; Identity combines it with the hosted application's registered `application_url` after consuming the short-lived, single-use intent.

## Client API

`useZoltaIdentity` is the recommended application-bound client facade. It adds
public session state, safe login navigation, logout, and account-portal
navigation on top of the low-level `useZoltaIdentitySession` composable.

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

When `loginPath` is omitted, `login()` navigates directly to the module's BFF
authorization endpoint. Set it when the host needs a localized interstitial
route, product-specific context, analytics, or another host-owned step before
hosted authentication.

The facade accepts these account sections:

- `profile`, `sessions`, and `privacy` open the hosted profile tab.
- `password` and `security` open the hosted security tab.

Use `useZoltaIdentitySession` when a host needs only the low-level public
session resource and wants to own all navigation itself:

Start login from a page, component, or server route:

```vue
<script setup lang="ts">
const identity = useZoltaIdentitySession('document-studio')
</script>

<template>
  <NuxtLink :to="identity.authorize('/document-studio')">Sign in</NuxtLink>
</template>
```

### Authenticated fetch and expired sessions

`useZoltaIdentityFetch` wraps Nuxt request fetching and applies one consistent
response policy: a browser-side `401` clears the consumer session and begins a
new login. Other errors are rethrown unchanged.

```ts
const { csrf, headerName } = useCsrf()

const authenticatedFetch = useZoltaIdentityFetch('document-studio', {
  defaultRedirect: '/document-studio',
  loginPath: '/auth/login',
  logoutHeaders: () => ({ [headerName]: csrf }),
})

const documents = await authenticatedFetch<Document[]>('/api/documents')
```

This is useful for application BFF calls where an expired Identity session
should return the user to authentication. It does not add authorization
headers or CSRF headers to the requested operation. The host must still attach
its own CSRF header to protected mutations.

For custom transports, use `useZoltaIdentityUnauthorizedHandler` directly:

```ts
const unauthorized = useZoltaIdentityUnauthorizedHandler('document-studio', {
  defaultRedirect: '/document-studio',
  loginPath: '/auth/login',
})

try {
  await customClient.request('/documents')
} catch (error) {
  await unauthorized.handle(error)
  throw error
}
```

### Redirects and hosted intents

The module auto-imports two pure helpers for hosts that expose routes such as
`/auth/[action]`:

```ts
const intent = resolveIdentityAuthIntent(String(route.params.action))
// login | register | forgot-password | reset-password | null

const returnTo = resolveIdentityRedirect(route.query.redirect, '/dashboard')
```

`resolveIdentityRedirect` accepts only local absolute paths. Use it before
placing user-controlled route or query values into an authentication flow.

Protect selected routes without installing a global guard:

```ts
// app/middleware/require-document-studio-auth.ts
export default createZoltaIdentityRouteMiddleware('document-studio')
```

```ts
definePageMeta({ middleware: ['require-document-studio-auth'] })
```

## Server API

`useServerIdentity` binds the current H3 event and one configured application,
which avoids repeating the application name across a BFF handler or service:

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

The facade provides:

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

The original server functions remain available for focused utilities and
backward compatibility. For example, a protected BFF endpoint can read the token
only on the Nuxt server:

```ts
import { identityAccessToken, requireIdentityUser } from '@zoltasoft/identity-consumer-nuxt/runtime'

export default defineEventHandler(async (event) => {
  const user = await requireIdentityUser(event, 'document-studio')
  const token = await identityAccessToken(event, 'document-studio')
  // Call the application service with `Authorization: Bearer ${token}`.
  return { user }
})
```

### Authenticated Zolta API client

Use `createIdentityApiClient` when a BFF talks to an API protected by the same
Zolta Identity application. It combines the generic
`@zoltasoft/api-client` transport with the consumer session: it attaches the
current bearer token, refreshes an expired session after the first `401`, and
retries the request once. If refresh fails, it clears the local Identity
session. API failures remain typed `ZoltaApiError` values.

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

Set `requireAuthentication: false` for an endpoint that accepts anonymous
requests but should attach the current access token when one exists. The
generic transport is intentionally a separate package: use
`@zoltasoft/api-client` directly when no Zolta Identity session is involved.

## Authentication flows and use cases

### Hosted sign-in or registration

1. The host calls `identity.login(returnTo, intent)` or sends the browser to
   the registered `auth/authorize` BFF route.
2. The consumer creates a random state transaction in an encrypted HTTP-only
   cookie and redirects to the configured hosted application.
3. Identity authenticates or registers the user and returns a short-lived
   handoff code to the consumer callback.
4. The consumer validates state, exchanges the code with its confidential
   client, stores tokens server-side, and redirects to the validated local
   `returnTo` path.
5. Browser code receives only the public user through `refresh()` or the
   session endpoint.

Use this flow for sign-in, account creation, password recovery, and email/token
handoffs while keeping credentials and tokens outside the browser.

### Calling an upstream application API

1. A browser component calls the host's Nuxt BFF route.
2. The BFF creates `createIdentityApiClient(event, application, options)` (or
   uses `useServerIdentity` for a custom transport).
3. The consumer refreshes an expired access token with the confidential
   client when necessary. A rejected token is refreshed and retried once.
4. The BFF forwards the authenticated request to the protected Zolta API and
   returns an application-shaped response to the browser.

Use `accessToken()` for protected operations and `optionalAccessToken()` for
pages that support both anonymous and authenticated responses.

### Hosted account management

1. An authenticated user selects **Manage identity** in the host.
2. `openAccountPortal()` enters the consumer account authorization route.
3. The consumer proves the current Identity session to the API and requests a
   short-lived, single-use portal intent.
4. The browser is sent through hosted account authentication before entering
   profile or security settings.

Use this instead of linking directly to the account UI. Hosts remain
responsible for deciding whether temporary, sandbox, or restricted users may
enter account management.

### Session expiration and logout

For normal logout, the consumer attempts remote token revocation and always
clears its encrypted session. For an expired browser session,
`useZoltaIdentityFetch` can centralize the host's `401` recovery and redirect
policy. Domain authorization failures such as `403` are never converted into
login redirects.

### Sandbox demo sessions

The hosted callback identifies whether the handoff uses the primary or sandbox
connection. The consumer stores that binding and uses the matching confidential
client for exchanges, refreshes, and logout. Hosts still own demo policy: they
may hide account-management actions, block portal routes, display expiration
notices, or limit domain operations for temporary users.

## Client and server import boundaries

- Import Nitro helpers from `@zoltasoft/identity-consumer-nuxt/runtime`.
- Import client composables explicitly from
  `@zoltasoft/identity-consumer-nuxt/runtime/client`, or use the Nuxt
  auto-imports registered by the module.
- Do not import `runtime/client` from server routes or server utilities.

Keeping this boundary prevents Vue application aliases such as `nuxt/app` and
`#build` from entering the Nitro server bundle.

## Local package development

An adjacent Nuxt host can test an unpublished consumer build directly:

```json
{
  "dependencies": {
    "@zoltasoft/api-client": "file:../api-client",
    "@zoltasoft/identity-consumer-nuxt": "file:../zolta-identity-consumer-nuxt"
  }
}
```

After changing the consumer, run `pnpm build` in this repository and refresh
the dependency in the host. Run both applications with their supported Node
version so native host dependencies are rebuilt for the correct runtime.

If your host protects POST requests with CSRF middleware, configure
`logoutHeaders` on `useZoltaIdentity`, or pass `{ headers }` to the low-level
`useZoltaIdentitySession().logout()` method. The package does not silently
weaken the host's CSRF policy.

## Security model

- The client secret, handoff code exchange, refresh token, and access token remain on the Nuxt server.
- Authentication state is random, bound to an HTTP-only transaction cookie, expires after ten minutes, and is cleared after one callback attempt.
- Sessions are encrypted with `zoltaIdentity.sessionSecret`, use `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Redirect targets are restricted to local paths. Protocol-relative and backslash-based values are rejected.
- Production rejects non-local HTTP identity and callback URLs.
- Account-management redirects use an Identity-issued, short-lived, single-use portal intent. A direct account URL is rejected by the hosted portal when its entry authorization is absent.

The module supports the Zolta Identity API v1 handoff, refresh, and logout contract. Treat that API version as the compatibility boundary; a breaking protocol change will be released as a new major module version.

See [SECURITY.md](./SECURITY.md) for responsible disclosure and deployment responsibilities.

## Contract fixture

`fixtures/contract-app` is a minimal Nuxt host app. It is used by the real-contract workflow against a disposable Zolta Identity v1 deployment. Configure the repository's `ZOLTA_IDENTITY_CONTRACT_*` secrets before enabling the workflow. The normal pull-request suite is hermetic and never needs real credentials.

## Release

The publish workflow uses npm trusted publishing. Before the first release, create the public npm package and configure its trusted publisher for this GitHub repository. Tag a release as `vX.Y.Z`; the workflow builds, tests, and publishes with provenance.
