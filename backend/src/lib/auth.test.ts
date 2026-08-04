import { describe, expect, it } from 'vitest'
import type { Tenant, User } from '@prisma/client'
import {
  generateJwtToken,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  refreshTokenExpiry,
  verifyJwtToken,
  verifyPassword,
} from './auth.js'

const user = {
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'dev@example.com',
  role: 'Admin',
} as User

const tenant = { id: 'tenant-1', name: 'Acme' } as Tenant

describe('access tokens', () => {
  it('round-trips the claims the resolvers rely on', () => {
    const claims = verifyJwtToken(generateJwtToken(user, tenant))

    expect(claims.userId).toBe('user-1')
    expect(claims.tenantId).toBe('tenant-1')
    expect(claims.email).toBe('dev@example.com')
    expect(claims.role).toBe('Admin')
    expect(claims.tenantName).toBe('Acme')
  })

  it('rejects a tampered token', () => {
    const token = generateJwtToken(user, tenant)
    const tampered = `${token.slice(0, -3)}abc`
    expect(() => verifyJwtToken(tampered)).toThrow()
  })

  it('gives each token its own id, so sessions are distinguishable', () => {
    expect(generateJwtToken(user, tenant)).not.toBe(generateJwtToken(user, tenant))
  })
})

describe('refresh tokens', () => {
  it('generates url-safe, non-repeating tokens', () => {
    const token = generateRefreshToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token).not.toBe(generateRefreshToken())
  })

  it('stores a digest, never the token itself', () => {
    const token = generateRefreshToken()
    const digest = hashRefreshToken(token)

    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toContain(token)
    expect(hashRefreshToken(token)).toBe(digest)
  })

  it('expires in the future', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(refreshTokenExpiry(now).getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('passwords', () => {
  it('verifies the right password and rejects the wrong one', () => {
    const hash = hashPassword('correct horse battery staple')

    expect(hash).not.toContain('correct')
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(verifyPassword('Correct horse battery staple', hash)).toBe(false)
  })

  it('salts, so the same password hashes differently each time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })
})
