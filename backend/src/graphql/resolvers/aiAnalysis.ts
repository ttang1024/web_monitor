import { analyzeDashboard } from '../../services/aiAnalysisService.js'
import { aiAnalysisInputSchema, validate } from '../../lib/validation.js'
import { aiAnalysisRateLimiter } from '../../lib/rateLimit.js'
import { requireAuth } from '../guards.js'
import type { GraphQLContext } from '../../types.js'

export const aiAnalysisResolvers = {
  Mutation: {
    analyzeDashboardMetrics: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      const validated = validate(aiAnalysisInputSchema, input)
      await aiAnalysisRateLimiter.hit(auth.tenantId)
      return analyzeDashboard(auth.tenantId, validated)
    },
  },
}
