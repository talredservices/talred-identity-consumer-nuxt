# Zolta Identity Consumer for Nuxt

Server-side hosted-auth consumer for the [Zolta Identity project](https://github.com/zoltasoft/zolta-identity). It gives a Nuxt application a small BFF surface to start hosted authentication, validate its callback, exchange a one-time handoff code with a confidential client, and store refresh tokens in an encrypted HTTP-only session cookie.

This module is an authentication integration, not a UI kit. It does not install application pages, a user menu, global middleware, or domain authorization policy.

For routes, client and server APIs, authentication flows, security details, local development, and release notes, see the [detailed usage guide](./docs/usage.md).

## Install

```bash
pnpm add @zoltasoft/identity-consumer-nuxt
```

## Configure

In the Zolta Identity console, create a project, a confidential client, and a hosted application. Register the callback URL shown below on that client; it must match exactly.

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

Declare each application key in `nuxt.config.ts`, then provide deployment-specific values with environment variables or a secret manager:

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
```

`runtimeConfig.zoltaIdentity` is private by default. Do not put it under `runtimeConfig.public`, expose it through `app.config`, or prefix secrets with `NUXT_PUBLIC_`.

Use a separate confidential client and session secret for every deployed application and environment. Consumer Nuxt applications do not need `IDENTITY_HOSTED_APPLICATIONS_TOKEN`; that belongs only to Zolta Identity host and API deployments.

If you enable sandbox demo accounts, add the second application configuration and its corresponding `NUXT_ZOLTA_IDENTITY_APPLICATIONS_DOCUMENT_STUDIO_SANDBOX_*` variables. See [sandbox demo sessions](./docs/usage.md#sandbox-demo-sessions) for the required Identity-console setup and behavior.

## Next steps

- [Use the registered BFF routes and client composables](./docs/usage.md#routes)
- [Protect server routes and call an authenticated API](./docs/usage.md#server-api)
- [Review security and deployment responsibilities](./docs/usage.md#security-model)

See [SECURITY.md](./SECURITY.md) for responsible disclosure.
