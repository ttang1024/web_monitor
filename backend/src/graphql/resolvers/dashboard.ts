import * as dashboardService from '../../services/dashboardService.js'
import { requireAuth } from '../guards.js'
import type { GraphQLContext, SaveLayoutInput } from '../../types.js'

export const dashboardResolvers = {
  ErrorLog: {
    timestamp: (parent: { timestamp: bigint }) => Number(parent.timestamp),
  },
  Query: {
    dashboardStats: async (
      _: unknown,
      { startDate, endDate }: { startDate?: Date; endDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getDashboardStats(auth.tenantId, startDate, endDate)
    },
    errors: async (
      _: unknown,
      args: { page: number; pageSize: number; type?: string; startDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getErrors(auth.tenantId, args.page, args.pageSize, args.type, args.startDate)
    },
    errorDetails: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.getErrorDetails(auth.tenantId, id)
    },
    performanceTimeSeries: async (
      _: unknown,
      args: { startDate?: Date; endDate?: Date; url?: string; interval?: string },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getPerformanceTimeSeries(
        auth.tenantId,
        args.startDate,
        args.endDate,
        args.url,
        args.interval
      )
    },
    dashboardLayouts: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.getUserLayouts(auth.tenantId, auth.userId)
    },
  },
  Mutation: {
    saveDashboardLayout: async (_: unknown, { input }: { input: SaveLayoutInput }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.saveLayout(auth.tenantId, auth.userId, input)
    },
    deleteDashboardLayout: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      await dashboardService.deleteLayout(auth.tenantId, auth.userId, id)
      return true
    },
  },
}
