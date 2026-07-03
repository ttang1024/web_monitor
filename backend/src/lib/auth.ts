import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import type { Tenant, User } from '@prisma/client'

const JWT_SECRET = process.env.JWT_SECRET ?? ''
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET not configured')
}
const JWT_ISSUER = process.env.JWT_ISSUER
const JWT_AUDIENCE = process.env.JWT_AUDIENCE

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

  return jwt.sign(claims, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: '24h',
    jwtid: randomBytes(16).toString('hex'),
  })
}

export function verifyJwtToken(token: string): AuthClaims {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as AuthClaims
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64')
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}
