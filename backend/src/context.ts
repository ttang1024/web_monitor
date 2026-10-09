import type { Request, Response } from 'express'
import { verifyJwtToken } from './lib/auth.js'
import { readCookie, REFRESH_COOKIE } from './lib/session.js'
import { prisma } from './prisma.js'
import type { AuthContext, GraphQLContext, Role } from './types.js'

interface UserState {
  active: boolean
  tokenVersion: number
  role: Role
  expiresAt: number
}

/**
 * A valid signature isn't enough: the user may since have been deactivated,
 * signed out everywhere, or had their role changed. That state is re-read
 * from the database, cached briefly so it costs one query per user per few
 * seconds rather than one per request. The TTL bounds how long a revoked
 * session survives on an instance that didn't process the revocation.
 */
const USER_STATE_TTL_MS = 5_000
const userStateCache = new Map<string, UserState>()

export function invalidateUserState(userId: string): void {
  userStateCache.delete(userId)
}

async function loadUserState(userId: string, now: number): Promise<UserState | null> {
  const cached = userStateCache.get(userId)
  if (cached && cached.expiresAt > now) return cached

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, tokenVersion: true, role: true, tenant: { select: { isActive: true } } },
  })
  if (!user) {
    userStateCache.delete(userId)
    return null
  }

  const state: UserState = {
    active: user.isActive && user.tenant.isActive,
    tokenVersion: user.tokenVersion,
    role: user.role,
    expiresAt: now + USER_STATE_TTL_MS,
  }
  if (userStateCache.size > 10_000) userStateCache.clear()
  userStateCache.set(userId, state)
  return state
}

export async function authenticate(authorization: string | undefined, now = Date.now()): Promise<AuthContext | undefined> {
  if (!authorization?.startsWith('Bearer ')) return undefined

  let claims
  try {
    claims = verifyJwtToken(authorization.slice('Bearer '.length))
  } catch {
    // Invalid/expired token: leave auth unset; resolvers that need it reject.
    return undefined
  }

  const state = await loadUserState(claims.userId, now)
  if (!state || !state.active || state.tokenVersion !== claims.tv) return undefined

  // Role is taken from the database, not the token, so a demotion applies now.
  return { userId: claims.userId, tenantId: claims.tenantId, email: claims.email, role: state.role }
}

export async function buildContext(req: Request, res?: Response): Promise<GraphQLContext> {
  return {
    ip: req.ip,
    res,
    auth: await authenticate(req.headers.authorization),
    refreshCookie: readCookie(req.headers.cookie, REFRESH_COOKIE),
  }
}
