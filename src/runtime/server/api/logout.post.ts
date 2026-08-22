import { createError, defineEventHandler, getRouterParam, readBody, setResponseHeader } from 'h3'
import { beginIdentityLogout } from '../identity.js'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const application = getRouterParam(event, 'application')
  if (!application) throw createError({ statusCode: 400, statusMessage: 'An Identity application is required.' })
  const body: { returnTo?: string } = (await readBody<{ returnTo?: string }>(event).catch(() => undefined)) ?? {}
  return { redirectUrl: await beginIdentityLogout(event, application, body.returnTo) }
})
