import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { generateErrorHash } from '../lib/hash.js'
import * as tenantService from './tenantService.js'
import type {
  BatchIngestInput,
  IngestApiErrorInput,
  IngestCustomEventInput,
  IngestErrorInput,
  IngestPerformanceInput,
} from '../types.js'

function performanceData(tenantId: string, input: IngestPerformanceInput): Prisma.PerformanceMetricCreateManyInput {
  return {
    tenantId,
    url: input.url,
    userAgent: input.userAgent,
    timestamp: BigInt(input.timestamp),
    lcp: input.metrics.lcp ?? null,
    fcp: input.metrics.fcp ?? null,
    cls: input.metrics.cls ?? null,
    fid: input.metrics.fid ?? null,
    ttfb: input.metrics.ttfb ?? null,
    dnsTime: input.metrics.dns ?? null,
    tcpTime: input.metrics.tcp ?? null,
    responseTime: input.metrics.response ?? null,
    domLoadTime: input.metrics.dom ?? null,
    loadTime: input.metrics.load ?? null,
    deviceType: input.device?.type ?? null,
    browser: input.device?.browser ?? null,
    os: input.device?.os ?? null,
    country: input.device?.country ?? null,
  }
}

function apiErrorData(tenantId: string, input: IngestApiErrorInput): Prisma.ApiErrorCreateManyInput {
  return {
    tenantId,
    type: input.type,
    requestUrl: input.requestUrl,
    method: input.method ?? 'GET',
    statusCode: input.status ?? null,
    errorMessage: input.message ?? null,
    pageUrl: input.url,
    userAgent: input.userAgent,
    timestamp: BigInt(input.timestamp),
    requestHeaders: input.requestHeaders ?? {},
    responseHeaders: input.responseHeaders ?? {},
  }
}

function customEventData(tenantId: string, input: IngestCustomEventInput): Prisma.CustomEventCreateManyInput {
  return {
    tenantId,
    eventName: input.name,
    url: input.url,
    userAgent: input.userAgent,
    timestamp: BigInt(input.timestamp),
    data: input.data as Prisma.InputJsonValue,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  }
}

async function upsertError(
  tenantId: string,
  input: IngestErrorInput,
  errorHash: string,
  occurrences: number
): Promise<void> {
  const updated = await prisma.errorLog.updateMany({
    where: { tenantId, errorHash },
    data: { occurrenceCount: { increment: occurrences } },
  })

  if (updated.count === 0) {
    await prisma.errorLog.create({
      data: {
        tenantId,
        type: input.type,
        message: input.message,
        stackTrace: input.stack ?? null,
        source: input.source ?? null,
        lineNumber: input.lineNo ?? null,
        columnNumber: input.colNo ?? null,
        url: input.url,
        userAgent: input.userAgent,
        timestamp: BigInt(input.timestamp),
        errorHash,
        occurrenceCount: occurrences,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    })
  }
}

export async function ingestError(tenantId: string, input: IngestErrorInput): Promise<void> {
  const errorHash = generateErrorHash(input.type, input.message, input.source)
  await upsertError(tenantId, input, errorHash, 1)
  await tenantService.incrementEventCount(tenantId)
}

export async function ingestPerformance(tenantId: string, input: IngestPerformanceInput): Promise<void> {
  await prisma.performanceMetric.create({ data: performanceData(tenantId, input) })
  await tenantService.incrementEventCount(tenantId)
}

export async function ingestApiError(tenantId: string, input: IngestApiErrorInput): Promise<void> {
  await prisma.apiError.create({ data: apiErrorData(tenantId, input) })
  await tenantService.incrementEventCount(tenantId)
}

export async function ingestCustomEvent(tenantId: string, input: IngestCustomEventInput): Promise<void> {
  await prisma.customEvent.create({ data: customEventData(tenantId, input) })
  await tenantService.incrementEventCount(tenantId)
}

export async function ingestBatch(tenantId: string, input: BatchIngestInput): Promise<void> {
  const errors = input.errors ?? []
  const performance = input.performance ?? []
  const apiErrors = input.apiErrors ?? []
  const customEvents = input.customEvents ?? []

  // Collapse duplicate errors within the batch so each hash is a single write.
  const errorGroups = new Map<string, { input: IngestErrorInput; occurrences: number }>()
  for (const error of errors) {
    const errorHash = generateErrorHash(error.type, error.message, error.source)
    const group = errorGroups.get(errorHash)
    if (group) {
      group.occurrences += 1
    } else {
      errorGroups.set(errorHash, { input: error, occurrences: 1 })
    }
  }

  const tasks: Promise<unknown>[] = [...errorGroups.entries()].map(([errorHash, group]) =>
    upsertError(tenantId, group.input, errorHash, group.occurrences)
  )
  if (performance.length > 0) {
    tasks.push(prisma.performanceMetric.createMany({ data: performance.map((p) => performanceData(tenantId, p)) }))
  }
  if (apiErrors.length > 0) {
    tasks.push(prisma.apiError.createMany({ data: apiErrors.map((e) => apiErrorData(tenantId, e)) }))
  }
  if (customEvents.length > 0) {
    tasks.push(prisma.customEvent.createMany({ data: customEvents.map((e) => customEventData(tenantId, e)) }))
  }

  await Promise.all(tasks)

  const totalEvents = errors.length + performance.length + apiErrors.length + customEvents.length
  if (totalEvents > 0) {
    await tenantService.incrementEventCount(tenantId, totalEvents)
  }
}
