export class UnauthorizedError extends Error {
  code = 'UNAUTHENTICATED' as const
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class BadRequestError extends Error {
  code = 'BAD_USER_INPUT' as const
  errors?: Record<string, string[]>
  constructor(message = 'Bad request', errors?: Record<string, string[]>) {
    super(message)
    this.name = 'BadRequestError'
    this.errors = errors
  }
}

export class NotFoundError extends Error {
  code = 'NOT_FOUND' as const
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class RateLimitedError extends Error {
  code = 'RATE_LIMITED' as const
  limit?: number | string
  constructor(message = 'Rate limited', limit?: number | string) {
    super(message)
    this.name = 'RateLimitedError'
    this.limit = limit
  }
}
