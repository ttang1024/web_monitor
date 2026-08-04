import { UnauthorizedError } from '../lib/errors.js'
import { resolveApiKey, type ResolvedApiKey } from '../lib/apiKey.js'
import { ingestRateLimiter } from '../lib/rateLimit.js'
import type { GraphQLContext } from '../types.js'

export function requireAuth(ctx: GraphQLContext) {
  if (!ctx.auth) throw new UnauthorizedError('Authentication required')
  return ctx.auth
}

/**
 * Resolves the caller's API key and charges `eventCount` against its ingest
 * budget. The charge is the number of events in the request, not one per
 * request: a batch mutation can carry 2000 events, so counting requests would
 * let a caller send orders of magnitude more than the limit implies.
 */
export async function requireApiKey(ctx: GraphQLContext, eventCount = 1): Promise<ResolvedApiKey> {
  if (!ctx.apiKeyHeader) throw new UnauthorizedError('API Key required')

  const resolved = await resolveApiKey(ctx.apiKeyHeader, ctx.origin)
  ingestRateLimiter.hit(resolved.apiKeyId, Date.now(), eventCount)
  return resolved
}
