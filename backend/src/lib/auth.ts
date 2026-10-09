import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import type { User } from '@prisma/client'
import { env } from './env.js'

export interface AuthClaims {
  userId: string
  tenantId: string
  email: string
  role: string
  /** User.tokenVersion at issue time; a bump invalidates the token. */
  tv: number
}

export function generateJwtToken(user: User): string {
  const claims: AuthClaims = {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    tv: user.tokenVersion,
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
    algorithms: ['HS256'],
  }) as AuthClaims
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

// Refresh tokens are stored as digests, so a leaked table row cannot be
// replayed as a token. SHA-256 is enough: the token is 256 random bits, so
// there is nothing to brute-force the way there is with a password.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiry(from = new Date()): Date {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
}

const BCRYPT_ROUNDS = 10

// The async variants yield to the event loop between rounds, so a burst of
// logins doesn't stall every other request (ingestion included) on hashing.
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Compared against when the email is unknown, so a miss costs the same time as
// a wrong password and response timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_ROUNDS)

export async function burnPasswordCheck(password: string): Promise<false> {
  await bcrypt.compare(password, DUMMY_HASH)
  return false
}
