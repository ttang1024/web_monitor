import * as apiKeyService from '../../services/apiKeyService.js'
import { createApiKeySchema, validate } from '../../lib/validation.js'
import { requireAuth } from '../guards.js'
import type { CreateApiKeyInput, GraphQLContext } from '../../types.js'

export const apiKeyResolvers = {
  Query: {
    apiKeys: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return apiKeyService.listApiKeys(auth.tenantId)
    },
  },
  Mutation: {
    createApiKey: async (_: unknown, { input }: { input: CreateApiKeyInput }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      const validated = validate(createApiKeySchema, input)
      return apiKeyService.createApiKey(auth.tenantId, validated.name, validated.environment ?? 'production')
    },
    revokeApiKey: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return apiKeyService.revokeApiKey(auth.tenantId, id)
    },
  },
}
