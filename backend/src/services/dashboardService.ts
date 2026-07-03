import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { NotFoundError } from '../lib/errors.js'
import type { SaveLayoutInput } from '../types.js'
import type { ErrorLog } from '@prisma/client'

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

export async function getErrors(
  tenantId: string,
  page: number,
  pageSize: number,
  type?: string | null,
  startDate?: Date | null
): Promise<ErrorPage> {
  const where = {
    tenantId,
    ...(type ? { type } : {}),
    ...(startDate ? { createdAt: { gte: startDate } } : {}),
  }

  const [total, data] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { total, page, pageSize, data }
}

export async function getErrorDetails(tenantId: string, id: string): Promise<ErrorLog> {
  const error = await prisma.errorLog.findFirst({ where: { id, tenantId } })
  if (!error) throw new NotFoundError('Error not found')
  return error
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
