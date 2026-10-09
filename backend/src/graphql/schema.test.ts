import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { describe, expect, it } from 'vitest'
import { resolvers } from './resolvers/index.js'

const typeDefs = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.graphql'), 'utf-8')

describe('GraphQL schema', () => {
  // Builds the schema exactly as Apollo does at boot: a syntax error, or a
  // resolver for a field the schema doesn't declare, fails here instead of in production.
  it('parses and matches the resolver map', () => {
    expect(() => makeExecutableSchema({ typeDefs, resolvers })).not.toThrow()
  })
})
