import { ForbiddenError, UnauthorizedError } from '../lib/errors.js'
import type { AuthContext, GraphQLContext } from '../types.js'

export function requireAuth(ctx: GraphQLContext): AuthContext {
  if (!ctx.auth) throw new UnauthorizedError('Authentication required')
  return ctx.auth
}

/**
 * Tenant administration: API keys, alert rules (which make outbound requests),
 * and team membership. Members can read everything and triage issues.
 */
export function requireAdmin(ctx: GraphQLContext): AuthContext {
  const auth = requireAuth(ctx)
  if (auth.role !== 'Admin') throw new ForbiddenError('Only tenant admins can do that')
  return auth
}
