import * as monitoringService from '../../services/monitoringService.js'
import { requireApiKey } from '../guards.js'
import type {
  BatchIngestInput,
  GraphQLContext,
  IngestApiErrorInput,
  IngestCustomEventInput,
  IngestErrorInput,
  IngestPerformanceInput,
} from '../../types.js'

export const sdkResolvers = {
  Mutation: {
    ingestError: async (_: unknown, { input }: { input: IngestErrorInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestError(tenantId, input)
      return true
    },
    ingestPerformance: async (_: unknown, { input }: { input: IngestPerformanceInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestPerformance(tenantId, input)
      return true
    },
    ingestApiError: async (_: unknown, { input }: { input: IngestApiErrorInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestApiError(tenantId, input)
      return true
    },
    ingestCustomEvent: async (_: unknown, { input }: { input: IngestCustomEventInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestCustomEvent(tenantId, input)
      return true
    },
    ingestBatch: async (_: unknown, { input }: { input: BatchIngestInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestBatch(tenantId, input)
      return true
    },
  },
}
