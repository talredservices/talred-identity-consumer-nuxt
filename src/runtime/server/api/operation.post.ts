import { createError, defineEventHandler, getRouterParam, readBody, setResponseHeader } from 'h3'
import { executeIdentityAppOperation, type IdentityAppOperation } from '../app-operations.js'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const application = getRouterParam(event, 'application')
  const operation = getRouterParam(event, 'operation')
  if (!application || !operation) throw createError({ statusCode: 400, statusMessage: 'An application and operation are required.' })
  return executeIdentityAppOperation(event, application, operation as IdentityAppOperation, await readBody<Record<string, unknown>>(event))
})
