import type { H3Event } from 'h3'
import {
  createTalredApiClient,
  TalredApiError,
  type TalredApiClientOptions,
  type TalredApiFetchClient,
} from '@talred/api-client'
import { useServerIdentity } from './identity.js'

export type IdentityApiClientOptions = Omit<TalredApiClientOptions, 'bearerToken' | 'onUnauthorized'> & {
  requireAuthentication?: boolean
}

/**
 * Creates a Talred API client backed by one encrypted consumer session.
 * An upstream 401 forces one token refresh and one retry. Refresh failures
 * clear the local and remote Identity session before the error is rethrown.
 */
export async function createIdentityApiClient(
  event: H3Event,
  application: string,
  options: IdentityApiClientOptions,
): Promise<TalredApiFetchClient> {
  const identity = useServerIdentity(event, application)
  const token = options.requireAuthentication !== false
    ? await identity.accessToken()
    : await identity.optionalAccessToken()
  const client = createTalredApiClient({ ...options, bearerToken: token })

  const request = async (
    input: Parameters<TalredApiFetchClient>[0],
    requestOptions?: Parameters<TalredApiFetchClient>[1],
  ) => {
    try {
      return await client(input, requestOptions)
    } catch (error) {
      if (!(error instanceof TalredApiError) || !error.isUnauthorized || !await identity.user()) throw error

      let refreshedToken: string
      try {
        refreshedToken = await identity.refreshAccessToken()
      } catch (refreshError) {
        await identity.logout()
        throw refreshError
      }

      return await createTalredApiClient({ ...options, bearerToken: refreshedToken })(input, requestOptions)
    }
  }

  return request as TalredApiFetchClient
}
