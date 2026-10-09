import { prisma } from '../prisma.js'
import { UnauthorizedError, RateLimitedError } from './errors.js'
import { isOriginAllowed, parseAllowedOrigins } from './origin.js'

/**
 * Key lookups are cached per process. The TTL is the bound on how long a key
 * revoked through another API instance keeps working here, so it is short.
 * Unknown keys are cached too: otherwise every request carrying a junk key is
 * a database round trip.
 */
const KEY_TTL_MS = 30 * 1000
/** How stale a tenant's "over its monthly quota" verdict may get. */
const QUOTA_TTL_MS = 10 * 1000
const MAX_ENTRIES = 50_000

type CachedKey =
  | { valid: true; apiKeyId: string; tenantId: string; allowedOrigins: string[]; expiresAt: number }
  | { valid: false; message: string; expiresAt: number }

interface CachedQuota {
  exceeded: boolean
  limit: string
  expiresAt: number
}

const keyCache = new Map<string, CachedKey>()
const quotaCache = new Map<string, CachedQuota>()

export interface ResolvedApiKey {
  apiKeyId: string
  tenantId: string
}

/** Drops a key from this instance's cache (revocation, allowlist edits). */
export function invalidateApiKey(apiKey: string): void {
  keyCache.delete(apiKey)
}

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  // Map preserves insertion order, so the first key is the oldest entry.
  if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value as string)
  map.set(key, value)
}

async function loadKey(apiKey: string, now: number): Promise<CachedKey> {
  const entity = await prisma.apiKey.findUnique({ where: { key: apiKey }, include: { tenant: true } })
  const expiresAt = now + KEY_TTL_MS

  if (!entity || !entity.isActive || !entity.tenant.isActive) {
    return { valid: false, message: 'Invalid API Key', expiresAt }
  }
  if (entity.expiresAt && entity.expiresAt.getTime() < now) {
    return { valid: false, message: 'API Key expired', expiresAt }
  }

  remember(quotaCache, entity.tenantId, quotaFrom(entity.tenant, now))

  // Best-effort bookkeeping, at most once per cache period; don't block on it.
  prisma.apiKey.update({ where: { id: entity.id }, data: { lastUsedAt: new Date(now) } }).catch(() => {})

  return {
    valid: true,
    apiKeyId: entity.id,
    tenantId: entity.tenantId,
    allowedOrigins: parseAllowedOrigins(entity.allowedOrigins),
    expiresAt,
  }
}

function quotaFrom(
  tenant: { currentMonthEvents: bigint; monthlyEventLimit: bigint; monthlyResetDate: Date },
  now: number
): CachedQuota {
  // Past the reset date the counter is stale: the next ingest starts a new month.
  const windowOpen = tenant.monthlyResetDate.getTime() >= now
  return {
    exceeded: windowOpen && tenant.currentMonthEvents >= tenant.monthlyEventLimit,
    limit: tenant.monthlyEventLimit.toString(),
    expiresAt: now + QUOTA_TTL_MS,
  }
}

async function assertWithinQuota(tenantId: string, now: number): Promise<void> {
  let quota = quotaCache.get(tenantId)
  if (!quota || quota.expiresAt <= now) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currentMonthEvents: true, monthlyEventLimit: true, monthlyResetDate: true },
    })
    if (!tenant) throw new UnauthorizedError('Invalid API Key')
    quota = quotaFrom(tenant, now)
    remember(quotaCache, tenantId, quota)
  }
  if (quota.exceeded) throw new RateLimitedError('Monthly event limit exceeded', quota.limit)
}

export async function resolveApiKey(apiKey: string, origin?: string, now = Date.now()): Promise<ResolvedApiKey> {
  let entry = keyCache.get(apiKey)
  if (!entry || entry.expiresAt <= now) {
    entry = await loadKey(apiKey, now)
    remember(keyCache, apiKey, entry)
  }

  if (!entry.valid) throw new UnauthorizedError(entry.message)

  if (!isOriginAllowed(entry.allowedOrigins, origin)) {
    // Deliberately vague: the response goes to a page that by definition
    // isn't supposed to be using this key.
    throw new UnauthorizedError('Origin not allowed for this API Key')
  }

  // Checked on every request (from a short-lived cache), not only when the
  // key itself is looked up, so a tenant can't overrun its plan for the
  // lifetime of a key cache entry.
  await assertWithinQuota(entry.tenantId, now)

  return { apiKeyId: entry.apiKeyId, tenantId: entry.tenantId }
}
