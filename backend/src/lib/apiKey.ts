import { prisma } from '../prisma.js'
import { UnauthorizedError, RateLimitedError } from './errors.js'
import { isOriginAllowed, parseAllowedOrigins } from './origin.js'

interface CachedApiKey {
  apiKeyId: string
  tenantId: string
  allowedOrigins: string[]
  expiresAt: number
}

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, CachedApiKey>()

export interface ResolvedApiKey {
  apiKeyId: string
  tenantId: string
}

/**
 * Drops a key from the resolve cache. Revoking a key — or editing its origin
 * allowlist — has to call this or the old state stays live for up to
 * CACHE_TTL_MS.
 */
export function invalidateApiKey(apiKey: string): void {
  cache.delete(apiKey)
}

/** Test seam: empties the cache. */
export function clearApiKeyCache(): void {
  cache.clear()
}

export async function resolveApiKey(apiKey: string, origin?: string): Promise<ResolvedApiKey> {
  const cached = cache.get(apiKey)
  if (cached && cached.expiresAt > Date.now()) {
    assertOriginAllowed(cached.allowedOrigins, origin)
    return { apiKeyId: cached.apiKeyId, tenantId: cached.tenantId }
  }

  const apiKeyEntity = await prisma.apiKey.findUnique({
    where: { key: apiKey },
    include: { tenant: true },
  })

  if (!apiKeyEntity || !apiKeyEntity.isActive || !apiKeyEntity.tenant.isActive) {
    throw new UnauthorizedError('Invalid API Key')
  }

  if (apiKeyEntity.expiresAt && apiKeyEntity.expiresAt < new Date()) {
    throw new UnauthorizedError('API Key expired')
  }

  if (apiKeyEntity.tenant.currentMonthEvents >= apiKeyEntity.tenant.monthlyEventLimit) {
    throw new RateLimitedError('Monthly event limit exceeded', apiKeyEntity.tenant.monthlyEventLimit.toString())
  }

  const allowedOrigins = parseAllowedOrigins(apiKeyEntity.allowedOrigins)

  // Cached before the origin check so a request from the wrong origin is
  // rejected without costing a database round trip every time.
  cache.set(apiKey, {
    apiKeyId: apiKeyEntity.id,
    tenantId: apiKeyEntity.tenantId,
    allowedOrigins,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  assertOriginAllowed(allowedOrigins, origin)

  // Best-effort bookkeeping; don't block the request on it.
  prisma.apiKey
    .update({ where: { id: apiKeyEntity.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return { apiKeyId: apiKeyEntity.id, tenantId: apiKeyEntity.tenantId }
}

function assertOriginAllowed(allowedOrigins: string[], origin: string | undefined): void {
  if (isOriginAllowed(allowedOrigins, origin)) return
  // Deliberately vague about which key it was: the response goes back to a page
  // that, by definition, isn't supposed to be using this key.
  throw new UnauthorizedError('Origin not allowed for this API Key')
}
