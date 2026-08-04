import { env } from './lib/env.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { ApolloServer } from '@apollo/server'
import { unwrapResolverError } from '@apollo/server/errors'
import { expressMiddleware } from '@as-integrations/express5'
import type { GraphQLFormattedError } from 'graphql'
import { resolvers } from './graphql/resolvers/index.js'
import { buildContext } from './context.js'
import { prisma } from './prisma.js'
import type { GraphQLContext } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const typeDefs = readFileSync(path.join(__dirname, 'graphql/schema.graphql'), 'utf-8')

const logger = pinoHttp({
  transport: env.isProduction ? undefined : { target: 'pino-pretty' },
})

const app = express()
// Behind a proxy or load balancer, req.ip must come from X-Forwarded-For, or
// every request looks like it came from the proxy and the auth rate limiter
// would throttle all users as one.
app.set('trust proxy', true)
app.use(logger)
app.use(
  cors({
    origin: env.allowedOrigins.length > 0 ? env.allowedOrigins : true,
    credentials: true,
  })
)
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const apollo = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  // Don't hand an attacker a map of the schema in production.
  introspection: !env.isProduction,
  formatError: (formattedError: GraphQLFormattedError, error: unknown): GraphQLFormattedError => {
    const original = unwrapResolverError(error)
    const code = original instanceof Error ? (original as { code?: string }).code : undefined

    if (code && original instanceof Error) {
      return {
        ...formattedError,
        message: original.message,
        extensions: {
          ...formattedError.extensions,
          code,
          ...('errors' in original ? { errors: (original as { errors?: unknown }).errors } : {}),
        },
      }
    }

    return formattedError
  },
})

await apollo.start()

app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: async ({ req }) => buildContext(req.headers, req.ip),
  })
)

const server = app.listen(env.PORT, () => {
  console.log(`GraphQL API ready at http://localhost:${env.PORT}/graphql`)
})

// Stop accepting connections, drain in-flight requests, then close the pool.
// Without this a rolling deploy can kill a request mid-write.
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`)

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, exiting')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await apollo.stop()
    await prisma.$disconnect()
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
