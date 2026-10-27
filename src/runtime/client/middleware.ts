import { defineNuxtRouteMiddleware, navigateTo, useRequestFetch } from 'nuxt/app'
import { identityConsumerRoute } from './routes.js'

/**
 * Returns an opt-in Nuxt route middleware. Register it per protected page or
 * layout; the module intentionally never installs a global auth guard.
 */
export function createTalredIdentityRouteMiddleware(application: string, options: { redirect?: string } = {}) {
  return defineNuxtRouteMiddleware(async (to) => {
    const eventFetch = useRequestFetch()
    const session = await eventFetch<{ user: unknown | null }>(identityConsumerRoute(application, 'session'))
    if (session.user) return

    const destination = options.redirect ?? `${to.path}${to.fullPath === to.path ? '' : to.fullPath.slice(to.path.length)}`
    return navigateTo(`${identityConsumerRoute(application, 'authorize')}?returnTo=${encodeURIComponent(destination)}`, { external: true })
  })
}
