import { useRuntimeConfig } from 'nuxt/app'

export function identityConsumerRoute(application: string, suffix: string): string {
  const config = useRuntimeConfig().public.zoltaIdentityConsumer as { routePrefix?: string } | undefined
  const prefix = config?.routePrefix ?? '/api/identity'
  return `${prefix}/${encodeURIComponent(application)}/auth/${suffix}`
}

export function identityAccountRoute(application: string, suffix: string): string {
  const config = useRuntimeConfig().public.zoltaIdentityConsumer as { routePrefix?: string } | undefined
  const prefix = config?.routePrefix ?? '/api/identity'
  return `${prefix}/${encodeURIComponent(application)}/account/${suffix}`
}
