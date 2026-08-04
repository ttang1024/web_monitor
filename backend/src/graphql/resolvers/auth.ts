import * as authService from '../../services/authService.js'
import { validate, registerSchema, loginSchema, changePasswordSchema } from '../../lib/validation.js'
import { authRateLimiter } from '../../lib/rateLimit.js'
import { requireAuth } from '../guards.js'
import type { GraphQLContext, LoginInput, RegisterInput } from '../../types.js'

// Keyed by caller IP + identity so one attacker cannot lock out a whole office,
// and cannot spread a guessing run across many accounts either.
function rateLimitKey(ctx: GraphQLContext, action: string, identity: string): string {
  return `${action}:${ctx.ip ?? 'unknown'}:${identity.toLowerCase()}`
}

export const authResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return authService.getUserById(auth.userId)
    },
    myTenant: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return authService.getTenantById(auth.tenantId)
    },
  },
  Mutation: {
    register: async (_: unknown, { input }: { input: RegisterInput }, ctx: GraphQLContext) => {
      const validated = validate(registerSchema, input)
      const key = rateLimitKey(ctx, 'register', validated.email)
      authRateLimiter.hit(key)
      const session = await authService.register(validated)
      authRateLimiter.reset(key)
      return session
    },
    login: async (_: unknown, { input }: { input: LoginInput }, ctx: GraphQLContext) => {
      const validated = validate(loginSchema, input)
      const key = rateLimitKey(ctx, 'login', validated.email)
      authRateLimiter.hit(key)
      const session = await authService.login(validated)
      // Only successful logins clear the window, so a guessing run keeps its count.
      authRateLimiter.reset(key)
      return session
    },
    refreshSession: async (_: unknown, { refreshToken }: { refreshToken: string }, ctx: GraphQLContext) => {
      authRateLimiter.hit(rateLimitKey(ctx, 'refresh', refreshToken.slice(0, 8)))
      return authService.refreshSession(refreshToken)
    },
    logout: async (_: unknown, { refreshToken }: { refreshToken?: string | null }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      await authService.logout(auth.userId, refreshToken)
      return true
    },
    changePassword: async (
      _: unknown,
      args: { currentPassword: string; newPassword: string },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      const { currentPassword, newPassword } = validate(changePasswordSchema, args)
      await authService.changePassword(auth.userId, currentPassword, newPassword)
      return true
    },
  },
}
