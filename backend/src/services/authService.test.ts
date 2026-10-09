import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  refreshToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  user: { update: vi.fn(), findUnique: vi.fn() },
}
vi.mock('../prisma.js', () => ({ prisma: prismaMock }))

const { refreshSession, login } = await import('./authService.js')
const { hashPassword } = await import('../lib/auth.js')
const { UnauthorizedError } = await import('../lib/errors.js')

const NOW = new Date('2026-08-04T12:00:00.000Z')

function storedToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rt-1',
    userId: 'user-1',
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'a@b.com',
      role: 'Admin',
      tokenVersion: 0,
      isActive: true,
      tenant: { id: 'tenant-1', name: 'Acme', isActive: true },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.refreshToken.create.mockResolvedValue({})
  prismaMock.user.update.mockResolvedValue({})
})

describe('refreshSession', () => {
  it('rotates a valid token: revokes it and issues a new one', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(storedToken())

    const session = await refreshSession('token', NOW)

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt-1', revokedAt: null },
      data: { revokedAt: NOW },
    })
    expect(session.refreshToken).not.toBe('token')
    expect(session.token).toBeTruthy()
  })

  it('lets only one of two concurrent refreshes win', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(storedToken())
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 })

    await expect(refreshSession('token', NOW)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled()
  })

  it('treats reuse of a long-rotated token as theft and ends every session', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(
      storedToken({ revokedAt: new Date(NOW.getTime() - 60_000) })
    )

    await expect(refreshSession('token', NOW)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    })
  })

  it('refuses but does not punish a token rotated a moment ago (two tabs racing)', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(
      storedToken({ revokedAt: new Date(NOW.getTime() - 2_000) })
    )

    await expect(refreshSession('token', NOW)).rejects.toBeInstanceOf(UnauthorizedError)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('rejects an expired token, a missing one, and inactive accounts', async () => {
    await expect(refreshSession(undefined, NOW)).rejects.toBeInstanceOf(UnauthorizedError)

    prismaMock.refreshToken.findUnique.mockResolvedValue(storedToken({ expiresAt: new Date(NOW.getTime() - 1) }))
    await expect(refreshSession('token', NOW)).rejects.toBeInstanceOf(UnauthorizedError)

    const inactive = storedToken()
    inactive.user.isActive = false
    prismaMock.refreshToken.findUnique.mockResolvedValue(inactive)
    await expect(refreshSession('token', NOW)).rejects.toThrow('Account is inactive')
  })
})

describe('login', () => {
  it('gives the same answer for an unknown email and a wrong password', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const unknown = await login({ email: 'nobody@b.com', password: 'pw' }).catch((e: Error) => e.message)

    prismaMock.user.findUnique.mockResolvedValueOnce({
      ...storedToken().user,
      passwordHash: await hashPassword('right-password'),
    })
    const wrong = await login({ email: 'a@b.com', password: 'wrong-password' }).catch((e: Error) => e.message)

    expect(unknown).toBe('Invalid credentials')
    expect(wrong).toBe(unknown)
  })
})
