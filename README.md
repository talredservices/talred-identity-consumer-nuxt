# Talred Identity Consumer for Nuxt

Server-side hosted-auth consumer for the [Talred Identity project](https://github.com/talredservices/identity). It gives a Nuxt application a small BFF surface to start hosted authentication, validate its callback, exchange a one-time handoff code with a confidential client, and store refresh tokens in an encrypted HTTP-only session cookie.

This module is an authentication integration, not a UI kit. It does not install application pages, a user menu, global middleware, or domain authorization policy.

For routes, client and server APIs, authentication flows, security details, local development, and release notes, see the [detailed usage guide](./docs/usage.md).

## Install

```bash
pnpm add @talred/identity-consumer-nuxt
```

## Configure

In the Talred Identity console, create a project, a confidential client, and a hosted application. Register the callback URL shown below on that client; it must match exactly.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@talred/identity-consumer-nuxt'],

  talredIdentityConsumer: {
    routePrefix: '/api/identity', // optional; this is the default
  },

  runtimeConfig: {
    talredIdentity: {
      sessionSecret: '',
      applications: {
        documentStudio: {
          identityApiUrl: '',
          hostedAuthUrl: '',
          clientId: '',
          clientSecret: '',
          hostedApplication: 'document-studio',
          callbackUrl: 'https://studio.example.com/api/identity/document-studio/auth/callback',
          sessionCookie: 'talred-document-studio-session',
          defaultRedirect: '/document-studio',
          logoutRedirect: '/',
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

Declare each application key in `nuxt.config.ts`, then provide deployment-specific values with environment variables or a secret manager:

```dotenv
NUXT_TALRED_IDENTITY_SESSION_SECRET=<unique-32+-character-secret>
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_IDENTITY_API_URL=https://identity-api.example.com
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_HOSTED_AUTH_URL=https://identity.example.com
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_CLIENT_ID=<confidential-client-id>
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_CLIENT_SECRET=<confidential-client-secret>
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_HOSTED_APPLICATION=document-studio
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_CALLBACK_URL=https://studio.example.com/api/identity/document-studio/auth/callback
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SESSION_COOKIE=talred-document-studio-session
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_DEFAULT_REDIRECT=/document-studio
NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_LOGOUT_REDIRECT=/
NUXT_PUBLIC_TALRED_IDENTITY_CONSUMER_APPLICATIONS_DOCUMENT_STUDIO_LOGOUT_REDIRECT=/
```

`runtimeConfig.talredIdentity` is private by default. Do not expose it through `app.config` or prefix secrets with `NUXT_PUBLIC_`. The module mirrors only each application's validated local `logoutRedirect` into its public runtime config so the browser fallback matches the server-side logout destination. Set both environment variables to the same local path when overriding it.

Use a separate confidential client and session secret for every deployed application and environment. Consumer Nuxt applications do not need `IDENTITY_HOSTED_APPLICATIONS_TOKEN`; that belongs only to Talred Identity host and API deployments.

If you enable sandbox demo accounts, add the second application configuration and its corresponding `NUXT_TALRED_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_*` variables. See [sandbox demo sessions](./docs/usage.md#sandbox-demo-sessions) for the required Identity-console setup and behavior.

### Migrating from beta.14 or earlier

This release changes the public configuration and auto-import names to the Talred namespace. Rename `zoltaIdentityConsumer` to `talredIdentityConsumer`, `runtimeConfig.zoltaIdentity` to `runtimeConfig.talredIdentity`, and every `NUXT_ZOLTA_IDENTITY_*` variable to `NUXT_TALRED_IDENTITY_*`. Also rename `useZoltaIdentity*`, `createZoltaIdentityRouteMiddleware`, and `ZoltaIdentity*` type references to their `Talred` equivalents. The package does not read the old configuration names. Update deployment environment variable names while retaining their existing secret values. The default session cookie prefix changes from `zolta-identity-` to `talred-identity-`; users will establish new sessions after rollout unless you explicitly keep an existing cookie name with `sessionCookie`.

## Application-owned pages (app mode)

Keep existing applications in `mode: 'hosted'` until their cutover gate passes.
To use local forms, configure the same private application entry with:

```ts
{
  mode: 'app',
  identityApiUrl: 'https://identity-api.example.com',
  clientId: '',
  clientSecret: '', // deployment secret; server only
  hostedApplication: 'tasks-demo', // preserved stable application key
  callbackUrl: 'https://tasks.example.com/api/identity/projects/auth/callback',
  pages: {
    login: '/projects/auth/login',
    register: '/projects/auth/register',
    forgotPassword: '/projects/auth/forgot-password',
    resetPassword: '/projects/auth/reset-password',
    verification: '/projects/auth/verify',
    account: '/projects/account',
  },
}
```

Register the application origin, exact BFF callback, password reset page and
approved policy revision in Identity. App mode does not require `hostedAuthUrl`.
Identity must provide the additive account and Google contracts before cutover.

`useTalredIdentityOperations('projects', csrfHeaders)` exposes typed login,
registration, recovery/reset, verification, Google, profile/password, sessions,
export, deletion and reauthentication methods. `csrfHeaders` supplies any CSRF
header required by the host (for example `useCsrf()`). Operations use JSON POSTs
under `/api/identity/projects/operations/:operation`, require the same origin and
add `X-Talred-Identity: 1`. The package renders no UI. Forms, translations, legal
links and navigation belong to the consuming app.

Handle `verification_required` by showing the local verification page. Pending
sessions cannot obtain a product API token through the server facade. Handle
`reauthentication_required` by verifying the current password for the requested
operation, or starting Google with `sensitive_operation`. Google state and
one-time handoffs are validated by the BFF; fresh-authentication grants stay in
its encrypted session. A provider account switch is rejected. Sensitive actions
consume their grant once; request a new grant after an unsuccessful mutation.

`login()` and `openAccountPortal()` resolve to local pages in app mode. Logout
revokes the current Identity session and clears the app cookie. In hosted mode,
the account portal returns to the configured local logout destination after sign-out
instead of starting a new login flow.

## Next steps

- [Use the registered BFF routes and client composables](./docs/usage.md#routes)
- [Protect server routes and call an authenticated API](./docs/usage.md#server-api)
- [Review security and deployment responsibilities](./docs/usage.md#security-model)

See [SECURITY.md](./SECURITY.md) for responsible disclosure.
