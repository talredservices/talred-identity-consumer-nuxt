import { createError, defineEventHandler, getQuery, getRouterParam, sendRedirect, setResponseHeader } from 'h3'
import { z } from 'zod'
import { completeIdentityAuthorization, completeIdentityProviderDenial } from '../identity.js'

const callbackSchema = z.object({
  code: z.string().min(32).max(1024),
  state: z.string().min(32).max(256),
  connection: z.enum(['primary', 'sandbox']).default('primary'),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const application = getRouterParam(event, 'application')
  if (!application) throw createError({ statusCode: 400, statusMessage: 'An Identity application is required.' })
  const rawQuery = getQuery(event)
  if (rawQuery.error === 'access_denied' && typeof rawQuery.state === 'string') {
    return sendRedirect(event, await completeIdentityProviderDenial(event, application, rawQuery.state), 302)
  }
  const query = callbackSchema.safeParse(rawQuery)
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'The Identity callback is incomplete.' })
  const destination = await completeIdentityAuthorization(event, application, query.data.code, query.data.state, query.data.connection)
  return sendRedirect(event, destination, 302)
})
