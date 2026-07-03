import * as authService from '../../services/authService.js'
import { validate, registerSchema, loginSchema } from '../../lib/validation.js'
import { requireAuth } from '../guards.js'
import type { GraphQLContext, LoginInput, RegisterInput } from '../../types.js'

export const authResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return authService.getUserById(auth.userId)
    },
  },
  Mutation: {
    register: async (_: unknown, { input }: { input: RegisterInput }) => {
      const validated = validate(registerSchema, input)
      return authService.register(validated)
    },
    login: async (_: unknown, { input }: { input: LoginInput }) => {
      const validated = validate(loginSchema, input)
      return authService.login(validated)
    },
    changePassword: async (
      _: unknown,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      await authService.changePassword(auth.userId, currentPassword, newPassword)
      return true
    },
  },
}
