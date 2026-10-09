import type { Response } from 'express'
import type { z } from 'zod'
import type {
  loginSchema,
  registerSchema,
  saveLayoutSchema,
} from './lib/validation.js'

// Input types come from the zod schemas that validate them, so the shape a
// resolver works with is exactly the shape validation guarantees.
export type RegisterInput = z.output<typeof registerSchema>
export type LoginInput = z.output<typeof loginSchema>
export type SaveLayoutInput = z.output<typeof saveLayoutSchema>
export type {
  BatchIngestInput,
  IngestApiErrorInput,
  IngestCustomEventInput,
  IngestErrorInput,
  IngestPerformanceInput,
} from './lib/validation.js'

export type Role = 'User' | 'Admin'

export interface AuthContext {
  userId: string
  tenantId: string
  email: string
  role: Role
}

export interface GraphQLContext {
  auth?: AuthContext
  /** Caller address, used to key auth rate limiting. */
  ip?: string
  /** Refresh token from the httpOnly session cookie, if the browser sent one. */
  refreshCookie?: string
  /** Used to set and clear the session cookie. Absent in unit tests. */
  res?: Response
}
