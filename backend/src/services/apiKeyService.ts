import { randomBytes } from 'node:crypto'
import type { ApiKey } from '@prisma/client'
import { prisma } from '../prisma.js'
import { invalidateApiKey } from '../lib/apiKey.js'
import { parseAllowedOrigins } from '../lib/origin.js'
import { BadRequestError, NotFoundError } from '../lib/errors.js'

export function generateApiKey(): string {
  return `sk_${randomBytes(32).toString('hex')}`
}

export interface ApiKeyDto {
  id: string
  name: string
  key: string
  environment: string
  isActive: boolean
  lastUsedAt: Date | null
  expiresAt: Date | null
  allowedOrigins: string[]
  createdAt: Date
}

function toApiKeyDto(apiKey: ApiKey): ApiKeyDto {
  return {
    id: apiKey.id,
    name: apiKey.name,
    key: apiKey.key,
    environment: apiKey.environment,
    isActive: apiKey.isActive,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
    allowedOrigins: parseAllowedOrigins(apiKey.allowedOrigins),
    createdAt: apiKey.createdAt,
  }
}

export async function listApiKeys(tenantId: string): Promise<ApiKeyDto[]> {
  const keys = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  })
  return keys.map(toApiKeyDto)
}

export async function createApiKey(
  tenantId: string,
  name: string,
  environment: string
): Promise<ApiKeyDto> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new NotFoundError('Tenant not found')

  // Only live keys count against the plan limit; revoked ones are kept for audit.
  const activeKeys = await prisma.apiKey.count({ where: { tenantId, isActive: true } })
  if (activeKeys >= tenant.maxApiKeys) {
    throw new BadRequestError(`Plan allows at most ${tenant.maxApiKeys} active API keys`)
  }

  const apiKey = await prisma.apiKey.create({
    data: { tenantId, name, key: generateApiKey(), environment, isActive: true },
  })

  return toApiKeyDto(apiKey)
}

/**
 * Replaces the key's origin allowlist. An empty list restores "any origin",
 * which is how a key is created.
 */
export async function setAllowedOrigins(
  tenantId: string,
  apiKeyId: string,
  origins: string[]
): Promise<ApiKeyDto> {
  const apiKey = await prisma.apiKey.findFirst({ where: { id: apiKeyId, tenantId } })
  if (!apiKey) throw new NotFoundError('API key not found')

  // Stored normalised so the ingest-path comparison is a plain string match,
  // and so "https://a.com/" and "https://a.com" can't both sit in the list.
  const normalized = [...new Set(parseAllowedOrigins(origins))]
  if (origins.length > 0 && normalized.length === 0) {
    throw new BadRequestError('No usable origins provided')
  }

  const updated = await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { allowedOrigins: normalized },
  })

  // The resolve cache holds the old allowlist for up to 15 minutes otherwise,
  // which would leave a just-restricted key accepting the origins it was
  // restricted away from.
  invalidateApiKey(apiKey.key)

  return toApiKeyDto(updated)
}

export async function revokeApiKey(tenantId: string, apiKeyId: string): Promise<ApiKeyDto> {
  const apiKey = await prisma.apiKey.findFirst({ where: { id: apiKeyId, tenantId } })
  if (!apiKey) throw new NotFoundError('API key not found')

  const revoked = await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { isActive: false },
  })

  // Without this the key keeps authenticating until its cache entry expires.
  invalidateApiKey(apiKey.key)

  return toApiKeyDto(revoked)
}
