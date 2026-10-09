import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { BUCKET_MS } from './monitoringService.js'

/**
 * The single definition of "how many events" and "error rate", shared by the
 * dashboard and alert evaluation so the two can never disagree.
 *
 * - Errors are occurrences, read from the hourly ErrorBucket counters. (The
 *   ErrorLog row is one per issue and its count is all-time, so it can't
 *   answer "how many in this window".) Buckets are hourly, so a window is
 *   widened to the start of its first hour.
 * - Page views are full page loads (performance rows with a load time) plus
 *   single-page-app route changes. The SDK sends a second row per load with
 *   only Web Vitals; counting it would double page views. Load-time averages
 *   use loadTime alone, which route changes and vitals rows leave null.
 * - API errors are failed requests. Successful requests the SDK reports as
 *   slow share the table but are not errors.
 */

export const PAGE_VIEW_WHERE: Prisma.PerformanceMetricWhereInput = {
  OR: [{ loadTime: { not: null } }, { navigationType: 'route' }],
}
export const PAGE_VIEW_SQL = Prisma.sql`(loadTime IS NOT NULL OR navigationType = 'route')`
export const SLOW_REQUEST = 'slow_request'

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** Longest window a query may span: bounded so a request can't scan everything ever stored. */
const MAX_WINDOW_MS = 400 * 24 * 60 * 60 * 1000

export interface TimeWindow {
  start: Date
  end: Date
}

/** Applies the default (last 7 days) and the maximum span to a requested window. */
export function resolveWindow(start?: Date | null, end?: Date | null, now = Date.now()): TimeWindow {
  const resolvedEnd = end ?? new Date(now)
  let resolvedStart = start ?? new Date(resolvedEnd.getTime() - DEFAULT_WINDOW_MS)
  if (resolvedEnd.getTime() - resolvedStart.getTime() > MAX_WINDOW_MS) {
    resolvedStart = new Date(resolvedEnd.getTime() - MAX_WINDOW_MS)
  }
  return { start: resolvedStart, end: resolvedEnd }
}

export function floorToBucket(date: Date): Date {
  return new Date(Math.floor(date.getTime() / BUCKET_MS) * BUCKET_MS)
}

/** SQL predicate selecting the ErrorBucket rows that fall in a window. */
export function bucketWindowSql(tenantId: string, window: TimeWindow, alias = ''): Prisma.Sql {
  const column = (name: string) => Prisma.raw(alias ? `${alias}.${name}` : name)
  return Prisma.sql`${column('tenantId')} = ${tenantId}
    AND ${column('bucketStart')} >= ${floorToBucket(window.start)}
    AND ${column('bucketStart')} <= ${window.end}`
}

export interface EventCounts {
  errors: number
  pageViews: number
  apiErrors: number
  customEvents: number
  total: number
}

export async function countEvents(tenantId: string, window: TimeWindow): Promise<EventCounts> {
  const range = { gte: window.start, lte: window.end }
  const [errors, pageViews, apiErrors, customEvents] = await Promise.all([
    prisma.errorBucket.aggregate({
      where: { tenantId, bucketStart: { gte: floorToBucket(window.start), lte: window.end } },
      _sum: { count: true },
    }),
    prisma.performanceMetric.count({ where: { tenantId, createdAt: range, ...PAGE_VIEW_WHERE } }),
    prisma.apiError.count({ where: { tenantId, createdAt: range, type: { not: SLOW_REQUEST } } }),
    prisma.customEvent.count({ where: { tenantId, createdAt: range } }),
  ])

  const errorCount = errors._sum.count ?? 0
  return {
    errors: errorCount,
    pageViews,
    apiErrors,
    customEvents,
    total: errorCount + pageViews + apiErrors + customEvents,
  }
}

/** Errors as a percentage of all events. */
export function errorRatePercent(counts: Pick<EventCounts, 'errors' | 'total'>): number {
  return counts.total > 0 ? (counts.errors / counts.total) * 100 : 0
}
