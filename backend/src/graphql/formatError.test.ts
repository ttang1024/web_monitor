import { Prisma } from '@prisma/client'
import { GraphQLError } from 'graphql'
import { describe, expect, it, vi } from 'vitest'
import { formatError } from './formatError.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'

const resolverError = (original: Error) =>
  // Apollo hands formatError the resolver's error wrapped with its path.
  new GraphQLError(original.message, { originalError: original, path: ['field'] })
const internal = (message: string) => ({ message, extensions: { code: 'INTERNAL_SERVER_ERROR' } })

describe('formatError', () => {
  it('passes our own errors through with their code', () => {
    const result = formatError(internal('x'), resolverError(new UnauthorizedError('Authentication required')))
    expect(result).toMatchObject({ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } })
  })

  it('includes field errors for validation failures', () => {
    const error = new BadRequestError('Validation failed', { email: ['Invalid email address'] })
    expect(formatError(internal('x'), resolverError(error)).extensions).toEqual({
      code: 'BAD_USER_INPUT',
      errors: { email: ['Invalid email address'] },
    })
  })

  it('masks Prisma errors, which name tables and constraints', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: `User_email_key`',
      { code: 'P2002', clientVersion: 'test' }
    )

    const result = formatError(internal(prismaError.message), resolverError(prismaError))

    expect(result.message).toBe('Internal server error')
    expect(JSON.stringify(result)).not.toContain('User_email_key')
    expect(JSON.stringify(result)).not.toContain('P2002')
  })

  it('leaves Apollo client errors (bad query, bad variables) alone', () => {
    const formatted = { message: 'Cannot query field "nope"', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }
    expect(formatError(formatted, new GraphQLError(formatted.message))).toBe(formatted)
  })
})
