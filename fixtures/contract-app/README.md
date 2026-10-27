# Real Talred Identity contract fixture

This is a deliberately tiny Nuxt host. It uses the published module exactly as a consuming application does. The contract environment must provision a disposable Talred Identity API v1 project with:

- hosted application key `contract-app`;
- one enabled confidential client whose callback is `http://127.0.0.1:3400/api/identity/contract-app/auth/callback` (or the configured equivalent);
- a non-temporary test user or supported test login mechanism.

The GitHub workflow passes deployment values through repository environment secrets. It must never use a production client secret or user account. The handoff journey is intentionally tested against the real protocol rather than mocked by this package.
