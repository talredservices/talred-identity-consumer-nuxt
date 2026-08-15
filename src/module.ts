import { addImports, addServerHandler, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from '@nuxt/schema'
import { z } from 'zod'

export type ZoltaIdentityConsumerModuleOptions = {
  /** Prefix for the module's server-side BFF routes. */
  routePrefix?: string
}

const optionsSchema = z.object({
  routePrefix: z.string().regex(/^\/[a-z0-9/_-]*[a-z0-9_-]$/i).default('/api/identity'),
})

const zoltaIdentityConsumerModule: NuxtModule<ZoltaIdentityConsumerModuleOptions> = defineNuxtModule<ZoltaIdentityConsumerModuleOptions>({
  meta: {
    name: '@zoltasoft/identity-consumer-nuxt',
    configKey: 'zoltaIdentityConsumer',
    compatibility: { nuxt: '^3.15.0 || ^4.0.0' },
  },
  defaults: {
    routePrefix: '/api/identity',
  },
  setup(rawOptions, nuxt) {
    const options = optionsSchema.parse(rawOptions)
    const resolver = createResolver(import.meta.url)
    const route = (suffix: string) => `${options.routePrefix}${suffix}`

    nuxt.options.runtimeConfig.zoltaIdentity ??= {
      sessionSecret: '',
      applications: {},
    }
    nuxt.options.runtimeConfig.public.zoltaIdentityConsumer = {
      ...(nuxt.options.runtimeConfig.public.zoltaIdentityConsumer as Record<string, unknown> | undefined),
      routePrefix: options.routePrefix,
    }
    addServerHandler({ route: route('/:application/auth/authorize'), handler: resolver.resolve('./runtime/server/api/authorize.get') })
    addServerHandler({ route: route('/:application/auth/callback'), handler: resolver.resolve('./runtime/server/api/callback.get') })
    addServerHandler({ route: route('/:application/auth/session'), handler: resolver.resolve('./runtime/server/api/session.get') })
    addServerHandler({ route: route('/:application/auth/logout'), handler: resolver.resolve('./runtime/server/api/logout.post') })
    addServerHandler({ route: route('/:application/account/authorize'), handler: resolver.resolve('./runtime/server/api/account-authorize.get') })
    addServerHandler({ route: route('/:application/account/logout'), handler: resolver.resolve('./runtime/server/api/account-logout.get') })

    addImports([
      { name: 'useZoltaIdentitySession', from: resolver.resolve('./runtime/client/session') },
      { name: 'useZoltaIdentity', from: resolver.resolve('./runtime/client/identity') },
      { name: 'useZoltaIdentityFetch', from: resolver.resolve('./runtime/client/identity') },
      { name: 'useZoltaIdentityUnauthorizedHandler', from: resolver.resolve('./runtime/client/identity') },
      { name: 'resolveIdentityRedirect', from: resolver.resolve('./runtime/client/identity') },
      { name: 'resolveIdentityAuthIntent', from: resolver.resolve('./runtime/client/identity') },
      { name: 'createZoltaIdentityRouteMiddleware', from: resolver.resolve('./runtime/client/middleware') },
    ])
  },
})

export default zoltaIdentityConsumerModule
