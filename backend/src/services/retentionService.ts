import { prisma } from '../prisma.js'
import { env } from '../lib/env.js'

export interface RetentionSummary {
  cutoff: Date
  deleted: Record<string, number>
}

/**
 * Rows are removed in bounded chunks rather than one big DELETE. A single
 * statement covering months of ingestion holds locks long enough to stall
 * writes on the same tables, which is exactly the traffic this exists to
 * protect.
 */
const CHUNK_SIZE = 5_000
const MAX_CHUNKS_PER_TABLE = 200

async function deleteInChunks(deleteChunk: (limit: number) => Promise<number>): Promise<number> {
  let total = 0

  for (let i = 0; i < MAX_CHUNKS_PER_TABLE; i++) {
    const deleted = await deleteChunk(CHUNK_SIZE)
    total += deleted
    // A short chunk means the table is drained; anything still left is picked
    // up by the next sweep rather than by a longer-running one now.
    if (deleted < CHUNK_SIZE) break
  }

  return total
}

/**
 * Deletes ingested events older than the retention window, plus refresh tokens
 * that can no longer be redeemed.
 *
 * ErrorLog itself is deliberately left alone: it holds one row per distinct
 * error with its triage status, so it is the tenant's issue list rather than
 * raw event data. Its hourly ErrorBucket counters are what actually accumulate,
 * and those are pruned here.
 */
export async function pruneExpiredData(now = new Date()): Promise<RetentionSummary> {
  const cutoff = new Date(now.getTime() - env.RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const performanceMetrics = await deleteInChunks(async (limit) => {
    const rows = await prisma.performanceMetric.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    })
    if (rows.length === 0) return 0
    const { count } = await prisma.performanceMetric.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    })
    return count
  })

  const apiErrors = await deleteInChunks(async (limit) => {
    const rows = await prisma.apiError.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    })
    if (rows.length === 0) return 0
    const { count } = await prisma.apiError.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
    return count
  })

  const customEvents = await deleteInChunks(async (limit) => {
    const rows = await prisma.customEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    })
    if (rows.length === 0) return 0
    const { count } = await prisma.customEvent.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
    return count
  })

  const errorBuckets = await deleteInChunks(async (limit) => {
    const rows = await prisma.errorBucket.findMany({
      where: { bucketStart: { lt: cutoff } },
      select: { id: true },
      take: limit,
    })
    if (rows.length === 0) return 0
    const { count } = await prisma.errorBucket.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
    return count
  })

  const alertNotifications = await deleteInChunks(async (limit) => {
    const rows = await prisma.alertNotification.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: limit,
    })
    if (rows.length === 0) return 0
    const { count } = await prisma.alertNotification.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    })
    return count
  })

  // Refresh tokens follow their own clock: once expired or revoked they can
  // never be redeemed again, so they don't need the full retention window.
  const { count: refreshTokens } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null, lt: cutoff } }] },
  })

  return {
    cutoff,
    deleted: {
      performanceMetrics,
      apiErrors,
      customEvents,
      errorBuckets,
      alertNotifications,
      refreshTokens,
    },
  }
}
