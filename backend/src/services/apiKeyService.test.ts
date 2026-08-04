import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BadRequestError, NotFoundError } from '../lib/errors.js'

const prismaMock = {
  tenant: { findUnique: vi.fn() },
  apiKey: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}
const invalidateApiKey = vi.fn()

vi.mock('../prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../lib/apiKey.js', () => ({ invalidateApiKey }))

const { createApiKey, generateApiKey, revokeApiKey } = await import('./apiKeyService.js')

const TENANT = 'tenant-1'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.tenant.findUnique.mockResolvedValue({ id: TENANT, maxApiKeys: 3 })
})

describe('generateApiKey', () => {
  it('produces a prefixed, unguessable key', () => {
    const key = generateApiKey()
    expect(key).toMatch(/^sk_[0-9a-f]{64}$/)
    expect(key).not.toBe(generateApiKey())
  })
})

describe('createApiKey', () => {
  it('creates a key while the tenant is under its plan limit', async () => {
    prismaMock.apiKey.count.mockResolvedValue(2)
    prismaMock.apiKey.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'key-1',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      ...data,
    }))

    const key = await createApiKey(TENANT, 'Storefront', 'production')

    expect(key.name).toBe('Storefront')
    expect(key.key).toMatch(/^sk_/)
  })

  it('refuses to exceed the plan limit', async () => {
    prismaMock.apiKey.count.mockResolvedValue(3)

    await expect(createApiKey(TENANT, 'One too many', 'production')).rejects.toThrow(BadRequestError)
    expect(prismaMock.apiKey.create).not.toHaveBeenCalled()
  })

  it('counts only active keys against the limit', async () => {
    prismaMock.apiKey.count.mockResolvedValue(1)
    prismaMock.apiKey.create.mockResolvedValue({
      id: 'key-2',
      name: 'Staging',
      key: 'sk_test',
      environment: 'staging',
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
    })

    await createApiKey(TENANT, 'Staging', 'staging')

    expect(prismaMock.apiKey.count).toHaveBeenCalledWith({ where: { tenantId: TENANT, isActive: true } })
  })

  it('rejects an unknown tenant', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(null)
    await expect(createApiKey('ghost', 'Nope', 'production')).rejects.toThrow(NotFoundError)
  })
})

describe('revokeApiKey', () => {
  const stored = {
    id: 'key-1',
    tenantId: TENANT,
    name: 'Storefront',
    key: 'sk_live_value',
    environment: 'production',
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date(),
  }

  it('deactivates the key and evicts it from the auth cache', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(stored)
    prismaMock.apiKey.update.mockResolvedValue({ ...stored, isActive: false })

    const revoked = await revokeApiKey(TENANT, 'key-1')

    expect(revoked.isActive).toBe(false)
    // Without this eviction the key keeps ingesting until the cache expires.
    expect(invalidateApiKey).toHaveBeenCalledWith('sk_live_value')
  })

  it('will not revoke a key belonging to another tenant', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(null)

    await expect(revokeApiKey(TENANT, 'someone-elses-key')).rejects.toThrow(NotFoundError)
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled()
    expect(invalidateApiKey).not.toHaveBeenCalled()
  })
})
