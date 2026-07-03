import { UnauthorizedError } from '../lib/errors.js'
import { resolveApiKey } from '../lib/apiKey.js'
import type { GraphQLContext } from '../types.js'

export function requireAuth(ctx: GraphQLContext) {
  if (!ctx.auth) throw new UnauthorizedError('Authentication required')
  return ctx.auth
}

export async function requireApiKey(ctx: GraphQLContext) {
  if (!ctx.apiKeyHeader) throw new UnauthorizedError('API Key required')
  return resolveApiKey(ctx.apiKeyHeader)
}
