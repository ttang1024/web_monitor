import { Prisma } from '@prisma/client'
import type { ApiError, CustomEvent, ErrorLog, ErrorStatus } from '@prisma/client'
import { prisma } from '../prisma.js'
import { NotFoundError } from '../lib/errors.js'
import { BUCKET_MS } from './monitoringService.js'
import {
  PAGE_VIEW_SQL,
  PAGE_VIEW_WHERE,
  SLOW_REQUEST,
  bucketWindowSql,
  countEvents,
  errorRatePercent,
  resolveWindow,
} from './metrics.js'
import type { SaveLayoutInput } from '../types.js'

const round2 = (value: number) => Math.round(value * 100) / 100

export interface DashboardStats {
  totalErrors: number
  totalEvents: number
  pageViews: number
  avgLoadTime: number
  errorRate: number
  errorTrend: { labels: string[]; values: number[] }
  performanceTrend: { labels: string[]; values: number[] }
  topErrors: { errorHash: string; type: string; message: string; count: number; lastSeen: Date }[]
  topSlowPages: { url: string; avgLoadTime: number; sampleCount: number }[]
}

export async function getDashboardStats(tenantId: string, startDate?: Date | null, endDate?: Date | null): Promise<DashboardStats> {
  const window = resolveWindow(startDate, endDate)
  const { start, end } = window

  // Aggregation stays in the database; day labels are UTC dates.
  const [counts, loadAgg, errorTrendRows, perfTrendRows, topErrorRows, topSlowPages] = await Promise.all([
    countEvents(tenantId, window),
    prisma.performanceMetric.aggregate({
      where: { tenantId, createdAt: { gte: start, lte: end }, loadTime: { not: null } },
      _avg: { loadTime: true },
    }),
    prisma.$queryRaw<{ day: string; total: number }[]>(Prisma.sql`
      SELECT DATE_FORMAT(bucketStart, '%Y-%m-%d') AS day, CAST(SUM(count) AS DOUBLE) AS total
      FROM \`ErrorBucket\`
      WHERE ${bucketWindowSql(tenantId, window)}
      GROUP BY day
      ORDER BY day ASC
    `),
    prisma.$queryRaw<{ day: string; avgLoadTime: number }[]>(Prisma.sql`
      SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day, CAST(AVG(loadTime) AS DOUBLE) AS avgLoadTime
      FROM \`PerformanceMetric\`
      WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end} AND loadTime IS NOT NULL
      GROUP BY day
      ORDER BY day ASC
    `),
    // Occurrences inside the window (from buckets), joined to the issue for its details.
    prisma.$queryRaw<{ errorHash: string; type: string; message: string; count: number; lastSeen: Date }[]>(Prisma.sql`
      SELECT top.errorHash, log.type, log.message, CAST(top.total AS DOUBLE) AS count, log.lastSeenAt AS lastSeen
      FROM (
        SELECT errorHash, SUM(count) AS total
        FROM \`ErrorBucket\`
        WHERE ${bucketWindowSql(tenantId, window)}
        GROUP BY errorHash
        ORDER BY total DESC
        LIMIT 5
      ) AS top
      JOIN \`ErrorLog\` AS log ON log.tenantId = ${tenantId} AND log.errorHash = top.errorHash
      ORDER BY top.total DESC
    `),
    prisma.$queryRaw<{ url: string; avgLoadTime: number; sampleCount: number }[]>(Prisma.sql`
      SELECT url, CAST(AVG(loadTime) AS DOUBLE) AS avgLoadTime, CAST(COUNT(*) AS DOUBLE) AS sampleCount
      FROM \`PerformanceMetric\`
      WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end} AND loadTime IS NOT NULL
      GROUP BY url
      ORDER BY avgLoadTime DESC
      LIMIT 10
    `),
  ])

  return {
    totalErrors: counts.errors,
    totalEvents: counts.total,
    pageViews: counts.pageViews,
    avgLoadTime: round2(loadAgg._avg.loadTime ?? 0),
    errorRate: round2(errorRatePercent(counts)),
    errorTrend: { labels: errorTrendRows.map((row) => row.day), values: errorTrendRows.map((row) => row.total) },
    performanceTrend: {
      labels: perfTrendRows.map((row) => row.day),
      values: perfTrendRows.map((row) => row.avgLoadTime),
    },
    topErrors: topErrorRows,
    topSlowPages,
  }
}

export interface Page<T> {
  total: number
  page: number
  pageSize: number
  data: T[]
}

export interface PageArgs {
  page?: number | null
  pageSize?: number | null
}

/** Normalises paging arguments; a client can never ask for an unbounded page. */
function pageArgs({ page, pageSize }: PageArgs, maxPageSize = 200): { page: number; pageSize: number; skip: number } {
  const size = Math.min(Math.max(pageSize ?? 50, 1), maxPageSize)
  const current = Math.max(page ?? 1, 1)
  return { page: current, pageSize: size, skip: (current - 1) * size }
}

export interface ErrorFilters extends PageArgs {
  type?: string | null
  status?: ErrorStatus | null
  search?: string | null
  startDate?: Date | null
}

export async function getErrors(tenantId: string, filters: ErrorFilters): Promise<Page<ErrorLog>> {
  const { page, pageSize, skip } = pageArgs(filters)
  const { type, status, search, startDate } = filters

  const where: Prisma.ErrorLogWhereInput = {
    tenantId,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(search ? { message: { contains: search } } : {}),
    ...(startDate ? { lastSeenAt: { gte: startDate } } : {}),
  }

  const [total, data] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.findMany({ where, orderBy: { lastSeenAt: 'desc' }, skip, take: pageSize }),
  ])

  return { total, page, pageSize, data }
}

/** Counts per status, so the UI's tabs don't have to page through every row. */
export async function getErrorStatusCounts(tenantId: string): Promise<Record<ErrorStatus, number>> {
  const rows = await prisma.errorLog.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } })

  const counts: Record<ErrorStatus, number> = { Unresolved: 0, Resolved: 0, Ignored: 0, Regressed: 0 }
  for (const row of rows) counts[row.status] = row._count._all
  return counts
}

export async function updateErrorStatus(tenantId: string, id: string, status: ErrorStatus): Promise<ErrorLog> {
  const { count } = await prisma.errorLog.updateMany({ where: { id, tenantId }, data: { status } })
  if (count === 0) throw new NotFoundError('Error not found')
  return prisma.errorLog.findUniqueOrThrow({ where: { id } })
}

export interface ErrorTrendPoint {
  bucketStart: Date
  count: number
}

/** Hourly occurrences for one issue, zero-filled so the sparkline has a point per bucket. */
export async function getErrorTimeSeries(tenantId: string, errorHash: string, hours = 24): Promise<ErrorTrendPoint[]> {
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

/** SQL DATE_FORMAT pattern for an hourly or daily bucket. */
function bucketFormat(interval: string): string {
  return interval.toLowerCase() === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00'
}

/** Buckets are computed from UTC-stored DateTime values, so parse them back as UTC. */
function parseBucket(bucket: string): Date {
  return new Date(`${bucket.replace(' ', 'T')}Z`)
}

export interface PerformanceTimeSeriesPoint {
  timestamp: Date
  avgLoadTime: number
  avgTTFB: number
  avgLCP: number
  avgFCP: number
  /** Page views in the bucket. */
  count: number
}

export async function getPerformanceTimeSeries(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null,
  url?: string | null,
  interval: string = 'hour'
): Promise<PerformanceTimeSeriesPoint[]> {
  const { start, end } = resolveWindow(startDate, endDate)
  const format = bucketFormat(interval)

  // AVG skips NULLs, so each metric averages only the rows that report it —
  // page-timing rows for load/TTFB/FCP, vitals rows for LCP.
  const rows = await prisma.$queryRaw<
    { bucket: string; avgLoadTime: number; avgTTFB: number; avgLCP: number; avgFCP: number; count: number }[]
  >(Prisma.sql`
    SELECT DATE_FORMAT(createdAt, ${format}) AS bucket,
           CAST(COALESCE(AVG(loadTime), 0) AS DOUBLE) AS avgLoadTime,
           CAST(COALESCE(AVG(ttfb), 0) AS DOUBLE) AS avgTTFB,
           CAST(COALESCE(AVG(lcp), 0) AS DOUBLE) AS avgLCP,
           CAST(COALESCE(AVG(fcp), 0) AS DOUBLE) AS avgFCP,
           CAST(SUM(${PAGE_VIEW_SQL}) AS DOUBLE) AS count
    FROM \`PerformanceMetric\`
    WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end}
      ${url ? Prisma.sql`AND url = ${url}` : Prisma.empty}
    GROUP BY bucket
    ORDER BY bucket ASC
  `)

  return rows.map((row) => ({
    timestamp: parseBucket(row.bucket),
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
  inp: number | null
  ttfb: number | null
  sampleCount: number
}

const VITALS = ['lcp', 'fcp', 'cls', 'inp', 'ttfb'] as const

/**
 * P75 of each Web Vital — the percentile Google's thresholds are defined
 * against. Computed in MySQL with window functions, so only five numbers
 * cross the wire however many samples the window holds.
 */
export async function getWebVitals(tenantId: string, startDate?: Date | null, endDate?: Date | null): Promise<WebVitalsSummary> {
  const { start, end } = resolveWindow(startDate, endDate)

  const percentileQueries = VITALS.map((metric) => {
    const column = Prisma.raw(metric)
    return Prisma.sql`
      SELECT ${metric} AS metric, value FROM (
        SELECT ${column} AS value,
               ROW_NUMBER() OVER (ORDER BY ${column}) AS rn,
               COUNT(*) OVER () AS n
        FROM \`PerformanceMetric\`
        WHERE tenantId = ${tenantId} AND createdAt >= ${start} AND createdAt <= ${end} AND ${column} IS NOT NULL
      ) AS ranked
      WHERE rn = LEAST(n, FLOOR(n * 0.75) + 1)`
  })

  const [rows, sampleCount] = await Promise.all([
    prisma.$queryRaw<{ metric: (typeof VITALS)[number]; value: number }[]>(
      Prisma.join(percentileQueries, ' UNION ALL ')
    ),
    prisma.performanceMetric.count({ where: { tenantId, createdAt: { gte: start, lte: end }, loadTime: { not: null } } }),
  ])

  const summary: WebVitalsSummary = { lcp: null, fcp: null, cls: null, inp: null, ttfb: null, sampleCount }
  for (const row of rows) summary[row.metric] = Number(row.value)
  return summary
}

export interface BreakdownSlice {
  name: string
  count: number
}

/** Share of page views per browser / os / device type, for the pie widgets. */
export async function getDeviceBreakdown(
  tenantId: string,
  dimension: 'browser' | 'os' | 'deviceType',
  startDate?: Date | null,
  endDate?: Date | null
): Promise<BreakdownSlice[]> {
  const { start, end } = resolveWindow(startDate, endDate)

  const rows = await prisma.performanceMetric.groupBy({
    by: [dimension],
    where: { tenantId, createdAt: { gte: start, lte: end }, ...PAGE_VIEW_WHERE, [dimension]: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { [dimension]: 'desc' } },
    take: 10,
  })

  return rows.map((row) => ({
    name: (row as Record<string, unknown>)[dimension] as string,
    count: row._count._all,
  }))
}

export async function getApiErrors(tenantId: string, args: PageArgs & { startDate?: Date | null }): Promise<Page<ApiError>> {
  const { page, pageSize, skip } = pageArgs(args)
  const where = {
    tenantId,
    type: { not: SLOW_REQUEST },
    ...(args.startDate ? { createdAt: { gte: args.startDate } } : {}),
  }

  const [total, data] = await Promise.all([
    prisma.apiError.count({ where }),
    prisma.apiError.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  return { total, page, pageSize, data }
}

export interface SlowRequestStat {
  method: string
  url: string
  count: number
  avgDurationMs: number
  maxDurationMs: number
}

/** Endpoints behind the SDK's slow_request reports, grouped without query strings. */
export async function getSlowRequests(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<SlowRequestStat[]> {
  const { start, end } = resolveWindow(startDate, endDate)

  return prisma.$queryRaw<SlowRequestStat[]>(Prisma.sql`
    SELECT method,
           SUBSTRING_INDEX(requestUrl, '?', 1) AS url,
           CAST(COUNT(*) AS DOUBLE) AS count,
           CAST(AVG(durationMs) AS DOUBLE) AS avgDurationMs,
           CAST(MAX(durationMs) AS DOUBLE) AS maxDurationMs
    FROM \`ApiError\`
    WHERE tenantId = ${tenantId}
      AND type = ${SLOW_REQUEST}
      AND durationMs IS NOT NULL
      AND createdAt >= ${start} AND createdAt <= ${end}
    GROUP BY method, url
    ORDER BY count DESC, avgDurationMs DESC
    LIMIT 20
  `)
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

/** Rolls the SDK's `business_flow` events up per flow name: how often does the journey finish? */
export async function getBusinessFlowStats(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<BusinessFlowStat[]> {
  const { start, end } = resolveWindow(startDate, endDate)

  return prisma.$queryRaw<BusinessFlowStat[]>(Prisma.sql`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.flow')) AS flow,
           CAST(COUNT(*) AS DOUBLE) AS total,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"completed"') AS DOUBLE) AS completed,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"failed"') AS DOUBLE) AS failed,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"timeout"') AS DOUBLE) AS timedOut,
           CAST(SUM(JSON_EXTRACT(data, '$.status') = '"abandoned"') AS DOUBLE) AS abandoned,
           CAST(COALESCE(AVG(JSON_EXTRACT(data, '$.durationMs')), 0) AS DOUBLE) AS avgDurationMs
    FROM \`CustomEvent\`
    WHERE tenantId = ${tenantId}
      AND eventName = 'business_flow'
      AND createdAt >= ${start} AND createdAt <= ${end}
    GROUP BY flow
    ORDER BY total DESC
    LIMIT 20
  `)
}

// --- Custom events and metrics ---------------------------------------------
// The SDK sends three kinds of custom event: business_flow (startFlow), metric
// (captureMetric, with { metric, value } in data), and whatever names the app
// passes to captureCustomEvent. Flows have their own roll-up above.

const RESERVED_EVENT_NAMES = ['metric', 'business_flow']

/** Only metric events whose name is a string and value a number are counted. */
const VALID_METRIC_SQL = Prisma.sql`eventName = 'metric'
  AND JSON_TYPE(JSON_EXTRACT(data, '$.metric')) = 'STRING'
  AND JSON_TYPE(JSON_EXTRACT(data, '$.value')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE', 'DECIMAL')`

const METRIC_VALUE_SQL = Prisma.sql`CAST(JSON_EXTRACT(data, '$.value') AS DOUBLE)`

export interface CustomEventStat {
  name: string
  count: number
  users: number
  lastSeen: Date
}

export async function getCustomEventStats(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<CustomEventStat[]> {
  const { start, end } = resolveWindow(startDate, endDate)

  return prisma.$queryRaw<CustomEventStat[]>(Prisma.sql`
    SELECT eventName AS name,
           CAST(COUNT(*) AS DOUBLE) AS count,
           CAST(COUNT(DISTINCT userId) AS DOUBLE) AS users,
           MAX(createdAt) AS lastSeen
    FROM \`CustomEvent\`
    WHERE tenantId = ${tenantId}
      AND eventName NOT IN (${Prisma.join(RESERVED_EVENT_NAMES)})
      AND createdAt >= ${start} AND createdAt <= ${end}
    GROUP BY eventName
    ORDER BY count DESC
    LIMIT 50
  `)
}

export interface CustomMetricStat {
  name: string
  count: number
  avg: number
  min: number
  max: number
}

export async function getCustomMetricStats(
  tenantId: string,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<CustomMetricStat[]> {
  const { start, end } = resolveWindow(startDate, endDate)

  return prisma.$queryRaw<CustomMetricStat[]>(Prisma.sql`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.metric')) AS name,
           CAST(COUNT(*) AS DOUBLE) AS count,
           CAST(AVG(${METRIC_VALUE_SQL}) AS DOUBLE) AS avg,
           CAST(MIN(${METRIC_VALUE_SQL}) AS DOUBLE) AS min,
           CAST(MAX(${METRIC_VALUE_SQL}) AS DOUBLE) AS max
    FROM \`CustomEvent\`
    WHERE tenantId = ${tenantId}
      AND ${VALID_METRIC_SQL}
      AND createdAt >= ${start} AND createdAt <= ${end}
    GROUP BY name
    ORDER BY count DESC
    LIMIT 50
  `)
}

export interface CustomMetricPoint {
  timestamp: Date
  avg: number
  count: number
}

export async function getCustomMetricTimeSeries(
  tenantId: string,
  metric: string,
  startDate?: Date | null,
  endDate?: Date | null,
  interval: string = 'hour'
): Promise<CustomMetricPoint[]> {
  const { start, end } = resolveWindow(startDate, endDate)

  const rows = await prisma.$queryRaw<{ bucket: string; avg: number; count: number }[]>(Prisma.sql`
    SELECT DATE_FORMAT(createdAt, ${bucketFormat(interval)}) AS bucket,
           CAST(AVG(${METRIC_VALUE_SQL}) AS DOUBLE) AS avg,
           CAST(COUNT(*) AS DOUBLE) AS count
    FROM \`CustomEvent\`
    WHERE tenantId = ${tenantId}
      AND ${VALID_METRIC_SQL}
      AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.metric')) = ${metric}
      AND createdAt >= ${start} AND createdAt <= ${end}
    GROUP BY bucket
    ORDER BY bucket ASC
  `)

  return rows.map((row) => ({ timestamp: parseBucket(row.bucket), avg: row.avg, count: row.count }))
}

export async function getCustomEvents(
  tenantId: string,
  args: PageArgs & { name?: string | null; startDate?: Date | null; endDate?: Date | null }
): Promise<Page<CustomEvent>> {
  const { page, pageSize, skip } = pageArgs(args)
  const { start, end } = resolveWindow(args.startDate, args.endDate)
  const where: Prisma.CustomEventWhereInput = {
    tenantId,
    eventName: args.name ? args.name : { notIn: RESERVED_EVENT_NAMES },
    createdAt: { gte: start, lte: end },
  }

  const [total, data] = await Promise.all([
    prisma.customEvent.count({ where }),
    prisma.customEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
  ])
  return { total, page, pageSize, data }
}

export async function getUserLayouts(tenantId: string, userId: string) {
  return prisma.dashboardLayout.findMany({
    where: { tenantId, userId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

/** Creates or replaces the user's layout with this name; at most one is the default. */
export async function saveLayout(tenantId: string, userId: string, input: SaveLayoutInput) {
  const configuration = (input.configuration ?? {}) as Prisma.InputJsonValue

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.dashboardLayout.updateMany({
        where: { tenantId, userId, isDefault: true, NOT: { name: input.name } },
        data: { isDefault: false },
      })
    }

    return tx.dashboardLayout.upsert({
      where: { userId_name: { userId, name: input.name } },
      create: { tenantId, userId, name: input.name, isDefault: input.isDefault, configuration },
      update: { isDefault: input.isDefault, configuration },
    })
  })
}
