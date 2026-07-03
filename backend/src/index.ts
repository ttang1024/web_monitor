import 'dotenv/config'
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
import type { GraphQLContext } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const typeDefs = readFileSync(path.join(__dirname, 'graphql/schema.graphql'), 'utf-8')

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const logger = pinoHttp({
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
})

const app = express()
app.use(logger)
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
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
    context: async ({ req }) => buildContext(req.headers),
  })
)

const port = Number(process.env.PORT ?? 4000)
app.listen(port, () => {
  console.log(`GraphQL API ready at http://localhost:${port}/graphql`)
})
