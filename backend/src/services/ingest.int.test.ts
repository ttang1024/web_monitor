import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../prisma.js'
import { createTenant, resetDatabase } from '../test/db.js'
import { ingestBatch } from './monitoringService.js'
import { incrementEventCount } from './tenantService.js'
import {
  getCustomEventStats,
  getCustomEvents,
  getCustomMetricStats,
  getCustomMetricTimeSeries,
  getDashboardStats,
  getDeviceBreakdown,
  getApiErrors,
  getSlowRequests,
  getWebVitals,
  saveLayout,
} from './dashboardService.js'
import { pruneExpiredData } from './retentionService.js'
import { Lease } from '../scheduler.js'

const TENANT = 'tenant-1'
const NOW = Date.now()

function error(message: string, timestamp = NOW) {
  return { type: 'js_error', message, source: 'app.js', url: 'https://acme.test/x', userAgent: 'ua', timestamp }
}

function pageView(load: number | null, extra: Record<string, number> = {}) {
  return {
    url: 'https://acme.test/checkout',
    userAgent: 'ua',
    timestamp: NOW,
    metrics: { ...(load === null ? {} : { load }), ...extra },
  }
}

beforeEach(async () => {
  await resetDatabase()
  await createTenant(TENANT)
})

afterAll(() => prisma.$disconnect())

describe('ingestBatch (MySQL)', () => {
  it('creates one issue per fingerprint with summed occurrences and hourly buckets', async () => {
    await ingestBatch(TENANT, { errors: [error('Order 1 failed'), error('Order 2 failed'), error('other')] }, NOW)
    await ingestBatch(TENANT, { errors: [error('Order 3 failed')] }, NOW)

    const issues = await prisma.errorLog.findMany({ where: { tenantId: TENANT }, orderBy: { message: 'asc' } })
    expect(issues.map((issue) => [issue.message, issue.occurrenceCount])).toEqual([
      ['Order 1 failed', 3],
      ['other', 1],
    ])

    const buckets = await prisma.errorBucket.aggregate({ where: { tenantId: TENANT }, _sum: { count: true } })
    expect(buckets._sum.count).toBe(4)
  })

  it('flips a resolved issue to Regressed when it recurs', async () => {
    await ingestBatch(TENANT, { errors: [error('boom')] }, NOW)
    await prisma.errorLog.updateMany({ data: { status: 'Resolved' } })

    await ingestBatch(TENANT, { errors: [error('boom')] }, NOW)

    expect((await prisma.errorLog.findFirstOrThrow()).status).toBe('Regressed')
  })

  it('stores a batch id once: a retried batch is not counted twice', async () => {
    const batch = { batchId: 'batch-retry-1', errors: [error('boom')], performance: [pageView(1000)] }

    expect(await ingestBatch(TENANT, batch, NOW)).toEqual({ accepted: 2, duplicate: false })
    expect(await ingestBatch(TENANT, batch, NOW)).toEqual({ accepted: 0, duplicate: true })

    expect((await prisma.errorLog.findFirstOrThrow()).occurrenceCount).toBe(1)
    expect(await prisma.performanceMetric.count()).toBe(1)
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: TENANT } })).currentMonthEvents).toBe(2n)
  })

  it('survives concurrent batches for the same issue without losing counts', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        ingestBatch(TENANT, { batchId: `batch-concurrent-${index}`, errors: [error('hot'), error('hot')] }, NOW)
      )
    )
    expect((await prisma.errorLog.findFirstOrThrow()).occurrenceCount).toBe(20)
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: TENANT } })).currentMonthEvents).toBe(20n)
  })
})

describe('incrementEventCount (MySQL)', () => {
  it('starts a new month once the reset date has passed', async () => {
    await prisma.tenant.update({
      where: { id: TENANT },
      data: { currentMonthEvents: 99_999n, monthlyResetDate: new Date(NOW - 1_000) },
    })

    await incrementEventCount(TENANT, 5)

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: TENANT } })
    expect(tenant.currentMonthEvents).toBe(5n)
    expect(tenant.monthlyResetDate.getTime()).toBeGreaterThan(NOW)
  })
})

describe('dashboard queries (MySQL)', () => {
  const window = () => ({ start: new Date(NOW - 3_600_000 * 2), end: new Date(NOW + 60_000) })

  it('counts page views once and ignores vitals-only rows in load averages', async () => {
    // Two page views, each followed by the SDK's separate vitals row.
    await ingestBatch(
      TENANT,
      {
        performance: [pageView(1000), pageView(null, { lcp: 900 }), pageView(3000), pageView(null, { lcp: 1100 })],
      },
      NOW
    )

    const { start, end } = window()
    const stats = await getDashboardStats(TENANT, start, end)

    expect(stats.pageViews).toBe(2)
    expect(stats.avgLoadTime).toBe(2000)
    expect(stats.topSlowPages[0]).toMatchObject({ avgLoadTime: 2000, sampleCount: 2 })
  })

  it('counts errors that occurred in the window, not issues first seen in it', async () => {
    // An old issue, first seen two days ago...
    await ingestBatch(TENANT, { errors: [error('old issue', NOW - 2 * 86_400_000)] }, NOW - 2 * 86_400_000)
    // ...that recurs now.
    await ingestBatch(TENANT, { errors: [error('old issue'), error('old issue')] }, NOW)

    const { start, end } = window()
    const stats = await getDashboardStats(TENANT, start, end)

    expect(stats.totalErrors).toBe(2)
    expect(stats.topErrors).toEqual([expect.objectContaining({ message: 'old issue', count: 2 })])
    expect(stats.errorRate).toBe(100)
  })

  it('computes P75 web vitals in SQL', async () => {
    await ingestBatch(TENANT, { performance: [100, 200, 300, 400].map((lcp) => pageView(null, { lcp })) }, NOW)

    const { start, end } = window()
    const vitals = await getWebVitals(TENANT, start, end)

    // Same definition as before the move to SQL: sorted[floor(n * 0.75)].
    expect(vitals.lcp).toBe(400)
    expect(vitals.fcp).toBeNull()
  })

  it('saves a layout by name instead of piling up copies', async () => {
    const user = await prisma.user.create({
      data: { tenantId: TENANT, email: 'a@acme.test', passwordHash: 'x', firstName: 'A', lastName: 'B' },
    })

    await saveLayout(TENANT, user.id, {
      name: 'Default Dashboard',
      isDefault: true,
      configuration: { widgets: [1] },
    })
    await saveLayout(TENANT, user.id, {
      name: 'Default Dashboard',
      isDefault: true,
      configuration: { widgets: [2] },
    })

    const layouts = await prisma.dashboardLayout.findMany({ where: { userId: user.id } })
    expect(layouts).toHaveLength(1)
    expect(layouts[0].configuration).toEqual({ widgets: [2] })
  })
})

describe('route changes, INP and slow requests (MySQL)', () => {
  const window = () => ({ start: new Date(NOW - 3_600_000 * 2), end: new Date(NOW + 60_000) })
  const routeChange = { ...pageView(null), navigationType: 'route' as const, device: { browser: 'Chrome' } }

  function apiCall(type: string, requestUrl: string, durationMs: number, status: number | null = 200) {
    return { type, requestUrl, method: 'GET', status, durationMs, url: 'https://acme.test/x', userAgent: 'ua', timestamp: NOW }
  }

  it('counts single-page-app route changes as page views without touching load averages', async () => {
    await ingestBatch(
      TENANT,
      { performance: [{ ...pageView(1000), navigationType: 'load', device: { browser: 'Chrome' } }, routeChange, routeChange] },
      NOW
    )

    const { start, end } = window()
    const stats = await getDashboardStats(TENANT, start, end)
    expect(stats.pageViews).toBe(3)
    expect(stats.avgLoadTime).toBe(1000)
    expect(await getDeviceBreakdown(TENANT, 'browser', start, end)).toEqual([{ name: 'Chrome', count: 3 }])
  })

  it('stores INP and reports its P75', async () => {
    await ingestBatch(TENANT, { performance: [80, 120, 240, 600].map((inp) => pageView(null, { inp })) }, NOW)

    const { start, end } = window()
    expect((await getWebVitals(TENANT, start, end)).inp).toBe(600)
  })

  it('keeps slow requests out of API errors and groups them per endpoint', async () => {
    await ingestBatch(
      TENANT,
      {
        apiErrors: [
          apiCall('http_error', 'https://api.acme.test/cart', 300, 500),
          apiCall('slow_request', 'https://api.acme.test/search?q=a', 3000),
          apiCall('slow_request', 'https://api.acme.test/search?q=b', 5000),
        ],
      },
      NOW
    )

    const { start, end } = window()
    expect((await getApiErrors(TENANT, { startDate: start })).total).toBe(1)
    expect((await getDashboardStats(TENANT, start, end)).totalEvents).toBe(1)
    expect(await getSlowRequests(TENANT, start, end)).toEqual([
      { method: 'GET', url: 'https://api.acme.test/search', count: 2, avgDurationMs: 4000, maxDurationMs: 5000 },
    ])
  })
})

describe('custom events and metrics (MySQL)', () => {
  const window = () => ({ start: new Date(NOW - 3_600_000 * 2), end: new Date(NOW + 60_000) })

  function event(name: string, data: Record<string, unknown> = {}, userId: string | null = null) {
    return { name, data, userId, url: 'https://acme.test/x', userAgent: 'ua', timestamp: NOW }
  }

  const metric = (name: string, value: unknown) => event('metric', { metric: name, value })

  beforeEach(async () => {
    await ingestBatch(
      TENANT,
      {
        customEvents: [
          event('signup', { plan: 'pro' }, 'u1'),
          event('signup', { plan: 'free' }, 'u2'),
          event('signup', {}, 'u1'),
          event('export_clicked'),
          event('business_flow', { flow: 'checkout', status: 'completed' }),
          metric('search_ms', 100),
          metric('search_ms', 300),
          metric('search_ms', 'not a number'),
          event('metric', { value: 5 }),
        ],
      },
      NOW
    )
  })

  it('counts app events per name, leaving out the SDK metric and flow events', async () => {
    const { start, end } = window()
    const stats = await getCustomEventStats(TENANT, start, end)

    expect(stats.map(({ name, count, users }) => ({ name, count, users }))).toEqual([
      { name: 'signup', count: 3, users: 2 },
      { name: 'export_clicked', count: 1, users: 0 },
    ])
    expect(stats[0].lastSeen).toBeInstanceOf(Date)
  })

  it('summarises numeric metrics and skips malformed ones', async () => {
    const { start, end } = window()

    expect(await getCustomMetricStats(TENANT, start, end)).toEqual([
      { name: 'search_ms', count: 2, avg: 200, min: 100, max: 300 },
    ])
  })

  it('buckets one metric over time', async () => {
    const { start, end } = window()
    const series = await getCustomMetricTimeSeries(TENANT, 'search_ms', start, end)

    expect(series).toEqual([{ timestamp: expect.any(Date), avg: 200, count: 2 }])
  })

  it('lists occurrences of one event, or every app event when no name is given', async () => {
    const { start, end } = window()

    const signups = await getCustomEvents(TENANT, { name: 'signup', startDate: start, endDate: end })
    expect(signups.total).toBe(3)

    const all = await getCustomEvents(TENANT, { startDate: start, endDate: end })
    expect(all.data.map((row) => row.eventName).sort()).toEqual(['export_clicked', 'signup', 'signup', 'signup'])
  })
})

describe('retention (MySQL)', () => {
  it('prunes stale issues but keeps ignored ones', async () => {
    const old = NOW - 200 * 86_400_000
    await ingestBatch(TENANT, { errors: [error('stale', old), error('ignored', old)] }, old)
    await prisma.errorLog.updateMany({ where: { message: 'ignored' }, data: { status: 'Ignored' } })

    await pruneExpiredData(new Date(NOW))

    expect((await prisma.errorLog.findMany()).map((issue) => issue.message)).toEqual(['ignored'])
    expect(await prisma.errorBucket.count()).toBe(0)
  })
})

describe('scheduler lease (MySQL)', () => {
  it('lets exactly one instance hold the lease, and hands it over once released', async () => {
    const first = new Lease('test-lease', 60_000)
    const second = new Lease('test-lease', 60_000)

    expect(await first.renew()).toBe(true)
    expect(await second.renew()).toBe(false)
    expect(await first.renew()).toBe(true)

    await first.release()
    expect(await second.renew()).toBe(true)
  })

  it('takes over a lease whose holder stopped renewing', async () => {
    const dead = new Lease('test-lease', 1_000)
    await dead.renew(new Date(NOW - 10_000))

    expect(await new Lease('test-lease', 60_000).renew(new Date(NOW))).toBe(true)
  })
})
