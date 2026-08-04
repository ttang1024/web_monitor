import * as monitoringService from '../../services/monitoringService.js'
import {
  batchIngestSchema,
  ingestApiErrorSchema,
  ingestCustomEventSchema,
  ingestErrorSchema,
  ingestPerformanceSchema,
  validate,
} from '../../lib/validation.js'
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
      await monitoringService.ingestError(tenantId, validate(ingestErrorSchema, input) as IngestErrorInput)
      return true
    },
    ingestPerformance: async (_: unknown, { input }: { input: IngestPerformanceInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestPerformance(
        tenantId,
        validate(ingestPerformanceSchema, input) as IngestPerformanceInput
      )
      return true
    },
    ingestApiError: async (_: unknown, { input }: { input: IngestApiErrorInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestApiError(
        tenantId,
        validate(ingestApiErrorSchema, input) as IngestApiErrorInput
      )
      return true
    },
    ingestCustomEvent: async (_: unknown, { input }: { input: IngestCustomEventInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestCustomEvent(
        tenantId,
        validate(ingestCustomEventSchema, input) as IngestCustomEventInput
      )
      return true
    },
    ingestBatch: async (_: unknown, { input }: { input: BatchIngestInput }, ctx: GraphQLContext) => {
      const { tenantId } = await requireApiKey(ctx)
      await monitoringService.ingestBatch(tenantId, validate(batchIngestSchema, input) as BatchIngestInput)
      return true
    },
  },
}
