import { beforeEach, describe, expect, it, vi } from 'vitest'

function table() {
  return { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }
}

const prismaMock = {
  performanceMetric: table(),
  apiError: table(),
  customEvent: table(),
  errorBucket: table(),
  alertNotification: table(),
  refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  ingestBatch: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  errorLog: table(),
}

vi.mock('../prisma.js', () => ({ prisma: prismaMock }))

const { pruneExpiredData } = await import('./retentionService.js')

const NOW = new Date('2026-08-04T12:00:00.000Z')

beforeEach(() => {
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) fn.mockClear()
  }
})

describe('pruneExpiredData', () => {
  it('cuts off at the retention window', async () => {
    const summary = await pruneExpiredData(NOW)

    // RETENTION_DAYS defaults to 90.
    expect(summary.cutoff.toISOString()).toBe('2026-05-06T12:00:00.000Z')
    expect(prismaMock.performanceMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: { lt: summary.cutoff } } })
    )
  })

  it('prunes error buckets by their bucket start, not their row age', async () => {
    const summary = await pruneExpiredData(NOW)

    expect(prismaMock.errorBucket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bucketStart: { lt: summary.cutoff } } })
    )
  })

  // ErrorLog is the issue list: an issue goes only once it has stopped
  // recurring, and never while someone has chosen to ignore it.
  it('prunes issues that have not recurred within the window, except ignored ones', async () => {
    const summary = await pruneExpiredData(NOW)
    expect(prismaMock.errorLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { lastSeenAt: { lt: summary.cutoff }, status: { not: 'Ignored' } } })
    )
  })

  it('expires ingest idempotency keys after a day', async () => {
    await pruneExpiredData(NOW)
    expect(prismaMock.ingestBatch.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-03T12:00:00.000Z') } },
    })
  })

  it('removes refresh tokens that expired, regardless of the retention window', async () => {
    await pruneExpiredData(NOW)

    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lt: NOW } }, { revokedAt: { not: null, lt: expect.any(Date) } }] },
    })
  })

  it('stops once a chunk comes back short', async () => {
    prismaMock.customEvent.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
    prismaMock.customEvent.deleteMany.mockResolvedValueOnce({ count: 2 })

    const summary = await pruneExpiredData(NOW)

    expect(summary.deleted.customEvents).toBe(2)
    // One short chunk is the whole table: no second pass.
    expect(prismaMock.customEvent.findMany).toHaveBeenCalledTimes(1)
  })

  it('keeps chunking while full chunks keep coming back', async () => {
    const fullChunk = Array.from({ length: 5_000 }, (_, index) => ({ id: `row-${index}` }))
    prismaMock.apiError.findMany
      .mockResolvedValueOnce(fullChunk)
      .mockResolvedValueOnce(fullChunk)
      .mockResolvedValueOnce([{ id: 'last' }])
    prismaMock.apiError.deleteMany
      .mockResolvedValueOnce({ count: 5_000 })
      .mockResolvedValueOnce({ count: 5_000 })
      .mockResolvedValueOnce({ count: 1 })

    const summary = await pruneExpiredData(NOW)

    expect(summary.deleted.apiErrors).toBe(10_001)
    expect(prismaMock.apiError.findMany).toHaveBeenCalledTimes(3)
  })

  it('deletes by id rather than re-running the age predicate', async () => {
    prismaMock.alertNotification.findMany.mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }])
    prismaMock.alertNotification.deleteMany.mockResolvedValueOnce({ count: 2 })

    await pruneExpiredData(NOW)

    // Deleting the exact rows just selected keeps each statement bounded, so a
    // sweep can't lock a table for the length of an unbounded range delete.
    expect(prismaMock.alertNotification.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['n1', 'n2'] } },
    })
  })
})
