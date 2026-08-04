import { GraphQLError, Kind } from 'graphql'
import type { ASTNode, ValidationContext, ASTVisitor, FragmentDefinitionNode } from 'graphql'

/**
 * Rejects queries nested deeper than `maxDepth`, before execution.
 *
 * The endpoint is public — the SDK authenticates with a key that ships in page
 * source — and GraphQL lets a short request describe an enormous amount of
 * work. Depth is the cheap half of that defence: it costs a client nothing to
 * write a query that costs the database a great deal to answer.
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = context
      .getDocument()
      .definitions.reduce<Record<string, FragmentDefinitionNode>>((acc, definition) => {
        if (definition.kind === Kind.FRAGMENT_DEFINITION) acc[definition.name.value] = definition
        return acc
      }, {})

    return {
      OperationDefinition(node) {
        // A fragment cycle is illegal GraphQL and is reported by the built-in
        // NoFragmentCycles rule, but that rule may not have run yet — so track
        // visited fragments here rather than recursing forever.
        const depth = measure(node, fragments, new Set())

        if (depth > maxDepth) {
          const name = node.name?.value ?? 'anonymous operation'
          context.reportError(
            new GraphQLError(`Query is nested ${depth} levels deep; the maximum is ${maxDepth}.`, {
              nodes: [node],
              extensions: { code: 'QUERY_TOO_DEEP', operation: name },
            })
          )
        }
      },
    }
  }
}

function measure(
  node: ASTNode,
  fragments: Record<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>
): number {
  switch (node.kind) {
    case Kind.FIELD: {
      // A leaf field is depth 1; a field with a selection set is 1 + its deepest child.
      if (!node.selectionSet) return 1
      return 1 + deepestChild(node.selectionSet.selections, fragments, visitedFragments)
    }

    case Kind.FRAGMENT_SPREAD: {
      const name = node.name.value
      if (visitedFragments.has(name)) return 0

      const fragment = fragments[name]
      if (!fragment) return 0

      // Spreading a fragment doesn't add a level of its own — its selections sit
      // at the same depth as the spread.
      return measure(fragment, fragments, new Set([...visitedFragments, name]))
    }

    case Kind.INLINE_FRAGMENT:
    case Kind.FRAGMENT_DEFINITION:
    case Kind.OPERATION_DEFINITION:
      return deepestChild(node.selectionSet.selections, fragments, visitedFragments)

    default:
      return 0
  }
}

function deepestChild(
  selections: readonly ASTNode[],
  fragments: Record<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>
): number {
  return selections.reduce(
    (deepest, selection) => Math.max(deepest, measure(selection, fragments, visitedFragments)),
    0
  )
}
