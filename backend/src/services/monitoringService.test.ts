import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  errorLog: { upsert: vi.fn(), updateMany: vi.fn() },
  errorBucket: { upsert: vi.fn() },
  performanceMetric: { create: vi.fn(), createMany: vi.fn() },
  apiError: { create: vi.fn(), createMany: vi.fn() },
  customEvent: { create: vi.fn(), createMany: vi.fn() },
  tenant: { updateMany: vi.fn() },
}

vi.mock('../prisma.js', () => ({ prisma: prismaMock }))

const { bucketStartFor, ingestBatch, resolveEventTime } = await import('./monitoringService.js')

const TENANT = 'tenant-1'
const NOW = Date.UTC(2026, 7, 4, 12, 34, 56)

function errorEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'js_error',
    message: 'boom',
    source: 'app.js',
    url: 'https://example.com/checkout',
    userAgent: 'Mozilla/5.0',
    timestamp: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.tenant.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.errorLog.updateMany.mockResolvedValue({ count: 0 })
})

describe('bucketStartFor', () => {
  it('floors a timestamp to its hour', () => {
    expect(bucketStartFor(NOW).toISOString()).toBe('2026-08-04T12:00:00.000Z')
  })

  it('puts timestamps in the same hour in the same bucket', () => {
    // 12:34:56 and 12:54:56 share a bucket; 13:34:56 starts a new one.
    expect(bucketStartFor(NOW).getTime()).toBe(bucketStartFor(NOW + 20 * 60 * 1000).getTime())
    expect(bucketStartFor(NOW).getTime()).not.toBe(bucketStartFor(NOW + 60 * 60 * 1000).getTime())
  })
})

describe('resolveEventTime', () => {
  it('keeps a plausible client timestamp', () => {
    expect(resolveEventTime(NOW - 5_000, NOW).getTime()).toBe(NOW - 5_000)
  })

  it('falls back to server time when the browser clock is far off', () => {
    expect(resolveEventTime(0, NOW).getTime()).toBe(NOW)
    expect(resolveEventTime(NOW + 400 * 24 * 3_600_000, NOW).getTime()).toBe(NOW)
  })
})

describe('ingestBatch', () => {
  it('collapses identical errors into one upsert with the summed count', async () => {
    await ingestBatch(TENANT, { errors: [errorEvent(), errorEvent(), errorEvent()] })

    expect(prismaMock.errorLog.upsert).toHaveBeenCalledTimes(1)
    const call = prismaMock.errorLog.upsert.mock.calls[0][0]
    expect(call.create.occurrenceCount).toBe(3)
    expect(call.update.occurrenceCount).toEqual({ increment: 3 })
  })

  it('keeps errors with different signatures apart', async () => {
    await ingestBatch(TENANT, {
      errors: [errorEvent(), errorEvent({ message: 'other boom' }), errorEvent({ source: 'vendor.js' })],
    })

    expect(prismaMock.errorLog.upsert).toHaveBeenCalledTimes(3)
  })

  it('records an hourly bucket per error group so issues have a trend', async () => {
    await ingestBatch(TENANT, { errors: [errorEvent(), errorEvent()] })

    expect(prismaMock.errorBucket.upsert).toHaveBeenCalledTimes(1)
    const call = prismaMock.errorBucket.upsert.mock.calls[0][0]
    expect(call.create.count).toBe(2)
    expect(call.create.bucketStart.toISOString()).toBe('2026-08-04T12:00:00.000Z')
  })

  it('reopens a resolved error as a regression', async () => {
    await ingestBatch(TENANT, { errors: [errorEvent()] })

    expect(prismaMock.errorLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'Resolved' }),
        data: { status: 'Regressed' },
      })
    )
  })

  it('writes the other event types in bulk', async () => {
    await ingestBatch(TENANT, {
      performance: [
        {
          url: 'https://example.com/',
          userAgent: 'UA',
          timestamp: NOW,
          metrics: { lcp: 2000, load: 3000 },
          device: { type: 'desktop', browser: 'Chrome', os: 'macOS' },
        },
      ],
      apiErrors: [
        {
          type: 'http_error',
          requestUrl: 'https://api.example.com/cart',
          method: 'POST',
          status: 500,
          url: 'https://example.com/',
          userAgent: 'UA',
          timestamp: NOW,
        },
      ],
      customEvents: [
        { name: 'signup', url: 'https://example.com/', userAgent: 'UA', timestamp: NOW, data: { plan: 'pro' } },
      ],
    })

    expect(prismaMock.performanceMetric.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.apiError.createMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.customEvent.createMany).toHaveBeenCalledTimes(1)
  })

  it('bills every event in the batch, not every write', async () => {
    await ingestBatch(TENANT, {
      errors: [errorEvent(), errorEvent()],
      customEvents: [
        { name: 'signup', url: 'https://example.com/', userAgent: 'UA', timestamp: NOW, data: {} },
      ],
    })

    expect(prismaMock.tenant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentMonthEvents: { increment: 3 } } })
    )
  })

  it('does not touch the database for an empty batch', async () => {
    await ingestBatch(TENANT, {})

    expect(prismaMock.errorLog.upsert).not.toHaveBeenCalled()
    expect(prismaMock.performanceMetric.createMany).not.toHaveBeenCalled()
    expect(prismaMock.tenant.updateMany).not.toHaveBeenCalled()
  })
})
