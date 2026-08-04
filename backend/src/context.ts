import type { IncomingHttpHeaders } from 'node:http'
import { verifyJwtToken } from './lib/auth.js'
import type { GraphQLContext } from './types.js'

export function buildContext(headers: IncomingHttpHeaders, ip?: string): GraphQLContext {
  const context: GraphQLContext = { ip }

  const authHeader = headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const claims = verifyJwtToken(authHeader.slice('Bearer '.length))
      context.auth = {
        userId: claims.userId,
        tenantId: claims.tenantId,
        email: claims.email,
        role: claims.role,
      }
    } catch {
      // Invalid/expired token: leave context.auth unset, resolvers that
      // require auth will reject the request.
    }
  }

  const apiKeyHeader = headers['x-api-key']
  if (typeof apiKeyHeader === 'string') {
    context.apiKeyHeader = apiKeyHeader
  }

  // Browsers set Origin on cross-origin requests and refuse to let page script
  // forge it, which is what makes it usable as an API key allowlist check.
  if (typeof headers.origin === 'string') {
    context.origin = headers.origin
  }

  return context
}
