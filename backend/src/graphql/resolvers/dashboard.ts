import type { ErrorStatus } from '@prisma/client'
import * as dashboardService from '../../services/dashboardService.js'
import { saveLayoutSchema, validate } from '../../lib/validation.js'
import { requireAuth } from '../guards.js'
import type { GraphQLContext } from '../../types.js'

const BREAKDOWN_DIMENSIONS = { browser: 'browser', os: 'os', device: 'deviceType', deviceType: 'deviceType' } as const

interface Range {
  startDate?: Date | null
  endDate?: Date | null
}

/** Event timestamps are stored as BIGINT (ms); GraphQL exposes them as Float. */
const epochMs = { timestamp: (parent: { timestamp: bigint }) => Number(parent.timestamp) }

export const dashboardResolvers = {
  ErrorLog: epochMs,
  ApiErrorLog: epochMs,
  CustomEventLog: epochMs,

  Query: {
    dashboardStats: (_: unknown, { startDate, endDate }: Range, ctx: GraphQLContext) =>
      dashboardService.getDashboardStats(requireAuth(ctx).tenantId, startDate, endDate),

    errors: (
      _: unknown,
      args: dashboardService.ErrorFilters & { status?: ErrorStatus | null },
      ctx: GraphQLContext
    ) => dashboardService.getErrors(requireAuth(ctx).tenantId, args),

    errorStatusCounts: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const counts = await dashboardService.getErrorStatusCounts(requireAuth(ctx).tenantId)
      return {
        unresolved: counts.Unresolved,
        resolved: counts.Resolved,
        ignored: counts.Ignored,
        regressed: counts.Regressed,
      }
    },

    errorTimeSeries: (_: unknown, { errorHash, hours }: { errorHash: string; hours: number }, ctx: GraphQLContext) =>
      dashboardService.getErrorTimeSeries(requireAuth(ctx).tenantId, errorHash, Math.min(Math.max(hours, 1), 24 * 30)),

    performanceTimeSeries: (
      _: unknown,
      args: Range & { url?: string | null; interval?: string | null },
      ctx: GraphQLContext
    ) =>
      dashboardService.getPerformanceTimeSeries(
        requireAuth(ctx).tenantId,
        args.startDate,
        args.endDate,
        args.url,
        args.interval ?? 'hour'
      ),

    webVitals: (_: unknown, args: Range, ctx: GraphQLContext) =>
      dashboardService.getWebVitals(requireAuth(ctx).tenantId, args.startDate, args.endDate),

    deviceBreakdown: (_: unknown, args: Range & { dimension?: string | null }, ctx: GraphQLContext) => {
      const dimension = BREAKDOWN_DIMENSIONS[args.dimension as keyof typeof BREAKDOWN_DIMENSIONS] ?? 'browser'
      return dashboardService.getDeviceBreakdown(requireAuth(ctx).tenantId, dimension, args.startDate, args.endDate)
    },

    apiErrors: (_: unknown, args: dashboardService.PageArgs & Range, ctx: GraphQLContext) =>
      dashboardService.getApiErrors(requireAuth(ctx).tenantId, args),

    slowRequests: (_: unknown, args: Range, ctx: GraphQLContext) =>
      dashboardService.getSlowRequests(requireAuth(ctx).tenantId, args.startDate, args.endDate),

    businessFlows: (_: unknown, args: Range, ctx: GraphQLContext) =>
      dashboardService.getBusinessFlowStats(requireAuth(ctx).tenantId, args.startDate, args.endDate),

    customEventStats: (_: unknown, args: Range, ctx: GraphQLContext) =>
      dashboardService.getCustomEventStats(requireAuth(ctx).tenantId, args.startDate, args.endDate),

    customMetricStats: (_: unknown, args: Range, ctx: GraphQLContext) =>
      dashboardService.getCustomMetricStats(requireAuth(ctx).tenantId, args.startDate, args.endDate),

    customMetricTimeSeries: (
      _: unknown,
      args: Range & { metric: string; interval?: string | null },
      ctx: GraphQLContext
    ) =>
      dashboardService.getCustomMetricTimeSeries(
        requireAuth(ctx).tenantId,
        args.metric,
        args.startDate,
        args.endDate,
        args.interval ?? 'hour'
      ),

    customEvents: (_: unknown, args: dashboardService.PageArgs & Range & { name?: string | null }, ctx: GraphQLContext) =>
      dashboardService.getCustomEvents(requireAuth(ctx).tenantId, args),

    dashboardLayouts: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.getUserLayouts(auth.tenantId, auth.userId)
    },
  },

  Mutation: {
    updateErrorStatus: (_: unknown, { id, status }: { id: string; status: ErrorStatus }, ctx: GraphQLContext) =>
      dashboardService.updateErrorStatus(requireAuth(ctx).tenantId, id, status),

    saveDashboardLayout: (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return dashboardService.saveLayout(auth.tenantId, auth.userId, validate(saveLayoutSchema, input))
    },
  },
}
