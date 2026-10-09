import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@prisma/client'

const prismaMock = { user: { findUnique: vi.fn() } }
vi.mock('./prisma.js', () => ({ prisma: prismaMock }))

const { authenticate, invalidateUserState } = await import('./context.js')
const { generateJwtToken } = await import('./lib/auth.js')

const user = { id: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'Admin', tokenVersion: 2 } as User
const bearer = () => `Bearer ${generateJwtToken(user)}`

function dbState(overrides: Record<string, unknown> = {}) {
  return { isActive: true, tokenVersion: 2, role: 'Admin', tenant: { isActive: true }, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  invalidateUserState('user-1')
})

describe('authenticate', () => {
  it('accepts a valid token for an active user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbState())
    expect(await authenticate(bearer())).toMatchObject({ userId: 'user-1', tenantId: 'tenant-1', role: 'Admin' })
  })

  it('rejects a token issued before the user’s sessions were revoked', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbState({ tokenVersion: 3 }))
    expect(await authenticate(bearer())).toBeUndefined()
  })

  it('rejects a deactivated user or tenant', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbState({ isActive: false }))
    expect(await authenticate(bearer())).toBeUndefined()

    invalidateUserState('user-1')
    prismaMock.user.findUnique.mockResolvedValue(dbState({ tenant: { isActive: false } }))
    expect(await authenticate(bearer())).toBeUndefined()
  })

  it('takes the role from the database, so a demotion applies immediately', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbState({ role: 'User' }))
    expect((await authenticate(bearer()))?.role).toBe('User')
  })

  it('caches the user state briefly instead of querying on every request', async () => {
    prismaMock.user.findUnique.mockResolvedValue(dbState())
    await authenticate(bearer(), 1_000)
    await authenticate(bearer(), 2_000)
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1)

    await authenticate(bearer(), 10_000)
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2)
  })

  it('ignores missing or forged tokens without touching the database', async () => {
    expect(await authenticate(undefined)).toBeUndefined()
    expect(await authenticate('Bearer not-a-jwt')).toBeUndefined()
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
