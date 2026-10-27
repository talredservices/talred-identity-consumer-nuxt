import { addImports, addServerHandler, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import { z } from 'zod'

export type TalredIdentityConsumerModuleOptions = {
  /** Prefix for the module's server-side BFF routes. */
  routePrefix?: string
}

const optionsSchema = z.object({
  routePrefix: z.string().regex(/^\/[a-z0-9/_-]*[a-z0-9_-]$/i).default('/api/identity'),
})

const talredIdentityConsumerModule: NuxtModule<TalredIdentityConsumerModuleOptions> = defineNuxtModule<TalredIdentityConsumerModuleOptions>({
  meta: {
    name: '@talred/identity-consumer-nuxt',
    configKey: 'talredIdentityConsumer',
    compatibility: { nuxt: '^3.15.0 || ^4.0.0' },
  },
  defaults: {
    routePrefix: '/api/identity',
  },
  setup(rawOptions, nuxt) {
    const options = optionsSchema.parse(rawOptions)
    const resolver = createResolver(import.meta.url)
    const route = (suffix: string) => `${options.routePrefix}${suffix}`

    const serverIdentityConfig = nuxt.options.runtimeConfig.talredIdentity as { applications?: Record<string, { logoutRedirect?: unknown }> } | undefined
    const configuredApplications = serverIdentityConfig?.applications
    const existingPublicConfig = nuxt.options.runtimeConfig.public.talredIdentityConsumer as { applications?: Record<string, { logoutRedirect?: unknown }> } | undefined
    const existingPublicApplications = existingPublicConfig?.applications ?? {}
    const applicationNames = new Set([...Object.keys(configuredApplications ?? {}), ...Object.keys(existingPublicApplications)])
    const publicApplications = Object.fromEntries([...applicationNames].map((name) => {
      const publicLogoutRedirect = existingPublicApplications[name]?.logoutRedirect
      const configuredLogoutRedirect = configuredApplications?.[name]?.logoutRedirect
      return [name, {
        logoutRedirect: typeof publicLogoutRedirect === 'string'
          ? publicLogoutRedirect
          : typeof configuredLogoutRedirect === 'string' ? configuredLogoutRedirect : '/',
      }]
    }))

    nuxt.options.runtimeConfig.talredIdentity ??= {
      sessionSecret: '',
      applications: {},
    }
    nuxt.options.runtimeConfig.public.talredIdentityConsumer = {
      ...(nuxt.options.runtimeConfig.public.talredIdentityConsumer as Record<string, unknown> | undefined),
      routePrefix: options.routePrefix,
      applications: publicApplications,
    }
    addServerHandler({ route: route('/:application/operations/:operation'), method: 'post', handler: resolver.resolve('./runtime/server/api/operation.post') })
    addServerHandler({ route: route('/:application/auth/authorize'), handler: resolver.resolve('./runtime/server/api/authorize.get') })
    addServerHandler({ route: route('/:application/auth/callback'), handler: resolver.resolve('./runtime/server/api/callback.get') })
    addServerHandler({ route: route('/:application/auth/session'), handler: resolver.resolve('./runtime/server/api/session.get') })
    addServerHandler({ route: route('/:application/auth/logout'), handler: resolver.resolve('./runtime/server/api/logout.post') })
    addServerHandler({ route: route('/:application/account/authorize'), handler: resolver.resolve('./runtime/server/api/account-authorize.get') })
    addServerHandler({ route: route('/:application/account/logout'), handler: resolver.resolve('./runtime/server/api/account-logout.get') })

    addImports([
      { name: 'useTalredIdentityOperations', from: resolver.resolve('./runtime/client/operations') },
      { name: 'useTalredIdentitySession', from: resolver.resolve('./runtime/client/session') },
      { name: 'useTalredIdentity', from: resolver.resolve('./runtime/client/identity') },
      { name: 'useTalredIdentityFetch', from: resolver.resolve('./runtime/client/identity') },
      { name: 'useTalredIdentityUnauthorizedHandler', from: resolver.resolve('./runtime/client/identity') },
      { name: 'resolveIdentityRedirect', from: resolver.resolve('./runtime/client/identity') },
      { name: 'resolveIdentityAuthIntent', from: resolver.resolve('./runtime/client/identity') },
      { name: 'createTalredIdentityRouteMiddleware', from: resolver.resolve('./runtime/client/middleware') },
    ])
  },
})

export default talredIdentityConsumerModule
