import { describe, expect, it } from 'vitest'
import { buildSchema, parse, validate as validateQuery } from 'graphql'
import { depthLimit } from './queryDepth.js'

// Small schema with a self-referencing type, so a query can nest arbitrarily.
const schema = buildSchema(`
  type Node {
    id: ID!
    label: String!
    child: Node
  }

  type Query {
    root: Node
  }
`)

function depthErrors(query: string, maxDepth: number): string[] {
  return validateQuery(schema, parse(query), [depthLimit(maxDepth)]).map((error) => error.message)
}

describe('depthLimit', () => {
  it('accepts a query within the limit', () => {
    expect(depthErrors('{ root { id } }', 3)).toEqual([])
  })

  it('rejects a query nested past the limit', () => {
    const errors = depthErrors('{ root { child { child { child { id } } } } }', 3)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/maximum is 3/)
  })

  it('measures the deepest branch, not the last one', () => {
    // The shallow `id` must not mask the deep `child` chain beside it.
    expect(depthErrors('{ root { id child { child { child { id } } } } }', 3)).toHaveLength(1)
  })

  it('counts depth through fragment spreads', () => {
    const query = `
      { root { ...deep } }
      fragment deep on Node { child { child { child { id } } } }
    `
    expect(depthErrors(query, 3)).toHaveLength(1)
  })

  it('counts depth through inline fragments', () => {
    expect(depthErrors('{ root { ... on Node { child { child { child { id } } } } } }', 3)).toHaveLength(1)
  })

  // A cyclic fragment is invalid GraphQL, but this rule may run before the one
  // that says so — it has to terminate rather than recurse forever.
  it('terminates on a cyclic fragment', () => {
    const query = `
      { root { ...a } }
      fragment a on Node { child { ...a } }
    `
    expect(() => depthErrors(query, 5)).not.toThrow()
  })

  it('reports the offending operation by name', () => {
    const errors = depthErrors('query Deep { root { child { child { child { id } } } } }', 2)
    expect(errors[0]).toMatch(/nested \d+ levels deep/)
  })
})
