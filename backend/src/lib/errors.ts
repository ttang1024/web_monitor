/**
 * Base for errors whose message is safe to show the caller. Anything that is
 * not an AppError (Prisma, network, programming errors) is masked before it
 * leaves the API, so internals such as table or constraint names never leak.
 */
export abstract class AppError extends Error {
  abstract readonly code: string
  /** HTTP status for the REST routes; GraphQL always answers 200. */
  abstract readonly status: number
}

export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHENTICATED'
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN'
  readonly status = 403
  constructor(message = 'You do not have permission to do that') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class BadRequestError extends AppError {
  readonly code = 'BAD_USER_INPUT'
  readonly status = 400
  errors?: Record<string, string[]>
  constructor(message = 'Bad request', errors?: Record<string, string[]>) {
    super(message)
    this.name = 'BadRequestError'
    this.errors = errors
  }
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND'
  readonly status = 404
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class RateLimitedError extends AppError {
  readonly code = 'RATE_LIMITED'
  readonly status = 429
  limit?: number | string
  retryAfterSeconds?: number
  constructor(message = 'Rate limited', limit?: number | string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'RateLimitedError'
    this.limit = limit
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class ServiceUnavailableError extends AppError {
  readonly code = 'SERVICE_UNAVAILABLE'
  readonly status = 503
  retryAfterSeconds?: number
  constructor(message = 'Service temporarily unavailable', retryAfterSeconds?: number) {
    super(message)
    this.name = 'ServiceUnavailableError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}
