import type { CodegenConfig } from '@graphql-codegen/cli';

// The backend schema is the single source of truth for the shapes the
// dashboard reads. `npm run codegen` regenerates; CI fails if the output is stale.
const config: CodegenConfig = {
  schema: '../backend/src/graphql/schema.graphql',
  generates: {
    'services/generated/graphql.ts': {
      plugins: ['typescript'],
      config: {
        scalars: { DateTime: 'string', JSON: 'Record<string, unknown>' },
        enumsAsTypes: true,
        avoidOptionals: { field: true, inputValue: false },
        maybeValue: 'T | null',
        skipTypename: true,
      },
    },
  },
};

export default config;
