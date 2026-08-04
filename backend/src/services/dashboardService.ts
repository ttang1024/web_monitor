import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { NotFoundError } from '../lib/errors.js'
import { BUCKET_MS } from './monitoringService.js'
import type { SaveLayoutInput } from '../types.js'
import type { ApiError, CustomEvent, ErrorLog, ErrorStatus } from '@prisma/client'

export interface DashboardStats {
  totalErrors: number
  totalEvents: number
  avgLoadTime: number
  errorRate: number
  errorTrend: { labels: string[]; values: number[] }
  performanceTrend: { labels: string[]; values: number[] }
  topErrors: { errorHash: string; type: string; message: string; count: number; lastSeen: Date }[]
  topSlowPages: { url: string; avgLoadTime: number; sampleCount: number }[]
}

export async function getDashboardStats(
  tenantId: string,
  startDate?: Date,
  endDate?: Date
): Promise<DashboardStats> {
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = endDate ?? new Date()

  // All aggregation happens in the database; date buckets use UTC to match
  // how Prisma stores DateTime values.
  const [errorAgg, perfAgg, errorTrendRows, perfTrendRows, topErrorRows, topSlowPages] = await Promise.all([
    prisma.errorLog.aggregate({
      where: { tenantId, createdAt: { gte: start, lte: end } },
      _sum: { occurrenceCount: true },
    }),
    prisma.performanceMetric.aggregate({
      where: { tenantId, createdAt: { gte: start, lte: end } },
      _count: true,
      _sum: { loadTime: true },
    }),
    prisma.$queryRaw<{ day: string; total: number }[]>(Prisma.sql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day,
             CAST(SUM(occurrenceCount) AS DOUBLE) AS total
      FROM \`ErrorLog\`
      WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end}
      GROUP BY day
      ORDER BY day ASC
    `),
    prisma.$queryRaw<{ day: string; avgLoadTime: number }[]>(Prisma.sql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day,
             CAST(AVG(COALESCE(loadTime, 0)) AS DOUBLE) AS avgLoadTime
      FROM \`PerformanceMetric\`
      WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end}
      GROUP BY day
      ORDER BY day ASC
    `),
    prisma.$queryRaw<{ errorHash: string; type: string; message: string; count: number; lastSeen: Date }[]>(Prisma.sql`
      SELECT errorHash,
             MAX(type) AS type,
             MAX(message) AS message,
             CAST(SUM(occurrenceCount) AS DOUBLE) AS count,
             MAX(COALESCE(updatedAt, createdAt)) AS lastSeen
      FROM \`ErrorLog\`
      WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end}
      GROUP BY errorHash
      ORDER BY count DESC
      LIMIT 5
    `),
    prisma.$queryRaw<{ url: string; avgLoadTime: number; sampleCount: number }[]>(Prisma.sql`
      SELECT url,
             CAST(AVG(COALESCE(loadTime, 0)) AS DOUBLE) AS avgLoadTime,
             CAST(COUNT(*) AS DOUBLE) AS sampleCount
      FROM \`PerformanceMetric\`
      WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end}
      GROUP BY url
      ORDER BY avgLoadTime DESC
      LIMIT 10
    `),
  ])

  const totalErrors = errorAgg._sum.occurrenceCount ?? 0
  const perfCount = perfAgg._count
  const totalEvents = totalErrors + perfCount
  const avgLoadTime = perfCount > 0 ? (perfAgg._sum.loadTime ?? 0) / perfCount : 0
  const errorRate = totalEvents > 0 ? (totalErrors / totalEvents) * 100 : 0

  return {
    totalErrors,
    totalEvents,
    avgLoadTime: Math.round(avgLoadTime * 100) / 100,
    errorRate: Math.round(errorRate * 100) / 100,
    errorTrend: {
      labels: errorTrendRows.map((row) => row.day),
      values: errorTrendRows.map((row) => row.total),
    },
    performanceTrend: {
      labels: perfTrendRows.map((row) => row.day),
      values: perfTrendRows.map((row) => row.avgLoadTime),
    },
    topErrors: topErrorRows,
    topSlowPages,
  }
}

export interface ErrorPage {
  total: number
  page: number
  pageSize: number
  data: ErrorLog[]
}

export interface ErrorFilters {
  page: number
  pageSize: number
  type?: string | null
  status?: ErrorStatus | null
  search?: string | null
  startDate?: Date | null
}

export async function getErrors(tenantId: string, filters: ErrorFilters): Promise<ErrorPage> {
  const { page, pageSize, type, status, search, startDate } = filters

  const where: Prisma.ErrorLogWhereInput = {
    tenantId,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(search ? { message: { contains: search } } : {}),
    ...(startDate ? { lastSeenAt: { gte: startDate } } : {}),
  }

  const [total, data] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { total, page, pageSize, data }
}

/** Counts per status, so the UI's tabs don't have to page through every row. */
export async function getErrorStatusCounts(tenantId: string): Promise<Record<ErrorStatus, number>> {
  const rows = await prisma.errorLog.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { _all: true },
  })

  const counts = { Unresolved: 0, Resolved: 0, Ignored: 0, Regressed: 0 } as Record<ErrorStatus, number>
  for (const row of rows) counts[row.status] = row._count._all
  return counts
}

export async function getErrorDetails(tenantId: string, id: string): Promise<ErrorLog> {
  const error = await prisma.errorLog.findFirst({ where: { id, tenantId } })
  if (!error) throw new NotFoundError('Error not found')
  return error
}

export async function updateErrorStatus(
  tenantId: string,
  id: string,
  status: ErrorStatus
): Promise<ErrorLog> {
  const error = await prisma.errorLog.findFirst({ where: { id, tenantId } })
  if (!error) throw new NotFoundError('Error not found')

  return prisma.errorLog.update({ where: { id: error.id }, data: { status } })
}

export interface ErrorTrendPoint {
  bucketStart: Date
  count: number
}

/**
 * Hourly occurrences for one issue, zero-filled so the sparkline has a point
 * per bucket instead of jumping across quiet hours.
 */
export async function getErrorTimeSeries(
  tenantId: string,
  errorHash: string,
  hours = 24
): Promise<ErrorTrendPoint[]> {
  const now = Date.now()
  const start = new Date(Math.floor((now - (hours - 1) * BUCKET_MS) / BUCKET_MS) * BUCKET_MS)

  const rows = await prisma.errorBucket.findMany({
    where: { tenantId, errorHash, bucketStart: { gte: start } },
    orderBy: { bucketStart: 'asc' },
  })

  const counts = new Map(rows.map((row) => [row.bucketStart.getTime(), row.count]))

  return Array.from({ length: hours }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * BUCKET_MS)
    return { bucketStart, count: counts.get(bucketStart.getTime()) ?? 0 }
  })
}

export interface PerformanceTimeSeriesPoint {
  timestamp: Date
  avgLoadTime: number
  avgTTFB: number
  avgLCP: number
  avgFCP: number
  count: number
}

export async function getPerformanceTimeSeries(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null,
  url?: string | null,
  interval: string = 'hour'
): Promise<PerformanceTimeSeriesPoint[]> {
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = endDate ?? new Date()

  const bucketFormat = interval.toLowerCase() === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00'

  const rows = await prisma.$queryRaw<
    { bucket: string; avgLoadTime: number; avgTTFB: number; avgLCP: number; avgFCP: number; count: number }[]
  >(Prisma.sql`
    SELECT DATE_FORMAT(createdAt, ${bucketFormat}) AS bucket,
           CAST(AVG(COALESCE(loadTime, 0)) AS DOUBLE) AS avgLoadTime,
           CAST(AVG(COALESCE(ttfb, 0)) AS DOUBLE) AS avgTTFB,
           CAST(AVG(COALESCE(lcp, 0)) AS DOUBLE) AS avgLCP,
           CAST(AVG(COALESCE(fcp, 0)) AS DOUBLE) AS avgFCP,
           CAST(COUNT(*) AS DOUBLE) AS count
    FROM \`PerformanceMetric\`
    WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end}
      ${url ? Prisma.sql`AND url = ${url}` : Prisma.empty}
    GROUP BY bucket
    ORDER BY bucket ASC
  `)

  // Buckets are computed from UTC-stored DateTime values, so parse them back as UTC.
  return rows.map((row) => ({
    timestamp: new Date(`${row.bucket.replace(' ', 'T')}Z`),
    avgLoadTime: row.avgLoadTime,
    avgTTFB: row.avgTTFB,
    avgLCP: row.avgLCP,
    avgFCP: row.avgFCP,
    count: row.count,
  }))
}

export interface WebVitalsSummary {
  lcp: number | null
  fcp: number | null
  cls: number | null
  fid: number | null
  ttfb: number | null
  sampleCount: number
}

/**
 * P75 of each Web Vital — the percentile Google's thresholds are defined
 * against, and far more honest than a mean when a few slow sessions dominate.
 */
export async function getWebVitals(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<WebVitalsSummary> {
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = endDate ?? new Date()

  const rows = await prisma.performanceMetric.findMany({
    where: { tenantId, createdAt: { gte: start, lte: end } },
    select: { lcp: true, fcp: true, cls: true, fid: true, ttfb: true },
  })

  const p75 = (values: (number | null)[]): number | null => {
    const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
    if (present.length === 0) return null
    return present[Math.min(present.length - 1, Math.floor(present.length * 0.75))]
  }

  return {
    lcp: p75(rows.map((row) => row.lcp)),
    fcp: p75(rows.map((row) => row.fcp)),
    cls: p75(rows.map((row) => row.cls)),
    fid: p75(rows.map((row) => row.fid)),
    ttfb: p75(rows.map((row) => row.ttfb)),
    sampleCount: rows.length,
  }
}

export interface BreakdownSlice {
  name: string
  count: number
}

/** Share of page loads per browser / os / device type, for the pie widgets. */
export async function getDeviceBreakdown(
  tenantId: string,
  dimension: 'browser' | 'os' | 'deviceType',
  startDate?: Date | null,
  endDate?: Date | null
): Promise<BreakdownSlice[]> {
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = endDate ?? new Date()

  const rows = await prisma.performanceMetric.groupBy({
    by: [dimension],
    where: { tenantId, createdAt: { gte: start, lte: end }, [dimension]: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { [dimension]: 'desc' } },
    take: 10,
  })

  return rows.map((row) => ({
    name: (row as Record<string, unknown>)[dimension] as string,
    count: row._count._all,
  }))
}

export interface ApiErrorPage {
  total: number
  page: number
  pageSize: number
  data: ApiError[]
}

export async function getApiErrors(
  tenantId: string,
  page: number,
  pageSize: number,
  startDate?: Date | null
): Promise<ApiErrorPage> {
  const where = { tenantId, ...(startDate ? { createdAt: { gte: startDate } } : {}) }

  const [total, data] = await Promise.all([
    prisma.apiError.count({ where }),
    prisma.apiError.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { total, page, pageSize, data }
}

export interface CustomEventPage {
  total: number
  page: number
  pageSize: number
  data: CustomEvent[]
}

export async function getCustomEvents(
  tenantId: string,
  page: number,
  pageSize: number,
  name?: string | null,
  startDate?: Date | null
): Promise<CustomEventPage> {
  const where = {
    tenantId,
    ...(name ? { eventName: name } : {}),
    ...(startDate ? { createdAt: { gte: startDate } } : {}),
  }

  const [total, data] = await Promise.all([
    prisma.customEvent.count({ where }),
    prisma.customEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { total, page, pageSize, data }
}

export interface BusinessFlowStat {
  flow: string
  total: number
  completed: number
  failed: number
  timedOut: number
  abandoned: number
  avgDurationMs: number
}

/**
 * Rolls the SDK's `business_flow` events up per flow name. This is the query
 * the flow layer exists for: how often does the journey actually finish?
 */
export async function getBusinessFlowStats(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<BusinessFlowStat[]> {
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const end = endDate ?? new Date()

  return prisma.$queryRaw<BusinessFlowStat[]>(Prisma.sql`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.flow')) AS flow,
           CAST(COUNT(*) AS DOUBLE) AS total,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"completed"') AS DOUBLE) AS completed,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"failed"') AS DOUBLE) AS failed,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"timeout"') AS DOUBLE) AS timedOut,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"abandoned"') AS DOUBLE) AS abandoned,
           CAST(AVG(JSON_EXTRACT(data, '$.durationMs')) AS DOUBLE) AS avgDurationMs
    FROM \`CustomEvent\`
    WHERE tenantId = ${tenantId}
      AND eventName = 'business_flow'
      AND createdAt >= ${start} AND createdAt <= ${end}
    GROUP BY flow
    ORDER BY total DESC
    LIMIT 20
  `)
}

export async function getUserLayouts(tenantId: string, userId: string) {
  return prisma.dashboardLayout.findMany({
    where: { tenantId, userId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

export async function saveLayout(tenantId: string, userId: string, input: SaveLayoutInput) {
  if (input.isDefault) {
    await prisma.dashboardLayout.updateMany({
      where: { tenantId, userId, isDefault: true },
      data: { isDefault: false },
    })
  }

  return prisma.dashboardLayout.create({
    data: {
      tenantId,
      userId,
      name: input.name,
      isDefault: input.isDefault,
      configuration: input.configuration ?? {},
    },
  })
}

export async function deleteLayout(tenantId: string, userId: string, layoutId: string): Promise<void> {
  const layout = await prisma.dashboardLayout.findFirst({ where: { id: layoutId, userId, tenantId } })
  if (!layout) throw new NotFoundError('Layout not found')

  await prisma.dashboardLayout.delete({ where: { id: layout.id } })
}
