import type { ErrorStatus } from '@prisma/client'
import * as dashboardService from '../../services/dashboardService.js'
import { requireAuth } from '../guards.js'
import type { GraphQLContext, SaveLayoutInput } from '../../types.js'

const BREAKDOWN_DIMENSIONS = { browser: 'browser', os: 'os', device: 'deviceType', deviceType: 'deviceType' } as const

export const dashboardResolvers = {
  ErrorLog: {
    timestamp: (parent: { timestamp: bigint }) => Number(parent.timestamp),
  },
  ApiErrorLog: {
    timestamp: (parent: { timestamp: bigint }) => Number(parent.timestamp),
  },
  CustomEventLog: {
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
      args: {
        page: number
        pageSize: number
        type?: string
        status?: ErrorStatus
        search?: string
        startDate?: Date
      },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getErrors(auth.tenantId, {
        page: args.page,
        // Hard ceiling: a client cannot ask for the whole table in one page.
        pageSize: Math.min(Math.max(args.pageSize, 1), 200),
        type: args.type,
        status: args.status,
        search: args.search,
        startDate: args.startDate,
      })
    },
    errorStatusCounts: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      const counts = await dashboardService.getErrorStatusCounts(auth.tenantId)
      return {
        unresolved: counts.Unresolved,
        resolved: counts.Resolved,
        ignored: counts.Ignored,
        regressed: counts.Regressed,
      }
    },
    errorDetails: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.getErrorDetails(auth.tenantId, id)
    },
    errorTimeSeries: async (
      _: unknown,
      { errorHash, hours }: { errorHash: string; hours: number },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getErrorTimeSeries(auth.tenantId, errorHash, Math.min(Math.max(hours, 1), 24 * 30))
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
    webVitals: async (
      _: unknown,
      args: { startDate?: Date; endDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getWebVitals(auth.tenantId, args.startDate, args.endDate)
    },
    deviceBreakdown: async (
      _: unknown,
      args: { dimension?: string; startDate?: Date; endDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      const dimension = BREAKDOWN_DIMENSIONS[args.dimension as keyof typeof BREAKDOWN_DIMENSIONS] ?? 'browser'
      return dashboardService.getDeviceBreakdown(auth.tenantId, dimension, args.startDate, args.endDate)
    },
    apiErrors: async (
      _: unknown,
      args: { page: number; pageSize: number; startDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getApiErrors(
        auth.tenantId,
        args.page,
        Math.min(Math.max(args.pageSize, 1), 200),
        args.startDate
      )
    },
    customEvents: async (
      _: unknown,
      args: { page: number; pageSize: number; name?: string; startDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getCustomEvents(
        auth.tenantId,
        args.page,
        Math.min(Math.max(args.pageSize, 1), 200),
        args.name,
        args.startDate
      )
    },
    businessFlows: async (
      _: unknown,
      args: { startDate?: Date; endDate?: Date },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.getBusinessFlowStats(auth.tenantId, args.startDate, args.endDate)
    },
    dashboardLayouts: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.getUserLayouts(auth.tenantId, auth.userId)
    },
  },
  Mutation: {
    updateErrorStatus: async (
      _: unknown,
      { id, status }: { id: string; status: ErrorStatus },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return dashboardService.updateErrorStatus(auth.tenantId, id, status)
    },
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
