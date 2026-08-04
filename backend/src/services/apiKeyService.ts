import { randomBytes } from 'node:crypto'
import type { ApiKey } from '@prisma/client'
import { prisma } from '../prisma.js'
import { invalidateApiKey } from '../lib/apiKey.js'
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
  createdAt: Date
}

export function toApiKeyDto(apiKey: ApiKey): ApiKeyDto {
  return {
    id: apiKey.id,
    name: apiKey.name,
    key: apiKey.key,
    environment: apiKey.environment,
    isActive: apiKey.isActive,
    lastUsedAt: apiKey.lastUsedAt,
    expiresAt: apiKey.expiresAt,
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
