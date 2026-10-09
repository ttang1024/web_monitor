import type { CookieOptions, Response } from 'express'
import { env } from './env.js'

/**
 * The refresh token lives in an httpOnly cookie scoped to the GraphQL path, so
 * page script (and therefore an XSS payload) can never read it. The access
 * token is short-lived and kept in memory by the dashboard.
 */
export const REFRESH_COOKIE = 'wm_refresh'

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    path: '/graphql',
  }
}

export function setRefreshCookie(res: Response | undefined, token: string): void {
  res?.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  })
}

export function clearRefreshCookie(res: Response | undefined): void {
  res?.clearCookie(REFRESH_COOKIE, cookieOptions())
}

/** Minimal Cookie header parser; we only ever need one value from it. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}
