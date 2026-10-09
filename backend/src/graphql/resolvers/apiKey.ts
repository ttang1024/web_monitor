import * as apiKeyService from '../../services/apiKeyService.js'
import { allowedOriginsSchema, createApiKeySchema, validate } from '../../lib/validation.js'
import { requireAdmin, requireAuth } from '../guards.js'
import type { GraphQLContext } from '../../types.js'

export const apiKeyResolvers = {
  Query: {
    apiKeys: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return apiKeyService.listApiKeys(auth.tenantId)
    },
  },
  Mutation: {
    createApiKey: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      const validated = validate(createApiKeySchema, input)
      return apiKeyService.createApiKey(auth.tenantId, validated.name, validated.environment ?? 'production')
    },
    revokeApiKey: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      return apiKeyService.revokeApiKey(auth.tenantId, id)
    },
    setApiKeyAllowedOrigins: async (
      _: unknown,
      { id, origins }: { id: string; origins: string[] },
      ctx: GraphQLContext
    ) => {
      const auth = requireAdmin(ctx)
      return apiKeyService.setAllowedOrigins(auth.tenantId, id, validate(allowedOriginsSchema, origins))
    },
  },
}
