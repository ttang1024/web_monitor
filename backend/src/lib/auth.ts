import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import type { Tenant, User } from '@prisma/client'
import { env } from './env.js'

export interface AuthClaims {
  userId: string
  tenantId: string
  email: string
  role: string
  tenantName: string
}

export function generateJwtToken(user: User, tenant: Tenant): string {
  const claims: AuthClaims = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    tenantName: tenant.name,
  }

  return jwt.sign(claims, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    jwtid: randomBytes(16).toString('hex'),
  })
}

export function verifyJwtToken(token: string): AuthClaims {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as AuthClaims
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

// Refresh tokens are stored as digests, so a leaked table row cannot be
// replayed as a token. SHA-256 is enough here: the token is 256 bits of
// entropy, so there is nothing to brute-force the way there is with a password.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}
