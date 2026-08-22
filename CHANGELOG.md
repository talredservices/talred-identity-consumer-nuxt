# Changelog

All notable changes to this project are documented in this file.

## 0.1.0-beta.11 - 2026-08-22

- Add fail-closed, authorization-intent-bound demo policy with strict sandbox
  client, hosted-application, and callback validation.
- Add `createIdentityApiClient`, including one refresh-and-retry on upstream
  `401` and local session cleanup when refresh fails.
- Refresh expired access tokens before current-family logout, always clear the
  local session, and record credential-free remote revocation failures.
- Add per-application and client-side `logoutRedirect` defaults while
  preserving explicit local-path overrides.

## 0.1.0-beta.10 - 2026-08-18

- Fix logout when the generated BFF route receives an empty POST body.

## 0.1.0-beta.9 - 2026-08-18

- Make host logout revoke and clear the consumer session, then hand the browser to hosted Identity with a short-lived one-time logout intent so the hosted browser session is also terminated.

## 0.1.0-beta.8 - 2026-08-14

- Route hosted account authorization to the dedicated `/account/authenticate` entry page, keeping account settings independent from credential collection.

## 0.1.0-beta.7 - 2026-08-14

- Add the hosted-account logout handoff, which clears the consumer's encrypted session before beginning a new hosted sign-in flow.

## 0.1.0-beta.6 - 2026-08-14

- Add the authenticated hosted-account authorization route backed by Identity-issued one-time portal intents.
- Keep portal intent creation server-side and document its security boundary.

## 0.1.0-beta.5 - 2026-08-13

- Publish prereleases under npm's `beta` dist-tag.

## 0.1.0-beta.4 - 2026-08-13

- Allow tag-triggered GitHub Actions publishing from its detached checkout.

## 0.1.0-beta.3 - 2026-08-13

- Remove the application-specific environment template; configuration guidance remains in the README.
- Fix CI pnpm setup and preserve the live contract job as an opt-in environment-backed check.
- Use a trusted-publishing-compatible Node release in the npm publish workflow.

## 0.1.0-beta.2 - 2026-08-13

- Add sandbox BFF-client support for hosted instant-demo-account handoffs.
- Preserve the selected token connection for token exchange, refresh, and logout.
- Document sandbox configuration and provide environment-variable examples.

## 0.1.0-beta.1 - 2026-08-11

- First npm beta release.
- Add a TypeScript-aware ESLint 9 release gate.
- Add configuration and token-handling regression coverage.
- Document the supported security-reporting and consumer-secret handling process.

## 0.1.1 - 2026-08-10

- Fix published-runtime imports so Nuxt and Nitro APIs resolve when the module is installed from npm.

## 0.1.2 - 2026-08-10

- Keep client helpers out of the server runtime entry point so Nitro does not load Vue app imports.

## 0.1.0 - 2026-08-10

- Initial public Nuxt module for the Zolta Identity API v1 hosted-auth handoff flow.
- Server-only confidential-client exchange and refresh support.
- Named encrypted sessions, opt-in browser helpers, and opt-in route middleware.
