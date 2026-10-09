import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { generateErrorHash } from '../lib/hash.js'
import { redactHeaders, sanitizeUrl } from '../lib/redact.js'
import { incrementEventCount } from './tenantService.js'
import type {
  BatchIngestInput,
  IngestApiErrorInput,
  IngestCustomEventInput,
  IngestErrorInput,
  IngestPerformanceInput,
} from '../types.js'

export const BUCKET_MS = 60 * 60 * 1000
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

/** Floors a timestamp to the (UTC) hour its occurrences are counted in. */
export function bucketStartFor(timestamp: number): Date {
  return new Date(Math.floor(timestamp / BUCKET_MS) * BUCKET_MS)
}

/**
 * Event times come from the browser, where the clock can be wrong by years.
 * Anything more than a day from server time is replaced with server time so a
 * single bad clock can't park an issue in 1970 or the far future.
 */
export function resolveEventTime(timestamp: number, now = Date.now()): Date {
  return Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS ? new Date(now) : new Date(timestamp)
}

function performanceData(tenantId: string, input: IngestPerformanceInput): Prisma.PerformanceMetricCreateManyInput {
  return {
    tenantId,
    url: sanitizeUrl(input.url),
    userAgent: input.userAgent,
    timestamp: BigInt(Math.round(input.timestamp)),
    lcp: input.metrics.lcp ?? null,
    fcp: input.metrics.fcp ?? null,
    cls: input.metrics.cls ?? null,
    inp: input.metrics.inp ?? null,
    ttfb: input.metrics.ttfb ?? null,
    dnsTime: input.metrics.dns ?? null,
    tcpTime: input.metrics.tcp ?? null,
    responseTime: input.metrics.response ?? null,
    domLoadTime: input.metrics.dom ?? null,
    loadTime: input.metrics.load ?? null,
    navigationType: input.navigationType ?? null,
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
    requestUrl: sanitizeUrl(input.requestUrl),
    method: input.method ?? 'GET',
    statusCode: input.status ?? null,
    durationMs: input.durationMs ?? null,
    errorMessage: input.message ?? null,
    pageUrl: sanitizeUrl(input.url),
    userAgent: input.userAgent,
    timestamp: BigInt(Math.round(input.timestamp)),
    requestHeaders: redactHeaders(input.requestHeaders),
    responseHeaders: redactHeaders(input.responseHeaders),
  }
}

function customEventData(tenantId: string, input: IngestCustomEventInput): Prisma.CustomEventCreateManyInput {
  return {
    tenantId,
    eventName: input.name,
    url: sanitizeUrl(input.url),
    userAgent: input.userAgent,
    timestamp: BigInt(Math.round(input.timestamp)),
    data: input.data as Prisma.InputJsonValue,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? null,
  }
}

interface ErrorGroup {
  errorHash: string
  /** First occurrence in the batch; its details become the issue's sample. */
  sample: IngestErrorInput
  occurrences: number
  lastSeenAt: Date
}

export function groupErrors(errors: IngestErrorInput[], now: number): {
  groups: ErrorGroup[]
  buckets: { errorHash: string; bucketStart: Date; count: number }[]
} {
  const groups = new Map<string, ErrorGroup>()
  const buckets = new Map<string, { errorHash: string; bucketStart: Date; count: number }>()

  for (const error of errors) {
    const errorHash = generateErrorHash(error.type, error.message, error.source)
    const seenAt = resolveEventTime(error.timestamp, now)

    const group = groups.get(errorHash)
    if (group) {
      group.occurrences += 1
      if (seenAt > group.lastSeenAt) group.lastSeenAt = seenAt
    } else {
      groups.set(errorHash, { errorHash, sample: error, occurrences: 1, lastSeenAt: seenAt })
    }

    const bucketStart = bucketStartFor(seenAt.getTime())
    const bucketKey = `${errorHash}:${bucketStart.getTime()}`
    const bucket = buckets.get(bucketKey)
    if (bucket) bucket.count += 1
    else buckets.set(bucketKey, { errorHash, bucketStart, count: 1 })
  }

  // A fixed order means concurrent batches lock the same rows in the same
  // order, which keeps InnoDB deadlocks rare.
  return {
    groups: [...groups.values()].sort((a, b) => a.errorHash.localeCompare(b.errorHash)),
    buckets: [...buckets.values()].sort(
      (a, b) => a.errorHash.localeCompare(b.errorHash) || a.bucketStart.getTime() - b.bucketStart.getTime()
    ),
  }
}

/**
 * One statement for every distinct error in the batch: new hashes insert, known
 * ones add to their count, and a Resolved issue that recurs flips to Regressed.
 */
async function upsertErrors(tx: Prisma.TransactionClient, tenantId: string, groups: ErrorGroup[], now: Date) {
  if (groups.length === 0) return

  const rows = groups.map(({ errorHash, sample, occurrences, lastSeenAt }) => Prisma.sql`(
    ${randomUUID()}, ${tenantId}, ${sample.type}, ${sample.message}, ${sample.stack ?? null},
    ${sample.source ? sanitizeUrl(sample.source) : null}, ${sample.lineNo ?? null}, ${sample.colNo ?? null},
    ${sanitizeUrl(sample.url)}, ${sample.userAgent}, ${BigInt(Math.round(sample.timestamp))}, ${errorHash},
    ${occurrences}, 'Unresolved', ${lastSeenAt}, ${JSON.stringify(sample.metadata ?? {})}, ${now}, ${now}
  )`)

  await tx.$executeRaw`
    INSERT INTO \`ErrorLog\` (id, tenantId, type, message, stackTrace, source, lineNumber, columnNumber,
                              url, userAgent, timestamp, errorHash, occurrenceCount, status, lastSeenAt,
                              metadata, createdAt, updatedAt)
    VALUES ${Prisma.join(rows)}
    AS incoming
    ON DUPLICATE KEY UPDATE
      occurrenceCount = \`ErrorLog\`.occurrenceCount + incoming.occurrenceCount,
      lastSeenAt      = GREATEST(\`ErrorLog\`.lastSeenAt, incoming.lastSeenAt),
      status          = IF(\`ErrorLog\`.status = 'Resolved', 'Regressed', \`ErrorLog\`.status),
      updatedAt       = incoming.updatedAt
  `
}

async function upsertBuckets(
  tx: Prisma.TransactionClient,
  tenantId: string,
  buckets: { errorHash: string; bucketStart: Date; count: number }[]
) {
  if (buckets.length === 0) return

  const rows = buckets.map(
    ({ errorHash, bucketStart, count }) => Prisma.sql`(${randomUUID()}, ${tenantId}, ${errorHash}, ${bucketStart}, ${count})`
  )
  await tx.$executeRaw`
    INSERT INTO \`ErrorBucket\` (id, tenantId, errorHash, bucketStart, count)
    VALUES ${Prisma.join(rows)}
    AS incoming
    ON DUPLICATE KEY UPDATE count = \`ErrorBucket\`.count + incoming.count
  `
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** InnoDB picked this transaction as a deadlock victim; it is safe to run again. */
function isDeadlock(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === 'P2034') return true
  return error.code === 'P2010' && String((error.meta as { code?: string } | undefined)?.code) === '1213'
}

export interface IngestResult {
  accepted: number
  /** The batch id had already been stored; nothing was written this time. */
  duplicate: boolean
}

/**
 * Stores a batch from the SDK in a fixed number of statements, however many
 * events it carries, inside one transaction: the batch lands entirely or not
 * at all, so a retry after a failure can't half-duplicate it. With a batchId,
 * a retry after a success is recognised and skipped.
 */
export async function ingestBatch(tenantId: string, input: BatchIngestInput, now = Date.now()): Promise<IngestResult> {
  const errors = input.errors ?? []
  const performance = input.performance ?? []
  const apiErrors = input.apiErrors ?? []
  const customEvents = input.customEvents ?? []
  const accepted = errors.length + performance.length + apiErrors.length + customEvents.length
  if (accepted === 0) return { accepted: 0, duplicate: false }

  const { groups, buckets } = groupErrors(errors, now)
  const nowDate = new Date(now)

  const write = () =>
    prisma.$transaction(async (tx) => {
      if (input.batchId) {
        try {
          await tx.ingestBatch.create({ data: { tenantId, batchId: input.batchId } })
        } catch (error) {
          if (isUniqueViolation(error)) return false
          throw error
        }
      }

      await upsertErrors(tx, tenantId, groups, nowDate)
      await upsertBuckets(tx, tenantId, buckets)
      if (performance.length > 0) {
        await tx.performanceMetric.createMany({ data: performance.map((p) => performanceData(tenantId, p)) })
      }
      if (apiErrors.length > 0) {
        await tx.apiError.createMany({ data: apiErrors.map((e) => apiErrorData(tenantId, e)) })
      }
      if (customEvents.length > 0) {
        await tx.customEvent.createMany({ data: customEvents.map((e) => customEventData(tenantId, e)) })
      }
      return true
    })

  let written = false
  for (let attempt = 1; ; attempt++) {
    try {
      written = await write()
      break
    } catch (error) {
      if (attempt >= 3 || !isDeadlock(error)) throw error
    }
  }

  if (!written) return { accepted: 0, duplicate: true }

  // Outside the transaction on purpose: every batch for a tenant updates the
  // same Tenant row, and holding that lock for the whole write would
  // serialise all of the tenant's ingestion.
  await incrementEventCount(tenantId, accepted)

  return { accepted, duplicate: false }
}
