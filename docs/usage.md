# Detailed usage

This guide is the detailed reference for the Talred Identity Nuxt consumer. See the [README](../README.md) for installation and configuration.

## Application-owned authentication

Version `0.1.0-beta.15` adds explicit `mode: 'app'`. Configure local login, registration, recovery, reset, verification and account pages as shown in the README. Identity must expose the additive application/account/Google contracts before selecting this mode. Keep existing consumers in hosted mode until their verification gate passes.

`POST /api/identity/:application/operations/:operation` accepts the closed operation set: `context`, `login`, `register`, `recovery`, `reset`, `verify`, `resend`, `google`, `profile`, `password`, `sessions`, `revoke`, `export`, `delete`, and `reauthenticate`. Use `useTalredIdentityOperations(application, csrfHeaders)` instead of calling Identity from the browser. Requests require same-origin JSON with `X-Talred-Identity: 1`, plus the host's configured CSRF protection.

Responses include flow status (`authenticated`, `verification_required`, `reauthentication_required`, or `completed`) and public data. Access/refresh tokens, confidential credentials, development recovery codes and reauthentication grants remain server-side. Verification-pending sessions cannot authorize protected product operations.

Sensitive profile, password, export and shared-account deletion operations require a five-minute, single-use grant for that operation. Password reauthentication verifies the same signed-in identity; Google fresh authentication returns its result through the registered BFF callback without replacing the consumer session. Apps must explain that shared-account deletion affects other applications in the same Identity installation.

In app mode, login/account navigation stays local. Logout revokes the current application session and clears its encrypted cookie. The hosted account/logout GET adapter is disabled in app mode. The hosted routes below remain compatibility behavior for `mode: 'hosted'`.

## Sandbox demo sessions

To show hosted **Create instant demo account**, create a separate sandbox project and a dedicated sandbox BFF client in the Talred Identity console. Set that client as the hosted application's **Sandbox client ID**, configure it as a second consumer application, set the live application's `sandboxApplication` to its key, and enable `features.demoAccount` on the live application.

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
| `GET /api/identity/document-studio/account/logout` | Clears the consumer session and redirects to the application's configured local logout destination. |

Use the account route only for an authenticated user's **Manage identity** action. Identity issues and consumes the opaque portal intent; consumers do not sign or validate it, and tokens never enter the browser URL. After the user signs out in the hosted account portal, the BFF clears the consumer session and sends them to the application’s validated `logoutRedirect` (default `/`). It does not start another sign-in flow. The destination comes from server configuration; the account-portal adapter does not accept a browser-supplied URL.

## Client API

`useTalredIdentity` is the recommended application-bound client facade. It supplies public session state, safe login navigation, logout, and account-portal navigation on top of the lower-level `useTalredIdentitySession` composable.

```ts
const { csrf, headerName } = useCsrf()

const identity = useTalredIdentity('document-studio', {
  defaultRedirect: '/document-studio',
  loginPath: '/auth/login', // optional host-owned interstitial page
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

Set `logoutRedirect` on the matching server-side application entry in `runtimeConfig.talredIdentity.applications`. The module exposes only that local path through `runtimeConfig.public.talredIdentityConsumer.applications` so a failed logout handoff can still return the browser to the app. An explicit `logoutRedirect` client option overrides the configured default. When runtime environment variables override the destination, set both the server `NUXT_TALRED_IDENTITY_APPLICATIONS_<APP>_LOGOUT_REDIRECT` and public `NUXT_PUBLIC_TALRED_IDENTITY_CONSUMER_APPLICATIONS_<APP>_LOGOUT_REDIRECT` values to the same path.

Without `loginPath`, `login()` goes straight to the BFF authorization endpoint. Use it when the host needs a localized interstitial page, product context, analytics, or another host-owned step before hosted authentication.

- `profile`, `sessions`, and `privacy` open the hosted profile tab.
- `password` and `security` open the hosted security tab.

Use `useTalredIdentitySession` when the host owns navigation itself:

```vue
<script setup lang="ts">
const identity = useTalredIdentitySession('document-studio')
</script>

<template>
  <NuxtLink :to="identity.authorize('/document-studio')">Sign in</NuxtLink>
</template>
```

### Authenticated fetch and expired sessions

`useTalredIdentityFetch` applies one response policy: a browser-side `401` clears the consumer session and starts a new login. Other errors are rethrown.

```ts
const authenticatedFetch = useTalredIdentityFetch('document-studio', {
  defaultRedirect: '/document-studio',
  loginPath: '/auth/login',
})

const documents = await authenticatedFetch<Document[]>('/api/documents')
```

It does not add authorization or CSRF headers to requests. The host must still attach any CSRF header required for protected mutations. For a custom transport, use `useTalredIdentityUnauthorizedHandler` and call `await unauthorized.handle(error)` in the error path.

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
export default createTalredIdentityRouteMiddleware('document-studio')
```

```ts
definePageMeta({ middleware: ['require-document-studio-auth'] })
```

## Server API

`useServerIdentity` binds the current H3 event and one configured application:

```ts
import { useServerIdentity } from '@talred/identity-consumer-nuxt/runtime'

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
import { identityAccessToken, requireIdentityUser } from '@talred/identity-consumer-nuxt/runtime'

export default defineEventHandler(async (event) => {
  const user = await requireIdentityUser(event, 'document-studio')
  const token = await identityAccessToken(event, 'document-studio')
  return { user }
})
```

### Authenticated Talred API client

Use `createIdentityApiClient` when a BFF talks to an API protected by the same Talred Identity application. It attaches the current bearer token, refreshes an expired session after the first `401`, and retries once. If refresh fails, it clears the local session. API failures remain typed `TalredApiError` values.

```ts
import { createIdentityApiClient } from '@talred/identity-consumer-nuxt/runtime'

export default defineEventHandler(async (event) => {
  const api = await createIdentityApiClient(event, 'document-studio', {
    baseURL: useRuntimeConfig(event).talredApiUrl,
    internalToken: useRuntimeConfig(event).internalServiceToken,
  })

  return api('/v1/documents')
})
```

Set `requireAuthentication: false` for an anonymous endpoint that should send the current access token when a session exists. Use `@talred/api-client` directly when no Talred Identity session is involved.

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
4. The BFF forwards the authenticated request to the protected Talred API and returns an application-shaped response.

Use `accessToken()` for protected operations and `optionalAccessToken()` for endpoints that can serve anonymous users.

### Hosted account management

1. An authenticated user selects **Manage identity**.
2. `openAccountPortal()` enters the consumer account authorization route.
3. The consumer proves the current Identity session and requests a short-lived, single-use portal intent.
4. The browser goes through hosted account authentication before profile or security settings.

Use this flow instead of linking directly to the account UI. Hosts decide whether temporary, sandbox, or restricted users can enter account management.

### Session expiration and logout

Normal logout attempts remote token revocation and always clears the encrypted session. The default destination comes from the validated per-application `logoutRedirect`; callers may supply a validated local `returnTo` for a deliberate alternate destination. `useTalredIdentityFetch` can centralize recovery from expired browser sessions. Domain authorization failures, including `403`, are never converted into login redirects.

## Import boundaries

- Import Nitro helpers from `@talred/identity-consumer-nuxt/runtime`.
- Import client composables from `@talred/identity-consumer-nuxt/runtime/client`, or use the Nuxt auto-imports registered by the module.
- Do not import `runtime/client` from server routes or server utilities.

This keeps Vue aliases such as `nuxt/app` and `#build` out of the Nitro server bundle.

## Local package development

An adjacent Nuxt host can use an unpublished build directly:

```json
{
  "dependencies": {
    "@talred/api-client": "file:../talred-api-client",
    "@talred/identity-consumer-nuxt": "file:../talred-identity-consumer-nuxt"
  }
}
```

After changing the consumer, run `pnpm build` in this repository and refresh the dependency in the host. Use compatible Node versions in both applications so native dependencies are rebuilt for the correct runtime.

If the host protects POST requests with CSRF middleware, configure `logoutHeaders` on `useTalredIdentity`, or pass `{ headers }` to `useTalredIdentitySession().logout()`. The package does not weaken the host's CSRF policy.

## Security model

- Client secrets, handoff-code exchanges, refresh tokens, and access tokens stay on the Nuxt server.
- Authentication state is random, bound to an HTTP-only transaction cookie, expires after ten minutes, and is cleared after one callback attempt.
- Sessions are encrypted with `talredIdentity.sessionSecret`, use `HttpOnly`, `SameSite=Lax`, and use `Secure` in production.
- Redirect targets are limited to local paths; protocol-relative and backslash-based values are rejected.
- Production rejects non-local HTTP Identity and callback URLs.
- Account-management redirects require an Identity-issued, short-lived, single-use portal intent.

The module supports the Talred Identity API v1 handoff, refresh, and logout contract. Treat that version as the compatibility boundary; a breaking protocol change is released as a new major module version.

See [SECURITY.md](../SECURITY.md) for responsible disclosure and deployment responsibilities.

## Contract fixture and release

`fixtures/contract-app` is a minimal Nuxt host used by the real-contract workflow against a disposable Talred Identity v1 deployment. Configure the repository's `TALRED_IDENTITY_CONTRACT_*` secrets before enabling that workflow; the normal pull-request suite is hermetic and needs no real credentials.

The package is published publicly on npm. The publish workflow stages tagged releases for npm review; configure the npm trusted publisher for `talredservices/talred-identity-consumer-nuxt` and `.github/workflows/publish.yml` before relying on GitHub Actions to stage future releases. Tag `vX.Y.Z` to run the build, test, and staged-publishing workflow.
