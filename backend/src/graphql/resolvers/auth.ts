import * as authService from '../../services/authService.js'
import {
  createUserSchema,
  loginSchema,
  registerSchema,
  updateUserSchema,
  validate,
} from '../../lib/validation.js'
import { authRateLimiter, refreshRateLimiter } from '../../lib/rateLimit.js'
import { clearRefreshCookie, setRefreshCookie } from '../../lib/session.js'
import { requireAdmin, requireAuth } from '../guards.js'
import type { GraphQLContext } from '../../types.js'

// Keyed by caller IP + identity so one attacker cannot lock out a whole office,
// and cannot spread a guessing run across many accounts either.
function rateLimitKey(ctx: GraphQLContext, action: string, identity: string): string {
  return `${action}:${ctx.ip ?? 'unknown'}:${identity.toLowerCase()}`
}

/** The refresh token goes into the httpOnly cookie, never into the response body. */
function respondWithSession(ctx: GraphQLContext, session: authService.Session) {
  setRefreshCookie(ctx.res, session.refreshToken)
  return { token: session.token, user: session.user, tenant: session.tenant }
}

export const authResolvers = {
  Query: {
    users: (_: unknown, __: unknown, ctx: GraphQLContext) => authService.listUsers(requireAuth(ctx).tenantId),
  },
  Mutation: {
    register: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const validated = validate(registerSchema, input)
      const key = rateLimitKey(ctx, 'register', validated.email)
      await authRateLimiter.hit(key)
      const session = await authService.register(validated)
      await authRateLimiter.reset(key)
      return respondWithSession(ctx, session)
    },

    login: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const validated = validate(loginSchema, input)
      const key = rateLimitKey(ctx, 'login', validated.email)
      await authRateLimiter.hit(key)
      const session = await authService.login(validated)
      // Only successful logins clear the window, so a guessing run keeps its count.
      await authRateLimiter.reset(key)
      return respondWithSession(ctx, session)
    },

    refreshSession: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await refreshRateLimiter.hit(`refresh:${ctx.ip ?? 'unknown'}`)
      try {
        return respondWithSession(ctx, await authService.refreshSession(ctx.refreshCookie))
      } catch (error) {
        // A dead cookie is useless to keep sending.
        clearRefreshCookie(ctx.res)
        throw error
      }
    },

    logout: async (_: unknown, { everywhere }: { everywhere?: boolean | null }, ctx: GraphQLContext) => {
      // Logging out works with an expired access token too: the cookie identifies the session.
      if (everywhere) {
        await authService.revokeAllSessions(requireAuth(ctx).userId)
      } else if (ctx.auth) {
        await authService.logout(ctx.auth.userId, ctx.refreshCookie)
      } else if (ctx.refreshCookie) {
        await authService.logoutByToken(ctx.refreshCookie)
      }
      clearRefreshCookie(ctx.res)
      return true
    },

    createUser: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      return authService.createUser(auth.tenantId, validate(createUserSchema, input))
    },

    updateUser: async (_: unknown, { id, input }: { id: string; input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      return authService.updateUser(auth.tenantId, auth.userId, id, validate(updateUserSchema, input))
    },
  },
}
