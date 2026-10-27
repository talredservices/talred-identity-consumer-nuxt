export default defineNuxtConfig({
  modules: ['../..'],
  runtimeConfig: {
    talredIdentity: {
      sessionSecret: process.env.NUXT_TALRED_IDENTITY_SESSION_SECRET ?? '',
      applications: {
        contractApp: {
          identityApiUrl: process.env.NUXT_TALRED_IDENTITY_APPLICATIONS_CONTRACT_APP_IDENTITY_API_URL ?? '',
          hostedAuthUrl: process.env.NUXT_TALRED_IDENTITY_APPLICATIONS_CONTRACT_APP_HOSTED_AUTH_URL ?? '',
          clientId: process.env.NUXT_TALRED_IDENTITY_APPLICATIONS_CONTRACT_APP_CLIENT_ID ?? '',
          clientSecret: process.env.NUXT_TALRED_IDENTITY_APPLICATIONS_CONTRACT_APP_CLIENT_SECRET ?? '',
          hostedApplication: process.env.NUXT_TALRED_IDENTITY_APPLICATIONS_CONTRACT_APP_HOSTED_APPLICATION ?? 'contract-app',
          callbackUrl: process.env.NUXT_TALRED_IDENTITY_APPLICATIONS_CONTRACT_APP_CALLBACK_URL ?? 'http://127.0.0.1:3400/api/identity/contract-app/auth/callback',
          defaultRedirect: '/',
        },
      },
    },
  },
})
