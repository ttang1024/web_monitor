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
import { depthLimit } from './lib/queryDepth.js'
import { prisma } from './prisma.js'
import { startScheduler } from './scheduler.js'
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

// Liveness: the process is up and the event loop is turning. Deliberately does
// not touch the database — a restart cannot fix a database outage, and an
// orchestrator that kills the pod for one only makes the outage worse.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) })
})

// Readiness: can this instance actually serve a request? Every resolver needs
// the database, so an instance that cannot reach it should be taken out of the
// load balancer rather than left to fail requests.
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ready' })
  } catch (error) {
    console.error('Readiness check failed:', error instanceof Error ? error.message : error)
    res.status(503).json({ status: 'unavailable', reason: 'database unreachable' })
  }
})

const apollo = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  // Don't hand an attacker a map of the schema in production.
  introspection: !env.isProduction,
  // Runs during validation, so an abusive query is rejected before a single
  // resolver — and a single database query — is reached.
  validationRules: [depthLimit(env.MAX_QUERY_DEPTH)],
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

// Alert evaluation and the retention sweep. Started after the server is
// listening so a slow first sweep can't delay readiness.
const scheduler = startScheduler()

// Stop accepting connections, drain in-flight requests, then close the pool.
// Without this a rolling deploy can kill a request mid-write.
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`)

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, exiting')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  // Stop scheduling new sweeps first: one starting mid-shutdown would issue
  // queries against a pool that is about to close.
  scheduler.stop()

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
