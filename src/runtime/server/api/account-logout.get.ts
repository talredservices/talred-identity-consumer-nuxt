import { createError, defineEventHandler, getRouterParam, sendRedirect, setResponseHeader } from 'h3'
import { logoutIdentityApplication, identityApplication } from '../identity.js'

/** Clears the host BFF session, then returns to the application's configured local logout destination. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const application = getRouterParam(event, 'application')
  if (!application) throw createError({ statusCode: 400, statusMessage: 'An Identity application is required.' })
  const configuration = identityApplication(event, application)
  if (configuration.mode === 'app') throw createError({ statusCode: 405, statusMessage: 'Use the same-origin POST logout operation.' })
  await logoutIdentityApplication(event, application)
  return sendRedirect(event, configuration.logoutRedirect, 302)
})
