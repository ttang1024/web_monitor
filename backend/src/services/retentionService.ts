import { prisma } from '../prisma.js'
import { env } from '../lib/env.js'

export interface RetentionSummary {
  cutoff: Date
  deleted: Record<string, number>
}

/**
 * Rows are removed in bounded chunks rather than one big DELETE: a statement
 * covering months of ingestion holds locks long enough to stall writes on the
 * same tables. Anything left after MAX_CHUNKS is picked up by the next sweep.
 */
const CHUNK_SIZE = 5_000
const MAX_CHUNKS_PER_TABLE = 200
/** Idempotency keys only need to outlive the SDK's retry horizon. */
const INGEST_BATCH_TTL_MS = 24 * 60 * 60 * 1000

/** The subset of a Prisma model delegate the sweep needs. */
interface PrunableModel {
  findMany(args: { where: object; select: { id: true }; take: number }): Promise<{ id: string }[]>
  deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>
}

async function pruneInChunks(model: PrunableModel, where: object): Promise<number> {
  let total = 0
  for (let i = 0; i < MAX_CHUNKS_PER_TABLE; i++) {
    const rows = await model.findMany({ where, select: { id: true }, take: CHUNK_SIZE })
    if (rows.length === 0) break
    const { count } = await model.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
    total += count
    if (rows.length < CHUNK_SIZE) break
  }
  return total
}

/**
 * Deletes data older than the retention window. Each filter is served by a
 * single-column index on the time column (the tenant-leading indexes can't
 * answer a cross-tenant age query).
 *
 * ErrorLog rows are issues, not events: one is removed only once it has not
 * recurred for the whole window, by which point its hourly buckets — its trend
 * line — are gone too. Ignored issues are kept: deleting one would quietly
 * un-ignore it the next time it occurs. (A resolved issue that recurs after
 * pruning reappears as a new issue, which after that long is what it is.)
 */
export async function pruneExpiredData(now = new Date()): Promise<RetentionSummary> {
  const cutoff = new Date(now.getTime() - env.RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const olderThanCutoff = { createdAt: { lt: cutoff } }

  const deleted: Record<string, number> = {
    performanceMetrics: await pruneInChunks(prisma.performanceMetric, olderThanCutoff),
    apiErrors: await pruneInChunks(prisma.apiError, olderThanCutoff),
    customEvents: await pruneInChunks(prisma.customEvent, olderThanCutoff),
    errorBuckets: await pruneInChunks(prisma.errorBucket, { bucketStart: { lt: cutoff } }),
    errorLogs: await pruneInChunks(prisma.errorLog, { lastSeenAt: { lt: cutoff }, status: { not: 'Ignored' } }),
    alertNotifications: await pruneInChunks(prisma.alertNotification, olderThanCutoff),
  }

  // Composite primary key, no id column: delete by age directly. Small table.
  const { count: ingestBatches } = await prisma.ingestBatch.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - INGEST_BATCH_TTL_MS) } },
  })
  deleted.ingestBatches = ingestBatches

  // Refresh tokens follow their own clock: once expired or revoked they can
  // never be redeemed (revoked ones are kept a while for reuse detection).
  const { count: refreshTokens } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null, lt: cutoff } }] },
  })
  deleted.refreshTokens = refreshTokens

  return { cutoff, deleted }
}
