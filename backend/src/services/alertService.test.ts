import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  alertRule: { findMany: vi.fn(), update: vi.fn() },
  alertNotification: { create: vi.fn(), update: vi.fn() },
  errorLog: { findFirst: vi.fn() },
  errorBucket: { aggregate: vi.fn() },
  performanceMetric: { aggregate: vi.fn(), count: vi.fn() },
  apiError: { count: vi.fn() },
  customEvent: { count: vi.fn() },
}

vi.mock('../prisma.js', () => ({ prisma: prismaMock }))

const { assertUsableRule, evaluateAlertRules, isInCooldown } = await import('./alertService.js')
const { BadRequestError } = await import('../lib/errors.js')

const NOW = new Date('2026-08-04T12:00:00.000Z')

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    tenantId: 'tenant-1',
    name: 'Spike',
    condition: 'ErrorSpike',
    threshold: 100,
    windowMinutes: 60,
    severity: 'Warning',
    isEnabled: true,
    cooldownMinutes: 60,
    lastTriggeredAt: null,
    webhookUrl: null,
    createdAt: NOW,
    updatedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.alertNotification.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'notification-1', createdAt: NOW, ...data })
  )
  prismaMock.alertRule.update.mockResolvedValue({})
  prismaMock.alertNotification.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'notification-1', createdAt: NOW, ...data })
  )
  // Quiet defaults; each test overrides only what its condition reads.
  prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 0 } })
  prismaMock.performanceMetric.count.mockResolvedValue(0)
  prismaMock.apiError.count.mockResolvedValue(0)
  prismaMock.customEvent.count.mockResolvedValue(0)
})

describe('isInCooldown', () => {
  it('is false for a rule that has never fired', () => {
    expect(isInCooldown({ lastTriggeredAt: null, cooldownMinutes: 60 }, NOW)).toBe(false)
  })

  it('is true inside the cooldown window', () => {
    const lastTriggeredAt = new Date(NOW.getTime() - 30 * 60 * 1000)
    expect(isInCooldown({ lastTriggeredAt, cooldownMinutes: 60 }, NOW)).toBe(true)
  })

  it('is false once the cooldown has elapsed', () => {
    const lastTriggeredAt = new Date(NOW.getTime() - 61 * 60 * 1000)
    expect(isInCooldown({ lastTriggeredAt, cooldownMinutes: 60 }, NOW)).toBe(false)
  })
})

describe('evaluateAlertRules', () => {
  it('fires ErrorSpike once occurrences pass the threshold', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule()])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 150 } })

    const fired = await evaluateAlertRules(NOW)

    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ observedValue: 150, threshold: 100, severity: 'Warning' })
  })

  it('does not fire ErrorSpike at exactly the threshold', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule()])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 100 } })

    expect(await evaluateAlertRules(NOW)).toEqual([])
    expect(prismaMock.alertNotification.create).not.toHaveBeenCalled()
  })

  it('skips a rule that is still in cooldown', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([
      rule({ lastTriggeredAt: new Date(NOW.getTime() - 10 * 60 * 1000) }),
    ])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 5_000 } })

    expect(await evaluateAlertRules(NOW)).toEqual([])
    // Cooldown must short-circuit before the query, not after.
    expect(prismaMock.errorBucket.aggregate).not.toHaveBeenCalled()
  })

  it('stamps lastTriggeredAt so the next sweep respects the cooldown', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule()])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 150 } })

    await evaluateAlertRules(NOW)

    expect(prismaMock.alertRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { lastTriggeredAt: NOW },
    })
  })

  it('reports a NewIssue with the hash so the dashboard can link to it', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ condition: 'NewIssue', threshold: 0 })])
    prismaMock.errorLog.findFirst.mockResolvedValue({
      errorHash: 'abc123',
      type: 'js_error',
      message: 'Cannot read properties of undefined',
      occurrenceCount: 3,
    })

    const fired = await evaluateAlertRules(NOW)

    expect(fired[0]).toMatchObject({ errorHash: 'abc123', observedValue: 3 })
    expect(fired[0].title).toContain('js_error')
  })

  it('ignores ErrorRate on traffic too small to be meaningful', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ condition: 'ErrorRate', threshold: 5 })])
    // 1 error out of 4 events is 25%, but four events prove nothing.
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 1 } })
    prismaMock.performanceMetric.count.mockResolvedValue(3)

    expect(await evaluateAlertRules(NOW)).toEqual([])
  })

  it('fires ErrorRate once there is enough traffic', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ condition: 'ErrorRate', threshold: 5 })])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 10 } })
    prismaMock.performanceMetric.count.mockResolvedValue(90)

    const fired = await evaluateAlertRules(NOW)
    expect(fired[0].observedValue).toBe(10)
  })

  it('ignores SlowPageLoad below the minimum sample count', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ condition: 'SlowPageLoad', threshold: 2_000 })])
    prismaMock.performanceMetric.aggregate.mockResolvedValue({
      _avg: { loadTime: 9_000 },
      _count: { loadTime: 2 },
    })

    expect(await evaluateAlertRules(NOW)).toEqual([])
  })

  it('fires SlowPageLoad on a slow enough average', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ condition: 'SlowPageLoad', threshold: 2_000 })])
    prismaMock.performanceMetric.aggregate.mockResolvedValue({
      _avg: { loadTime: 3_500.4 },
      _count: { loadTime: 40 },
    })

    const fired = await evaluateAlertRules(NOW)
    expect(fired[0].observedValue).toBe(3_500)
  })

  it('keeps evaluating after one rule throws', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([
      rule({ id: 'broken', condition: 'NewIssue' }),
      rule({ id: 'healthy' }),
    ])
    prismaMock.errorLog.findFirst.mockRejectedValue(new Error('query failed'))
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 150 } })

    const fired = await evaluateAlertRules(NOW)

    expect(fired).toHaveLength(1)
    expect(prismaMock.alertRule.update).toHaveBeenCalledWith({
      where: { id: 'healthy' },
      data: { lastTriggeredAt: NOW },
    })
  })

  it('records the notification even when webhook delivery fails', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ webhookUrl: 'https://hooks.example.com/x' })])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 150 } })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')))

    const fired = await evaluateAlertRules(NOW)

    expect(fired).toHaveLength(1)
    expect(prismaMock.alertNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deliveryError: 'connect ECONNREFUSED' } })
    )
    vi.unstubAllGlobals()
  })

  it('marks a notification delivered on a successful webhook', async () => {
    prismaMock.alertRule.findMany.mockResolvedValue([rule({ webhookUrl: 'https://hooks.example.com/x' })])
    prismaMock.errorBucket.aggregate.mockResolvedValue({ _sum: { count: 150 } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await evaluateAlertRules(NOW)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.example.com/x',
      expect.objectContaining({ method: 'POST' })
    )
    expect(prismaMock.alertNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deliveredAt: expect.any(Date) } })
    )
    vi.unstubAllGlobals()
  })
})

describe('assertUsableRule', () => {
  it('rejects an error-rate threshold outside 0-100', () => {
    expect(() => assertUsableRule({ condition: 'ErrorRate', threshold: 150 })).toThrow(BadRequestError)
  })

  it('rejects a zero threshold on a counting condition', () => {
    // Zero would make the rule fire on every sweep forever.
    expect(() => assertUsableRule({ condition: 'ErrorSpike', threshold: 0 })).toThrow(BadRequestError)
  })

  it('allows a zero threshold for NewIssue, which does not use one', () => {
    expect(() => assertUsableRule({ condition: 'NewIssue', threshold: 0 })).not.toThrow()
  })
})
