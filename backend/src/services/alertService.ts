import type { AlertCondition, AlertNotification, AlertRule, AlertSeverity } from '@prisma/client'
import { prisma } from '../prisma.js'
import { BadRequestError, NotFoundError } from '../lib/errors.js'

export interface AlertRuleInput {
  name: string
  condition: AlertCondition
  threshold: number
  windowMinutes: number
  severity: AlertSeverity
  cooldownMinutes: number
  webhookUrl?: string | null
  isEnabled?: boolean
}

// --- CRUD -------------------------------------------------------------------

export async function listAlertRules(tenantId: string): Promise<AlertRule[]> {
  return prisma.alertRule.findMany({
    where: { tenantId },
    orderBy: [{ isEnabled: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function createAlertRule(tenantId: string, input: AlertRuleInput): Promise<AlertRule> {
  return prisma.alertRule.create({
    data: {
      tenantId,
      name: input.name,
      condition: input.condition,
      threshold: input.threshold,
      windowMinutes: input.windowMinutes,
      severity: input.severity,
      cooldownMinutes: input.cooldownMinutes,
      webhookUrl: input.webhookUrl ?? null,
      isEnabled: input.isEnabled ?? true,
    },
  })
}

export async function updateAlertRule(
  tenantId: string,
  id: string,
  input: Partial<AlertRuleInput>
): Promise<AlertRule> {
  // Scoped by tenantId so one tenant cannot address another's rule by id.
  const existing = await prisma.alertRule.findFirst({ where: { id, tenantId } })
  if (!existing) throw new NotFoundError('Alert rule not found')

  return prisma.alertRule.update({
    where: { id: existing.id },
    data: {
      name: input.name ?? undefined,
      condition: input.condition ?? undefined,
      threshold: input.threshold ?? undefined,
      windowMinutes: input.windowMinutes ?? undefined,
      severity: input.severity ?? undefined,
      cooldownMinutes: input.cooldownMinutes ?? undefined,
      webhookUrl: input.webhookUrl === undefined ? undefined : input.webhookUrl,
      isEnabled: input.isEnabled ?? undefined,
    },
  })
}

export async function deleteAlertRule(tenantId: string, id: string): Promise<boolean> {
  const { count } = await prisma.alertRule.deleteMany({ where: { id, tenantId } })
  if (count === 0) throw new NotFoundError('Alert rule not found')
  return true
}

export type NotificationWithRule = AlertNotification & { rule: { name: string } | null }

export async function listNotifications(
  tenantId: string,
  { page = 1, pageSize = 50, unreadOnly = false }: { page?: number; pageSize?: number; unreadOnly?: boolean }
): Promise<{ total: number; page: number; pageSize: number; unread: number; data: NotificationWithRule[] }> {
  const size = Math.min(Math.max(pageSize, 1), 100)
  const current = Math.max(page, 1)
  const where = { tenantId, ...(unreadOnly ? { isRead: false } : {}) }

  const [total, unread, data] = await Promise.all([
    prisma.alertNotification.count({ where }),
    prisma.alertNotification.count({ where: { tenantId, isRead: false } }),
    prisma.alertNotification.findMany({
      where,
      // The rule's name is what the dashboard shows, and joining here keeps the
      // list to one query instead of one per notification.
      include: { rule: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (current - 1) * size,
      take: size,
    }),
  ])

  return { total, page: current, pageSize: size, unread, data }
}

export async function markNotificationsRead(tenantId: string, ids?: string[] | null): Promise<number> {
  const { count } = await prisma.alertNotification.updateMany({
    where: { tenantId, isRead: false, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { isRead: true },
  })
  return count
}

// --- Evaluation -------------------------------------------------------------

export interface EvaluationResult {
  /** Null when the rule's condition did not hold over its window. */
  observedValue: number | null
  title: string
  body: string
  errorHash?: string | null
}

/** True when the rule is still inside the quiet period after its last firing. */
export function isInCooldown(rule: Pick<AlertRule, 'lastTriggeredAt' | 'cooldownMinutes'>, now: Date): boolean {
  if (!rule.lastTriggeredAt) return false
  return now.getTime() - rule.lastTriggeredAt.getTime() < rule.cooldownMinutes * 60 * 1000
}

async function evaluateRule(rule: AlertRule, now: Date): Promise<EvaluationResult | null> {
  const since = new Date(now.getTime() - rule.windowMinutes * 60 * 1000)

  switch (rule.condition) {
    case 'NewIssue': {
      // An issue is "new" when its ErrorLog row was created inside the window —
      // the row is created once per distinct error hash, so this fires on first
      // sighting rather than on every recurrence.
      const issue = await prisma.errorLog.findFirst({
        where: { tenantId: rule.tenantId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      })
      if (!issue) return null

      return {
        observedValue: issue.occurrenceCount,
        errorHash: issue.errorHash,
        title: `New issue: ${issue.type}`,
        body: truncate(issue.message, 500),
      }
    }

    case 'ErrorSpike': {
      // ErrorBucket is hourly, so a window shorter than an hour would compare
      // against a partially-filled bucket. Summing buckets that start inside
      // the window is the closest honest read of "occurrences recently".
      const buckets = await prisma.errorBucket.aggregate({
        where: { tenantId: rule.tenantId, bucketStart: { gte: floorToHour(since) } },
        _sum: { count: true },
      })
      const occurrences = buckets._sum.count ?? 0
      if (occurrences <= rule.threshold) return null

      return {
        observedValue: occurrences,
        title: `Error spike: ${occurrences} occurrences`,
        body: `${occurrences} error occurrences in the last ${rule.windowMinutes} minutes, above the threshold of ${rule.threshold}.`,
      }
    }

    case 'ErrorRate': {
      const [errors, performance, apiErrors, customEvents] = await Promise.all([
        prisma.errorBucket.aggregate({
          where: { tenantId: rule.tenantId, bucketStart: { gte: floorToHour(since) } },
          _sum: { count: true },
        }),
        prisma.performanceMetric.count({ where: { tenantId: rule.tenantId, createdAt: { gte: since } } }),
        prisma.apiError.count({ where: { tenantId: rule.tenantId, createdAt: { gte: since } } }),
        prisma.customEvent.count({ where: { tenantId: rule.tenantId, createdAt: { gte: since } } }),
      ])

      const errorCount = errors._sum.count ?? 0
      const total = errorCount + performance + apiErrors + customEvents
      // With almost no traffic a single error reads as a huge percentage.
      // Requiring a floor keeps the rule from firing on statistical noise.
      if (total < 20) return null

      const rate = (errorCount / total) * 100
      if (rate <= rule.threshold) return null

      return {
        observedValue: Number(rate.toFixed(2)),
        title: `Error rate ${rate.toFixed(1)}%`,
        body: `${errorCount} of ${total} events in the last ${rule.windowMinutes} minutes were errors, above the threshold of ${rule.threshold}%.`,
      }
    }

    case 'SlowPageLoad': {
      const result = await prisma.performanceMetric.aggregate({
        where: { tenantId: rule.tenantId, createdAt: { gte: since }, loadTime: { not: null } },
        _avg: { loadTime: true },
        _count: { loadTime: true },
      })

      const average = result._avg.loadTime
      if (average === null || result._count.loadTime < 5) return null
      if (average <= rule.threshold) return null

      return {
        observedValue: Math.round(average),
        title: `Slow page loads: ${Math.round(average)}ms average`,
        body: `Average load time over ${result._count.loadTime} samples in the last ${rule.windowMinutes} minutes was ${Math.round(average)}ms, above the threshold of ${rule.threshold}ms.`,
      }
    }

    default:
      return null
  }
}

/**
 * Evaluates every enabled rule and records a notification for each that fires.
 *
 * Returns the notifications created, so the caller (and the tests) can see what
 * a sweep did without reading back through the database.
 */
export async function evaluateAlertRules(now = new Date()): Promise<AlertNotification[]> {
  const rules = await prisma.alertRule.findMany({ where: { isEnabled: true } })
  const fired: AlertNotification[] = []

  for (const rule of rules) {
    if (isInCooldown(rule, now)) continue

    let result: EvaluationResult | null
    try {
      result = await evaluateRule(rule, now)
    } catch {
      // One malformed or unlucky rule must not stop the rest of the sweep.
      continue
    }

    if (!result || result.observedValue === null) continue

    const notification = await prisma.alertNotification.create({
      data: {
        tenantId: rule.tenantId,
        alertRuleId: rule.id,
        title: result.title,
        body: result.body,
        severity: rule.severity,
        observedValue: result.observedValue,
        threshold: rule.threshold,
        errorHash: result.errorHash ?? null,
      },
    })

    // Stamped before delivery: a webhook that hangs must not let the next sweep
    // treat the rule as never having fired and alert all over again.
    await prisma.alertRule.update({ where: { id: rule.id }, data: { lastTriggeredAt: now } })

    fired.push(await deliver(rule, notification))
  }

  return fired
}

/** Posts the notification to the rule's webhook, if it has one. */
async function deliver(rule: AlertRule, notification: AlertNotification): Promise<AlertNotification> {
  if (!rule.webhookUrl) return notification

  try {
    const response = await fetch(rule.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule: rule.name,
        condition: rule.condition,
        severity: notification.severity,
        title: notification.title,
        body: notification.body,
        observedValue: notification.observedValue,
        threshold: notification.threshold,
        errorHash: notification.errorHash,
        triggeredAt: notification.createdAt.toISOString(),
      }),
      // An unresponsive endpoint would otherwise hold up the whole sweep.
      signal: AbortSignal.timeout(5_000),
    })

    if (!response.ok) {
      return recordDeliveryFailure(notification, `Webhook responded ${response.status}`)
    }

    return prisma.alertNotification.update({
      where: { id: notification.id },
      data: { deliveredAt: new Date() },
    })
  } catch (error) {
    return recordDeliveryFailure(notification, error instanceof Error ? error.message : 'Webhook delivery failed')
  }
}

function recordDeliveryFailure(notification: AlertNotification, message: string): Promise<AlertNotification> {
  // The notification stays either way — the dashboard is the record of what
  // fired, and a dead webhook must not also mean a lost alert.
  return prisma.alertNotification.update({
    where: { id: notification.id },
    data: { deliveryError: truncate(message, 500) },
  })
}

// --- Helpers ----------------------------------------------------------------

function floorToHour(date: Date): Date {
  const floored = new Date(date)
  floored.setMinutes(0, 0, 0)
  return floored
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Rejects rule input that would make a rule fire constantly or never. */
export function assertUsableRule(input: Pick<AlertRuleInput, 'condition' | 'threshold'>): void {
  if (input.condition === 'ErrorRate' && (input.threshold < 0 || input.threshold > 100)) {
    throw new BadRequestError('An error-rate threshold is a percentage between 0 and 100')
  }
  if (input.condition !== 'NewIssue' && input.threshold <= 0) {
    throw new BadRequestError('Threshold must be greater than zero for this condition')
  }
}
