import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The SQL itself is exercised against MySQL in monitoringService.int.test.ts;
// these tests cover grouping, idempotency and retry orchestration.
const tx = {
  $executeRaw: vi.fn(),
  ingestBatch: { create: vi.fn() },
  performanceMetric: { createMany: vi.fn() },
  apiError: { createMany: vi.fn() },
  customEvent: { createMany: vi.fn() },
}
const prismaMock = {
  $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  $executeRaw: vi.fn(),
}
const incrementEventCount = vi.fn()

vi.mock('../prisma.js', () => ({ prisma: prismaMock }))
vi.mock('./tenantService.js', () => ({ incrementEventCount }))

const { bucketStartFor, groupErrors, ingestBatch, resolveEventTime } = await import('./monitoringService.js')

const TENANT = 'tenant-1'
// Every test passes this as "now", so nothing depends on the real clock.
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

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test', meta })
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.$transaction.mockImplementation((fn) => fn(tx))
})

describe('bucketStartFor', () => {
  it('floors a timestamp to its UTC hour', () => {
    expect(bucketStartFor(NOW).toISOString()).toBe('2026-08-04T12:00:00.000Z')
  })

  it('puts timestamps in the same hour in the same bucket', () => {
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

describe('groupErrors', () => {
  it('collapses identical errors into one group with the summed count', () => {
    const { groups } = groupErrors([errorEvent(), errorEvent(), errorEvent()], NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].occurrences).toBe(3)
  })

  it('keeps errors with different signatures apart', () => {
    const { groups } = groupErrors([errorEvent(), errorEvent({ message: 'other' })], NOW)
    expect(groups).toHaveLength(2)
  })

  it('counts each occurrence into the hour it happened in', () => {
    const { buckets } = groupErrors([errorEvent(), errorEvent({ timestamp: NOW + 60 * 60 * 1000 })], NOW)
    expect(buckets.map((bucket) => [bucket.bucketStart.toISOString(), bucket.count])).toEqual([
      ['2026-08-04T12:00:00.000Z', 1],
      ['2026-08-04T13:00:00.000Z', 1],
    ])
  })

  it('records the latest occurrence as lastSeenAt', () => {
    const { groups } = groupErrors([errorEvent({ timestamp: NOW - 1_000 }), errorEvent()], NOW)
    expect(groups[0].lastSeenAt.getTime()).toBe(NOW)
  })

  it('orders groups by hash so concurrent batches lock rows in the same order', () => {
    const { groups } = groupErrors(
      ['a', 'b', 'c', 'd', 'e'].map((message) => errorEvent({ message })),
      NOW
    )
    const hashes = groups.map((group) => group.errorHash)
    expect(hashes).toEqual([...hashes].sort())
  })
})

describe('ingestBatch', () => {
  it('writes a whole batch in a fixed number of statements', async () => {
    await ingestBatch(
      TENANT,
      {
        errors: Array.from({ length: 50 }, (_, index) => errorEvent({ message: `distinct ${'x'.repeat(index)}` })),
        performance: [{ url: 'https://x', userAgent: 'ua', timestamp: NOW, metrics: { load: 1200 } }],
      },
      NOW
    )

    // One upsert for all errors, one for all buckets — not one per error.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2)
    expect(tx.performanceMetric.createMany).toHaveBeenCalledTimes(1)
  })

  it('bills every event in the batch once, after the write commits', async () => {
    await ingestBatch(
      TENANT,
      {
        errors: [errorEvent(), errorEvent()],
        apiErrors: [{ type: 'http_error', requestUrl: '/api', method: 'GET', url: 'https://x', userAgent: 'ua', timestamp: NOW }],
      },
      NOW
    )
    expect(incrementEventCount).toHaveBeenCalledWith(TENANT, 3)
  })

  it('skips a batch whose id was already stored', async () => {
    tx.ingestBatch.create.mockRejectedValueOnce(knownError('P2002'))

    const result = await ingestBatch(TENANT, { batchId: 'batch-0001', errors: [errorEvent()] }, NOW)

    expect(result).toEqual({ accepted: 0, duplicate: true })
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(incrementEventCount).not.toHaveBeenCalled()
  })

  it('retries a transaction chosen as a deadlock victim', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(knownError('P2034')).mockImplementation((fn) => fn(tx))

    const result = await ingestBatch(TENANT, { errors: [errorEvent()] }, NOW)

    expect(result.accepted).toBe(1)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2)
  })

  it('does not retry other failures', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('connection lost'))
    await expect(ingestBatch(TENANT, { errors: [errorEvent()] }, NOW)).rejects.toThrow('connection lost')
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it('does not touch the database for an empty batch', async () => {
    await ingestBatch(TENANT, {}, NOW)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(incrementEventCount).not.toHaveBeenCalled()
  })
})
