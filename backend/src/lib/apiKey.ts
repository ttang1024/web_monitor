import { prisma } from '../prisma.js'
import { UnauthorizedError, RateLimitedError } from './errors.js'

interface CachedApiKey {
  apiKeyId: string
  tenantId: string
  expiresAt: number
}

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, CachedApiKey>()

export interface ResolvedApiKey {
  apiKeyId: string
  tenantId: string
}

/**
 * Drops a key from the resolve cache. Revoking a key has to call this or the
 * key keeps working for up to CACHE_TTL_MS after it was switched off.
 */
export function invalidateApiKey(apiKey: string): void {
  cache.delete(apiKey)
}

/** Test seam: empties the cache. */
export function clearApiKeyCache(): void {
  cache.clear()
}

export async function resolveApiKey(apiKey: string): Promise<ResolvedApiKey> {
  const cached = cache.get(apiKey)
  if (cached && cached.expiresAt > Date.now()) {
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

  cache.set(apiKey, {
    apiKeyId: apiKeyEntity.id,
    tenantId: apiKeyEntity.tenantId,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  // Best-effort bookkeeping; don't block the request on it.
  prisma.apiKey
    .update({ where: { id: apiKeyEntity.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return { apiKeyId: apiKeyEntity.id, tenantId: apiKeyEntity.tenantId }
}
