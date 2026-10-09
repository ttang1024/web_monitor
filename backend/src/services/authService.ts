import { Prisma } from '@prisma/client'
import type { Tenant, User } from '@prisma/client'
import { prisma } from '../prisma.js'
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js'
import {
  burnPasswordCheck,
  generateJwtToken,
  generateRefreshToken,
  hashPassword,
  hashRefreshToken,
  refreshTokenExpiry,
  verifyPassword,
} from '../lib/auth.js'
import { invalidateUserState } from '../context.js'
import { newTenantData, defaultApiKeyData } from './tenantService.js'
import type { LoginInput, RegisterInput, Role } from '../types.js'

export interface UserDto {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
  isActive: boolean
  lastLoginAt: Date | null
}

export interface TenantDto {
  id: string
  name: string
  domain: string
  plan: string
  isActive: boolean
  maxUsers: number
}

/** What the GraphQL layer returns, plus the refresh token it puts in a cookie. */
export interface Session {
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
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
  }
}

function toTenantDto(tenant: Tenant): TenantDto {
  return {
    id: tenant.id,
    name: tenant.name,
    domain: tenant.domain,
    plan: tenant.plan,
    isActive: tenant.isActive,
    maxUsers: tenant.maxUsers,
  }
}

/** Issues an access token plus a persisted (hashed) refresh token. */
async function issueSession(user: User, tenant: Tenant, db: Prisma.TransactionClient = prisma): Promise<Session> {
  const refreshToken = generateRefreshToken()

  await db.refreshToken.create({
    data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshTokenExpiry() },
  })

  return { token: generateJwtToken(user), refreshToken, user: toUserDto(user), tenant: toTenantDto(tenant) }
}

/** True for Prisma's "unique constraint failed" on the given field. */
function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  const target = error.meta?.target
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field)
}

export async function register(input: RegisterInput): Promise<Session> {
  // Hashed outside the transaction so the slow part doesn't hold it open.
  const passwordHash = await hashPassword(input.password)

  try {
    // Tenant, its first API key and its admin are created together or not at
    // all; the unique email index decides a race between two sign-ups.
    return await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: newTenantData(input.tenantName, input.domain) })
      await tx.apiKey.create({ data: defaultApiKeyData(tenant.id) })
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'Admin',
        },
      })
      return issueSession(user, tenant, tx)
    })
  } catch (error) {
    if (isUniqueViolation(error, 'email')) throw new BadRequestError('Email already registered')
    throw error
  }
}

export async function login(input: LoginInput): Promise<Session> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: { tenant: true } })

  const passwordOk = user ? await verifyPassword(input.password, user.passwordHash) : await burnPasswordCheck(input.password)
  if (!user || !passwordOk) throw new UnauthorizedError('Invalid credentials')

  if (!user.isActive || !user.tenant.isActive) throw new UnauthorizedError('Account is inactive')

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return issueSession(updated, user.tenant)
}

/**
 * A rotated-out token presented again within this window is treated as two
 * tabs refreshing at once, not as theft: the request is refused, but the
 * user's other sessions are left alone.
 */
const ROTATION_GRACE_MS = 10_000

/**
 * Exchanges a refresh token for a new session, rotating the old one out.
 *
 * The swap is a single conditional update, so two concurrent requests with
 * the same token cannot both succeed. A token that was rotated out longer ago
 * than the grace window and is presented again means it was copied: every
 * session the user has is revoked.
 */
export async function refreshSession(refreshToken: string | undefined, now = new Date()): Promise<Session> {
  if (!refreshToken) throw new UnauthorizedError('No session')

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: { include: { tenant: true } } },
  })
  if (!stored) throw new UnauthorizedError('Invalid or expired refresh token')

  if (stored.revokedAt) {
    if (now.getTime() - stored.revokedAt.getTime() > ROTATION_GRACE_MS) {
      await revokeAllSessions(stored.userId)
    }
    throw new UnauthorizedError('Invalid or expired refresh token')
  }

  if (stored.expiresAt < now) throw new UnauthorizedError('Invalid or expired refresh token')
  if (!stored.user.isActive || !stored.user.tenant.isActive) throw new UnauthorizedError('Account is inactive')

  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: now },
  })
  if (count === 0) throw new UnauthorizedError('Invalid or expired refresh token')

  return issueSession(stored.user, stored.user.tenant)
}

/** Revokes this device's refresh token. The short-lived access token simply expires. */
export async function logout(userId: string, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return
  await prisma.refreshToken.updateMany({
    where: { userId, tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Revokes the session a refresh token belongs to, when no access token is at hand. */
export async function logoutByToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Ends every session: refresh tokens are revoked and outstanding access tokens stop verifying. */
export async function revokeAllSessions(userId: string, db: Prisma.TransactionClient = prisma): Promise<void> {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } })
  invalidateUserState(userId)
}

// --- Team -------------------------------------------------------------------

export async function listUsers(tenantId: string): Promise<UserDto[]> {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  })
  return users.map(toUserDto)
}

export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  role: Role
  initialPassword: string
}

export async function createUser(tenantId: string, input: CreateUserInput): Promise<UserDto> {
  const passwordHash = await hashPassword(input.initialPassword)

  try {
    return await prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })
        const activeUsers = await tx.user.count({ where: { tenantId, isActive: true } })
        if (activeUsers >= tenant.maxUsers) {
          throw new BadRequestError(`Plan allows at most ${tenant.maxUsers} active users`)
        }

        const user = await tx.user.create({
          data: {
            tenantId,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.role,
            passwordHash,
          },
        })
        return toUserDto(user)
      },
      // Serializable so two concurrent invites can't both pass the seat check.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  } catch (error) {
    if (isUniqueViolation(error, 'email')) throw new BadRequestError('Email already registered')
    throw error
  }
}

export async function updateUser(
  tenantId: string,
  actorId: string,
  userId: string,
  changes: { role?: Role; isActive?: boolean }
): Promise<UserDto> {
  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, tenantId } })
      if (!user) throw new NotFoundError('User not found')

      const losesAdmin =
        user.role === 'Admin' && user.isActive && (changes.role === 'User' || changes.isActive === false)
      if (losesAdmin) {
        if (userId === actorId) throw new ForbiddenError('You cannot remove your own admin access')
        const otherAdmins = await tx.user.count({
          where: { tenantId, role: 'Admin', isActive: true, id: { not: userId } },
        })
        if (otherAdmins === 0) throw new BadRequestError('A tenant must keep at least one active admin')
      }

      if (changes.isActive === true && !user.isActive) {
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })
        const activeUsers = await tx.user.count({ where: { tenantId, isActive: true } })
        if (activeUsers >= tenant.maxUsers) {
          throw new BadRequestError(`Plan allows at most ${tenant.maxUsers} active users`)
        }
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: changes.role ?? undefined, isActive: changes.isActive ?? undefined },
      })

      if (changes.isActive === false) await revokeAllSessions(userId, tx)
      invalidateUserState(userId)
      return toUserDto(updated)
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}
