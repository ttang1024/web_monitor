import { prisma } from '../prisma.js'
import { UnauthorizedError, NotFoundError, BadRequestError } from '../lib/errors.js'
import {
  generateJwtToken,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  refreshTokenExpiry,
  verifyPassword,
} from '../lib/auth.js'
import * as tenantService from './tenantService.js'
import { Prisma } from '@prisma/client'
import type { LoginInput, RegisterInput } from '../types.js'
import type { Tenant, User } from '@prisma/client'

export interface UserDto {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}

export interface TenantDto {
  id: string
  name: string
  domain: string
  plan: string
  isActive: boolean
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: UserDto
  tenant: TenantDto
}

function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: user.tenantId,
  }
}

function toTenantDto(tenant: Tenant): TenantDto {
  return {
    id: tenant.id,
    name: tenant.name,
    domain: tenant.domain,
    plan: tenant.plan,
    isActive: tenant.isActive,
  }
}

/** Issues an access token plus a persisted (hashed) refresh token. */
async function issueSession(user: User, tenant: Tenant): Promise<LoginResponse> {
  const refreshToken = generateRefreshToken()

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
    },
  })

  return {
    token: generateJwtToken(user, tenant),
    refreshToken,
    user: toUserDto(user),
    tenant: toTenantDto(tenant),
  }
}

export async function register(input: RegisterInput): Promise<LoginResponse> {
  // Checked up front so the common case gets a clear message without creating
  // a tenant first — but this is not what guarantees uniqueness, since two
  // simultaneous sign-ups can both pass it. The unique index below does.
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } })
  if (existingUser) {
    throw new BadRequestError('Email already registered')
  }

  const tenant = await tenantService.createTenant(input.tenantName, input.domain)

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: input.email,
        passwordHash: hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'Admin',
        isActive: true,
      },
    })

    return issueSession(user, tenant)
  } catch (error) {
    // Lost the race for this address. The tenant created a moment ago now has
    // no user and never will, so remove it rather than leave an orphan holding
    // an API key.
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {})

    if (isUniqueViolation(error, 'email')) {
      throw new BadRequestError('Email already registered')
    }
    throw error
  }
}

/** True for Prisma's "unique constraint failed" on the given field. */
function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  const target = error.meta?.target
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field)
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await prisma.user.findFirst({
    where: { email: input.email },
    include: { tenant: true },
  })

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new UnauthorizedError('Invalid credentials')
  }

  if (!user.isActive || !user.tenant.isActive) {
    throw new UnauthorizedError('Account is inactive')
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  return issueSession(updated, user.tenant)
}

/**
 * Exchanges a refresh token for a new session. The old token is revoked as
 * part of the swap (rotation), so a stolen token is usable at most once.
 */
export async function refreshSession(refreshToken: string): Promise<LoginResponse> {
  const tokenHash = hashRefreshToken(refreshToken)
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { tenant: true } } },
  })

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  if (!stored.user.isActive || !stored.user.tenant.isActive) {
    throw new UnauthorizedError('Account is inactive')
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })

  return issueSession(stored.user, stored.user.tenant)
}

/** Revokes one refresh token (this device) or, with no token, every session. */
export async function logout(userId: string, refreshToken?: string | null): Promise<void> {
  const where = refreshToken
    ? { userId, tokenHash: hashRefreshToken(refreshToken), revokedAt: null }
    : { userId, revokedAt: null }

  await prisma.refreshToken.updateMany({ where, data: { revokedAt: new Date() } })
}

export async function getUserById(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')
  return toUserDto(user)
}

export async function getTenantById(tenantId: string): Promise<TenantDto> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) throw new NotFoundError('Tenant not found')
  return toTenantDto(tenant)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new NotFoundError('User not found')

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new UnauthorizedError('Current password is incorrect')
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(newPassword) },
  })

  // A password change invalidates every session issued under the old one.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
