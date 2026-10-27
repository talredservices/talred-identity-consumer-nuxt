import { createError, getHeader, getRequestURL, type H3Event } from 'h3'

export function requireIdentityCsrf(event: H3Event, callbackUrl: string): void {
  const origin = getHeader(event, 'origin')
  if (origin !== new URL(callbackUrl).origin || getHeader(event, 'x-talred-identity') !== '1'
    || !getHeader(event, 'content-type')?.startsWith('application/json')
    || getRequestURL(event).origin !== origin) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid authentication request origin.' })
  }
}
