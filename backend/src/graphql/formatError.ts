import type { GraphQLFormattedError } from 'graphql'
import { AppError, BadRequestError } from '../lib/errors.js'

/**
 * Decides what a client may see of an error. Only our own AppErrors keep their
 * message; anything else thrown in a resolver (Prisma, network, bugs) can name
 * tables, constraints or hosts, so it is logged and replaced.
 */
export function formatError(formattedError: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  // Resolver errors arrive wrapped in a GraphQLError. Unwrapped structurally
  // (not with instanceof), which also survives duplicate graphql module copies.
  const original = (error as { originalError?: unknown } | null)?.originalError ?? error

  if (original instanceof AppError) {
    return {
      message: original.message,
      path: formattedError.path,
      extensions: {
        code: original.code,
        ...(original instanceof BadRequestError && original.errors ? { errors: original.errors } : {}),
      },
    }
  }

  // Apollo's own client-facing errors (parse/validation failures, bad
  // variables, query depth) already have safe messages and specific codes.
  if (formattedError.extensions?.code !== 'INTERNAL_SERVER_ERROR') return formattedError

  console.error('Unhandled resolver error:', original)
  return {
    message: 'Internal server error',
    path: formattedError.path,
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  }
}
